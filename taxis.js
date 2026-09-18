// Local taxi liveries, drawn as SVG. Picked automatically from the reverse-geocoded city/country.
// `shape` picks the outline; body/roof/stripe/sign are colors; `checker` adds the NYC checker band.

const TAXI_SHAPES = {
  // generic modern sedan
  sedan: "M3 27 L5 19 L15 18 L23 10 L43 10 L52 18 L60 19 L61 27 Z",
  // London-style cab: tall, rounded roof, upright back
  cab: "M4 27 L5 16 Q6 9 14 8 L44 8 Q51 9 55 15 L60 17 L61 27 Z",
  // Crown Comfort / JPN taxi: boxy upright cabin
  box: "M3 27 L5 18 L13 17 L18 8 L47 8 L53 17 L60 18 L61 27 Z",
  // Padmini / Ambassador: rounded fenders and cabin
  classic: "M3 27 Q3 17 12 17 L19 10 Q32 6 45 10 L51 17 Q61 17 61 27 Z",
};

const TAXI_WINDOWS = {
  sedan: ["M17 18 L24 12 L31 12 L31 18 Z", "M34 12 L42 12 L49 18 L34 18 Z"],
  cab: ["M9 16 L15 10 L29 10 L29 16 Z", "M32 10 L43 10 L50 16 L32 16 Z"],
  box: ["M15 17 L19 10 L31 10 L31 17 Z", "M34 10 L46 10 L50 17 L34 17 Z"],
  classic: ["M15 17 L20 12 L30 11 L30 17 Z", "M33 11 L43 12 L48 17 L33 17 Z"],
};

const TAXIS = {
  generic: { name: "local taxi", shape: "sedan", body: "#c9ccd3", roof: "#c9ccd3", sign: "#f7c600" },
  // city-level (matched against city / district / county / state names)
  "new york": { name: "NYC yellow cab", shape: "sedan", body: "#f7c600", roof: "#f7c600", sign: "#111", checker: true },
  london: { name: "London black cab", shape: "cab", body: "#151515", roof: "#151515", sign: "#f7c600" },
  berlin: { name: "Berlin cream taxi", shape: "sedan", body: "#f1e4b3", roof: "#f1e4b3", sign: "#f7c600" },
  paris: { name: "Paris taxi", shape: "sedan", body: "#f4f4f4", roof: "#f4f4f4", sign: "#2ecc71" },
  madrid: { name: "Madrid white taxi", shape: "sedan", body: "#f4f4f4", roof: "#f4f4f4", stripe: "#d62828", sign: "#2ecc71" },
  barcelona: { name: "Barcelona black-and-yellow taxi", shape: "sedan", body: "#151515", roof: "#151515", stripe: "#f7c600", sign: "#2ecc71" },
  rome: { name: "Rome white taxi", shape: "sedan", body: "#f4f4f4", roof: "#f4f4f4", sign: "#f7c600" },
  athens: { name: "Athens yellow taxi", shape: "sedan", body: "#f5d000", roof: "#f5d000", sign: "#111" },
  istanbul: { name: "Istanbul yellow taxi", shape: "sedan", body: "#f7c600", roof: "#f7c600", sign: "#111" },
  moscow: { name: "Moscow yellow taxi", shape: "sedan", body: "#f7c600", roof: "#f7c600", sign: "#111" },
  cairo: { name: "Cairo white taxi", shape: "classic", body: "#f4f4f4", roof: "#f4f4f4", stripe: "#151515", sign: "#111" },
  lagos: { name: "Lagos yellow taxi", shape: "classic", body: "#f7c600", roof: "#f7c600", stripe: "#151515", sign: "#111" },
  nairobi: { name: "Nairobi taxi", shape: "sedan", body: "#f4f4f4", roof: "#f4f4f4", stripe: "#f7c600", sign: "#111" },
  dubai: { name: "Dubai cream taxi", shape: "sedan", body: "#f1e4b3", roof: "#c8102e", sign: "#111" },
  mumbai: { name: "Mumbai kaali-peeli", shape: "classic", body: "#151515", roof: "#f7c600", sign: "#111" },
  kolkata: { name: "Kolkata yellow Ambassador", shape: "classic", body: "#f7c600", roof: "#f7c600", sign: "#111" },
  delhi: { name: "Delhi kaali-peeli", shape: "classic", body: "#151515", roof: "#f7c600", sign: "#111" },
  dhaka: { name: "Dhaka yellow cab", shape: "sedan", body: "#f7c600", roof: "#f7c600", sign: "#111" },
  bangkok: { name: "Bangkok pink taxi", shape: "sedan", body: "#ff2d95", roof: "#ff2d95", sign: "#f4f4f4" },
  tokyo: { name: "Tokyo taxi", shape: "box", body: "#151515", roof: "#151515", sign: "#f7c600" },
  shanghai: { name: "Shanghai turquoise taxi", shape: "sedan", body: "#2aa8a0", roof: "#2aa8a0", sign: "#f4f4f4" },
  beijing: { name: "Beijing two-tone taxi", shape: "sedan", body: "#f7c600", roof: "#2b6f3e", sign: "#f4f4f4" },
  seoul: { name: "Seoul orange taxi", shape: "sedan", body: "#ff8c1a", roof: "#ff8c1a", sign: "#f4f4f4" },
  jakarta: { name: "Jakarta Blue Bird", shape: "sedan", body: "#7fb8e6", roof: "#7fb8e6", sign: "#f4f4f4" },
  manila: { name: "Manila white taxi", shape: "sedan", body: "#f4f4f4", roof: "#f4f4f4", sign: "#111" },
  "mexico city": { name: "Mexico City pink-and-white taxi", shape: "sedan", body: "#e6007e", roof: "#f4f4f4", sign: "#111" },
  "rio de janeiro": { name: "Rio yellow taxi", shape: "sedan", body: "#f7c600", roof: "#f7c600", stripe: "#1e5bc6", sign: "#111" },
  "são paulo": { name: "São Paulo white taxi", shape: "sedan", body: "#f4f4f4", roof: "#f4f4f4", sign: "#d62828" },
  "buenos aires": { name: "Buenos Aires black-and-yellow taxi", shape: "sedan", body: "#151515", roof: "#f7c600", sign: "#111" },
  melbourne: { name: "Melbourne yellow taxi", shape: "sedan", body: "#f7c600", roof: "#f7c600", sign: "#111" },
  // country-level fallbacks (ISO codes)
  US: { name: "yellow cab", shape: "sedan", body: "#f7c600", roof: "#f7c600", sign: "#111" },
  GB: { name: "black cab", shape: "cab", body: "#151515", roof: "#151515", sign: "#f7c600" },
  DE: { name: "cream taxi", shape: "sedan", body: "#f1e4b3", roof: "#f1e4b3", sign: "#f7c600" },
  FR: { name: "French taxi", shape: "sedan", body: "#f4f4f4", roof: "#f4f4f4", sign: "#2ecc71" },
  ES: { name: "Spanish taxi", shape: "sedan", body: "#f4f4f4", roof: "#f4f4f4", sign: "#2ecc71" },
  IT: { name: "Italian white taxi", shape: "sedan", body: "#f4f4f4", roof: "#f4f4f4", sign: "#f7c600" },
  PT: { name: "Portuguese cream taxi", shape: "sedan", body: "#f1e4b3", roof: "#f1e4b3", sign: "#2ecc71" },
  GR: { name: "Greek yellow taxi", shape: "sedan", body: "#f5d000", roof: "#f5d000", sign: "#111" },
  TR: { name: "Turkish yellow taxi", shape: "sedan", body: "#f7c600", roof: "#f7c600", sign: "#111" },
  RU: { name: "Russian yellow taxi", shape: "sedan", body: "#f7c600", roof: "#f7c600", sign: "#111" },
  EG: { name: "Egyptian white taxi", shape: "classic", body: "#f4f4f4", roof: "#f4f4f4", stripe: "#151515", sign: "#111" },
  NG: { name: "Nigerian yellow taxi", shape: "classic", body: "#f7c600", roof: "#f7c600", stripe: "#151515", sign: "#111" },
  KE: { name: "Kenyan taxi", shape: "sedan", body: "#f4f4f4", roof: "#f4f4f4", stripe: "#f7c600", sign: "#111" },
  AE: { name: "Emirati taxi", shape: "sedan", body: "#f1e4b3", roof: "#c8102e", sign: "#111" },
  IN: { name: "kaali-peeli", shape: "classic", body: "#151515", roof: "#f7c600", sign: "#111" },
  BD: { name: "Bangladeshi cab", shape: "sedan", body: "#f7c600", roof: "#f7c600", sign: "#111" },
  TH: { name: "Thai pink taxi", shape: "sedan", body: "#ff2d95", roof: "#ff2d95", sign: "#f4f4f4" },
  JP: { name: "Japanese taxi", shape: "box", body: "#151515", roof: "#151515", sign: "#f7c600" },
  HK: { name: "Hong Kong red taxi", shape: "box", body: "#c8102e", roof: "#c9ccd3", sign: "#f4f4f4" },
  CN: { name: "Chinese taxi", shape: "sedan", body: "#2aa8a0", roof: "#2aa8a0", sign: "#f4f4f4" },
  KR: { name: "Korean taxi", shape: "sedan", body: "#c9ccd3", roof: "#c9ccd3", sign: "#f4f4f4" },
  SG: { name: "Singapore blue cab", shape: "sedan", body: "#1e5bc6", roof: "#1e5bc6", sign: "#f4f4f4" },
  ID: { name: "Blue Bird taxi", shape: "sedan", body: "#7fb8e6", roof: "#7fb8e6", sign: "#f4f4f4" },
  PH: { name: "Filipino white taxi", shape: "sedan", body: "#f4f4f4", roof: "#f4f4f4", sign: "#111" },
  MX: { name: "Mexican taxi", shape: "sedan", body: "#e6007e", roof: "#f4f4f4", sign: "#111" },
  BR: { name: "Brazilian white taxi", shape: "sedan", body: "#f4f4f4", roof: "#f4f4f4", sign: "#d62828" },
  AR: { name: "Argentine black-and-yellow taxi", shape: "sedan", body: "#151515", roof: "#f7c600", sign: "#111" },
  AU: { name: "Australian silver taxi", shape: "sedan", body: "#c9ccd3", roof: "#c9ccd3", sign: "#f7c600" },
  CA: { name: "Canadian taxi", shape: "sedan", body: "#f4f4f4", roof: "#f4f4f4", sign: "#f7c600" },
};

// Pick a livery from what the geocoder told us about the place.
function taxiFor(info) {
  if (info) {
    const names = [info.city, info.district, info.county, info.state].filter(Boolean).map(s => s.toLowerCase());
    for (const [key, taxi] of Object.entries(TAXIS)) {
      if (key === key.toLowerCase() && names.some(n => n.includes(key))) return taxi;
    }
    if (info.countrycode && TAXIS[info.countrycode.toUpperCase()]) return TAXIS[info.countrycode.toUpperCase()];
  }
  return TAXIS.generic;
}

function taxiSvg(taxi) {
  // Two-tone liveries paint the cabin (roof + pillars) in the roof color; the windows are drawn over it.
  const roofPath = taxi.shape === "cab" ? "M6 16 Q7 9 14 8 L44 8 Q51 9 55 15 L55 16 Z" : "M13 16 L18 9 L47 9 L52 16 Z";
  const roof = taxi.roof !== taxi.body ? `<path d="${roofPath}" fill="${taxi.roof}"/>` : "";
  const checker = taxi.checker
    ? Array.from({ length: 14 }, (_, i) =>
        `<rect x="${5 + i * 4}" y="${i % 2 ? 20 : 22}" width="4" height="2" fill="#111"/>`).join("")
    : "";
  const stripe = taxi.stripe ? `<rect x="5" y="20" width="56" height="3" fill="${taxi.stripe}"/>` : "";
  return `<svg viewBox="0 0 64 34" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="27" y="3" width="12" height="5" rx="1.5" fill="${taxi.sign}"/>
    <path d="${TAXI_SHAPES[taxi.shape]}" fill="${taxi.body}"/>
    ${roof}
    ${TAXI_WINDOWS[taxi.shape].map(d => `<path d="${d}" fill="#9fd3ff"/>`).join("")}
    ${stripe}${checker}
    <circle cx="16" cy="27" r="5" fill="#111"/><circle cx="16" cy="27" r="2" fill="#999"/>
    <circle cx="48" cy="27" r="5" fill="#111"/><circle cx="48" cy="27" r="2" fill="#999"/>
    <rect x="58" y="19" width="4" height="2" fill="#ffe08a"/><rect x="2" y="19" width="4" height="2" fill="#ff5252"/>
  </svg>`;
}
