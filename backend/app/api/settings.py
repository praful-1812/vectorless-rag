"""User settings and LLM provider management."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import User, LLMProvider, RememberedContext
from app.api.deps import get_current_user

router = APIRouter()


# --- User Settings ---

class UserSettingsResponse(BaseModel):
    file_scoped_enabled: bool
    collections_enabled: bool
    knowledge_comparison_enabled: bool
    deduplication_notices_enabled: bool


class UpdateSettingsRequest(BaseModel):
    file_scoped_enabled: bool | None = None
    collections_enabled: bool | None = None
    knowledge_comparison_enabled: bool | None = None
    deduplication_notices_enabled: bool | None = None


@router.get("/", response_model=UserSettingsResponse)
async def get_settings(user: User = Depends(get_current_user)):
    return UserSettingsResponse(
        file_scoped_enabled=user.file_scoped_enabled,
        collections_enabled=user.collections_enabled,
        knowledge_comparison_enabled=user.knowledge_comparison_enabled,
        deduplication_notices_enabled=user.deduplication_notices_enabled,
    )


@router.patch("/")
async def update_settings(
    req: UpdateSettingsRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    for field, value in req.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    await db.commit()
    return {"status": "updated"}


# --- LLM Providers ---

class AddProviderRequest(BaseModel):
    provider_name: str  # openai, anthropic, google, ollama
    api_key: str
    models: list[str] = []


class ProviderResponse(BaseModel):
    id: int
    provider_name: str
    models: list
    is_active: bool
    masked_key: str = ""
    api_key: str = ""

    class Config:
        from_attributes = True


@router.post("/providers", response_model=ProviderResponse)
async def add_provider(
    req: AddProviderRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    provider = LLMProvider(
        user_id=user.id,
        provider_name=req.provider_name,
        api_key=req.api_key,  # TODO: encrypt
        models=req.models,
    )
    db.add(provider)
    await db.commit()
    await db.refresh(provider)
    return ProviderResponse(
        id=provider.id,
        provider_name=provider.provider_name,
        models=provider.models,
        is_active=provider.is_active,
        masked_key=provider.api_key[:4] + "••••••••" + provider.api_key[-4:] if len(provider.api_key) > 8 else "••••••••",
        api_key=provider.api_key,
    )


@router.get("/providers", response_model=list[ProviderResponse])
async def list_providers(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(LLMProvider).where(LLMProvider.user_id == user.id))
    providers = result.scalars().all()
    return [
        ProviderResponse(
            id=p.id, provider_name=p.provider_name, models=p.models, is_active=p.is_active,
            masked_key=p.api_key[:4] + "••••••••" + p.api_key[-4:] if len(p.api_key) > 8 else "••••••••",
            api_key=p.api_key,
        )
        for p in providers
    ]


@router.delete("/providers/{provider_id}")
async def delete_provider(
    provider_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(LLMProvider).where(LLMProvider.id == provider_id, LLMProvider.user_id == user.id)
    )
    provider = result.scalar_one_or_none()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    await db.delete(provider)
    await db.commit()
    return {"status": "deleted"}


# --- Remembered Context (Persistent Knowledge Base) ---

class ContextItemResponse(BaseModel):
    id: int
    key: str
    value: str

    class Config:
        from_attributes = True


@router.get("/memory", response_model=list[ContextItemResponse])
async def get_memory(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(RememberedContext).where(RememberedContext.user_id == user.id)
    )
    items = result.scalars().all()
    return [ContextItemResponse(id=i.id, key=i.key, value=i.value) for i in items]


@router.delete("/memory/{item_id}")
async def delete_memory_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(RememberedContext).where(RememberedContext.id == item_id, RememberedContext.user_id == user.id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Memory item not found")
    await db.delete(item)
    await db.commit()
    return {"status": "deleted"}
