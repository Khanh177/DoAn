from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..realtime.auth_ws import decode_ws_user
from ..realtime.ws_manager import manager_domestic

router = APIRouter(prefix="/ws", tags=["realtime"])

@router.websocket("/user")
async def ws_user(ws: WebSocket):
    user = decode_ws_user(ws)
    if not user or not user.id:
        await ws.close(code=4401, reason="unauthorized")
        return
    await manager_domestic.connect(user.id, ws)
    try:
        while True:
            await ws.receive_text()  # FE đã gửi ping định kỳ
    except WebSocketDisconnect:
        manager_domestic.disconnect(user.id, ws)
