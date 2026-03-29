"""CDR (Call Detail Record) analysis service.

Inspired by:
  - gigaTrace (SU1199): CDR & tower-dump parsing, contact graphs via BFS,
    IMEI/IMSI tracking, location-based distance analysis.
  - Cellyzer (anjuchamantha): CDR analysis with NetworkX contact graphs,
    home/work detection, route identification on geographic maps.

Provides:
  - CDR parsing from CSV / JSON / tower-dump formats
  - Contact graph construction (who-called-whom with frequency & duration)
  - IMEI / IMSI tracking and cross-referencing
  - Location profiling (home / work detection, frequent locations)
  - Route reconstruction from sequential cell tower pings
  - Distance calculations between consecutive tower locations
  - Export to Gotham knowledge graph for link analysis
"""

from __future__ import annotations

import csv
import io
import logging
import math
import time
import uuid
from collections import Counter, defaultdict
from typing import Any

from backend.app.config import Settings
from backend.app.models.schemas import (
    CDRRecord,
    CDRUploadResult,
    CellTower,
    CellTowerPing,
    ContactEdge,
    ContactGraph,
    ContactNode,
    GeoLocation,
    IMEIDevice,
    LocationProfile,
)

logger = logging.getLogger(__name__)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km between two lat/lon points."""
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class CDRService:
    """CDR analysis engine — parsing, graphing, tracking, and profiling."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        # In-memory store of parsed CDR records (keyed by upload session)
        self._records: list[CDRRecord] = []

    # ------------------------------------------------------------------
    # CDR parsing
    # ------------------------------------------------------------------

    def parse_cdr_csv(self, csv_text: str) -> CDRUploadResult:
        """Parse CDR records from CSV text.

        Expected columns (flexible — will map common header variants):
          calling_number, called_number, call_type, start_time,
          duration_sec, cell_id_start, cell_id_end, lac_start, lac_end,
          mcc, mnc, imei, imsi

        Also accepts gigaTrace-style tower dump columns:
          MSISDN, OTHER_PARTY, CALL_TYPE, START_TIME, DURATION,
          CELL_ID, LAC, IMEI, IMSI
        """
        reader = csv.DictReader(io.StringIO(csv_text))
        records: list[CDRRecord] = []

        for row in reader:
            # Normalise keys to lowercase
            norm = {k.strip().lower().replace(" ", "_"): v.strip() for k, v in row.items()}
            rec = CDRRecord(
                id=str(uuid.uuid4())[:8],
                calling_number=_pick(norm, "calling_number", "msisdn", "a_number", "caller", "from"),
                called_number=_pick(norm, "called_number", "other_party", "b_number", "callee", "to"),
                call_type=_pick(norm, "call_type", "type", "service") or "voice",
                start_time=_parse_ts(_pick(norm, "start_time", "datetime", "timestamp", "date")),
                duration_sec=_float(_pick(norm, "duration_sec", "duration", "call_duration")),
                cell_id_start=_int(_pick(norm, "cell_id_start", "cell_id", "cellid", "ci")),
                cell_id_end=_int(_pick(norm, "cell_id_end", "cell_id_end", "end_cell")),
                lac_start=_int(_pick(norm, "lac_start", "lac", "location_area")),
                lac_end=_int(_pick(norm, "lac_end", "lac_end", "end_lac")),
                mcc=_int(_pick(norm, "mcc", "mobile_country_code")),
                mnc=_int(_pick(norm, "mnc", "mobile_network_code")),
                imei=_pick(norm, "imei", "device_id") or "",
                imsi=_pick(norm, "imsi", "subscriber_id") or "",
            )
            records.append(rec)

        self._records.extend(records)

        numbers = {r.calling_number for r in records} | {r.called_number for r in records}
        imeis = {r.imei for r in records if r.imei}
        towers = {r.cell_id_start for r in records if r.cell_id_start} | {
            r.cell_id_end for r in records if r.cell_id_end
        }
        timestamps = [r.start_time for r in records if r.start_time > 0]

        return CDRUploadResult(
            total_records=len(records),
            unique_numbers=len(numbers),
            unique_imeis=len(imeis),
            unique_towers=len(towers),
            date_range_start=min(timestamps) if timestamps else 0,
            date_range_end=max(timestamps) if timestamps else 0,
            summary=(
                f"Parsed {len(records)} CDR records: {len(numbers)} unique numbers, "
                f"{len(imeis)} IMEIs, {len(towers)} cell towers."
            ),
        )

    def parse_tower_dump_csv(self, csv_text: str) -> CDRUploadResult:
        """Parse a tower dump (gigaTrace style) — list of devices seen on a tower.

        Expected columns: MSISDN/phone, IMEI, IMSI, cell_id, lac, mcc, mnc,
        timestamp, signal_strength.
        """
        reader = csv.DictReader(io.StringIO(csv_text))
        records: list[CDRRecord] = []

        for row in reader:
            norm = {k.strip().lower().replace(" ", "_"): v.strip() for k, v in row.items()}
            phone = _pick(norm, "msisdn", "phone", "phone_number", "number") or ""
            rec = CDRRecord(
                id=str(uuid.uuid4())[:8],
                calling_number=phone,
                called_number="",
                call_type="tower_dump",
                start_time=_parse_ts(_pick(norm, "timestamp", "datetime", "time")),
                cell_id_start=_int(_pick(norm, "cell_id", "cellid", "ci")),
                lac_start=_int(_pick(norm, "lac", "location_area")),
                mcc=_int(_pick(norm, "mcc")),
                mnc=_int(_pick(norm, "mnc")),
                imei=_pick(norm, "imei") or "",
                imsi=_pick(norm, "imsi") or "",
            )
            records.append(rec)

        self._records.extend(records)

        phones = {r.calling_number for r in records if r.calling_number}
        imeis = {r.imei for r in records if r.imei}
        towers = {r.cell_id_start for r in records if r.cell_id_start}
        timestamps = [r.start_time for r in records if r.start_time > 0]

        return CDRUploadResult(
            total_records=len(records),
            unique_numbers=len(phones),
            unique_imeis=len(imeis),
            unique_towers=len(towers),
            date_range_start=min(timestamps) if timestamps else 0,
            date_range_end=max(timestamps) if timestamps else 0,
            summary=(
                f"Tower dump: {len(records)} observations, {len(phones)} devices, "
                f"{len(imeis)} IMEIs across {len(towers)} towers."
            ),
        )

    def get_records(self, phone_number: str = "") -> list[CDRRecord]:
        """Return stored CDR records, optionally filtered by phone number."""
        if not phone_number:
            return list(self._records)
        return [
            r for r in self._records
            if r.calling_number == phone_number or r.called_number == phone_number
        ]

    def clear_records(self) -> int:
        """Clear all stored CDR records. Returns count of removed records."""
        count = len(self._records)
        self._records.clear()
        return count

    # ------------------------------------------------------------------
    # Contact graph construction (Cellyzer / gigaTrace BFS style)
    # ------------------------------------------------------------------

    def build_contact_graph(
        self,
        target_number: str = "",
        depth: int = 1,
    ) -> ContactGraph:
        """Build a contact graph from loaded CDR data.

        If *target_number* is given, the graph is seeded from that number and
        expanded to *depth* hops (BFS, similar to gigaTrace).  Otherwise the
        full graph of all loaded records is returned.

        If no records are loaded, demo data is used.
        """
        records = self._records if self._records else self._demo_cdr_records()

        # Filter to relevant records if target specified
        if target_number:
            relevant = self._bfs_records(records, target_number, depth)
        else:
            relevant = records

        # Build adjacency
        edge_key = lambda a, b: (min(a, b), max(a, b))
        edge_map: dict[tuple[str, str], dict[str, Any]] = {}
        node_map: dict[str, dict[str, Any]] = {}

        for r in relevant:
            a, b = r.calling_number, r.called_number
            if not a:
                continue

            # Node stats
            for num in [a, b]:
                if not num:
                    continue
                if num not in node_map:
                    node_map[num] = {
                        "call_count": 0, "total_duration": 0.0, "sms_count": 0,
                        "imei": "", "imsi": "", "first_seen": float("inf"),
                        "last_seen": 0, "towers": [], "hours": [],
                    }
                n = node_map[num]
                if r.call_type in ("voice", "tower_dump"):
                    n["call_count"] += 1
                    n["total_duration"] += r.duration_sec
                elif r.call_type == "sms":
                    n["sms_count"] += 1
                if r.imei and num == a:
                    n["imei"] = r.imei
                if r.imsi and num == a:
                    n["imsi"] = r.imsi
                if r.start_time > 0:
                    n["first_seen"] = min(n["first_seen"], r.start_time)
                    n["last_seen"] = max(n["last_seen"], r.start_time)
                    hour = int((r.start_time % 86400) / 3600)
                    n["hours"].append(hour)
                if r.cell_id_start:
                    n["towers"].append(r.cell_id_start)

            # Edge stats
            if a and b:
                key = edge_key(a, b)
                if key not in edge_map:
                    edge_map[key] = {
                        "call_count": 0, "total_duration": 0.0, "sms_count": 0,
                        "first_contact": float("inf"), "last_contact": 0,
                    }
                e = edge_map[key]
                if r.call_type in ("voice", "tower_dump"):
                    e["call_count"] += 1
                    e["total_duration"] += r.duration_sec
                elif r.call_type == "sms":
                    e["sms_count"] += 1
                if r.start_time > 0:
                    e["first_contact"] = min(e["first_contact"], r.start_time)
                    e["last_contact"] = max(e["last_contact"], r.start_time)

        # Assemble output
        nodes: list[ContactNode] = []
        for num, n in node_map.items():
            tower_counts = Counter(n["towers"])
            most_used = tower_counts.most_common(1)[0][0] if tower_counts else 0
            nodes.append(ContactNode(
                phone_number=num,
                call_count=n["call_count"],
                total_duration_sec=n["total_duration"],
                sms_count=n["sms_count"],
                imei=n["imei"],
                imsi=n["imsi"],
                first_seen=n["first_seen"] if n["first_seen"] < float("inf") else 0,
                last_seen=n["last_seen"],
                most_used_tower=most_used,
                label=num,
            ))

        edges: list[ContactEdge] = []
        max_calls = max((e["call_count"] for e in edge_map.values()), default=1)
        for (src, tgt), e in edge_map.items():
            weight = e["call_count"] / max_calls if max_calls > 0 else 0
            edges.append(ContactEdge(
                source=src,
                target=tgt,
                call_count=e["call_count"],
                total_duration_sec=e["total_duration"],
                sms_count=e["sms_count"],
                first_contact=e["first_contact"] if e["first_contact"] < float("inf") else 0,
                last_contact=e["last_contact"],
                weight=round(weight, 3),
            ))

        # Simple community detection (connected components)
        communities = self._find_communities(node_map.keys(), edge_map)

        total_calls = sum(e["call_count"] for e in edge_map.values())
        total_sms = sum(e["sms_count"] for e in edge_map.values())
        all_ts = [n["first_seen"] for n in node_map.values() if n["first_seen"] < float("inf")]

        return ContactGraph(
            nodes=nodes,
            edges=edges,
            total_calls=total_calls,
            total_sms=total_sms,
            date_range_start=min(all_ts) if all_ts else 0,
            date_range_end=max(n["last_seen"] for n in node_map.values()) if node_map else 0,
            communities=communities,
        )

    # ------------------------------------------------------------------
    # IMEI / IMSI tracking (gigaTrace inspired)
    # ------------------------------------------------------------------

    def track_imei(self, imei: str) -> IMEIDevice:
        """Track a device by IMEI across all loaded CDR records.

        If no records are loaded, uses demo data.
        """
        records = self._records if self._records else self._demo_cdr_records()
        matching = [r for r in records if r.imei == imei]

        if not matching:
            # Demo fallback
            matching = [r for r in self._demo_cdr_records() if r.imei == imei]
            if not matching:
                return IMEIDevice(
                    imei=imei,
                    summary=f"No records found for IMEI {imei}.",
                )

        phone_numbers = list({r.calling_number for r in matching if r.calling_number})
        imsis = list({r.imsi for r in matching if r.imsi})
        timestamps = [r.start_time for r in matching if r.start_time > 0]

        # Build tower history from cell IDs
        tower_history: list[CellTower] = []
        pings: list[CellTowerPing] = []
        seen_towers: set[int] = set()

        for r in sorted(matching, key=lambda x: x.start_time):
            if r.cell_id_start and r.cell_id_start not in seen_towers:
                seen_towers.add(r.cell_id_start)
                tower = CellTower(
                    mcc=r.mcc, mnc=r.mnc, lac=r.lac_start, cell_id=r.cell_id_start,
                    radio="LTE", source="cdr",
                )
                tower_history.append(tower)
            if r.cell_id_start:
                pings.append(CellTowerPing(
                    cell_tower=CellTower(
                        mcc=r.mcc, mnc=r.mnc, lac=r.lac_start, cell_id=r.cell_id_start,
                        source="cdr",
                    ),
                    timestamp=r.start_time,
                    device_id=imei,
                    phone_number=r.calling_number,
                ))

        is_shared = len(phone_numbers) > 1

        return IMEIDevice(
            imei=imei,
            imsi=imsis[0] if imsis else "",
            phone_numbers=phone_numbers,
            first_seen=min(timestamps) if timestamps else 0,
            last_seen=max(timestamps) if timestamps else 0,
            tower_history=tower_history,
            pings=pings,
            is_shared=is_shared,
            summary=(
                f"IMEI {imei}: {len(phone_numbers)} SIM(s) ({', '.join(phone_numbers)}), "
                f"{len(pings)} tower pings across {len(tower_history)} unique towers."
                + (" ⚠ Multi-SIM device detected." if is_shared else "")
            ),
        )

    # ------------------------------------------------------------------
    # Location profiling (Cellyzer inspired – home/work detection)
    # ------------------------------------------------------------------

    def build_location_profile(
        self,
        phone_number: str,
        tower_resolver: Any = None,
    ) -> LocationProfile:
        """Build a location profile for a phone number from CDR tower data.

        Uses time-of-day heuristics (Cellyzer-style):
          - Home = most frequent tower during 20:00–07:00
          - Work = most frequent tower during 09:00–17:00
          - Route = ordered sequence of all tower pings

        *tower_resolver* is an async callable(mcc, mnc, lac, cid) → CellTower
        used to resolve tower coordinates. If not provided, coordinates default
        to 0,0 and the demo data provides fixed locations.
        """
        records = self._records if self._records else self._demo_cdr_records()
        matching = [
            r for r in records
            if r.calling_number == phone_number or r.called_number == phone_number
        ]

        if not matching:
            matching = [
                r for r in self._demo_cdr_records()
                if r.calling_number == phone_number or r.called_number == phone_number
            ]

        if not matching:
            return LocationProfile(
                phone_number=phone_number,
                summary=f"No CDR data found for {phone_number}.",
            )

        # Collect tower references with timestamps
        tower_times: list[tuple[int, int, int, int, float]] = []  # (mcc, mnc, lac, cid, ts)
        hours: list[int] = []

        for r in sorted(matching, key=lambda x: x.start_time):
            if r.cell_id_start:
                tower_times.append((r.mcc, r.mnc, r.lac_start, r.cell_id_start, r.start_time))
            if r.start_time > 0:
                hour = int((r.start_time % 86400) / 3600)
                hours.append(hour)

        # Home detection (20:00–07:00)
        home_towers: list[int] = []
        work_towers: list[int] = []
        for mcc, mnc, lac, cid, ts in tower_times:
            hour = int((ts % 86400) / 3600)
            if hour >= 20 or hour < 7:
                home_towers.append(cid)
            elif 9 <= hour < 17:
                work_towers.append(cid)

        home_cid = Counter(home_towers).most_common(1)[0][0] if home_towers else 0
        work_cid = Counter(work_towers).most_common(1)[0][0] if work_towers else 0

        # Use demo tower locations for profile coordinates
        demo_locs = self._demo_tower_locations()

        home_loc = None
        if home_cid and home_cid in demo_locs:
            lat, lon = demo_locs[home_cid]
            home_loc = GeoLocation(latitude=lat, longitude=lon, label=f"Home (tower {home_cid})")

        work_loc = None
        if work_cid and work_cid in demo_locs:
            lat, lon = demo_locs[work_cid]
            work_loc = GeoLocation(latitude=lat, longitude=lon, label=f"Work (tower {work_cid})")

        # Frequent locations
        all_cids = [cid for _, _, _, cid, _ in tower_times]
        freq_cids = [cid for cid, _ in Counter(all_cids).most_common(5)]
        frequent = []
        for cid in freq_cids:
            if cid in demo_locs:
                lat, lon = demo_locs[cid]
                frequent.append(GeoLocation(latitude=lat, longitude=lon, label=f"Tower {cid}"))

        # Route reconstruction
        route_points: list[GeoLocation] = []
        seen_route: set[int] = set()
        for _, _, _, cid, _ in tower_times:
            if cid not in seen_route and cid in demo_locs:
                seen_route.add(cid)
                lat, lon = demo_locs[cid]
                route_points.append(GeoLocation(latitude=lat, longitude=lon, label=f"Tower {cid}"))

        # Distance calculations
        distances: list[float] = []
        total_dist = 0.0
        for i in range(1, len(route_points)):
            d = _haversine_km(
                route_points[i - 1].latitude, route_points[i - 1].longitude,
                route_points[i].latitude, route_points[i].longitude,
            )
            distances.append(round(d, 2))
            total_dist += d

        # Active hours
        active_hours = [h for h, _ in Counter(hours).most_common(6)]

        return LocationProfile(
            phone_number=phone_number,
            home_location=home_loc,
            work_location=work_loc,
            frequent_locations=frequent,
            route_points=route_points,
            tower_distances_km=distances,
            total_distance_km=round(total_dist, 2),
            active_hours=sorted(active_hours),
            summary=(
                f"Profile for {phone_number}: "
                f"{'Home detected' if home_loc else 'Home unknown'}, "
                f"{'Work detected' if work_loc else 'Work unknown'}, "
                f"{len(route_points)} route points, "
                f"{total_dist:.1f} km total movement."
            ),
        )

    # ------------------------------------------------------------------
    # Export to Gotham knowledge graph
    # ------------------------------------------------------------------

    def export_to_gotham(
        self,
        target_number: str = "",
        depth: int = 1,
    ) -> dict[str, Any]:
        """Export CDR data as Gotham-compatible objects and links.

        Returns a dict with 'objects' (nodes) and 'links' (edges) ready
        to be loaded into the GothamService knowledge graph.
        """
        graph = self.build_contact_graph(target_number, depth)
        now = time.time() * 1000  # Gotham uses ms timestamps

        objects: list[dict[str, Any]] = []
        links: list[dict[str, Any]] = []

        for node in graph.nodes:
            obj: dict[str, Any] = {
                "id": f"cdr-{node.phone_number}",
                "type": "device",
                "label": f"Phone {node.phone_number}",
                "properties": {
                    "phone": node.phone_number,
                    "calls": node.call_count,
                    "sms": node.sms_count,
                    "duration_min": round(node.total_duration_sec / 60, 1),
                    "imei": node.imei,
                    "imsi": node.imsi,
                    "most_used_tower": node.most_used_tower,
                },
                "created": now,
            }
            if node.home_location:
                obj["geo"] = {"lat": node.home_location.latitude, "lon": node.home_location.longitude}
            objects.append(obj)

        for edge in graph.edges:
            links.append({
                "id": f"cdr-link-{edge.source}-{edge.target}",
                "source": f"cdr-{edge.source}",
                "target": f"cdr-{edge.target}",
                "type": "called",
                "label": f"{edge.call_count} calls, {edge.sms_count} SMS",
                "properties": {
                    "calls": edge.call_count,
                    "sms": edge.sms_count,
                    "duration_min": round(edge.total_duration_sec / 60, 1),
                },
                "weight": edge.weight,
            })

        return {"objects": objects, "links": links}

    # ------------------------------------------------------------------
    # BFS expansion (gigaTrace style)
    # ------------------------------------------------------------------

    @staticmethod
    def _bfs_records(
        records: list[CDRRecord],
        seed: str,
        depth: int,
    ) -> list[CDRRecord]:
        """BFS from a seed number to collect records up to *depth* hops."""
        visited: set[str] = {seed}
        frontier: set[str] = {seed}
        result: list[CDRRecord] = []

        for _ in range(depth):
            next_frontier: set[str] = set()
            for r in records:
                a, b = r.calling_number, r.called_number
                if a in frontier or b in frontier:
                    result.append(r)
                    if a not in visited:
                        next_frontier.add(a)
                        visited.add(a)
                    if b and b not in visited:
                        next_frontier.add(b)
                        visited.add(b)
            frontier = next_frontier
            if not frontier:
                break

        return result

    @staticmethod
    def _find_communities(
        nodes: Any,
        edges: dict[tuple[str, str], Any],
    ) -> list[list[str]]:
        """Simple connected-component community detection."""
        adj: dict[str, set[str]] = defaultdict(set)
        for src, tgt in edges:
            adj[src].add(tgt)
            adj[tgt].add(src)

        visited: set[str] = set()
        communities: list[list[str]] = []

        for node in nodes:
            if node in visited:
                continue
            component: list[str] = []
            stack = [node]
            while stack:
                n = stack.pop()
                if n in visited:
                    continue
                visited.add(n)
                component.append(n)
                stack.extend(adj.get(n, set()) - visited)
            if component:
                communities.append(sorted(component))

        return communities

    # ------------------------------------------------------------------
    # Demo tower locations (for location profiling without live API)
    # ------------------------------------------------------------------

    @staticmethod
    def _demo_tower_locations() -> dict[int, tuple[float, float]]:
        """Map cell_id → (lat, lon) for demo towers around NYC."""
        return {
            12345: (40.7128, -74.0060),   # Lower Manhattan
            12346: (40.7200, -74.0000),   # SoHo
            23456: (40.7580, -73.9855),   # Times Square
            23457: (40.7489, -73.9680),   # Grand Central
            34567: (40.6892, -74.0445),   # Statue of Liberty area
            45678: (40.7614, -73.9776),   # MoMA area
            56789: (40.7282, -73.7949),   # Queens
            67890: (40.6782, -73.9442),   # Brooklyn
            78901: (40.8448, -73.8648),   # Bronx
        }

    # ------------------------------------------------------------------
    # Demo CDR data (used when no real data uploaded)
    # ------------------------------------------------------------------

    @staticmethod
    def _demo_cdr_records() -> list[CDRRecord]:
        """Generate realistic demo CDR records for testing."""
        now = time.time()
        day = 86400
        hr = 3600

        return [
            # Target: +1-555-0101 (Marcus Chen) — makes/receives many calls
            CDRRecord(id="d01", calling_number="+1-555-0101", called_number="+1-555-0202",
                      call_type="voice", start_time=now - 3 * day + 9 * hr, duration_sec=180,
                      cell_id_start=12345, lac_start=30000, mcc=310, mnc=410,
                      imei="352099001761481", imsi="310410123456789"),
            CDRRecord(id="d02", calling_number="+1-555-0202", called_number="+1-555-0101",
                      call_type="voice", start_time=now - 3 * day + 10 * hr, duration_sec=420,
                      cell_id_start=23456, lac_start=30001, mcc=310, mnc=260,
                      imei="356938035643809", imsi="310260987654321"),
            CDRRecord(id="d03", calling_number="+1-555-0101", called_number="+1-555-0303",
                      call_type="voice", start_time=now - 3 * day + 14 * hr, duration_sec=90,
                      cell_id_start=23456, lac_start=30001, mcc=310, mnc=410,
                      imei="352099001761481", imsi="310410123456789"),
            CDRRecord(id="d04", calling_number="+1-555-0101", called_number="+1-555-0505",
                      call_type="sms", start_time=now - 3 * day + 16 * hr, duration_sec=0,
                      cell_id_start=34567, lac_start=30002, mcc=311, mnc=480,
                      imei="352099001761481", imsi="310410123456789"),
            CDRRecord(id="d05", calling_number="+1-555-0101", called_number="+1-555-0202",
                      call_type="voice", start_time=now - 2 * day + 8 * hr, duration_sec=300,
                      cell_id_start=12345, lac_start=30000, mcc=310, mnc=410,
                      imei="352099001761481", imsi="310410123456789"),

            # +1-555-0303 (James Okafor) — calls suspect numbers
            CDRRecord(id="d06", calling_number="+1-555-0303", called_number="+1-555-0505",
                      call_type="voice", start_time=now - 2 * day + 11 * hr, duration_sec=600,
                      cell_id_start=45678, lac_start=30003, mcc=310, mnc=410,
                      imei="490154203237518", imsi="310410555666777"),
            CDRRecord(id="d07", calling_number="+1-555-0505", called_number="+1-555-0303",
                      call_type="voice", start_time=now - 2 * day + 22 * hr, duration_sec=240,
                      cell_id_start=56789, lac_start=30004, mcc=310, mnc=260,
                      imei="352099001761481", imsi="310260888999000"),
            CDRRecord(id="d08", calling_number="+1-555-0303", called_number="+1-555-0707",
                      call_type="sms", start_time=now - 1 * day + 2 * hr, duration_sec=0,
                      cell_id_start=45678, lac_start=30003, mcc=310, mnc=410,
                      imei="490154203237518", imsi="310410555666777"),

            # +1-555-0505 (Dmitri Petrov) — uses multiple devices / burner phone
            CDRRecord(id="d09", calling_number="+1-555-0505", called_number="+1-555-0808",
                      call_type="voice", start_time=now - 1 * day + 15 * hr, duration_sec=480,
                      cell_id_start=67890, lac_start=30005, mcc=310, mnc=260,
                      imei="000000000000000", imsi="310260000111222"),
            CDRRecord(id="d10", calling_number="+1-555-0808", called_number="+1-555-0505",
                      call_type="voice", start_time=now - 1 * day + 18 * hr, duration_sec=120,
                      cell_id_start=78901, lac_start=30006, mcc=310, mnc=410,
                      imei="861536030196001", imsi="310410444555666"),
            CDRRecord(id="d11", calling_number="+1-555-0505", called_number="+1-555-0707",
                      call_type="voice", start_time=now - 12 * hr, duration_sec=360,
                      cell_id_start=34567, lac_start=30002, mcc=311, mnc=480,
                      imei="000000000000000", imsi="310260000111222"),

            # +1-555-0707 (Carlos Mendez) — connects Petrov to network
            CDRRecord(id="d12", calling_number="+1-555-0707", called_number="+1-555-0303",
                      call_type="voice", start_time=now - 6 * hr, duration_sec=540,
                      cell_id_start=23457, lac_start=30001, mcc=310, mnc=260,
                      imei="356938035643809", imsi="310260987654321"),

            # Night-time calls for home detection
            CDRRecord(id="d13", calling_number="+1-555-0101", called_number="+1-555-0404",
                      call_type="voice", start_time=now - 2 * day + 22 * hr, duration_sec=60,
                      cell_id_start=12345, lac_start=30000, mcc=310, mnc=410,
                      imei="352099001761481", imsi="310410123456789"),
            CDRRecord(id="d14", calling_number="+1-555-0101", called_number="+1-555-0606",
                      call_type="sms", start_time=now - 1 * day + 23 * hr, duration_sec=0,
                      cell_id_start=12345, lac_start=30000, mcc=310, mnc=410,
                      imei="352099001761481", imsi="310410123456789"),
        ]


# ---------------------------------------------------------------------------
# CSV helper utilities
# ---------------------------------------------------------------------------

def _pick(row: dict[str, str], *keys: str) -> str:
    """Return the first non-empty value from the row matching any of the keys."""
    for k in keys:
        v = row.get(k, "").strip()
        if v:
            return v
    return ""


def _int(val: str) -> int:
    """Parse an integer, returning 0 on failure."""
    try:
        return int(float(val)) if val else 0
    except (ValueError, TypeError):
        return 0


def _float(val: str) -> float:
    """Parse a float, returning 0.0 on failure."""
    try:
        return float(val) if val else 0.0
    except (ValueError, TypeError):
        return 0.0


def _parse_ts(val: str) -> float:
    """Parse a timestamp string into a Unix epoch float.

    Handles: epoch seconds, ISO-8601 (2026-01-15T10:30:00), and simple
    date-time strings (2026-01-15 10:30:00).
    """
    if not val:
        return 0.0
    # Try numeric epoch first
    try:
        ts = float(val)
        if ts > 1e12:
            ts /= 1000  # ms → s
        return ts
    except ValueError:
        pass
    # Try ISO-8601 / datetime strings
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f",
                "%Y-%m-%d %H:%M", "%m/%d/%Y %H:%M:%S", "%d/%m/%Y %H:%M:%S"):
        try:
            import datetime
            dt = datetime.datetime.strptime(val, fmt)
            return dt.timestamp()
        except ValueError:
            continue
    return 0.0
