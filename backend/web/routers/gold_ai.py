# backend/web/routers/gold_ai.py

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Query, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc

from ..ml.gold_forecast import forecast_gold
from ..database import get_db
from ..models.models import GoldForecast, GoldForecastItem, GoldChatMessage, User
# Nếu muốn lưu theo user thật sự thì import thêm:
# from ..core.deps import get_current_user

router = APIRouter(prefix="/ai/gold", tags=["AI Gold"])


# ==================== PYDANTIC MODELS ====================

class ForecastItem(BaseModel):
    date: str
    price: float
    change_pct: float


class HistoryPoint(BaseModel):
    date: str
    price: float
    change_pct: Optional[float] = None


class ForecastResponse(BaseModel):
    today_price: float
    today_date: Optional[str] = None
    items: List[ForecastItem]
    max_price: float
    min_price: float
    range: float
    history: Optional[List[HistoryPoint]] = None


class ChatMessageCreate(BaseModel):
    user_id: Optional[int] = None
    role: str  # 'user' hoặc 'bot'
    text: str


class ChatMessageResponse(BaseModel):
    id: int
    user_id: Optional[int]
    role: str
    text: str
    created_at: datetime

    class Config:
        from_attributes = True


class ForecastHistoryResponse(BaseModel):
    id: int
    forecast_date: datetime
    days: int
    today_price: float
    min_price: float
    max_price: float
    range_price: float
    model_version: str
    items_count: int

    class Config:
        from_attributes = True


# ==================== ENDPOINTS ====================

@router.get("/forecast", response_model=ForecastResponse)
def get_gold_forecast(
    days: int = Query(7, ge=1, le=30),
    db: Session = Depends(get_db),
    # Nếu muốn lưu theo user đăng nhập:
    # current_user: User = Depends(get_current_user),
):
    """
    Dự đoán giá vàng cho số ngày tương lai.
    """
    # Gọi model AI
    result = forecast_gold(days)

    # user_id = current_user.id nếu bạn bật auth, còn không cứ để None
    user_id = None

    # Clear cờ is_latest các bản cũ của user_id này
    db.query(GoldForecast).filter(
        GoldForecast.user_id == user_id,
        GoldForecast.is_latest == True,
    ).update({GoldForecast.is_latest: False})

    # Tạo bản ghi GoldForecast
    gf = GoldForecast(
        user_id=user_id,
        forecast_date=datetime.utcnow(),
        days=days,
        today_price=result["today_price"],
        min_price=result["min_price"],
        max_price=result["max_price"],
        range_price=result["range"],
        model_version="v1.0",
        is_latest=True,
    )
    db.add(gf)
    db.flush()  # lấy gf.id

    # Tạo các GoldForecastItem
    for item in result["items"]:
        db.add(
            GoldForecastItem(
                forecast_id=gf.id,
                forecast_date=datetime.fromisoformat(item["date"]),
                price=item["price"],
                change_pct=item["change_pct"],
            )
        )

    db.commit()

    # Trả lại cho FE dùng như cũ
    return result


@router.post("/chat/message", response_model=ChatMessageResponse)
def save_chat_message(
    message: ChatMessageCreate,
    db: Session = Depends(get_db),
):
    """
    Lưu tin nhắn chat (từ user hoặc bot).
    """
    chat_msg = GoldChatMessage(
        user_id=message.user_id,
        role=message.role,
        text=message.text,
        created_at=datetime.utcnow(),
    )
    db.add(chat_msg)
    db.commit()
    db.refresh(chat_msg)
    
    return chat_msg


@router.get("/chat/history", response_model=List[ChatMessageResponse])
def get_chat_history(
    user_id: Optional[int] = Query(None, description="ID người dùng, để None nếu chưa đăng nhập"),
    limit: int = Query(100, ge=1, le=500, description="Số tin nhắn tối đa trả về"),
    offset: int = Query(0, ge=0, description="Vị trí bắt đầu (phân trang)"),
    db: Session = Depends(get_db),
):
    """
    Lấy lịch sử chat dự đoán giá vàng.
    - Nếu user_id = None: lấy tất cả tin nhắn (dành cho guest hoặc xem toàn bộ)
    - Nếu có user_id: chỉ lấy tin nhắn của user đó
    """
    query = db.query(GoldChatMessage)
    
    if user_id is not None:
        query = query.filter(GoldChatMessage.user_id == user_id)
    
    messages = (
        query
        .order_by(GoldChatMessage.id.asc())  # Sắp xếp theo thứ tự thời gian
        .offset(offset)
        .limit(limit)
        .all()
    )
    
    return messages


@router.delete("/chat/history")
def clear_chat_history(
    user_id: Optional[int] = Query(None, description="ID người dùng"),
    db: Session = Depends(get_db),
):
    """
    Xóa toàn bộ lịch sử chat.
    - Nếu user_id = None: xóa tất cả (nguy hiểm, chỉ dùng cho admin)
    - Nếu có user_id: chỉ xóa chat của user đó
    """
    query = db.query(GoldChatMessage)
    
    if user_id is not None:
        query = query.filter(GoldChatMessage.user_id == user_id)
    
    deleted_count = query.delete()
    db.commit()
    
    return {"message": f"Đã xóa {deleted_count} tin nhắn"}


@router.get("/forecasts/history", response_model=List[ForecastHistoryResponse])
def get_forecast_history(
    user_id: Optional[int] = Query(None, description="ID người dùng"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Lấy lịch sử các lần dự đoán giá vàng.
    """
    query = db.query(GoldForecast)
    
    if user_id is not None:
        query = query.filter(GoldForecast.user_id == user_id)
    
    forecasts = (
        query
        .order_by(desc(GoldForecast.forecast_date))
        .offset(offset)
        .limit(limit)
        .all()
    )
    
    # Đếm số items cho mỗi forecast
    result = []
    for forecast in forecasts:
        items_count = len(forecast.items)
        result.append(
            ForecastHistoryResponse(
                id=forecast.id,
                forecast_date=forecast.forecast_date,
                days=forecast.days,
                today_price=float(forecast.today_price),
                min_price=float(forecast.min_price),
                max_price=float(forecast.max_price),
                range_price=float(forecast.range_price),
                model_version=forecast.model_version,
                items_count=items_count,
            )
        )
    
    return result


@router.get("/forecasts/{forecast_id}", response_model=ForecastResponse)
def get_forecast_detail(
    forecast_id: int,
    db: Session = Depends(get_db),
):
    """
    Lấy chi tiết một lần dự đoán cụ thể (bao gồm các items).
    """
    forecast = db.query(GoldForecast).filter(GoldForecast.id == forecast_id).first()
    
    if not forecast:
        raise HTTPException(status_code=404, detail="Không tìm thấy dự đoán")
    
    items = [
        ForecastItem(
            date=item.forecast_date.date().isoformat(),
            price=float(item.price),
            change_pct=float(item.change_pct) if item.change_pct else 0.0,
        )
        for item in forecast.items
    ]
    
    return ForecastResponse(
        today_price=float(forecast.today_price),
        today_date=forecast.forecast_date.date().isoformat(),
        items=items,
        max_price=float(forecast.max_price),
        min_price=float(forecast.min_price),
        range=float(forecast.range_price),
        history=None,  # Có thể thêm nếu cần
    )


@router.get("/forecasts/latest")
def get_latest_forecast(
    user_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Lấy dự đoán mới nhất (theo cờ is_latest).
    """
    query = db.query(GoldForecast).filter(GoldForecast.is_latest == True)
    
    if user_id is not None:
        query = query.filter(GoldForecast.user_id == user_id)
    
    forecast = query.order_by(desc(GoldForecast.forecast_date)).first()
    
    if not forecast:
        raise HTTPException(status_code=404, detail="Không có dự đoán nào")
    
    items = [
        ForecastItem(
            date=item.forecast_date.date().isoformat(),
            price=float(item.price),
            change_pct=float(item.change_pct) if item.change_pct else 0.0,
        )
        for item in forecast.items
    ]
    
    return ForecastResponse(
        today_price=float(forecast.today_price),
        today_date=forecast.forecast_date.date().isoformat(),
        items=items,
        max_price=float(forecast.max_price),
        min_price=float(forecast.min_price),
        range=float(forecast.range_price),
        history=None,
    )