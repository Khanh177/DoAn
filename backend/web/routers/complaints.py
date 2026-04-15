from __future__ import annotations

import logging
from datetime import datetime
from typing import List, Optional
from pathlib import Path
import os

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
    Query,
    UploadFile,
    File,
)
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from ..core.deps import get_current_user, require_role_ids
from ..database import get_db
from ..models.models import User, Complaint, ComplaintMessage
from ..schemas import complaint as complaint_schemas
from ..repositories import complaint_repo
from ..realtime.ws_complaints import complaint_ws_manager

router = APIRouter(prefix="/complaints", tags=["Complaints"])

logger = logging.getLogger("complaint.router")

BASE_UPLOAD_DIR = Path("public/uploads/complaints")
BASE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

COMPLAINT_UPLOAD_URL_PREFIX = "/uploads/complaints"


# --------- HTTP: tạo complaint mới ---------


@router.post(
    "",
    response_model=complaint_schemas.ComplaintOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_complaint(
    data: complaint_schemas.ComplaintCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    User tạo complaint mới + message đầu tiên.
    Bắn WS cho admin.
    """
    complaint = complaint_repo.create_complaint(db, user, data)

    try:
        await complaint_ws_manager.broadcast_to_admins(
            {
                "type": "ticket_created",
                "ticket_id": complaint.id,
            }
        )
    except Exception as exc:
        logger.exception(
            "WS ticket_created failed complaint_id=%s exc=%s",
            complaint.id,
            exc,
        )

    return complaint


# --------- HTTP: list complaint của user ---------


@router.get(
    "/my",
    response_model=List[complaint_schemas.ComplaintOut],
)
def list_my_complaints(
    status_filter: Optional[str] = Query(None, alias="status"),
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    items = complaint_repo.list_complaints_for_user(
        db=db,
        user_id=user.id,
        status=status_filter,
        skip=skip,
        limit=limit,
    )
    return items


# --------- HTTP: list complaint cho admin ---------


@router.get(
    "/admin",
    response_model=List[complaint_schemas.ComplaintOut],
)
def list_complaints_admin(
    status_filter: Optional[str] = Query(None, alias="status"),
    assigned_to: Optional[int] = Query(None),
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role_ids(1)),
):
    items = complaint_repo.list_complaints_for_admin(
        db=db,
        status=status_filter,
        assigned_to=assigned_to,
        skip=skip,
        limit=limit,
    )
    return items


@router.patch(
    "/admin/{complaint_id}",
    response_model=complaint_schemas.ComplaintOut,
)
async def update_complaint_admin(
    complaint_id: int,
    body: complaint_schemas.ComplaintAdminUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role_ids(1)),
):
    complaint = complaint_repo.get_complaint_by_id(db, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint không tồn tại")

    if body.status is not None:
        complaint.status = body.status
    if body.priority is not None:
        complaint.priority = body.priority
    if body.assigned_to is not None or body.assigned_to is None:
        complaint.assigned_to = body.assigned_to

    db.commit()
    db.refresh(complaint)

    # >>> tính admin_name cho output + WS
    admin_name = None
    if complaint.assigned_to:
        assignee = (
            db.query(User)
            .filter(User.id == complaint.assigned_to)
            .first()
        )
        if assignee:
            admin_name = f"{assignee.last_name} {assignee.first_name}"

    # gắn attribute tạm để ComplaintOut (orm_mode) map ra được
    setattr(complaint, "admin_name", admin_name)
    # <<<

    payload = {
        "type": "ticket_updated",
        "ticket_id": complaint.id,
        "status": complaint.status,
        "priority": complaint.priority,
        "assigned_to": complaint.assigned_to,
        "admin_name": admin_name,
    }

    try:
        await complaint_ws_manager.send_to_user(complaint.user_id, payload)
        await complaint_ws_manager.broadcast_to_admins(
            payload,
            except_admin_id=admin.id,
        )
    except Exception as exc:
        logger.exception(
            "WS ticket_updated failed complaint_id=%s exc=%s",
            complaint.id,
            exc,
        )

    return complaint

# --------- HTTP: upload file ---------


@router.post(
    "/upload",
    response_model=complaint_schemas.ComplaintUploadedFileOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_complaint_file(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    original_name = file.filename or "file"
    _, ext = os.path.splitext(original_name)
    ext = ext.lower()

    content_type = (file.content_type or "").lower()
    if content_type.startswith("image/"):
        file_type = "image"
    elif content_type.startswith("video/"):
        file_type = "video"
    elif content_type in ("application/pdf",):
        file_type = "pdf"
    else:
        file_type = "other"

    from uuid import uuid4

    ts = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    random_part = uuid4().hex[:8]
    new_name = f"{user.id}_{ts}_{random_part}{ext}"

    dest_path = BASE_UPLOAD_DIR / new_name

    file_size = 0
    try:
        with dest_path.open("wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                file_size += len(chunk)
                f.write(chunk)
    except Exception as exc:
        logger.exception(
            "Upload complaint file failed user_id=%s exc=%s",
            user.id,
            exc,
        )
        raise HTTPException(status_code=500, detail="Lỗi lưu file")

    file_url = f"{COMPLAINT_UPLOAD_URL_PREFIX}/{new_name}"

    logger.info(
        "Upload complaint file ok user_id=%s name=%s size=%s type=%s url=%s",
        user.id,
        original_name,
        file_size,
        file_type,
        file_url,
    )

    return complaint_schemas.ComplaintUploadedFileOut(
        file_url=file_url,
        file_type=file_type,
        file_size=file_size,
    )


@router.get(
    "/admin/assignees",
    response_model=List[complaint_schemas.ComplaintAssigneeOut],
)
def list_complaint_assignees(
    db: Session = Depends(get_db),
    admin: User = Depends(require_role_ids(1)),
):
    admins = db.query(User).filter(User.role_id == 1).all()
    return [
        complaint_schemas.ComplaintAssigneeOut(
            id=u.id,
            full_name=f"{u.last_name} {u.first_name}",
        )
        for u in admins
    ]


# --------- HTTP: lấy detail 1 complaint ---------


@router.get(
    "/{complaint_id}",
    response_model=complaint_schemas.ComplaintDetail,
)
def get_complaint_detail(
    complaint_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    complaint = complaint_repo.get_complaint_by_id(db, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint không tồn tại")

    if user.role_id != 1 and complaint.user_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="Không có quyền xem complaint này",
        )

    _ = complaint.messages

    return complaint


# --------- HTTP: lấy list message ---------
@router.get(
    "/{complaint_id}/messages",
    response_model=List[complaint_schemas.ComplaintMessageOut],
)
def list_complaint_messages(
    complaint_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    complaint = complaint_repo.get_complaint_by_id(db, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint không tồn tại")

    # chỉ user owner hoặc admin mới xem được
    if user.role_id != 1 and complaint.user_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="Không có quyền xem complaint này",
        )

    q = db.query(ComplaintMessage).filter(
        ComplaintMessage.complaint_id == complaint_id
    )

    # user không thấy ghi chú nội bộ
    if user.role_id != 1:
        q = q.filter(ComplaintMessage.is_internal == False)

    q = q.order_by(ComplaintMessage.created_at.asc())
    msgs = q.all()

    # ===== gán trạng thái đọc cho từng message =====
    # đặt tên field cho đúng với model của bạn
    user_last_read = getattr(complaint, "user_last_read_message_id", None) or 0
    admin_last_read = getattr(complaint, "admin_last_read_message_id", None) or 0

    result: List[complaint_schemas.ComplaintMessageOut] = []

    for m in msgs:
        status: Optional[str] = None

        # đang xem là USER -> quan tâm xem ADMIN đã đọc tin mình gửi chưa
        if user.role_id != 1 and m.sender_id == user.id:
            status = "read" if admin_last_read >= m.id else "sent"

        # đang xem là ADMIN -> quan tâm xem USER đã đọc tin mình gửi chưa
        if user.role_id == 1 and m.sender_id == user.id:
            status = "read" if user_last_read >= m.id else "sent"

        out = complaint_schemas.ComplaintMessageOut.from_orm(m)
        out.status = status
        result.append(out)

    return result

# --------- HTTP: thêm message (REST + WS) ---------


@router.post(
    "/{complaint_id}/messages",
    response_model=complaint_schemas.ComplaintMessageOut,
    status_code=status.HTTP_201_CREATED,
)
async def post_complaint_message(
    complaint_id: int,
    data: complaint_schemas.ComplaintMessageCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    complaint = complaint_repo.get_complaint_by_id(db, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint không tồn tại")

    if user.role_id != 1 and complaint.user_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="Không có quyền gửi message",
        )

    sender_role = "admin" if user.role_id == 1 else "user"
    msg = complaint_repo.add_message_to_complaint(
        db=db,
        complaint=complaint,
        sender=user,
        msg_in=data,
        sender_role=sender_role,
    )

    msg_out = complaint_schemas.ComplaintMessageOut.from_orm(msg)

    payload = {
        "type": "new_message",
        "complaint_id": complaint.id,
        "message": jsonable_encoder(msg_out),  
    }

    try:
        if sender_role == "user":
            await complaint_ws_manager.broadcast_to_admins(payload)
        else:
            if not getattr(msg, "is_internal", False):
                await complaint_ws_manager.send_to_user(complaint.user_id, payload)
            await complaint_ws_manager.broadcast_to_admins(
                payload,
                except_admin_id=user.id,
            )
    except Exception as exc:
        logger.exception(
            "WS new_message failed complaint_id=%s exc=%s",
            complaint.id,
            exc,
        )

    return msg_out


# --------- HTTP: đánh dấu đã đọc ---------


@router.post(
    "/{complaint_id}/read",
    response_model=complaint_schemas.ComplaintReadStatusOut,
)
async def mark_complaint_read_http(
    complaint_id: int,
    body: complaint_schemas.MarkComplaintReadRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    complaint = complaint_repo.get_complaint_by_id(db, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint không tồn tại")

    if user.role_id != 1 and complaint.user_id != user.id:
        raise HTTPException(status_code=403, detail="Không có quyền")

    rs = complaint_repo.mark_complaint_read(
        db=db,
        complaint=complaint,
        user=user,
        last_message_id=body.last_message_id,
    )

    payload = {
        "type": "ticket_read",
        "complaint_id": complaint.id,
        "by_role": "admin" if user.role_id == 1 else "user",
        "last_message_id": body.last_message_id,
    }

    try:
        if user.role_id == 1:
            await complaint_ws_manager.send_to_user(complaint.user_id, payload)
        else:
            await complaint_ws_manager.broadcast_to_admins(payload)
    except Exception as exc:
        logger.exception(
            "WS ticket_read failed complaint_id=%s exc=%s",
            complaint.id,
            exc,
        )

    return rs
