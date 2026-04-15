from typing import Dict, Set
from fastapi import WebSocket
import json

class WSManager:
    def __init__(self):
        self.active: Dict[int, Set[WebSocket]] = {}

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
        for w in conns:
            try: await w.send_text(data)
            except: dead.append(w)
        for w in dead: self.disconnect(uid, w)

    async def broadcast(self, message: dict):
        data = json.dumps(message, default=str)
        for uid, conns in list(self.active.items()):
            dead = []
            for w in list(conns):
                try: await w.send_text(data)
                except: dead.append(w)
            for w in dead: self.disconnect(uid, w)

# 2 instance tách biệt
manager_domestic = WSManager() 
