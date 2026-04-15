import asyncio
import logging
from datetime import datetime
from decimal import Decimal
from sqlalchemy.orm import Session
from ..models.models import (
    FuturesPosition,
    FuturesTrade,
    FuturesInstrument,
    Wallet,
    WalletType,
)

log = logging.getLogger(__name__)

FEE_RATE = Decimal("0.0001")   # 0.01% mỗi lượt
MMR = Decimal("0.005")         # 0.5% maintenance margin (margin level tối thiểu 50%)
LIQUIDATION_FEE = Decimal("0.001")  # 0.1% phí thanh lý

def _get_futures_wallet_type_id(db: Session) -> int:
    wt = db.query(WalletType).filter(WalletType.name == "Futures").first()
    if not wt:
        raise ValueError("WalletType 'Futures' chưa được seed")
    return wt.id

def _get_user_futures_wallet(db: Session, user_id: int) -> Wallet:
    fut_id = _get_futures_wallet_type_id(db)
    w = db.query(Wallet).filter(
        Wallet.user_id == user_id,
        Wallet.wallet_type_id == fut_id
    ).first()
    if not w:
        raise ValueError("User chưa có ví Futures")
    return w

def calculate_liquidation_price(
    side: str,
    entry_price: Decimal,
    leverage: int,
    maintenance_margin_rate: Decimal = MMR
) -> Decimal:
    """
    Tính giá thanh lý dựa trên:
    - side: "long" hoặc "short"
    - entry_price: giá vào lệnh
    - leverage: đòn bẩy
    - maintenance_margin_rate: tỷ lệ margin tối thiểu (default 0.5%)
    
    Công thức:
    - Long: liq_price = entry_price * (1 - 1/leverage + MMR)
    - Short: liq_price = entry_price * (1 + 1/leverage - MMR)
    """
    leverage_rate = Decimal("1") / Decimal(str(leverage))
    
    if side == "long":
        # Long position sẽ bị thanh lý khi giá giảm
        liq_price = entry_price * (Decimal("1") - leverage_rate + maintenance_margin_rate)
    else:  # short
        # Short position sẽ bị thanh lý khi giá tăng
        liq_price = entry_price * (Decimal("1") + leverage_rate - maintenance_margin_rate)
    
    return liq_price.quantize(Decimal("0.001"))  # Round to 3 decimal places

def open_position(
    db: Session,
    *,
    user_id: int,
    instrument_id: int,
    side: str,
    qty: Decimal,
    entry_price: Decimal,
    leverage: int,
) -> FuturesPosition:
    """Mở vị thế futures mới"""
    inst = db.query(FuturesInstrument).filter(FuturesInstrument.id == instrument_id).first()
    if not inst:
        raise ValueError("instrument not found")
    if side not in ("long", "short"):
        raise ValueError("side phải là 'long' hoặc 'short'")
    if qty <= 0:
        raise ValueError("qty > 0")
    if leverage <= 0 or leverage > 100:
        raise ValueError("leverage phải trong khoảng 1-100")

    notional = qty * entry_price
    margin_used = notional / leverage
    fee_open = notional * FEE_RATE

    wallet = _get_user_futures_wallet(db, user_id)
    bal = wallet.balance or Decimal("0")
    need = margin_used + fee_open
    
    if bal < need:
        raise ValueError(f"Số dư không đủ. Cần ${need:.2f}, hiện có ${bal:.2f}")

    # Tính giá thanh lý
    liq_price = calculate_liquidation_price(side, entry_price, leverage)

    # Trừ margin + phí
    wallet.balance = bal - need
    wallet.gold_world_balance = (wallet.gold_world_balance or Decimal("0")) + qty

    pos = FuturesPosition(
        user_id=user_id,
        instrument_id=instrument_id,
        side=side,
        qty=qty,
        entry_price=entry_price,
        leverage=leverage,
        margin_used=margin_used,
        liq_price=liq_price,  # ← THÊM FIELD NÀY
        status="open",
        opened_at=datetime.utcnow(),
    )
    db.add(pos)
    db.flush()

    # Ghi trade
    db.add(FuturesTrade(
        user_id=user_id,
        instrument_id=instrument_id,
        position_id=pos.id, 
        side=side,
        qty=qty,
        price=entry_price,
        fee=fee_open,
        created_at=datetime.utcnow(),
    ))

    db.commit()
    db.refresh(pos)
    db.refresh(wallet)
    
    log.info(f"Position opened: id={pos.id}, side={side}, entry={entry_price}, liq={liq_price}")
    
    return pos

def close_position(
    db: Session,
    *,
    user_id: int,
    position_id: int,
    exit_price: Decimal,
    is_liquidation: bool = False,
) -> FuturesPosition:
    """Đóng vị thế futures"""
    pos = (
        db.query(FuturesPosition)
        .filter(FuturesPosition.id == position_id, FuturesPosition.user_id == user_id)
        .first()
    )
    if not pos:
        raise ValueError("position not found")
    if pos.status == "closed":
        return pos

    # Tính P&L gross
    if pos.side == "long":
        pnl_gross = (exit_price - pos.entry_price) * pos.qty
    else:  # short
        pnl_gross = (pos.entry_price - exit_price) * pos.qty

    notional_close = pos.qty * exit_price
    fee_close = notional_close * (LIQUIDATION_FEE if is_liquidation else FEE_RATE)

    wallet = _get_user_futures_wallet(db, user_id)
    
    # Hoàn margin + P&L - phí
    refund = (pos.margin_used or Decimal("0")) + pnl_gross - fee_close
    
    # CHỐNG TRƯỢT GIÁ: Đảm bảo số dư không âm
    new_balance = (wallet.balance or Decimal("0")) + refund
    if new_balance < 0:
        refund = -(wallet.balance or Decimal("0"))
        new_balance = Decimal("0")
        pnl_gross = refund + fee_close - (pos.margin_used or Decimal("0"))
    
    wallet.balance = new_balance
    wallet.gold_world_balance = max(Decimal("0"), (wallet.gold_world_balance or Decimal("0")) - pos.qty)

    pos.status = "liquidated" if is_liquidation else "closed"
    pos.closed_at = datetime.utcnow()
    pos.pnl_realized = pnl_gross - fee_close

    # Ghi trade
    db.add(FuturesTrade(
        user_id=user_id,
        instrument_id=pos.instrument_id,
        position_id=pos.id, 
        side=pos.side,
        qty=pos.qty,
        price=exit_price,
        fee=fee_close,
        created_at=datetime.utcnow(),
    ))

    db.commit()
    db.refresh(pos)
    db.refresh(wallet)
    return pos

def check_and_liquidate_positions(
    db: Session,
    user_id: int,
    current_price: Decimal,
) -> list[FuturesPosition]:
    """
    Kiểm tra và thanh lý các vị thế khi giá chạm hoặc vượt qua giá thanh lý
    """
    positions = db.query(FuturesPosition).filter(
        FuturesPosition.user_id == user_id,
        FuturesPosition.status == "open"
    ).all()
    
    if not positions:
        return []
    
    liquidated = []
    
    for pos in positions:
        should_liquidate = False
        
        if pos.liq_price is None:
            # Tính lại nếu thiếu
            pos.liq_price = calculate_liquidation_price(pos.side, pos.entry_price, pos.leverage)
            db.commit()
        
        # Kiểm tra điều kiện thanh lý
        if pos.side == "long" and current_price <= pos.liq_price:
            should_liquidate = True
        elif pos.side == "short" and current_price >= pos.liq_price:
            should_liquidate = True
        
        if should_liquidate:
            try:
                closed_pos = close_position(
                    db,
                    user_id=user_id,
                    position_id=pos.id,
                    exit_price=current_price,
                    is_liquidation=True
                )
                liquidated.append(closed_pos)
                log.warning(f"Position {pos.id} liquidated: current={current_price}, liq={pos.liq_price}")
            except Exception as e:
                log.error(f"Error liquidating position {pos.id}: {e}")
                continue
    
    return liquidated

def list_positions(db: Session, user_id: int, status: str | None = None):
    """Lấy danh sách vị thế"""
    q = db.query(FuturesPosition).filter(FuturesPosition.user_id == user_id)
    if status in ("open", "closed", "liquidated"):
        q = q.filter(FuturesPosition.status == status)
    return q.order_by(FuturesPosition.opened_at.desc()).all()

def list_trades(db: Session, user_id: int):
    """Lấy danh sách lệnh đã thực hiện"""
    return (
        db.query(FuturesTrade)
        .filter(FuturesTrade.user_id == user_id)
        .order_by(FuturesTrade.created_at.desc())
        .all()
    )

def calculate_account_stats(db: Session, user_id: int, current_price: Decimal) -> dict:
    """Tính toán các chỉ số tài khoản"""
    wallet = _get_user_futures_wallet(db, user_id)
    balance = float(wallet.balance or Decimal("0"))
    
    positions = db.query(FuturesPosition).filter(
        FuturesPosition.user_id == user_id,
        FuturesPosition.status == "open"
    ).all()
    
    total_margin = Decimal("0")
    total_pnl = Decimal("0")
    
    for pos in positions:
        total_margin += pos.margin_used or Decimal("0")
        
        if pos.side == "long":
            pnl = (current_price - pos.entry_price) * pos.qty
        else:
            pnl = (pos.entry_price - current_price) * pos.qty
        
        total_pnl += pnl
    
    equity = balance + float(total_pnl)
    free_margin = equity - float(total_margin)
    margin_level = (equity / float(total_margin) * 100) if total_margin > 0 else 0
    
    return {
        "balance": balance,
        "equity": equity,
        "margin": float(total_margin),
        "free_margin": free_margin,
        "margin_level": margin_level,
        "total_pnl": float(total_pnl),
    }

# ==================== BACKGROUND TASK ====================

async def liquidation_checker_loop():
    """Background task kiểm tra thanh lý"""
    from ..database import SessionLocal
    from ..state.price_cache import price_cache
    from ..realtime.ws_futures import manager_futures
    
    log.info("Liquidation checker started")
    
    while True:
        try:
            await asyncio.sleep(5)
            
            current_price = price_cache.get("price")
            if not current_price or current_price <= 0:
                continue
            
            current_price = Decimal(str(current_price))
            
            db: Session = SessionLocal()
            try:
                open_positions = db.query(FuturesPosition).filter(
                    FuturesPosition.status == "open"
                ).all()
                
                if not open_positions:
                    continue
                
                user_positions = {}
                for pos in open_positions:
                    if pos.user_id not in user_positions:
                        user_positions[pos.user_id] = []
                    user_positions[pos.user_id].append(pos)
                
                for user_id, positions in user_positions.items():
                    try:
                        liquidated = check_and_liquidate_positions(
                            db, user_id, current_price
                        )
                        
                        if liquidated:
                            log.warning(f"Liquidated {len(liquidated)} positions for user {user_id}")
                            
                            for pos in liquidated:
                                await manager_futures.send_to_user(user_id, {
                                    "type": "liquidation",
                                    "position_id": pos.id,
                                    "message": f"Vị thế #{pos.id} đã bị thanh lý",
                                    "pnl_realized": str(pos.pnl_realized or 0),
                                })
                            
                            wallet = _get_user_futures_wallet(db, user_id)
                            await manager_futures.send_to_user(user_id, {
                                "type": "wallet_update",
                                "balance": float(wallet.balance or 0),
                                "gold_world_balance": float(wallet.gold_world_balance or 0),
                            })
                    
                    except Exception as e:
                        log.error(f"Error checking liquidation for user {user_id}: {e}")
                        continue
            
            finally:
                db.close()
        
        except Exception as e:
            log.error(f"Liquidation checker error: {e}")
            await asyncio.sleep(5)

def start_liquidation_checker():
    """Khởi động background task"""
    asyncio.create_task(liquidation_checker_loop())