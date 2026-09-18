# honk — Who Heard That?

Do you ever wonder how annoying you are being when you honk your horn?

If you honk your horn in NYC right now, how many people will hear it? A joke with a semi-serious acoustics model behind it.

Static site, no build step. Run any static server from this folder:

```bash
python -m http.server 8417
```

- `data.js` — shortcut places and vehicles
- `grid.js` — loads population tiles for any point on Earth
- `model.js` — sound propagation + who's awake/outdoors/asleep by time of day
- `app.js` — UI, map (Leaflet + OpenStreetMap tiles), search (Photon), horn sound (Web Audio)
- `tiles/` — 15k gzipped 1°×1° tiles cut from the GHSL 1 km rasters (residents, non-residential
  building volume, built-up surface), ~110 MB total. Built by `tools/build_tiles.py`; see its
  docstring. Source rasters (GHS-POP, GHS-BUILT-V NRES, GHS-BUILT-S, R2023A, epoch 2025, 30 arcsec)
  are © European Union 2023, CC BY 4.0, and are not committed (`raw/`).
