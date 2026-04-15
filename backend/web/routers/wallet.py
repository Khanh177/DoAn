import logging
from typing import List
from fastapi import APIRouter, Query, Depends
from sqlalchemy.orm import Session

from backend.web.core.deps import get_current_user
from backend.web.models.models import Wallet

from ..database import get_db
from backend.web.schemas.wallet import WalletP2POut, WalletSpotOut, WalletTypeOut, WalletBalanceOut, TransferIn, TransferOut
from fastapi import Path, HTTPException, status
from ..repositories.wallet import get_type_wallets, get_wallet_balance, transfer_between_wallets,   get_wallet_balances_by_user
from ..repositories import p2p_repo

logger = logging.getLogger("wallet")
router = APIRouter(prefix="/wallet", tags=["wallet"])

SPOT_WALLET_TYPE_ID = 2
FUNDING_WALLET_TYPE_ID = 1

#Lấy danh sách loại ví của người dùng
@router.get("/wallet_type", response_model=List[WalletTypeOut])
def list_wallet_types(skip: int = Query(0, ge=0), limit: int = Query(18, ge=1, le=10000), db: Session = Depends(get_db)):
    logger.info("Yêu cầu lấy danh sách loại ví với skip=%d và limit=%d", skip, limit)
    return get_type_wallets(db, skip=skip, limit=limit)

#Lấy ví spot để giao dịch vàng thế giới
@router.get("/spot/me", response_model=WalletSpotOut)
def get_spot_wallet_me(
    user = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = get_wallet_balance(db, user.id, SPOT_WALLET_TYPE_ID)
    if not row:
        logger.warning(f"[Ví] Không tìm thấy ví spot cho user_id={user.id}")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="wallet_not_found_spot")
    logger.info(f"[Ví] spot/me user_id={user.id} balance={row.balance} xau={row.gold_world_balance}")
    return WalletSpotOut(balance=row.balance, gold_world_balance=row.gold_world_balance)

#Lấy ví funding để giao dịch p2p
@router.get("/p2p/me", response_model=WalletP2POut)
def get_p2p_wallet_me(
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Ví funding dùng cho P2P.
    - balance: USD trong ví funding
    - gold_world_balance: SỐ VÀNG KHẢ DỤNG CHO P2P (đã trừ post + trade)
    """
    row = get_wallet_balance(db, user.id, FUNDING_WALLET_TYPE_ID)
    if not row:
        logger.warning(f"[Ví] Không tìm thấy ví funding cho user_id={user.id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="wallet_not_found_funding",
        )

    available_gold = p2p_repo.get_available_gold_for_p2p(db, user.id)

    logger.info(
        f"[Ví] p2p/me user_id={user.id} balance={row.balance} "
        f"gold_total={row.gold_world_balance} gold_available={available_gold}"
    )

    # LƯU Ý: ở endpoint này gold_world_balance = available cho P2P
    return WalletP2POut(
        balance=row.balance,
        gold_world_balance=available_gold,
    )

#Lấy danh sách số dư theo người dùng
@router.get("/{user_id}/balance", response_model=list[WalletBalanceOut])
def list_balances_by_user(user_id: int = Path(..., ge=1), db: Session = Depends(get_db)):
    logger.info(f"[Ví] Lấy danh sách số dư theo người dùng user_id={user_id}")
    try:
        rows = get_wallet_balances_by_user(db, user_id)
        logger.info(f"[Ví] user_id={user_id} -> tổng số ví: {len(rows)}")
        return rows
    except Exception:
        logger.exception(f"[Ví] Lỗi khi lấy danh sách số dư user_id={user_id}")
        raise

#Lấy số dư theo từng loại ví
@router.get("/{user_id}/{wallet_type_id}/balance", response_model=WalletBalanceOut)
def get_balance(
    user_id: int = Path(..., ge=1),
    wallet_type_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
):
    logger.info(f"[Ví] Lấy số dư chi tiết user_id={user_id} wallet_type_id={wallet_type_id}")
    try:
        row = get_wallet_balance(db, user_id, wallet_type_id)
        if not row:
            logger.warning(f"[Ví] Không tìm thấy ví user_id={user_id} wallet_type_id={wallet_type_id}")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy ví")
        logger.info(f"[Ví] Thành công user_id={user_id} wallet_type_id={wallet_type_id}")
        return row
    except HTTPException:
        raise
    except Exception:
        logger.exception(f"[Ví] Lỗi khi lấy số dư user_id={user_id} wallet_type_id={wallet_type_id}")
        raise

#Chuyển tiền giữa các ví của từng người dùng
@router.post("/{user_id}/transfer", response_model=TransferOut)
def transfer_wallets(user_id: int, body: TransferIn, db: Session = Depends(get_db)):
    res = transfer_between_wallets(db, user_id, body)
    db.commit()
    logger.info(f"[Ví] Chuyển tiền giữa các ví user_id={user_id} từ ví {body.from_wallet_type_id} sang ví {body.to_wallet_type_id} số tiền {body.amount} ({body.asset_key})")
    return res