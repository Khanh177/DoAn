from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.models import User
from jose import jwt
from .security import SECRET_KEY, ALGORITHM

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise ValueError("missing sub")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token không hợp lệ")

    user = db.query(User).filter(User.username == username).first()
    if not user or user.banned == 1:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Không có quyền")
    return user

def require_role_ids(*allowed: int):
    def _check(user: User = Depends(get_current_user)) -> User:
        if allowed and user.role_id not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Không có quyền")
        return user
    return _check
