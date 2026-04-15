# backend/web/repositories/complaint_repo.py
from __future__ import annotations

import logging
from datetime import datetime
from random import randint
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc

from ..models.models import (
    Complaint,
    ComplaintMessage,
    ComplaintAttachment,
    ComplaintReadStatus,
)
from ..models.models import User
from ..schemas import complaint as complaint_schemas

logger = logging.getLogger("complaint.repo")


# --------- helper tạo ticket_code ---------
def generate_ticket_code() -> str:
    """
    Sinh ticket_code dạng: CPYYYYMMDDxxxx
    Ví dụ: CP202511240123
    """
    now = datetime.utcnow()
    suffix = randint(0, 9999)
    return f"CP{now:%Y%m%d}{suffix:04d}"


def create_complaint(
    db: Session,
    user: User,
    data: complaint_schemas.ComplaintCreate,
) -> Complaint:
    """
    Tạo complaint mới + message đầu tiên.
    """
    ticket_code = generate_ticket_code()
    logger.info(
        "Creating complaint ticket_code=%s user_id=%s related_type=%s related_id=%s",
        ticket_code,
        user.id,
        data.related_type,
        data.related_id,
    )

    complaint = Complaint(
        ticket_code=ticket_code,
        user_id=user.id,
        related_type=data.related_type,
        related_id=data.related_id,
        title=data.title,
        priority=data.priority,
    )
    db.add(complaint)
    db.flush()  # để có complaint.id

    # tạo message đầu tiên
    msg_in = data.first_message
    message = ComplaintMessage(
        complaint_id=complaint.id,
        sender_id=user.id,
        sender_role="user",
        message=msg_in.message,
        is_internal=msg_in.is_internal,
    )
    db.add(message)
    db.flush()

    # attachments nếu có
    for att in msg_in.attachments:
        db.add(
            ComplaintAttachment(
                message_id=message.id,
                file_url=att.file_url,
                file_type=att.file_type,
                file_size=att.file_size,
            )
        )

    # cập nhật last_message_at
    complaint.last_message_at = datetime.utcnow()

    # khởi tạo read status cho user (đã đọc tới message mới nhất)
    rs = ComplaintReadStatus(
        complaint_id=complaint.id,
        user_id=user.id,
        last_read_message_id=message.id,
    )
    db.add(rs)

    db.commit()
    db.refresh(complaint)
    logger.info("Created complaint id=%s ticket_code=%s", complaint.id, complaint.ticket_code)
    return complaint


def get_complaint_by_id(db: Session, complaint_id: int) -> Optional[Complaint]:
    """
    Lấy complaint theo id (không check quyền).
    """
    return db.query(Complaint).filter(Complaint.id == complaint_id).first()


def list_complaints_for_user(
    db: Session,
    user_id: int,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
) -> List[Complaint]:
    """
    Lấy danh sách complaint của 1 user, sort theo last_message_at desc.
    """
    q = db.query(Complaint).filter(Complaint.user_id == user_id)
    if status:
        q = q.filter(Complaint.status == status)

    q = q.order_by(desc(Complaint.last_message_at)).offset(skip).limit(limit)
    items = q.all()
    logger.info(
        "List complaints for user_id=%s status=%s skip=%s limit=%s -> %s items",
        user_id,
        status,
        skip,
        limit,
        len(items),
    )
    return items


def list_complaints_for_admin(
    db: Session,
    status: Optional[str] = None,
    assigned_to: Optional[int] = None,
    skip: int = 0,
    limit: int = 50,
) -> List[Complaint]:
    """
    Lấy danh sách complaint cho admin.
    Có thể filter theo status, assigned_to.
    """
    q = db.query(Complaint)

    if status:
        q = q.filter(Complaint.status == status)

    if assigned_to is not None:
        q = q.filter(Complaint.assigned_to == assigned_to)

    q = q.order_by(desc(Complaint.last_message_at)).offset(skip).limit(limit)
    items = q.all()
    logger.info(
        "List complaints for admin status=%s assigned_to=%s skip=%s limit=%s -> %s items",
        status,
        assigned_to,
        skip,
        limit,
        len(items),
    )
    return items


def add_message_to_complaint(
    db: Session,
    complaint: Complaint,
    sender: User,
    msg_in: complaint_schemas.ComplaintMessageCreate,
    sender_role: str,
) -> ComplaintMessage:
    """
    Thêm 1 message vào complaint.
    - Tạo bản ghi message + attachments
    - Cập nhật last_message_at
    - Reset read status (người gửi đã đọc, phía còn lại chưa)
    """
    logger.info(
        "Add message complaint_id=%s sender_id=%s sender_role=%s",
        complaint.id,
        sender.id,
        sender_role,
    )

    message = ComplaintMessage(
        complaint_id=complaint.id,
        sender_id=sender.id,
        sender_role=sender_role,
        message=msg_in.message,
        is_internal=msg_in.is_internal,
    )
    db.add(message)
    db.flush()

    for att in msg_in.attachments:
        db.add(
            ComplaintAttachment(
                message_id=message.id,
                file_url=att.file_url,
                file_type=att.file_type,
                file_size=att.file_size,
            )
        )

    # cập nhật last_message_at
    complaint.last_message_at = datetime.utcnow()

    # cập nhật read status cho người gửi: đã đọc tới message mới nhất
    rs = (
        db.query(ComplaintReadStatus)
        .filter(
            ComplaintReadStatus.complaint_id == complaint.id,
            ComplaintReadStatus.user_id == sender.id,
        )
        .first()
    )
    if not rs:
        rs = ComplaintReadStatus(
            complaint_id=complaint.id,
            user_id=sender.id,
            last_read_message_id=message.id,
        )
        db.add(rs)
    else:
        rs.last_read_message_id = message.id
        rs.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(message)
    logger.info("Added message id=%s to complaint_id=%s", message.id, complaint.id)
    return message


def mark_complaint_read(
    db: Session,
    complaint: Complaint,
    user: User,
    last_message_id: Optional[int] = None,
) -> ComplaintReadStatus:
    """
    Đánh dấu user đã đọc complaint tới message id nào.
    Nếu last_message_id = None thì lấy message mới nhất.
    """
    logger.info(
        "Mark complaint read complaint_id=%s user_id=%s last_message_id=%s",
        complaint.id,
        user.id,
        last_message_id,
    )

    q = db.query(ComplaintMessage).filter(ComplaintMessage.complaint_id == complaint.id)
    if last_message_id:
        q = q.filter(ComplaintMessage.id <= last_message_id)
    # message mới nhất phù hợp filter
    latest_msg = q.order_by(desc(ComplaintMessage.id)).first()
    if not latest_msg:
        # không có message -> vẫn tạo/giữ read status nhưng last_read_message_id = None
        last_id = None
    else:
        last_id = latest_msg.id

    rs = (
        db.query(ComplaintReadStatus)
        .filter(
            ComplaintReadStatus.complaint_id == complaint.id,
            ComplaintReadStatus.user_id == user.id,
        )
        .first()
    )
    if not rs:
        rs = ComplaintReadStatus(
            complaint_id=complaint.id,
            user_id=user.id,
            last_read_message_id=last_id,
        )
        db.add(rs)
    else:
        rs.last_read_message_id = last_id
        rs.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(rs)
    return rs
