# web/routers/ws_public.py
from fastapi import APIRouter, WebSocket
from ..realtime.ws_public import ws_public

router = APIRouter()

@router.websocket("/ws/public")
async def ws_pub(ws: WebSocket):
    await ws_public.connect(ws)
    try:
        while True:
            _ = await ws.receive_text()
    except:
        pass
    finally:
        ws_public.disconnect(ws)
