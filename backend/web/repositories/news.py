from datetime import datetime
from sqlalchemy.orm import Session
from ..models.models import News
from sqlalchemy import case, func

#Lấy danh sách tin tức
def get_all_news(db: Session, skip: int = 0, limit: int = 18):
    return (
        db.query(News)
        .order_by(News.published_date.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

#Tìm kiếm tin tức theo từ khóa
def search_news_by_keyword(db: Session, keyword: str, skip: int = 0, limit: int = 18):
    q_norm = func.unaccent(func.lower(keyword))
    title_norm = func.unaccent(func.lower(News.title))
    rank_expr = case((title_norm.like(func.concat(q_norm, '%')), 0), else_=1)
    return (
        db.query(News)
        .filter(title_norm.ilike(func.concat('%', q_norm, '%')))
        .order_by(rank_expr, func.length(News.title), News.published_date.desc())
        .offset(skip).limit(limit).all()
    )

#Gợi ý tiêu đề tin tức
def suggest_news_titles(db: Session, q: str, limit: int = 8):
    q_norm = func.unaccent(func.lower(q))
    title_norm = func.unaccent(func.lower(News.title))
    rank_expr = case((title_norm.like(func.concat(q_norm, '%')), 0), else_=1)
    return (
        db.query(News.id, News.title)
        .filter(title_norm.ilike(func.concat('%', q_norm, '%')))
        .order_by(rank_expr, func.length(News.title), News.published_date.desc())
        .limit(limit)
        .all()
    )

#Thêm tin tức mới
def create_news(db: Session, *, title: str, description: str, content: str, author: str, image: str | None = None,) -> News:
    n = News(
        title=title,
        description=description,
        content=content,
        author=author,
        image=image,
    )
    db.add(n)
    db.flush()
    return n

def get_news_by_id(db: Session, id: int) -> News | None:
    return db.query(News).filter(News.id == id).first()

#Chỉnh sửa tin tức
def update_news(db: Session, id: int, **fields) -> News | None:
    n = get_news_by_id(db, id)
    if not n:
        return None
    for k, v in fields.items():
        if v is not None:
            setattr(n, k, v)
    db.flush()
    return n

#Xoá tin tức
def delete_news(db: Session, id: int) -> bool:
    n = get_news_by_id(db, id)
    if not n:
        return False
    db.delete(n)
    db.flush()
    return True