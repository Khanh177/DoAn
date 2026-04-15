from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..realtime.ws_p2p_admin import p2p_admin_manager
from ..realtime.auth_ws import get_current_user_ws

router = APIRouter()

@router.websocket("/ws/p2p/admin")
async def p2p_admin_ws(websocket: WebSocket):
    # Chỉ cần verify token là đủ (đã có get_current_user_ws)
    await get_current_user_ws(websocket)  # nếu token sai → tự close

    # Không kiểm tra role gì nữa → tin tưởng route này chỉ admin vào được
    await p2p_admin_manager.connect(websocket)
    
    try:
        while True:
            await websocket.receive_text()  # giữ kết nối sống (ping/pong)
    except WebSocketDisconnect:
        p2p_admin_manager.disconnect(websocket)
    except Exception as e:
        print(f"Admin WS error: {e}")
        p2p_admin_manager.disconnect(websocket)