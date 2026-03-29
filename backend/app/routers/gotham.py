"""API routes for the Gotham knowledge-graph module."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from backend.app.services.gotham_service import GothamService

router = APIRouter(prefix="/api/gotham", tags=["gotham"])

_service: GothamService | None = None


def init(service: GothamService) -> None:
    global _service
    _service = service


def _svc() -> GothamService:
    if _service is None:
        raise HTTPException(status_code=503, detail="Gotham service not initialised")
    return _service


@router.get("/ontology")
async def get_ontology() -> dict:
    """Return the full ontology (all objects and links)."""
    return _svc().get_ontology()


@router.get("/search")
async def search(q: str = Query(..., min_length=1, max_length=200)) -> dict:
    """Search for objects matching the query string."""
    return _svc().search(q)


@router.get("/expand")
async def expand(
    node: str = Query(..., min_length=1),
    depth: int = Query(1, ge=1, le=5),
) -> dict:
    """Expand connections from a node up to the specified depth."""
    return _svc().expand(node, depth)


@router.get("/path")
async def shortest_path(
    from_id: str = Query(..., alias="from", min_length=1),
    to_id: str = Query(..., alias="to", min_length=1),
) -> dict:
    """Find the shortest path between two nodes."""
    return _svc().shortest_path(from_id, to_id)


@router.get("/timeline")
async def timeline() -> list:
    """Return events ordered chronologically."""
    return _svc().get_timeline()
