from datetime import datetime
import secrets
import string
from decimal import ROUND_DOWN, Decimal
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy.dialects.postgresql import insert

from ..models.models import Deposit, Wallet

__all__ = ["gen_deposit_code", "create_pending_deposit_noselect"]

ALPHABET = string.ascii_uppercase + string.digits
FUNDING_TYPE_ID = 1  # seed cố định cho ví funding
Q6 = Decimal("0.000001")

# Tạo mã nạp tiền
def gen_deposit_code(length: int = 10) -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(length))

# #Nạp tiền
def create_pending_with_code(
    db: Session,
    *,
    user_id: int,
    amount_vnd: Decimal,
    deposit_code: str,
    idempotency_key: Optional[str] = None,
) -> Deposit:
    """
    Tạo deposit 'pending' dùng chính deposit_code do FE cấp.
    Ưu tiên idempotency_key nếu có. Nếu trùng deposit_code -> báo lỗi.
    """
    values = {
        "user_id": user_id,
        "wallet_type_id": FUNDING_TYPE_ID,
        "currency": "VND",
        "amount_money": Decimal(amount_vnd),
        "status": "pending",
        "rate_used": None,
        "usdt_amount": None,
        "approved_by": None,
        "approved_at": None,
        "credited_at": None,
        "idempotency_key": idempotency_key,
        "deposit_code": deposit_code,
    }

    if idempotency_key:
        stmt = (
            insert(Deposit)
            .values(values)
            .on_conflict_do_update(
                index_elements=["idempotency_key"],
                set_={"idempotency_key": insert(Deposit).excluded.idempotency_key},
            )
            .returning(Deposit)
        )
        dep = db.execute(stmt).scalar_one()
        db.flush()
        return dep

    try:
        stmt = insert(Deposit).values(values).returning(Deposit)
        dep = db.execute(stmt).scalar_one()
        db.flush()
        return dep
    except IntegrityError as e:
        db.rollback()
        # nhiều khả năng trùng deposit_code (unique)
        raise

#Duyệt nạp tiền
def admin_approve_and_credit(db: Session, *, deposit_id: int, admin_user_id: int) -> Deposit:
    # 1) Khóa record deposit để chống race
    dep: Deposit | None = (
        db.query(Deposit)
        .filter(Deposit.id == deposit_id)
        .with_for_update(nowait=False, of=Deposit)
        .one_or_none()
    )
    if not dep:
        raise ValueError("not_found")
    if dep.status != "pending":
        # idempotent: đã duyệt/hủy rồi thì trả hiện trạng
        return dep

    # 2) Lấy đúng USDT đã lưu khi confirm (không tính lại)
    if dep.usdt_amount is None:
        # dữ liệu confirm không đầy đủ => không duyệt
        raise ValueError("usdt_amount_missing")
    usdt_amt = Decimal(dep.usdt_amount).quantize(Q6, rounding=ROUND_DOWN)
    if usdt_amt <= 0:
        raise ValueError("usdt_amount_invalid")

    # 3) Khóa/lấy ví funding
    wal: Wallet | None = (
        db.query(Wallet)
        .filter(Wallet.user_id == dep.user_id, Wallet.wallet_type_id == FUNDING_TYPE_ID)
        .with_for_update(nowait=False, of=Wallet)
        .one_or_none()
    )
    if not wal:
        wal = Wallet(user_id=dep.user_id, wallet_type_id=FUNDING_TYPE_ID)
        db.add(wal)
        db.flush()

    # 4) Cộng số dư ví funding (đang sử dụng làm số dư USDT)
    cur = Decimal(wal.balance or 0)
    wal.balance = (cur + usdt_amt).quantize(Q6, rounding=ROUND_DOWN)

    # 5) Cập nhật deposit -> credited
    now = datetime.utcnow()
    dep.approved_by = admin_user_id
    dep.approved_at = now
    dep.credited_at = now
    dep.status = "credited"

    db.commit()
    db.refresh(dep)
    return dep

#Hủy yêu cầu nạp tiền
def admin_reject(
    db: Session, *, deposit_id: int, reason: str | None, admin_user_id: int
) -> Deposit:
    # Khóa hàng chống race-condition
    dep: Deposit | None = (
        db.query(Deposit)
        .filter(Deposit.id == deposit_id)
        .with_for_update(nowait=False, of=Deposit)
        .one_or_none()
    )
    if not dep:
        raise ValueError("not_found")

    # Idempotent: nếu không còn pending, trả lại hiện trạng
    if dep.status != "pending":
        return dep

    dep.status = "rejected"
    dep.rejected_reason = (reason or dep.rejected_reason)
    dep.approved_by = admin_user_id
    dep.approved_at = datetime.utcnow()

    db.commit()
    db.refresh(dep)
    return dep