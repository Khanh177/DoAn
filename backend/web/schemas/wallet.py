from decimal import Decimal
from pydantic import BaseModel, ConfigDict, field_serializer, field_validator

Q6 = Decimal("0.000001")

#Schema cho loại ví
class WalletTypeOut(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)

#Schema cho số dư ví
class WalletBalanceOut(BaseModel):
    wallet_type_id: int
    user_id: int
    balance: Decimal
    gold_world_balance: Decimal
    gold_sjc_balance: Decimal
    gold_doji_hn_balance: Decimal
    gold_doji_sg_balance: Decimal
    gold_btmc_sjc_balance: Decimal
    gold_phu_quy_sjc_balance: Decimal
    gold_pnj_hcm_balance: Decimal
    gold_pnj_hn_balance: Decimal

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("*")
    def dec_to_float(self, v):
        from decimal import Decimal, ROUND_DOWN
        if isinstance(v, Decimal):
            return float(v.quantize(Q6, rounding=ROUND_DOWN))
        return v
    
#Schema cho chuyển tiền giữa các ví
ASSET_KEYS = {
    "usd_cash": "balance",
    "vang_the_gioi": "gold_world_balance",
    "vang_sjc": "gold_sjc_balance",
    "vang_doji_hn": "gold_doji_hn_balance",
    "vang_doji_sg": "gold_doji_sg_balance",
    "vang_btmc_sjc": "gold_btmc_sjc_balance",
    "vang_phu_quy_sjc": "gold_phu_quy_sjc_balance",
    "vang_pnj_hcm": "gold_pnj_hcm_balance",
    "vang_pnj_hn": "gold_pnj_hn_balance",
}

class TransferIn(BaseModel):
    from_wallet_type_id: int
    to_wallet_type_id: int
    asset_key: str         # một trong ASSET_KEYS
    amount: Decimal

    @field_validator("amount")
    @classmethod
    def must_positive(cls, v: Decimal):
        if v <= 0:
            raise ValueError("amount phải > 0")
        return v

    model_config = ConfigDict(from_attributes=True)

class WalletMini(BaseModel):
    wallet_type_id: int
    asset_key: str
    amount: Decimal
    new_balance: Decimal
    model_config = ConfigDict(from_attributes=True)

class TransferOut(BaseModel):
    user_id: int
    asset_key: str
    debited: WalletMini
    credited: WalletMini
    model_config = ConfigDict(from_attributes=True)

class WalletSpotOut(BaseModel):
    balance: Decimal
    gold_world_balance: Decimal

class WalletP2POut(BaseModel):
    balance: Decimal
    gold_world_balance: Decimal