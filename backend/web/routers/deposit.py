from decimal import Decimal, ROUND_DOWN
from typing import Literal, Optional
from fastapi import HTTPException, Query, Depends, Header, APIRouter, Request, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
import logging

from ..services.fx_service import vnd_per_usdt, FxError
from ..repositories.deposit import (
    admin_reject,
    gen_deposit_code,
    create_pending_with_code,  
    admin_approve_and_credit,
)
from ..schemas.deposit import (
    DepositCodeOut,
    DepositConfirmIn,
    DepositOut,
    DepositListOut,
    AdminDepositOut,
    AdminDepositListOut,
    RejectIn,
)
from ..models.models import Deposit, User
from sqlalchemy import func
from sqlalchemy.orm import aliased
from ..database import get_db
from ..core.deps import get_current_user, require_role_ids
from ..realtime.ws_manager import manager_domestic

router = APIRouter(prefix="/deposit", tags=["deposit"])
logger = logging.getLogger("api.deposit")

# ---------- Tỷ giá ----------
@router.get("/usd-vnd")
def usd_vnd(_: Request):
    try:
        rate = vnd_per_usdt()
        logger.info("Lấy tỷ giá USD/VND thành công: %s", rate)
        return {"usd_vnd": str(rate)}
    except FxError as e:
        logger.error("Không lấy được tỷ giá USD/VND: %s", repr(e))
        raise HTTPException(503, "fx_unavailable")

# ---------- Bước 1: sinh code (không ghi DB) ----------
@router.get("/code", response_model=DepositCodeOut)
def new_deposit_code(length: int = Query(10, ge=6, le=16)):
    code = gen_deposit_code(length)
    logger.info("Sinh mã nạp: %s", code)
    return {"deposit_code": code}

# ---------- Bước 2: user bấm “Đã chuyển” -> ghi DB ----------
@router.post("/confirm", response_model=DepositOut, status_code=201)
def confirm_deposit(
    data: DepositConfirmIn,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
    x_idempotency_key: str | None = Header(default=None, convert_underscores=False),
):
    logger.info(
        "Xác nhận nạp: user_id=%s, amount_vnd=%s, code=%s, channel=%s, idem=%s",
        user.id, data.amount_vnd, data.deposit_code, data.channel, x_idempotency_key
    )
    try:
        dep = create_pending_with_code(
            db,
            user_id=user.id,
            amount_vnd=Decimal(data.amount_vnd),
            deposit_code=data.deposit_code,
            idempotency_key=x_idempotency_key,
        )
        if data.channel:
            dep.channel = data.channel

        # Tính rate_used & usdt_amount
        try:
            rate = vnd_per_usdt()  # VND cho 1 USDT
            dep.rate_used = rate
            if data.usdt_amount is not None:
                dep.usdt_amount = Decimal(data.usdt_amount).quantize(Decimal("0.000001"), rounding=ROUND_DOWN)
            else:
                dep.usdt_amount = (dep.amount_money / rate).quantize(Decimal("0.000001"), rounding=ROUND_DOWN)
        except FxError:
            if data.usdt_amount is not None:
                dep.usdt_amount = Decimal(data.usdt_amount).quantize(Decimal("0.000001"), rounding=ROUND_DOWN)
            else:
                dep.rate_used = None
                dep.usdt_amount = None

        db.commit()
        db.refresh(dep)
        logger.info("Xác nhận nạp thành công: id=%s, code=%s", dep.id, dep.deposit_code)
        return dep

    except IntegrityError:
        db.rollback()
        logger.warning("Mã nạp đã tồn tại hoặc idempotency_key trùng: code=%s", data.deposit_code)
        raise HTTPException(409, "deposit_code_already_used")
    except Exception as e:
        db.rollback()
        logger.exception("Lỗi xác nhận nạp: %s", repr(e))
        raise HTTPException(500, "confirm_failed")
    

# ---------- Danh sách nạp ----------
@router.get(
    "/list",
    response_model=AdminDepositListOut,
    dependencies=[Depends(require_role_ids(1))],
)
def admin_list_deposits(
    status: Optional[Literal["pending","approved","credited","rejected"]] = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    user_id: Optional[int] = Query(None),
    wallet_type_id: Optional[int] = Query(None),
    deposit_code: Optional[str] = Query(None), 
    db: Session = Depends(get_db),
):
    approver = aliased(User)

    q = (
        db.query(
            Deposit,
            func.coalesce(
                func.concat(approver.first_name, " ", approver.last_name), ""
            ).label("appr_name"),
        )
        .outerjoin(approver, Deposit.approved_by == approver.id)
    )

    if status:
        q = q.filter(Deposit.status == status)
    if user_id:
        q = q.filter(Deposit.user_id == user_id)
    if wallet_type_id:
        q = q.filter(Deposit.wallet_type_id == wallet_type_id)
    if deposit_code:  # <-- lọc theo mã nạp
        # nếu cột của bạn tên khác thì đổi lại
        q = q.filter(Deposit.deposit_code.ilike(f"%{deposit_code}%"))

    total = q.count()
    rows = (
        q.order_by(Deposit.updated_at.desc())
         .offset((page - 1) * size)
         .limit(size)
         .all()
    )

    items = []
    for dep, appr_name in rows:
        setattr(dep, "approved_by_name", (appr_name or "").strip() or None)
        items.append(dep)

    return {"items": items, "total": total}

# ---------- Duyệt nạp tiền ----------
@router.post("/{deposit_id}/approve", response_model=DepositOut,
             dependencies=[Depends(require_role_ids(1))])
def admin_approve_deposit(
    deposit_id: int,
    db: Session = Depends(get_db),
    admin = Depends(get_current_user),
    background: BackgroundTasks = None,
):
    dep = admin_approve_and_credit(db, deposit_id=deposit_id, admin_user_id=admin.id)

    # ĐÃ commit trong service -> dữ liệu ổn định, giờ mới bắn WS
    if dep.status == "credited":
        payload = {
            "type": "deposit_credited",
            "deposit_id": dep.id,
            "usdt_amount": str(dep.usdt_amount or "0"),
            "wallet_type_id": dep.wallet_type_id,
            "approved_at": dep.approved_at,
        }
        if background is not None:
            background.add_task(manager_domestic.send_to_user, dep.user_id, payload)

    return dep
    
# ---------- Hủy yêu cầu nạp tiền ----------
@router.post(
    "/{deposit_id}/reject",
    response_model=DepositOut,
    dependencies=[Depends(require_role_ids(1))],  # chỉ admin
)
def admin_reject_deposit(
    deposit_id: int,
    body: RejectIn,
    db: Session = Depends(get_db),
    admin = Depends(get_current_user),
):
    try:
        reason_text = (body.rejected_reason.strip() if body.rejected_reason else None)

        logging.info(
            f"🛑 Admin {admin.id} đang hủy lệnh nạp #{deposit_id} | "
            f"Lý do: {reason_text or 'Không có lý do'}"
        )

        dep = admin_reject(
            db,
            deposit_id=deposit_id,
            reason=reason_text,
            admin_user_id=admin.id,
        )

        logging.info(f"✅ Admin {admin.id} đã hủy thành công lệnh nạp #{deposit_id}")
        return dep

    except ValueError as e:
        msg = str(e)
        logging.error(f"❌ Lỗi khi admin {admin.id} hủy lệnh nạp #{deposit_id}: {msg}")
        if msg == "not_found":
            raise HTTPException(status_code=404, detail="not_found")
        raise HTTPException(status_code=400, detail="reject_failed")

# ---------- Lấy chi tiết ----------
@router.get("/{deposit_id}", response_model=DepositOut)
def get_deposit_detail(
    deposit_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    logger.info("Lấy chi tiết giao dịch nạp: user_id=%s, deposit_id=%s", user.id, deposit_id)
    dep = db.query(Deposit).filter(Deposit.id == deposit_id, Deposit.user_id == user.id).first()
    if not dep:
        logger.warning("Không tìm thấy giao dịch nạp: user_id=%s, deposit_id=%s", user.id, deposit_id)
        raise HTTPException(404, "not_found")
    return dep

# ---------- Danh sách nạp của từng người dùng ----------
@router.get("", response_model=DepositListOut)
def list_my_deposits(
    status: Optional[Literal["pending", "approved", "credited", "rejected"]] = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    logger.info("Liệt kê giao dịch nạp: user_id=%s, status=%s, page=%s, size=%s", user.id, status, page, size)
    q = db.query(Deposit).filter(Deposit.user_id == user.id)
    if status:
        q = q.filter(Deposit.status == status)
    total = q.count()
    items = q.order_by(Deposit.created_at.desc()).offset((page - 1) * size).limit(size).all()
    logger.info("Liệt kê xong: tổng=%s, số bản ghi trả về=%s", total, len(items))
    return {"items": items, "total": total}

# ---------- Đính kèm minh chứng (tùy chọn) ----------
@router.post("/{deposit_id}/evidence", response_model=DepositOut)
def attach_evidence(
    deposit_id: int,
    evidence_url: str = Query(...),
    reference_no: Optional[str] = None,
    db: Session = Depends(get_db),
    user = Depends(get_current_user),
):
    logger.info("Đính kèm bằng chứng: user_id=%s, deposit_id=%s, reference_no=%s", user.id, deposit_id, reference_no)
    dep = db.query(Deposit).filter(
        Deposit.id == deposit_id, Deposit.user_id == user.id, Deposit.status == "pending"
    ).first()
    if not dep:
        logger.warning("Không tìm thấy giao dịch hoặc không ở trạng thái pending: deposit_id=%s", deposit_id)
        raise HTTPException(404, "not_found_or_not_pending")

    dep.rejected_reason = reference_no or dep.rejected_reason  # tạm dùng như note
    db.commit()
    db.refresh(dep)
    logger.info("Cập nhật bằng chứng thành công: deposit_id=%s", deposit_id)
    return dep