# backend/web/realtime/ws_p2p_public.py
from fastapi import WebSocket
from typing import List
from fastapi.encoders import jsonable_encoder


class P2PPublicManager:
    def __init__(self):
        self.connections: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        if ws not in self.connections:
            self.connections.append(ws)

    def disconnect(self, ws: WebSocket):
        # ĐÂY LÀ CHỖ CHẾT: DÙNG DISCARD ĐỂ TRÁNH LỖI KHI BỊ GỌI 2 LẦN
        if ws in self.connections:
            self.connections.remove(ws)
        # HOẶC DÙNG DISCARD (AN TOÀN HƠN)
        # self.connections = [c for c in self.connections if c != ws]

    async def broadcast(self, message: dict):
        data = jsonable_encoder(message)
        dead = []
        for ws in self.connections[:]:  # copy để tránh mutation while iterating
            try:
                await ws.send_json(data)
            except Exception:  # bắt hết lỗi (RuntimeError, WebSocketDisconnect, ...)
                dead.append(ws)

        # Xóa những thằng chết
        for ws in dead:
            self.disconnect(ws)


p2p_public_manager = P2PPublicManager()
