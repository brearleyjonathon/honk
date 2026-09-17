// Approximate people per km². `res` = people who live there, `day` = people present
// on a weekday afternoon (workers, tourists, shoppers). Ballpark figures, not census data.
const HOODS = [
  // Manhattan
  { name: "Financial District", lat: 40.7075, lng: -74.0089, res: 25000, day: 150000 },
  { name: "Tribeca", lat: 40.7163, lng: -74.0086, res: 14000, day: 50000 },
  { name: "Chinatown", lat: 40.7158, lng: -73.9970, res: 38000, day: 60000 },
  { name: "Lower East Side", lat: 40.7150, lng: -73.9843, res: 35000, day: 35000 },
  { name: "SoHo", lat: 40.7233, lng: -74.0030, res: 17000, day: 80000 },
  { name: "East Village", lat: 40.7265, lng: -73.9815, res: 40000, day: 38000 },
  { name: "West Village", lat: 40.7358, lng: -74.0036, res: 27000, day: 40000 },
  { name: "Chelsea", lat: 40.7465, lng: -74.0014, res: 25000, day: 70000 },
  { name: "Flatiron / Union Square", lat: 40.7395, lng: -73.9903, res: 22000, day: 120000 },
  { name: "Murray Hill", lat: 40.7450, lng: -73.9780, res: 38000, day: 60000 },
  { name: "Midtown (Times Square)", lat: 40.7580, lng: -73.9855, res: 15000, day: 280000 },
  { name: "Midtown East", lat: 40.7540, lng: -73.9720, res: 25000, day: 250000 },
  { name: "Hell's Kitchen", lat: 40.7638, lng: -73.9918, res: 30000, day: 45000 },
  { name: "Upper West Side", lat: 40.7870, lng: -73.9754, res: 42000, day: 35000 },
  { name: "Upper East Side", lat: 40.7736, lng: -73.9566, res: 46000, day: 42000 },
  { name: "Central Park", lat: 40.7812, lng: -73.9665, res: 300, day: 8000 },
  { name: "East Harlem", lat: 40.7957, lng: -73.9389, res: 32000, day: 28000 },
  { name: "Harlem", lat: 40.8116, lng: -73.9465, res: 28000, day: 25000 },
  { name: "Morningside Heights", lat: 40.8100, lng: -73.9620, res: 30000, day: 35000 },
  { name: "Washington Heights", lat: 40.8417, lng: -73.9394, res: 35000, day: 28000 },
  { name: "Inwood", lat: 40.8677, lng: -73.9212, res: 20000, day: 15000 },
  // Brooklyn
  { name: "Downtown Brooklyn", lat: 40.6930, lng: -73.9857, res: 20000, day: 80000 },
  { name: "Brooklyn Heights", lat: 40.6960, lng: -73.9936, res: 22000, day: 22000 },
  { name: "Williamsburg", lat: 40.7143, lng: -73.9570, res: 20000, day: 22000 },
  { name: "Greenpoint", lat: 40.7304, lng: -73.9515, res: 14000, day: 13000 },
  { name: "Bushwick", lat: 40.6944, lng: -73.9213, res: 22000, day: 18000 },
  { name: "Bed-Stuy", lat: 40.6872, lng: -73.9418, res: 23000, day: 18000 },
  { name: "Park Slope", lat: 40.6710, lng: -73.9814, res: 25000, day: 20000 },
  { name: "Crown Heights", lat: 40.6694, lng: -73.9422, res: 27000, day: 21000 },
  { name: "Flatbush", lat: 40.6409, lng: -73.9624, res: 28000, day: 22000 },
  { name: "Sunset Park", lat: 40.6455, lng: -74.0124, res: 20000, day: 18000 },
  { name: "Bay Ridge", lat: 40.6264, lng: -74.0299, res: 15000, day: 12000 },
  { name: "Coney Island", lat: 40.5755, lng: -73.9707, res: 12000, day: 12000 },
  { name: "East New York", lat: 40.6590, lng: -73.8759, res: 13000, day: 10000 },
  // Queens
  { name: "Long Island City", lat: 40.7447, lng: -73.9485, res: 12000, day: 30000 },
  { name: "Astoria", lat: 40.7644, lng: -73.9235, res: 18000, day: 14000 },
  { name: "Jackson Heights", lat: 40.7557, lng: -73.8831, res: 27000, day: 22000 },
  { name: "Flushing", lat: 40.7590, lng: -73.8303, res: 15000, day: 25000 },
  { name: "Forest Hills", lat: 40.7181, lng: -73.8448, res: 12000, day: 10000 },
  { name: "Jamaica", lat: 40.7027, lng: -73.7890, res: 10000, day: 14000 },
  { name: "JFK Airport", lat: 40.6413, lng: -73.7781, res: 100, day: 6000 },
  { name: "The Rockaways", lat: 40.5860, lng: -73.8166, res: 4000, day: 4000 },
  // The Bronx
  { name: "Mott Haven", lat: 40.8091, lng: -73.9229, res: 25000, day: 22000 },
  { name: "Grand Concourse", lat: 40.8296, lng: -73.9262, res: 30000, day: 25000 },
  { name: "Fordham", lat: 40.8615, lng: -73.8905, res: 30000, day: 26000 },
  { name: "Riverdale", lat: 40.9006, lng: -73.9067, res: 7000, day: 5000 },
  { name: "Co-op City", lat: 40.8740, lng: -73.8290, res: 10000, day: 7000 },
  // Staten Island
  { name: "St. George", lat: 40.6437, lng: -74.0764, res: 6000, day: 7000 },
  { name: "Mid-Island", lat: 40.5795, lng: -74.1502, res: 3000, day: 2500 },
  { name: "Tottenville", lat: 40.5083, lng: -74.2360, res: 1500, day: 1000 },
];

// db = sound level at 1 m. tones = horn frequencies in Hz for the synthesized sound.
const VEHICLES = [
  { id: "moped", name: "Delivery moped", db: 96, tones: [780], wave: "square" },
  { id: "sedan", name: "Sedan", db: 107, tones: [415, 520], wave: "sawtooth" },
  { id: "cab", name: "Yellow cab", db: 108, tones: [400, 500], wave: "sawtooth" },
  { id: "suv", name: "Huge SUV", db: 110, tones: [350, 440], wave: "sawtooth" },
  { id: "truck", name: "Truck air horn", db: 120, tones: [155, 196, 233], wave: "sawtooth" },
];

const REASONS = [
  { id: "green", name: "The light turned green 0.3 seconds ago", effect: "Time saved: 0.4 seconds, generously. The driver ahead was already lifting their foot." },
  { id: "stuck", name: "The car ahead is also stuck in traffic", effect: "Distance traffic moved as a result: 0 ft. The car ahead would also like to move." },
  { id: "double", name: "Someone is double-parked", effect: "The driver is inside ordering a bacon, egg and cheese. They did not hear you. Everyone else did." },
  { id: "ped", name: "A pedestrian is in the crosswalk (they have the light)", effect: "Pedestrian response: a gesture. Walking speed: reduced, out of spite." },
  { id: "hi", name: "Saying hi to someone I know", effect: "They didn't notice. Everyone else looked up, saw a stranger, and resumed hating cars." },
  { id: "despair", name: "General despair", effect: "Valid. Still 0% effective." },
];
