from sqlalchemy.orm import Session
from ..models.models import User, Wallet, WalletType, UserRole

def get(db: Session, user_id: int) -> User | None:
    return db.query(User).filter(User.id == user_id).first()

#Kiểm tra username đã tồn tại chưa
def get_by_username(db: Session, username: str):
    return db.query(User).filter(User.username == username).first()

#Tạo user mới cho đăng ký
def create(db: Session, *, username: str, password_hash: str, first_name: str, last_name: str) -> User:
    u = User(
        username=username, 
        password=password_hash,
        first_name=first_name,
        last_name=last_name
    )
    db.add(u)
    db.flush()
    db.refresh(u)
    return u

def create_wallets_for_user(db: Session, user_id: int):
    wtypes = db.query(WalletType).all()
    for wt in wtypes:
        db.add(Wallet(user_id=user_id, wallet_type_id=wt.id))
    db.flush()

def limit_password_length(password: str) -> bool:
    return len(password) <= 30

def limit_username_length(username: str) -> bool:
    return len(username) <= 50

#Lấy danh sách role user
def get_role_users(db: Session, skip: int = 0, limit: int = 100) -> list[UserRole]:
    return db.query(UserRole).order_by(UserRole.id.asc()).offset(skip).limit(limit).all()

#Lấy danh sách users
def get_all_users(db: Session, skip: int = 0, limit: int = 100) -> list[User]:
    return db.query(User).order_by(User.id.desc()).offset(skip).limit(limit).all()

#Thêm thông tin user mới cho admin
def create_user(db: Session, *, username: str, password_hash: str, first_name: str, last_name: str, role_id: int | None = None) -> User:
    u = User(username=username, password=password_hash, first_name=first_name, last_name=last_name, role_id=role_id or 2)
    db.add(u)
    db.flush()
    db.refresh(u)
    return u

ALLOWED_UPDATE_FIELDS = {"first_name", "last_name", "role_id"}
#Chỉnh sửa thông tin user admin
def update_user(db: Session, user_id: int, **fields) -> User | None:
    u = get(db, user_id)
    if not u:
        return None
    for k, v in fields.items():
        if k in ALLOWED_UPDATE_FIELDS and v is not None:
            setattr(u, k, v)
    db.flush()
    db.refresh(u)
    return u

#Chặn user admin
def block_user(db: Session, user_id: int) -> bool:
    u = get(db, user_id)
    if not u:
        return False
    if u.banned != 1:          
        u.banned = 1          
        db.flush()
    return True

#Bỏ chặn user admin
def unblock_user(db: Session, user_id: int) -> bool:
    u = get(db, user_id)
    if not u:
        return False
    if u.banned != 0:
        u.banned = 0          
        db.flush()
    return True
