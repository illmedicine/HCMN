"""Service for historical telemetry storage and playback.

Manages ArangoDB collections for entity metadata (graph/document) and
high-frequency telemetry time-series data.  Also handles S3 storage for
camera frame snapshots.

Collections:
  - Entities (document)   — static metadata for aircraft, cameras, etc.
  - Telemetry (document)  — time-series: entity_id, ts, lat, lon, alt, heading
  - CameraEvents (document) — links camera_id + timestamp to an S3 frame URL
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from backend.app.config import Settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional imports — gracefully degrade when ArangoDB / boto3 not configured
# ---------------------------------------------------------------------------
try:
    from arango import ArangoClient  # type: ignore[import-untyped]
    HAS_ARANGO = True
except ImportError:
    HAS_ARANGO = False

try:
    import boto3  # type: ignore[import-untyped]
    HAS_BOTO3 = True
except ImportError:
    HAS_BOTO3 = False


# ---------------------------------------------------------------------------
# ArangoDB schema constants
# ---------------------------------------------------------------------------
ENTITIES_COLLECTION = "Entities"
TELEMETRY_COLLECTION = "Telemetry"
CAMERA_EVENTS_COLLECTION = "CameraEvents"

# AQL queries
AQL_TELEMETRY_RANGE = """
FOR t IN @@collection
    FILTER t.entity_id == @entity_id
       AND t.ts >= @start_ts
       AND t.ts <= @end_ts
    SORT t.ts ASC
    RETURN t
"""

AQL_BOUNDING_POINTS = """
LET before = (
    FOR t IN @@collection
        FILTER t.entity_id == @entity_id AND t.ts <= @query_ts
        SORT t.ts DESC LIMIT 1
        RETURN t
)
LET after = (
    FOR t IN @@collection
        FILTER t.entity_id == @entity_id AND t.ts >= @query_ts
        SORT t.ts ASC LIMIT 1
        RETURN t
)
RETURN { before: before[0], after: after[0] }
"""

AQL_PURGE_OLD = """
FOR t IN @@collection
    FILTER t.ts < @cutoff_ts
    REMOVE t IN @@collection
"""

AQL_KNOWN_ENTITIES = """
FOR e IN @@collection
    FILTER e.entity_type == @entity_type
    RETURN e
"""


class HistoryService:
    """Manages historical telemetry storage in ArangoDB + S3."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._db: Any = None
        self._s3: Any = None

        self._init_arango()
        self._init_s3()

    # ------------------------------------------------------------------
    # Initialisation
    # ------------------------------------------------------------------

    def _init_arango(self) -> None:
        if not HAS_ARANGO:
            logger.warning("[History] python-arango not installed — history storage disabled")
            return
        if not self._settings.arango_url or not self._settings.arango_pass:
            logger.info("[History] ArangoDB not configured — history storage disabled")
            return

        try:
            client = ArangoClient(hosts=self._settings.arango_url)
            sys_db = client.db(
                "_system",
                username=self._settings.arango_user,
                password=self._settings.arango_pass,
            )

            db_name = self._settings.arango_db_name
            if not sys_db.has_database(db_name):
                sys_db.create_database(db_name)
                logger.info("[History] Created ArangoDB database: %s", db_name)

            self._db = client.db(
                db_name,
                username=self._settings.arango_user,
                password=self._settings.arango_pass,
            )

            # Ensure collections exist
            for name in (ENTITIES_COLLECTION, TELEMETRY_COLLECTION, CAMERA_EVENTS_COLLECTION):
                if not self._db.has_collection(name):
                    self._db.create_collection(name)
                    logger.info("[History] Created collection: %s", name)

            # Indexes for fast time-range queries
            telemetry = self._db.collection(TELEMETRY_COLLECTION)
            telemetry.add_persistent_index(fields=["entity_id", "ts"])

            cam_events = self._db.collection(CAMERA_EVENTS_COLLECTION)
            cam_events.add_persistent_index(fields=["camera_id", "ts"])

            logger.info("[History] ArangoDB connected — database: %s", db_name)
        except Exception as exc:
            logger.error("[History] ArangoDB init failed: %s", exc)
            self._db = None

    def _init_s3(self) -> None:
        if not HAS_BOTO3:
            logger.warning("[History] boto3 not installed — frame storage disabled")
            return
        if not self._settings.aws_access_key_id:
            logger.info("[History] AWS credentials not configured — frame storage disabled")
            return

        try:
            self._s3 = boto3.client(
                "s3",
                region_name=self._settings.s3_region,
                aws_access_key_id=self._settings.aws_access_key_id,
                aws_secret_access_key=self._settings.aws_secret_access_key,
            )
            logger.info("[History] S3 client initialised — bucket: %s", self._settings.s3_bucket)
        except Exception as exc:
            logger.error("[History] S3 init failed: %s", exc)
            self._s3 = None

    @property
    def arango_available(self) -> bool:
        return self._db is not None

    @property
    def s3_available(self) -> bool:
        return self._s3 is not None

    # ------------------------------------------------------------------
    # Entity (Document) Operations
    # ------------------------------------------------------------------

    def upsert_entity(self, entity_id: str, entity_type: str, metadata: dict[str, Any]) -> None:
        """Insert or update an entity's static metadata."""
        if not self._db:
            return
        col = self._db.collection(ENTITIES_COLLECTION)
        doc = {"_key": entity_id, "entity_type": entity_type, **metadata}
        try:
            if col.has(entity_id):
                col.update(doc)
            else:
                col.insert(doc)
        except Exception as exc:
            logger.warning("[History] Entity upsert failed for %s: %s", entity_id, exc)

    def get_entity(self, entity_id: str) -> dict[str, Any] | None:
        if not self._db:
            return None
        col = self._db.collection(ENTITIES_COLLECTION)
        try:
            return col.get(entity_id)
        except Exception:
            return None

    def list_entities(self, entity_type: str = "aircraft") -> list[dict[str, Any]]:
        if not self._db:
            return []
        try:
            cursor = self._db.aql.execute(
                AQL_KNOWN_ENTITIES,
                bind_vars={"@collection": ENTITIES_COLLECTION, "entity_type": entity_type},
            )
            return list(cursor)
        except Exception as exc:
            logger.warning("[History] list_entities failed: %s", exc)
            return []

    # ------------------------------------------------------------------
    # Telemetry (Time-Series) Operations
    # ------------------------------------------------------------------

    def ingest_telemetry(self, entity_id: str, lat: float, lon: float, alt: float, heading: float, ts: float | None = None) -> None:
        """Append a single telemetry point."""
        if not self._db:
            return
        col = self._db.collection(TELEMETRY_COLLECTION)
        doc = {
            "entity_id": entity_id,
            "lat": lat,
            "lon": lon,
            "alt": alt,
            "heading": heading,
            "ts": ts or time.time(),
        }
        try:
            col.insert(doc)
        except Exception as exc:
            logger.warning("[History] Telemetry insert failed: %s", exc)

    def ingest_adsb_batch(self, aircraft_list: list[dict[str, Any]]) -> int:
        """Ingest a batch of ADS-B aircraft into Entities + Telemetry.

        Each item should have keys: hex, lat, lon, alt_geom, track, flight, r
        Returns the number of records inserted.
        """
        if not self._db:
            return 0

        now = time.time()
        count = 0
        for ac in aircraft_list:
            hex_id = ac.get("hex", "").strip()
            if not hex_id:
                continue

            # Upsert entity metadata
            self.upsert_entity(hex_id, "aircraft", {
                "callsign": (ac.get("flight") or "").strip(),
                "registration": (ac.get("r") or "").strip(),
                "icao_type": (ac.get("t") or "").strip(),
            })

            lat = ac.get("lat")
            lon = ac.get("lon")
            alt_ft = ac.get("alt_geom") or ac.get("alt_baro") or 0
            heading = ac.get("track") or 0

            if lat is None or lon is None:
                continue

            alt_m = alt_ft * 0.3048 if isinstance(alt_ft, (int, float)) else 0

            self.ingest_telemetry(hex_id, lat, lon, alt_m, heading, now)
            count += 1

        return count

    def query_telemetry(
        self, entity_id: str, start_ts: float, end_ts: float
    ) -> list[dict[str, Any]]:
        """Return all telemetry points for an entity within a time window."""
        if not self._db:
            return []
        try:
            cursor = self._db.aql.execute(
                AQL_TELEMETRY_RANGE,
                bind_vars={
                    "@collection": TELEMETRY_COLLECTION,
                    "entity_id": entity_id,
                    "start_ts": start_ts,
                    "end_ts": end_ts,
                },
            )
            return list(cursor)
        except Exception as exc:
            logger.warning("[History] Telemetry query failed: %s", exc)
            return []

    def interpolate_position(self, entity_id: str, query_ts: float) -> dict[str, Any] | None:
        """Interpolate position at an exact timestamp using linear lerp.

        Finds the bounding data points P1 (before) and P2 (after), then:
            P(Tq) = P1 + (P2 - P1) * ((Tq - T1) / (T2 - T1))
        """
        if not self._db:
            return None
        try:
            cursor = self._db.aql.execute(
                AQL_BOUNDING_POINTS,
                bind_vars={
                    "@collection": TELEMETRY_COLLECTION,
                    "entity_id": entity_id,
                    "query_ts": query_ts,
                },
            )
            result = next(cursor, None)
            if not result:
                return None

            p1 = result.get("before")
            p2 = result.get("after")

            # Exact match or only one bound available
            if not p1 and not p2:
                return None
            if not p1:
                return p2
            if not p2:
                return p1
            if p1["ts"] == p2["ts"]:
                return p1

            # Linear interpolation
            t = (query_ts - p1["ts"]) / (p2["ts"] - p1["ts"])
            t = max(0.0, min(1.0, t))

            return {
                "entity_id": entity_id,
                "ts": query_ts,
                "lat": p1["lat"] + (p2["lat"] - p1["lat"]) * t,
                "lon": p1["lon"] + (p2["lon"] - p1["lon"]) * t,
                "alt": p1["alt"] + (p2["alt"] - p1["alt"]) * t,
                "heading": p1["heading"] + (p2["heading"] - p1["heading"]) * t,
                "interpolated": True,
            }
        except Exception as exc:
            logger.warning("[History] Interpolation failed: %s", exc)
            return None

    def purge_old_telemetry(self) -> int:
        """Remove telemetry older than data_retention_days."""
        if not self._db:
            return 0
        cutoff = time.time() - (self._settings.data_retention_days * 86400)
        try:
            stats = self._db.aql.execute(
                AQL_PURGE_OLD,
                bind_vars={"@collection": TELEMETRY_COLLECTION, "cutoff_ts": cutoff},
            )
            count = stats.statistics()["writesExecuted"] if hasattr(stats, "statistics") else 0
            logger.info("[History] Purged %d old telemetry records", count)
            return count
        except Exception as exc:
            logger.warning("[History] Purge failed: %s", exc)
            return 0

    # ------------------------------------------------------------------
    # Camera Frame Storage (S3)
    # ------------------------------------------------------------------

    async def store_camera_frame(self, camera_id: str, image_bytes: bytes, ts: float | None = None) -> str | None:
        """Upload a camera frame to S3 and record in CameraEvents.

        Returns the S3 URL on success, None otherwise.
        """
        ts = ts or time.time()
        ts_int = int(ts)
        s3_key = f"{camera_id}/{ts_int}.jpg"

        # Upload to S3
        if self._s3:
            try:
                self._s3.put_object(
                    Bucket=self._settings.s3_bucket,
                    Key=s3_key,
                    Body=image_bytes,
                    ContentType="image/jpeg",
                )
            except Exception as exc:
                logger.warning("[History] S3 upload failed: %s", exc)
                return None

        s3_url = f"s3://{self._settings.s3_bucket}/{s3_key}"

        # Write DB record
        if self._db:
            col = self._db.collection(CAMERA_EVENTS_COLLECTION)
            try:
                col.insert({
                    "camera_id": camera_id,
                    "ts": ts,
                    "s3_url": s3_url,
                    "s3_key": s3_key,
                })
            except Exception as exc:
                logger.warning("[History] CameraEvents insert failed: %s", exc)

        return s3_url

    def query_camera_events(
        self, camera_id: str, start_ts: float, end_ts: float
    ) -> list[dict[str, Any]]:
        """Return camera event records within a time window."""
        if not self._db:
            return []
        aql = """
        FOR e IN @@collection
            FILTER e.camera_id == @camera_id
               AND e.ts >= @start_ts
               AND e.ts <= @end_ts
            SORT e.ts ASC
            RETURN e
        """
        try:
            cursor = self._db.aql.execute(
                aql,
                bind_vars={
                    "@collection": CAMERA_EVENTS_COLLECTION,
                    "camera_id": camera_id,
                    "start_ts": start_ts,
                    "end_ts": end_ts,
                },
            )
            return list(cursor)
        except Exception as exc:
            logger.warning("[History] CameraEvents query failed: %s", exc)
            return []

    # ------------------------------------------------------------------
    # ADS-B Fetch + Ingest (called by a background task or endpoint)
    # ------------------------------------------------------------------

    async def fetch_and_ingest_adsb(self, lat: float, lon: float, radius_nm: int = 25) -> dict[str, Any]:
        """Fetch live ADS-B data from adsb.fi and ingest into the database."""
        url = f"{self._settings.adsb_api_base_url}/lat/{lat}/lon/{lon}/dist/{radius_nm}"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()

            aircraft = data.get("ac", [])
            count = self.ingest_adsb_batch(aircraft)
            return {"ingested": count, "total_raw": len(aircraft), "source": "adsb.fi"}
        except Exception as exc:
            logger.warning("[History] ADS-B fetch failed: %s", exc)
            return {"ingested": 0, "error": str(exc), "source": "adsb.fi"}
