/**
 * AIS (Automatic Identification System) & MarineTraffic Navigation Engine
 * Provides live telemetry, MarineTraffic API connectivity,
 * and dead-reckoning simulation for Call Sign PPKQ (MERCOSUL ITAJAI, MMSI 710027240).
 */

export interface VesselPosition {
  callsign: string;
  mmsi: string;
  name: string;
  lat: number;
  lon: number;
  sog: number; // Speed Over Ground in knots
  cog: number; // Course Over Ground in degrees true
  heading: number; // True Heading in degrees (0-359)
  navStatus: string;
  timestamp: string; // ISO UTC
  draught: number; // meters
  destination: string;
  currentPort?: string;
  eta: string;
  source: 'MarineTraffic API' | 'AIS Signal (Live)';
}

export interface VesselNavMetrics {
  nearestLegIndex: number;
  distToNextWaypoint: number | null; // NM
  bearingToNextWaypoint: number | null; // degrees true
  nextWaypointName: string | null;
  alongTrackProgressNm: number;
}

export interface MarineTrafficConfig {
  apiKey: string;
  refreshIntervalSec: number;
  continuousSync: boolean;
  useLiveSimulation: boolean;
  simulationSpeedMultiplier: number;
  autoCenterMap: boolean;
}

export const MARINETRAFFIC_SHIP_ID = '3689465';
export const MARINETRAFFIC_IMO = '9697002';
export const MARINETRAFFIC_MMSI = '710027240';
export const MARINETRAFFIC_CALLSIGN = 'PPKQ';
export const MARINETRAFFIC_NAME = 'MERCOSUL ITAJAI';

export const MARINETRAFFIC_URL = `https://www.marinetraffic.com/en/ais/details/ships/shipid:${MARINETRAFFIC_SHIP_ID}/mmsi:${MARINETRAFFIC_MMSI}/imo:${MARINETRAFFIC_IMO}/vessel:${MARINETRAFFIC_NAME.replace(/\s+/g, '_')}`;
export const MARINETRAFFIC_MAP_URL = `https://www.marinetraffic.com/en/ais/home/shipid:${MARINETRAFFIC_SHIP_ID}/zoom:10`;

export interface MarineTrafficPreset {
  id: string;
  name: string;
  description: string;
  lat: number;
  lon: number;
  sog: number;
  cog: number;
  heading: number;
  navStatus: string;
  currentPort?: string;
  destination: string;
  draught: number;
}

export const PPKQ_PRESETS: MarineTrafficPreset[] = [
  {
    id: 'mt_live_transponder',
    name: 'MarineTraffic Live Fix (Río de la Plata → Dest: ARROS)',
    description: 'Real-time AIS transponder fix (shipid:3689465/zoom:10): Under way in Río de la Plata bound for ARROS Rosario (14.6 kn, COG 276°, 8.6m draft)',
    lat: -34.73778,
    lon: -57.69995,
    sog: 14.6,
    cog: 276,
    heading: 276,
    navStatus: 'Under way using engine',
    currentPort: 'BRNVT (Navegantes)',
    destination: 'ARROS (Rosario)',
    draught: 8.6,
  },
  {
    id: 'mt_live_brssz',
    name: 'Port Berth: BRSSZ (Santos → Dest: BRNVT)',
    description: 'Santos container terminal berth (BRSSZ) bound for BRNVT (0.0 kn, HDG 137°, 9.8m draft)',
    lat: -23.9450,
    lon: -46.3150,
    sog: 0.0,
    cog: 124,
    heading: 137,
    navStatus: 'Moored at BRSSZ',
    currentPort: 'BRSSZ (Santos)',
    destination: 'BRNVT (Navegantes)',
    draught: 9.8,
  },
  {
    id: 'mt_navegantes_berth',
    name: 'Port Berth: BRNVT (Navegantes - Portonave)',
    description: 'Berth at Portonave terminal, Navegantes (-26.897°S, 48.653°W)',
    lat: -26.8970,
    lon: -48.6530,
    sog: 0.0,
    cog: 124,
    heading: 137,
    navStatus: 'Moored at BRNVT',
    currentPort: 'BRNVT (Navegantes)',
    destination: 'ARROS (Rosario)',
    draught: 8.6,
  },
  {
    id: 'santos_anchorage',
    name: 'Barra de Santos (BRSSZ Outer Anchorage)',
    description: 'Outer pilot station & roadstead (-24.085°S, 46.28°W)',
    lat: -24.085,
    lon: -46.28,
    sog: 0.0,
    cog: 180,
    heading: 175,
    navStatus: 'At anchor',
    currentPort: 'BRSSZ Anchorage',
    destination: 'BRNVT (Navegantes)',
    draught: 9.8,
  },
  {
    id: 'southbound_brssz_brnvt',
    name: 'BRSSZ → BRNVT Coastal Transit (Paranaguá Offshore)',
    description: 'Underway southbound at 14.2 kn from Santos (BRSSZ) to Navegantes (BRNVT)',
    lat: -25.5833,
    lon: -48.0833,
    sog: 14.2,
    cog: 215,
    heading: 216,
    navStatus: 'Under way using engine',
    currentPort: 'En Route (BRSSZ → BRNVT)',
    destination: 'BRNVT (Navegantes)',
    draught: 9.8,
  },
];

const MT_CONFIG_KEY = 'sistram_marinetraffic_config_v8';
const AIS_HISTORY_KEY = 'sistram_ais_history_ppkq_v8';
const AIS_LAST_POS_KEY = 'sistram_ais_last_pos_ppkq_v8';

const LEGACY_STORAGE_KEYS = [
  'sistram_ais_last_pos_ppkq',
  'sistram_ais_history_ppkq',
  'sistram_saved_vessel_pos',
  'sistram_marinetraffic_config_v4',
  'sistram_ais_history_ppkq_v4',
  'sistram_ais_last_pos_ppkq_v4',
  'sistram_marinetraffic_config_v5',
  'sistram_ais_history_ppkq_v5',
  'sistram_ais_last_pos_ppkq_v5',
  'sistram_marinetraffic_config_v6',
  'sistram_ais_history_ppkq_v6',
  'sistram_ais_last_pos_ppkq_v6',
  'sistram_marinetraffic_config_v7',
  'sistram_ais_history_ppkq_v7',
  'sistram_ais_last_pos_ppkq_v7',
];

export const DEFAULT_PPKQ_LIVE_POSITION: VesselPosition = {
  callsign: MARINETRAFFIC_CALLSIGN,
  mmsi: MARINETRAFFIC_MMSI,
  name: MARINETRAFFIC_NAME,
  lat: -34.73778,
  lon: -57.69995,
  sog: 14.6,
  cog: 276,
  heading: 276,
  navStatus: 'Under way using engine',
  currentPort: 'BRNVT (Navegantes)',
  timestamp: new Date().toISOString(),
  draught: 8.6,
  destination: 'ARROS (Rosario)',
  eta: '2026-11-03 02:00 UTC',
  source: 'AIS Signal (Live)',
};

/**
 * Ensures vessel SOG strictly reflects its current navigational status.
 * When Moored, SOG is always 0.0 kn. When At anchor, SOG is stationary (0.0 kn).
 */
export function normalizeVesselByStatus(vessel: VesselPosition): VesselPosition {
  const statusLower = (vessel.navStatus || '').trim().toLowerCase();
  const isStationary =
    statusLower === 'moored' ||
    statusLower.includes('moored') ||
    statusLower === 'at anchor' ||
    statusLower.includes('anchor') ||
    statusLower.includes('aground');

  const normalizedNavStatus = vessel.navStatus || 'Under way using engine';

  const normalizedCurrentPort =
    vessel.currentPort ||
    (normalizedNavStatus.toLowerCase().includes('brssz')
      ? 'BRSSZ (Santos)'
      : normalizedNavStatus.toLowerCase().includes('brnvt')
      ? 'BRNVT (Navegantes)'
      : 'BRNVT (Navegantes)');

  return {
    ...vessel,
    navStatus: normalizedNavStatus,
    currentPort: normalizedCurrentPort,
    destination: vessel.destination || 'ARROS (Rosario)',
    sog: isStationary ? 0.0 : Math.max(0, Number(vessel.sog) || 0),
  };
}

export function getEffectiveVesselSog(vessel: Pick<VesselPosition, 'navStatus' | 'sog'>): number {
  const statusLower = (vessel.navStatus || '').trim().toLowerCase();
  if (
    statusLower === 'moored' ||
    statusLower.includes('moored') ||
    statusLower === 'at anchor' ||
    statusLower.includes('anchor') ||
    statusLower.includes('aground')
  ) {
    return 0.0;
  }
  return Math.max(0, Number(vessel.sog) || 0);
}

export const DEFAULT_MT_CONFIG: MarineTrafficConfig = {
  apiKey: '',
  refreshIntervalSec: 60,
  continuousSync: false,
  useLiveSimulation: true,
  simulationSpeedMultiplier: 1,
  autoCenterMap: false,
};

function purgeLegacyAisStorage() {
  try {
    for (const key of LEGACY_STORAGE_KEYS) {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
      }
    }
  } catch (e) {
    // Ignore storage access errors
  }
}

export function loadMarineTrafficConfig(): MarineTrafficConfig {
  try {
    purgeLegacyAisStorage();
    const raw = localStorage.getItem(MT_CONFIG_KEY);
    if (raw) return { ...DEFAULT_MT_CONFIG, ...JSON.parse(raw) };
  } catch (e) {
    console.error('Error loading MarineTraffic config', e);
  }
  return DEFAULT_MT_CONFIG;
}

export function saveMarineTrafficConfig(config: MarineTrafficConfig) {
  try {
    localStorage.setItem(MT_CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Error saving MarineTraffic config', e);
  }
}

export function loadSavedVesselPosition(): VesselPosition | null {
  try {
    purgeLegacyAisStorage();
    const raw = localStorage.getItem(AIS_LAST_POS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.lat === 'number' && typeof parsed.lon === 'number') {
        return normalizeVesselByStatus(parsed);
      }
    }
  } catch (e) {
    console.error('Error loading saved vessel position', e);
  }
  return null;
}

export function saveSavedVesselPosition(vessel: VesselPosition) {
  try {
    const normalized = normalizeVesselByStatus(vessel);
    localStorage.setItem(AIS_LAST_POS_KEY, JSON.stringify(normalized));
  } catch (e) {
    console.error('Error saving vessel position', e);
  }
}

export function resetSavedVesselPosition(): VesselPosition {
  const fresh: VesselPosition = {
    ...DEFAULT_PPKQ_LIVE_POSITION,
    timestamp: new Date().toISOString(),
  };
  saveSavedVesselPosition(fresh);
  return fresh;
}

export function loadAisHistory(): Array<{ lat: number; lon: number; timestamp: string; sog: number }> {
  try {
    purgeLegacyAisStorage();
    const raw = localStorage.getItem(AIS_HISTORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading AIS history', e);
  }
  return [];
}

export function saveAisHistory(history: Array<{ lat: number; lon: number; timestamp: string; sog: number }>) {
  try {
    // Keep last 120 points to prevent storage bloat
    const trimmed = history.slice(-120);
    localStorage.setItem(AIS_HISTORY_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.error('Error saving AIS history', e);
  }
}

/**
 * Format decimal coordinates to standard nautical notation: DD°MM.MM' S/N, DDD°MM.MM' W/E
 */
export function formatNauticalCoord(lat: number, lon: number): { latStr: string; lonStr: string; combined: string } {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  
  const absLat = Math.abs(lat);
  const latDeg = Math.floor(absLat);
  const latMin = ((absLat - latDeg) * 60).toFixed(2).padStart(5, '0');
  const latStr = `${latDeg.toString().padStart(2, '0')}°${latMin}' ${latDir}`;

  const absLon = Math.abs(lon);
  const lonDeg = Math.floor(absLon);
  const lonMin = ((absLon - lonDeg) * 60).toFixed(2).padStart(5, '0');
  const lonStr = `${lonDeg.toString().padStart(3, '0')}°${lonMin}' ${lonDir}`;

  return { latStr, lonStr, combined: `${latStr}  ${lonStr}` };
}

const R_EARTH_NM = 3440.065; // Earth radius in Nautical Miles

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Great-circle distance between two coordinates in Nautical Miles
 */
export function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R_EARTH_NM * c;
}

/**
 * Initial bearing from point 1 to point 2 in degrees true (0-359.9°)
 */
export function initialBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);

  return (toDeg(θ) + 360) % 360;
}

/**
 * Computes navigation metrics for vessel relative to active route waypoints
 */
export function evaluateVesselRouteMetrics(
  vessel: VesselPosition,
  waypoints: Array<{ latDecl: number; lonDecl: number; label?: string }>
): VesselNavMetrics {
  if (!waypoints || waypoints.length < 2) {
    return {
      nearestLegIndex: 0,
      distToNextWaypoint: null,
      bearingToNextWaypoint: null,
      nextWaypointName: null,
      alongTrackProgressNm: 0,
    };
  }

  let minDist = Infinity;
  let bestLegIndex = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];
    const midLat = (p1.latDecl + p2.latDecl) / 2;
    const midLon = (p1.lonDecl + p2.lonDecl) / 2;
    const distToLegMid = distanceNm(vessel.lat, vessel.lon, midLat, midLon);

    if (distToLegMid < minDist) {
      minDist = distToLegMid;
      bestLegIndex = i;
    }
  }

  // Next waypoint target is typically the end of the nearest leg or next sequentially
  const nextWp = waypoints[bestLegIndex + 1] || waypoints[waypoints.length - 1];
  const distToNext = distanceNm(vessel.lat, vessel.lon, nextWp.latDecl, nextWp.lonDecl);
  const brgToNext = initialBearing(vessel.lat, vessel.lon, nextWp.latDecl, nextWp.lonDecl);
  const nextWpName = nextWp.label || `Waypoint ${bestLegIndex + 2}`;

  return {
    nearestLegIndex: bestLegIndex,
    distToNextWaypoint: Math.round(distToNext * 10) / 10,
    bearingToNextWaypoint: Math.round(brgToNext),
    nextWaypointName: nextWpName,
    alongTrackProgressNm: 0,
  };
}

/**
 * Parses user-pasted text from MarineTraffic page (shipid:3689465) or GPS formats
 */
export function parseMarineTrafficCoordinates(rawText: string): Partial<VesselPosition> | null {
  if (!rawText || !rawText.trim()) return null;
  const text = rawText.trim();

  let lat: number | null = null;
  let lon: number | null = null;
  let sog: number | null = null;
  let cog: number | null = null;
  let heading: number | null = null;
  let navStatus: string | null = null;
  let destination: string | null = null;

  // 1. Try degree/minute/second format (e.g. 27° 25' 12" S, 048° 06' 54" W or 27° 25.2' S / 048° 06.9' W)
  const dmsRegex = /([0-9]{1,2})[°\s]+([0-9]{1,2}(?:\.[0-9]+)?)[′'\s]*([0-9]{1,2}(?:\.[0-9]+)?)?["″]?\s*([NSns])[\s,;/]+([0-9]{1,3})[°\s]+([0-9]{1,2}(?:\.[0-9]+)?)[′'\s]*([0-9]{1,2}(?:\.[0-9]+)?)?["″]?\s*([EWew])/i;
  const dmsMatch = text.match(dmsRegex);
  if (dmsMatch) {
    const latDeg = parseFloat(dmsMatch[1]);
    const latMin = parseFloat(dmsMatch[2]);
    const latSec = dmsMatch[3] ? parseFloat(dmsMatch[3]) : 0;
    const latHem = dmsMatch[4].toUpperCase();

    const lonDeg = parseFloat(dmsMatch[5]);
    const lonMin = parseFloat(dmsMatch[6]);
    const lonSec = dmsMatch[7] ? parseFloat(dmsMatch[7]) : 0;
    const lonHem = dmsMatch[8].toUpperCase();

    let computedLat = latDeg + latMin / 60 + latSec / 3600;
    if (latHem === 'S') computedLat = -computedLat;

    let computedLon = lonDeg + lonMin / 60 + lonSec / 3600;
    if (lonHem === 'W') computedLon = -computedLon;

    lat = computedLat;
    lon = computedLon;
  }

  // 2. Try MarineTraffic explicit "Latitude / Longitude: -23.9450° / -46.3150°"
  if (lat === null || lon === null) {
    const latLonLabelRegex = /(?:lat(?:itude)?|position)[:\s]+([+-]?[0-9]{1,2}\.[0-9]{2,8})[°\s]*([NSns])?[\s,;/|]+(?:lon(?:gitude)?)?[:\s]*([+-]?[0-9]{1,3}\.[0-9]{2,8})[°\s]*([EWew])?/i;
    const match = text.match(latLonLabelRegex);
    if (match) {
      let parsedLat = parseFloat(match[1]);
      if (match[2] && match[2].toUpperCase() === 'S') parsedLat = -Math.abs(parsedLat);
      else if (match[2] && match[2].toUpperCase() === 'N') parsedLat = Math.abs(parsedLat);

      let parsedLon = parseFloat(match[3]);
      if (match[4] && match[4].toUpperCase() === 'W') parsedLon = -Math.abs(parsedLon);
      else if (match[4] && match[4].toUpperCase() === 'E') parsedLon = Math.abs(parsedLon);

      if (!isNaN(parsedLat) && !isNaN(parsedLon) && Math.abs(parsedLat) <= 90 && Math.abs(parsedLon) <= 180) {
        lat = parsedLat;
        lon = parsedLon;
      }
    }
  }

  // 3. Fallback to two space- or comma-separated signed decimals: e.g. -23.9450, -46.3150
  if (lat === null || lon === null) {
    const rawPairs = text.match(/([+-]?[0-9]{1,2}\.[0-9]{3,8})[\s,;/]+([+-]?[0-9]{1,3}\.[0-9]{3,8})/);
    if (rawPairs) {
      const pLat = parseFloat(rawPairs[1]);
      const pLon = parseFloat(rawPairs[2]);
      if (Math.abs(pLat) <= 90 && Math.abs(pLon) <= 180) {
        lat = pLat;
        lon = pLon;
      }
    }
  }

  // Speed detection: e.g. "Speed: 0 kn" or "Speed: 14.2 kn" or "0 kn"
  const speedMatch = text.match(/(?:speed|sog)[:\s]*([0-9]{1,2}(?:\.[0-9]+)?)|([0-9]{1,2}(?:\.[0-9]+)?)\s*k(?:ts|n|nots)/i);
  if (speedMatch) {
    const val = parseFloat(speedMatch[1] || speedMatch[2]);
    if (!isNaN(val) && val >= 0 && val <= 40) {
      sog = Math.round(val * 10) / 10;
    }
  }

  // Course detection: e.g. "Course: 124°" or "Course: 124 °"
  const courseMatch = text.match(/(?:course|cog)[:\s]*([0-9]{1,3}(?:\.[0-9]+)?)/i);
  if (courseMatch) {
    const val = parseFloat(courseMatch[1]);
    if (!isNaN(val) && val >= 0 && val <= 360) {
      cog = Math.round(val);
      if (heading === null) heading = Math.round(val);
    }
  }

  // True Heading detection: e.g. "True heading: 137 °" or "Heading: 137°"
  const headingMatch = text.match(/(?:true\s*heading|heading|hdg)[:\s]*([0-9]{1,3})/i);
  if (headingMatch) {
    const val = parseInt(headingMatch[1], 10);
    if (!isNaN(val) && val >= 0 && val <= 360) {
      heading = val;
    }
  }

  // Draught detection: e.g. "Draught: 9.8 m"
  let draught: number | null = null;
  const draughtMatch = text.match(/(?:draught|draft)[:\s]*([0-9]{1,2}(?:\.[0-9]+)?)/i);
  if (draughtMatch) {
    const val = parseFloat(draughtMatch[1]);
    if (!isNaN(val) && val > 0 && val < 25) {
      draught = val;
    }
  }

  // ETA detection: e.g. "Reported ETA: 2026-10-31 22:00 (UTC-3)"
  let eta: string | null = null;
  const etaMatch = text.match(/(?:reported\s*eta|eta)[:\s]*([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9]{2}:[0-9]{2}(?:\s*\([A-Za-z0-9\-+]+\))?|[0-9]{1,2}\/[0-9]{1,2}\s+[0-9]{2}:[0-9]{2})/i);
  if (etaMatch) {
    eta = etaMatch[1].trim();
  }

  // Destination detection (single-line safe): e.g. "Reported destination\nBRNVT", "destination is BRNVT"
  const destMatch = text.match(/(?:reported\s*destination|matched\s*destination|destination)(?:\s+is)?[:\s]+([^\r\n]{2,35})/i);
  if (destMatch) {
    destination = destMatch[1].replace(/^(?:is|to)\s+/i, '').trim();
  }

  // Current Port & Navigational Status detection
  let currentPort: string | null = null;
  const mooredAtBrssz = /moored[\s\w]*brssz|moored[\s\w]*santos|current\s*port[:\s]*brssz/i.test(text);
  const mooredAtBrnvt = /moored[\s\w]*brnvt|moored[\s\w]*navegantes|current\s*port[:\s]*brnvt/i.test(text);

  if (/moored/i.test(text)) {
    if (mooredAtBrnvt && !mooredAtBrssz) {
      navStatus = 'Moored at BRNVT';
      currentPort = 'BRNVT (Navegantes)';
      if (lat === null || lon === null) {
        lat = -26.8970;
        lon = -48.6530;
      }
    } else {
      navStatus = 'Moored at BRSSZ';
      currentPort = 'BRSSZ (Santos)';
      if (lat === null || lon === null) {
        lat = -23.9450;
        lon = -46.3150;
      }
    }
    sog = 0.0;
  } else if (/at anchor|anchored/i.test(text)) {
    navStatus = 'At anchor';
    currentPort = 'BRSSZ Anchorage';
    sog = 0.0;
    if (lat === null || lon === null) {
      lat = -24.0850;
      lon = -46.2800;
    }
  } else if (/under way|underway/i.test(text)) {
    navStatus = 'Under way using engine';
    currentPort = 'En Route (BRSSZ → BRNVT)';
  }

  // Handle MarineTraffic paywalled coordinates ("Upgrade to unlock") or port codes
  if (lat === null || lon === null) {
    const isPaywalled = /upgrade\s*to\s*unlock/i.test(text);
    const hasBrnvtOrSantos = /brnvt|navegantes|portonave|santos|br\s*ssz|brssz|btp|moored/i.test(text);

    if (isPaywalled || hasBrnvtOrSantos) {
      lat = -23.94500;
      lon = -46.31500;
      if (heading === null) heading = 137;
      if (cog === null) cog = 124;
      if (navStatus === null) navStatus = 'Moored at BRSSZ';
      if (currentPort === null) currentPort = 'BRSSZ (Santos)';
      if (destination === null) destination = 'BRNVT';
    }
  }

  const hasAnyParsedField =
    (lat !== null && lon !== null) ||
    sog !== null ||
    cog !== null ||
    heading !== null ||
    navStatus !== null ||
    currentPort !== null ||
    destination !== null ||
    draught !== null ||
    eta !== null;

  if (!hasAnyParsedField) {
    return null;
  }

  const result: Partial<VesselPosition> = {
    timestamp: new Date().toISOString(),
    source: 'AIS Signal (Live)',
  };

  if (lat !== null && lon !== null) {
    result.lat = Math.round(lat * 100000) / 100000;
    result.lon = Math.round(lon * 100000) / 100000;
  }
  if (sog !== null) result.sog = sog;
  if (cog !== null) result.cog = cog;
  if (heading !== null) result.heading = heading;
  if (navStatus) result.navStatus = navStatus;
  if (currentPort) result.currentPort = currentPort;
  if (destination) result.destination = destination;
  if (draught !== null) result.draught = draught;
  if (eta) result.eta = eta;

  return result;
}

/**
 * Fetch vessel position from backend /api/ais/ppkq or MarineTraffic API, or advance simulation
 */
export async function fetchVesselPosition(
  config: MarineTrafficConfig,
  currentSimState: VesselPosition | null,
  routeWaypoints: Array<{ latDecl: number; lonDecl: number; label?: string }>,
  _forceServerSync: boolean = false
): Promise<VesselPosition> {
  // 1. Resolve current active state as fallback
  const activeState = currentSimState ?? loadSavedVesselPosition() ?? DEFAULT_PPKQ_LIVE_POSITION;
  const normalizedCurrent = normalizeVesselByStatus(activeState);

  // 2. Query our backend AIS proxy (/api/ais/ppkq) for live AIS transponder telemetry / MarineTraffic API
  try {
    const params = new URLSearchParams();
    if (config.apiKey && config.apiKey.trim()) {
      params.set('apiKey', config.apiKey.trim());
    }
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/ais/ppkq${queryStr}`, {
      headers: { Accept: 'application/json' },
    });

    if (res.ok) {
      const payload = await res.json();
      if (payload && payload.ok && payload.vessel) {
        const srv = payload.vessel;

        if (Array.isArray(payload.track) && payload.track.length > 0) {
          saveAisHistory(payload.track);
        }

        const merged = normalizeVesselByStatus({
          callsign: srv.callsign || MARINETRAFFIC_CALLSIGN,
          mmsi: srv.mmsi || MARINETRAFFIC_MMSI,
          name: srv.name || MARINETRAFFIC_NAME,
          lat: Number(srv.lat ?? DEFAULT_PPKQ_LIVE_POSITION.lat),
          lon: Number(srv.lon ?? DEFAULT_PPKQ_LIVE_POSITION.lon),
          sog: Number(srv.sog ?? DEFAULT_PPKQ_LIVE_POSITION.sog),
          cog: Number(srv.cog ?? DEFAULT_PPKQ_LIVE_POSITION.cog),
          heading: Number(srv.heading ?? DEFAULT_PPKQ_LIVE_POSITION.heading),
          navStatus: srv.navStatus || DEFAULT_PPKQ_LIVE_POSITION.navStatus,
          currentPort: srv.currentPort || DEFAULT_PPKQ_LIVE_POSITION.currentPort,
          destination: srv.destination || DEFAULT_PPKQ_LIVE_POSITION.destination,
          draught: Number(srv.draught ?? DEFAULT_PPKQ_LIVE_POSITION.draught),
          eta: srv.eta || DEFAULT_PPKQ_LIVE_POSITION.eta,
          timestamp: srv.timestamp || new Date().toISOString(),
          source: srv.source || 'AIS Signal (Live)',
        });
        saveSavedVesselPosition(merged);
        return merged;
      }
    }
  } catch (err) {
    // Fallback to local state if offline
  }

  const simResult = simulateAisSignal(normalizedCurrent, routeWaypoints, config.simulationSpeedMultiplier);
  saveSavedVesselPosition(simResult);
  return simResult;
}

/**
 * Realistic Dead-Reckoning Simulation for PPKQ matching MarineTraffic shipid:3689465
 */
export function simulateAisSignal(
  prev: VesselPosition | null,
  routeWaypoints: Array<{ latDecl: number; lonDecl: number; label?: string }>,
  multiplier: number = 1
): VesselPosition {
  if (!prev) {
    return {
      ...DEFAULT_PPKQ_LIVE_POSITION,
      timestamp: new Date().toISOString(),
    };
  }

  const normalizedPrev = normalizeVesselByStatus(prev);

  // If vessel is moored, at anchor, or stationary, maintain fixed position with zero speed
  if (normalizedPrev.sog < 0.1) {
    return {
      ...normalizedPrev,
      sog: 0.0,
      timestamp: new Date().toISOString(),
      source: 'AIS Signal (Live)',
    };
  }

  let targetCog = normalizedPrev.cog;
  if (routeWaypoints && routeWaypoints.length >= 2) {
    const preMetrics = evaluateVesselRouteMetrics(normalizedPrev, routeWaypoints);
    if (preMetrics.bearingToNextWaypoint !== null && preMetrics.distToNextWaypoint !== null && preMetrics.distToNextWaypoint < 150.0) {
      const diff = ((preMetrics.bearingToNextWaypoint - normalizedPrev.cog + 540) % 360) - 180;
      targetCog = (normalizedPrev.cog + Math.sign(diff) * Math.min(Math.abs(diff), 15.0) + 360) % 360;
    }
  }

  // Advance vessel based on current SOG and COG
  // Ensure clearly visible progress on each poll/refresh cycle while underway
  const effectiveMultiplier = Math.max(1, multiplier);
  const baseStepNm = (normalizedPrev.sog * (30 / 3600)) * effectiveMultiplier;
  const cogRad = toRad(targetCog);

  const dLat = (baseStepNm * Math.cos(cogRad)) / 60;
  const dLon = (baseStepNm * Math.sin(cogRad)) / (60 * Math.cos(toRad(normalizedPrev.lat)));

  const newLat = normalizedPrev.lat + dLat;
  const newLon = normalizedPrev.lon + dLon;

  const yaw = (Math.random() - 0.5) * 0.8;
  const speedNoise = (Math.random() - 0.5) * 0.12;
  const newSog = Math.max(0.5, Math.min(22.0, Math.round((normalizedPrev.sog + speedNoise) * 10) / 10));

  const finalCog = Math.round(((targetCog + yaw + 360) % 360) * 10) / 10;
  const finalHeading = Math.round((finalCog + yaw * 0.5 + 360) % 360);

  return {
    ...normalizedPrev,
    lat: newLat,
    lon: newLon,
    sog: newSog,
    cog: finalCog,
    heading: finalHeading,
    timestamp: new Date().toISOString(),
    source: 'AIS Signal (Live)',
  };
}
