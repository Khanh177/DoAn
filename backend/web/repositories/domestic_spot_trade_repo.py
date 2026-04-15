# domestic_spot_trade_repo.py - REFACTORED (fixed naive/aware + wallet gold mirror)
from datetime import datetime, timedelta, time
from decimal import Decimal, ROUND_HALF_UP
from math import ceil
from typing import Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from ..models.models import Wallet, GoldPrice, SpotDomPosition, SpotDomTrade, SpotDomTradeDetail, GoldInstrument

# ===== cấu hình =====
BAND_PER_DAY  = Decimal("0.005")
EARLY_FEE     = Decimal("0.015")
NORMAL_FEE    = Decimal("0.002")
T_PLUS_HOURS  = 24
DAILY_LIMIT   = Decimal("500000000")
VN_OFFSET_HRS = 7

# ===== thời gian: NAIVE =====
def _now_vn() -> datetime:
    return datetime.utcnow() + timedelta(hours=VN_OFFSET_HRS)

def _today_range_vn():
    now = _now_vn()
    start = datetime.combine(now.date(), time(0, 0, 0))
    end = start + timedelta(days=1)
    return start, end

def _as_naive(dt: datetime) -> datetime:
    return dt.replace(tzinfo=None) if getattr(dt, "tzinfo", None) else dt

# ===== tiện ích =====
def _decimal_round(n: Decimal) -> Decimal:
    return n.quantize(Decimal("1"), rounding=ROUND_HALF_UP)

# ===== dữ liệu giá =====
def latest_price(db: Session, instrument_id: int) -> GoldPrice:
    sub = (
        db.query(func.max(GoldPrice.as_of))
        .filter(GoldPrice.instrument_id == instrument_id)
        .scalar()
    )
    if not sub:
        return None
    return db.query(GoldPrice).filter(
        and_(GoldPrice.instrument_id == instrument_id, GoldPrice.as_of == sub)
    ).one_or_none()

# ===== hạn mức ngày =====
def sum_gross_today(db: Session, user_id: int) -> Decimal:
    start, end = _today_range_vn()
    v = (
        db.query(func.coalesce(func.sum(SpotDomTrade.gross_vnd), 0))
        .filter(
            SpotDomTrade.user_id == user_id,
            SpotDomTrade.created_at >= start,
            SpotDomTrade.created_at < end,
        )
        .scalar()
    )
    return Decimal(v or 0)

def check_daily_limit(db: Session, user_id: int, add_vnd: Decimal):
    used = sum_gross_today(db, user_id)
    if used + add_vnd > DAILY_LIMIT:
        raise ValueError(f"Vượt hạn mức spot theo ngày. Đã dùng {int(used)} VND.")

# ===== tính line khi bán =====
def settle_sell_line(entry_price: Decimal, acquired_at: datetime, market_sell: Decimal, qty: Decimal) -> dict:
    now = _now_vn()
    acq = _as_naive(acquired_at)
    hold_hours = Decimal((now - acq).total_seconds()) / Decimal(3600)
    band_days = max(1, int(ceil(float(hold_hours) / 24.0)))

    cap = (entry_price * (Decimal("1") + BAND_PER_DAY * Decimal(band_days)))
    price_used = market_sell if market_sell < cap else cap

    fee_rate = EARLY_FEE if hold_hours < T_PLUS_HOURS else NORMAL_FEE
    gross = _decimal_round(qty * price_used)
    fee = _decimal_round(gross * fee_rate)
    net = gross - fee

    return {
        "gross": int(gross),
        "fee": int(fee),
        "net": int(net),
        "price_used": int(price_used),
        "hold_hours": int(hold_hours),
        "band_days": band_days,
    }

# ===== số dư / holdings =====
def usd_balance_spot(db: Session, user_id: int) -> Decimal:
    w = (
        db.query(Wallet)
        .filter(Wallet.user_id == user_id, Wallet.wallet_type_id == 2)
        .one_or_none()
    )
    return Decimal(w.balance if w else 0)

def holdings_domestic(db: Session, user_id: int, instrument_id: int) -> Tuple[Decimal, Decimal, Decimal]:
    now = _now_vn()

    positions = (
        db.query(SpotDomPosition)
        .filter(
            SpotDomPosition.user_id == user_id,
            SpotDomPosition.instrument_id == instrument_id,
            SpotDomPosition.status == "active",
            SpotDomPosition.qty_remain > 0,
        )
        .all()
    )

    total = Decimal(0)
    unlocked = Decimal(0)
    locked = Decimal(0)

    for p in positions:
        qty = Decimal(p.qty_remain)
        total += qty
        unlock = _as_naive(p.sell_unlock_at)
        if unlock <= now:
            unlocked += qty
        else:
            locked += qty

    return total, unlocked, locked

# ===== phản chiếu vàng vào bảng wallets (tuỳ chọn) =====
_SYMBOL_TO_FIELD = {
    "SJC": "gold_sjc_balance",
    "DOJI_HN": "gold_doji_hn_balance",
    "DOJI_SG": "gold_doji_sg_balance",
    "BTMC_SJC": "gold_btmc_sjc_balance",
    "PNJ_HCM": "gold_pnj_hcm_balance",
    "PNJ_HN": "gold_pnj_hn_balance",
    "PHU_QUY_SJC": "gold_phu_quy_sjc_balance",
}

def _wallet_gold_field(db: Session, instrument_id: int) -> str | None:
    inst = db.query(GoldInstrument).get(instrument_id)
    if not inst:
        return None
    return _SYMBOL_TO_FIELD.get(inst.symbol)

def bump_wallet_gold(db: Session, user_id: int, instrument_id: int, delta_xau: Decimal) -> None:
    field = _wallet_gold_field(db, instrument_id)
    if not field:
        return
    w = (
        db.query(Wallet)
        .filter(Wallet.user_id == user_id, Wallet.wallet_type_id == 2)
        .with_for_update()
        .one_or_none()
    )
    if not w:
        return
    cur = Decimal(getattr(w, field) or 0)
    setattr(w, field, cur + Decimal(delta_xau))
