"""Authentication endpoints."""

import os
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File as FastAPIFile
from fastapi.responses import FileResponse as FastAPIFileResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from jose import jwt
import bcrypt

from app.config import settings
from app.db.database import get_db
from app.db.models import User
from app.api.deps import get_current_user

router = APIRouter()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode()[:72], hashed.encode())


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=req.email,
        hashed_password=hash_password(req.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token)


class UserResponse(BaseModel):
    id: int
    email: str
    display_name: str | None = None
    avatar_url: str | None = None


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    avatar_url = f"/api/auth/profile/avatar/{user.id}" if user.avatar_path else None
    return UserResponse(id=user.id, email=user.email, display_name=user.display_name, avatar_url=avatar_url)


class UpdateProfileRequest(BaseModel):
    display_name: str | None = None


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    req: UpdateProfileRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if req.display_name is not None:
        user.display_name = req.display_name.strip()[:50]  # Max 50 chars
    await db.commit()
    await db.refresh(user)
    avatar_url = f"/api/auth/profile/avatar/{user.id}" if user.avatar_path else None
    return UserResponse(id=user.id, email=user.email, display_name=user.display_name, avatar_url=avatar_url)


@router.post("/profile/avatar", response_model=UserResponse)
async def upload_avatar(
    file: UploadFile = FastAPIFile(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Validate file type
    allowed_types = {"image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only image files (PNG, JPG, GIF, WebP) are allowed")

    # Save avatar
    avatar_dir = os.path.join(settings.UPLOAD_DIR, "avatars")
    os.makedirs(avatar_dir, exist_ok=True)

    ext = os.path.splitext(file.filename or "avatar.png")[1] or ".png"
    avatar_filename = f"user_{user.id}{ext}"
    avatar_path = os.path.join(avatar_dir, avatar_filename)

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:  # 5MB limit
        raise HTTPException(status_code=400, detail="Avatar file must be under 5MB")

    with open(avatar_path, "wb") as f:
        f.write(content)

    # Update user record
    user.avatar_path = avatar_path
    await db.commit()
    await db.refresh(user)

    avatar_url = f"/api/auth/profile/avatar/{user.id}"
    return UserResponse(id=user.id, email=user.email, display_name=user.display_name, avatar_url=avatar_url)


@router.get("/profile/avatar/{user_id}")
async def get_avatar(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.avatar_path or not os.path.exists(user.avatar_path):
        raise HTTPException(status_code=404, detail="Avatar not found")
    return FastAPIFileResponse(user.avatar_path)
