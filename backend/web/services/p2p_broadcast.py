# backend/web/services/p2p_broadcast.py
from fastapi.encoders import jsonable_encoder

from ..realtime.ws_p2p_user import p2p_user_manager
from ..realtime.ws_p2p_admin import p2p_admin_manager


def _make_transfer_note(trade) -> str | None:
    """
    Ưu tiên bank_info.transfer_note; nếu không có thì dựng từ template của post
    bằng cách chèn trade_code.
    """
    try:
        bank_info = getattr(trade, "bank_info", None)
        if isinstance(bank_info, dict):
            v = bank_info.get("transfer_note")
            if v:
                return str(v)
    except Exception:
        pass

    try:
        post = getattr(trade, "post", None)
        tpl = getattr(post, "transfer_note_template", None)
        if tpl:
            tpl = str(tpl)
            note = (
                tpl.replace("{code}", trade.trade_code)
                   .replace("{{code}}", trade.trade_code)
                   .replace("{trade_code}", trade.trade_code)
            )
            # nếu template không có placeholder, nối thêm code vào cuối
            if note == tpl:
                note = f"{tpl}{trade.trade_code}"
            return note
    except Exception:
        pass

    return None


def _pack_trade(trade) -> dict:
    buyer_name = (
        f"{getattr(trade.buyer,'last_name','')} {getattr(trade.buyer,'first_name','')}".strip()
        if getattr(trade, "buyer", None) else None
    )
    seller_name = (
        f"{getattr(trade.seller,'last_name','')} {getattr(trade.seller,'first_name','')}".strip()
        if getattr(trade, "seller", None) else None
    )
    return {
        "id": trade.id,
        "trade_code": trade.trade_code,
        "post_id": trade.post_id,
        "buyer_id": trade.buyer_id,
        "seller_id": trade.seller_id,
        "quantity": float(trade.quantity or 0),
        "agreed_price_vnd": float(trade.agreed_price_vnd or 0),
        "total_amount_vnd": float(trade.total_amount_vnd or 0),
        "fee_vnd": float(trade.fee_vnd or 0),
        "gold_type": trade.gold_type,
        "status": trade.status,
        "created_at": trade.created_at,
        "paid_at": trade.paid_at,
        "confirmed_at": trade.confirmed_at,
        "bank_info": trade.bank_info,  # dict (ten_ngan_hang, so_tai_khoan, ten_chu_tai_khoan, transfer_note)
        "complaint": getattr(trade, "dispute_note", None) or getattr(trade, "complaint", None),
        "transfer_note": _make_transfer_note(trade),
        "buyer_name": buyer_name,
        "seller_name": seller_name,
    }


async def broadcast_trade_async(trade, event_type: str):
    """
    Gửi realtime cho 2 user liên quan và trang admin.
    event_type ví dụ: 'p2p_trade_created' | 'p2p_trade_paid' | 'p2p_trade_confirmed'
                      | 'p2p_trade_completed' | 'p2p_trade_cancelled' | 'p2p_trade_disputed'
    """
    payload = {"type": event_type, "trade": _pack_trade(trade)}
    data = jsonable_encoder(payload)

    # tới buyer/seller
    try:
        await p2p_user_manager.send_to_user(trade.buyer_id, data)
        if trade.seller_id and trade.seller_id != trade.buyer_id:
            await p2p_user_manager.send_to_user(trade.seller_id, data)
    except Exception:
        pass

    # tới admin
    try:
        await p2p_admin_manager.broadcast(data)
    except Exception:
        pass
