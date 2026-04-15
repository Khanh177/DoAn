# backend/web/routers/p2p.py
from datetime import datetime
from decimal import Decimal
from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from ..realtime.ws_p2p_public import p2p_public_manager
from ..realtime.ws_p2p_user import p2p_user_manager
from ..core.deps import get_current_user
from ..database import get_db
from ..repositories import p2p_repo
from ..schemas import p2p as p2p_schemas
from ..services.p2p_broadcast import broadcast_trade_async

import logging

logger = logging.getLogger("p2p.router")

router = APIRouter(prefix="/p2p", tags=["P2P"])


@router.post(
    "/posts",
    response_model=p2p_schemas.P2PPostResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_p2p_post(
    data: p2p_schemas.P2PPostCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    try:
        post = p2p_repo.create_post(db, user, data)
    except ValueError as e:
        code = str(e)
        if code == "WALLET_NOT_FOUND":
            raise HTTPException(status_code=404, detail="Không tìm thấy ví funding")
        if code in ("NOT_ENOUGH_GOLD", "INSUFFICIENT_AVAILABLE_GOLD"):
            raise HTTPException(
                status_code=400, detail="Số vàng khả dụng không đủ để đăng bán"
            )
        if code == "NOT_ENOUGH_BALANCE":
            raise HTTPException(status_code=400, detail="Số dư không đủ để đăng mua")
        raise HTTPException(status_code=400, detail="Dữ liệu không hợp lệ")

    available_gold = p2p_repo.get_available_gold_for_p2p(db, user.id)

    resp = p2p_schemas.P2PPostResponse(
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
        transfer_note_template=post.transfer_note_template,
        status=post.status,
        created_at=post.created_at,
        updated_at=post.updated_at,
        full_name=f"{user.last_name} {user.first_name}".strip(),
        available_gold=float(available_gold),
    )

    await p2p_public_manager.broadcast(
        {
            "type": "p2p_post_updated",
            "post": jsonable_encoder(resp),
        }
    )

    return resp


@router.get("/posts", response_model=List[p2p_schemas.P2PPostResponse])
async def list_p2p_posts(
    trade_type: Literal["buy", "sell"],
    db: Session = Depends(get_db),
):
    posts = p2p_repo.list_active_posts(db, trade_type)
    results = []

    for post in posts:
        user = post.user
        available_gold = p2p_repo.get_available_gold_for_p2p(db, post.user_id)

        results.append(
            p2p_schemas.P2PPostResponse(
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
                transfer_note_template=post.transfer_note_template,
                status=post.status,
                created_at=post.created_at,
                updated_at=post.updated_at,
                full_name=f"{user.last_name} {user.first_name}".strip()
                if user
                else "Không xác định",
                available_gold=float(available_gold),
            )
        )
    return results


@router.get("/posts/my", response_model=List[p2p_schemas.P2PPostResponse])
async def list_my_p2p_posts(
    trade_type: Literal["buy", "sell"],
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    posts = p2p_repo.list_my_posts(db, user.id, trade_type)
    results = []

    for post in posts:
        available_gold = p2p_repo.get_available_gold_for_p2p(db, user.id)

        results.append(
            p2p_schemas.P2PPostResponse(
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
                transfer_note_template=post.transfer_note_template,
                status=post.status,
                created_at=post.created_at,
                updated_at=post.updated_at,
                full_name=f"{user.last_name} {user.first_name}".strip(),
                available_gold=float(available_gold),
            )
        )
    return results


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_p2p_post(
    post_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    post = p2p_repo.get_post_by_id(db, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài đăng")

    if post.user_id != user.id:
        raise HTTPException(status_code=403, detail="Không có quyền xóa")

    try:
        p2p_repo.delete_post(db, post)

        await p2p_public_manager.broadcast(
            {
                "type": "p2p_post_deleted",
                "id": post_id,
                "user_id": user.id,
                "trade_type": post.trade_type,
            }
        )

        return None

    except ValueError as e:
        if str(e) == "CANNOT_DELETE_POST_WITH_TRADES":
            raise HTTPException(
                status_code=400,
                detail="Không thể xóa bài đã có giao dịch. Vui lòng ẩn bài.",
            )
        raise


@router.put("/posts/{post_id}", response_model=p2p_schemas.P2PPostResponse)
async def update_p2p_post(
    post_id: int,
    data: p2p_schemas.P2PPostUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    post = p2p_repo.get_post_by_id(db, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài đăng")
    if post.user_id != user.id:
        raise HTTPException(status_code=403, detail="Không có quyền chỉnh sửa")

    post.price_vnd = Decimal(data.price_vnd)
    post.min_amount_vnd = Decimal(data.min_amount_vnd)
    post.max_amount_vnd = Decimal(data.max_amount_vnd)
    post.total_quantity = Decimal(data.total_quantity)
    post.bank_name = data.bank_name
    post.bank_account_number = data.bank_account_number
    post.bank_account_name = data.bank_account_name
    post.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(post)

    available_gold = p2p_repo.get_available_gold_for_p2p(db, user.id)

    resp = p2p_schemas.P2PPostResponse(
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
        transfer_note_template=post.transfer_note_template,
        status=post.status,
        created_at=post.created_at,
        updated_at=post.updated_at,
        full_name=f"{user.last_name} {user.first_name}".strip(),
        available_gold=float(available_gold),
    )

    await p2p_public_manager.broadcast(
        {
            "type": "p2p_post_updated",
            "post": jsonable_encoder(resp),
        }
    )

    return resp


@router.patch("/posts/{post_id}/status", response_model=p2p_schemas.P2PPostResponse)
async def toggle_post_status(
    post_id: int,
    data: p2p_schemas.P2PPostStatusUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    post = p2p_repo.get_post_by_id(db, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài đăng")
    if post.user_id != user.id:
        raise HTTPException(status_code=403, detail="Không có quyền thay đổi trạng thái")

    post.status = data.status
    post.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(post)

    available_gold = p2p_repo.get_available_gold_for_p2p(db, user.id)

    resp = p2p_schemas.P2PPostResponse(
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
        transfer_note_template=post.transfer_note_template,
        status=post.status,
        created_at=post.created_at,
        updated_at=post.updated_at,
        full_name=f"{user.last_name} {user.first_name}".strip(),
        available_gold=float(available_gold),
    )

    await p2p_public_manager.broadcast(
        {
            "type": "p2p_post_updated",
            "post": jsonable_encoder(resp),
        }
    )

    return resp


# ==================== TRADE ENDPOINTS ====================

@router.post("/trades", response_model=p2p_schemas.P2PTradeResponse, status_code=status.HTTP_201_CREATED)
async def create_p2p_trade(
    data: p2p_schemas.P2PTradeCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    post = p2p_repo.get_post_by_id(db, data.post_id)
    if not post or post.status != "active":
        raise HTTPException(status_code=404, detail="Bài đăng không tồn tại hoặc không còn active")
    if post.user_id == user.id:
        raise HTTPException(status_code=400, detail="Không thể tự giao dịch với chính mình")

    try:
        trade = p2p_repo.create_trade(db, user, data)
    except ValueError as e:
        code = str(e)
        if code in ("POST_NOT_AVAILABLE", "INSUFFICIENT_POST_QUANTITY", "TOTAL_OUT_OF_RANGE", "INSUFFICIENT_AVAILABLE_GOLD_SELLER"):
            raise HTTPException(status_code=400, detail=str(e).replace("_", " ").capitalize())
        raise HTTPException(status_code=400, detail="Dữ liệu không hợp lệ")

    # broadcast cho user + admin
    await broadcast_trade_async(trade, "p2p_trade_created")

    buyer = trade.buyer
    seller = trade.seller
    return p2p_schemas.P2PTradeResponse(
        id=trade.id, trade_code=trade.trade_code, post_id=trade.post_id,
        buyer_id=trade.buyer_id, seller_id=trade.seller_id,
        quantity=Decimal(trade.quantity), agreed_price_vnd=Decimal(trade.agreed_price_vnd),
        total_amount_vnd=Decimal(trade.total_amount_vnd), fee_vnd=Decimal(trade.fee_vnd),
        gold_type=trade.gold_type, status=trade.status, created_at=trade.created_at,
        paid_at=trade.paid_at, confirmed_at=trade.confirmed_at,
        bank_info=trade.bank_info, complaint=trade.dispute_note,
        buyer_name=f"{buyer.last_name} {buyer.first_name}".strip() if buyer else None,
        seller_name=f"{seller.last_name} {seller.first_name}".strip() if seller else None,
    )

@router.get(
    "/trades/pending/buyer",
    response_model=List[p2p_schemas.P2PTradeResponse],
)
async def list_pending_for_buyer(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    trades = p2p_repo.list_pending_for_buyer(db, user.id)
    results: List[p2p_schemas.P2PTradeResponse] = []

    for t in trades:
        seller = t.seller
        results.append(
            p2p_schemas.P2PTradeResponse(
                id=t.id,
                trade_code=t.trade_code,
                post_id=t.post_id,
                buyer_id=t.buyer_id,
                seller_id=t.seller_id,
                quantity=Decimal(t.quantity),
                agreed_price_vnd=Decimal(t.agreed_price_vnd),
                total_amount_vnd=Decimal(t.total_amount_vnd),
                fee_vnd=Decimal(t.fee_vnd),
                gold_type=t.gold_type,
                status=t.status,
                created_at=t.created_at,
                paid_at=t.paid_at,
                confirmed_at=t.confirmed_at,
                bank_info=t.bank_info,
                complaint=t.dispute_note,
                buyer_name=f"{user.last_name} {user.first_name}",
                seller_name=(
                    f"{seller.last_name} {seller.first_name}" if seller else None
                ),
            )
        )
    return results

@router.post("/trades/{trade_id}/mark-paid", response_model=p2p_schemas.P2PTradeResponse)
async def buyer_mark_paid_endpoint(
    trade_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    trade = p2p_repo.get_trade_by_id(db, trade_id, with_relations=True)
    if not trade:
        raise HTTPException(404, "Giao dịch không tồn tại")
    if trade.buyer_id != user.id:
        raise HTTPException(403, "Không phải người mua của giao dịch này")
    if trade.status != "waiting_payment":
        raise HTTPException(400, "Trạng thái hiện tại không cho phép đánh dấu đã thanh toán")

    try:
        trade = p2p_repo.buyer_mark_paid(db, trade)
    except ValueError:
        raise HTTPException(400, "Trạng thái hiện tại không cho phép đánh dấu đã thanh toán")

    await broadcast_trade_async(trade, "p2p_trade_paid")

    seller = trade.seller
    return p2p_schemas.P2PTradeResponse(
        id=trade.id, trade_code=trade.trade_code, post_id=trade.post_id,
        buyer_id=trade.buyer_id, seller_id=trade.seller_id,
        quantity=Decimal(trade.quantity), agreed_price_vnd=Decimal(trade.agreed_price_vnd),
        total_amount_vnd=Decimal(trade.total_amount_vnd), fee_vnd=Decimal(trade.fee_vnd),
        gold_type=trade.gold_type, status=trade.status, created_at=trade.created_at,
        paid_at=trade.paid_at, confirmed_at=trade.confirmed_at,
        bank_info=trade.bank_info, complaint=trade.dispute_note,
        buyer_name=f"{user.last_name} {user.first_name}",
        seller_name=f"{seller.last_name} {seller.first_name}" if seller else None,
    )

@router.get(
    "/trades/pending/seller",
    response_model=List[p2p_schemas.P2PTradeResponse],
)
async def list_pending_for_seller(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    trades = p2p_repo.list_pending_for_seller(db, user.id)
    results: List[p2p_schemas.P2PTradeResponse] = []

    for t in trades:
        buyer = t.buyer
        results.append(
            p2p_schemas.P2PTradeResponse(
                id=t.id,
                trade_code=t.trade_code,
                post_id=t.post_id,
                buyer_id=t.buyer_id,
                seller_id=t.seller_id,
                quantity=Decimal(t.quantity),
                agreed_price_vnd=Decimal(t.agreed_price_vnd),
                total_amount_vnd=Decimal(t.total_amount_vnd),
                fee_vnd=Decimal(t.fee_vnd),
                gold_type=t.gold_type,
                status=t.status,
                created_at=t.created_at,
                paid_at=t.paid_at,
                confirmed_at=t.confirmed_at,
                bank_info=t.bank_info,
                complaint=t.dispute_note,
                buyer_name=(
                    f"{buyer.last_name} {buyer.first_name}" if buyer else None
                ),
                seller_name=f"{user.last_name} {user.first_name}",
            )
        )
    return results


@router.post("/trades/{trade_id}/confirm", response_model=p2p_schemas.P2PTradeResponse)
async def seller_confirm_trade(
    trade_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    trade = p2p_repo.get_trade_by_id(db, trade_id, with_relations=True)
    if not trade:
        raise HTTPException(404, "Giao dịch không tồn tại")
    if trade.seller_id != user.id:
        raise HTTPException(403, "Không phải người bán của giao dịch này")
    if trade.status != "paid":
        raise HTTPException(400, "Chỉ xác nhận sau khi người mua đã thanh toán")

    try:
        trade = p2p_repo.seller_confirm_and_move_gold(db, trade)
    except ValueError as e:
        code = str(e)
        if code == "WALLET_NOT_FOUND":
            raise HTTPException(400, "Ví funding của người mua hoặc người bán không tồn tại")
        if code == "NOT_ENOUGH_GOLD":
            raise HTTPException(400, "Người bán không đủ vàng để hoàn tất giao dịch")
        raise HTTPException(400, "Không thể hoàn tất giao dịch")

    await broadcast_trade_async(trade, "p2p_trade_completed")

    buyer = trade.buyer
    return p2p_schemas.P2PTradeResponse(
        id=trade.id, trade_code=trade.trade_code, post_id=trade.post_id,
        buyer_id=trade.buyer_id, seller_id=trade.seller_id,
        quantity=Decimal(trade.quantity), agreed_price_vnd=Decimal(trade.agreed_price_vnd),
        total_amount_vnd=Decimal(trade.total_amount_vnd), fee_vnd=Decimal(trade.fee_vnd),
        gold_type=trade.gold_type, status=trade.status, created_at=trade.created_at,
        paid_at=trade.paid_at, confirmed_at=trade.confirmed_at,
        bank_info=trade.bank_info, complaint=trade.dispute_note,
        buyer_name=f"{buyer.last_name} {buyer.first_name}" if buyer else None,
        seller_name=f"{user.last_name} {user.first_name}",
    )



@router.get(
    "/trades/history",
    response_model=List[p2p_schemas.P2PTradeResponse],
)
async def list_trade_history(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    trades = p2p_repo.list_trades_for_user(db, user.id)
    results: List[p2p_schemas.P2PTradeResponse] = []

    for t in trades:
        buyer = t.buyer
        seller = t.seller
        results.append(
            p2p_schemas.P2PTradeResponse(
                id=t.id,
                trade_code=t.trade_code,
                post_id=t.post_id,
                buyer_id=t.buyer_id,
                seller_id=t.seller_id,
                quantity=Decimal(t.quantity),
                agreed_price_vnd=Decimal(t.agreed_price_vnd),
                total_amount_vnd=Decimal(t.total_amount_vnd),
                fee_vnd=Decimal(t.fee_vnd),
                gold_type=t.gold_type,
                status=t.status,
                created_at=t.created_at,
                paid_at=t.paid_at,
                confirmed_at=t.confirmed_at,
                bank_info=t.bank_info,
                complaint=t.dispute_note,
                buyer_name=(
                    f"{buyer.last_name} {buyer.first_name}" if buyer else None
                ),
                seller_name=(
                    f"{seller.last_name} {seller.first_name}" if seller else None
                ),
            )
        )
    return results

@router.post("/trades/{trade_id}/cancel")
async def cancel_trade_endpoint(
    trade_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    trade = p2p_repo.get_trade_by_id(db, trade_id, with_relations=True)
    if not trade:
        raise HTTPException(404, "Trade not found")

    is_buyer = trade.buyer_id == user.id
    is_seller = trade.seller_id == user.id
    if not (is_buyer or is_seller):
        raise HTTPException(403, "Not authorized")

    if is_buyer and trade.status != "waiting_payment":
        raise HTTPException(400, "Cannot cancel after paid")
    if is_seller:
        if trade.status != "waiting_payment":
            raise HTTPException(400, "Cannot cancel after buyer paid")
        time_elapsed = (datetime.utcnow() - trade.created_at).total_seconds() / 60
        if time_elapsed < 5:
            raise HTTPException(400, "Must wait 5 minutes before cancelling")

    try:
        p2p_repo.cancel_trade(db, trade.id, cancelled_by="buyer" if is_buyer else "seller")
    except ValueError as e:
        raise HTTPException(400, str(e))

    trade = p2p_repo.get_trade_by_id(db, trade_id, with_relations=True)
    await broadcast_trade_async(trade, "p2p_trade_cancelled")

    return {"message": "Trade cancelled successfully"}
