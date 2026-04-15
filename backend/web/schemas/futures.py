from datetime import datetime
from decimal import Decimal
from typing import List
from pydantic import BaseModel, ConfigDict, Field

class FuturesOpenReq(BaseModel):
    instrument_id: int
    side: str  # "long" | "short"
    qty: Decimal = Field(gt=0)
    entry_price: Decimal = Field(gt=0)
    leverage: int = 100  # mặc định 1:100

class FuturesCloseReq(BaseModel):
    position_id: int
    exit_price: Decimal = Field(gt=0)

class FuturesPositionOut(BaseModel):
    id: int
    instrument_id: int
    side: str
    qty: Decimal
    entry_price: Decimal
    leverage: Decimal
    margin_used: Decimal
    status: str
    opened_at: datetime
    closed_at: datetime | None = None
    pnl_realized: Decimal

    model_config = ConfigDict(from_attributes=True)

class FuturesTradeOut(BaseModel):
    id: int
    instrument_id: int
    side: str
    qty: Decimal
    price: Decimal
    fee: Decimal
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class FuturesTradePage(BaseModel):
    items: List[FuturesTradeOut]
    total: int
    page: int
    size: int