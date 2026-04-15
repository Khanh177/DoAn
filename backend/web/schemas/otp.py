# schemas/otp.py
from pydantic import BaseModel, ConfigDict, EmailStr
from datetime import datetime

class OTPCreate(BaseModel):
    user_id: int
    otp_code: str  # sẽ hash trước khi lưu

class OTPOut(BaseModel):
    id: int
    user_id: int
    expired_at: datetime
    consumed_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)

class OTPVerifyRequest(BaseModel):
    user_id: int
    otp: str

class OTPResendRequest(BaseModel):
    username: EmailStr