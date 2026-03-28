"""AI Chat service for HCMN.

Provides contextual AI assistance about live camera feeds, tracked areas,
and CSI presence data. Uses OpenAI-compatible API.
"""

from __future__ import annotations

import logging
import time

import httpx

from backend.app.config import Settings
from backend.app.models.schemas import ChatMessage, ChatResponse

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are the HCMN AI Assistant — an expert analyst integrated into the \
Human Centralized Mesh Network surveillance and monitoring platform.

You help users understand:
- Live camera feeds (traffic, weather, city cameras) — what's visible, \
  traffic conditions, weather observations.
- Satellite and GPS tracking data — aircraft, vessels, satellite passes, \
  ISS activity near pinned locations.
- Crime reports and public safety data for geographic areas.
- Wi-Fi CSI presence detection readings and room environment mapping.

Be concise, factual, and helpful. When referencing specific data, cite the \
source (e.g. "OpenSky data shows…", "The DOT traffic cam shows…"). \
If you don't have real-time data, say so clearly.
"""


class ChatService:
    """Handles AI chat interactions with context awareness."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def chat(
        self,
        messages: list[ChatMessage],
        context: dict | None = None,
    ) -> ChatResponse:
        """Send messages to the AI with optional context about what the user is viewing."""

        system_content = SYSTEM_PROMPT
        if context:
            system_content += "\n\nCurrent context provided by the platform:\n"
            for key, val in context.items():
                system_content += f"- {key}: {val}\n"

        api_messages = [{"role": "system", "content": system_content}]
        for msg in messages:
            api_messages.append({"role": msg.role, "content": msg.content})

        if not self._settings.openai_api_key:
            return self._fallback_response(messages, context)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self._settings.openai_base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self._settings.openai_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self._settings.openai_model,
                        "messages": api_messages,
                        "max_tokens": 1024,
                        "temperature": 0.7,
                    },
                )
                resp.raise_for_status()
                data = resp.json()

            reply = data["choices"][0]["message"]["content"]
            return ChatResponse(reply=reply, sources=["openai"])
        except httpx.HTTPError:
            logger.exception("OpenAI API call failed")
            return self._fallback_response(messages, context)

    def _fallback_response(
        self,
        messages: list[ChatMessage],
        context: dict | None = None,
    ) -> ChatResponse:
        """Generate a contextual response when no AI API is available."""
        last_msg = messages[-1].content.lower() if messages else ""
        ctx = context or {}

        if "camera" in last_msg or "feed" in last_msg or "video" in last_msg:
            feeds = ctx.get("active_feeds", "no feeds currently selected")
            reply = (
                f"Currently monitoring: {feeds}. "
                "I can provide information about traffic conditions, "
                "weather observations, and activity visible in the selected feeds. "
                "Note: AI API key not configured — using built-in analysis."
            )
        elif "crime" in last_msg or "safety" in last_msg or "police" in last_msg:
            location = ctx.get("pinned_location", "no location pinned")
            reply = (
                f"Analyzing safety data for: {location}. "
                "Crime reports are sourced from public databases. "
                "Current heat map shows recent incident clustering. "
                "Note: Connect AI API for deeper analysis."
            )
        elif "satellite" in last_msg or "iss" in last_msg or "starlink" in last_msg:
            reply = (
                "Satellite tracking is active. The ISS orbits at ~420km altitude, "
                "completing an orbit every ~90 minutes. Starlink satellites operate "
                "at ~550km. I can track passes for your pinned location. "
                "Note: Configure AI API key for real-time analysis."
            )
        elif "aircraft" in last_msg or "plane" in last_msg or "faa" in last_msg or "flight" in last_msg:
            reply = (
                "Aircraft data sourced from OpenSky Network. "
                "I can identify flights, airlines, altitudes, and heading "
                "for aircraft near your pinned location. "
                "Note: AI API key not configured for detailed analysis."
            )
        elif "presence" in last_msg or "csi" in last_msg or "wifi" in last_msg or "room" in last_msg:
            reply = (
                "Wi-Fi CSI module is active. Signal analysis can differentiate "
                "between people and stationary objects by examining signal variance "
                "and density patterns from your router's reflected signals. "
                "Higher variance indicates movement (people), while stable signals "
                "indicate furniture and walls."
            )
        else:
            reply = (
                "Welcome to HCMN AI Assistant. I can help you with:\n"
                "• **Camera feeds** — traffic, weather, and activity analysis\n"
                "• **Tracking data** — aircraft, vessels, satellites near your location\n"
                "• **Crime reports** — public safety data and heat maps\n"
                "• **Wi-Fi CSI** — presence detection and room mapping\n\n"
                "What would you like to know?"
            )

        return ChatResponse(reply=reply, sources=["built-in"])
