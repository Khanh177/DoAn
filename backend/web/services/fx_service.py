import time, httpx, os
from decimal import Decimal, ROUND_HALF_UP

FX_FULL_URL = os.getenv("FX_FULL_URL")
FX_TTL_SECONDS = int(os.getenv("FX_TTL_SECONDS", "300"))
if not FX_FULL_URL:
    raise RuntimeError("FX_FULL_URL not set")

_cache = {"t": 0.0, "rate": None}

class FxError(RuntimeError): ...

def _should_retry(status: int) -> bool:
    return status in (429, 500, 502, 503, 504)

def vnd_per_usdt() -> Decimal:
    now = time.time()
    if _cache["rate"] and now - _cache["t"] < FX_TTL_SECONDS:
        return _cache["rate"]

    last_exc = None
    for attempt in range(3):  # tối đa 3 lần
        try:
            r = httpx.get(FX_FULL_URL, timeout=6)
            if _should_retry(r.status_code):
                raise httpx.HTTPStatusError(
                    f"{r.status_code}", request=r.request, response=r
                )
            r.raise_for_status()
            j = r.json()
            usd = Decimal(str(j["rates"]["USD"]))
            vnd = Decimal(str(j["rates"]["VND"]))
            if usd <= 0 or vnd <= 0:
                raise FxError("bad_rates")
            rate = (vnd / usd).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
            _cache.update({"t": now, "rate": rate})
            return rate
        except (httpx.HTTPError, ValueError, KeyError) as e:
            last_exc = e
            # nếu còn lượt thì ngủ backoff rồi thử lại
            if isinstance(e, httpx.HTTPStatusError) and _should_retry(e.response.status_code):
                time.sleep(0.3 * (2 ** attempt))
                continue
            break

    # lỗi nhưng có cache cũ → trả cache để không làm rơi app
    if _cache["rate"]:
        return _cache["rate"]
    raise FxError(f"fx_unavailable: {last_exc}")
