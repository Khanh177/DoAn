from __future__ import annotations
import asyncio
from datetime import datetime, timedelta
import json
import logging
from collections import defaultdict
from decimal import Decimal
from typing import Optional, Dict, Set

import anyio
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from backend.web.models.models import User, SpotWorldExecution, Wallet, SpotWorldOrder
from backend.web.schemas.spot_world import (
    CancelOut, ExecutionOut, LimitIn, MarketBuyIn, MarketSellIn, OrderOut
)
from ..database import get_db
from ..core.deps import get_current_user
from backend.web.state.price_cache import price_cache
from backend.web.repositories.spot_world_repo import (
    _exec_to_out, _order_to_out,
    exec_market_buy as repo_market_buy,
    exec_market_sell as repo_market_sell,
    place_limit_order as repo_place_limit,
    cancel_limit_order as repo_cancel_limit,
    try_match_limits_by_price,
    list_orders as repo_list_orders,
    list_executions as repo_list_execs,
    get_orderbook_depth,  # NEW
)

log = logging.getLogger("spot_world.router")
router = APIRouter(prefix="/spot/world", tags=["spot-world"])

SPOT_WALLET_TYPE_ID = 2


def _order_payload(o) -> dict:
    return {
        "id": o.id,
        "order_type": getattr(o.order_type, "name", o.order_type),
        "trade_type": getattr(o.trade_type, "name", o.trade_type),
        "status": getattr(o.status, "name", o.status),
        "qty_xau": str(o.qty_xau) if o.qty_xau is not None else None,
        "total_usd": str(o.total_usd) if o.total_usd is not None else None,
        "limit_price": str(o.limit_price) if o.limit_price is not None else None,
        "executed_price": str(o.executed_price) if o.executed_price is not None else None,
        "fee_usd": str(o.fee_usd) if o.fee_usd is not None else None,
        "created_at": o.created_at.isoformat() if o.created_at else "",
        "executed_at": o.executed_at.isoformat() if o.executed_at else None,
    }

def _exec_payload(e) -> dict:
    return {
        "id": e.id,
        "order_id": e.order_id,
        "trade_type": getattr(e.trade_type, "name", e.trade_type),
        "price": str(e.price),
        "qty_xau": str(e.qty_xau),
        "gross_usd": str(e.gross_usd),
        "fee_usd": str(e.fee_usd),
        "net_usd": str(e.net_usd),
        "pnl_realized_usd": str(e.pnl_realized_usd),
        "executed_at": e.executed_at.isoformat() if e.executed_at else "",
    }

def _wallet_snapshot(db: Session, uid: int) -> dict | None:
    w = (db.query(Wallet)
          .filter(Wallet.user_id == uid, Wallet.wallet_type_id == SPOT_WALLET_TYPE_ID)
          .first())
    if not w:
        return None

    pending_orders = (
        db.query(SpotWorldOrder)
        .filter(
            SpotWorldOrder.user_id == uid,
            SpotWorldOrder.status == "pending",
        )
        .all()
    )

    pending_buy_usd = 0
    pending_sell_xau = 0

    for order in pending_orders:
        order_type = getattr(order.order_type, "name", str(order.order_type)).lower()
        trade_type = getattr(order.trade_type, "name", str(order.trade_type)).lower()
        if order_type == "limit":
            if trade_type == "buy" and order.total_usd:
                pending_buy_usd += float(order.total_usd)
            elif trade_type == "sell" and order.qty_xau:
                pending_sell_xau += float(order.qty_xau)

    bal_usd = float(w.balance or 0)
    bal_xau = float(w.gold_world_balance or 0)

    # TIỀN/VÀNG đã bị trừ thực sự trong ví rồi,
    # available == balance hiện tại, reserved chỉ để hiển thị thông tin
    return {
        "balance": bal_usd,
        "gold_world_balance": bal_xau,
        "reserved_usd": pending_buy_usd,
        "reserved_xau": pending_sell_xau,
        "available_usd": bal_usd,
        "available_xau": bal_xau,
        "wallet_type_id": SPOT_WALLET_TYPE_ID,
    }

async def _send_wallet_update_from_snapshot(uid: int, snap: dict):
    await ws_manager.send_to_user(uid, {"type": "wallet_update", **snap})

async def push_orderbook(db: Session, limit: int = 16):  # NEW
    try:
        d = get_orderbook_depth(db, top=limit)
        await ws_manager.broadcast({"type": "orderbook", "data": d})
    except Exception as e:
        log.warning("push_orderbook_failed %s", e)


@router.post("/market/buy", response_model=OrderOut)
async def market_buy_ep(
    data: MarketBuyIn,
    user = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        p = price_cache.get("price") or 3580
        feed_price = Decimal(str(p))
        ord_ = repo_market_buy(db, user.id, feed_price, data.amount_usd,
                               idem_key=data.idem_key, slippage_bps=data.slippage_bps)
        db.commit()

        exec_ = (db.query(SpotWorldExecution)
                   .filter(SpotWorldExecution.order_id == ord_.id)
                   .order_by(SpotWorldExecution.executed_at.desc())
                   .first())

        snap = _wallet_snapshot(db, user.id)
        if snap:
            await _send_wallet_update_from_snapshot(user.id, snap)
        await ws_manager.send_to_user(user.id, {"type": "spot_order", "data": _order_payload(ord_)})
        if exec_:
            await ws_manager.send_to_user(user.id, {"type": "spot_exec", "data": _exec_payload(exec_)})
        await ws_manager.broadcast({"type": "spot_refresh"})

        return _order_to_out(ord_)
    except ValueError as e:
        db.rollback()
        raise HTTPException(400, str(e))
    except Exception:
        db.rollback()
        log.exception("market_buy_failed")
        raise HTTPException(500, "market_buy_failed")


@router.post("/market/sell", response_model=OrderOut)
async def market_sell_ep(
    data: MarketSellIn,
    user = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        p = price_cache.get("price") or 3580
        feed_price = Decimal(str(p))
        ord_ = repo_market_sell(db, user.id, feed_price, data.qty_xau,
                                idem_key=data.idem_key, slippage_bps=data.slippage_bps)
        db.commit()

        exec_ = (db.query(SpotWorldExecution)
                   .filter(SpotWorldExecution.order_id == ord_.id)
                   .order_by(SpotWorldExecution.executed_at.desc())
                   .first())

        snap = _wallet_snapshot(db, user.id)
        if snap:
            await _send_wallet_update_from_snapshot(user.id, snap)
        await ws_manager.send_to_user(user.id, {"type": "spot_order", "data": _order_payload(ord_)})
        if exec_:
            await ws_manager.send_to_user(user.id, {"type": "spot_exec", "data": _exec_payload(exec_)})
        await ws_manager.broadcast({"type": "spot_refresh"})

        return _order_to_out(ord_)
    except ValueError as e:
        db.rollback()
        raise HTTPException(400, str(e))
    except Exception:
        db.rollback()
        log.exception("market_sell_failed")
        raise HTTPException(500, "market_sell_failed")


async def _emit_limit_filled_for_user(db: Session, uid: int, cutoff: datetime):
    execs = (
        db.query(SpotWorldExecution)
          .filter(SpotWorldExecution.user_id == uid,
                  SpotWorldExecution.executed_at >= cutoff)
          .order_by(SpotWorldExecution.executed_at.desc())
          .all()
    )
    if not execs:
        return

    order_ids = [e.order_id for e in execs]
    orders = (
        db.query(SpotWorldOrder.id, SpotWorldOrder.order_type)
          .filter(SpotWorldOrder.id.in_(order_ids))
          .all()
    )
    ot_map = {oid: (ot.name if hasattr(ot, "name") else str(ot)) for oid, ot in orders}

    for e in execs:
        ot = (ot_map.get(e.order_id) or "").lower()
        if ot == "limit":
            payload = _exec_payload(e)
            payload["order_type"] = "limit"
            await ws_manager.send_to_user(uid, {"type": "spot_limit_filled", "data": payload})


async def _push_after_match_async(s: Session, affected: set[int], cutoff: datetime):
    for uid in affected:
        snap = _wallet_snapshot(s, uid)
        if snap:
            await _send_wallet_update_from_snapshot(uid, snap)

    for uid in affected:
        filled_orders = (
            s.query(SpotWorldOrder)
             .filter(SpotWorldOrder.user_id == uid,
                     SpotWorldOrder.executed_at != None,
                     SpotWorldOrder.executed_at >= cutoff)
             .order_by(SpotWorldOrder.executed_at.desc())
             .all()
        )
        for o in filled_orders:
            await ws_manager.send_to_user(uid, {"type": "spot_order", "data": _order_payload(o)})

        recent_execs = (
            s.query(SpotWorldExecution)
             .filter(SpotWorldExecution.user_id == uid,
                     SpotWorldExecution.executed_at >= cutoff)
             .order_by(SpotWorldExecution.executed_at.desc())
             .all()
        )
        for e in recent_execs:
            await ws_manager.send_to_user(uid, {"type": "spot_exec", "data": _exec_payload(e)})

        await _emit_limit_filled_for_user(s, uid, cutoff)

    await ws_manager.broadcast({"type": "spot_refresh"})


async def match_limits_now_async(db: Session, price: Decimal):
    log.info("match_limits_now_async price=%s", price)
    tick_ts = datetime.utcnow()
    matched, affected = try_match_limits_by_price(db, price)
    log.info("match_limits_now_async result matched=%s affected=%s", matched, list(affected))
    if matched > 0:
        db.commit()
        await _push_after_match_async(db, affected, cutoff=tick_ts - timedelta(seconds=5))
        await push_orderbook(db)


@router.post("/limit", response_model=OrderOut)
async def place_limit_ep(
    data: LimitIn,
    user = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        ord_ = repo_place_limit(db, user.id, data.side, data.limit_price,
                                qty_xau=data.qty_xau, total_usd=data.total_usd, idem_key=data.idem_key)
        db.commit()

        await ws_manager.send_to_user(user.id, {"type":"spot_order","data":_order_payload(ord_)})
        snap = _wallet_snapshot(db, user.id)
        if snap:
            await _send_wallet_update_from_snapshot(user.id, snap)
        await ws_manager.broadcast({"type":"spot_refresh"})
        await push_orderbook(db)  # NEW

        p = price_cache.get("price") or 3580
        await match_limits_now_async(db, Decimal(str(p)))

        return _order_to_out(ord_)
    except ValueError as e:
        db.rollback()
        raise HTTPException(400, str(e))
    except Exception:
        db.rollback()
        log.exception("limit_order_failed")
        raise HTTPException(500, "limit_order_failed")


@router.delete("/order/{order_id}", response_model=CancelOut)
async def cancel_limit_ep(
    order_id: int,
    user = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        ord_ = repo_cancel_limit(db, user.id, order_id)
        db.commit()
        await ws_manager.send_to_user(user.id, {"type":"spot_order","data":_order_payload(ord_)})
        snap = _wallet_snapshot(db, user.id)
        if snap:
            await _send_wallet_update_from_snapshot(user.id, snap)
        await ws_manager.broadcast({"type":"spot_refresh"})
        await push_orderbook(db)  # NEW
        return CancelOut(ok=True, order_id=order_id, message="Đã hủy lệnh")
    except ValueError as e:
        db.rollback()
        raise HTTPException(400, str(e))
    except Exception:
        db.rollback()
        log.exception("cancel_failed")
        raise HTTPException(500, "cancel_failed")


@router.get("/orders", response_model=list[OrderOut])
def list_orders_ep(
    status: Optional[str] = None, limit: int = 100,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        orders = repo_list_orders(db, user.id, status, limit)
        return [_order_to_out(o) for o in orders]
    except Exception:
        log.exception("list_orders_failed")
        raise HTTPException(500, "list_orders_failed")


@router.get("/executions", response_model=list[ExecutionOut])
def list_executions_ep(
    limit: int = 200,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        execs = repo_list_execs(db, user.id, limit)
        return [_exec_to_out(e) for e in execs]
    except Exception:
        log.exception("list_executions_failed")
        raise HTTPException(500, "list_executions_failed")


@router.get("/depth")  # NEW
def get_depth_ep(
    limit: int = 16,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        d = get_orderbook_depth(db, top=limit)
        return d
    except Exception:
        log.exception("depth_failed")
        raise HTTPException(500, "depth_failed")


class WSManager:
    def __init__(self):
        self.active: Dict[int, Set[WebSocket]] = defaultdict(set)

    async def connect(self, ws: WebSocket, uid: int = 0):
        await ws.accept()
        self.active[uid].add(ws)
        log.info("ws_connected uid=%s total=%s", uid, sum(len(v) for v in self.active.values()))

    def disconnect(self, ws: WebSocket, uid_hint: Optional[int] = None):
        if uid_hint is not None and ws in self.active.get(uid_hint, set()):
            conns = self.active[uid_hint]
            conns.discard(ws)
            if not conns:
                self.active.pop(uid_hint, None)
            return
        for uid, conns in list(self.active.items()):
            if ws in conns:
                conns.discard(ws)
                if not conns:
                    self.active.pop(uid, None)
                return

    async def send_to_user(self, uid: int, message: dict):
        data = json.dumps(message, default=str)
        for w in list(self.active.get(uid, ())):
            try:
                await w.send_text(data)
            except Exception:
                self.disconnect(w, uid)

    async def broadcast(self, message: dict):
        data = json.dumps(message, default=str)
        for uid, conns in list(self.active.items()):
            dead = []
            for w in list(conns):
                try:
                    await w.send_text(data)
                except Exception:
                    dead.append(w)
            for w in dead:
                self.disconnect(w, uid)

ws_manager = WSManager()

@router.websocket("/ws")
async def ws_spot_world(websocket: WebSocket):
    try:
        uid_q = websocket.query_params.get("uid")
        uid = int(uid_q) if uid_q is not None and str(uid_q).isdigit() else 0
    except Exception:
        uid = 0
    await ws_manager.connect(websocket, uid=uid)
    try:
        while True:
            msg = await websocket.receive_text()
            try:
                payload = json.loads(msg)
            except Exception:
                payload = {"raw": msg}
            await websocket.send_json({"type": "pong", "echo": payload})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, uid_hint=uid)


async def push_spot_price(price: Decimal):
    await ws_manager.broadcast({"type": "xau_price", "price": float(price)})

async def push_spot_refresh(user_ids: list[int] | None = None):
    payload = {"type": "spot_refresh"}
    if not user_ids:
        await ws_manager.broadcast(payload)
    else:
        for uid in user_ids:
            await ws_manager.send_to_user(uid, payload)


def match_limits_on_price_tick(s: Session, price: Decimal):
    try:
        tick_ts = datetime.utcnow()
        matched, affected = try_match_limits_by_price(s, price)
        if matched > 0:
            s.commit()

            for uid in affected:
                snap = _wallet_snapshot(s, uid)
                if snap:
                    anyio.from_thread.run(_send_wallet_update_from_snapshot, uid, snap)

            cutoff = tick_ts - timedelta(seconds=5)

            for uid in affected:
                filled_orders = (
                    s.query(SpotWorldOrder)
                     .filter(SpotWorldOrder.user_id == uid,
                             SpotWorldOrder.executed_at != None,
                             SpotWorldOrder.executed_at >= cutoff)
                     .order_by(SpotWorldOrder.executed_at.desc())
                     .all()
                )
                for o in filled_orders:
                    anyio.from_thread.run(ws_manager.send_to_user, uid, {
                        "type": "spot_order",
                        "data": _order_payload(o),
                    })

                recent_execs = (
                    s.query(SpotWorldExecution)
                     .filter(SpotWorldExecution.user_id == uid,
                             SpotWorldExecution.executed_at >= cutoff)
                     .order_by(SpotWorldExecution.executed_at.desc())
                     .all()
                )
                for e in recent_execs:
                    anyio.from_thread.run(ws_manager.send_to_user, uid, {
                        "type": "spot_exec",
                        "data": _exec_payload(e),
                    })

                order_ids = [e.order_id for e in recent_execs]
                if order_ids:
                    orders = (
                        s.query(SpotWorldOrder.id, SpotWorldOrder.order_type)
                         .filter(SpotWorldOrder.id.in_(order_ids))
                         .all()
                    )
                    ot_map = {oid: (ot.name if hasattr(ot, "name") else str(ot)) for oid, ot in orders}
                    for e in recent_execs:
                        ot = (ot_map.get(e.order_id) or "").lower()
                        if ot == "limit":
                            anyio.from_thread.run(ws_manager.send_to_user, uid, {
                                "type": "spot_limit_filled",
                                "data": {**_exec_payload(e), "order_type": "limit"},
                            })

            anyio.from_thread.run(ws_manager.broadcast, {"type": "spot_refresh"})

            try:
                d = get_orderbook_depth(s, top=16)
                anyio.from_thread.run(ws_manager.broadcast, {"type": "orderbook", "data": d})
            except Exception as ee:
                log.warning("broadcast_orderbook_in_tick_failed %s", ee)
    except Exception as e:
        log.warning("match_limits_on_price_tick error: %s", e)
        s.rollback()
