const $ = id => document.getElementById(id);

const MIN_HONK_SECONDS = 0.3;
const COUNT_UP_MS = 800;
const DOUBLE_TAKE_SECONDS = 2; // time each listener loses to "what was that" on top of the honk itself
const FINE = 350;

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
  hour: 12,
  dayType: "weekday",
  season: "fall",
  vehicle: VEHICLES[1],
  reason: REASONS[0],
  seconds: 0,
  hasHonked: false,
};

// ---------- time ----------

function nycNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour12: false,
      hour: "numeric", minute: "numeric", weekday: "short", month: "numeric",
    }).formatToParts(new Date()).map(p => [p.type, p.value])
  );
  const month = Number(parts.month);
  return {
    minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
    dayType: parts.weekday === "Sat" || parts.weekday === "Sun" ? "weekend" : "weekday",
    season: month <= 2 || month === 12 ? "winter" : month <= 5 ? "spring" : month <= 8 ? "summer" : "fall",
  };
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
  if (n < 1) line = "Nobody heard that. Are you in the harbor?";
  else if (n < 50) line = "Barely a ripple. By New York standards you're basically a monk.";
  else if (n < 400) line = "A few packed subway cars' worth of people just flinched.";
  else if (n < 1500) line = "An off-Broadway audience's worth of people now think less of you.";
  else if (n < 5000) line = "Thousands of people, one shared thought: “WHO is honking.”";
  else if (n < 15000) line = "You just addressed a small arena. Your message was “HONK.”";
  else line = "A stadium's worth of New Yorkers heard you. None of them were the car in front of you.";
  if (e.woken >= 1) {
    line += ` You also woke up ${fmt(e.woken)} ${Math.round(e.woken) === 1 ? "person" : "people"}. They know what you drive.`;
  }
  return line;
}

// ---------- map ----------

// Circles need a view before they can report bounds, so start on Midtown.
const map = L.map("map").setView([40.758, -73.9855], 14);
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
const car = L.marker([0, 0], {
  icon: L.divIcon({ className: "car", html: "🚕", iconSize: [32, 32], iconAnchor: [16, 16] }),
  interactive: false,
}).addTo(map);

map.on("click", ev => {
  const point = { lat: ev.latlng.lat, lng: ev.latlng.lng };
  const d = densityAt(point);
  setPoint(point, d.nearestKm < 0.25 ? d.nearest.name : `near ${d.nearest.name}`, true);
});

// ---------- model glue ----------

function currentEstimate() {
  return estimate(densityAt(state.point), {
    hour: state.hour,
    dayType: state.dayType,
    season: state.season,
    vehicleDb: state.vehicle.db,
    seconds: Math.max(state.seconds, MIN_HONK_SECONDS),
  });
}

function setPoint(point, name, custom) {
  state.point = point;
  state.placeName = name;
  const select = $("hood");
  const customOption = select.querySelector('option[value="custom"]');
  customOption.hidden = !custom;
  if (custom) {
    customOption.textContent = `Map pin (${name})`;
    select.value = "custom";
  }
  car.setLatLng(point);
  for (const ring of Object.values(rings)) ring.setLatLng(point);
  ripple.setLatLng(point);
  update({ refit: true });
}

function update({ refit = false } = {}) {
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
  if (state.hasHonked) renderResults(e, 1);
  return e;
}

function renderResults(e, progress) {
  const seconds = Math.max(state.seconds, MIN_HONK_SECONDS);
  $("results").hidden = false;
  $("kicker").textContent =
    `${seconds.toFixed(1)}-second honk · ${state.placeName} · ${state.dayType} ${formatTime(Math.round(state.hour * 60))} · ${state.vehicle.name}`;
  $("heard").textContent = fmt(e.heard * progress);
  $("verdict").textContent = verdict(e);
  $("effect").textContent = state.reason.effect;

  const rows = [
    ["Heard it on the street", fmt(e.heardOutdoors)],
    ["Heard it indoors", fmt(e.heardIndoors)],
    ["Actively bothered", fmt(e.bothered)],
  ];
  if (e.asleepFrac > 0.1 || e.woken >= 0.5) rows.push(["Woken up", fmt(e.woken)]);
  if (e.babies >= 0.5) rows.push(["Sleeping babies woken", `${fmt(e.babies)} (parents notified)`]);
  if (e.dogs >= 0.5) rows.push(["Dogs now barking", fmt(e.dogs)]);
  if (e.calls >= 0.5) rows.push(["Video calls interrupted", `${fmt(e.calls)} (“sorry, I'm in New York”)`]);
  if (e.honkBacks >= 0.5) rows.push(["Drivers who honked back", fmt(e.honkBacks)]);
  rows.push(["Collective human attention consumed", formatDuration(e.heard * (seconds + DOUBLE_TAKE_SECONDS))]);
  const venue = venueComparison(e.heard);
  if (venue) rows.push(["Audience size", venue]);
  if (e.bothered >= 1) rows.push(["Fine per person bothered, if ticketed", `$${(FINE / e.bothered).toFixed(2)} — a bargain`]);
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
let honkShownAt = 0;
let raf = 0;

function startHonk() {
  if (honkStart !== null) return;
  honkStart = honkShownAt = performance.now();
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
  const progress = Math.min(1, (now - honkShownAt) / COUNT_UP_MS);
  const e = currentEstimate();
  renderResults(e, 1 - (1 - progress) ** 3);

  if (held) {
    const phase = ((now - honkStart) % 900) / 900;
    ripple.setRadius(Math.max(1, e.radii.heard * phase));
    ripple.setStyle({ opacity: 0.9 * (1 - phase) });
  } else {
    ripple.setStyle({ opacity: 0 });
  }
  if (held || progress < 1) raf = requestAnimationFrame(tick);
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

function setTime(minutes) {
  state.hour = minutes / 60;
  $("time").value = minutes;
  $("timeLabel").textContent = formatTime(minutes);
}

function init() {
  const hoodSelect = $("hood");
  hoodSelect.append(...HOODS.map((h, i) => new Option(h.name, i)));
  const custom = new Option("Map pin", "custom");
  custom.hidden = true;
  hoodSelect.append(custom);
  hoodSelect.addEventListener("change", () => {
    const h = HOODS[hoodSelect.value];
    if (h) setPoint({ lat: h.lat, lng: h.lng }, h.name, false);
  });

  $("reason").append(...REASONS.map(r => new Option(r.name, r.id)));
  $("reason").addEventListener("change", ev => {
    state.reason = REASONS.find(r => r.id === ev.target.value);
    update();
  });

  $("vehicleChips").append(...VEHICLES.map(v => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.setAttribute("role", "radio");
    chip.dataset.value = v.id;
    chip.textContent = v.name;
    return chip;
  }));

  const syncDay = bindChips("dayChips", () => state.dayType, v => { state.dayType = v; });
  const syncSeason = bindChips("seasonChips", () => state.season, v => { state.season = v; });
  bindChips("vehicleChips", () => state.vehicle.id, v => { state.vehicle = VEHICLES.find(x => x.id === v); })();

  $("time").addEventListener("input", ev => { setTime(Number(ev.target.value)); update(); });

  const resetToNow = () => {
    const now = nycNow();
    state.dayType = now.dayType;
    state.season = now.season;
    setTime(Math.floor(now.minutes / 15) * 15);
    syncDay();
    syncSeason();
  };
  $("nowBtn").addEventListener("click", () => { resetToNow(); update(); });
  resetToNow();

  $("share").addEventListener("click", async () => {
    const e = currentEstimate();
    const text = `I honked for ${Math.max(state.seconds, MIN_HONK_SECONDS).toFixed(1)}s (${state.placeName}, ${formatTime(Math.round(state.hour * 60))}). ` +
      `${fmt(e.heard)} people heard it${e.woken >= 1 ? `, ${fmt(e.woken)} woke up` : ""}. Cars that moved: 0. ${location.href}`;
    try {
      await navigator.clipboard.writeText(text);
      $("shareMsg").textContent = "Copied. Post it where your victims can see.";
    } catch {
      $("shareMsg").textContent = text;
    }
  });

  bindHonkButton();

  const start = HOODS.findIndex(h => h.name.startsWith("Midtown (Times"));
  hoodSelect.value = start;
  setPoint({ lat: HOODS[start].lat, lng: HOODS[start].lng }, HOODS[start].name, false);
}

init();
