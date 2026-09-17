// The "semi-rigorous" part. All levels in dB, distances in metres, densities in people/km².

const CANYON_BOOST = 3;        // reflections off building faces
const CLUTTER_DB_PER_M = 0.04; // excess urban attenuation on top of spherical spreading
const SHIELD = 0.4;            // share of the circle not blocked by buildings
const FACADE = { closed: 27, open: 10 };
const WAKE_LEVEL = 42;         // indoor dB at which sleepers start waking

// Hourly curves, index 0..24, linearly interpolated.
const CURVES = {
  // how far the population has shifted from "residents" to "daytime crowd"
  work: {
    weekday: [0, 0, 0, 0, 0, 0.02, 0.1, 0.3, 0.6, 0.85, 0.97, 1, 1, 1, 1, 0.97, 0.9, 0.78, 0.6, 0.45, 0.33, 0.25, 0.17, 0.08, 0],
    weekend: [0.08, 0.05, 0.03, 0, 0, 0, 0, 0, 0.05, 0.12, 0.22, 0.32, 0.4, 0.45, 0.45, 0.45, 0.42, 0.4, 0.38, 0.35, 0.3, 0.25, 0.2, 0.14, 0.08],
  },
  asleep: {
    weekday: [0.55, 0.72, 0.83, 0.88, 0.88, 0.8, 0.55, 0.3, 0.12, 0.05, 0.03, 0.02, 0.02, 0.02, 0.03, 0.03, 0.02, 0.02, 0.02, 0.02, 0.03, 0.06, 0.15, 0.35, 0.55],
    weekend: [0.4, 0.58, 0.74, 0.84, 0.88, 0.87, 0.8, 0.68, 0.5, 0.3, 0.15, 0.07, 0.04, 0.03, 0.04, 0.04, 0.03, 0.02, 0.02, 0.02, 0.02, 0.04, 0.1, 0.24, 0.4],
  },
  // dB the background noise drops below its daytime level
  quiet: [9, 11, 11.5, 12, 11.5, 9, 5, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 2, 3.5, 5, 7, 9],
  outdoors: [0.02, 0.012, 0.008, 0.006, 0.006, 0.01, 0.025, 0.06, 0.1, 0.09, 0.09, 0.1, 0.13, 0.12, 0.1, 0.1, 0.11, 0.13, 0.13, 0.11, 0.09, 0.07, 0.05, 0.03, 0.02],
};

const SEASONS = {
  winter: { windowsOpen: 0.03, outdoors: 0.55 },
  spring: { windowsOpen: 0.4, outdoors: 1 },
  summer: { windowsOpen: 0.35, outdoors: 1.3 },
  fall: { windowsOpen: 0.35, outdoors: 1 },
};

function curveAt(curve, hour) {
  const i = Math.floor(hour) % 24;
  const t = hour - Math.floor(hour);
  return curve[i] + (curve[i + 1] - curve[i]) * t;
}

function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

function distanceKm(a, b) {
  const x = (b.lng - a.lng) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180) * 111.32;
  const y = (b.lat - a.lat) * 110.57;
  return Math.hypot(x, y);
}

// Inverse-distance-weighted density for an arbitrary point, fading out away from the city.
function densityAt(point) {
  let wSum = 0, res = 0, day = 0, nearest = null, nearestD = Infinity;
  for (const h of HOODS) {
    const d = distanceKm(point, h);
    const w = 1 / (d * d + 0.0225);
    wSum += w;
    res += h.res * w;
    day += h.day * w;
    if (d < nearestD) { nearestD = d; nearest = h; }
  }
  const fade = nearestD > 2 ? Math.exp(-(nearestD - 2) / 1.5) : 1;
  return { res: (res / wSum) * fade, day: (day / wSum) * fade, nearest, nearestKm: nearestD };
}

// Distance at which a source of `l0` dB (at 1 m) has fallen to `threshold` dB.
function radiusFor(l0, threshold) {
  const level = r => l0 - 20 * Math.log10(r) - CLUTTER_DB_PER_M * r;
  if (level(1) <= threshold) return 0;
  let lo = 1, hi = 5000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (level(mid) > threshold) lo = mid; else hi = mid;
  }
  return lo;
}

function areaKm2(r) {
  return Math.PI * (r / 1000) ** 2 * SHIELD;
}

/**
 * @param {{res:number, day:number}} density
 * @param {{hour:number, dayType:'weekday'|'weekend', season:string, vehicleDb:number, seconds:number}} o
 */
function estimate(density, o) {
  const work = curveAt(CURVES.work[o.dayType], o.hour);
  const asleepFrac = curveAt(CURVES.asleep[o.dayType], o.hour);
  const season = SEASONS[o.season];

  const people = density.res + (density.day - density.res) * work;
  const asleep = Math.min(people, density.res) * asleepFrac;
  const awake = people - asleep;
  const outdoors = awake * clamp(curveAt(CURVES.outdoors, o.hour) * season.outdoors, 0, 1);
  const indoors = awake - outdoors;

  const ambientDay = 60 + 6.5 * Math.log10(Math.max(density.day, 1000) / 5000);
  const ambient = ambientDay - curveAt(CURVES.quiet, o.hour);
  const indoorAmbient = Math.max(30, ambient - 30);

  // Office districts don't have openable windows.
  const officeness = clamp((density.day / Math.max(density.res, 1) - 1) / 5, 0, 1);
  const open = season.windowsOpen * (1 - 0.7 * work * officeness);

  const l0 = o.vehicleDb + CANYON_BOOST;
  const r = {
    heard: radiusFor(l0, ambient - 8),
    bothered: radiusFor(l0, ambient + 3),
    heardOpen: radiusFor(l0, indoorAmbient - 5 + FACADE.open),
    heardClosed: radiusFor(l0, indoorAmbient - 5 + FACADE.closed),
    botheredOpen: radiusFor(l0, indoorAmbient + 8 + FACADE.open),
    botheredClosed: radiusFor(l0, indoorAmbient + 8 + FACADE.closed),
    wakeOpen: radiusFor(l0, WAKE_LEVEL + FACADE.open),
    wakeClosed: radiusFor(l0, WAKE_LEVEL + FACADE.closed),
  };
  const indoorArea = (rOpen, rClosed) => open * areaKm2(rOpen) + (1 - open) * areaKm2(rClosed);

  const wakeChance = clamp(0.15 + 0.08 * o.seconds, 0, 0.6);
  const wakeArea = indoorArea(r.wakeOpen, r.wakeClosed);
  const woken = asleep * wakeArea * wakeChance;

  const heardOutdoors = outdoors * areaKm2(r.heard);
  const heardIndoors = indoors * indoorArea(r.heardOpen, r.heardClosed);
  const heard = heardOutdoors + heardIndoors + woken;

  const botheredIndoors = indoors * indoorArea(r.botheredOpen, r.botheredClosed);
  const bothered = outdoors * areaKm2(r.bothered) + botheredIndoors + woken;

  // Babies are 1.2% of residents, nap at all hours, and wake easily.
  const babies = density.res * 0.012 * Math.max(asleepFrac, 0.45) * wakeArea * clamp(wakeChance * 2, 0, 0.9);
  // ~1 dog per 14 New Yorkers; they hear further than we do and a quarter have opinions.
  const dogs = density.res * 0.07 * indoorArea(r.heardOpen * 1.3, r.heardClosed * 1.3) * 0.25;
  const calls = o.dayType === "weekday" ? botheredIndoors * 0.12 * work : 0;
  const honkBacks = outdoors * areaKm2(r.bothered) * 0.03;

  return {
    heard, heardOutdoors, heardIndoors, bothered, woken, babies, dogs, calls, honkBacks,
    ambient, asleepFrac, people,
    radii: { heard: r.heard, bothered: r.bothered, woke: open > 0.2 ? r.wakeOpen : r.wakeClosed },
  };
}
