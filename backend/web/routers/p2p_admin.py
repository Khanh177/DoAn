# backend/web/routers/p2p_admin.py
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from decimal import Decimal
from datetime import datetime
from typing import List, Optional

from ..database import get_db
from ..core.deps import get_current_user, require_role_ids
from ..repositories import p2p_repo
from ..schemas import p2p as p2p_schemas
from ..realtime.ws_p2p_public import p2p_public_manager
from ..realtime.ws_p2p_admin import p2p_admin_manager
from fastapi.encoders import jsonable_encoder
from ..services.p2p_broadcast import broadcast_trade_async, _make_transfer_note

router = APIRouter(prefix="/p2p/admin", tags=["P2P-Admin"])

# Lấy danh sách bài P2P (admin có thể lọc + phân trang)
@router.get("/posts", response_model=p2p_schemas.P2PPostPage)
async def admin_list_posts(
    db: Session = Depends(get_db),
    _: dict = Depends(require_role_ids(1)),
    trade_type: Optional[str] = Query(None, pattern="^(buy|sell)$"),
    status: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="search by bank_account_name/number or user_id"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    rows, total = p2p_repo.admin_list_posts(db, trade_type, status, q, page, size)

    items: List[p2p_schemas.P2PPostResponse] = []
    for post, user, available_gold in rows:
        items.append(
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
                transfer_note_template=post.transfer_note_template or "",
                status=post.status,
                created_at=post.created_at,
                updated_at=post.updated_at,
                full_name=f"{getattr(user, 'last_name', '')} {getattr(user, 'first_name', '')}".strip() if user else "Không xác định",
                available_gold=float(available_gold or 0),
            )
        )
    return {"items": items, "total": total}


@router.patch("/posts/{post_id}/block", response_model=p2p_schemas.P2PPostResponse)
async def admin_block_post(
    post_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(require_role_ids(1)),
):
    post = p2p_repo.get_post_by_id(db, post_id)
    if not post:
        raise HTTPException(404, "Không tìm thấy bài đăng")
    post = p2p_repo.admin_block_post(db, post)
    # broadcast
    resp = p2p_repo._to_post_response_with_available(db, post)
    await p2p_public_manager.broadcast({"type": "p2p_post_updated", "post": jsonable_encoder(resp)})
    return resp


@router.patch("/posts/{post_id}/unblock", response_model=p2p_schemas.P2PPostResponse)
async def admin_unblock_post(
    post_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(require_role_ids(1)),
):
    post = p2p_repo.get_post_by_id(db, post_id)
    if not post:
        raise HTTPException(404, "Không tìm thấy bài đăng")
    post = p2p_repo.admin_unblock_post(db, post)
    # broadcast
    resp = p2p_repo._to_post_response_with_available(db, post)
    await p2p_public_manager.broadcast({"type": "p2p_post_updated", "post": jsonable_encoder(resp)})
    return resp


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(require_role_ids(1)),
):
    ok = p2p_repo.admin_delete_post(db, post_id)
    if not ok:
        raise HTTPException(404, "Không tìm thấy hoặc không xóa được (đã có giao dịch)")
    # broadcast
    await p2p_public_manager.broadcast({"type": "p2p_post_deleted", "id": post_id})
    return None

# -------- TRADES (mới) --------
@router.get("/trades", response_model=p2p_schemas.P2PTradePage)
async def admin_list_trades(
    db: Session = Depends(get_db),
    _: dict = Depends(require_role_ids(1)),
    status: Optional[str] = Query(None, description="waiting_payment|paid|confirmed|completed|cancelled|disputed"),
    q: Optional[str] = Query(None, description="search by trade_code or buyer_id/seller_id"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    sort_field: str = Query("created_at"),
    sort_order: str = Query("desc"),
):
    rows, total = p2p_repo.admin_list_trades(db, status, q, page, size, sort_field, sort_order)
    items = []
    for t in rows:
        items.append(p2p_schemas.P2PTradeResponse(
            id=t.id, trade_code=t.trade_code, post_id=t.post_id,
            buyer_id=t.buyer_id, seller_id=t.seller_id,
            quantity=t.quantity, agreed_price_vnd=t.agreed_price_vnd,
            total_amount_vnd=t.total_amount_vnd, fee_vnd=t.fee_vnd,
            gold_type=t.gold_type, status=t.status, created_at=t.created_at,
            paid_at=t.paid_at, confirmed_at=t.confirmed_at,
            bank_info=t.bank_info, complaint=t.dispute_note or t.complaint,
            transfer_note=_make_transfer_note(t),
            buyer_name=f"{getattr(t.buyer,'last_name','')} {getattr(t.buyer,'first_name','')}".strip() if t.buyer else None,
            seller_name=f"{getattr(t.seller,'last_name','')} {getattr(t.seller,'first_name','')}".strip() if t.seller else None,
        ))
    return {"items": items, "total": total}

@router.post("/trades/{trade_id}/force-complete", response_model=p2p_schemas.P2PTradeResponse)
async def admin_force_complete(
    trade_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(require_role_ids(1)),
):
    trade = p2p_repo.admin_force_complete_trade(db, trade_id)
    # broadcast realtime (user + admin)
    await broadcast_trade_async(trade, "p2p_trade_completed")

    return p2p_schemas.P2PTradeResponse(
        id=trade.id, trade_code=trade.trade_code, post_id=trade.post_id,
        buyer_id=trade.buyer_id, seller_id=trade.seller_id,
        quantity=trade.quantity, agreed_price_vnd=trade.agreed_price_vnd,
        total_amount_vnd=trade.total_amount_vnd, fee_vnd=trade.fee_vnd,
        gold_type=trade.gold_type, status=trade.status, created_at=trade.created_at,
        paid_at=trade.paid_at, confirmed_at=trade.confirmed_at,
        bank_info=trade.bank_info, complaint=trade.dispute_note or trade.complaint,
        transfer_note=_make_transfer_note(trade),
        buyer_name=f"{getattr(trade.buyer,'last_name','')} {getattr(trade.buyer,'first_name','')}".strip() if trade.buyer else None,
        seller_name=f"{getattr(trade.seller,'last_name','')} {getattr(trade.seller,'first_name','')}".strip() if trade.seller else None,
    )

@router.post("/trades/{trade_id}/force-cancel", response_model=p2p_schemas.P2PTradeResponse)
async def admin_force_cancel(
    trade_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(require_role_ids(1)),
):
    trade = p2p_repo.admin_force_cancel_trade(db, trade_id)
    await broadcast_trade_async(trade, "p2p_trade_cancelled")

    return p2p_schemas.P2PTradeResponse(
        id=trade.id, trade_code=trade.trade_code, post_id=trade.post_id,
        buyer_id=trade.buyer_id, seller_id=trade.seller_id,
        quantity=trade.quantity, agreed_price_vnd=trade.agreed_price_vnd,
        total_amount_vnd=trade.total_amount_vnd, fee_vnd=trade.fee_vnd,
        gold_type=trade.gold_type, status=trade.status, created_at=trade.created_at,
        paid_at=trade.paid_at, confirmed_at=trade.confirmed_at,
        bank_info=trade.bank_info, complaint=trade.dispute_note or trade.complaint,
        transfer_note=_make_transfer_note(trade),
        buyer_name=f"{getattr(trade.buyer,'last_name','')} {getattr(trade.buyer,'first_name','')}".strip() if trade.buyer else None,
        seller_name=f"{getattr(trade.seller,'last_name','')} {getattr(trade.seller,'first_name','')}".strip() if trade.seller else None,
    )