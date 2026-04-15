# backend/web/realtime/ws_p2p_user.py
from typing import Dict, List
from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder


class P2PUserManager:
    def __init__(self):
        self.connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, user_id: int, ws: WebSocket):
        await ws.accept()
        if user_id not in self.connections:
            self.connections[user_id] = []
        if ws not in self.connections[user_id]:
            self.connections[user_id].append(ws)

    def disconnect(self, user_id: int, ws: WebSocket):
        conns = self.connections.get(user_id)
        if not conns:
            return
        if ws in conns:
            conns.remove(ws)
        if not conns:
            self.connections.pop(user_id, None)

    async def send_to_user(self, user_id: int, message: dict):
        data = jsonable_encoder(message)
        conns = list(self.connections.get(user_id, []))
        dead: List[WebSocket] = []

        for ws in conns:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)

        for ws in dead:
            self.disconnect(user_id, ws)


p2p_user_manager = P2PUserManager()
