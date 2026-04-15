from pydantic import BaseModel, ConfigDict, field_validator

class Register(BaseModel):
    first_name: str
    last_name: str
    username: str
    password: str
    confirm_password: str

    @field_validator('confirm_password')
    @classmethod
    def passwords_match(cls, v, info):
        pwd = info.data.get('password')
        if pwd != v:
            raise ValueError('Mật khẩu xác nhận không khớp')
        return v
