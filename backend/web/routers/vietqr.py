from fastapi import APIRouter
import logging

from ..core.config import BANK_BIN, ACCOUNT_NUMBER, RECEIVER_NAME, RECEIVER_CITY, BANK_NAME

router = APIRouter(prefix="/vietqr", tags=["vietqr"])
log = logging.getLogger(__name__)

@router.get("/bank-info")
def bank_info():
    return {
        "bank_name": BANK_NAME,
        "bank_bin": BANK_BIN,
        "account_number": ACCOUNT_NUMBER,
        "receiver_name": RECEIVER_NAME,
        "receiver_city": RECEIVER_CITY,
    }

