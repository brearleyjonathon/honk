// Reads the population tiles built by tools/build_tiles.py from the GHSL 30-arcsecond rasters.
// Tile (i, j) covers 120x120 cells starting at raster row i*120, col j*120; each tile is
// gzip(pop + nres + built) as log-encoded uint8 (0 = zero, else vmin * base^(byte-1)).

const GRID = {
  originLng: -180.00124926466006,
  originLat: 89.0995831776456,
  cellDeg: 1 / 120,
  cells: 120,
  tileRows: 179,
  tileCols: 361,
  enc: { pop: [1, 1e6], nres: [100, 1e8], built: [100, 1e6] },
};

const tileCache = new Map();
let tileIndex = null;

function decodeValue(byte, [vmin, vmax]) {
  if (byte === 0) return 0;
  return vmin * Math.exp((Math.log(vmax / vmin) / 254) * (byte - 1));
}

function cellAreaKm2(lat) {
  return (GRID.cellDeg * 110.57) * (GRID.cellDeg * 111.32 * Math.cos(lat * Math.PI / 180));
}

async function loadTileIndex() {
  tileIndex ??= fetch("tiles/index.bin").then(r => r.arrayBuffer()).then(b => new Uint8Array(b));
  return tileIndex;
}

async function hasTile(i, j) {
  if (i < 0 || j < 0 || i >= GRID.tileRows || j >= GRID.tileCols) return false;
  const bits = await loadTileIndex();
  const n = i * GRID.tileCols + j;
  return ((bits[n >> 3] >> (7 - (n & 7))) & 1) === 1;
}

async function getTile(i, j) {
  const key = `${i}_${j}`;
  if (!tileCache.has(key)) {
    tileCache.set(key, (async () => {
      if (!(await hasTile(i, j))) return null;
      const res = await fetch(`tiles/${key}.bin`);
      if (!res.ok) return null;
      const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
      const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      const n = GRID.cells * GRID.cells;
      return { pop: bytes.subarray(0, n), nres: bytes.subarray(n, 2 * n), built: bytes.subarray(2 * n, 3 * n) };
    })());
  }
  return tileCache.get(key);
}

// Gaussian-weighted (σ ≈ 500 m) sample of the cells around a point.
// Returns densities per km²: residents, non-residential building volume (m³), built-up fraction.
async function sampleAt(lat, lng, sigmaKm = 0.5) {
  const row0 = Math.floor((GRID.originLat - lat) / GRID.cellDeg);
  const col0 = Math.floor((lng - GRID.originLng) / GRID.cellDeg);
  let wSum = 0, res = 0, nres = 0, built = 0;
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const row = row0 + dr, col = col0 + dc;
      const cLat = GRID.originLat - (row + 0.5) * GRID.cellDeg;
      const cLng = GRID.originLng + (col + 0.5) * GRID.cellDeg;
      const dx = (cLng - lng) * 111.32 * Math.cos(lat * Math.PI / 180);
      const dy = (cLat - lat) * 110.57;
      const w = Math.exp(-(dx * dx + dy * dy) / (2 * sigmaKm * sigmaKm));
      wSum += w;
      const tile = await getTile(Math.floor(row / GRID.cells), Math.floor(col / GRID.cells));
      if (!tile) continue;
      const k = (row % GRID.cells) * GRID.cells + (col % GRID.cells);
      const area = cellAreaKm2(cLat);
      res += w * decodeValue(tile.pop[k], GRID.enc.pop) / area;
      nres += w * decodeValue(tile.nres[k], GRID.enc.nres) / area;
      built += w * decodeValue(tile.built[k], GRID.enc.built) / (area * 1e6);
    }
  }
  return { res: res / wSum, nres: nres / wSum, builtFrac: Math.min(1, built / wSum) };
}
