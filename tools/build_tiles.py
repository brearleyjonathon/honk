"""Turn the global GHSL 30-arcsecond rasters into small 1°x1° tiles for the browser.

Usage:
  python tools/build_tiles.py build          # writes tiles/*.bin and tiles/index.bin
  python tools/build_tiles.py probe LAT LNG  # print the raw 3x3 neighbourhood around a point

The GHSL grids are not aligned to whole degrees (origin ≈ 180.00125°W, 89.09958°N) and the
population grid is offset by most of a cell from the other two, so tiles are cut on the built-up
raster's own grid: tile (i, j) covers raster rows i*120.. and cols j*120.. and the other rasters are
windowed by georeferenced bounds (rounded to whole cells). grid.js needs ORIGIN and CELL_DEG.

Each tile is gzip(pop[120*120] + nres[120*120] + built[120*120]) as uint8, row-major from the
north-west corner. Values are log-encoded: 0 means zero, otherwise v = vmin * base**(byte-1)
with base chosen so 255 == vmax. grid.js must use the same ENC table.
"""
import gzip
import os
import sys

import numpy as np
import rasterio
from rasterio.windows import Window, from_bounds

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "raw")
OUT = os.path.join(ROOT, "tiles")
SRC = {
    "pop": "GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0.tif",          # people per cell
    "nres": "GHS_BUILT_V_NRES_E2025_GLOBE_R2023A_4326_30ss_V1_0.tif",  # non-residential built volume, m³ per cell
    "built": "GHS_BUILT_S_E2025_GLOBE_R2023A_4326_30ss_V1_0.tif",     # built-up surface, m² per cell
}
ENC = {"pop": (1.0, 1e6), "nres": (100.0, 1e8), "built": (100.0, 1e6)}  # (vmin, vmax)
CELLS = 120  # 30 arcsec cells per degree


def encode(values, vmin, vmax):
    base = np.exp(np.log(vmax / vmin) / 254)
    out = np.zeros(values.shape, np.uint8)
    mask = values >= vmin
    out[mask] = np.clip(np.round(1 + np.log(values[mask] / vmin) / np.log(base)), 1, 255)
    return out


def open_all():
    rasters = {k: rasterio.open(os.path.join(RAW, v)) for k, v in SRC.items()}
    ref = rasters["built"]
    for r in rasters.values():
        assert abs(r.transform.a - ref.transform.a) < 1e-9 and abs(r.transform.f - ref.transform.f) < 1e-9, r.name
    return rasters


def read_block(raster, ref, row0, col0, height, width):
    """Read the cells covering the reference-grid block [row0:row0+height, col0:col0+width], zero-padded."""
    left, top = ref.transform * (col0, row0)
    right, bottom = ref.transform * (col0 + width, row0 + height)
    w = from_bounds(left, bottom, right, top, raster.transform).round_offsets().round_lengths()
    data = raster.read(1, window=w, boundless=True, fill_value=0)
    out = np.zeros((height, width), np.float64)
    out[: data.shape[0], : data.shape[1]] = data[:height, :width]
    return clean(out)


def clean(strip):
    strip = strip.astype(np.float64)
    strip[~np.isfinite(strip)] = 0
    strip[strip < 0] = 0  # nodata is negative in all three products
    return strip


def build():
    rasters = open_all()
    os.makedirs(OUT, exist_ok=True)
    ref = rasters["built"]
    tile_rows = -(-ref.height // CELLS)
    tile_cols = -(-ref.width // CELLS)
    print(f"grid origin {ref.transform.c:.8f}, {ref.transform.f:.8f}; {tile_rows} x {tile_cols} tiles")
    index = np.zeros(tile_rows * tile_cols, np.uint8)
    written = total_bytes = 0
    for i in range(tile_rows):
        strips = {k: read_block(r, ref, i * CELLS, 0, CELLS, tile_cols * CELLS) for k, r in rasters.items()}
        for j in range(tile_cols):
            sl = slice(j * CELLS, (j + 1) * CELLS)
            blocks = {k: strip[:, sl] for k, strip in strips.items()}
            if blocks["pop"].sum() < 1 and blocks["nres"].sum() < 100:
                continue
            payload = b"".join(encode(blocks[k], *ENC[k]).tobytes() for k in ("pop", "nres", "built"))
            data = gzip.compress(payload, 9)
            with open(os.path.join(OUT, f"{i}_{j}.bin"), "wb") as f:
                f.write(data)
            index[i * tile_cols + j] = 1
            written += 1
            total_bytes += len(data)
        if i % 10 == 0:
            print(f"tile row {i}: {written} tiles, {total_bytes / 1e6:.1f} MB", flush=True)
    np.packbits(index).tofile(os.path.join(OUT, "index.bin"))
    print(f"done: {written} tiles, {total_bytes / 1e6:.1f} MB")


def probe(lat, lng):
    rasters = open_all()
    ref = rasters["built"]
    r0, c0 = ref.index(lng, lat)
    for k, r in rasters.items():
        block = read_block(r, ref, r0 - 1, c0 - 1, 3, 3)
        print(k)
        print(np.round(block).astype(np.int64))
    cell_km2 = (0.5 / 60 * 110.57) * (0.5 / 60 * 111.32 * np.cos(np.radians(lat)))
    print(f"cell area {cell_km2:.4f} km²")


if __name__ == "__main__":
    if sys.argv[1] == "build":
        build()
    else:
        probe(float(sys.argv[2]), float(sys.argv[3]))
