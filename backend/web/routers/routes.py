# web/realtime/routes.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..realtime.auth_ws import decode_ws_user
from ..realtime.ws_manager_domestic_gold_price import manager

router = APIRouter()

@router.websocket("/ws/prices")
async def prices_ws(ws: WebSocket):
    # Cho phép cả khách: nếu không có token => uid = 0
    user = decode_ws_user(ws)
    uid = user.id if user else 0
    await manager.connect(uid, ws)
    try:
        while True:
            # server-push only; nếu muốn ping-pong thì đọc nhẹ
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(uid, ws)
