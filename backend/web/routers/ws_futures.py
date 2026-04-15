import asyncio
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from jose import jwt, JWTError

from ..realtime.ws_futures import manager_futures
from ..core.security import SECRET_KEY, ALGORITHM

log = logging.getLogger(__name__)
router = APIRouter(prefix="/ws_futures", tags=["ws"])

def _verify(token: str) -> tuple[bool, int | None]:
    """Xác thực JWT token và trả về (valid, user_id)"""
    if not token:
        log.warning("Empty token")
        return False, None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get('uid')
        log.debug(f"Token verified for user: {user_id}")
        return True, user_id
    except JWTError as e:
        log.error(f"Token verification failed: {e}")
        return False, None

@router.websocket("/ws")
async def ws_futures(ws: WebSocket, uid: int = Query(...), token: str = Query(...)):
    """WebSocket endpoint cho futures realtime"""
    
    log.info(f"[WS] Connection attempt: uid={uid}, token_present={bool(token)}")
    
    # 1) Authentication
    valid, token_uid = _verify(token)
    if not valid:
        log.warning(f"[WS] Auth failed for uid={uid}")
        try:
            await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        except:
            pass
        return
    
    # Verify uid matches token
    if token_uid != uid:
        log.warning(f"[WS] UID mismatch: claimed={uid}, token={token_uid}")
        try:
            await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        except:
            pass
        return

    # 2) Đăng ký connection
    try:
        await manager_futures.connect(uid, ws)
        log.info(f"[WS] User {uid} connected successfully")
        
        # Gửi welcome message
        try:
            await ws.send_json({
                "type": "connected",
                "user_id": uid,
                "message": "Connected to futures WebSocket"
            })
            log.debug(f"[WS] Sent welcome message to user {uid}")
        except Exception as e:
            log.error(f"[WS] Failed to send welcome message: {e}")
        
    except Exception as e:
        log.error(f"[WS] Error connecting user {uid}: {e}", exc_info=True)
        try:
            await ws.close()
        except:
            pass
        return

    try:
        # 3) Message loop
        while True:
            try:
                data = await asyncio.wait_for(ws.receive_json(), timeout=60.0)
                log.debug(f"[WS] Received from user {uid}: {data.get('type', 'unknown')}")
                await manager_futures.handle_message(ws, data)
                
            except asyncio.TimeoutError:
                # Send keepalive ping
                try:
                    await ws.send_json({"type": "keepalive"})
                except:
                    log.warning(f"[WS] Keepalive failed for user {uid}")
                    break
                continue
                
            except Exception as e:
                log.error(f"[WS] Error in message loop for user {uid}: {e}")
                break

    except WebSocketDisconnect:
        log.info(f"[WS] User {uid} disconnected normally")
    except Exception as e:
        log.error(f"[WS] Unexpected error for user {uid}: {e}", exc_info=True)
    finally:
        # 4) Cleanup
        await manager_futures.disconnect(ws)
        log.info(f"[WS] User {uid} connection cleaned up")

@router.get("/stats")
async def ws_stats():
    """API để kiểm tra stats WebSocket connections"""
    stats = manager_futures.get_stats()
    log.info(f"[WS Stats] {stats}")
    return stats