import os, uuid, shutil
from fastapi import APIRouter, UploadFile, File, HTTPException, status, Request, Depends
from fastapi.responses import JSONResponse
from ..core.deps import require_role_ids

UPLOAD_DIR = os.path.join(os.getcwd(), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/upload", tags=["files"])

@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_image(
    request: Request,
    file: UploadFile = File(...),
    _user = Depends(require_role_ids(1)) 
):
    # Validate cơ bản
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Chỉ cho phép upload ảnh")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        raise HTTPException(status_code=400, detail="Định dạng ảnh không hợp lệ")

    fname = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, fname)
    try:
        with open(path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        file.file.close()

    # Trả về URL tĩnh (đã mount ở main.py)
    url = request.url_for("uploads", path=fname) 
    return {"url": str(url)}
