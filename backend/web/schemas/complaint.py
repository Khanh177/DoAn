from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ---------- Attachment ----------

class ComplaintAttachmentCreate(BaseModel):
    file_url: str = Field(..., max_length=500)
    file_type: str = Field(..., max_length=20)  # image, video, pdf...
    file_size: Optional[int] = None


class ComplaintAttachmentOut(BaseModel):
    id: int
    file_url: str
    file_type: str
    file_size: Optional[int]

    model_config = ConfigDict(from_attributes=True)


# ---------- Message ----------

class ComplaintMessageBase(BaseModel):
    message: Optional[str] = None
    is_internal: bool = False


class ComplaintMessageCreate(ComplaintMessageBase):
    # attachments gửi kèm theo message
    attachments: List[ComplaintAttachmentCreate] = []


class ComplaintMessageOut(BaseModel):
    id: int
    complaint_id: int
    sender_id: int
    sender_role: str
    sender_name: str 
    message: Optional[str]
    is_internal: bool
    created_at: datetime
    attachments: List[ComplaintAttachmentOut] = []
    status: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ---------- Complaint (ticket) ----------

class ComplaintBase(BaseModel):
    related_type: str = Field(..., pattern="^(p2p_trade|deposit|withdraw|other)$")
    related_id: Optional[int] = None
    title: str = Field(..., max_length=200)
    priority: str = Field("normal", pattern="^(low|normal|high|urgent)$")


class ComplaintCreate(ComplaintBase):
    # tin nhắn đầu tiên khi mở ticket
    first_message: ComplaintMessageCreate

class ComplaintOut(BaseModel):
    id: int
    ticket_code: str

    user_id: int
    user_name: str
    user_email: str

    related_type: str
    related_id: Optional[int]
    title: str
    status: str
    priority: str

    assigned_to: Optional[int]
    admin_name: Optional[str] = None

    unread_count: int = 0

    created_at: datetime
    updated_at: datetime
    closed_at: Optional[datetime]
    last_message_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ComplaintDetail(ComplaintOut):
    # trả về thêm danh sách message cho màn detail
    messages: List[ComplaintMessageOut] = []


# ---------- Read status ----------

class ComplaintReadStatusOut(BaseModel):
    complaint_id: int
    user_id: int
    last_read_message_id: Optional[int]
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MarkComplaintReadRequest(BaseModel):
    last_message_id: Optional[int] = None


class ComplaintUploadedFileOut(BaseModel):
    file_url: str
    file_type: str
    file_size: Optional[int]

    model_config = ConfigDict(from_attributes=True)


# ---------- Admin update / assignees ----------

class ComplaintAdminUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class ComplaintAssigneeOut(BaseModel):
    id: int
    full_name: str

    model_config = ConfigDict(from_attributes=True)
