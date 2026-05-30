"""File upload and management endpoints."""

import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FastAPIFile, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.database import get_db
from app.db.models import User, File
from app.api.deps import get_current_user
from app.services.ingestion import ingest_file

router = APIRouter()


class FileResponse(BaseModel):
    id: int
    name: str
    file_type: str
    size: int
    tree_built: bool
    uploaded_at: str

    class Config:
        from_attributes = True


@router.post("/upload", response_model=FileResponse)
async def upload_file(
    file: UploadFile = FastAPIFile(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Save file to disk
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(settings.UPLOAD_DIR, f"{user.id}_{file.filename}")

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # Create DB record
    db_file = File(
        user_id=user.id,
        name=file.filename,
        file_type=file.content_type or "unknown",
        size=len(content),
        storage_path=file_path,
    )
    db.add(db_file)
    await db.commit()
    await db.refresh(db_file)

    # Trigger background ingestion (MarkItDown + tree building)
    background_tasks.add_task(ingest_file, db_file.id)

    return FileResponse(
        id=db_file.id,
        name=db_file.name,
        file_type=db_file.file_type,
        size=db_file.size,
        tree_built=db_file.tree_built,
        uploaded_at=db_file.uploaded_at.isoformat(),
    )


@router.get("/", response_model=list[FileResponse])
async def list_files(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(File).where(File.user_id == user.id))
    files = result.scalars().all()
    return [
        FileResponse(
            id=f.id,
            name=f.name,
            file_type=f.file_type,
            size=f.size,
            tree_built=f.tree_built,
            uploaded_at=f.uploaded_at.isoformat(),
        )
        for f in files
    ]


@router.delete("/{file_id}")
async def delete_file(
    file_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(File).where(File.id == file_id, File.user_id == user.id))
    db_file = result.scalar_one_or_none()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    # Delete from disk
    if os.path.exists(db_file.storage_path):
        os.remove(db_file.storage_path)

    await db.delete(db_file)
    await db.commit()
    return {"status": "deleted"}
