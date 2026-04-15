from typing import Dict, Set
from fastapi import WebSocket
import json

class WSManagerDomesticGoldPrice:
    def __init__(self):
        self.active: Dict[int, Set[WebSocket]] = {}  # uid -> websockets

    async def connect(self, uid: int, ws: WebSocket):
        await ws.accept()
        self.active.setdefault(uid, set()).add(ws)

    def disconnect(self, uid: int, ws: WebSocket):
        conns = self.active.get(uid)
        if not conns: return
        conns.discard(ws)
        if not conns: self.active.pop(uid, None)

    async def send_to_user(self, uid: int, message: dict):
        conns = list(self.active.get(uid, ()))
        if not conns: return
        data = json.dumps(message, default=str)
        dead = []
        for ws in conns:
            try:
                await ws.send_text(data)
            except:
                dead.append(ws)
        for ws in dead:
            self.disconnect(uid, ws)

    async def broadcast(self, message: dict):
        # gửi tới tất cả uid
        for uid in list(self.active.keys()):
            await self.send_to_user(uid, message)

manager = WSManagerDomesticGoldPrice()
