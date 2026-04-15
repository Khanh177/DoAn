import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Path, Query, status, UploadFile, File
from sqlalchemy.orm import Session

from backend.web.models.models import User
from ..database import get_db
from ..repositories.news import delete_news, get_all_news, search_news_by_keyword, suggest_news_titles, create_news, update_news
from ..schemas.news import NewsCreate, NewsOut, NewsSuggestOut, NewsUpdate
from ..core.deps import require_role_ids
import shutil, os, uuid

logger = logging.getLogger("news")
router = APIRouter(prefix="/news", tags=["news"])

#Lấy danh sách tin tức
@router.get("", response_model=List[NewsOut])
def list_news(
    skip: int = Query(0, ge=0, description="Số mục bỏ qua"),
    limit: int = Query(18, ge=1, le=10000, description="Số mục tối đa trả về"),
    db: Session = Depends(get_db)
):
    logger.info("List news: skip=%d, limit=%d", skip, limit)
    news_list = get_all_news(db, skip=skip, limit=limit)
    return news_list

#Tìm kiếm tin tức theo từ khóa
@router.get("/search", response_model=List[NewsOut])
def search_news(
    q: str = Query(..., min_length=1),
    skip: int = Query(0, ge=0),
    limit: int = Query(18, ge=1, le=10000),
    db: Session = Depends(get_db),
):
    return search_news_by_keyword(db, keyword=q, skip=skip, limit=limit)

# Gợi ý tiêu đề dùng cho autocomplete
@router.get("/suggest", response_model=List[NewsSuggestOut])
def suggest_news(q: str = Query(..., min_length=1), limit: int = Query(8, ge=1, le=20), db: Session = Depends(get_db)):
    return suggest_news_titles(db, q=q, limit=limit)

#Thêm tin tức mới
@router.post("/add_news", response_model=NewsOut, status_code=status.HTTP_201_CREATED)
def add_news(payload: NewsCreate,
             _user=Depends(require_role_ids(1)),   # chỉ admin (role_id=1)
             db: Session = Depends(get_db)):
    try:
        news = create_news(db, **payload.model_dump())
        db.commit()
        logger.info("News created with ID: %d", news.id)
        db.refresh(news)
        return news
    except Exception as e:
        db.rollback()
        logger.error(f"Lỗi khi tạo tin tức: {e}")
        raise HTTPException(status_code=500, detail="Lỗi khi tạo tin tức")
    
#Chỉnh sửa tin tức
@router.put("/{news_id}", response_model=NewsOut)
def edit_news(
    news_id: int = Path(..., ge=1),
    payload: NewsUpdate = ...,
    current_user: User = Depends(require_role_ids(1)),
    db: Session = Depends(get_db),
):
    logger.info("Edit request: news_id=%s by user_id=%s", news_id, current_user.id)
    try:
        n = update_news(db, news_id, **payload.model_dump(exclude_unset=True))
        if not n:
            logger.warning("Edit failed: not found (news_id=%s, user_id=%s)", news_id, current_user.id)
            raise HTTPException(status_code=404, detail="Không tìm thấy tin tức")
        db.commit()
        db.refresh(n)
        logger.info("Edit success: news_id=%s by user_id=%s", news_id, current_user.id)
        return n
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        # In stacktrace:
        logger.exception("Edit error: news_id=%s by user_id=%s | %s", news_id, current_user.id, str(e))
        raise HTTPException(status_code=500, detail="Lỗi khi chỉnh sửa tin tức")

#Xóa tin tức
@router.delete("/{news_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_news(
    news_id: int = Path(..., ge=1),
    current_user: User = Depends(require_role_ids(1)),
    db: Session = Depends(get_db),
):
    logger.info("Delete request: news_id=%s by user_id=%s", news_id, current_user.id)
    try:
        ok = delete_news(db, news_id)
        if not ok:
            logger.warning("Delete failed: not found (news_id=%s, user_id=%s)", news_id, current_user.id)
            raise HTTPException(status_code=404, detail="Không tìm thấy tin tức")
        db.commit()
        logger.info("Delete success: news_id=%s by user_id=%s", news_id, current_user.id)
        return
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.exception("Delete error: news_id=%s by user_id=%s | %s", news_id, current_user.id, str(e))
        raise HTTPException(status_code=500, detail="Lỗi khi xóa tin tức")
        
        