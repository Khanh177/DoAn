from pydantic import BaseModel, ConfigDict, field_validator
from datetime import datetime
from typing import Optional, List

class DomesticGoldSpotItem(BaseModel):
    instrument_id: int
    brand: str
    display_name: str
    buy_price: float
    sell_price: float
    as_of: Optional[datetime]
    model_config = ConfigDict(from_attributes=True)

class DomesticGoldHistoryPoint(BaseModel):
    as_of: datetime
    buy_price: float
    sell_price: float

class GoldInstrumentIn(BaseModel):
    symbol: str
    brand: str
    display_name: str
    branch: Optional[str] = None
    purity: Optional[str] = None
    region: Optional[str] = None

class GoldInstrumentUpdate(BaseModel):
    brand: Optional[str] = None
    display_name: Optional[str] = None
    branch: Optional[str] = None
    purity: Optional[str] = None
    region: Optional[str] = None

class GoldInstrumentOut(BaseModel):
    id: int
    symbol: str
    brand: str
    display_name: str
    branch: Optional[str] = None
    purity: Optional[str] = None
    region: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class GoldPriceCreate(BaseModel):
    instrument_id: int
    buy_price: float
    sell_price: float
    as_of: datetime

    @field_validator("buy_price", "sell_price")
    @classmethod
    def _pos(cls, v: float):
        if v is None or v <= 0:
            raise ValueError("price must be > 0")
        return v

class GoldPriceUpdate(BaseModel):
    buy_price: Optional[float] = None
    sell_price: Optional[float] = None
    as_of: Optional[datetime] = None

class GoldPriceOut(BaseModel):
    id: int
    instrument_id: int
    buy_price: float
    sell_price: float
    currency: str
    as_of: datetime
    model_config = ConfigDict(from_attributes=True)

# BULK
class GoldPriceBulkItem(BaseModel):
    instrument_id: int
    buy_price: float
    sell_price: float
    as_of: datetime

class GoldPriceBulkIn(BaseModel):
    items: List[GoldPriceBulkItem]
