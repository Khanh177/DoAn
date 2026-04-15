import os
from dotenv import load_dotenv

# Tìm thư mục backend
basedir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.abspath(os.path.join(basedir, "..", ".."))

# Load .env nằm trong thư mục backend
load_dotenv(os.path.join(root_dir, ".env"))

DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL is None:
    raise Exception("DATABASE_URL not found in .env file")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

engine = create_engine(DATABASE_URL, echo=True)
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    expire_on_commit=False, 
    bind=engine,
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
