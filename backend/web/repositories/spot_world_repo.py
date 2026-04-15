from __future__ import annotations
import logging
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, Tuple, Iterable, Set
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func, case

from ..models.models import (
    Wallet, SpotWorldOrder, SpotWorldExecution, SpotWorldPosition, SpotWorldConfig,
)
from backend.web.state.price_cache import price_cache

logger = logging.getLogger("spot_world.repo")

SPOT_WALLET_TYPE_ID = 2

SW_ORDER_TYPE  = {"MARKET": "market", "LIMIT": "limit"}
SW_TRADE_TYPE  = {"BUY": "buy", "SELL": "sell"}
SW_ORDER_STAT  = {
    "PENDING": "pending", "PARTIAL": "partial",
    "COMPLETED": "completed", "CANCELLED": "cancelled", "FAILED": "failed"
}

DEFAULT_TAKER_FEE_BPS = Decimal("8")
DEFAULT_MAKER_FEE_BPS = Decimal("2")
DEFAULT_SLIPPAGE_BPS  = Decimal("5")  #Trượt giá
MAX_SLIPPAGE_BPS      = Decimal("50")

QDEC = Decimal("0.000001")
PDEC = Decimal("0.000001")
MDEC = Decimal("0.01")


def rp(x: Decimal, q: Decimal) -> Decimal:
    if x is None:
        return None
    return x.quantize(q, rounding=ROUND_HALF_UP)


def _get_cfg_bps(s: Session, key: str, default: Decimal) -> Decimal:
    row = s.query(SpotWorldConfig).filter(SpotWorldConfig.key == key).first()
    if not row:
        return default
    try:
        return Decimal(str(row.value))
    except Exception:
        return default


def _wallet_spot(s: Session, user_id: int) -> Wallet:
    w = (
        s.query(Wallet)
        .filter(Wallet.user_id == user_id, Wallet.wallet_type_id == SPOT_WALLET_TYPE_ID)
        .with_for_update()
        .first()
    )
    if not w:
        raise ValueError("wallet_not_found_spot")
    return w


def _pos_get_or_create(s: Session, user_id: int) -> SpotWorldPosition:
    pos = (
        s.query(SpotWorldPosition)
        .filter(SpotWorldPosition.user_id == user_id)
        .with_for_update()
        .first()
    )
    if not pos:
        pos = SpotWorldPosition(user_id=user_id, qty_xau=Decimal("0"), avg_cost_usd=Decimal("0"))
        s.add(pos)
        s.flush()
    return pos


def _apply_slippage(price: Decimal, side: str, bps: Decimal) -> Decimal:
    if bps < 0 or bps > MAX_SLIPPAGE_BPS:
        raise ValueError("slippage_bps_exceeded")
    factor = Decimal("1") + (bps/Decimal("10000")) if side == "buy" else Decimal("1") - (bps/Decimal("10000"))
    return rp(price * factor, PDEC)


def _fee_amount(amount_usd: Decimal, bps: Decimal) -> Decimal:
    return rp(amount_usd * bps / Decimal("10000"), MDEC)


def _avg_buy(pos_qty: Decimal, pos_avg: Decimal, buy_qty: Decimal, buy_price: Decimal) -> Tuple[Decimal, Decimal]:
    new_qty = pos_qty + buy_qty
    if new_qty == 0:
        return Decimal("0"), Decimal("0")
    new_cost = pos_qty * pos_avg + buy_qty * buy_price
    new_avg = new_cost / new_qty
    return rp(new_qty, QDEC), rp(new_avg, PDEC)


def _avg_sell(pos_qty: Decimal, pos_avg: Decimal, sell_qty: Decimal) -> Tuple[Decimal, Decimal]:
    new_qty = pos_qty - sell_qty
    if new_qty <= 0:
        return Decimal("0"), Decimal("0")
    return rp(new_qty, QDEC), pos_avg


def exec_market_buy(
    s: Session,
    user_id: int,
    feed_price: Decimal,
    amount_usd: Decimal,
    idem_key: Optional[str] = None,
    slippage_bps: Optional[Decimal] = None,
) -> SpotWorldOrder:
    if amount_usd <= 0 or feed_price <= 0:
        raise ValueError("invalid_amount_or_price")

    bps = slippage_bps if slippage_bps is not None else DEFAULT_SLIPPAGE_BPS
    px_exec = _apply_slippage(feed_price, "buy", bps)

    w = _wallet_spot(s, user_id)
    if Decimal(w.balance) < amount_usd:
        raise ValueError("insufficient_usd")

    taker_bps = _get_cfg_bps(s, "taker_fee_bps", DEFAULT_TAKER_FEE_BPS)
    qty_xau = rp(amount_usd / px_exec, QDEC)
    gross = rp(amount_usd, MDEC)
    fee   = _fee_amount(gross, taker_bps)
    total_deduct = rp(gross + fee, MDEC)

    w.balance = rp(Decimal(w.balance) - total_deduct, MDEC)
    w.gold_world_balance = rp(Decimal(w.gold_world_balance) + qty_xau, QDEC)

    pos = _pos_get_or_create(s, user_id)
    pos.qty_xau, pos.avg_cost_usd = _avg_buy(Decimal(pos.qty_xau), Decimal(pos.avg_cost_usd), qty_xau, px_exec)

    ord_ = SpotWorldOrder(
        user_id=user_id,
        order_type=SW_ORDER_TYPE["MARKET"],
        trade_type=SW_TRADE_TYPE["BUY"],
        status=SW_ORDER_STAT["COMPLETED"],
        qty_xau=qty_xau, total_usd=gross, executed_price=px_exec,
        fee_usd=fee, idem_key=idem_key,
        executed_at=datetime.utcnow(),
    )
    s.add(ord_); s.flush()

    s.add(SpotWorldExecution(
        order_id=ord_.id, user_id=user_id,
        trade_type=SW_TRADE_TYPE["BUY"],
        price=px_exec, qty_xau=qty_xau,
        gross_usd=gross, fee_usd=fee, net_usd=rp(gross - fee, MDEC),
        pnl_realized_usd=Decimal("0"),
        executed_at=datetime.utcnow()
    ))

    logger.info("MARKET BUY | user=%s | qty=%s | px=%s | gross=%s | fee=%s", user_id, qty_xau, px_exec, gross, fee)
    return ord_


def exec_market_sell(
    s: Session,
    user_id: int,
    feed_price: Decimal,
    qty_xau: Decimal,
    idem_key: Optional[str] = None,
    slippage_bps: Optional[Decimal] = None,
) -> SpotWorldOrder:
    if qty_xau <= 0 or feed_price <= 0:
        raise ValueError("invalid_qty_or_price")

    px_exec = _apply_slippage(feed_price, "sell", slippage_bps if slippage_bps is not None else DEFAULT_SLIPPAGE_BPS)

    w = _wallet_spot(s, user_id)
    if Decimal(w.gold_world_balance) < qty_xau:
        raise ValueError("insufficient_xau")

    taker_bps = _get_cfg_bps(s, "taker_fee_bps", DEFAULT_TAKER_FEE_BPS)
    gross = rp(qty_xau * px_exec, MDEC)
    fee   = _fee_amount(gross, taker_bps)
    net   = rp(gross - fee, MDEC)

    pos = _pos_get_or_create(s, user_id)
    avg = Decimal(pos.avg_cost_usd)
    pnl_realized = rp(qty_xau * (px_exec - avg), MDEC)

    w.gold_world_balance = rp(Decimal(w.gold_world_balance) - qty_xau, QDEC)
    w.balance = rp(Decimal(w.balance) + net, MDEC)

    pos.qty_xau, pos.avg_cost_usd = _avg_sell(Decimal(pos.qty_xau), avg, qty_xau)

    ord_ = SpotWorldOrder(
        user_id=user_id,
        order_type=SW_ORDER_TYPE["MARKET"],
        trade_type=SW_TRADE_TYPE["SELL"],
        status=SW_ORDER_STAT["COMPLETED"],
        qty_xau=qty_xau, total_usd=gross, executed_price=px_exec,
        fee_usd=fee, idem_key=idem_key,
        executed_at=datetime.utcnow(),
    )
    s.add(ord_); s.flush()

    s.add(SpotWorldExecution(
        order_id=ord_.id, user_id=user_id,
        trade_type=SW_TRADE_TYPE["SELL"],
        price=px_exec, qty_xau=qty_xau,
        gross_usd=gross, fee_usd=fee, net_usd=net,
        pnl_realized_usd=pnl_realized,
        executed_at=datetime.utcnow()
    ))

    logger.info("MARKET SELL | user=%s | qty=%s | px=%s | gross=%s | fee=%s | pnl=%s",
                user_id, qty_xau, px_exec, gross, fee, pnl_realized)
    return ord_


def place_limit_order(
    s: Session,
    user_id: int,
    side: str,
    limit_price: Decimal,
    qty_xau: Optional[Decimal] = None,
    total_usd: Optional[Decimal] = None,
    idem_key: Optional[str] = None,
) -> SpotWorldOrder:
    if limit_price is None or limit_price <= 0:
        raise ValueError("limit_price_invalid")
    if side not in ("buy", "sell"):
        raise ValueError("side_invalid")

    w = _wallet_spot(s, user_id)
    maker_bps = _get_cfg_bps(s, "maker_fee_bps", DEFAULT_MAKER_FEE_BPS)

    if side == "buy":
        # Người dùng nhập số tiền USD muốn dùng để đặt lệnh
        if total_usd is None and qty_xau is not None:
            total_usd = rp(qty_xau * limit_price, MDEC)
        if total_usd is None or total_usd <= 0:
            raise ValueError("amount_required")

        gross = rp(total_usd, MDEC)
        fee_preview = _fee_amount(gross, maker_bps)
        lock_amount = rp(gross + fee_preview, MDEC)

        if Decimal(w.balance) < lock_amount:
            raise ValueError("insufficient_usd_for_limit")

        # KHÓA tiền ngay khi đặt lệnh
        w.balance = rp(Decimal(w.balance) - lock_amount, MDEC)

    else:  # side == "sell"
        # Người dùng nhập số lượng XAU hoặc số tiền USD -> quy về qty_xau
        if qty_xau is None or qty_xau <= 0:
            if total_usd is None or total_usd <= 0:
                raise ValueError("qty_or_amount_required")
            qty_xau = rp(total_usd / limit_price, QDEC)

        if Decimal(w.gold_world_balance) < qty_xau:
            raise ValueError("insufficient_xau_for_limit")

        # KHÓA vàng ngay khi đặt lệnh
        w.gold_world_balance = rp(Decimal(w.gold_world_balance) - qty_xau, QDEC)

        gross = rp(qty_xau * limit_price, MDEC)
        fee_preview = _fee_amount(gross, maker_bps)
        if total_usd is None or total_usd <= 0:
            total_usd = gross

    ord_ = SpotWorldOrder(
        user_id=user_id,
        order_type=SW_ORDER_TYPE["LIMIT"],
        trade_type=SW_TRADE_TYPE["BUY"] if side == "buy" else SW_TRADE_TYPE["SELL"],
        status=SW_ORDER_STAT["PENDING"],
        qty_xau=qty_xau,
        total_usd=total_usd,
        limit_price=limit_price,
        fee_usd=fee_preview,
        idem_key=idem_key,
    )
    s.add(ord_); s.flush()
    logger.info(
        "LIMIT | user=%s | side=%s | px=%s | qty=%s | amount=%s | fee_preview=%s",
        user_id, side, limit_price, qty_xau, total_usd, fee_preview
    )
    return ord_

def cancel_limit_order(s: Session, user_id: int, order_id: int) -> SpotWorldOrder:
    ord_ = s.query(SpotWorldOrder).filter(
        SpotWorldOrder.id == order_id,
        SpotWorldOrder.user_id == user_id,
        SpotWorldOrder.status.in_([SW_ORDER_STAT["PENDING"], SW_ORDER_STAT["PARTIAL"]]),
    ).with_for_update().first()
    if not ord_:
        raise ValueError("order_not_cancellable")

    w = _wallet_spot(s, user_id)
    maker_bps = _get_cfg_bps(s, "maker_fee_bps", DEFAULT_MAKER_FEE_BPS)

    ot = (_ename(ord_.order_type) or "").lower()
    side = (_ename(ord_.trade_type) or "").lower()

    if ot == "limit":
        if side == "buy":
            # Hoàn lại đúng số USD đã khóa: gross + fee
            gross = ord_.total_usd
            if gross is None or gross <= 0:
                if ord_.qty_xau and ord_.limit_price:
                    gross = rp(ord_.qty_xau * ord_.limit_price, MDEC)
                else:
                    gross = Decimal("0")
            gross = rp(Decimal(gross), MDEC)

            fee = ord_.fee_usd if ord_.fee_usd is not None else _fee_amount(gross, maker_bps)
            refund = rp(gross + fee, MDEC)

            w.balance = rp(Decimal(w.balance) + refund, MDEC)

        elif side == "sell":
            # Hoàn lại đúng số XAU đã khóa
            qty = ord_.qty_xau
            if qty is None or qty <= 0:
                if ord_.total_usd and ord_.limit_price:
                    qty = rp(ord_.total_usd / ord_.limit_price, QDEC)
                else:
                    qty = Decimal("0")
            if qty > 0:
                w.gold_world_balance = rp(Decimal(w.gold_world_balance) + qty, QDEC)

    ord_.status = SW_ORDER_STAT["CANCELLED"]
    ord_.cancelled_at = datetime.utcnow()
    logger.info("LIMIT CANCEL | user=%s | order_id=%s", user_id, order_id)
    return ord_


def try_match_limits_by_price(s: Session, price: Decimal) -> Tuple[int, Set[int]]:
    if price <= 0:
        logger.info("try_match_limits_by_price skip, price<=0: %s", price)
        return 0, set()

    matched = 0
    affected_users: Set[int] = set()
    maker_bps = _get_cfg_bps(s, "maker_fee_bps", DEFAULT_MAKER_FEE_BPS)

    pendings: Iterable[SpotWorldOrder] = (
        s.query(SpotWorldOrder)
        .filter(
            SpotWorldOrder.status.in_([SW_ORDER_STAT["PENDING"], SW_ORDER_STAT["PARTIAL"]]),
            or_(
                and_(SpotWorldOrder.trade_type == SW_TRADE_TYPE["BUY"],
                     SpotWorldOrder.limit_price >= price),
                and_(SpotWorldOrder.trade_type == SW_TRADE_TYPE["SELL"],
                     SpotWorldOrder.limit_price <= price),
            )
        )
        .with_for_update()
        .order_by(SpotWorldOrder.created_at.asc())
        .all()
    )

    logger.info(
        "try_match_limits_by_price start price=%s pending=%s",
        price, len(pendings)
    )

    for ord_ in pendings:
        try:
            side = "buy" if ord_.trade_type == SW_TRADE_TYPE["BUY"] else "sell"
            logger.info(
                " check order id=%s user=%s side=%s limit=%s status=%s",
                ord_.id, ord_.user_id, side, ord_.limit_price, ord_.status
            )

            w = _wallet_spot(s, ord_.user_id)
            pos = _pos_get_or_create(s, ord_.user_id)

            if side == "buy":
                # Tiền đã bị KHÓA khi đặt lệnh, ở đây KHÔNG trừ thêm nữa.
                gross = ord_.total_usd
                if gross is None or gross <= 0:
                    base_price = ord_.limit_price if ord_.limit_price else price
                    gross = rp(ord_.qty_xau * base_price, MDEC)
                gross = rp(Decimal(gross), MDEC)

                # Khớp tại price -> nhận qty_xau = gross / price
                qty_xau = rp(gross / price, QDEC)

                fee = ord_.fee_usd if ord_.fee_usd is not None else _fee_amount(gross, maker_bps)

                w.gold_world_balance = rp(Decimal(w.gold_world_balance) + qty_xau, QDEC)
                pos.qty_xau, pos.avg_cost_usd = _avg_buy(
                    Decimal(pos.qty_xau), Decimal(pos.avg_cost_usd), qty_xau, price
                )

                s.add(SpotWorldExecution(
                    order_id=ord_.id, user_id=ord_.user_id,
                    trade_type=SW_TRADE_TYPE["BUY"],
                    price=price, qty_xau=qty_xau, gross_usd=gross,
                    fee_usd=fee, net_usd=rp(gross - fee, MDEC), pnl_realized_usd=Decimal("0")
                ))
                logger.info("  matched BUY id=%s qty=%s gross=%s", ord_.id, qty_xau, gross)

            else:
                # SELL: vàng đã bị KHÓA khi đặt lệnh. Ở đây chỉ cộng USD.
                qty_xau = ord_.qty_xau
                if qty_xau is None or qty_xau <= 0:
                    base_price = ord_.limit_price if ord_.limit_price else price
                    if ord_.total_usd:
                        qty_xau = rp(ord_.total_usd / base_price, QDEC)
                    else:
                        qty_xau = Decimal("0")
                qty_xau = rp(qty_xau, QDEC)

                gross = rp(qty_xau * price, MDEC)
                fee = _fee_amount(gross, maker_bps)
                net = rp(gross - fee, MDEC)
                pnl = rp(qty_xau * (price - Decimal(pos.avg_cost_usd)), MDEC)

                # KHÔNG trừ gold_world_balance lần nữa (đã trừ khi đặt).
                w.balance = rp(Decimal(w.balance) + net, MDEC)
                pos.qty_xau, pos.avg_cost_usd = _avg_sell(
                    Decimal(pos.qty_xau), Decimal(pos.avg_cost_usd), qty_xau
                )

                s.add(SpotWorldExecution(
                    order_id=ord_.id, user_id=ord_.user_id,
                    trade_type=SW_TRADE_TYPE["SELL"],
                    price=price, qty_xau=qty_xau, gross_usd=gross,
                    fee_usd=fee, net_usd=net, pnl_realized_usd=pnl
                ))
                logger.info("  matched SELL id=%s qty=%s gross=%s", ord_.id, qty_xau, gross)

            ord_.status = SW_ORDER_STAT["COMPLETED"]
            ord_.executed_price = price
            ord_.executed_at = datetime.utcnow()
            matched += 1
            affected_users.add(ord_.user_id)
        except Exception as e:
            logger.warning("LIMIT MATCH ERROR | order_id=%s | err=%s", ord_.id, e)
            ord_.status = SW_ORDER_STAT["FAILED"]



    logger.info(
        "try_match_limits_by_price done matched=%s users=%s",
        matched, list(affected_users)
    )
    return matched, affected_users


def list_orders(s: Session, user_id: int, status: Optional[str], limit: int = 100):
    q = s.query(SpotWorldOrder).filter(SpotWorldOrder.user_id == user_id).order_by(SpotWorldOrder.created_at.desc())
    if status:
        allowed = set(SW_ORDER_STAT.values())
        s_ = status.lower()
        if s_ in allowed:
            q = q.filter(SpotWorldOrder.status == s_)
    return q.limit(max(10, min(limit, 500))).all()


def list_executions(s: Session, user_id: int, limit: int = 200):
    return (
        s.query(SpotWorldExecution)
        .filter(SpotWorldExecution.user_id == user_id)
        .order_by(SpotWorldExecution.executed_at.desc())
        .limit(max(10, min(limit, 1000)))
        .all()
    )


def _order_to_out(o: SpotWorldOrder):
    from backend.web.schemas.spot_world import OrderOut
    return OrderOut(
        id=o.id,
        order_type=_ename(o.order_type),
        trade_type=_ename(o.trade_type),
        status=_ename(o.status),
        qty_xau=o.qty_xau,
        total_usd=o.total_usd,
        limit_price=o.limit_price,
        executed_price=o.executed_price,
        fee_usd=o.fee_usd,
        created_at=o.created_at.isoformat() if o.created_at else "",
        executed_at=o.executed_at.isoformat() if o.executed_at else None,
    )


def _exec_to_out(e: SpotWorldExecution):
    from backend.web.schemas.spot_world import ExecutionOut
    return ExecutionOut(
        id=e.id,
        order_id=e.order_id,
        trade_type=_ename(e.trade_type),
        price=e.price,
        qty_xau=e.qty_xau,
        gross_usd=e.gross_usd,
        fee_usd=e.fee_usd,
        net_usd=e.net_usd,
        pnl_realized_usd=e.pnl_realized_usd,
        executed_at=e.executed_at.isoformat() if e.executed_at else "",
    )


def match_limit_orders_once(s: Session) -> int:
    price = Decimal(str(price_cache.get("price", 0)))
    if price <= 0:
        return 0
    matched, _ = try_match_limits_by_price(s, price)
    return matched


def _ename(v):
    try:
        return v.name
    except AttributeError:
        return str(v) if v is not None else None


# ---- Orderbook depth ----

SW_STAT_PENDING = [SW_ORDER_STAT["PENDING"], SW_ORDER_STAT["PARTIAL"]]

def _coalesced_qty_expr():
    return case(
        (SpotWorldOrder.qty_xau != None, SpotWorldOrder.qty_xau),
        else_=(SpotWorldOrder.total_usd / SpotWorldOrder.limit_price),
    )

def get_orderbook_depth(s: Session, top: int = 16):
    qty_expr = _coalesced_qty_expr()

    asks_rows = (
        s.query(
            SpotWorldOrder.limit_price.label("price"),
            func.sum(qty_expr).label("qty"),
        )
        .filter(
            SpotWorldOrder.order_type == SW_ORDER_TYPE["LIMIT"],
            SpotWorldOrder.trade_type == SW_TRADE_TYPE["SELL"],
            SpotWorldOrder.status.in_(SW_STAT_PENDING),
        )
        .group_by(SpotWorldOrder.limit_price)
        .order_by(SpotWorldOrder.limit_price.asc())
        .limit(top)
        .all()
    )

    bids_rows = (
        s.query(
            SpotWorldOrder.limit_price.label("price"),
            func.sum(qty_expr).label("qty"),
        )
        .filter(
            SpotWorldOrder.order_type == SW_ORDER_TYPE["LIMIT"],
            SpotWorldOrder.trade_type == SW_TRADE_TYPE["BUY"],
            SpotWorldOrder.status.in_(SW_STAT_PENDING),
        )
        .group_by(SpotWorldOrder.limit_price)
        .order_by(SpotWorldOrder.limit_price.desc())
        .limit(top)
        .all()
    )

    asks = [{"price": float(r.price), "qty": float(r.qty or 0)} for r in asks_rows if r.price and r.qty]
    bids = [{"price": float(r.price), "qty": float(r.qty or 0)} for r in bids_rows if r.price and r.qty]
    return {"asks": asks, "bids": bids}
