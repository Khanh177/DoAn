from select import select
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from decimal import Decimal
from ..models.models import Wallet, WalletType, User
from ..schemas.wallet import ASSET_KEYS, TransferIn, TransferOut, WalletMini

#Kiểm tra username đã tồn tại chưa
def get_by_username(db: Session, username: str):
    return db.query(User).filter(User.username == username).first()

#Lấy danh sách loại ví của người dùng
def get_type_wallets(db: Session, skip: int = 0, limit: int = 100) -> list[WalletType]:
    return db.query(WalletType).order_by(WalletType.id.asc()).offset(skip).limit(limit).all()

#Lấy số dư theo từng loại ví
def get_wallet_balance(db: Session, user_id: int, wallet_type_id: int):
    return (
        db.query(Wallet)
        .filter(Wallet.user_id == user_id, Wallet.wallet_type_id == wallet_type_id)
        .first()
    )

#Lấy số dư ví của từng người dùng
def get_wallet_balances_by_user(db: Session, user_id: int):
    return (
        db.query(Wallet)
        .filter(Wallet.user_id == user_id)
        .order_by(Wallet.wallet_type_id.asc())
        .all()
    )

def _get_wallet_for_update(db: Session, user_id: int, wallet_type_id: int) -> Wallet:
    w = (
        db.query(Wallet)
        .filter(Wallet.user_id == user_id, Wallet.wallet_type_id == wallet_type_id)
        .with_for_update()        
        .first()
    )
    if not w:
        raise HTTPException(status_code=404, detail="Wallet không tồn tại")
    return w

#Chuyển tiền giữa các ví của từng người dùng
def transfer_between_wallets(db: Session, user_id: int, payload: TransferIn) -> TransferOut:
    if payload.from_wallet_type_id == payload.to_wallet_type_id:
        raise HTTPException(status_code=400, detail="Ví nguồn và ví đích phải khác nhau")
    if payload.asset_key not in ASSET_KEYS:
        raise HTTPException(status_code=400, detail="asset_key không hợp lệ")

    col = ASSET_KEYS[payload.asset_key]
    amt: Decimal = payload.amount

    # khóa theo thứ tự ổn định để tránh deadlock
    a, b = sorted([payload.from_wallet_type_id, payload.to_wallet_type_id])
    w_a = _get_wallet_for_update(db, user_id, a)
    w_b = _get_wallet_for_update(db, user_id, b)

    w_from = w_a if w_a.wallet_type_id == payload.from_wallet_type_id else w_b
    w_to   = w_b if w_a.wallet_type_id == payload.from_wallet_type_id else w_a

    src = Decimal(getattr(w_from, col) or 0)
    if src < amt:
        raise HTTPException(status_code=400, detail="Số dư không đủ")

    setattr(w_from, col, src - amt)
    dst = Decimal(getattr(w_to, col) or 0)
    setattr(w_to, col, dst + amt)

    db.flush()  # có số dư mới cho response

    return TransferOut(
        user_id=user_id,
        asset_key=payload.asset_key,
        debited=WalletMini(
            wallet_type_id=w_from.wallet_type_id, asset_key=payload.asset_key,
            amount=amt, new_balance=getattr(w_from, col),
        ),
        credited=WalletMini(
            wallet_type_id=w_to.wallet_type_id, asset_key=payload.asset_key,
            amount=amt, new_balance=getattr(w_to, col),
        ),
    )