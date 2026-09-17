# honk — Who Heard That?

Do you ever wonder how annoying you are being when you honk your horn?

If you honk your horn in NYC right now, how many people will hear it? A joke with a semi-serious acoustics model behind it.

Static site, no build step. Run any static server from this folder:

```bash
python -m http.server 8417
```

- `data.js` — neighborhood densities, vehicles, reasons (all the guesses live here)
- `model.js` — sound propagation + who's awake/outdoors/asleep by time of day
- `app.js` — UI, map (Leaflet + OpenStreetMap tiles), horn sound (Web Audio)
