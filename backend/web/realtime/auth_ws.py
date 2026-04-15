from typing import Optional
from fastapi import WebSocket, WebSocketException
from pydantic import BaseModel
from jose import jwt, JWTError, ExpiredSignatureError

# dùng cùng secret/algorithm với create_access_token
from ..core.security import SECRET_KEY, ALGORITHM  # ví dụ HS256

class WSUser(BaseModel):
    id: int

def decode_ws_user(ws: WebSocket) -> Optional[WSUser]:
    """
    Lấy token từ query ?token=... rồi decode JWT.
    Hợp lệ -> trả về WSUser(id=uid). Sai/thiếu -> None.
    """
    token = ws.query_params.get("token")
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        uid = payload.get("uid") or payload.get("user_id") or payload.get("sub")
        # sub của bạn là email, còn uid là id; ưu tiên uid
        try:
            uid = int(uid)
        except Exception:
            return None
        return WSUser(id=uid)
    except (ExpiredSignatureError, JWTError):
        return None

async def get_current_user_ws(ws: WebSocket) -> WSUser:
    """
    Dùng trong route WS:
        user = await get_current_user_ws(websocket)
    Không gọi ws.accept() ở đây để tránh accept 2 lần.
    """
    user = decode_ws_user(ws)
    if not user:
        # Đóng WS với code 1008 (Policy Violation / Unauthorized)
        await ws.close(code=1008)
        raise WebSocketException(code=1008, reason="Unauthorized WebSocket")
    return user