import asyncio, logging
from sqlalchemy.orm import Session
from backend.web.database import SessionLocal
from backend.web.repositories.spot_world_repo import match_limit_orders_once

log = logging.getLogger("spot_world_matcher")

async def spot_world_match_loop():
    while True:
        try:
            with SessionLocal() as s:
                with s.begin():
                    match_limit_orders_once(s)
        except Exception as e:
            log.warning("match error: %s", e)
        await asyncio.sleep(2)  # mỗi 2s quét 1 lần
