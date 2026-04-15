from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, field_serializer

#Dùng cho register
class UserOut(BaseModel):
    id: int
    username: EmailStr
    first_name: str
    last_name: str

    model_config = ConfigDict(from_attributes=True)

class AdminUserOut(BaseModel):
    id: int
    username: EmailStr
    first_name: str
    last_name: str
    role_id: int
    banned: int = 0  # 0/1 như DB
    model_config = ConfigDict(from_attributes=True)

class RoleOut(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)

#Tạo user mới cho admin
class UserCreate(BaseModel):
    username: EmailStr
    password: str
    first_name: str
    last_name: str
    role_id: Optional[int] = None

#Chỉnh sửa thông tin user cho admin
class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    role_id: Optional[int] = None
