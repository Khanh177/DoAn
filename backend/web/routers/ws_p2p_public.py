# backend/web/routers/ws_p2p_public.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..realtime.ws_p2p_public import p2p_public_manager

router = APIRouter()

@router.websocket("/ws/p2p/public")
async def p2p_public_endpoint(websocket: WebSocket):
    await p2p_public_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()  # hoặc receive_json()
            # Có thể log hoặc bỏ qua ping/pong
            # print("P2P public WS received:", data)
    except WebSocketDisconnect:
        p2p_public_manager.disconnect(websocket)
    except Exception as e:
        print("P2P WS error:", e)
        p2p_public_manager.disconnect(websocket)