from passlib.context import CryptContext
import os, time
from jose import jwt
from dotenv import load_dotenv
from passlib.context import CryptContext
from typing import Optional

pwd_context = CryptContext(schemes=["bcrypt_sha256"], deprecated="auto")

def hash_password(p: str) -> str:
    return pwd_context.hash(p)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

#JWT
basedir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.abspath(os.path.join(basedir, "..", ".."))
load_dotenv(os.path.join(root_dir, ".env"))

SECRET_KEY = os.getenv("JWT_SECRET", "dev-secret-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_SECONDS = int(os.getenv("ACCESS_TOKEN_EXPIRE_SECONDS", "36000"))  # 10h

def create_access_token(sub: str, extra_claims: Optional[dict] = None) -> str:
    now = int(time.time())
    payload = {
        "sub": sub,            # subject = user identifier (email)
        "iat": now,            # issued at
        "exp": now + ACCESS_TOKEN_EXPIRE_SECONDS,
    }
    if extra_claims:
        payload.update(extra_claims)
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return token