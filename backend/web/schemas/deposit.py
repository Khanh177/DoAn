from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_serializer

class DepositCodeOut(BaseModel):
    deposit_code: str = Field(min_length=6, max_length=16)

class DepositConfirmIn(BaseModel):
    deposit_code: str = Field(min_length=6, max_length=16)
    amount_vnd: Decimal = Field(gt=0)
    usdt_amount: Optional[Decimal] = Field(default=None, gt=0)
    channel: Optional[Literal["bank_transfer","momo","zalo","cash"]] = None
    reference_no: Optional[str] = None
    evidence_url: Optional[str] = None

class DepositOut(BaseModel):
    id: int
    deposit_code: str
    status: Literal["pending","approved","credited","rejected"]
    amount_money: Decimal
    currency: Literal["VND","USDT","USD"]
    rate_used: Optional[Decimal] = None
    usdt_amount: Optional[Decimal] = None
    created_at: datetime
    approved_at: Optional[datetime] = None
    credited_at: Optional[datetime] = None
    approved_by: Optional[int] = None
    rejected_reason: Optional[str] = None
    updated_at: datetime  

    model_config = ConfigDict(from_attributes=True)

    # Trả Decimal về string để tránh lỗi ResponseValidation với Decimal
    @field_serializer("amount_money", "rate_used", "usdt_amount")
    def _ser_decimal(self, v: Optional[Decimal]):
        return None if v is None else str(v)

class DepositListOut(BaseModel):
    items: list[DepositOut]
    total: int

__all__ = ["DepositCodeOut", "DepositConfirmIn", "DepositOut", "DepositListOut"]

class AdminDepositOut(DepositOut):
    approved_by_name: Optional[str] = None

class AdminDepositListOut(BaseModel):
    items: list[AdminDepositOut]
    total: int

class RejectIn(BaseModel):
    rejected_reason: Optional[str] = Field(default=None, max_length=255)