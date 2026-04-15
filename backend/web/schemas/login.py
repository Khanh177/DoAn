from pydantic import BaseModel, EmailStr

class Login(BaseModel):
    username: EmailStr
    password: str

class TokenOut(BaseModel):
    username: EmailStr
    uid: int
    access_token: str
    token_type: str = "bearer"