"""Geometry helpers: metre-accurate distances, coastline handling, elevation-grid flooding."""
from __future__ import annotations

import math
from collections import deque
from functools import lru_cache

import numpy as np
from pyproj import Transformer
from shapely.geometry import LineString, MultiLineString, Point, box, mapping
import shapely
from shapely.ops import unary_union


@lru_cache(maxsize=8)
def _to_utm(epsg: int) -> Transformer:
    return Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)


def to_utm(geom, epsg: int):
    """Project a lon/lat shapely geometry to UTM metres."""
    t = _to_utm(epsg)
    return shapely.transform(geom, lambda xy: np.column_stack(t.transform(xy[:, 0], xy[:, 1])))


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def coastline_geometry(lines: list[list[list[float]]]) -> MultiLineString:
    """lines: list of [[lon, lat], ...] polylines."""
    return MultiLineString([LineString(l) for l in lines if len(l) >= 2])


class CoastDistance:
    """Fast repeated distance-to-coast queries in km."""

    def __init__(self, coast_lonlat: MultiLineString, epsg: int):
        self.epsg = epsg
        self.coast_m = to_utm(coast_lonlat, epsg)

    def km(self, lat: float, lon: float) -> float:
        p = to_utm(Point(lon, lat), self.epsg)
        return p.distance(self.coast_m) / 1000.0


def coast_lon_at(coast: MultiLineString, lat: float, west: float, east: float) -> float | None:
    """Longitude where the coastline crosses this latitude (eastern-most crossing).

    Used to tell sea from land on an east-facing coast.
    """
    ray = LineString([(west, lat), (east, lat)])
    hit = ray.intersection(coast)
    if hit.is_empty:
        return None
    xs = [g.x for g in getattr(hit, "geoms", [hit]) if g.geom_type == "Point"]
    if not xs:  # line overlap: use bounds
        return hit.bounds[2]
    return max(xs)


def sea_mask(lats: np.ndarray, lons: np.ndarray, coast: MultiLineString, sea_bearing_deg: float) -> np.ndarray:
    """Boolean grid: True where the cell is open sea.

    Supports east- or west-facing coasts (sea_bearing 90 or 270). For each row, cells beyond
    the coastline crossing on the sea side are sea. Rows with no crossing use the nearest row.
    """
    ny, nx = len(lats), len(lons)
    west, east = float(lons.min()) - 0.05, float(lons.max()) + 0.05
    crossing = [coast_lon_at(coast, float(la), west, east) for la in lats]
    known = [i for i, c in enumerate(crossing) if c is not None]
    mask = np.zeros((ny, nx), dtype=bool)
    if not known:
        return mask
    for i in range(ny):
        c = crossing[i]
        if c is None:
            c = crossing[min(known, key=lambda k: abs(k - i))]
        if 45 <= sea_bearing_deg <= 135:  # sea to the east
            mask[i] = lons > c
        else:  # sea to the west
            mask[i] = lons < c
    return mask


def flooded_cells(elev: np.ndarray, sea: np.ndarray, water_level: float) -> np.ndarray:
    """Cells below the water level that are hydraulically connected to the sea (4-connectivity)."""
    ny, nx = elev.shape
    low = (elev < water_level) & ~sea
    out = np.zeros_like(low)
    q: deque[tuple[int, int]] = deque()
    for i in range(ny):
        for j in range(nx):
            if sea[i, j]:
                q.append((i, j))
    seen = sea.copy()
    while q:
        i, j = q.popleft()
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            a, b = i + di, j + dj
            if 0 <= a < ny and 0 <= b < nx and not seen[a, b] and low[a, b]:
                seen[a, b] = True
                out[a, b] = True
                q.append((a, b))
    return out


def cells_to_geojson(mask: np.ndarray, lats: np.ndarray, lons: np.ndarray, step: float, epsg: int) -> tuple[dict, float]:
    """Union flooded cells into (Multi)Polygon GeoJSON; returns (geometry, area_km2)."""
    half = step / 2
    cells = [box(lons[j] - half, lats[i] - half, lons[j] + half, lats[i] + half)
             for i, j in zip(*np.nonzero(mask))]
    if not cells:
        return {"type": "MultiPolygon", "coordinates": []}, 0.0
    geom = unary_union(cells).simplify(step / 4, preserve_topology=True)
    area = to_utm(geom, epsg).area / 1e6
    gj = mapping(geom)
    return {"type": gj["type"], "coordinates": _round_coords(gj["coordinates"])}, round(area, 2)


def _round_coords(c, nd: int = 5):
    if isinstance(c, (list, tuple)):
        if c and isinstance(c[0], (int, float)):
            return [round(float(v), nd) for v in c]
        return [_round_coords(x, nd) for x in c]
    return c


def grid_value_at(grid: np.ndarray, lats: np.ndarray, lons: np.ndarray, lat: float, lon: float) -> float:
    i = int(np.abs(lats - lat).argmin())
    j = int(np.abs(lons - lon).argmin())
    return float(grid[i, j])
