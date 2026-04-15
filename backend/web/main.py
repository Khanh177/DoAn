# backend/web/main.py
from decimal import Decimal
import os
import asyncio
import logging
import httpx
from fastapi import FastAPI
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from contextlib import asynccontextmanager

from backend.web.core.logging_config import setup_logging
from backend.web.middlewares.cors import setup_cors
from .database import SessionLocal, engine
from .models import models
from .models.models import FuturesInstrument, UserRole, WalletType, GoldInstrument
from .realtime.ws_futures import manager_futures
from .repositories.futures_repo import start_liquidation_checker

from .state.price_cache import price_cache 

# Routers
from .routers.auth import router as auth_router
from .routers.news import router as news_router
from .routers.upload import router as upload_router
from .routers.wallet import router as wallet_router
from .routers.deposit import router as deposit_router
from .routers.vietqr import router as vietqr_router
from .routers.realtime import router as realtime_router
from .routers.domestic_gold_spot import router as domestic_gold_spot_router
from .routers.routes import router as ws_router
from .routers.domestic_spot_trade import router as spot_domestic_router
from .routers.ws_public import router as ws_public_router
from .routers.futures import router as futures_router, wallet_router as wallet_futures_router, price_router
from .routers.ws_futures import router as ws_futures_router
from .routers.spot_world import match_limits_on_price_tick, router as ws_spot_world, push_spot_price
from .routers.p2p_router import router as p2p_router
from .routers.ws_p2p_public import router as p2p_public
from .routers.ws_p2p_user import router as p2p_user
from .routers.p2p_admin import router as p2p_admin
from .routers.ws_p2p_admin import router as ws_p2p_admin
from .repositories.p2p_repo import scheduler
from .routers.complaints import router as complaint_router
from .realtime.ws_complaints import complaint_ws_manager, router as complaint_ws_router
from .routers.gold_ai import router as gold_ai_router

setup_logging()
logger = logging.getLogger("main")

# ENV GoldAPI
GOLDAPI_KEY = os.getenv("GOLDAPI_KEY", "")
GOLDAPI_URL = os.getenv("GOLDAPI_URL", "https://www.goldapi.io/api/XAU/USD")
GOLDAPI_FEED_SEC = max(10, int(os.getenv("GOLDAPI_FEED_SEC", "10"))) 


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def seed_gold_instruments(s: Session):
    rows = [
        dict(symbol="BTMC_SJC",    brand="BTMC SJC",    branch="HN",  display_name="BTMC SJC Hà Nội",        purity="9999", region="VN"),
        dict(symbol="SJC",         brand="SJC",         branch="HCM", display_name="SJC Hồ Chí Minh",        purity="9999", region="VN"),
        dict(symbol="DOJI_HN",     brand="DOJI HN",     branch="HN",  display_name="DOJI Hà Nội",            purity="9999", region="VN"),
        dict(symbol="DOJI_SG",     brand="DOJI SG",     branch="HCM", display_name="DOJI Sài Gòn",           purity="9999", region="VN"),
        dict(symbol="PNJ_HCM",     brand="PNJ TPHCM",   branch="HCM", display_name="PNJ Hồ Chí Minh",        purity="9999", region="VN"),
        dict(symbol="PNJ_HN",      brand="PNJ HÀ NỘI",  branch="HN",  display_name="PNJ Hà Nội",             purity="9999", region="VN"),
        dict(symbol="PHU_QUY_SJC", brand="PHÚ QUÝ SJC", branch="HN",  display_name="Phú Quý SJC Hà Nội",     purity="9999", region="VN"),
    ]
    added = 0
    for r in rows:
        if not s.query(GoldInstrument).filter_by(symbol=r["symbol"]).first():
            s.add(GoldInstrument(**r)); added += 1
    logger.info("Seed gold_instruments: +%d", added)

def seed_futures_instruments(s: Session):
    rows = [dict(
        symbol="XAUUSD_PERP",
        base_asset="XAU",
        quote_asset="USD",
        tick_size=Decimal("0.10"),
        lot_size=Decimal("0.01"),
        status="active",
    )]
    added = 0
    for r in rows:
        if not s.query(FuturesInstrument).filter_by(symbol=r["symbol"]).first():
            s.add(FuturesInstrument(**r)); added += 1
    logger.info("Seed futures_instruments: +%d", added)

async def goldapi_price_feed():
    if not GOLDAPI_KEY:
        logger.warning("GOLDAPI_KEY trống, bỏ qua feed giá.")
        return

    headers = {
        "x-access-token": GOLDAPI_KEY,
        "Accept": "application/json",
        "User-Agent": "xau-feed/1.0",
    }
    backoff = GOLDAPI_FEED_SEC
    async with httpx.AsyncClient(timeout=5.0) as client:
        while True:
            try:
                r = await client.get(GOLDAPI_URL, headers=headers)
                if r.status_code == 403:
                    logger.warning("GoldAPI 403. Tạm dừng %ss.", backoff)
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2, 300)
                    continue
                r.raise_for_status()
                data = r.json()
                price = data.get("price")
                if price is not None:
                    p = float(price)
                    price_cache["price"] = p
                    price_cache["ts"] = data.get("timestamp")

                    try:
                        from decimal import Decimal
                        with SessionLocal() as s:
                            from .routers.spot_world import match_limits_on_price_tick
                            match_limits_on_price_tick(s, Decimal(str(p)))
                    except Exception as e:
                        logger.warning("Match LIMIT lỗi: %s", e)

                    await manager_futures.broadcast(
                        {
                            "type": "xau_price",
                            "symbol": "XAUUSD",
                            "price": p,
                            "ts": price_cache["ts"],
                        }
                    )

                    from .routers.spot_world import push_spot_price
                    await push_spot_price(Decimal(str(p)))

                backoff = GOLDAPI_FEED_SEC
            except Exception as e:
                logger.warning("GoldAPI fetch lỗi: %s", e)
            await asyncio.sleep(GOLDAPI_FEED_SEC)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ===== STARTUP =====
    try:
        with engine.connect():
            logger.info("DB OK.")
        with SessionLocal() as s:
            if not s.query(UserRole).count():
                s.add_all([UserRole(name="Quản lí"), UserRole(name="Người dùng")])
            if not s.query(WalletType).count():
                s.add_all([
                    WalletType(name="Funding"),
                    WalletType(name="Fiat/Spot"),
                    WalletType(name="Futures"),
                ])
            seed_gold_instruments(s)
            seed_futures_instruments(s)
            s.commit()
        logger.info("Seed data completed")
    except Exception as e:
        logger.exception("Seed/DB lỗi: %s", e)

    try:
        scheduler.start()
        logger.info("P2P auto-cancel scheduler started")

        # ĐÚNG CHUẨN – CHỈ 1 DÒNG DUY NHẤT
        asyncio.create_task(goldapi_price_feed())
        logger.info("GoldAPI price feed started.")

        asyncio.create_task(manager_futures.watchdog())
        logger.info("WS watchdog started.")

        start_liquidation_checker()
        logger.info("Liquidation checker started.")
    except Exception as e:
        logger.exception("Lỗi khởi động task: %s", e)

    yield  # App chạy ở đây

    # ===== SHUTDOWN =====
    scheduler.shutdown()
    logger.info("P2P scheduler stopped")

# CHỈ GIỮ 1 DÒNG app NÀY
app = FastAPI(lifespan=lifespan)
setup_cors(app)
models.Base.metadata.create_all(bind=engine)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads") # uploads ảnh cho tin tức
app.mount(
    "/uploads/complaints",
    StaticFiles(directory=Path("public/uploads/complaints")),
    name="complaint_uploads",
) #uploads ảnh cho complaints

app.include_router(auth_router)
app.include_router(news_router)
app.include_router(upload_router)
app.include_router(wallet_router)             # ví tổng thể hiện có
app.include_router(deposit_router)
app.include_router(vietqr_router)
app.include_router(realtime_router)
app.include_router(domestic_gold_spot_router)
app.include_router(ws_router)
app.include_router(spot_domestic_router)
app.include_router(ws_public_router)
app.include_router(futures_router)            # futures open/close/list
app.include_router(wallet_futures_router)     # /wallet/futures
app.include_router(ws_futures_router)        
app.include_router(price_router)
app.include_router(ws_spot_world)
app.include_router(p2p_router)
app.include_router(p2p_public)
app.include_router(p2p_user)
app.include_router(p2p_admin)
app.include_router(ws_p2p_admin)
app.include_router(complaint_router)
app.include_router(complaint_ws_router) 
app.include_router(gold_ai_router)

for name in ("httpx", "httpcore"):
    logging.getLogger(name).setLevel(logging.WARNING)