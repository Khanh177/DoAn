# web/realtime/ws_public.py
from typing import Set
from fastapi import WebSocket
import json

class WSPublic:
    def __init__(self):
        self.conns: Set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.conns.add(ws)

    def disconnect(self, ws: WebSocket):
        self.conns.discard(ws)

    async def broadcast(self, payload: dict):
        data = json.dumps(payload, default=str)
        dead = []
        for ws in list(self.conns):
            try:
                await ws.send_text(data)
            except:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

ws_public = WSPublic()
