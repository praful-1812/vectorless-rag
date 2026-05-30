"""Chat session and messaging endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.models import User, ChatSession, Message
from app.api.deps import get_current_user
from app.services.retrieval import retrieve_passages
from app.services.llm import generate_response

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
    passages, traversal_path = await retrieve_passages(
        user_id=user.id,
        file_ids=req.file_ids,
        query=req.message,
        model=model,
        db=db,
    )

    # Generate streaming response
    async def stream():
        full_response = ""
        async for chunk in generate_response(
            query=req.message,
            passages=passages,
            model=model,
            user=user,
            db=db,
        ):
            full_response += chunk
            yield chunk

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

    return StreamingResponse(stream(), media_type="text/plain")
