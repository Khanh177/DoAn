# routers/auth.py
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from psycopg2 import IntegrityError
from pydantic import EmailStr
from sqlalchemy.orm import Session

from backend.web.schemas.login import Login, TokenOut
from backend.web.schemas.otp import OTPResendRequest, OTPVerifyRequest
from backend.web.services.send_otp_email import send_otp_email
from ..database import get_db
from ..schemas.Register import Register
from ..schemas.users import AdminUserOut, RoleOut, UserOut, UserCreate, UserUpdate
from ..repositories import users as repo_users
from ..repositories import otp as otp_repo
from ..core.security import hash_password, verify_password, create_access_token
from ..core.deps import require_role_ids
import logging
import re

logger = logging.getLogger("auth")
router = APIRouter(prefix="/auth", tags=["auth"])

#Chức năng đăng ký người dùng
@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: Register, db: Session = Depends(get_db)):
    logger.info("Register: %s", payload.username)

    if repo_users.get_by_username(db, payload.username):
        logger.warning("Email exists: %s", payload.username)
        raise HTTPException(status_code=400, detail="Email đã tồn tại")

    #Kiểm tra độ dài mật khẩu
    if len(payload.password) > 30:
        logger.warning("Password too long: %s", payload.username)
        raise HTTPException(status_code=400, detail="Mật khẩu không được dài hơn 30 ký tự")

    if len(payload.password) < 8:
        logger.warning("Password too short: %s", payload.username)
        raise HTTPException(status_code=400, detail="Mật khẩu không được ngắn hơn 8 ký tự")

    #Kiểm tra độ mạnh của mật khẩu
    pattern = r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?\":{}|<>]).{8,20}$"
    if not re.match(pattern, payload.password):
        raise HTTPException(
            status_code=400,
            detail="Mật khẩu phải chứa ít nhất 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt"
        )
    
    try:
        user = repo_users.create(
            db,
            username=payload.username,
            password_hash=hash_password(payload.password),
            first_name=payload.first_name,
            last_name=payload.last_name,
        )
        repo_users.create_wallets_for_user(db, user.id)
        db.commit()
        logger.info("User %s created with wallets (id=%s)", user.username, user.id)
        return user
    except Exception as e:
        db.rollback()
        logger.exception("Register failed for %s: %s (%s)", payload.username, e, type(e).__name__)
        raise HTTPException(status_code=500, detail="Lỗi hệ thống, vui lòng thử lại sau")

#Đăng nhập (bước 1) cho người dùng
@router.post("/login", status_code=status.HTTP_200_OK)
def login_step1(payload: Login, db: Session = Depends(get_db)):
    logger.info("Login attempt: %s", payload.username)

    user = repo_users.get_by_username(db, payload.username)
    if not user:
        logger.warning("Login failed (not found): %s", payload.username)
        raise HTTPException(status_code=401, detail="Tài khoản không tồn tại")

    if user.banned == 1:
        logger.warning("Login blocked (banned): %s", payload.username)
        raise HTTPException(status_code=403, detail="Tài khoản đã bị khóa")

    if not verify_password(payload.password, user.password):
        logger.warning("Login failed (bad password): %s", payload.username)
        raise HTTPException(status_code=401, detail="Mật khẩu không chính xác")

    # Tạo & lưu OTP (hash) + gửi email
    otp_repo.create_and_send(
        db,
        user_id=user.id,
        user_email=user.username,           # email đăng nhập
        send_email_fn=send_otp_email        # hàm services.send_otp_email.send_otp_email
    )

    logger.info("OTP sent: %s (uid=%s)", payload.username, user.id)
    # Trả về user_id (hoặc request_id nếu bạn dùng)
    return {"message": "OTP đã được gửi", "user_id": user.id}

#Đăng nhập (bước 1) cho người dùng
@router.post("/login/admin", status_code=status.HTTP_200_OK)
def login_step1(payload: Login, db: Session = Depends(get_db)):
    logger.info("Login attempt: %s", payload.username)

    user = repo_users.get_by_username(db, payload.username)
    if not user:
        logger.warning("Login failed (not found): %s", payload.username)
        raise HTTPException(status_code=401, detail="Tài khoản không tồn tại")

    if user.banned == 1:
        logger.warning("Login blocked (banned): %s", payload.username)
        raise HTTPException(status_code=423, detail="Tài khoản đã bị khóa")

    if not verify_password(payload.password, user.password):
        logger.warning("Login failed (bad password): %s", payload.username)
        raise HTTPException(status_code=401, detail="Mật khẩu không chính xác")
    
    if user.role_id != 1:
        logger.warning("Login blocked (not admin): %s", payload.username)
        raise HTTPException(status_code=403, detail="Không có quyền truy cập")

    # Tạo & lưu OTP (hash) + gửi email
    otp_repo.create_and_send(
        db,
        user_id=user.id,
        user_email=user.username,           # email đăng nhập
        send_email_fn=send_otp_email        # hàm services.send_otp_email.send_otp_email
    )

    logger.info("OTP sent: %s (uid=%s)", payload.username, user.id)
    # Trả về user_id (hoặc request_id nếu bạn dùng)
    return {"message": "OTP đã được gửi", "user_id": user.id}

#Xác thực OTP (bước 2)
@router.post("/verify-otp", response_model=TokenOut)
def verify_otp(payload: OTPVerifyRequest, db: Session = Depends(get_db)):
    logger.info("Verify OTP for user_id=%s, otp=%s", payload.user_id, payload.otp)
    ok = otp_repo.verify(db, payload.user_id, payload.otp)
    if not ok:
        raise HTTPException(status_code=400, detail="OTP không đúng hoặc đã hết hạn")

    user = repo_users.get(db, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User không tồn tại")  # cần hàm get() trong repo_users
    
    token = create_access_token(sub=user.username, extra_claims={"uid": user.id, "role": user.role_id})
    logger.info("OTP verified & token issued: %s (uid=%s)", user.username, user.id)
    return {"username": user.username, "uid": user.id, "access_token": token, "token_type": "bearer"}

@router.post("/resend-otp")
def resend_otp(payload: OTPResendRequest, db: Session = Depends(get_db)):
    user = repo_users.get_by_username(db, payload.username)
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản")
    otp_repo.create_and_send(
        db,
        user_id=user.id,
        user_email=user.username,    
        send_email_fn=send_otp_email
    )
    return {"message": "Đã gửi lại OTP"}

#Lấy danh sách user
@router.get("", response_model=List[AdminUserOut])
def list_users(skip: int = Query(0, ge=0), limit: int = Query(18, ge=1, le=10000), db: Session = Depends(get_db)):
    return repo_users.get_all_users(db, skip=skip, limit=limit)

#Lấy danh sách role user
@router.get("/roles", response_model=List[RoleOut])
def list_roles(skip: int = Query(0, ge=0), limit: int = Query(18, ge=1, le=10000), db: Session = Depends(get_db)):
    return repo_users.get_role_users(db, skip=skip, limit=limit)

#Thêm user mới cho admin
@router.post("/add_user", response_model=AdminUserOut, status_code=status.HTTP_201_CREATED)
def add_new_user(payload: UserCreate, _admin=Depends(require_role_ids(1)), db: Session = Depends(get_db)):
    if repo_users.get_by_username(db, payload.username):
        raise HTTPException(status_code=400, detail="Email đã tồn tại")
    
    #Kiểm tra độ dài mật khẩu
    pattern = r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?\":{}|<>]).{8,30}$"
    if not re.match(pattern, payload.password):
        raise HTTPException(status_code=400, detail="Mật khẩu phải 8–30 ký tự và gồm chữ hoa, chữ thường, số, ký tự đặc biệt")
    try:
        user = repo_users.create_user(
            db,
            username=payload.username,
            password_hash=hash_password(payload.password),
            first_name=payload.first_name,
            last_name=payload.last_name,
            role_id=payload.role_id,
        )
        repo_users.create_wallets_for_user(db, user.id)
        db.commit()
        db.refresh(user)
        return user
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Username đã tồn tại")
    except Exception as e:
        db.rollback()
        logger.exception("Create user error: %s", str(e))
        raise HTTPException(status_code=500, detail="Lỗi khi tạo người dùng")

#Chỉnh sửa thông tin user cho admin
@router.put("/{user_id}", response_model=AdminUserOut, status_code=status.HTTP_200_OK)
def edit_user(user_id: int = Path(..., ge=1), payload: UserUpdate = ..., _admin=Depends(require_role_ids(1)), db: Session = Depends(get_db)):
    try:
        user = repo_users.update_user(db, user_id=user_id, first_name=payload.first_name, last_name=payload.last_name, role_id=payload.role_id)
        if not user:
            raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
        db.commit()
        db.refresh(user)
        return user
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Dữ liệu cập nhật không hợp lệ")
    except Exception as e:
        db.rollback()
        logger.exception("Edit user error: %s", str(e))
        raise HTTPException(status_code=500, detail="Lỗi khi chỉnh sửa người dùng")
    
#Chặn user admin
@router.post("/{user_id}/block", status_code=status.HTTP_200_OK)
def block_user_admin(user_id: int = Path(..., ge=1), _admin=Depends(require_role_ids(1)), db: Session = Depends(get_db)):
    try:
        ok = repo_users.block_user(db, user_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
        db.commit()
        return {"message": "Người dùng đã bị chặn"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.exception("Block user error: %s", str(e))
        raise HTTPException(status_code=500, detail="Lỗi khi chặn người dùng")
    
#Mở chặn user admin
@router.post("/{user_id}/unblock", status_code=status.HTTP_200_OK)
def unblock_user_admin(
    user_id: int = Path(..., ge=1),
    _admin=Depends(require_role_ids(1)),
    db: Session = Depends(get_db),
):
    try:
        ok = repo_users.unblock_user(db, user_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
        db.commit()
        return {"message": "Đã bỏ chặn người dùng"}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.exception("Unblock user error: %s", str(e))
        raise HTTPException(status_code=500, detail="Lỗi khi bỏ chặn người dùng")
