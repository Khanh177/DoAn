# backend/web/routers/futures.py
from datetime import datetime
from decimal import Decimal
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from ..core.deps import get_current_user
from ..database import get_db
from ..repositories import futures_repo
from ..realtime.ws_futures import manager_futures
from ..models.models import FuturesPosition, FuturesTrade, Wallet, WalletType
from ..state.price_cache import price_cache

log = logging.getLogger(__name__)

router = APIRouter(prefix="/futures", tags=["futures"])

@router.post("/open")
async def open_futures(payload: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    try:
        instrument_id = int(payload["instrument_id"])
        side = str(payload["side"])
        qty = Decimal(str(payload["qty"]))
        entry_price = Decimal(str(payload["entry_price"]))
        leverage = int(payload.get("leverage", 100))

        pos = futures_repo.open_position(
            db,
            user_id=user.id,
            instrument_id=instrument_id,
            side=side,
            qty=qty,
            entry_price=entry_price,
            leverage=leverage,
        )

    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Missing required field: {str(e)}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid value: {str(e)}")
    except Exception as e:
        log.exception("open_futures failed")
        raise HTTPException(status_code=500, detail=f"Failed to open position: {str(e)}")

    try:
        await manager_futures.send_to_user(user.id, {
            "type": "futures_open",
            "position_id": pos.id,
            "instrument_id": pos.instrument_id,
            "side": pos.side,
            "qty": str(pos.qty),
            "entry_price": str(pos.entry_price),
            "leverage": pos.leverage,
            "margin_used": str(pos.margin_used),
            "liq_price": str(pos.liq_price) if pos.liq_price else None,
            "status": pos.status,
            "opened_at": pos.opened_at.isoformat() if pos.opened_at else datetime.utcnow().isoformat(),
            "symbol": "XAUUSD",
        })
        w = futures_repo._get_user_futures_wallet(db, user.id)
        await manager_futures.send_to_user(user.id, {
            "type": "wallet_update",
            "balance": float(w.balance or 0),
            "gold_world_balance": float(w.gold_world_balance or 0),
        })
    except Exception as e:
        log.warning(f"WS notify open_futures failed: {e}")

    w = futures_repo._get_user_futures_wallet(db, user.id)
    return {
        "id": pos.id,
        "user_id": pos.user_id,
        "instrument_id": pos.instrument_id,
        "side": pos.side,
        "qty": str(pos.qty),
        "entry_price": str(pos.entry_price),
        "leverage": pos.leverage,
        "margin_used": str(pos.margin_used),
        "liq_price": str(pos.liq_price) if pos.liq_price else None,
        "status": pos.status,
        "opened_at": pos.opened_at,
        "closed_at": pos.closed_at,
        "pnl_realized": str(pos.pnl_realized or 0),
        "wallet_balance": float(w.balance or 0),
        "gold_world_balance": float(w.gold_world_balance or 0),
    }

@router.post("/close")
async def close_futures(payload: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    try:
        pos = futures_repo.close_position(
            db,
            user_id=user.id,
            position_id=int(payload["position_id"]),
            exit_price=Decimal(str(payload["exit_price"])),
            is_liquidation=False,
        )
    except (KeyError, ValueError, TypeError) as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        await manager_futures.send_to_user(user.id, {
            "type": "futures_close",
            "position_id": pos.id,
            "pnl_realized": str(pos.pnl_realized or 0),
            "status": pos.status,
            "closed_at": pos.closed_at.isoformat() if pos.closed_at else datetime.utcnow().isoformat(),
        })
        w = futures_repo._get_user_futures_wallet(db, user.id)
        await manager_futures.send_to_user(user.id, {
            "type": "wallet_update",
            "balance": float(w.balance or 0),
            "gold_world_balance": float(w.gold_world_balance or 0),
        })
    except Exception as e:
        log.warning(f"WS notify close_futures failed: {e}")

    w = futures_repo._get_user_futures_wallet(db, user.id)
    return {
        "id": pos.id,
        "user_id": pos.user_id,
        "instrument_id": pos.instrument_id,
        "side": pos.side,
        "qty": str(pos.qty),
        "entry_price": str(pos.entry_price),
        "leverage": pos.leverage,
        "margin_used": str(pos.margin_used),
        "status": pos.status,
        "opened_at": pos.opened_at,
        "closed_at": pos.closed_at,
        "pnl_realized": str(pos.pnl_realized or 0),
        "wallet_balance": float(w.balance or 0),
        "gold_world_balance": float(w.gold_world_balance or 0),
    }

@router.get("/positions")
def my_positions(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    status: str | None = Query(None, description="open|closed|liquidated")
):
    data = futures_repo.list_positions(db, user.id, status=status)
    return [{
        "id": p.id,
        "user_id": p.user_id,
        "instrument_id": p.instrument_id,
        "side": p.side,
        "qty": str(p.qty),
        "entry_price": str(p.entry_price),
        "leverage": p.leverage,
        "margin_used": str(p.margin_used),
        "liq_price": str(p.liq_price) if p.liq_price else None,
        "status": p.status,
        "opened_at": p.opened_at,
        "closed_at": p.closed_at,
        "pnl_realized": str(p.pnl_realized or 0),
    } for p in data]

@router.get("/trades")
def my_trades(db: Session = Depends(get_db), user=Depends(get_current_user)):
    data = futures_repo.list_trades(db, user.id)
    return [{
        "id": t.id,
        "user_id": t.user_id,
        "instrument_id": t.instrument_id,
        "side": t.side,
        "qty": str(t.qty),
        "price": str(t.price),
        "fee": str(t.fee),
        "created_at": t.created_at,
    } for t in data]

@router.post("/check-liquidation")
async def check_liquidation(db: Session = Depends(get_db), user=Depends(get_current_user)):
    try:
        current_price = Decimal(str(price_cache.get("price", 0)))
        if current_price <= 0:
            raise HTTPException(status_code=400, detail="Giá hiện tại không hợp lệ")

        liquidated = futures_repo.check_and_liquidate_positions(db, user.id, current_price)

        for pos in liquidated:
            await manager_futures.send_to_user(user.id, {
                "type": "liquidation",
                "position_id": pos.id,
                "message": f"Vị thế #{pos.id} đã bị thanh lý",
                "pnl_realized": str(pos.pnl_realized or 0),
            })

        if liquidated:
            w = futures_repo._get_user_futures_wallet(db, user.id)
            await manager_futures.send_to_user(user.id, {
                "type": "wallet_update",
                "balance": float(w.balance or 0),
                "gold_world_balance": float(w.gold_world_balance or 0),
            })

        return {"liquidated_count": len(liquidated), "positions": [p.id for p in liquidated]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/account-stats")
def account_stats(db: Session = Depends(get_db), user=Depends(get_current_user)):
    try:
        current_price = Decimal(str(price_cache.get("price", 0)))
        if current_price <= 0:
            raise HTTPException(status_code=400, detail="Giá hiện tại không hợp lệ")
        stats = futures_repo.calculate_account_stats(db, user.id, current_price)
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/trades/history")
def list_my_futures_trades(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=200),
    status: str | None = Query(None, description="open|closed|liquidated"),
):
    q = (
        db.query(
            FuturesTrade,
            FuturesPosition.status.label("pos_status"),
            FuturesPosition.pnl_realized.label("pos_pnl_realized"),
            FuturesPosition.closed_at.label("pos_closed_at"),
        )
        .outerjoin(FuturesPosition, FuturesTrade.position_id == FuturesPosition.id)
        .options(joinedload(FuturesTrade.instrument))
        .filter(FuturesTrade.user_id == user.id)
        .order_by(FuturesTrade.created_at.desc())
    )
    if status:
        q = q.filter(FuturesPosition.status == status)

    total = q.count()
    rows = q.offset((page - 1) * size).limit(size).all()

    items = []
    for t, pos_status, pos_pnl_realized, pos_closed_at in rows:
        pnl_realized = (pos_pnl_realized or Decimal("0"))
        pnl_type = "profit" if pnl_realized > 0 else ("loss" if pnl_realized < 0 else "flat")
        items.append({
            "id": t.id,
            "instrument_id": t.instrument_id,
            "instrument_symbol": getattr(t.instrument, "symbol", None),
            "side": t.side,
            "qty": str(t.qty),
            "price": str(t.price),
            "fee": str(t.fee or 0),
            "created_at": t.created_at,
            "idem_key": t.idem_key,
            "position_id": t.position_id,
            "position_status": pos_status,
            "position_closed_at": pos_closed_at,
            "pnl_realized": str(pnl_realized),
            "pnl_type": pnl_type,
        })

    return {"items": items, "total": total, "page": page, "size": size}


# ---------- WALLET FUTURES ----------
wallet_router = APIRouter(prefix="/wallet", tags=["wallet"])

@wallet_router.get("/futures")
def get_futures_wallet(db: Session = Depends(get_db), user=Depends(get_current_user)):
    fut = db.query(WalletType).filter(WalletType.name == "Futures").first()
    if not fut:
        raise HTTPException(status_code=500, detail="WalletType 'Futures' chưa được seed")
    w = db.query(Wallet).filter(Wallet.user_id == user.id, Wallet.wallet_type_id == fut.id).first()
    if not w:
        raise HTTPException(status_code=404, detail="Chưa có ví Futures")
    return {
        "wallet_id": w.id,
        "balance": str(w.balance or 0),
        "gold_world_balance": str(w.gold_world_balance or 0),
    }


# ---------- PRICE ROUTER ----------
price_router = APIRouter(prefix="/price", tags=["price"])

@price_router.get("/xauusd")
def get_xauusd_price():
    p = price_cache.get("price")
    ts = price_cache.get("ts")
    if p is None:
        # chưa có giá từ GoldAPI
        raise HTTPException(status_code=503, detail="price_unavailable")
    return {
        "symbol": "XAUUSD",
        "price": float(p),
        "ts": ts,
    }


# Debug endpoint
@router.get("/debug/ws-stats")
def ws_debug_stats():
    """Debug WebSocket connections"""
    from ..realtime.ws_futures import manager_futures
    return manager_futures.get_stats()  