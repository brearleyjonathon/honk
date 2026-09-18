const $ = id => document.getElementById(id);

const MIN_HONK_SECONDS = 0.3;
const WAVE_SPEED = 100; // m/s: a third of the real speed of sound, so you can watch it spread
const COUNT_FIELDS = ["heard", "heardOutdoors", "heardIndoors", "bothered", "annoyed", "woken", "babies", "dogs", "calls", "honkBacks"];
const DOUBLE_TAKE_SECONDS = 2; // time each listener loses to "what was that" on top of the honk itself
const NYC_FINE = 350;
const NYC = { south: 40.49, north: 40.92, west: -74.26, east: -73.7 };
const PHOTON = "https://photon.komoot.io";

const VENUES = [
  { name: "packed subway car", plural: "packed subway cars", cap: 150 },
  { name: "sold-out Broadway theater", plural: "sold-out Broadway theaters", cap: 1500 },
  { name: "sold-out Radio City Music Hall", plural: "sold-out Radio City Music Halls", cap: 6000 },
  { name: "sold-out Madison Square Garden", plural: "sold-out Madison Square Gardens", cap: 19500 },
  { name: "sold-out Yankee Stadium", plural: "sold-out Yankee Stadiums", cap: 46500 },
];

const state = {
  point: null,
  placeName: "",
  tz: "America/New_York",
  sample: null, // GHSL densities for the current point; null while loading
  hour: 12,
  dayType: "weekday",
  season: "fall",
  vehicle: VEHICLES[1],
  seconds: 0,
  hasHonked: false,
};

// ---------- time ----------

function seasonFor(month, lat) {
  const m = lat < 0 ? ((month + 5) % 12) + 1 : month; // southern hemisphere: shift six months
  return m <= 2 || m === 12 ? "winter" : m <= 5 ? "spring" : m <= 8 ? "summer" : "fall";
}

function nowAt(tz, lat) {
  const options = { hour12: false, hour: "numeric", minute: "numeric", weekday: "short", month: "numeric" };
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: tz, ...options });
  } catch {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options });
  }
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map(p => [p.type, p.value]));
  return {
    minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
    dayType: parts.weekday === "Sat" || parts.weekday === "Sun" ? "weekend" : "weekday",
    season: seasonFor(Number(parts.month), lat),
  };
}

function timeZoneFor(point) {
  try {
    return tzlookup(point.lat, point.lng);
  } catch {
    return "UTC";
  }
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// ---------- formatting ----------

const fmt = n => Math.round(n).toLocaleString("en-US");

function formatDuration(seconds) {
  if (seconds < 90) return `${Math.round(seconds)} seconds`;
  const minutes = seconds / 60;
  if (minutes < 90) return `${Math.round(minutes)} minutes`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(1)} hours`;
  return `${(hours / 24).toFixed(1)} days`;
}

function venueComparison(n) {
  if (n < 40) return null;
  let venue = VENUES[0];
  for (const v of VENUES) if (n / v.cap >= 0.75) venue = v;
  const ratio = n / venue.cap;
  if (ratio < 0.95) return `${Math.round(ratio * 100)}% of a ${venue.name}`;
  if (ratio < 1.15) return `one ${venue.name}`;
  return `${ratio.toFixed(1)} ${venue.plural}`;
}

function verdict(e) {
  const n = Math.round(e.heard);
  let line;
  if (n < 1) line = state.sample.res < 1 ? "Not a soul. The wildlife is unbothered." : "Nobody heard that. Honk again, louder, why not.";
  else if (n < 50) line = "Barely a ripple. By New York standards you're basically a monk.";
  else if (n < 400) line = "A few packed subway cars' worth of people just flinched.";
  else if (n < 1500) line = "An off-Broadway audience's worth of people now think less of you.";
  else if (n < 5000) line = "Thousands of people, one shared thought: “WHO is honking.”";
  else if (n < 15000) line = "You just addressed a small arena. Your message was “HONK.”";
  else line = "A stadium's worth of people heard you. None of them were the car in front of you.";
  if (e.woken >= 1) {
    line += ` You also woke up ${fmt(e.woken)} ${Math.round(e.woken) === 1 ? "person" : "people"}. They know what you drive.`;
  }
  if (n >= 20 && e.annoyed / e.heard > 0.9) {
    line += " At this point everyone who heard you is annoyed. Mission accomplished?";
  }
  return line;
}

function inNYC(p) {
  return p.lat > NYC.south && p.lat < NYC.north && p.lng > NYC.west && p.lng < NYC.east;
}

// ---------- geocoding (Photon / OpenStreetMap) ----------

function placeLabel(p) {
  const city = p.city || p.town || p.village || p.county;
  const locality = p.district && city && p.district !== city ? `${p.district}, ${city}` : city || p.state;
  const parts = [p.name || p.street, locality, p.country];
  return [...new Set(parts.filter(Boolean))].join(", ");
}

async function reverseGeocode(point) {
  try {
    const res = await fetch(`${PHOTON}/reverse?lat=${point.lat}&lon=${point.lng}&lang=en`);
    const feature = (await res.json()).features[0];
    if (feature) return placeLabel(feature.properties);
  } catch { /* fall through */ }
  return `${point.lat.toFixed(3)}, ${point.lng.toFixed(3)}`;
}

// ---------- map ----------

const map = L.map("map", { worldCopyJump: true, minZoom: 2 }).setView([40.758, -73.9855], 15);
// Standard OSM tiles, darkened in CSS (.leaflet-tile-pane) to match the asphalt theme.
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const ringStyle = (color, fillOpacity) => ({ color, weight: 1.5, fillColor: color, fillOpacity, interactive: false });
const rings = {
  heard: L.circle([0, 0], { radius: 1, ...ringStyle("#ffd400", 0.08) }).addTo(map),
  bothered: L.circle([0, 0], { radius: 1, ...ringStyle("#ff7a1a", 0.14) }).addTo(map),
  woke: L.circle([0, 0], { radius: 1, ...ringStyle("#ff3b5c", 0.22) }).addTo(map),
};
const ripple = L.circle([0, 0], { radius: 1, color: "#fff", weight: 2, fill: false, opacity: 0, interactive: false }).addTo(map);
const car = L.marker([0, 0], { interactive: false }).addTo(map);

function setCarIcon() {
  car.setIcon(L.divIcon({ className: "car", html: state.vehicle.emoji, iconSize: [32, 32], iconAnchor: [16, 16] }));
}
setCarIcon();

map.on("click", ev => setPlace({ lat: ev.latlng.lat, lng: ev.latlng.wrap().lng }));

// ---------- place ----------

let placeSeq = 0;

function setStatus(text) {
  $("placeStatus").textContent = text;
}

function setLoading(loading) {
  $("honk").disabled = loading;
  $("honk").querySelector(".honk-sub").textContent = loading ? "driving there…" : "press & hold";
}

// Move the car. `name` is optional; without it we ask the geocoder what the place is called.
async function setPlace(point, name) {
  const seq = ++placeSeq;
  state.point = point;
  state.placeName = name || `${point.lat.toFixed(3)}, ${point.lng.toFixed(3)}`;
  state.sample = null;
  // New place, new audience: back to zero until the horn is pressed again.
  stopHonk();
  cancelAnimationFrame(raf);
  state.hasHonked = false;
  state.seconds = 0;
  state.tz = timeZoneFor(point);
  resetToNow(); // "right now" means right now *there*

  const placeIndex = PLACES.findIndex(p => p.name === name);
  const select = $("place");
  select.querySelector('option[value="custom"]').hidden = placeIndex < 0;
  select.value = placeIndex < 0 ? "custom" : placeIndex;

  car.setLatLng(point);
  for (const ring of Object.values(rings)) ring.setLatLng(point);
  ripple.setLatLng(point);
  setStatus("Driving there…");
  setLoading(true);

  const [sample, label] = await Promise.all([
    sampleAt(point.lat, point.lng).catch(() => null),
    name || reverseGeocode(point),
  ]);
  if (seq !== placeSeq) return; // the car moved again while we were counting

  state.sample = sample ?? { res: 0, nres: 0, builtFrac: 0 };
  state.placeName = label;
  setLoading(false);
  setStatus(sample
    ? `${label} · ${fmt(sample.res)} residents per km² · ${state.tz.replace(/_/g, " ")}`
    : `${label} · population data unavailable (old browser?)`);
  update({ refit: true });
}

function goTo(point, name, zoom = 15) {
  map.setView(point, zoom);
  setPlace(point, name);
}

// ---------- model glue ----------

function currentEstimate() {
  return estimate(densityFromSample(state.sample), {
    hour: state.hour,
    dayType: state.dayType,
    season: state.season,
    vehicleDb: state.vehicle.db,
    seconds: Math.max(state.seconds, MIN_HONK_SECONDS),
  });
}

function update({ refit = false } = {}) {
  if (!state.sample) return;
  const e = currentEstimate();
  rings.heard.setRadius(Math.max(e.radii.heard, 1));
  rings.bothered.setRadius(Math.max(e.radii.bothered, 1));
  const showWoke = e.asleepFrac > 0.1;
  rings.woke.setRadius(showWoke ? Math.max(e.radii.woke, 1) : 0.01);
  rings.woke.setStyle({ opacity: showWoke ? 1 : 0, fillOpacity: showWoke ? 0.22 : 0 });

  $("legend").hidden = false;
  $("lgHeard").textContent = `${fmt(e.radii.heard)} m`;
  $("lgBothered").textContent = `${fmt(e.radii.bothered)} m`;
  $("lgWokeWrap").hidden = !showWoke;
  $("lgWoke").textContent = `${fmt(e.radii.woke)} m`;

  if (refit || !map.getBounds().contains(rings.heard.getBounds())) {
    map.fitBounds(rings.heard.getBounds(), { padding: [40, 40], maxZoom: 17 });
  }
  renderResults(e, state.hasHonked ? 1 : 0);
  return e;
}

// `reached` is the share of the audience the sound wave has reached so far (0 before the honk, 1 when done).
function renderResults(full, reached) {
  const e = { ...full };
  for (const key of COUNT_FIELDS) e[key] = full[key] * reached;
  const seconds = Math.max(state.seconds, MIN_HONK_SECONDS);
  const held = honkStart !== null;
  const when = `${state.placeName} · ${state.dayType} ${formatTime(Math.round(state.hour * 60))} local · ${state.vehicle.name}`;

  $("results").hidden = false;
  $("share").parentElement.hidden = !state.hasHonked;
  $("kicker").textContent = state.hasHonked ? `${seconds.toFixed(1)}-second honk · ${when}` : when;
  $("heard").textContent = fmt(e.heard);
  $("annoyed").textContent = fmt(e.annoyed);
  $("mapBar").hidden = false;
  $("barHeard").textContent = fmt(e.heard);
  $("barAnnoyed").textContent = fmt(e.annoyed);
  $("barFill").style.width = `${e.heard > 0 ? (100 * e.annoyed / e.heard) : 0}%`;
  $("annoyedHint").textContent = !state.hasHonked ? "hold the horn longer to annoy more"
    : held ? "still climbing — keep holding"
    : reached < 1 ? "sound still spreading…"
    : `after ${seconds.toFixed(1)} s of honking`;
  $("verdict").textContent = !state.hasHonked ? "Press and hold the horn to find out." : reached < 0.01 ? "…" : verdict(e);

  const rows = [
    ["Heard it on the street", fmt(e.heardOutdoors)],
    ["Heard it indoors", fmt(e.heardIndoors)],
    ["Annoyed instantly", fmt(e.bothered)],
  ];
  if (e.asleepFrac > 0.1 || e.woken >= 0.5) rows.push(["Woken up", fmt(e.woken)]);
  if (e.babies >= 0.5) rows.push(["Sleeping babies woken", `${fmt(e.babies)} (parents notified)`]);
  if (e.dogs >= 0.5) rows.push(["Dogs now barking", fmt(e.dogs)]);
  if (e.calls >= 0.5) rows.push(["Video calls interrupted", `${fmt(e.calls)} (“sorry, traffic”)`]);
  if (e.honkBacks >= 0.5) rows.push(["Drivers who honked back", fmt(e.honkBacks)]);
  rows.push(["Collective human attention consumed", formatDuration(e.heard * (seconds + DOUBLE_TAKE_SECONDS))]);
  const venue = venueComparison(e.heard);
  if (venue) rows.push(["Audience size", venue]);
  if (e.annoyed >= 1 && inNYC(state.point)) {
    rows.push(["NYC fine per person annoyed, if ticketed", `$${(NYC_FINE / e.annoyed).toFixed(2)} — a bargain`]);
  }
  rows.push(["Cars that moved because of it", "0"]);

  $("stats").replaceChildren(...rows.flatMap(([label, value]) => {
    const dt = document.createElement("dt"), dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    return [dt, dd];
  }));
}

// ---------- horn sound ----------

let audio = null;
let voice = null;

function startSound() {
  if (!$("sound").checked) return;
  audio ??= new (window.AudioContext || window.webkitAudioContext)();
  audio.resume();
  const gain = audio.createGain();
  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2400;
  gain.gain.setValueAtTime(0, audio.currentTime);
  gain.gain.linearRampToValueAtTime(0.13, audio.currentTime + 0.02);
  filter.connect(gain).connect(audio.destination);
  const oscillators = state.vehicle.tones.map((hz, i) => {
    const osc = audio.createOscillator();
    osc.type = state.vehicle.wave;
    osc.frequency.value = hz;
    osc.detune.value = i * 7;
    osc.connect(filter);
    osc.start();
    return osc;
  });
  voice = { gain, oscillators };
}

function stopSound() {
  if (!voice) return;
  const { gain, oscillators } = voice;
  voice = null;
  gain.gain.cancelScheduledValues(audio.currentTime);
  gain.gain.setTargetAtTime(0, audio.currentTime, 0.02);
  for (const osc of oscillators) osc.stop(audio.currentTime + 0.15);
}

// ---------- honking ----------

let honkStart = null; // performance.now() while the horn is held
let waveStart = 0;    // when the current sound wave left the car
let raf = 0;

function startHonk() {
  if (honkStart !== null || !state.sample) return;
  honkStart = waveStart = performance.now();
  state.hasHonked = true;
  state.seconds = 0;
  $("honk").classList.add("down");
  $("shareMsg").textContent = "";
  startSound();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

function stopHonk() {
  if (honkStart === null) return;
  state.seconds = Math.max((performance.now() - honkStart) / 1000, MIN_HONK_SECONDS);
  honkStart = null;
  $("honk").classList.remove("down");
  stopSound();
}

function tick(now) {
  const held = honkStart !== null;
  if (held) state.seconds = (now - honkStart) / 1000;
  const e = currentEstimate();

  // The wavefront spreads out from the car; the count grows with the area it has covered.
  const radius = e.radii.heard;
  const front = Math.min(WAVE_SPEED * (now - waveStart) / 1000, radius);
  const reached = radius > 0 ? (front / radius) ** 2 : 1;
  renderResults(e, reached);

  if (front < radius) {
    ripple.setRadius(Math.max(1, front));
    ripple.setStyle({ opacity: 0.9 });
  } else if (held) {
    const phase = ((now - waveStart) % 900) / 900; // keep pulsing while the horn is held
    ripple.setRadius(Math.max(1, radius * phase));
    ripple.setStyle({ opacity: 0.9 * (1 - phase) });
  } else {
    ripple.setStyle({ opacity: 0 });
  }
  if (held || reached < 1) raf = requestAnimationFrame(tick);
  else update();
}

function bindHonkButton() {
  const button = $("honk");
  button.addEventListener("pointerdown", ev => {
    if (ev.button !== 0) return;
    button.setPointerCapture(ev.pointerId);
    startHonk();
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(type, stopHonk);
  button.addEventListener("keydown", ev => {
    if ((ev.key === " " || ev.key === "Enter") && !ev.repeat) { ev.preventDefault(); startHonk(); }
  });
  button.addEventListener("keyup", ev => {
    if (ev.key === " " || ev.key === "Enter") stopHonk();
  });
  button.addEventListener("blur", stopHonk);
  button.addEventListener("contextmenu", ev => ev.preventDefault());
}

// ---------- search ----------

let searchTimer = 0;
let searchSeq = 0;

function showSearchResults(features) {
  const list = $("searchResults");
  if (features === null) {
    list.replaceChildren();
    list.hidden = true;
    return;
  }
  if (features.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Nothing found. Try a city name.";
    list.replaceChildren(li);
  } else {
    list.replaceChildren(...features.map(f => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = placeLabel(f.properties);
      button.addEventListener("click", () => {
        const [lng, lat] = f.geometry.coordinates;
        $("search").value = button.textContent;
        showSearchResults(null);
        goTo({ lat, lng }, button.textContent, f.properties.osm_value === "city" ? 14 : 15);
      });
      li.append(button);
      return li;
    }));
  }
  list.hidden = false;
}

async function runSearch(query) {
  const seq = ++searchSeq;
  const c = map.getCenter();
  try {
    const res = await fetch(`${PHOTON}/api/?q=${encodeURIComponent(query)}&limit=6&lang=en&lat=${c.lat}&lon=${c.lng}`);
    const data = await res.json();
    const seen = new Set();
    const features = data.features.filter(f => {
      const label = placeLabel(f.properties);
      return !seen.has(label) && seen.add(label);
    });
    if (seq === searchSeq) showSearchResults(features);
  } catch {
    if (seq === searchSeq) showSearchResults([]);
  }
}

function bindSearch() {
  const input = $("search");
  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const query = input.value.trim();
    if (query.length < 3) { showSearchResults(null); return; }
    searchTimer = setTimeout(() => runSearch(query), 300);
  });
  input.addEventListener("keydown", ev => {
    if (ev.key === "Escape") showSearchResults(null);
    if (ev.key === "Enter") { clearTimeout(searchTimer); if (input.value.trim().length >= 3) runSearch(input.value.trim()); }
    if (ev.key === "ArrowDown") $("searchResults").querySelector("button")?.focus();
  });
  document.addEventListener("click", ev => {
    if (!ev.target.closest(".where")) showSearchResults(null);
  });

  $("locate").addEventListener("click", () => {
    if (!navigator.geolocation) { setStatus("Your browser won't say where you are."); return; }
    setStatus("Locating…");
    navigator.geolocation.getCurrentPosition(
      pos => goTo({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setStatus("Couldn't get your location. Click the map instead."),
      { timeout: 10000 },
    );
  });
}

// ---------- controls ----------

function bindChips(containerId, getValue, setValue) {
  const container = $(containerId);
  const sync = () => {
    for (const chip of container.children) chip.setAttribute("aria-checked", String(chip.dataset.value === getValue()));
  };
  container.addEventListener("click", ev => {
    const chip = ev.target.closest("button");
    if (!chip) return;
    setValue(chip.dataset.value);
    sync();
    update();
  });
  return sync;
}

let syncDay = () => {};
let syncSeason = () => {};

function setTime(minutes) {
  state.hour = minutes / 60;
  $("time").value = minutes;
  $("timeLabel").textContent = formatTime(minutes);
}

function resetToNow() {
  const now = nowAt(state.tz, state.point?.lat ?? 40.7);
  state.dayType = now.dayType;
  state.season = now.season;
  setTime(Math.floor(now.minutes / 15) * 15);
  syncDay();
  syncSeason();
}

function init() {
  const select = $("place");
  const groups = new Map();
  PLACES.forEach((p, i) => {
    if (!groups.has(p.group)) {
      const group = document.createElement("optgroup");
      group.label = p.group;
      groups.set(p.group, group);
      select.append(group);
    }
    groups.get(p.group).append(new Option(p.name, i));
  });
  const custom = new Option("Map pin / search result", "custom");
  custom.hidden = true;
  select.append(custom);
  select.addEventListener("change", () => {
    const p = PLACES[select.value];
    if (p) goTo({ lat: p.lat, lng: p.lng }, p.name);
  });

  $("vehicleChips").append(...VEHICLES.map(v => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.setAttribute("role", "radio");
    chip.dataset.value = v.id;
    const emoji = document.createElement("span");
    emoji.className = "emoji";
    emoji.textContent = v.emoji;
    chip.append(emoji, v.name);
    return chip;
  }));

  syncDay = bindChips("dayChips", () => state.dayType, v => { state.dayType = v; });
  syncSeason = bindChips("seasonChips", () => state.season, v => { state.season = v; });
  bindChips("vehicleChips", () => state.vehicle.id, v => { state.vehicle = VEHICLES.find(x => x.id === v); setCarIcon(); })();

  $("time").addEventListener("input", ev => { setTime(Number(ev.target.value)); update(); });
  $("nowBtn").addEventListener("click", () => { resetToNow(); update(); });

  $("share").addEventListener("click", async () => {
    const e = currentEstimate();
    const text = `I honked for ${Math.max(state.seconds, MIN_HONK_SECONDS).toFixed(1)}s (${state.placeName}, ${formatTime(Math.round(state.hour * 60))}). ` +
      `${fmt(e.heard)} people heard it, ${fmt(e.annoyed)} are annoyed${e.woken >= 1 ? `, ${fmt(e.woken)} woke up` : ""}. Cars that moved: 0. ${location.href}`;
    try {
      await navigator.clipboard.writeText(text);
      $("shareMsg").textContent = "Copied. Post it where your victims can see.";
    } catch {
      $("shareMsg").textContent = text;
    }
  });

  bindHonkButton();
  bindSearch();

  const start = PLACES[0];
  setPlace({ lat: start.lat, lng: start.lng }, start.name);
}

init();
