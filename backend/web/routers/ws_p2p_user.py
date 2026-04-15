# backend/web/routers/ws_p2p_user.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..realtime.ws_p2p_user import p2p_user_manager
from ..realtime.auth_ws import get_current_user_ws 

router = APIRouter()


@router.websocket("/ws/p2p/user")
async def p2p_user_ws(websocket: WebSocket):
    # token lấy từ query ?token=xxx, get_current_user_ws tự decode + check
    user = await get_current_user_ws(websocket)
    user_id = user.id

    await p2p_user_manager.connect(user_id, websocket)
    try:
        while True:
            # không cần xử lý message, chỉ giữ kết nối
            await websocket.receive_text()
    except WebSocketDisconnect:
        p2p_user_manager.disconnect(user_id, websocket)
    except Exception:
        p2p_user_manager.disconnect(user_id, websocket)
