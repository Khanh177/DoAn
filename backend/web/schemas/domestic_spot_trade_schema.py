from typing import Optional, List, Annotated
from decimal import Decimal, ROUND_HALF_UP
from pydantic import BaseModel, Field, field_validator

# helper: ép 6 chữ số thập phân
def q6(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)

AmountVND = Annotated[int, Field(gt=0)]  # VND là số nguyên
QtyXAU    = Annotated[Decimal, Field(gt=0)]

class SpotBuyReq(BaseModel):
    instrument_id: int = Field(..., description="ID vàng nội địa")
    amount_vnd: AmountVND

class SpotSellReq(BaseModel):
    instrument_id: int
    qty_xau: QtyXAU
    allow_partial: bool = False

    # đảm bảo 6 chữ số thập phân
    @field_validator("qty_xau")
    @classmethod
    def _q6(cls, v: Decimal) -> Decimal:
        return q6(v)

class SpotTradeResp(BaseModel):
    trade_id: int
    side: str
    instrument_id: int
    qty_xau: float
    price_used: int
    gross_vnd: int
    fee_vnd: int
    net_vnd: int
    details: Optional[List[dict]] = None

class SpotAvailableResp(BaseModel):
    wallet_type_id: int = 2
    usd_balance: float
    vnd_balance: int
    total_xau: float
    unlocked_xau: float
    locked_xau: float
    daily_limit_vnd: int
    daily_used_vnd: int
    daily_remaining_vnd: int
    usd_vnd_rate: float

class SpotTradeRow(BaseModel):
    id: int
    ts: str
    brand: Optional[str] = None
    symbol: Optional[str] = None
    side: str
    qty_xau: float
    price_used: int
    gross_vnd: int
    fee_vnd: int
    net_vnd: int

class SpotTradeHistoryResp(BaseModel):
    items: List[SpotTradeRow]
    next_cursor: Optional[str] = None 