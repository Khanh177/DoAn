from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class NewsCreate(BaseModel):
    title: str
    description: str
    content: str
    author: str
    image: Optional[str] = None

class NewsUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    author: Optional[str] = None
    image: Optional[str] = None

class NewsOut(BaseModel):
    id: int
    title: str
    description: str
    content: str
    published_date: Optional[datetime] = None
    author: str
    image: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class NewsSuggestOut(BaseModel):
    id: int
    title: str
