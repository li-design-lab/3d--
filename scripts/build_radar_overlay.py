#!/usr/bin/env python3
"""Convert the supplied CREF NetCDF product into a Web Mercator PNG overlay.

Usage:
  PYTHONPATH=/tmp/blue-atlas-python <bundled-python> scripts/build_radar_overlay.py \
    /path/to/DOR_RDCP_LATLON_02H_CREF_202608260054_202608260212.nc
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np
from netCDF4 import Dataset
from PIL import Image


STOPS = np.array([5, 10, 15, 20, 25, 30, 35, 40, 45], dtype=np.float32)
COLORS = np.array(
    [
        [42, 129, 255],
        [38, 219, 255],
        [27, 206, 112],
        [182, 238, 45],
        [255, 220, 41],
        [255, 137, 37],
        [246, 58, 48],
        [222, 51, 170],
        [163, 80, 237],
    ],
    dtype=np.float32,
)


def mercator(latitude: np.ndarray) -> np.ndarray:
    return np.log(np.tan(np.pi / 4 + np.deg2rad(latitude) / 2)) * 180 / np.pi


def inverse_mercator(y: np.ndarray) -> np.ndarray:
    return np.rad2deg(2 * np.arctan(np.exp(np.deg2rad(y))) - np.pi / 2)


def timestamp_from_name(name: str) -> str | None:
    match = re.search(r"_(\d{12})_(\d{12})\.nc$", name)
    if not match:
        return None
    start, end = match.groups()
    return f"{start[:4]}-{start[4:6]}-{start[6:8]} {start[8:10]}:{start[10:12]}–{end[8:10]}:{end[10:12]}"


def colourize(values: np.ndarray) -> np.ndarray:
    rgba = np.zeros((*values.shape, 4), dtype=np.uint8)
    valid = np.isfinite(values) & (values >= STOPS[0])
    if not valid.any():
        return rgba
    indices = np.clip(np.searchsorted(STOPS, values, side="right") - 1, 0, len(STOPS) - 2)
    lower, upper = STOPS[indices], STOPS[indices + 1]
    amount = np.clip((values - lower) / (upper - lower), 0, 1)[..., None]
    colour = COLORS[indices] * (1 - amount) + COLORS[indices + 1] * amount
    rgba[..., :3] = np.clip(colour, 0, 255).astype(np.uint8)
    # Light echoes remain readable without turning clear sky into a coloured sheet.
    opacity = np.interp(values, [5, 10, 20, 30, 45], [72, 138, 194, 224, 246])
    rgba[..., 3] = np.where(valid, opacity, 0).astype(np.uint8)
    return rgba


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("netcdf", type=Path)
    parser.add_argument("--width", type=int, default=2048)
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    output = root / "dist" / "client" / "assets" / "radar"
    output.mkdir(parents=True, exist_ok=True)
    png_path = output / "cref-202608260054-0212.png"
    metadata_path = output / "cref-202608260054-0212.json"

    with Dataset(args.netcdf) as dataset:
        lat = np.asarray(dataset.variables["Lat"][:], dtype=np.float32)
        lon = np.asarray(dataset.variables["Lon"][:], dtype=np.float32)
        cref = np.asarray(dataset.variables["CREF"][:], dtype=np.float32)

    # Match the app's Mercator-coordinate map. Source latitude is sampled to a
    # uniform Mercator grid so the texture is geographically aligned on the 3D plane.
    west, east, south, north = map(float, (lon.min(), lon.max(), lat.min(), lat.max()))
    y_min, y_max = float(mercator(np.array([south]))[0]), float(mercator(np.array([north]))[0])
    height = max(1, round(args.width * (y_max - y_min) / (east - west)))
    target_y = np.linspace(y_max, y_min, height, dtype=np.float32)
    target_lat = inverse_mercator(target_y)
    row_index = np.clip(np.rint((target_lat - south) / (north - south) * (lat.size - 1)).astype(int), 0, lat.size - 1)
    col_index = np.rint(np.linspace(0, lon.size - 1, args.width)).astype(int)
    resampled = cref[row_index[:, None], col_index[None, :]]

    Image.fromarray(colourize(resampled), mode="RGBA").save(png_path, optimize=True)
    covered = cref[cref >= 5]
    metadata = {
        "product": "CREF",
        "label": "组合反射率",
        "unit": "dBZ",
        "productTime": timestamp_from_name(args.netcdf.name),
        "sourceFile": args.netcdf.name,
        "bounds": {"west": west, "south": south, "east": east, "north": north},
        "threshold": 5,
        "minDbz": round(float(np.nanmin(cref)), 2),
        "maxDbz": round(float(np.nanmax(cref)), 2),
        "echoPixelsAtOrAbove5Dbz": int(covered.size),
        "render": {"projection": "Web Mercator", "width": args.width, "height": height},
    }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {png_path} ({args.width}×{height})")
    print(f"Wrote {metadata_path}")


if __name__ == "__main__":
    main()
