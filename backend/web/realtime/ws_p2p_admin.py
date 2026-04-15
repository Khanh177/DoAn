# backend/web/realtime/ws_p2p_admin.py
from typing import List
from fastapi import WebSocket

class P2PAdminWSManager:
    def __init__(self):
        self.connections: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.connections.append(ws)  # vẫn dùng list để giữ thứ tự nếu cần

    def disconnect(self, ws: WebSocket):
        # Idempotent + không raise
        self.connections = [c for c in self.connections if c != ws]

    async def broadcast(self, message: dict):
        if not self.connections:
            return
        # Copy list trước khi iterate
        for ws in list(self.connections):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(ws)  # tự động dọn chết

p2p_admin_manager = P2PAdminWSManager()
