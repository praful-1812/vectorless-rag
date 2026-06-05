"""SQLAlchemy models."""

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, ForeignKey, JSON, Enum
)
from sqlalchemy.orm import relationship
import enum

from app.db.database import Base


class TreeNodeLevel(str, enum.Enum):
    ROOT = "root"
    BRANCH = "branch"
    LEAF = "leaf"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    display_name = Column(String, nullable=True)
    avatar_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Settings
    file_scoped_enabled = Column(Boolean, default=True)
    collections_enabled = Column(Boolean, default=True)
    knowledge_comparison_enabled = Column(Boolean, default=False)
    deduplication_notices_enabled = Column(Boolean, default=True)

    # Relationships
    files = relationship("File", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("ChatSession", back_populates="user", cascade="all, delete-orphan")
    llm_providers = relationship("LLMProvider", back_populates="user", cascade="all, delete-orphan")
    remembered_context = relationship("RememberedContext", back_populates="user", cascade="all, delete-orphan")


class LLMProvider(Base):
    __tablename__ = "llm_providers"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    provider_name = Column(String, nullable=False)  # openai, anthropic, google, ollama
    api_key = Column(String, nullable=False)  # encrypted
    models = Column(JSON, default=list)  # available models
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="llm_providers")


class File(Base):
    __tablename__ = "files"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    size = Column(Integer, nullable=False)
    storage_path = Column(String, nullable=False)
    markdown_content = Column(Text, nullable=True)
    tree_built = Column(Boolean, default=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="files")
    tree_nodes = relationship("TreeNode", back_populates="file", cascade="all, delete-orphan")


class TreeNode(Base):
    __tablename__ = "tree_nodes"

    id = Column(Integer, primary_key=True)
    file_id = Column(Integer, ForeignKey("files.id"), nullable=False)
    parent_id = Column(Integer, ForeignKey("tree_nodes.id"), nullable=True)
    level = Column(Enum(TreeNodeLevel), nullable=False)
    content = Column(Text, nullable=False)  # raw text for leaf, summary for branch/root
    source_location = Column(String, nullable=True)  # section/page reference
    order_index = Column(Integer, default=0)  # ordering among siblings

    file = relationship("File", back_populates="tree_nodes")
    children = relationship("TreeNode", backref="parent", remote_side=[id], cascade="all, delete-orphan", single_parent=True)


class Collection(Base):
    __tablename__ = "collections"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    file_ids = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, default="New Chat")
    selected_model = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="sessions")
    messages = relationship("Message", back_populates="session", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id"), nullable=False)
    role = Column(String, nullable=False)  # user, assistant
    content = Column(Text, nullable=False)
    selected_file_ids = Column(JSON, default=list)
    retrieved_passages = Column(JSON, default=list)  # [{node_id, content, source_location}]
    traversal_path = Column(JSON, default=list)  # node ids visited
    feedback = Column(String, nullable=True)  # thumbs_up, thumbs_down
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("ChatSession", back_populates="messages")


class RememberedContext(Base):
    __tablename__ = "remembered_context"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    key = Column(String, nullable=False)
    value = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="remembered_context")
