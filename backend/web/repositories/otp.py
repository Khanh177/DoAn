# repositories/otp.py
import secrets, string
from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from ..models.models import OTP

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

def gen_otp(n: int = 6) -> str:
    return ''.join(secrets.choice(string.digits) for _ in range(n))

def create_and_send(db: Session, user_id: int, user_email: str, send_email_fn) -> None:
    raw = gen_otp()
    hashed = pwd.hash(raw)

    rec = OTP(
        user_id=user_id,
        code_hash=hashed,                                 # đổi sang code_hash
        created_at=datetime.now(timezone.utc),            # set created_at
        expired_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        consumed_at=None,
        attempts=0,
        max_attempts=5,
    )
    db.add(rec)
    db.commit()

    send_email_fn(user_email, raw)

def verify(db: Session, user_id: int, otp_input: str) -> bool:
    now = datetime.now(timezone.utc)

    rec = (db.query(OTP)
           .filter(
               OTP.user_id == user_id,
               OTP.consumed_at.is_(None),
               OTP.expired_at > now,
           )
           .order_by(OTP.id.desc())
           .first())

    if not rec:
        return False

    # chặn nếu quá số lần thử
    if rec.attempts >= rec.max_attempts:
        rec.consumed_at = now      # khóa record
        db.commit()
        return False

    # verify
    ok = pwd.verify(otp_input, rec.code_hash)            # dùng code_hash
    rec.attempts += 1

    if ok:
        rec.consumed_at = now

    db.commit()
    return ok
