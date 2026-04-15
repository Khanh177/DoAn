from datetime import datetime
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy import JSON, Boolean, CheckConstraint, Column, DateTime, Enum, Index, Integer, String, Numeric, ForeignKey, Text, func

Base = declarative_base()

# Bảng phân quyền người dùng
class UserRole(Base):
    __tablename__ = 'user_roles'
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)  # 1: quản lý, 2: người dùng

    users = relationship("User", back_populates="role")


# Bảng loại ví
class WalletType(Base):
    __tablename__ = 'wallet_types'
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)  # 1: Ví funding, 2: Ví spot, 3: Ví futures

    wallets = relationship("Wallet", back_populates="wallet_type")


# Bảng người dùng
class User(Base):
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)  # Email/số điện thoại
    password = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    first_name = Column(String, nullable=False)
    role_id = Column(Integer, ForeignKey("user_roles.id"), default=2)  # 1: quản lý, 2: người dùng
    banned = Column(Integer, default=0)  # 0: không bị khóa, 1: bị khóa

    wallets = relationship("Wallet", back_populates="user")
    role = relationship("UserRole", back_populates="users")
    otps = relationship("OTP", back_populates="user", cascade="all, delete-orphan")


# Bảng ví cá nhân người dùng
from sqlalchemy import UniqueConstraint

class Wallet(Base):
    __tablename__ = 'wallets'
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    wallet_type_id = Column(Integer, ForeignKey("wallet_types.id"), nullable=False)
    balance = Column(Numeric(24, 6), default=0)
    gold_world_balance = Column(Numeric(18, 5), default=0)
    gold_sjc_balance = Column(Numeric(18, 5), default=0)
    gold_doji_hn_balance = Column(Numeric(18, 5), default=0)
    gold_doji_sg_balance = Column(Numeric(18, 5), default=0)
    gold_btmc_sjc_balance = Column(Numeric(18, 5), default=0)
    gold_phu_quy_sjc_balance = Column(Numeric(18, 5), default=0)
    gold_pnj_hcm_balance = Column(Numeric(18, 5), default=0)
    gold_pnj_hn_balance = Column(Numeric(18, 5), default=0)
    
    user = relationship("User", back_populates="wallets")
    wallet_type = relationship("WalletType", back_populates="wallets")
    __table_args__ = (UniqueConstraint("user_id", "wallet_type_id", name="uq_user_wallet_type"),)


# Bảng OTP
class OTP(Base):
    __tablename__ = "otp"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    code_hash = Column(String, nullable=False)        # lưu hash, không lưu mã thô
    expired_at = Column(DateTime, nullable=False)     # thời điểm hết hạn
    created_at = Column(DateTime, nullable=False)     # thời điểm tạo
    consumed_at = Column(DateTime)                    # null = chưa dùng
    attempts = Column(Integer, default=0)             # số lần đã thử
    max_attempts = Column(Integer, default=5)         # số lần thử tối đa
    user = relationship("User", back_populates="otps")

    # index gợi ý để truy vấn OTP còn hạn nhanh
    __table_args__ = (
        Index("ix_otp_user_active", "user_id", "expired_at", "consumed_at"),
    )

#Bảng tin tức (news)
class News(Base):
    __tablename__ = 'news'
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=False)
    image = Column(String(500))
    author = Column(String, nullable=False)
    content = Column(String, nullable=False)
    published_date = Column(DateTime, default=datetime.utcnow)

#Bảng nạp tiền vào ví
Currency = Enum("VND","USDT","USD", name="currency_enum")
DepositStatus = Enum("pending","approved","credited","rejected", name="deposit_status_enum")

class Deposit(Base):
    __tablename__ = "deposits"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    wallet_type_id = Column(Integer, ForeignKey("wallet_types.id"), nullable=False, index=True)
    deposit_code = Column(String(10), nullable=False, unique=True, index=True)

    currency = Column(Currency, nullable=False, default="VND")
    amount_money = Column(Numeric(24,6), nullable=False)

    status = Column(DepositStatus, nullable=False, default="pending", index=True)
    rate_used = Column(Numeric(24,6))
    usdt_amount = Column(Numeric(24,6))

    approved_by = Column(Integer, ForeignKey("users.id"))
    approved_at = Column(DateTime)
    rejected_reason = Column(String)

    credited_at = Column(DateTime)
    idempotency_key = Column(String, unique=True, index=True)
    channel = Column(String, nullable=False, server_default="bank_transfer")

    created_at = Column(DateTime, nullable=False, server_default=func.now(), index=True)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("char_length(deposit_code)=10", name="ck_deposit_code_len"),
        CheckConstraint("amount_money>0", name="ck_deposit_amt_pos"),
        UniqueConstraint("deposit_code", name="uq_deposit_code"),
        UniqueConstraint("idempotency_key", name="uq_deposit_idem"),
        Index("ix_dep_user_status_created", "user_id", "status", "created_at"),
    )

#Bảng thương hiệu vàng trong nước
class GoldInstrument(Base):
    __tablename__ = "gold_instruments"
    id = Column(Integer, primary_key=True)
    symbol = Column(String(50), unique=True, index=True, nullable=False)   #gold_sjc_hn, gold_doji_sg...    
    brand = Column(String(50), nullable=False) # Thương hiệu vàng
    branch = Column(String(50))  # Chi nhánh (Hà Nội, Sài Gòn...)
    display_name = Column(String(100), nullable=False) # Tên hiển thị đầy đủ
    purity = Column(String(20))
    region = Column(String(50))

#Bảng giá vàng trong nước
class GoldPrice(Base):
    __tablename__ = "domestic_gold_prices"
    id = Column(Integer, primary_key=True)
    instrument_id = Column(Integer, ForeignKey("gold_instruments.id", ondelete="CASCADE"), nullable=False, index=True)
    buy_price = Column(Numeric(18,0), nullable=False)
    sell_price = Column(Numeric(18,0), nullable=False)
    currency = Column(String(10), nullable=False, server_default="VND")
    as_of = Column(DateTime, nullable=False, index=True)  # thời điểm/Ngày giá

    instrument = relationship("GoldInstrument")
    __table_args__ = (
        CheckConstraint("buy_price>0 AND sell_price>0", name="ck_price_pos"),
        UniqueConstraint("instrument_id", "as_of", name="uq_price_inst_asof"),
        Index("ix_price_inst_asof", "instrument_id", "as_of"),
    )

#Giao dịch spot vàng trong nước
# Lô đang giữ (FIFO + T+1 + band/fee)
class SpotDomPosition(Base):
    __tablename__ = "spot_dom_positions"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    instrument_id = Column(Integer, ForeignKey("gold_instruments.id", ondelete="CASCADE"), index=True, nullable=False)  # chỉ nội địa
    qty_xau = Column(Numeric(18,6), nullable=False)
    qty_remain = Column(Numeric(18,6), nullable=False)
    entry_price = Column(Numeric(18,0), nullable=False)    # VND/lượng
    acquired_at = Column(DateTime, nullable=False)
    sell_unlock_at = Column(DateTime, nullable=False)      # acquired_at + 24h
    status = Column(String(16), nullable=False, server_default="active")  # active|closed
    created_at = Column(DateTime, nullable=False, server_default=func.now(), index=True)

    __table_args__ = (
        CheckConstraint("qty_xau>0 AND qty_remain>=0", name="ck_dompos_qty"),
        Index("ix_dompos_user_inst_state_time", "user_id", "instrument_id", "status", "acquired_at"),
    )

SideDom = Enum("buy","sell", name="spot_dom_side_enum")

# Giao dịch tổng (mua/bán)
class SpotDomTrade(Base):
    __tablename__ = "spot_dom_trades"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    instrument_id = Column(Integer, ForeignKey("gold_instruments.id", ondelete="CASCADE"), index=True, nullable=False)
    side = Column(SideDom, nullable=False)
    qty_xau = Column(Numeric(18,6), nullable=False)
    price_used = Column(Numeric(18,0), nullable=False)     # giá bình quân VND/lượng của lệnh
    gross_vnd = Column(Numeric(24,0), nullable=False)
    fee_vnd = Column(Numeric(24,0), nullable=False)
    net_vnd  = Column(Numeric(24,0), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now(), index=True)
    idem_key = Column(String(64), unique=True, index=True)

    __table_args__ = (
        CheckConstraint("qty_xau>0 AND gross_vnd>=0 AND fee_vnd>=0 AND net_vnd>=0", name="ck_domtrade_vals"),
        Index("ix_domtrade_user_day", "user_id", "created_at"),
    )

# Chi tiết phân bổ theo lô khi bán (áp band/fee theo từng lô)
class SpotDomTradeDetail(Base):
    __tablename__ = "spot_dom_trade_details"
    id = Column(Integer, primary_key=True)
    trade_id = Column(Integer, ForeignKey("spot_dom_trades.id", ondelete="CASCADE"), index=True, nullable=False)
    position_id = Column(Integer, ForeignKey("spot_dom_positions.id", ondelete="CASCADE"), index=True, nullable=False)
    qty_from_pos = Column(Numeric(18,6), nullable=False)
    entry_price = Column(Numeric(18,0), nullable=False)
    price_used = Column(Numeric(18,0), nullable=False)     # min(market_sell, cap)
    fee_vnd = Column(Numeric(24,0), nullable=False)
    hold_hours = Column(Integer, nullable=False)
    band_days = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("qty_from_pos>0 AND fee_vnd>=0", name="ck_domdetail_vals"),
        Index("ix_domdetail_trade", "trade_id"),
        Index("ix_domdetail_position", "position_id"),
    )

# Config hệ thống cho DOMESTIC
class SpotDomConfig(Base):
    __tablename__ = "spot_dom_config"
    id = Column(Integer, primary_key=True)
    key = Column(String(64), unique=True, nullable=False, index=True)
    value = Column(String(128), nullable=False)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
# seed: band_per_day=0.005 ; early_fee=0.015 ; normal_fee=0.002 ; t_plus_hours=24 ; daily_limit_vnd=100000000

#Trade futures xau
# enum cho lệnh futures
FutSide = Enum("long", "short", name="fut_side_enum")
FutStatus = Enum("open", "closed", name="fut_pos_status_enum")

# Bảng danh mục sản phẩm futures (để sau có thể thêm nhiều loại, ví dụ XAUUSD_PERP)
class FuturesInstrument(Base):
    __tablename__ = "futures_instruments"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(50), unique=True, index=True, nullable=False)   # mã sản phẩm futures, ví dụ: XAUUSD_PERP
    base_asset = Column(String(20), nullable=False, server_default="XAU")  # tài sản gốc
    quote_asset = Column(String(20), nullable=False, server_default="USD") # tài sản định giá
    tick_size = Column(Numeric(18,6), nullable=False, server_default="0.1")  # bước giá nhỏ nhất
    lot_size = Column(Numeric(18,6), nullable=False, server_default="0.001") # khối lượng tối thiểu
    status = Column(String(16), nullable=False, server_default="active")     # trạng thái sản phẩm


# Bảng vị thế futures của user (đang mở hoặc đã đóng)
class FuturesPosition(Base):
    __tablename__ = "futures_positions"
    __table_args__ = (
        CheckConstraint("qty>0", name="ck_futpos_qty_pos"),
        Index("ix_futpos_user_inst_status", "user_id", "instrument_id", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)  # user sở hữu vị thế
    instrument_id = Column(Integer, ForeignKey("futures_instruments.id", ondelete="CASCADE"), nullable=False, index=True)  # sản phẩm
    side = Column(FutSide, nullable=False)                              # long hoặc short
    qty = Column(Numeric(18,6), nullable=False)                         # khối lượng XAU giả lập
    entry_price = Column(Numeric(24,6), nullable=False)                 # giá mở vị thế
    leverage = Column(Numeric(6,2), nullable=False, server_default="1") # đòn bẩy dùng
    margin_used = Column(Numeric(24,6), nullable=False)                 # số tiền ký quỹ đã trích từ ví
    liq_price = Column(Numeric(18, 6)) 
    status = Column(FutStatus, nullable=False, server_default="open")   # open | closed
    opened_at = Column(DateTime, nullable=False, server_default=func.now())  # thời điểm mở
    closed_at = Column(DateTime)                                        # thời điểm đóng (nếu có)
    pnl_realized = Column(Numeric(24,6), nullable=False, server_default="0") # lãi/lỗ đã chốt

    user = relationship("User")
    instrument = relationship("FuturesInstrument")

# Bảng log giao dịch futures (mỗi lần khớp/mở/đóng đều ghi lại)
class FuturesTrade(Base):
    __tablename__ = "futures_trades"
    __table_args__ = (
        CheckConstraint("qty>0", name="ck_futtrade_qty_pos"),
        Index("ix_futtrade_user_time", "user_id", "created_at"),
        Index("ix_futtrade_position_id", "position_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)    # ai trade
    instrument_id = Column(Integer, ForeignKey("futures_instruments.id", ondelete="CASCADE"), nullable=False, index=True)  # sản phẩm
    position_id = Column(Integer, ForeignKey("futures_positions.id", ondelete="SET NULL"), nullable=True, index=True)
    side = Column(FutSide, nullable=False)                             # long hoặc short tại thời điểm trade
    qty = Column(Numeric(18,6), nullable=False)                        # khối lượng khớp
    price = Column(Numeric(24,6), nullable=False)                      # giá khớp
    fee = Column(Numeric(24,6), nullable=False, server_default="0")    # phí
    created_at = Column(DateTime, nullable=False, server_default=func.now())  # thời điểm ghi
    idem_key = Column(String(64), unique=True, index=True)             # để tránh ghi trùng giao dịch

    user = relationship("User")
    instrument = relationship("FuturesInstrument")
    position = relationship("FuturesPosition")

# Bảng lưu mark price để tính PnL chưa chốt (có thể bỏ nếu bạn lấy giá ngoài)
class FuturesMarkPrice(Base):
    __tablename__ = "futures_mark_price"
    __table_args__ = (
        UniqueConstraint("instrument_id", "as_of", name="uq_fut_mark_time"),
    )

    id = Column(Integer, primary_key=True, index=True)
    instrument_id = Column(Integer, ForeignKey("futures_instruments.id", ondelete="CASCADE"), nullable=False, index=True)  # sản phẩm
    mark_price = Column(Numeric(24,6), nullable=False)            # giá mark tại thời điểm này
    as_of = Column(DateTime, nullable=False, server_default=func.now(), index=True)  # thời điểm cập nhật

    instrument = relationship("FuturesInstrument")

#Spot vàng thế giới
OrderType   = Enum("market","limit", name="spot_world_order_type_enum")
TradeType   = Enum("buy","sell", name="spot_world_trade_type_enum")
OrderStatus = Enum("pending","partial","completed","cancelled","failed", name="spot_world_order_status_enum")

class SpotWorldPosition(Base):
    __tablename__ = "spot_world_positions"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_swpos_user"),
        CheckConstraint("qty_xau>=0", name="ck_swpos_qty_nonneg"),
        CheckConstraint("avg_cost_usd>=0", name="ck_swpos_avg_nonneg"),
        Index("ix_swpos_user", "user_id"),
    )
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    qty_xau = Column(Numeric(18,6), nullable=False, server_default="0")
    avg_cost_usd = Column(Numeric(24,6), nullable=False, server_default="0")
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

class SpotWorldOrder(Base):
    __tablename__ = "spot_world_orders"
    __table_args__ = (
        CheckConstraint("((qty_xau is not null and qty_xau>0) OR (total_usd is not null and total_usd>0))", name="ck_sworder_qty_or_usd"),
        CheckConstraint("(limit_price is null) OR (limit_price>0)", name="ck_sworder_limit_pos"),
        CheckConstraint("(executed_price is null) OR (executed_price>0)", name="ck_sworder_exec_pos"),
        Index("ix_sworder_user_time", "user_id", "created_at"),
        UniqueConstraint("idem_key", name="uq_sworder_idem"),
    )
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    order_type = Column(OrderType, nullable=False)
    trade_type = Column(TradeType, nullable=False)
    status = Column(OrderStatus, nullable=False, server_default="pending")
    qty_xau = Column(Numeric(18,6))
    total_usd = Column(Numeric(24,6))
    limit_price = Column(Numeric(24,6))
    executed_price = Column(Numeric(24,6))
    fee_usd = Column(Numeric(24,6), nullable=False, server_default="0")
    idem_key = Column(String(64), index=True, unique=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now(), index=True)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    executed_at = Column(DateTime)
    cancelled_at = Column(DateTime)
    notes = Column(String)
    cancel_reason = Column(String)

class SpotWorldExecution(Base):
    __tablename__ = "spot_world_executions"
    __table_args__ = (
        CheckConstraint("price>0", name="ck_swexec_price_pos"),
        CheckConstraint("qty_xau>0", name="ck_swexec_qty_pos"),
        CheckConstraint("fee_usd>=0", name="ck_swexec_fee_nonneg"),
        Index("ix_swexec_order", "order_id"),
        Index("ix_swexec_user_time", "user_id", "executed_at"),
    )
    id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("spot_world_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id  = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    trade_type = Column(TradeType, nullable=False)
    price   = Column(Numeric(24,6), nullable=False)
    qty_xau = Column(Numeric(18,6), nullable=False)
    gross_usd = Column(Numeric(24,6), nullable=False)
    fee_usd   = Column(Numeric(24,6), nullable=False, server_default="0")
    net_usd   = Column(Numeric(24,6), nullable=False)
    pnl_realized_usd = Column(Numeric(24,6), nullable=False, server_default="0")
    executed_at = Column(DateTime, nullable=False, server_default=func.now(), index=True)

class SpotWorldMarkPrice(Base):
    __tablename__ = "spot_world_mark_price"
    __table_args__ = (
        CheckConstraint("mark_price>0", name="ck_swmark_pos"),
        UniqueConstraint("as_of", name="uq_swmark_asof"),
        Index("ix_swmark_time", "as_of"),
    )
    id = Column(Integer, primary_key=True)
    mark_price = Column(Numeric(24,6), nullable=False)
    as_of = Column(DateTime, nullable=False, server_default=func.now())

class SpotWorldConfig(Base):
    __tablename__ = "spot_world_config"
    __table_args__ = (UniqueConstraint("key", name="uq_swcfg_key"),)
    id = Column(Integer, primary_key=True)
    key = Column(String(64), nullable=False, index=True)
    value = Column(String(128), nullable=False)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

#Giao dịch P2P
class P2PPost(Base):
    __tablename__ = "p2p_posts"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    trade_type = Column(String(10), nullable=False)        # buy / sell
    gold_type = Column(String(50), nullable=False)
    price_vnd = Column(Numeric(18, 2), nullable=False)

    total_quantity = Column(Numeric(18, 5), nullable=False)
    remaining_quantity = Column(Numeric(18, 5), nullable=False)
    allow_partial_fill = Column(Boolean, default=True)

    min_amount_vnd = Column(Numeric(18, 2), nullable=False)
    max_amount_vnd = Column(Numeric(18, 2), nullable=False)

    bank_name = Column(String(100), nullable=False)
    bank_account_number = Column(String(50), nullable=False)
    bank_account_name = Column(String(100), nullable=False)
    transfer_note_template = Column(String(255), nullable=True)

    status = Column(String(20), default="active")  # active, inactive, completed

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = relationship("User", backref="p2p_posts")
    p2p_trades = relationship("P2PTrade", back_populates="post")


class P2PTrade(Base):
    __tablename__ = "p2p_trades"
    
    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("p2p_posts.id"), nullable=False)

    trade_code = Column(String(50), unique=True, index=True, nullable=False) #mã giao dịch

    buyer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    seller_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    quantity = Column(Numeric(18, 5), nullable=False)
    agreed_price_vnd = Column(Numeric(18, 2), nullable=False)
    total_amount_vnd = Column(Numeric(18, 2), nullable=False)
    fee_vnd = Column(Numeric(18, 2), nullable=False, default=0)
    gold_type = Column(String(50), nullable=False)

    status = Column(String(20), default="waiting_payment")
    # waiting_payment, paid, confirmed, completed, cancelled, disputed

    created_at = Column(DateTime, default=datetime.utcnow)
    paid_at = Column(DateTime, nullable=True)
    confirmed_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)

    payment_proof_url = Column(String(255), nullable=True)
    dispute_note = Column(Text, nullable=True)
    cancel_reason = Column(String(255), nullable=True)
    cancelled_by = Column(String(20), nullable=True)  # buyer, seller, system, admin

    resolved_by_admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    bank_info = Column(JSON, nullable=True)

    post = relationship("P2PPost", back_populates="p2p_trades")
    buyer = relationship("User", foreign_keys=[buyer_id], backref="p2p_buy_trades")
    seller = relationship("User", foreign_keys=[seller_id], backref="p2p_sell_trades")
    admin_resolver = relationship("User", foreign_keys=[resolved_by_admin_id])

# Enum cho trạng thái, mức độ ưu tiên, vai trò người gửi
ComplaintStatus = Enum(
    "open", "in_progress", "resolved", "closed", "cancelled",
    name="complaint_status_enum",
)

ComplaintPriority = Enum(
    "low", "normal", "high", "urgent",
    name="complaint_priority_enum",
)

ComplaintSenderRole = Enum(
    "user", "admin", "system",
    name="complaint_sender_role_enum",
)


# Bảng khiếu nại chính (ticket)
class Complaint(Base):
    __tablename__ = "complaints"
    
    id = Column(Integer, primary_key=True, index=True)
    ticket_code = Column(String(20), unique=True, index=True, nullable=False)

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    related_type = Column(String(20), nullable=False)
    related_id = Column(Integer, nullable=True, index=True)

    title = Column(String(200), nullable=False)
    status = Column(ComplaintStatus, nullable=False, server_default="open")
    priority = Column(ComplaintPriority, nullable=False, server_default="normal")

    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    created_at = Column(DateTime, server_default=func.now(), index=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    closed_at = Column(DateTime)

    last_message_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), index=True)

    # CHÚ Ý: chỉ rõ foreign_keys
    user = relationship(
        "User",
        foreign_keys=[user_id],
        backref="complaints",
    )

    admin = relationship(
        "User",
        foreign_keys=[assigned_to],
        backref="assigned_complaints",   # tên backref khác để phân biệt, có thể đổi tên
    )

    messages = relationship(
        "ComplaintMessage",
        back_populates="complaint",
        cascade="all, delete-orphan",
    )

    read_statuses = relationship(
        "ComplaintReadStatus",
        back_populates="complaint",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint(
            "(related_type IN ('p2p_trade','deposit','withdraw') AND related_id IS NOT NULL) OR "
            "(related_type = 'other' AND related_id IS NULL)",
            name="ck_complaint_related",
        ),
        Index("ix_complaint_related", "related_type", "related_id"),
        Index("ix_complaint_user_status", "user_id", "status"),
    )

    @property
    def user_name(self) -> str:
        if self.user:
            ln = self.user.last_name or ""
            fn = self.user.first_name or ""
            full = f"{ln} {fn}".strip()
            # nếu trống hết thì fallback username
            return full or (self.user.username or "")
        return ""

    @property
    def user_email(self) -> str:
        # username của bạn đang dùng làm email đăng nhập
        return self.user.username if self.user else ""

# Bảng tin nhắn chat trong ticket
class ComplaintMessage(Base):
    __tablename__ = "complaint_messages"
    
    id = Column(Integer, primary_key=True, index=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_role = Column(ComplaintSenderRole, nullable=False)

    message = Column(Text, nullable=True)
    is_internal = Column(Boolean, nullable=False, server_default="false", index=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)

    attachments = relationship(
        "ComplaintAttachment",
        back_populates="message",
        cascade="all, delete-orphan",
    )

    sender = relationship(
        "User",
        foreign_keys=[sender_id],
    )

    complaint = relationship("Complaint", back_populates="messages")

    __table_args__ = (
        Index("ix_complaint_msg_ticket_time", "complaint_id", "created_at"),
    )

    @property
    def sender_name(self) -> str:
        if self.sender:
            ln = self.sender.last_name or ""
            fn = self.sender.first_name or ""
            full = f"{ln} {fn}".strip()
            return full or (self.sender.username or "")
        return ""

class ComplaintReadStatus(Base):
    __tablename__ = "complaint_read_statuses"

    id = Column(Integer, primary_key=True, index=True)
    complaint_id = Column(Integer, ForeignKey("complaints.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    last_read_message_id = Column(Integer, ForeignKey("complaint_messages.id", ondelete="SET NULL"), nullable=True)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    complaint = relationship("Complaint", back_populates="read_statuses")

    user = relationship(
        "User",
        foreign_keys=[user_id],
    )

    last_read_message = relationship(
        "ComplaintMessage",
        foreign_keys=[last_read_message_id],
    )

    __table_args__ = (
        UniqueConstraint("complaint_id", "user_id", name="uq_complaint_read_user"),
    )


# File đính kèm
class ComplaintAttachment(Base):
    __tablename__ = "complaint_attachments"
    
    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("complaint_messages.id", ondelete="CASCADE"), nullable=False, index=True)
    file_url = Column(String(500), nullable=False)
    file_type = Column(String(20), nullable=False)  # image, video, pdf...
    file_size = Column(Integer)
    
    message = relationship("ComplaintMessage", back_populates="attachments")

    __table_args__ = (
        Index("ix_complaint_attach_message", "message_id"),
    )

# Bảng dự đoán giá vàng
class GoldForecast(Base):
    __tablename__ = "gold_forecasts"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # Ngày tạo dự đoán (thường là hôm nay)
    forecast_date   = Column(DateTime, nullable=False, server_default=func.now(), index=True)
    
    days            = Column(Integer, nullable=False)  # số ngày được dự đoán: 1–30
    today_price     = Column(Numeric(12, 2), nullable=False)   # giá thực tế gần nhất lúc dự đoán
    min_price       = Column(Numeric(12, 2), nullable=False)
    max_price       = Column(Numeric(12, 2), nullable=False)
    range_price     = Column(Numeric(12, 2), nullable=False)
    
    model_version   = Column(String(20), nullable=False, server_default="v1.0")  # để back-test sau
    is_latest       = Column(Boolean, nullable=False, server_default="true")     # tiện lấy bản mới nhất
    
    created_at      = Column(DateTime, nullable=False, server_default=func.now())

    # Quan hệ
    user = relationship("User", back_populates="gold_forecasts")
    items = relationship("GoldForecastItem", back_populates="forecast", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("days >= 1 AND days <= 30", name="ck_forecast_days_range"),
        CheckConstraint("today_price > 0", name="ck_forecast_today_price_pos"),
        Index("ix_gold_forecast_user_date", "user_id", "forecast_date"),
        Index("ix_gold_forecast_latest", "is_latest", "forecast_date"),
    )

# Thêm backref vào User (KHÔNG cần sửa class User ở trên)
User.gold_forecasts = relationship("GoldForecast", back_populates="user")


# Bảng chi tiết dự đoán 
class GoldForecastItem(Base):
    __tablename__ = "gold_forecast_items"

    id              = Column(Integer, primary_key=True, index=True)
    forecast_id     = Column(Integer, ForeignKey("gold_forecasts.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Ngày được dự đoán (ví dụ: 2025-12-09)
    forecast_date   = Column(DateTime, nullable=False, index=True)
    
    price           = Column(Numeric(12, 2), nullable=False)   # giá dự đoán (USD/ounce)
    change_pct      = Column(Numeric(8, 4))                    # % thay đổi so với today_price (có thể âm)

    forecast = relationship("GoldForecast", back_populates="items")

    __table_args__ = (
        UniqueConstraint("forecast_id", "forecast_date", name="uq_forecast_item_date"),
        CheckConstraint("price > 0", name="ck_forecast_item_price_pos"),
        Index("ix_forecast_item_date", "forecast_date"),
    )

class GoldChatMessage(Base):
    __tablename__ = "gold_chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    role = Column(String(10), nullable=False)  # 'user' / 'bot'
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now(), index=True)
    
    user = relationship("User", backref="gold_chat_messages")
    
    __table_args__ = (
        CheckConstraint("role IN ('user', 'bot')", name="ck_chat_role"),
        Index("ix_gold_chat_user_created", "user_id", "created_at"),
    )