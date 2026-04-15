from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import date, datetime, timedelta
from ..models.models import GoldInstrument, GoldPrice

# Spot + history (giữ nguyên)
def get_prices(db: Session, for_date: date | None):
    if for_date:
        q = (db.query(GoldInstrument.id.label("instrument_id"),
                      GoldInstrument.brand,
                      GoldInstrument.display_name,
                      GoldPrice.buy_price,
                      GoldPrice.sell_price,
                      GoldPrice.as_of)
             .join(GoldPrice, GoldPrice.instrument_id == GoldInstrument.id)
             .filter(func.date(GoldPrice.as_of) == for_date)
             .order_by(GoldInstrument.id))
        return q.all()

    sub = (db.query(GoldPrice.instrument_id,
                    func.max(GoldPrice.as_of).label("mx"))
           .group_by(GoldPrice.instrument_id)).subquery()

    q = (db.query(GoldInstrument.id.label("instrument_id"),
                  GoldInstrument.brand,
                  GoldInstrument.display_name,
                  GoldPrice.buy_price,
                  GoldPrice.sell_price,
                  GoldPrice.as_of)
         .join(sub, sub.c.instrument_id == GoldInstrument.id)
         .join(GoldPrice, and_(GoldPrice.instrument_id == sub.c.instrument_id,
                               GoldPrice.as_of == sub.c.mx))
         .order_by(GoldInstrument.id))
    return q.all()

def get_history_by_brand_end(db: Session, brand: str, end_dt: datetime, days: int = 30):
    since = end_dt - timedelta(days=days-1)
    return (db.query(GoldPrice.as_of, GoldPrice.buy_price, GoldPrice.sell_price)
            .join(GoldInstrument, GoldInstrument.id == GoldPrice.instrument_id)
            .filter(GoldInstrument.brand == brand,
                    GoldPrice.as_of >= since,
                    GoldPrice.as_of <= end_dt)
            .order_by(GoldPrice.as_of.asc())
            .all())

def get_history_by_instrument_end(db: Session, instrument_id: int, end_dt: datetime, days: int = 30):
    since = end_dt - timedelta(days=days-1)
    return (db.query(GoldPrice.as_of, GoldPrice.buy_price, GoldPrice.sell_price)
            .filter(GoldPrice.instrument_id == instrument_id,
                    GoldPrice.as_of >= since,
                    GoldPrice.as_of <= end_dt)
            .order_by(GoldPrice.as_of.asc())
            .all())

# Instruments CRUD
def list_instruments(db: Session, brand: str | None = None):
    q = db.query(GoldInstrument)
    if brand:
        q = q.filter(GoldInstrument.brand == brand)
    return q.order_by(GoldInstrument.id).all()

def create_instrument(db: Session, **data):
    inst = GoldInstrument(**data)
    db.add(inst); db.commit(); db.refresh(inst)
    return inst

def update_instrument(db: Session, instrument_id: int, **data):
    inst = db.get(GoldInstrument, instrument_id)
    if not inst:
        return None
    for k, v in data.items():
        if v is not None:
            setattr(inst, k, v)
    db.commit(); db.refresh(inst)
    return inst

def delete_instrument(db: Session, instrument_id: int):
    inst = db.get(GoldInstrument, instrument_id)
    if not inst:
        return False
    db.delete(inst); db.commit()
    return True

# Prices CRUD + upsert
def list_prices(db: Session, instrument_id: int | None = None, d: date | None = None, latest_only: bool = False):
    q = db.query(GoldPrice)
    if instrument_id:
        q = q.filter(GoldPrice.instrument_id == instrument_id)
    if d:
        q = q.filter(func.date(GoldPrice.as_of) == d)
    if latest_only and instrument_id:
        mx = db.query(func.max(GoldPrice.as_of)).filter(GoldPrice.instrument_id == instrument_id).scalar()
        if not mx:
            return []
        q = q.filter(GoldPrice.as_of == mx)
    return q.order_by(GoldPrice.as_of.desc()).all()

def create_price(db: Session, instrument_id: int, buy_price: float, sell_price: float, as_of: datetime):
    existing = (db.query(GoldPrice)
                .filter(GoldPrice.instrument_id == instrument_id,
                        GoldPrice.as_of == as_of)
                .one_or_none())
    if existing:
        existing.buy_price = buy_price
        existing.sell_price = sell_price
        db.commit(); db.refresh(existing)
        return existing
    p = GoldPrice(instrument_id=instrument_id, buy_price=buy_price, sell_price=sell_price, as_of=as_of)
    db.add(p); db.commit(); db.refresh(p)
    return p

def update_price(db: Session, price_id: int, **data):
    p = db.get(GoldPrice, price_id)
    if not p:
        return None
    if data.get("as_of") is not None:
        clash = (db.query(GoldPrice)
                 .filter(GoldPrice.instrument_id == p.instrument_id,
                         GoldPrice.as_of == data["as_of"],
                         GoldPrice.id != p.id)
                 .one_or_none())
        if clash:
            raise ValueError("duplicate instrument_id+as_of")
    for k, v in data.items():
        if v is not None:
            setattr(p, k, v)
    db.commit(); db.refresh(p)
    return p

def delete_price(db: Session, price_id: int):
    p = db.get(GoldPrice, price_id)
    if not p:
        return False
    db.delete(p); db.commit()
    return True

# BULK
def bulk_upsert_prices(db: Session, items: list[dict]):
    out = []
    for it in items:
        out.append(create_price(db,
                                instrument_id=it["instrument_id"],
                                buy_price=it["buy_price"],
                                sell_price=it["sell_price"],
                                as_of=it["as_of"]))
    return out
