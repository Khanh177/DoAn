from decimal import Decimal
from typing import Literal, Optional
from pydantic import BaseModel, Field

class MarketBuyIn(BaseModel):
    amount_usd: Decimal = Field(..., gt=0, description="Số tiền USD muốn mua")
    slippage_bps: Optional[Decimal] = Field(None, ge=0, description="Slippage BPS (0.05 = 0.05%)")
    idem_key: Optional[str] = None

class MarketSellIn(BaseModel):
    qty_xau: Decimal = Field(..., gt=0, description="Số lượng XAU muốn bán")
    slippage_bps: Optional[Decimal] = Field(None, ge=0, description="Slippage BPS")
    idem_key: Optional[str] = None

class LimitIn(BaseModel):
    side: Literal["buy", "sell"]
    limit_price: Decimal = Field(..., gt=0, description="Giá giới hạn")
    qty_xau: Optional[Decimal] = Field(None, gt=0, description="Số lượng XAU (dùng cho SELL hoặc BUY)")
    total_usd: Optional[Decimal] = Field(None, gt=0, description="Tổng USD (dùng cho BUY)")
    idem_key: Optional[str] = None

class CancelOut(BaseModel):
    ok: bool
    order_id: int
    message: str

class OrderOut(BaseModel):
    id: int
    order_type: str
    trade_type: str
    status: str
    qty_xau: Optional[Decimal]
    total_usd: Optional[Decimal]
    limit_price: Optional[Decimal]
    executed_price: Optional[Decimal]
    fee_usd: Optional[Decimal]
    created_at: str
    executed_at: Optional[str]

class ExecutionOut(BaseModel):
    id: int
    order_id: int
    trade_type: str
    price: Decimal
    qty_xau: Decimal
    gross_usd: Decimal
    fee_usd: Decimal
    net_usd: Decimal
    pnl_realized_usd: Decimal
    executed_at: str
