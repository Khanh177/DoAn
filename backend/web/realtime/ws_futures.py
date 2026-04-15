import asyncio
import json
import time
import logging
from typing import Dict, Set
from fastapi import WebSocket

log = logging.getLogger(__name__)

class WSManager:
    def __init__(self):
        self.users: Dict[int, Set[WebSocket]] = {}
        self.last_seen: Dict[WebSocket, float] = {}
        self.ws_to_uid: Dict[WebSocket, int] = {}  # Track user_id for each websocket

    async def connect(self, uid: int, ws: WebSocket):
        """Kết nối WebSocket cho user"""
        await ws.accept()
        self.users.setdefault(uid, set()).add(ws)
        self.last_seen[ws] = time.time()
        self.ws_to_uid[ws] = uid
        log.info(f"User {uid} connected. Total connections: {len(self.last_seen)}")

    def _purge(self, ws: WebSocket):
        """Dọn dẹp WebSocket đã ngắt kết nối"""
        self.last_seen.pop(ws, None)
        uid = self.ws_to_uid.pop(ws, None)
        if uid:
            self.users.get(uid, set()).discard(ws)
            if not self.users.get(uid):
                self.users.pop(uid, None)
        log.info(f"Connection purged for user {uid}. Remaining: {len(self.last_seen)}")

    async def disconnect(self, ws: WebSocket):
        """Ngắt kết nối WebSocket"""
        try:
            await ws.close()
        except Exception as e:
            log.error(f"Error closing websocket: {e}")
        self._purge(ws)

    async def send_to_user(self, uid: int, msg: dict):
        """Gửi message tới một user cụ thể"""
        dead = []
        data = json.dumps(msg)
        
        connections = list(self.users.get(uid, set()))
        if not connections:
            log.warning(f"No active connections for user {uid}")
            return
        
        for ws in connections:
            try:
                await ws.send_text(data)
                log.debug(f"Sent to user {uid}: {msg.get('type', 'unknown')}")
            except Exception as e:
                log.error(f"Error sending to user {uid}: {e}")
                dead.append(ws)
        
        for ws in dead:
            self._purge(ws)

    async def broadcast(self, msg: dict):
        """Broadcast message tới tất cả users"""
        dead = []
        data = json.dumps(msg)
        
        all_connections = []
        for connections in self.users.values():
            all_connections.extend(list(connections))
        
        log.debug(f"Broadcasting to {len(all_connections)} connections")
        
        for ws in all_connections:
            try:
                await ws.send_text(data)
            except Exception as e:
                log.error(f"Error broadcasting: {e}")
                dead.append(ws)
        
        for ws in dead:
            self._purge(ws)

    async def handle_message(self, ws: WebSocket, data: dict):
        """Xử lý message từ client"""
        msg_type = data.get("type")
        
        if msg_type == "ping":
            self.last_seen[ws] = time.time()
            try:
                await ws.send_text(json.dumps({"type": "pong", "timestamp": time.time()}))
            except Exception as e:
                log.error(f"Error sending pong: {e}")
                await self.disconnect(ws)
        else:
            log.debug(f"Received message type: {msg_type}")

    async def watchdog(self):
        """Background task để kiểm tra và ngắt các connection timeout"""
        while True:
            try:
                now = time.time()
                timeout_sockets = []
                
                for ws, last_seen in list(self.last_seen.items()):
                    if now - last_seen > 60:  # 60 giây không có ping
                        timeout_sockets.append(ws)
                
                for ws in timeout_sockets:
                    uid = self.ws_to_uid.get(ws)
                    log.warning(f"Disconnecting user {uid} due to timeout")
                    await self.disconnect(ws)
                
                await asyncio.sleep(10)
            except Exception as e:
                log.error(f"Watchdog error: {e}")
                await asyncio.sleep(10)

    def get_stats(self) -> dict:
        """Lấy thống kê connections"""
        return {
            "total_connections": len(self.last_seen),
            "total_users": len(self.users),
            "users": {uid: len(conns) for uid, conns in self.users.items()}
        }

manager_futures = WSManager()