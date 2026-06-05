"""Chat session and messaging endpoints."""

import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import User, ChatSession, Message, LLMProvider
from app.api.deps import get_current_user
from app.services.retrieval import retrieve_passages
from app.services.llm import generate_response, set_api_key_for_model


def _progress_event(stage: str, message: str) -> str:
    """Encode a progress event as a single SSE-style line."""
    return json.dumps({"type": "progress", "stage": stage, "message": message}) + "\n"


def _content_event(text: str) -> str:
    """Encode a content chunk."""
    return json.dumps({"type": "content", "text": text}) + "\n"


def _done_event() -> str:
    """Signal end of stream."""
    return json.dumps({"type": "done"}) + "\n"

router = APIRouter()


class CreateSessionRequest(BaseModel):
    title: str = "New Chat"
    model: str | None = None


class SessionResponse(BaseModel):
    id: int
    title: str
    selected_model: str | None
    created_at: str

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    message: str
    file_ids: list[int] = []
    model: str | None = None


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    retrieved_passages: list = []
    traversal_path: list = []
    created_at: str

    class Config:
        from_attributes = True


@router.post("/sessions", response_model=SessionResponse)
async def create_session(
    req: CreateSessionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    session = ChatSession(user_id=user.id, title=req.title, selected_model=req.model)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return SessionResponse(
        id=session.id,
        title=session.title,
        selected_model=session.selected_model,
        created_at=session.created_at.isoformat(),
    )


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChatSession).where(ChatSession.user_id == user.id).order_by(ChatSession.created_at.desc())
    )
    sessions = result.scalars().all()
    return [
        SessionResponse(
            id=s.id, title=s.title, selected_model=s.selected_model, created_at=s.created_at.isoformat()
        )
        for s in sessions
    ]


@router.get("/sessions/{session_id}/messages", response_model=list[MessageResponse])
async def get_messages(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.execute(
        select(Message).where(Message.session_id == session_id).order_by(Message.created_at)
    )
    messages = result.scalars().all()
    return [
        MessageResponse(
            id=m.id,
            role=m.role,
            content=m.content,
            retrieved_passages=m.retrieved_passages or [],
            traversal_path=m.traversal_path or [],
            created_at=m.created_at.isoformat(),
        )
        for m in messages
    ]


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Delete messages first
    await db.execute(
        select(Message).where(Message.session_id == session_id)
    )
    from sqlalchemy import delete as sql_delete
    await db.execute(sql_delete(Message).where(Message.session_id == session_id))
    await db.delete(session)
    await db.commit()
    return {"ok": True}


@router.post("/sessions/{session_id}/messages")
async def send_message(
    session_id: int,
    req: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Verify session belongs to user
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.user_id == user.id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Save user message
    user_msg = Message(
        session_id=session_id,
        role="user",
        content=req.message,
        selected_file_ids=req.file_ids,
    )
    db.add(user_msg)
    await db.commit()

    # Retrieve relevant passages via tree traversal
    model = req.model or session.selected_model

    # Load user's API key from database and set it in environment
    if model:
        prefix = model.split("/")[0] if "/" in model else model
        provider_map = {"gemini": "google", "openai": "openai", "anthropic": "anthropic"}
        provider_name = provider_map.get(prefix)
        if provider_name:
            provider_result = await db.execute(
                select(LLMProvider).where(
                    LLMProvider.user_id == user.id,
                    LLMProvider.provider_name == provider_name,
                )
            )
            provider = provider_result.scalar_one_or_none()
            if provider and provider.api_key:
                set_api_key_for_model(model, provider.api_key)

    # Generate streaming response with progress events
    async def stream():
        # Stage 1: Retrieving passages
        yield _progress_event("retrieving", f"Searching through {len(req.file_ids)} file(s)...")

        passages, traversal_path = await retrieve_passages(
            user_id=user.id,
            file_ids=req.file_ids,
            query=req.message,
            model=model,
            db=db,
        )

        # Stage 2: Generating response
        num_passages = len(passages) if passages else 0
        yield _progress_event("generating", f"Found {num_passages} relevant passage(s), generating response...")

        full_response = ""
        async for chunk in generate_response(
            query=req.message,
            passages=passages,
            model=model,
            user=user,
            db=db,
        ):
            full_response += chunk
            yield _content_event(chunk)

        # Done
        yield _done_event()

        # Save assistant message after stream completes
        assistant_msg = Message(
            session_id=session_id,
            role="assistant",
            content=full_response,
            retrieved_passages=passages,
            traversal_path=traversal_path,
        )
        db.add(assistant_msg)
        await db.commit()

    return StreamingResponse(stream(), media_type="application/x-ndjson")
