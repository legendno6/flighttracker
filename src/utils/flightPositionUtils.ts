const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Converts a heading in degrees to an 8-point compass direction, e.g. 270 -> "W". */
export function degreesToCompass(deg: number): string {
  const index = Math.round(deg / 45) % 8;
  return COMPASS_POINTS[(index + 8) % 8];
}

/** Formats a climb(+)/descent(-) rate, e.g. "↑ 1,200 ft/min" / "↓ 800 ft/min" / "Level". */
export function formatVerticalRate(ftPerMin: number | null): string | null {
  if (ftPerMin == null) return null;
  if (Math.abs(ftPerMin) < 100) return 'Level';
  const arrow = ftPerMin > 0 ? '↑' : '↓';
  return `${arrow} ${Math.abs(Math.round(ftPerMin)).toLocaleString()} ft/min`;
}

// ADS-B emitter category (OpenSky's `category` state-vector field).
const AIRCRAFT_CATEGORIES: Record<number, string> = {
  1: 'Light',
  2: 'Small',
  3: 'Large',
  4: 'High vortex large',
  5: 'Heavy',
  6: 'High performance',
  7: 'Rotorcraft',
  8: 'Glider/sailplane',
  9: 'Lighter-than-air',
  10: 'Skydiver/parachutist',
  11: 'Ultralight/hang-glider/paraglider',
  13: 'Unmanned aerial vehicle',
  14: 'Space/trans-atmospheric vehicle',
  15: 'Surface emergency vehicle',
  16: 'Surface service vehicle',
  17: 'Point obstacle',
  18: 'Cluster obstacle',
  19: 'Line obstacle',
};

/** Maps OpenSky's raw ADS-B emitter category code to a human label, or null for "no info"/unknown codes. */
export function describeAircraftCategory(code: number | null): string | null {
  if (code == null) return null;
  return AIRCRAFT_CATEGORIES[code] ?? null;
}
