from typing import Dict, List
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from fastapi.exceptions import WebSocketException
from jose import jwt, JWTError

from ..models.models import User
from ..database import SessionLocal
from ..core.security import SECRET_KEY, ALGORITHM
from fastapi.encoders import jsonable_encoder 

router = APIRouter()


def verify_token_ws(token: str) -> dict:
    """Verify JWT token for WebSocket connections"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)


class ComplaintWSManager:
    def __init__(self):
        self.user_conns: Dict[int, List[WebSocket]] = {}
        self.admin_conns: Dict[int, List[WebSocket]] = {}

    async def _connect(self, mapping, key: int, ws: WebSocket):
        await ws.accept()
        mapping.setdefault(key, []).append(ws)

    async def connect_user(self, user_id: int, ws: WebSocket):
        await self._connect(self.user_conns, user_id, ws)

    async def connect_admin(self, admin_id: int, ws: WebSocket):
        await self._connect(self.admin_conns, admin_id, ws)

    def _disconnect(self, mapping, key: int, ws: WebSocket):
        conns = mapping.get(key)
        if not conns:
            return
        if ws in conns:
            conns.remove(ws)
        if not conns:
            mapping.pop(key, None)

    def disconnect_user(self, user_id: int, ws: WebSocket):
        self._disconnect(self.user_conns, user_id, ws)

    def disconnect_admin(self, admin_id: int, ws: WebSocket):
        self._disconnect(self.admin_conns, admin_id, ws)

    async def _safe_send(self, ws: WebSocket, payload: dict):
        try:
            # QUAN TRỌNG: encode trước khi send_json
            encoded = jsonable_encoder(payload)
            await ws.send_json(encoded)
        except Exception as exc:
            # tạm log ra cho dễ debug, sau không thích thì bỏ
            print("WS send error:", exc)
            pass

    async def send_to_user(self, user_id: int, payload: dict):
        for ws in list(self.user_conns.get(user_id, [])):
            await self._safe_send(ws, payload)

    async def send_to_admin(self, admin_id: int, payload: dict):
        for ws in list(self.admin_conns.get(admin_id, [])):
            await self._safe_send(ws, payload)

    async def broadcast_to_admins(self, payload: dict, except_admin_id: int | None = None):
        for aid, conns in list(self.admin_conns.items()):
            if except_admin_id is not None and aid == except_admin_id:
                continue
            for ws in list(conns):
                await self._safe_send(ws, payload)


complaint_ws_manager = ComplaintWSManager()


@router.websocket("/ws/complaints/user")
async def complaints_user_ws(
    ws: WebSocket,
    token: str = Query(...),
):
    """WebSocket endpoint for regular users"""
    try:
        # Verify token
        payload = verify_token_ws(token)
        user_id = payload.get("uid")
        
        if not user_id:
            await ws.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        
        # Get user from database to verify they exist
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                await ws.close(code=status.WS_1008_POLICY_VIOLATION)
                return
        finally:
            db.close()
        
        # Connect the WebSocket
        await complaint_ws_manager.connect_user(user_id, ws)
        
        # Send connection success message
        await ws.send_json({"type": "connected", "message": "WebSocket connected successfully"})
        print(f"✅ User {user_id} connected to complaint WebSocket")
        
        try:
            while True:
                # Keep connection alive, receive any messages
                await ws.receive_text()
        except WebSocketDisconnect:
            print(f"🔌 User {user_id} disconnected from complaint WebSocket")
            complaint_ws_manager.disconnect_user(user_id, ws)
    except WebSocketException:
        try:
            await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        except:
            pass
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await ws.close(code=status.WS_1011_INTERNAL_ERROR)
        except:
            pass


@router.websocket("/ws/complaints/admin")
async def complaints_admin_ws(
    ws: WebSocket,
    token: str = Query(...),
):
    """WebSocket endpoint for admin users"""
    try:
        # Verify token
        payload = verify_token_ws(token)
        user_id = payload.get("uid")
        role_id = payload.get("role")
        
        if not user_id or role_id != 1:
            await ws.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        
        # Get admin from database to verify they exist and are admin
        db = SessionLocal()
        try:
            admin = db.query(User).filter(User.id == user_id, User.role_id == 1).first()
            if not admin:
                await ws.close(code=status.WS_1008_POLICY_VIOLATION)
                return
        finally:
            db.close()
        
        # Connect the WebSocket
        await complaint_ws_manager.connect_admin(user_id, ws)
        
        # Send connection success message
        await ws.send_json({"type": "connected", "message": "Admin WebSocket connected successfully"})
        print(f"✅ Admin {user_id} connected to complaint WebSocket")
        
        try:
            while True:
                # Keep connection alive, receive any messages
                await ws.receive_text()
        except WebSocketDisconnect:
            print(f"🔌 Admin {user_id} disconnected from complaint WebSocket")
            complaint_ws_manager.disconnect_admin(user_id, ws)
    except WebSocketException:
        try:
            await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        except:
            pass
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await ws.close(code=status.WS_1011_INTERNAL_ERROR)
        except:
            pass