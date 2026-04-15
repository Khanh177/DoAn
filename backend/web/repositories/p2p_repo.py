from __future__ import annotations

import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Optional

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import String, cast, func, or_
from sqlalchemy.orm import Session, joinedload

from ..models.models import Wallet, P2PPost, P2PTrade, User
from ..database import SessionLocal
from ..schemas import p2p as p2p_schemas

logger = logging.getLogger("p2p.repo")

FUNDING_WALLET_TYPE_ID = 1
P2P_FEE_RATE = Decimal("0.005")


# ========= HÀM PHỤ =========


def _get_funding_wallet(db: Session, user_id: int) -> Optional[Wallet]:
    return (
        db.query(Wallet)
        .filter(
            Wallet.user_id == user_id,
            Wallet.wallet_type_id == FUNDING_WALLET_TYPE_ID,
        )
        .first()
    )


def _generate_random_code() -> str:
    """
    Tạo mã 12 chữ số ngẫu nhiên
    """
    import random

    return "".join([str(random.randint(0, 9)) for _ in range(12)])

def get_available_gold_for_p2p(db: Session, user_id: int) -> Decimal:
    wallet = _get_funding_wallet(db, user_id)
    if not wallet:
        return Decimal("0")

    total_gold = Decimal(wallet.gold_world_balance or 0)

    # CHỈ TRỪ vàng đang bị khóa trong lệnh BÁN đang chờ
    locked = db.query(func.coalesce(func.sum(P2PTrade.quantity), 0))\
        .join(P2PPost, P2PTrade.post_id == P2PPost.id)\
        .filter(
            P2PPost.user_id == user_id,
            P2PPost.trade_type == "sell",
            P2PTrade.status.in_(["waiting_payment", "paid"])
        ).scalar()

    available = total_gold - Decimal(locked)
    return max(available, Decimal("0"))

# ========= POST (ADVERT) =========
def create_post(
    db: Session,
    user: User,
    data: p2p_schemas.P2PPostCreate,
) -> P2PPost:
    """
    Nếu trade_type = 'sell' thì chỉ cho đăng trong phạm vi vàng khả dụng:
        available = total_gold - gold_in_posts - gold_in_trades
    Không đụng vào cột trong bảng wallet.
    """
    wallet = _get_funding_wallet(db, user.id)
    if wallet is None:
        raise ValueError("WALLET_NOT_FOUND")

    total_quantity = Decimal(data.total_quantity)

    if data.trade_type == "sell":
        available = get_available_gold_for_p2p(db, user.id)
        if available < total_quantity:
            raise ValueError("INSUFFICIENT_AVAILABLE_GOLD")

    now = datetime.utcnow()

    post = P2PPost(
        user_id=user.id,
        trade_type=data.trade_type,
        gold_type=data.gold_type,
        price_vnd=Decimal(data.price_vnd),
        total_quantity=total_quantity,
        remaining_quantity=total_quantity,
        allow_partial_fill=getattr(data, "allow_partial_fill", True),
        min_amount_vnd=Decimal(data.min_amount_vnd),
        max_amount_vnd=Decimal(data.max_amount_vnd),
        bank_name=data.bank_name,
        bank_account_number=data.bank_account_number,
        bank_account_name=data.bank_account_name,
        transfer_note_template="",
        status="active",
        created_at=now,
        updated_at=now,
    )

    db.add(post)
    db.flush()

    # Tạo nội dung chuyển khoản tự động (12 chữ số ngẫu nhiên)
    post.transfer_note_template = _generate_random_code()

    db.commit()
    db.refresh(post)
    return post


def list_active_posts(
    db: Session,
    trade_type: str,
) -> List[P2PPost]:
    """
    Trả về tất cả bài đăng active (cho người khác xem)
    """
    return (
        db.query(P2PPost)
        .options(joinedload(P2PPost.user))
        .filter(
            P2PPost.trade_type == trade_type,
            P2PPost.status == "active",
        )
        .all()
    )


def list_my_posts(
    db: Session,
    user_id: int,
    trade_type: str,
) -> List[P2PPost]:
    """
    Trả về tất cả bài đăng của user (cả active và inactive)
    """
    return (
        db.query(P2PPost)
        .options(joinedload(P2PPost.user))
        .filter(
            P2PPost.user_id == user_id,
            P2PPost.trade_type == trade_type,
        )
        .all()
    )


def get_post_by_id(db: Session, post_id: int) -> Optional[P2PPost]:
    return db.query(P2PPost).filter(P2PPost.id == post_id).first()

def delete_post(db: Session, post: P2PPost) -> None:
    # KIỂM TRA CÓ GIAO DỊCH NÀO DÍNH VÀO POST NÀY KHÔNG
    has_trades = (
        db.query(P2PTrade.id)
        .filter(P2PTrade.post_id == post.id)
        .first()  # chỉ cần 1 bản ghi là đủ
    )
    
    if has_trades:
        raise ValueError("CANNOT_DELETE_POST_WITH_TRADES")

    db.delete(post)
    db.commit()

def admin_block_post(db: Session, post: P2PPost) -> P2PPost:
    post.status = "inactive"
    post.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(post)
    return post


# ========= TRADE (GIAO DỊCH) =========
def create_trade(
    db: Session,
    taker: User,
    data: p2p_schemas.P2PTradeCreate,
) -> P2PTrade:
    """
    ESCROW:
    - Lock post bằng cách giảm remaining_quantity.
    - Nếu hết remaining_quantity → post.status = 'completed'.

    Mapping buyer/seller (THEO LOGIC ĐANG DÙNG):

      - Post type = 'buy':
            User A đăng bài "Mua vàng"  (post.trade_type = 'buy')
            User B vào khớp → User B là BUYER, User A là SELLER

            => buyer_id  = taker.id
               seller_id = post.user_id

      - Post type = 'sell':
            User A đăng bài "Bán vàng" (post.trade_type = 'sell')
            User B vào khớp → User B là SELLER, User A là BUYER

            => buyer_id  = post.user_id
               seller_id = taker.id
    """
    post = (
        db.query(P2PPost)
        .filter(P2PPost.id == data.post_id)
        .with_for_update()
        .first()
    )

    if not post or post.status != "active":
        raise ValueError("POST_NOT_AVAILABLE")

    quantity = Decimal(data.quantity)
    total_amount = Decimal(data.total_amount_vnd)
    fee_rate = Decimal(data.fee_rate)

    # ===== MAPPING buyer/seller =====
    if post.trade_type == "buy":
        # Bài "Mua vàng" → người vào khớp là BUYER, người đăng bài là SELLER
        buyer_id = taker.id
        seller_id = post.user_id
        # seller là chủ post → vàng của seller đã bị "khóa" gián tiếp
        # bằng total_gold - gold_in_posts - gold_in_trades, nên không cần check thêm ở đây
    elif post.trade_type == "sell":
        # Bài "Bán vàng" → người đăng bài là BUYER, người vào khớp là SELLER
        buyer_id = post.user_id
        seller_id = taker.id

        # ✅ THIẾU LOGIC TRƯỚC ĐÂY: taker là SELLER → phải check vàng khả dụng
        available = get_available_gold_for_p2p(db, taker.id)
        if available < quantity:
            # không đủ vàng khả dụng để bán
            raise ValueError("INSUFFICIENT_AVAILABLE_GOLD_SELLER")
    else:
        raise ValueError("INVALID_POST_TYPE")

    # ===== VALIDATION SỐ LƯỢNG & KHOẢNG TIỀN =====
    if post.remaining_quantity < quantity:
        raise ValueError("INSUFFICIENT_POST_QUANTITY")

    if total_amount < post.min_amount_vnd or total_amount > post.max_amount_vnd:
        raise ValueError("TOTAL_OUT_OF_RANGE")

    # Cập nhật remaining_quantity cho post
    post.remaining_quantity -= quantity
    if post.remaining_quantity <= Decimal("0"):
        post.status = "completed"

    # Phí tính theo LƯỢNG VÀNG
    fee_gold = (quantity * fee_rate).quantize(Decimal("0.00001"))
    now = datetime.utcnow()

    trade_transfer_note = _generate_random_code()

    trade = P2PTrade(
        post_id=post.id,
        trade_code=_generate_random_code(),
        buyer_id=buyer_id,
        seller_id=seller_id,
        quantity=quantity,
        agreed_price_vnd=Decimal(data.agreed_price_vnd),
        total_amount_vnd=total_amount,
        # ⚠️ fee_vnd đang dùng để lưu LƯỢNG VÀNG PHÍ (không phải VND)
        fee_vnd=fee_gold,
        gold_type=post.gold_type,
        status="waiting_payment",
        created_at=now,
        bank_info=data.bank_info.dict() if getattr(data, "bank_info", None) else None,
        dispute_note=trade_transfer_note,
    )

    db.add(trade)
    db.commit()
    db.refresh(trade)
    return trade


def get_trade_by_id(
    db: Session,
    trade_id: int,
    with_relations: bool = False,
) -> Optional[P2PTrade]:
    query = db.query(P2PTrade)
    if with_relations:
        query = query.options(
            joinedload(P2PTrade.buyer),
            joinedload(P2PTrade.seller),
            joinedload(P2PTrade.post),
        )
    return query.filter(P2PTrade.id == trade_id).first()


def list_trades_for_user(
    db: Session,
    user_id: int,
) -> List[P2PTrade]:
    return (
        db.query(P2PTrade)
        .options(joinedload(P2PTrade.post))
        .filter(
            (P2PTrade.buyer_id == user_id)
            | (P2PTrade.seller_id == user_id)
        )
        .all()
    )


def list_pending_for_seller(
    db: Session,
    seller_id: int,
) -> List[P2PTrade]:
    """
    Giao dịch seller cần xử lý:
    ✅ FIX: Chỉ hiển thị 'paid' và 'disputed', KHÔNG hiển thị 'waiting_payment'
    """
    return (
        db.query(P2PTrade)
        .options(joinedload(P2PTrade.buyer))
        .filter(
            P2PTrade.seller_id == seller_id,
            P2PTrade.status.in_(["paid", "disputed"]),  # ✅ Bỏ waiting_payment
        )
        .all()
    )


def list_pending_for_buyer(
    db: Session,
    buyer_id: int,
) -> List[P2PTrade]:
    """
    Giao dịch buyer cần thanh toán / theo dõi:
    - waiting_payment: chưa chuyển khoản
    - disputed: đã thanh toán nhưng bị treo tranh chấp
    (khi buyer đã mark-paid thì trade chuyển sang 'paid' → chỉ seller thấy)
    """
    return (
        db.query(P2PTrade)
        .options(joinedload(P2PTrade.post))
        .filter(
            P2PTrade.buyer_id == buyer_id,
            P2PTrade.status.in_(["waiting_payment", "disputed"]),
        )
        .all()
    )


def buyer_mark_paid(
    db: Session,
    trade: P2PTrade,
) -> P2PTrade:
    """
    Buyer bấm 'Đã thanh toán':
    - status: waiting_payment → paid
    - paid_at = now
    - expires_at = now + 10 phút (deadline cho seller xác nhận)
    """
    if trade.status != "waiting_payment":
        raise ValueError("INVALID_STATUS")

    now = datetime.utcnow()
    trade.status = "paid"
    trade.paid_at = now
    trade.expires_at = now + timedelta(minutes=10)

    db.commit()
    db.refresh(trade)
    return trade


def seller_confirm_and_move_gold(
    db: Session,
    trade: P2PTrade,
) -> P2PTrade:
    """
    Seller tick 'Đã nhận tiền' => chuyển vàng giữa 2 ví funding.
    Phí P2P trừ bằng vàng:
      - Seller bị trừ đúng trade.quantity
      - Buyer chỉ được cộng trade.quantity * (1 - fee_rate)
      - quantity * fee_rate là phí (ra khỏi 2 ví người dùng)
    """
    seller_wallet = (
        db.query(Wallet)
        .filter(
            Wallet.user_id == trade.seller_id,
            Wallet.wallet_type_id == FUNDING_WALLET_TYPE_ID,
        )
        .with_for_update()
        .first()
    )

    buyer_wallet = (
        db.query(Wallet)
        .filter(
            Wallet.user_id == trade.buyer_id,
            Wallet.wallet_type_id == FUNDING_WALLET_TYPE_ID,
        )
        .with_for_update()
        .first()
    )

    if not seller_wallet or not buyer_wallet:
        raise ValueError("WALLET_NOT_FOUND")

    qty = Decimal(trade.quantity)

    # ✅ FIX: fee_vnd giờ là lượng vàng
    fee_qty = Decimal(trade.fee_vnd)
    net_qty = qty - fee_qty

    if net_qty < Decimal("0"):
        raise ValueError("INVALID_FEE_CONFIG")

    seller_balance = Decimal(seller_wallet.gold_world_balance or 0)
    buyer_balance = Decimal(buyer_wallet.gold_world_balance or 0)

    if seller_balance < qty:
        raise ValueError("NOT_ENOUGH_GOLD")

    seller_wallet.gold_world_balance = seller_balance - qty
    buyer_wallet.gold_world_balance = buyer_balance + net_qty

    trade.status = "completed"
    trade.confirmed_at = datetime.utcnow()

    db.commit()
    db.refresh(trade)
    return trade


def cancel_trade(
    db: Session,
    trade_id: int,
    cancelled_by: str,
) -> None:
    """
    Huỷ trade:
    - Trả quantity về remaining_quantity của post
    - status = 'cancelled'
    Chỉ huỷ được khi vẫn đang waiting_payment (buyer chưa bấm đã thanh toán).
    """
    trade = (
        db.query(P2PTrade)
        .filter(P2PTrade.id == trade_id)
        .with_for_update()
        .first()
    )

    if not trade or trade.status != "waiting_payment":
        raise ValueError("CANNOT_CANCEL")

    post = (
        db.query(P2PPost)
        .filter(P2PPost.id == trade.post_id)
        .with_for_update()
        .first()
    )

    if post:
        post.remaining_quantity += trade.quantity
        if post.status == "completed":
            post.status = "active"

    trade.status = "cancelled"
    trade.cancelled_by = cancelled_by
    trade.cancel_reason = "Timeout or manual cancel"

    db.commit()

def admin_list_posts(
    db: Session,
    trade_type: Optional[str],
    status: Optional[str],
    q: Optional[str],
    page: int,
    size: int,
):
    base = db.query(P2PPost).options(joinedload(P2PPost.user))

    if trade_type:
        base = base.filter(P2PPost.trade_type == trade_type)
    if status:
        base = base.filter(P2PPost.status == status)
    if q:
        if q.isdigit():
            base = base.filter(or_(
                P2PPost.bank_account_number.ilike(f"%{q}%"),
                P2PPost.user_id == int(q),
            ))
        else:
            base = base.filter(P2PPost.bank_account_name.ilike(f"%{q}%"))

    total = base.count()

    rows = (base
            .order_by(P2PPost.created_at.desc())
            .offset((page - 1) * size)
            .limit(size)
            .all())

    out = []
    for post in rows:
        user = post.user
        avail = get_available_gold_for_p2p(db, post.user_id)
        out.append((post, user, avail))
    return out, total

def admin_unblock_post(db: Session, post: P2PPost) -> P2PPost:
    post.status = "active"
    post.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(post)
    return post


def admin_delete_post(db: Session, post_id: int) -> bool:
    post = db.query(P2PPost).filter(P2PPost.id == post_id).first()
    if not post:
        return False
    # Không cho xóa nếu đã có trade (giống delete_post thường)
    has_trades = db.query(P2PTrade.id).filter(P2PTrade.post_id == post.id).first()
    if has_trades:
        return False
    db.delete(post)
    db.commit()
    return True


# Helper đóng gói P2PPostResponse (giống cách router đang làm)
def _to_post_response_with_available(db: Session, post: P2PPost) -> p2p_schemas.P2PPostResponse:
    user = post.user
    available_gold = get_available_gold_for_p2p(db, post.user_id)
    return p2p_schemas.P2PPostResponse(
        id=post.id,
        user_id=post.user_id,
        trade_type=post.trade_type,
        gold_type=post.gold_type,
        price_vnd=Decimal(post.price_vnd),
        min_amount_vnd=Decimal(post.min_amount_vnd),
        max_amount_vnd=Decimal(post.max_amount_vnd),
        total_quantity=Decimal(post.total_quantity),
        bank_name=post.bank_name,
        bank_account_number=post.bank_account_number,
        bank_account_name=post.bank_account_name,
        transfer_note_template=post.transfer_note_template or "",
        status=post.status,
        created_at=post.created_at,
        updated_at=post.updated_at,
        full_name=f"{getattr(user, 'last_name', '')} {getattr(user, 'first_name', '')}".strip() if user else "Không xác định",
        available_gold=float(available_gold or 0),
    )

def admin_list_trades(
    db: Session,
    status: Optional[str],
    q: Optional[str],
    page: int,
    size: int,
    sort_field: str = "created_at",
    sort_order: str = "desc",
):
    base = db.query(P2PTrade).options(
        joinedload(P2PTrade.post),
        joinedload(P2PTrade.buyer),
        joinedload(P2PTrade.seller),
    )

    if status:
        base = base.filter(P2PTrade.status == status)

    if q:
        q_raw = q.strip()
        like = f"%{q_raw}%"
        conds = [
            P2PTrade.trade_code.ilike(like),
            P2PTrade.dispute_note.ilike(like),  # nội dung chuyển khoản 12 số
            # Tìm chính xác trong bank_info.transfer_note (PostgreSQL)
            P2PTrade.bank_info.op('->>')('transfer_note').ilike(like),
        ]
        if q_raw.isdigit():
            try:
                uid = int(q_raw)
                conds.extend([P2PTrade.buyer_id == uid, P2PTrade.seller_id == uid])
            except:
                pass
        base = base.filter(or_(*conds))

    col = getattr(P2PTrade, sort_field, P2PTrade.created_at)
    base = base.order_by(col.asc() if sort_order == "asc" else col.desc())

    total = base.count()
    rows = base.offset((page - 1) * size).limit(size).all()
    return rows, total


# --- ADMIN: FORCE COMPLETE (duyệt cho buyer) ---
def admin_force_complete_trade(db: Session, trade_id: int) -> P2PTrade:
    trade = db.query(P2PTrade).filter(P2PTrade.id == trade_id).with_for_update().first()
    if not trade:
        raise ValueError("TRADE_NOT_FOUND")
    if trade.status in ("completed", "cancelled"):
        return trade
    # dùng logic chuyển vàng như seller_confirm_and_move_gold nhưng nới lỏng trạng thái
    return seller_confirm_and_move_gold(db, trade)


# --- ADMIN: FORCE CANCEL (hoàn về seller, trả quantity về post nếu còn) ---
def admin_force_cancel_trade(db: Session, trade_id: int, reason: str = "Admin cancel") -> P2PTrade:
    trade = db.query(P2PTrade).filter(P2PTrade.id == trade_id).with_for_update().first()
    if not trade:
        raise ValueError("TRADE_NOT_FOUND")
    if trade.status in ("completed", "cancelled"):
        return trade

    post = db.query(P2PPost).filter(P2PPost.id == trade.post_id).with_for_update().first()
    if post:
        post.remaining_quantity += trade.quantity
        if post.status == "completed":
            post.status = "active"

    trade.status = "cancelled"
    trade.cancelled_by = "admin"
    trade.cancel_reason = reason
    db.commit()
    db.refresh(trade)
    return trade

def auto_cancel_expired_trades() -> None:
    """
    Chạy mỗi 1 phút:

    1) Buyer timeout (waiting_payment): Kiểm tra created_at + 10 phút
       → HUỶ trade, trả quantity
    2) Seller timeout (paid): Kiểm tra paid_at + 10 phút
       → chuyển trade sang 'disputed'
    """
    db = SessionLocal()
    try:
        now = datetime.utcnow()

        # 1) Buyer không thanh toán kịp (10 phút kể từ created_at)
        expired_waiting: List[P2PTrade] = (
            db.query(P2PTrade)
            .filter(
                P2PTrade.status == "waiting_payment",
            )
            .all()
        )

        for trade in expired_waiting:
            try:
                # ✅ FIX: Kiểm tra deadline từ created_at
                deadline = trade.created_at + timedelta(minutes=10)
                if now >= deadline:
                    cancel_trade(db, trade.id, cancelled_by="system")
                    logger.info("Auto-cancelled trade %s (buyer timeout)", trade.id)
            except Exception as e:
                logger.error("Failed to cancel trade %s: %s", trade.id, e)
                db.rollback()

        # 2) Buyer đã thanh toán nhưng seller không xác nhận kịp (10 phút kể từ paid_at)
        expired_paid: List[P2PTrade] = (
            db.query(P2PTrade)
            .filter(
                P2PTrade.status == "paid",
                P2PTrade.paid_at.isnot(None),
            )
            .all()
        )

        for trade in expired_paid:
            try:
                # ✅ FIX: Kiểm tra deadline từ paid_at
                deadline = trade.paid_at + timedelta(minutes=10)
                if now >= deadline:
                    trade.status = "disputed"
                    trade.cancelled_by = "system"
                    trade.cancel_reason = "Seller timeout after buyer paid"
                    db.commit()
                    logger.info("Marked trade %s as disputed (seller timeout)", trade.id)
            except Exception as e:
                logger.error("Failed to mark trade %s disputed: %s", trade.id, e)
                db.rollback()

    finally:
        db.close()


scheduler = BackgroundScheduler()
scheduler.add_job(auto_cancel_expired_trades, "interval", minutes=1)