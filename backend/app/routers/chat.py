"""API routes for the AI Chat assistant."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.app.models.schemas import ChatRequest, ChatResponse
from backend.app.services.chat_service import ChatService

router = APIRouter(prefix="/api/chat", tags=["chat"])

_service: ChatService | None = None


def init(service: ChatService) -> None:
    global _service
    _service = service


def _svc() -> ChatService:
    if _service is None:
        raise HTTPException(status_code=503, detail="Chat service not initialised")
    return _service


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """Send a message to the AI assistant with optional context."""
    return await _svc().chat(request.messages, request.context)
