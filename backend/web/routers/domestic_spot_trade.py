# app/routers/domestic_spot_trade.py
from datetime import timedelta, datetime, time
from decimal import Decimal
from typing import List, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Header, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, case, and_

from ..database import get_db
from ..core.deps import get_current_user
from ..schemas.domestic_spot_trade_schema import (
    SpotAvailableResp, SpotBuyReq, SpotSellReq,
    SpotTradeHistoryResp, SpotTradeResp, SpotTradeRow,
)
from ..repositories.domestic_spot_trade_repo import (
    latest_price, check_daily_limit, _decimal_round, _now_vn,
    settle_sell_line, usd_balance_spot, holdings_domestic,
    sum_gross_today, DAILY_LIMIT, bump_wallet_gold,
)
from ..models.models import Wallet, SpotDomPosition, SpotDomTrade, SpotDomTradeDetail, GoldInstrument
from ..services.fx_service import vnd_per_usdt, FxError
from ..realtime.ws_public import ws_public

import logging

router = APIRouter(prefix="/domestic-gold/spot", tags=["domestic-spot-trade"])
logger = logging.getLogger(__name__)


# ===== util =====
def get_fx_rate() -> Decimal:
    try:
        r = vnd_per_usdt()
        return Decimal(str(r))
    except FxError:
        logger.exception("FX service error")
        raise HTTPException(503, "Không thể lấy tỷ giá USD/VND")

def _today_range_vn():
    now = _now_vn()
    start = datetime.combine(now.date(), time(0, 0, 0))
    end = start + timedelta(days=1)
    return start, end

def _trade_row_payload(db: Session, trade: SpotDomTrade) -> dict:
    inst = db.query(GoldInstrument).get(trade.instrument_id)
    return {
        "id": trade.id,
        "ts": trade.created_at.isoformat(),
        "brand": getattr(inst, "brand", None),
        "symbol": getattr(inst, "symbol", None),
        "side": trade.side,
        "qty_xau": float(trade.qty_xau),
        "price_used": int(trade.price_used),
        "gross_vnd": int(trade.gross_vnd),
        "fee_vnd": int(trade.fee_vnd),
        "net_vnd": int(trade.net_vnd),
        "instrument_id": trade.instrument_id,
        "user_id": trade.user_id,
    }

def _totals_today(db: Session) -> List[Dict]:
    """
    Trả về đủ mọi instrument trong hệ thống.
    Nếu instrument chưa có giao dịch trong ngày thì buy/sell = 0.
    """
    start, end = _today_range_vn()
    logger.debug("Tổng ngày (range): %s -> %s", start, end)

    # aggregate theo instrument trong ngày
    agg = (
        db.query(
            SpotDomTrade.instrument_id.label("instrument_id"),
            func.sum(case((SpotDomTrade.side == "buy", SpotDomTrade.qty_xau), else_=Decimal(0))).label("buy_qty"),
            func.sum(case((SpotDomTrade.side == "sell", SpotDomTrade.qty_xau), else_=Decimal(0))).label("sell_qty"),
        )
        .filter(and_(SpotDomTrade.created_at >= start, SpotDomTrade.created_at < end))
        .group_by(SpotDomTrade.instrument_id)
        .all()
    )
    agg_map = {a.instrument_id: a for a in agg}

    instruments = db.query(GoldInstrument).all()
    out = []
    for gi in instruments:
        a = agg_map.get(gi.id)
        buy = float(getattr(a, "buy_qty", 0) or 0)
        sell = float(getattr(a, "sell_qty", 0) or 0)
        out.append({
            "instrument_id": gi.id,
            "symbol": gi.symbol,
            "brand": gi.brand,
            "buy": buy,
            "sell": sell,
        })

    logger.info("Totals today: %s", out)
    return out


# ===== endpoints =====
@router.get("/daily-totals")
def daily_totals(resp: Response, db: Session = Depends(get_db)):
    """Public. Không cache. Liệt kê toàn bộ brand với buy/sell trong ngày."""
    resp.headers["Cache-Control"] = "no-store"
    return _totals_today(db)


@router.get("/usd-vnd")
def usd_vnd(rate: Decimal = Depends(get_fx_rate)):
    logger.debug("usd-vnd rate=%s", rate)
    return {"usd_vnd": str(rate)}


@router.post("/buy", response_model=SpotTradeResp)
async def spot_buy(
    payload: SpotBuyReq,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
    rate: Decimal = Depends(get_fx_rate),
):
    logger.info("BUY start user_id=%s instrument_id=%s amount_vnd=%s",
                getattr(user, "id", None), payload.instrument_id, payload.amount_vnd)

    price = latest_price(db, payload.instrument_id)
    if not price:
        logger.warning("No price for instrument_id=%s", payload.instrument_id)
        raise HTTPException(400, "Chưa có bảng giá cho sản phẩm này")

    buy_price = Decimal(price.buy_price)
    amount_vnd = Decimal(payload.amount_vnd)
    qty = (amount_vnd / buy_price).quantize(Decimal("0.000001"))

    # limit check
    try:
        check_daily_limit(db, user.id, amount_vnd)
    except Exception as ex:
        logger.warning("Daily limit exceeded user_id=%s add=%s err=%s", user.id, amount_vnd, ex)
        raise HTTPException(400, str(ex))

    usd_needed = (amount_vnd / rate).quantize(Decimal("0.000001"))
    logger.debug("buy_price=%s qty=%s usd_needed=%s rate=%s", buy_price, qty, usd_needed, rate)

    wallet = (
        db.query(Wallet)
        .filter(Wallet.user_id == user.id, Wallet.wallet_type_id == 2)
        .with_for_update()
        .one_or_none()
    )
    if not wallet or Decimal(wallet.balance) < usd_needed:
        logger.error("Insufficient USD. have=%s need=%s", getattr(wallet, "balance", None), usd_needed)
        raise HTTPException(400, "Số dư USD không đủ")

    wallet.balance = Decimal(wallet.balance) - usd_needed
    now = _now_vn()

    # tạo position
    pos = SpotDomPosition(
        user_id=user.id,
        instrument_id=payload.instrument_id,
        qty_xau=qty,
        qty_remain=qty,
        entry_price=int(buy_price),
        acquired_at=now,
        sell_unlock_at=now + timedelta(hours=24),
        status="active",
        created_at=now,
    )
    db.add(pos)
    db.flush()
    logger.debug("Created position id=%s", pos.id)

    # phản chiếu vàng vào wallet (nếu có cấu hình)
    bump_wallet_gold(db, user.id, payload.instrument_id, qty)

    # ghi trade
    trade = SpotDomTrade(
        user_id=user.id,
        instrument_id=payload.instrument_id,
        side="buy",
        qty_xau=qty,
        price_used=int(buy_price),
        gross_vnd=int(amount_vnd),
        fee_vnd=0,
        net_vnd=int(amount_vnd),
        created_at=now,
    )
    db.add(trade)
    db.commit()
    logger.info("BUY done trade_id=%s", trade.id)

    # realtime
    totals = _totals_today(db)
    await ws_public.broadcast({"type": "spot_totals_update", "data": totals})
    await ws_public.broadcast({"type": "spot_trade_created", "data": _trade_row_payload(db, trade)})

    return SpotTradeResp(
        trade_id=trade.id,
        side="buy",
        instrument_id=payload.instrument_id,
        qty_xau=float(qty),
        price_used=int(buy_price),
        gross_vnd=int(amount_vnd),
        fee_vnd=0,
        net_vnd=int(amount_vnd),
    )


@router.post("/sell", response_model=SpotTradeResp)
async def spot_sell(
    payload: SpotSellReq,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
    rate: Decimal = Depends(get_fx_rate),
    idem_key: str = Header(None, alias="Idem-Key"),
):
    logger.info("SELL start user_id=%s instrument_id=%s qty_req=%s",
                getattr(user, "id", None), payload.instrument_id, payload.qty_xau)

    # idem-key
    if idem_key:
        exists = db.query(SpotDomTrade).filter(SpotDomTrade.idem_key == idem_key).first()
        if exists:
            logger.warning("SELL duplicate Idem-Key=%s -> trade_id=%s", idem_key, exists.id)
            return SpotTradeResp(
                trade_id=exists.id,
                side="sell",
                instrument_id=exists.instrument_id,
                qty_xau=float(exists.qty_xau),
                price_used=int(exists.price_used),
                gross_vnd=int(exists.gross_vnd),
                fee_vnd=int(exists.fee_vnd),
                net_vnd=int(exists.net_vnd),
            )

    price = latest_price(db, payload.instrument_id)
    if not price:
        logger.error("No price for instrument_id=%s", payload.instrument_id)
        raise HTTPException(400, "Chưa có bảng giá cho sản phẩm này")

    market_sell = Decimal(price.sell_price)
    qty_requested = Decimal(payload.qty_xau)

    now = _now_vn()
    positions = (
        db.query(SpotDomPosition)
        .filter(
            SpotDomPosition.user_id == user.id,
            SpotDomPosition.instrument_id == payload.instrument_id,
            SpotDomPosition.status == "active",
            SpotDomPosition.qty_remain > 0,
            SpotDomPosition.sell_unlock_at <= now,
        )
        .order_by(SpotDomPosition.acquired_at)
        .with_for_update()
        .all()
    )
    if not positions:
        logger.warning("No unlocked gold to sell")
        raise HTTPException(400, "Không có vàng khả dụng để bán")

    total_available = sum(Decimal(p.qty_remain) for p in positions)
    if total_available < qty_requested:
        if not payload.allow_partial:
            logger.error("Not enough gold. have=%s need=%s", total_available, qty_requested)
            raise HTTPException(400, f"Không đủ vàng. Có: {float(total_available):.6f}")
        logger.info("Partial sell %s -> %s", qty_requested, total_available)
        qty_requested = total_available

    qty_remain = qty_requested
    total_gross = Decimal(0)
    total_fee = Decimal(0)
    weighted_price = Decimal(0)
    details = []

    for p in positions:
        if qty_remain <= 0:
            break
        take = min(Decimal(p.qty_remain), qty_remain)
        line = settle_sell_line(Decimal(p.entry_price), p.acquired_at, market_sell, take)

        p.qty_remain = Decimal(p.qty_remain) - take
        if p.qty_remain == 0:
            p.status = "closed"

        total_gross += Decimal(line["gross"])
        total_fee += Decimal(line["fee"])
        weighted_price += Decimal(line["price_used"]) * take

        details.append({
            "position_id": p.id,
            "qty": float(take),
            "entry_price": int(p.entry_price),
            "price_used": line["price_used"],
            "fee": line["fee"],
            "hold_hours": line["hold_hours"],
            "band_days": line["band_days"],
        })
        qty_remain -= take

    total_net = total_gross - total_fee
    avg_price = int(_decimal_round(weighted_price / qty_requested))

    trade = SpotDomTrade(
        user_id=user.id,
        instrument_id=payload.instrument_id,
        side="sell",
        qty_xau=qty_requested,
        price_used=avg_price,
        gross_vnd=int(total_gross),
        fee_vnd=int(total_fee),
        net_vnd=int(total_net),
        idem_key=idem_key,
        created_at=now,
    )
    db.add(trade)
    db.flush()

    for d in details:
        db.add(SpotDomTradeDetail(
            trade_id=trade.id,
            position_id=d["position_id"],
            qty_from_pos=Decimal(str(d["qty"])),
            entry_price=d["entry_price"],
            price_used=d["price_used"],
            fee_vnd=d["fee"],
            hold_hours=d["hold_hours"],
            band_days=d["band_days"],
        ))

    # cập nhật ví
    bump_wallet_gold(db, user.id, payload.instrument_id, -qty_requested)

    wallet = (
        db.query(Wallet)
        .filter(Wallet.user_id == user.id, Wallet.wallet_type_id == 2)
        .with_for_update()
        .one_or_none()
    )
    if not wallet:
        logger.error("Wallet spot not found")
        raise HTTPException(400, "Không tìm thấy ví spot")

    usd_received = (Decimal(total_net) / rate).quantize(Decimal("0.000001"))
    wallet.balance = Decimal(wallet.balance) + usd_received

    db.commit()
    logger.info("SELL done trade_id=%s gross=%s fee=%s net=%s", trade.id, total_gross, total_fee, total_net)

    # realtime
    totals = _totals_today(db)
    await ws_public.broadcast({"type": "spot_totals_update", "data": totals})
    await ws_public.broadcast({"type": "spot_trade_created", "data": _trade_row_payload(db, trade)})

    return SpotTradeResp(
        trade_id=trade.id,
        side="sell",
        instrument_id=payload.instrument_id,
        qty_xau=float(qty_requested),
        price_used=avg_price,
        gross_vnd=int(total_gross),
        fee_vnd=int(total_fee),
        net_vnd=int(total_net),
        details=details,
    )


@router.get("/available", response_model=SpotAvailableResp)
def spot_available(
    instrument_id: int,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
    rate: Decimal = Depends(get_fx_rate),
):
    usd_bal = usd_balance_spot(db, user.id)
    vnd_bal = usd_bal * rate
    total, unlocked, locked = holdings_domestic(db, user.id, instrument_id)
    used = sum_gross_today(db, user.id)
    remaining = max(Decimal(0), DAILY_LIMIT - used)

    logger.debug(
        "available user_id=%s inst=%s usd=%.6f vnd=%s total=%.6f unlocked=%.6f locked=%.6f used=%s remain=%s",
        user.id, instrument_id, usd_bal, int(_decimal_round(vnd_bal)),
        total, unlocked, locked, int(_decimal_round(used)), int(_decimal_round(remaining))
    )

    return SpotAvailableResp(
        wallet_type_id=2,
        usd_balance=float(usd_bal),
        vnd_balance=int(_decimal_round(vnd_bal)),
        total_xau=float(total),
        unlocked_xau=float(unlocked),
        locked_xau=float(locked),
        daily_limit_vnd=int(DAILY_LIMIT),
        daily_used_vnd=int(_decimal_round(used)),
        daily_remaining_vnd=int(_decimal_round(remaining)),
        usd_vnd_rate=float(rate),
    )


@router.get("/history", response_model=SpotTradeHistoryResp)
def spot_trade_history(
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
    instrument_id: Optional[int] = None,
    side: Optional[str] = Query(None, pattern="^(buy|sell)$"),
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    cursor: Optional[datetime] = None,   # lấy trang sau: created_at < cursor
    limit: int = Query(20, ge=1, le=100),
):
    logger.debug(
        "history user_id=%s inst=%s side=%s from=%s to=%s cursor=%s limit=%s",
        user.id, instrument_id, side, date_from, date_to, cursor, limit
    )

    q = (
        db.query(
            SpotDomTrade.id,
            SpotDomTrade.created_at,
            SpotDomTrade.side,
            SpotDomTrade.qty_xau,
            SpotDomTrade.price_used,
            SpotDomTrade.gross_vnd,
            SpotDomTrade.fee_vnd,
            SpotDomTrade.net_vnd,
            GoldInstrument.brand,
            GoldInstrument.symbol,
        )
        .join(GoldInstrument, GoldInstrument.id == SpotDomTrade.instrument_id)
        .filter(SpotDomTrade.user_id == user.id)
    )
    if instrument_id:
        q = q.filter(SpotDomTrade.instrument_id == instrument_id)
    if side:
        q = q.filter(SpotDomTrade.side == side)
    if date_from:
        q = q.filter(SpotDomTrade.created_at >= date_from)
    if date_to:
        q = q.filter(SpotDomTrade.created_at < date_to)
    if cursor:
        q = q.filter(SpotDomTrade.created_at < cursor)

    rows = (
        q.order_by(desc(SpotDomTrade.created_at), desc(SpotDomTrade.id))
         .limit(limit + 1)
         .all()
    )

    has_more = len(rows) > limit
    rows = rows[:limit]

    items = [
        SpotTradeRow(
            id=r.id,
            ts=r.created_at.isoformat(),
            brand=r.brand,
            symbol=r.symbol,
            side=r.side,
            qty_xau=float(r.qty_xau),
            price_used=int(r.price_used),
            gross_vnd=int(r.gross_vnd),
            fee_vnd=int(r.fee_vnd),
            net_vnd=int(r.net_vnd),
        )
        for r in rows
    ]

    next_cursor = rows[-1].created_at.isoformat() if has_more and rows else None
    logger.debug("history returned=%s has_more=%s next_cursor=%s", len(items), has_more, next_cursor)
    return SpotTradeHistoryResp(items=items, next_cursor=next_cursor)
