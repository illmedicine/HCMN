"""Service for the Gotham knowledge graph — ontology, link analysis, and search."""

from __future__ import annotations

import logging
from collections import deque
from typing import Any

from backend.app.config import Settings

logger = logging.getLogger(__name__)


class GothamService:
    """In-memory knowledge graph with ontology objects, links, and traversal."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._objects: dict[str, dict[str, Any]] = {}
        self._links: list[dict[str, Any]] = []
        self._adj: dict[str, list[dict[str, Any]]] = {}

    # ------------------------------------------------------------------
    # Data loading
    # ------------------------------------------------------------------

    def load(self, objects: list[dict[str, Any]], links: list[dict[str, Any]]) -> None:
        """Bulk-load objects and links into the graph."""
        self._objects = {o["id"]: o for o in objects}
        self._links = list(links)
        self._adj = {}
        for link in self._links:
            src, tgt = link["source"], link["target"]
            self._adj.setdefault(src, []).append({"node": tgt, "link": link})
            self._adj.setdefault(tgt, []).append({"node": src, "link": link})
        logger.info("Gotham graph loaded: %d objects, %d links", len(self._objects), len(self._links))

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def get_ontology(self) -> dict[str, Any]:
        return {"objects": list(self._objects.values()), "links": self._links}

    def search(self, query: str) -> dict[str, Any]:
        q = query.lower()
        matched = [
            o for o in self._objects.values()
            if q in o.get("label", "").lower()
            or q in o.get("type", "").lower()
            or any(q in str(v).lower() for v in o.get("properties", {}).values())
        ]
        ids = {o["id"] for o in matched}
        rel_links = [l for l in self._links if l["source"] in ids or l["target"] in ids]
        return {"objects": matched, "links": rel_links}

    def expand(self, node_id: str, depth: int = 1) -> dict[str, Any]:
        visited: set[str] = set()
        queue: list[str] = [node_id]
        result_nodes: list[dict[str, Any]] = []
        result_links: list[dict[str, Any]] = []

        for _ in range(depth + 1):
            next_queue: list[str] = []
            for nid in queue:
                if nid in visited:
                    continue
                visited.add(nid)
                node = self._objects.get(nid)
                if node:
                    result_nodes.append(node)
                for neighbor in self._adj.get(nid, []):
                    link = neighbor["link"]
                    if link not in result_links:
                        result_links.append(link)
                    if neighbor["node"] not in visited:
                        next_queue.append(neighbor["node"])
            queue = next_queue

        return {"objects": result_nodes, "links": result_links}

    def shortest_path(self, from_id: str, to_id: str) -> dict[str, Any]:
        visited = {from_id}
        queue: deque[tuple[str, list[dict[str, Any]]]] = deque([(from_id, [])])
        while queue:
            current, path = queue.popleft()
            if current == to_id:
                path_nodes = [from_id] + [p["node"] for p in path]
                return {
                    "nodes": [self._objects[nid] for nid in path_nodes if nid in self._objects],
                    "links": [p["link"] for p in path],
                    "length": len(path),
                }
            for neighbor in self._adj.get(current, []):
                if neighbor["node"] not in visited:
                    visited.add(neighbor["node"])
                    queue.append((neighbor["node"], [*path, neighbor]))
        return {"nodes": [], "links": [], "length": -1}

    def get_timeline(self) -> list[dict[str, Any]]:
        events = [o for o in self._objects.values() if o.get("type") == "event"]
        events.sort(key=lambda e: e.get("created", 0))
        return events
