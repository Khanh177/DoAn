from decimal import Decimal
from datetime import datetime
from typing import List, Literal, Optional, Dict, Any

from pydantic import BaseModel, ConfigDict, field_validator


# Cố định danh sách loại vàng hợp lệ cho P2P
VALID_GOLD_TYPES = [
    "gold_world_balance",   # vàng thế giới trong ví funding
]


class BankInfo(BaseModel):
    """
    Thông tin ngân hàng của người bán dùng trong giao dịch P2P.
    Dùng khi muốn override thông tin bank mặc định trên bài post.
    """
    ten_ngan_hang: str
    so_tai_khoan: str
    ten_chu_tai_khoan: str
    transfer_note: str  # nội dung chuyển khoản *gợi ý* cho người mua


# ---------- P2P POST (BÀI ĐĂNG MUA/BÁN) ----------

class P2PPostBase(BaseModel):
    trade_type: Literal["buy", "sell"]  # Mua / Bán
    gold_type: str                      # luôn là "gold_world_balance" cho mô hình hiện tại

    price_vnd: Decimal                  # đơn giá theo VND
    min_amount_vnd: Decimal             # tổng tiền tối thiểu cho 1 deal
    max_amount_vnd: Decimal             # tổng tiền tối đa cho 1 deal
    total_quantity: Decimal             # tổng số lượng vàng (lượng) cho bài post

    bank_name: str
    bank_account_number: str
    bank_account_name: str
    transfer_note_template: str         # template ND CK, phần cuối sẽ chèn trade_code

    @field_validator("price_vnd", "min_amount_vnd", "max_amount_vnd", "total_quantity")
    @classmethod
    def validate_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Giá trị phải > 0")
        return v

    @field_validator("gold_type")
    @classmethod
    def validate_gold_type(cls, v: str) -> str:
        if v not in VALID_GOLD_TYPES:
            raise ValueError(f"Loại vàng không hợp lệ. Hợp lệ: {', '.join(VALID_GOLD_TYPES)}")
        return v

    @field_validator("bank_name", "bank_account_number", "bank_account_name", "transfer_note_template")
    @classmethod
    def validate_non_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Trường này không được để trống")
        return v


class P2PPostCreate(P2PPostBase):
    """
    Body tạo bài post P2P.
    user_id lấy từ token, không cho client truyền.
    """
    pass


class P2PPostResponse(P2PPostBase):
    """
    Dữ liệu trả về cho frontend khi xem bài P2P.
    """
    id: int
    user_id: int
    status: str
    created_at: datetime
    updated_at: datetime

    full_name: str          # tên người đăng
    available_gold: Optional[float] = None   # vàng khả dụng hiển thị dạng text, ví dụ "1.23456 lượng"

    model_config = ConfigDict(from_attributes=True)


# ---------- P2P TRADE (GIAO DỊCH ĐƯỢC KHỚP) ----------

class P2PTradeCreate(BaseModel):
    """
    Body tạo giao dịch P2P.
    Buyer là current_user, seller lấy từ post.
    """
    post_id: int
    quantity: Decimal          # số lượng vàng (lượng)
    agreed_price_vnd: Decimal  # giá thỏa thuận
    total_amount_vnd: Decimal  # tổng tiền = quantity * agreed_price_vnd
    fee_rate: Decimal = Decimal("0.005")  # 0.5% (0.005) – lưu tỷ lệ, server sẽ tính phí tuyệt đối

    bank_info: Optional[BankInfo] = None
    note: Optional[str] = None  # ghi chú thêm

    @field_validator("quantity", "agreed_price_vnd", "total_amount_vnd", "fee_rate")
    @classmethod
    def validate_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Giá trị phải > 0")
        return v


class P2PTradeUpdateStatus(BaseModel):
    """
    Body update trạng thái giao dịch.
    Dùng chung cho buyer/seller/admin.
    """
    status: Literal["pending", "paid", "confirmed", "completed", "cancelled", "disputed"]
    complaint: Optional[str] = None

    # Buyer mark paid
    paid_at: Optional[datetime] = None
    # Seller confirm
    confirmed_at: Optional[datetime] = None


class P2PTradeResponse(BaseModel):
    """
    Dữ liệu trả về cho frontend khi xem giao dịch P2P.
    Cho phép frontend render đầy đủ thông tin để biết phải tick gì.
    """
    id: int
    trade_code: str

    post_id: int
    buyer_id: int
    seller_id: int

    quantity: Decimal
    agreed_price_vnd: Decimal
    total_amount_vnd: Decimal
    fee_vnd: Decimal
    gold_type: str

    status: str
    created_at: datetime
    paid_at: Optional[datetime] = None
    confirmed_at: Optional[datetime] = None

    bank_info: Optional[Dict[str, Any]] = None
    complaint: Optional[str] = None

    transfer_note: Optional[str] = None

    # Thông tin hiển thị thêm
    buyer_name: Optional[str] = None
    seller_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class P2PPostUpdate(BaseModel):
    price_vnd: float
    min_amount_vnd: float
    max_amount_vnd: float
    total_quantity: float
    bank_name: str
    bank_account_number: str
    bank_account_name: str

# Schema cho toggle status
class P2PPostStatusUpdate(BaseModel):
    status: Literal["active", "inactive"]

class P2PPostPage(BaseModel):
    items: List[P2PPostResponse]
    total: int

class P2PTradePage(BaseModel):
    items: List[P2PTradeResponse]
    total: int
