from datetime import date, datetime
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..repositories.domestic_gold_spot_repo import (
    get_prices, get_history_by_brand_end, get_history_by_instrument_end,
    list_instruments, create_instrument, update_instrument, delete_instrument,
    list_prices, create_price, update_price, delete_price,
    bulk_upsert_prices,
)
from ..schemas.domestic_gold_spot import (
    DomesticGoldSpotItem, DomesticGoldHistoryPoint,
    GoldInstrumentIn, GoldInstrumentUpdate, GoldInstrumentOut,
    GoldPriceCreate, GoldPriceUpdate, GoldPriceOut,
    GoldPriceBulkIn
)
import asyncio
from ..realtime.ws_manager_domestic_gold_price import manager
from ..core.deps import get_current_user, require_role_ids
import logging

router = APIRouter(prefix="/domestic-gold", tags=["domestic-gold"])

# =====================================================
# Lấy danh sách giá vàng
# =====================================================
@router.get("/gold-price", response_model=List[DomesticGoldSpotItem])
def list_domestic_gold_spot(
    d: Optional[date] = Query(default=None, description="YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    logging.info(f"Lấy danh sách giá vàng{' theo ngày ' + str(d) if d else ''}")
    rows = get_prices(db, d)
    return [DomesticGoldSpotItem(
        instrument_id=r.instrument_id,
        brand=r.brand,
        display_name=r.display_name,
        buy_price=float(r.buy_price),
        sell_price=float(r.sell_price),
        as_of=getattr(r, "as_of", None),
    ) for r in rows]


# =====================================================
# Lịch sử giá vàng
# =====================================================
@router.get("/history", response_model=List[DomesticGoldHistoryPoint])
def history(
    brand: Optional[str] = Query(None),
    instrument_id: Optional[int] = Query(None),
    end: Optional[date] = Query(None, description="YYYY-MM-DD"),
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
):
    end_dt = datetime.now() if end is None else datetime(end.year, end.month, end.day, 23, 59, 59)
    if instrument_id is not None:
        logging.info(f"Lấy lịch sử giá vàng cho instrument_id={instrument_id}, số ngày={days}")
        rows = get_history_by_instrument_end(db, instrument_id, end_dt, days)
    elif brand is not None:
        logging.info(f"Lấy lịch sử giá vàng cho thương hiệu={brand}, số ngày={days}")
        rows = get_history_by_brand_end(db, brand, end_dt, days)
    else:
        logging.warning("Không có tham số brand hoặc instrument_id khi gọi API lịch sử giá vàng")
        return []
    return [DomesticGoldHistoryPoint(as_of=r.as_of, buy_price=float(r.buy_price), sell_price=float(r.sell_price)) for r in rows]


# =====================================================
# Instruments (sản phẩm vàng)
# =====================================================
@router.get("/instruments", response_model=List[GoldInstrumentOut])
def instruments(brand: Optional[str] = None, db: Session = Depends(get_db)):
    logging.info(f"Lấy danh sách sản phẩm vàng{' theo thương hiệu ' + brand if brand else ''}")
    return list_instruments(db, brand)

@router.post("/instruments", response_model=GoldInstrumentOut, status_code=status.HTTP_201_CREATED)
def instruments_create(
    payload: GoldInstrumentIn,
    db: Session = Depends(get_db),
    _admin = Depends(require_role_ids(1)),
):
    logging.info(f"Thêm mới sản phẩm vàng: {payload.display_name} ({payload.brand})")
    return create_instrument(db, **payload.model_dump())

@router.put("/instruments/{instrument_id}", response_model=GoldInstrumentOut)
def instruments_update(
    instrument_id: int,
    payload: GoldInstrumentUpdate,
    db: Session = Depends(get_db),
    _admin = Depends(require_role_ids(1)),
):
    inst = update_instrument(db, instrument_id, **payload.model_dump())
    if not inst:
        logging.warning(f"Cập nhật thất bại – không tìm thấy sản phẩm vàng id={instrument_id}")
        raise HTTPException(404, "Instrument not found")
    logging.info(f"Cập nhật sản phẩm vàng id={instrument_id}")
    return inst

@router.delete("/instruments/{instrument_id}", status_code=status.HTTP_204_NO_CONTENT)
def instruments_delete(
    instrument_id: int,
    db: Session = Depends(get_db),
    _admin = Depends(require_role_ids(1)),
):
    ok = delete_instrument(db, instrument_id)
    if not ok:
        logging.warning(f"Xóa thất bại – không tìm thấy sản phẩm vàng id={instrument_id}")
        raise HTTPException(404, "Instrument not found")
    logging.info(f"Đã xóa sản phẩm vàng id={instrument_id}")


# =====================================================
# Prices (giá vàng)
# =====================================================
@router.get("/prices", response_model=List[GoldPriceOut])
def prices(
    instrument_id: Optional[int] = None,
    d: Optional[date] = None,
    latest_only: bool = False,
    db: Session = Depends(get_db),
):
    logging.info(f"Lấy danh sách giá vàng{' theo instrument_id=' + str(instrument_id) if instrument_id else ''}{' ngày=' + str(d) if d else ''}")
    rows = list_prices(db, instrument_id, d, latest_only)
    return [GoldPriceOut.model_validate(r) for r in rows]

@router.post("/prices", response_model=GoldPriceOut, status_code=status.HTTP_201_CREATED)
async def prices_create(
    payload: GoldPriceCreate,
    db: Session = Depends(get_db),
    _admin = Depends(require_role_ids(1)),
):
    p = create_price(db, **payload.model_dump())
    logging.info(f"Thêm mới giá vàng: instrument_id={p.instrument_id}, mua={p.buy_price}, bán={p.sell_price}")
    asyncio.create_task(manager.broadcast({
        "type": "gold_price",
        "action": "create",
        "data": GoldPriceOut.model_validate(p).model_dump()
    }))
    return GoldPriceOut.model_validate(p)

@router.put("/prices/{price_id}", response_model=GoldPriceOut)
async def prices_update(
    price_id: int,
    payload: GoldPriceUpdate,
    db: Session = Depends(get_db),
    _admin = Depends(require_role_ids(1)),
):
    data = payload.model_dump()
    try:
        p = update_price(db, price_id, **data)
    except ValueError as e:
        logging.error(f"Lỗi cập nhật giá vàng id={price_id}: {e}")
        raise HTTPException(400, str(e))
    if not p:
        logging.warning(f"Cập nhật thất bại – không tìm thấy giá vàng id={price_id}")
        raise HTTPException(404, "Price not found")
    logging.info(f"Cập nhật giá vàng id={price_id} thành công")
    asyncio.create_task(manager.broadcast({
        "type": "gold_price",
        "action": "update",
        "data": GoldPriceOut.model_validate(p).model_dump()
    }))
    return GoldPriceOut.model_validate(p)

@router.delete("/prices/{price_id}", status_code=status.HTTP_204_NO_CONTENT)
async def prices_delete(
    price_id: int,
    db: Session = Depends(get_db),
    _admin = Depends(require_role_ids(1)),
):
    ok = delete_price(db, price_id)
    if not ok:
        logging.warning(f"Xóa thất bại – không tìm thấy giá vàng id={price_id}")
        raise HTTPException(404, "Price not found")
    logging.info(f"Đã xóa giá vàng id={price_id}")
    asyncio.create_task(manager.broadcast({
        "type": "gold_price",
        "action": "delete",
        "data": {"id": price_id}
    }))

@router.post("/prices/bulk", response_model=List[GoldPriceOut], status_code=201)
async def prices_bulk_upsert(
    payload: GoldPriceBulkIn,
    db: Session = Depends(get_db),
    _admin = Depends(require_role_ids(1)),
):
    rows = bulk_upsert_prices(db, [i.model_dump() for i in payload.items])
    logging.info(f"Cập nhật/tạo hàng loạt {len(rows)} giá vàng")
    out = [GoldPriceOut.model_validate(r) for r in rows]
    asyncio.create_task(manager.broadcast({
        "type": "gold_price",
        "action": "bulk_upsert",
        "data": [o.model_dump() for o in out]
    }))
    return out

# =====================================================
# Snapshot (bản chụp nhanh giá vàng gần nhất)
# =====================================================
@router.get("/prices/snapshot", response_model=List[GoldPriceOut])
def prices_snapshot(
    d: Optional[date] = None,
    latest_only: bool = True,
    db: Session = Depends(get_db),
):
    logging.info(f"Lấy snapshot giá vàng{' theo ngày ' + str(d) if d else ''}")
    insts = list_instruments(db)
    out = []
    for it in insts:
        rs = list_prices(db, instrument_id=it.id, d=d, latest_only=latest_only)
        if rs:
            out.append(rs[0])
    return [GoldPriceOut.model_validate(r) for r in out]
