/**
 * Moored-to-Moored Voyage Summary Logger & PostgreSQL / ANSI SQL Exporter
 * Samples coordinates, metocean conditions, estuary sea level/tides, AI-grounded river heights,
 * bathymetry (when inside river or estuary), and calculated leg SOGs.
 */

import { VesselPosition } from "./ais";
import { HydrographicReport, WaterZone, classifyWaterZone, estimateHarmonicTide } from "./hydrography";
import { GeneratorOutput, ShipData, calculateBearing, calculateMaxSOG, haversine } from "./sistram";
import { WeatherData } from "./weather";

export type SampleTriggerType =
  | "MOORED_DEP"
  | "MOORED_ARR"
  | "AUTO_4H_SEA"
  | "AUTO_1H_ESTUARY"
  | "AUTO_1H_RIVER"
  | "USER_PUSH";

export interface VoyageWaypointRecord {
  seq: number;
  label: string;
  sistramType: "G" | "L" | "I";
  latDeg: number;
  lonDeg: number;
  latSistram: string;
  lonSistram: string;
  plannedUtc: string;
  waterZone: WaterZone;
  waterwayName: string;
}

export interface VoyageLegSummary {
  legIndex: number;
  fromSeq: number;
  toSeq: number;
  fromLabel: string;
  toLabel: string;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  distanceNm: number;
  trueBearingDeg: number;
  calculatedSogKn: number;
  observedAvgSogKn: number | null;
  durationHours: number;
  waterZone: WaterZone;
  waterwayName: string;
  windSpeedKn: number | null;
  waveHeightM: number | null;
  currentSpeedKn: number | null;
}

export interface VoyageSampleRecord {
  id: string;
  voyageId: string;
  legIndex: number;
  sampledAtUtc: string;
  triggerType: SampleTriggerType;
  navStatus: string;
  waterZone: WaterZone;
  waterwayName: string;
  lat: number;
  lon: number;
  sogKn: number;
  calculatedLegSogKn: number | null;
  cogDeg: number;
  headingDeg: number;
  draughtM: number;
  windSpeedKn: number | null;
  windDirDeg: number | null;
  waveHeightM: number | null;
  waveDirDeg: number | null;
  wavePeriodS: number | null;
  currentSpeedKn: number | null;
  currentDirDeg: number | null;
  seaLevelM: number | null;
  tideHeightM: number | null;
  tidePhase: string | null;
  riverHeightM: number | null;
  riverTrend: string | null;
  bathymetryDepthM: number | null;
  ukcM: number | null;
  hydroRefId: string | null;
  notes: string;
}

export interface VoyageSummaryRecord {
  id: string;
  vesselName: string;
  callsign: string;
  mmsi: string;
  imo: string;
  depPort: string;
  arrPort: string;
  startedAtUtc: string;
  endedAtUtc: string | null;
  status: "IN_PROGRESS" | "COMPLETED" | "MOORED_STANDBY";
  waypoints: VoyageWaypointRecord[];
  legs: VoyageLegSummary[];
  samples: VoyageSampleRecord[];
  hydrographicRefs: HydrographicReport[];
}

const VOYAGE_STORAGE_KEY = "sistram_voyage_logs_v1";

export function isVesselMooredStatus(navStatus: string | undefined): boolean {
  if (!navStatus) return false;
  return /moored|berthed|at berth/i.test(navStatus);
}

export function loadSavedVoyages(): VoyageSummaryRecord[] {
  try {
    const raw = localStorage.getItem(VOYAGE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveVoyages(voyages: VoyageSummaryRecord[]): void {
  try {
    // Keep up to 10 most recent voyages in localStorage
    localStorage.setItem(VOYAGE_STORAGE_KEY, JSON.stringify(voyages.slice(0, 10)));
  } catch {
    // Ignore storage quota errors
  }
}

export function buildVoyageWaypoints(output: GeneratorOutput | null): VoyageWaypointRecord[] {
  if (!output || !output.waypoints || output.waypoints.length === 0) return [];
  return output.waypoints.map((wp, idx) => {
    const zoneInfo = classifyWaterZone(wp.latDecl, wp.lonDecl);
    const label =
      wp.type === "G"
        ? `WP${idx + 1} (Dep)`
        : wp.type === "I"
          ? `WP${idx + 1} (Arr)`
          : `WP${idx + 1}`;
    return {
      seq: idx + 1,
      label,
      sistramType: wp.type,
      latDeg: Math.round(wp.latDecl * 100000) / 100000,
      lonDeg: Math.round(wp.lonDecl * 100000) / 100000,
      latSistram: wp.latS,
      lonSistram: wp.lonS,
      plannedUtc: wp.timeUtc.toISOString(),
      waterZone: zoneInfo.zone,
      waterwayName: zoneInfo.waterwayName,
    };
  });
}

export function findNearestLegIndex(
  lat: number,
  lon: number,
  waypoints: VoyageWaypointRecord[]
): number {
  if (!waypoints || waypoints.length < 2) return 1;
  let bestIdx = 1;
  let minMidDist = Infinity;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const midLat = (a.latDeg + b.latDeg) / 2;
    const midLon = (a.lonDeg + b.lonDeg) / 2;
    const d = haversine(lat, lon, midLat, midLon);
    if (d < minMidDist) {
      minMidDist = d;
      bestIdx = i + 1;
    }
  }
  return bestIdx;
}

export function computeRouteLegs(
  output: GeneratorOutput | null,
  shipData: ShipData,
  waypointWeather: Record<number, WeatherData | null>,
  samples: VoyageSampleRecord[] = []
): VoyageLegSummary[] {
  if (!output || !output.waypoints || output.waypoints.length < 2) return [];
  const legs: VoyageLegSummary[] = [];

  for (let i = 1; i < output.waypoints.length; i++) {
    const prev = output.waypoints[i - 1];
    const curr = output.waypoints[i];
    const distNm = haversine(prev.latDecl, prev.lonDecl, curr.latDecl, curr.lonDecl);
    const brg =
      curr.bearingFromPrev ??
      calculateBearing(prev.latDecl, prev.lonDecl, curr.latDecl, curr.lonDecl);

    const midLat = (prev.latDecl + curr.latDecl) / 2;
    const midLon = (prev.lonDecl + curr.lonDecl) / 2;
    const zoneStart = classifyWaterZone(prev.latDecl, prev.lonDecl);
    const zoneMid = classifyWaterZone(midLat, midLon);
    const zoneEnd = classifyWaterZone(curr.latDecl, curr.lonDecl);

    // Prioritize RIVER > ESTUARY > SEA if leg touches inland waterways
    const legZoneInfo =
      zoneMid.zone === "RIVER"
        ? zoneMid
        : zoneStart.zone === "RIVER"
          ? zoneStart
          : zoneEnd.zone === "RIVER"
            ? zoneEnd
            : zoneMid.zone === "ESTUARY"
              ? zoneMid
              : zoneStart.zone === "ESTUARY"
                ? zoneStart
                : zoneEnd.zone === "ESTUARY"
                  ? zoneEnd
                  : zoneMid;

    const w = waypointWeather[i] || waypointWeather[i - 1] || null;
    const calcSog = w
      ? calculateMaxSOG(
          shipData,
          w.windSpeed,
          w.windDirection,
          w.waveHeight,
          w.waveDirection,
          w.wavePeriod,
          w.currentVelocity,
          w.currentDirection,
          brg
        )
      : Math.round((output.avgSpeed || 14.0) * 100) / 100;

    const legSamples = samples.filter(
      (s) => s.legIndex === i && !isVesselMooredStatus(s.navStatus)
    );
    const observedAvgSogKn =
      legSamples.length > 0
        ? Math.round(
            (legSamples.reduce((acc, s) => acc + s.sogKn, 0) / legSamples.length) *
              100
          ) / 100
        : null;

    const durationHours = calcSog > 0 ? Math.round((distNm / calcSog) * 100) / 100 : 0;

    legs.push({
      legIndex: i,
      fromSeq: i,
      toSeq: i + 1,
      fromLabel: prev.type === "G" ? `WP${i} (Dep)` : `WP${i}`,
      toLabel: curr.type === "I" ? `WP${i + 1} (Arr)` : `WP${i + 1}`,
      fromLat: Math.round(prev.latDecl * 100000) / 100000,
      fromLon: Math.round(prev.lonDecl * 100000) / 100000,
      toLat: Math.round(curr.latDecl * 100000) / 100000,
      toLon: Math.round(curr.lonDecl * 100000) / 100000,
      distanceNm: Math.round(distNm * 100) / 100,
      trueBearingDeg: Math.round(brg * 10) / 10,
      calculatedSogKn: Math.round(calcSog * 100) / 100,
      observedAvgSogKn,
      durationHours,
      waterZone: legZoneInfo.zone,
      waterwayName: legZoneInfo.waterwayName,
      windSpeedKn: w?.windSpeed !== null && w?.windSpeed !== undefined ? Math.round(w.windSpeed * 10) / 10 : null,
      waveHeightM: w?.waveHeight !== null && w?.waveHeight !== undefined ? Math.round(w.waveHeight * 100) / 100 : null,
      currentSpeedKn: w?.currentVelocity !== null && w?.currentVelocity !== undefined ? Math.round(w.currentVelocity * 100) / 100 : null,
    });
  }

  return legs;
}

export function buildSampleRecord(params: {
  voyageId: string;
  vessel: VesselPosition;
  triggerType: SampleTriggerType;
  zoneOverride?: WaterZone | "AUTO";
  waypoints: VoyageWaypointRecord[];
  legs: VoyageLegSummary[];
  weather: WeatherData | null;
  hydrography: HydrographicReport | null;
}): VoyageSampleRecord {
  const {
    voyageId,
    vessel,
    triggerType,
    zoneOverride = "AUTO",
    waypoints,
    legs,
    weather,
    hydrography,
  } = params;

  const zoneInfo = classifyWaterZone(vessel.lat, vessel.lon, zoneOverride);
  const legIdx = findNearestLegIndex(vessel.lat, vessel.lon, waypoints);
  const matchedLeg = legs.find((l) => l.legIndex === legIdx) || legs[0] || null;
  const now = new Date();

  const isEstuary = zoneInfo.zone === "ESTUARY";
  const isRiver = zoneInfo.zone === "RIVER";
  const isInland = isEstuary || isRiver;

  // For estuaries: always consider sea level and tide
  const harmonic = isEstuary ? estimateHarmonicTide(vessel.lat, vessel.lon, now) : null;
  const seaLevelM =
    hydrography?.seaLevelM ??
    (weather?.seaLevelM !== null && weather?.seaLevelM !== undefined
      ? Math.round(weather.seaLevelM * 100) / 100
      : null);
  const tideHeightM = isEstuary
    ? hydrography?.tideHeightM ?? harmonic?.tideHeightM ?? null
    : hydrography?.tideHeightM ?? null;
  const tidePhase = isEstuary
    ? hydrography?.tidePhase ?? harmonic?.tidePhase ?? null
    : hydrography?.tidePhase ?? null;

  // For rivers: consider port authorities' river heights
  const riverHeightM = isRiver ? hydrography?.riverHeightM ?? null : null;
  const riverTrend = isRiver ? hydrography?.riverTrend ?? null : null;

  // Bathymetry recorded whenever vessel is within a river or estuary
  const bathymetryDepthM = isInland
    ? hydrography?.bathymetryDepthM ?? zoneInfo.baselineChartDepthM
    : null;
  const ukcM =
    bathymetryDepthM !== null
      ? Math.round((bathymetryDepthM - vessel.draught) * 100) / 100
      : null;

  const noteParts: string[] = [];
  if (isRiver) {
    noteParts.push(
      riverHeightM !== null
        ? `River gauge ${riverHeightM.toFixed(2)}m (${hydrography?.authorityName || zoneInfo.authorityHint})`
        : `River zone (${zoneInfo.authorityHint})`
    );
  } else if (isEstuary) {
    noteParts.push(
      `Estuary tide ${tideHeightM !== null ? tideHeightM.toFixed(2) + "m" : "N/A"} (${tidePhase || "N/A"})`
    );
  } else {
    noteParts.push("Open sea passage");
  }
  if (ukcM !== null) {
    noteParts.push(`UKC ${ukcM.toFixed(2)}m`);
  }

  return {
    id: `smp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    voyageId,
    legIndex: legIdx,
    sampledAtUtc: now.toISOString(),
    triggerType,
    navStatus: vessel.navStatus,
    waterZone: zoneInfo.zone,
    waterwayName: hydrography?.waterwayName || zoneInfo.waterwayName,
    lat: Math.round(vessel.lat * 100000) / 100000,
    lon: Math.round(vessel.lon * 100000) / 100000,
    sogKn: isVesselMooredStatus(vessel.navStatus) ? 0.0 : Math.round(vessel.sog * 10) / 10,
    calculatedLegSogKn: matchedLeg ? matchedLeg.calculatedSogKn : null,
    cogDeg: Math.round(vessel.cog * 10) / 10,
    headingDeg: Math.round(vessel.heading),
    draughtM: Math.round(vessel.draught * 10) / 10,
    windSpeedKn:
      weather?.windSpeed !== null && weather?.windSpeed !== undefined
        ? Math.round(weather.windSpeed * 10) / 10
        : null,
    windDirDeg:
      weather?.windDirection !== null && weather?.windDirection !== undefined
        ? Math.round(weather.windDirection)
        : null,
    waveHeightM:
      weather?.waveHeight !== null && weather?.waveHeight !== undefined
        ? Math.round(weather.waveHeight * 100) / 100
        : null,
    waveDirDeg:
      weather?.waveDirection !== null && weather?.waveDirection !== undefined
        ? Math.round(weather.waveDirection)
        : null,
    wavePeriodS:
      weather?.wavePeriod !== null && weather?.wavePeriod !== undefined
        ? Math.round(weather.wavePeriod * 10) / 10
        : null,
    currentSpeedKn:
      weather?.currentVelocity !== null && weather?.currentVelocity !== undefined
        ? Math.round(weather.currentVelocity * 100) / 100
        : null,
    currentDirDeg:
      weather?.currentDirection !== null && weather?.currentDirection !== undefined
        ? Math.round(weather.currentDirection)
        : null,
    seaLevelM,
    tideHeightM,
    tidePhase,
    riverHeightM,
    riverTrend,
    bathymetryDepthM,
    ukcM,
    hydroRefId: hydrography?.id ?? null,
    notes: noteParts.join(" | "),
  };
}

function sqlStr(val: string | null | undefined): string {
  if (val === null || val === undefined) return "NULL";
  return `'${String(val).replace(/'/g, "''")}'`;
}

function sqlNum(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined || isNaN(val)) return "NULL";
  return val.toFixed(decimals);
}

/**
 * Generates a plain-text PostgreSQL & ANSI SQL compatible database dump
 * containing the full moored-to-moored Voyage Summary.
 */
export function generateVoyageSummarySql(voyage: VoyageSummaryRecord): string {
  const lines: string[] = [];
  const totalDistNm = voyage.legs.reduce((acc, l) => acc + l.distanceNm, 0);
  const avgCalcSog =
    voyage.legs.length > 0
      ? voyage.legs.reduce((acc, l) => acc + l.calculatedSogKn, 0) / voyage.legs.length
      : 0;

  lines.push("-- ============================================================================");
  lines.push("-- VOYAGE SUMMARY SQL DATABASE (PostgreSQL & ANSI SQL Compatible)");
  lines.push(`-- Vessel         : ${voyage.vesselName} (Call Sign: ${voyage.callsign}, MMSI: ${voyage.mmsi}, IMO: ${voyage.imo})`);
  lines.push(`-- Route Corridor : ${voyage.depPort} -> ${voyage.arrPort}`);
  lines.push(`-- Voyage ID      : ${voyage.id}`);
  lines.push(`-- Lifecycle      : ${voyage.status} (Moored-to-Moored)`);
  lines.push(`-- Started (UTC)  : ${voyage.startedAtUtc}`);
  lines.push(`-- Ended (UTC)    : ${voyage.endedAtUtc || "IN PROGRESS"}`);
  lines.push(`-- Sampling Rules : At Sea = 4h (or User Push) | Estuary / River = 1h (or User Push)`);
  lines.push(`-- Generated (UTC): ${new Date().toISOString()}`);
  lines.push("-- ============================================================================");
  lines.push("");
  lines.push("BEGIN;");
  lines.push("");

  // 1. DDL Schema
  lines.push("-- ----------------------------------------------------------------------------");
  lines.push("-- 1. SCHEMA DEFINITIONS (PostgreSQL / ANSI SQL)");
  lines.push("-- ----------------------------------------------------------------------------");
  lines.push(`CREATE TABLE IF NOT EXISTS voyages (`);
  lines.push(`  voyage_id VARCHAR(64) PRIMARY KEY,`);
  lines.push(`  vessel_name VARCHAR(120) NOT NULL,`);
  lines.push(`  callsign VARCHAR(16) NOT NULL,`);
  lines.push(`  mmsi VARCHAR(16) NOT NULL,`);
  lines.push(`  imo VARCHAR(16),`);
  lines.push(`  departure_port VARCHAR(64) NOT NULL,`);
  lines.push(`  arrival_port VARCHAR(64) NOT NULL,`);
  lines.push(`  started_at_utc TIMESTAMPTZ NOT NULL,`);
  lines.push(`  ended_at_utc TIMESTAMPTZ,`);
  lines.push(`  voyage_status VARCHAR(32) NOT NULL,`);
  lines.push(`  total_distance_nm NUMERIC(10, 2) NOT NULL,`);
  lines.push(`  avg_calculated_sog_kn NUMERIC(6, 2)`);
  lines.push(`);`);
  lines.push("");

  lines.push(`CREATE TABLE IF NOT EXISTS voyage_waypoints (`);
  lines.push(`  voyage_id VARCHAR(64) NOT NULL REFERENCES voyages(voyage_id) ON DELETE CASCADE,`);
  lines.push(`  waypoint_seq INTEGER NOT NULL,`);
  lines.push(`  waypoint_label VARCHAR(64) NOT NULL,`);
  lines.push(`  sistram_type CHAR(1) NOT NULL,`);
  lines.push(`  latitude_deg NUMERIC(9, 5) NOT NULL,`);
  lines.push(`  longitude_deg NUMERIC(10, 5) NOT NULL,`);
  lines.push(`  latitude_sistram VARCHAR(16),`);
  lines.push(`  longitude_sistram VARCHAR(16),`);
  lines.push(`  planned_eta_utc TIMESTAMPTZ NOT NULL,`);
  lines.push(`  water_zone VARCHAR(16) NOT NULL,`);
  lines.push(`  waterway_name VARCHAR(160),`);
  lines.push(`  PRIMARY KEY (voyage_id, waypoint_seq)`);
  lines.push(`);`);
  lines.push("");

  lines.push(`CREATE TABLE IF NOT EXISTS voyage_legs (`);
  lines.push(`  voyage_id VARCHAR(64) NOT NULL REFERENCES voyages(voyage_id) ON DELETE CASCADE,`);
  lines.push(`  leg_index INTEGER NOT NULL,`);
  lines.push(`  from_waypoint_seq INTEGER NOT NULL,`);
  lines.push(`  to_waypoint_seq INTEGER NOT NULL,`);
  lines.push(`  from_label VARCHAR(64) NOT NULL,`);
  lines.push(`  to_label VARCHAR(64) NOT NULL,`);
  lines.push(`  from_lat_deg NUMERIC(9, 5) NOT NULL,`);
  lines.push(`  from_lon_deg NUMERIC(10, 5) NOT NULL,`);
  lines.push(`  to_lat_deg NUMERIC(9, 5) NOT NULL,`);
  lines.push(`  to_lon_deg NUMERIC(10, 5) NOT NULL,`);
  lines.push(`  distance_nm NUMERIC(10, 2) NOT NULL,`);
  lines.push(`  true_bearing_deg NUMERIC(5, 1) NOT NULL,`);
  lines.push(`  calculated_sog_kn NUMERIC(6, 2) NOT NULL,`);
  lines.push(`  observed_avg_sog_kn NUMERIC(6, 2),`);
  lines.push(`  est_duration_hours NUMERIC(8, 2) NOT NULL,`);
  lines.push(`  water_zone VARCHAR(16) NOT NULL,`);
  lines.push(`  waterway_name VARCHAR(160),`);
  lines.push(`  wind_speed_kn NUMERIC(6, 1),`);
  lines.push(`  wave_height_m NUMERIC(6, 2),`);
  lines.push(`  current_speed_kn NUMERIC(6, 2),`);
  lines.push(`  PRIMARY KEY (voyage_id, leg_index)`);
  lines.push(`);`);
  lines.push("");

  lines.push(`CREATE TABLE IF NOT EXISTS hydrographic_references (`);
  lines.push(`  ref_id VARCHAR(64) PRIMARY KEY,`);
  lines.push(`  voyage_id VARCHAR(64) NOT NULL REFERENCES voyages(voyage_id) ON DELETE CASCADE,`);
  lines.push(`  water_zone VARCHAR(16) NOT NULL,`);
  lines.push(`  waterway_name VARCHAR(160) NOT NULL,`);
  lines.push(`  authority_name VARCHAR(160) NOT NULL,`);
  lines.push(`  station_name VARCHAR(160) NOT NULL,`);
  lines.push(`  river_height_m NUMERIC(6, 2),`);
  lines.push(`  river_trend VARCHAR(16),`);
  lines.push(`  tide_height_m NUMERIC(6, 2),`);
  lines.push(`  tide_phase VARCHAR(16),`);
  lines.push(`  sea_level_msl_m NUMERIC(6, 2),`);
  lines.push(`  bathymetry_depth_m NUMERIC(6, 2),`);
  lines.push(`  chart_datum VARCHAR(64),`);
  lines.push(`  bulletin_timestamp VARCHAR(64),`);
  lines.push(`  retrieved_at_utc TIMESTAMPTZ NOT NULL,`);
  lines.push(`  grounded_by_ai BOOLEAN NOT NULL,`);
  lines.push(`  advisory_note TEXT,`);
  lines.push(`  source_urls TEXT`);
  lines.push(`);`);
  lines.push("");

  lines.push(`CREATE TABLE IF NOT EXISTS voyage_samples (`);
  lines.push(`  sample_id VARCHAR(64) PRIMARY KEY,`);
  lines.push(`  voyage_id VARCHAR(64) NOT NULL REFERENCES voyages(voyage_id) ON DELETE CASCADE,`);
  lines.push(`  leg_index INTEGER NOT NULL,`);
  lines.push(`  sampled_at_utc TIMESTAMPTZ NOT NULL,`);
  lines.push(`  trigger_type VARCHAR(24) NOT NULL,`);
  lines.push(`  nav_status VARCHAR(64) NOT NULL,`);
  lines.push(`  water_zone VARCHAR(16) NOT NULL,`);
  lines.push(`  waterway_name VARCHAR(160),`);
  lines.push(`  latitude_deg NUMERIC(9, 5) NOT NULL,`);
  lines.push(`  longitude_deg NUMERIC(10, 5) NOT NULL,`);
  lines.push(`  ais_sog_kn NUMERIC(6, 1) NOT NULL,`);
  lines.push(`  calculated_leg_sog_kn NUMERIC(6, 2),`);
  lines.push(`  cog_deg NUMERIC(5, 1) NOT NULL,`);
  lines.push(`  heading_deg INTEGER NOT NULL,`);
  lines.push(`  draught_m NUMERIC(5, 2) NOT NULL,`);
  lines.push(`  wind_speed_kn NUMERIC(6, 1),`);
  lines.push(`  wind_dir_deg INTEGER,`);
  lines.push(`  wave_height_m NUMERIC(6, 2),`);
  lines.push(`  wave_dir_deg INTEGER,`);
  lines.push(`  wave_period_s NUMERIC(5, 1),`);
  lines.push(`  current_speed_kn NUMERIC(6, 2),`);
  lines.push(`  current_dir_deg INTEGER,`);
  lines.push(`  sea_level_msl_m NUMERIC(6, 2),`);
  lines.push(`  tide_height_m NUMERIC(6, 2),`);
  lines.push(`  tide_phase VARCHAR(16),`);
  lines.push(`  river_height_m NUMERIC(6, 2),`);
  lines.push(`  river_trend VARCHAR(16),`);
  lines.push(`  bathymetry_depth_m NUMERIC(6, 2),`);
  lines.push(`  under_keel_clearance_m NUMERIC(6, 2),`);
  lines.push(`  hydro_ref_id VARCHAR(64) REFERENCES hydrographic_references(ref_id),`);
  lines.push(`  notes TEXT`);
  lines.push(`);`);
  lines.push("");

  // 2. Voyage Master Record
  lines.push("-- ----------------------------------------------------------------------------");
  lines.push("-- 2. VOYAGE HEADER RECORD (MOORED-TO-MOORED)");
  lines.push("-- ----------------------------------------------------------------------------");
  lines.push(
    `INSERT INTO voyages (voyage_id, vessel_name, callsign, mmsi, imo, departure_port, arrival_port, started_at_utc, ended_at_utc, voyage_status, total_distance_nm, avg_calculated_sog_kn) VALUES (`
  );
  lines.push(
    `  ${sqlStr(voyage.id)}, ${sqlStr(voyage.vesselName)}, ${sqlStr(voyage.callsign)}, ${sqlStr(voyage.mmsi)}, ${sqlStr(voyage.imo)}, ${sqlStr(voyage.depPort)}, ${sqlStr(voyage.arrPort)}, ${sqlStr(voyage.startedAtUtc)}, ${sqlStr(voyage.endedAtUtc)}, ${sqlStr(voyage.status)}, ${sqlNum(totalDistNm, 2)}, ${avgCalcSog > 0 ? sqlNum(avgCalcSog, 2) : "NULL"}`
  );
  lines.push(`) ON CONFLICT (voyage_id) DO NOTHING;`);
  lines.push("");

  // 3. Waypoints
  lines.push("-- ----------------------------------------------------------------------------");
  lines.push("-- 3. ROUTE WAYPOINT COORDINATES");
  lines.push("-- ----------------------------------------------------------------------------");
  if (voyage.waypoints.length === 0) {
    lines.push("-- No route waypoints generated.");
  } else {
    for (const wp of voyage.waypoints) {
      lines.push(
        `INSERT INTO voyage_waypoints (voyage_id, waypoint_seq, waypoint_label, sistram_type, latitude_deg, longitude_deg, latitude_sistram, longitude_sistram, planned_eta_utc, water_zone, waterway_name) VALUES (${sqlStr(voyage.id)}, ${wp.seq}, ${sqlStr(wp.label)}, ${sqlStr(wp.sistramType)}, ${sqlNum(wp.latDeg, 5)}, ${sqlNum(wp.lonDeg, 5)}, ${sqlStr(wp.latSistram)}, ${sqlStr(wp.lonSistram)}, ${sqlStr(wp.plannedUtc)}, ${sqlStr(wp.waterZone)}, ${sqlStr(wp.waterwayName)}) ON CONFLICT (voyage_id, waypoint_seq) DO NOTHING;`
      );
    }
  }
  lines.push("");

  // 4. Route Legs & Calculated SOG
  lines.push("-- ----------------------------------------------------------------------------");
  lines.push("-- 4. ROUTE LEGS & CALCULATED SOG (MOORED TO MOORED)");
  lines.push("-- ----------------------------------------------------------------------------");
  if (voyage.legs.length === 0) {
    lines.push("-- No route legs computed.");
  } else {
    for (const leg of voyage.legs) {
      lines.push(
        `INSERT INTO voyage_legs (voyage_id, leg_index, from_waypoint_seq, to_waypoint_seq, from_label, to_label, from_lat_deg, from_lon_deg, to_lat_deg, to_lon_deg, distance_nm, true_bearing_deg, calculated_sog_kn, observed_avg_sog_kn, est_duration_hours, water_zone, waterway_name, wind_speed_kn, wave_height_m, current_speed_kn) VALUES (${sqlStr(voyage.id)}, ${leg.legIndex}, ${leg.fromSeq}, ${leg.toSeq}, ${sqlStr(leg.fromLabel)}, ${sqlStr(leg.toLabel)}, ${sqlNum(leg.fromLat, 5)}, ${sqlNum(leg.fromLon, 5)}, ${sqlNum(leg.toLat, 5)}, ${sqlNum(leg.toLon, 5)}, ${sqlNum(leg.distanceNm, 2)}, ${sqlNum(leg.trueBearingDeg, 1)}, ${sqlNum(leg.calculatedSogKn, 2)}, ${sqlNum(leg.observedAvgSogKn, 2)}, ${sqlNum(leg.durationHours, 2)}, ${sqlStr(leg.waterZone)}, ${sqlStr(leg.waterwayName)}, ${sqlNum(leg.windSpeedKn, 1)}, ${sqlNum(leg.waveHeightM, 2)}, ${sqlNum(leg.currentSpeedKn, 2)}) ON CONFLICT (voyage_id, leg_index) DO NOTHING;`
      );
    }
  }
  lines.push("");

  // 5. Hydrographic Port Authority References
  lines.push("-- ----------------------------------------------------------------------------");
  lines.push("-- 5. PORT AUTHORITY RIVER HEIGHTS, ESTUARY TIDES & BATHYMETRY REFERENCES");
  lines.push("-- ----------------------------------------------------------------------------");
  if (voyage.hydrographicRefs.length === 0) {
    lines.push("-- No river or estuary port-authority references logged yet.");
  } else {
    for (const ref of voyage.hydrographicRefs) {
      const sourceSummary = ref.sources.map((s) => `${s.title} <${s.uri}>`).join(" ; ");
      lines.push(
        `INSERT INTO hydrographic_references (ref_id, voyage_id, water_zone, waterway_name, authority_name, station_name, river_height_m, river_trend, tide_height_m, tide_phase, sea_level_msl_m, bathymetry_depth_m, chart_datum, bulletin_timestamp, retrieved_at_utc, grounded_by_ai, advisory_note, source_urls) VALUES (${sqlStr(ref.id)}, ${sqlStr(voyage.id)}, ${sqlStr(ref.waterZone)}, ${sqlStr(ref.waterwayName)}, ${sqlStr(ref.authorityName)}, ${sqlStr(ref.stationName)}, ${sqlNum(ref.riverHeightM, 2)}, ${sqlStr(ref.riverTrend)}, ${sqlNum(ref.tideHeightM, 2)}, ${sqlStr(ref.tidePhase)}, ${sqlNum(ref.seaLevelM, 2)}, ${sqlNum(ref.bathymetryDepthM, 2)}, ${sqlStr(ref.datum)}, ${sqlStr(ref.bulletinTimestamp)}, ${sqlStr(ref.retrievedAtUtc)}, ${ref.groundedByAi ? "TRUE" : "FALSE"}, ${sqlStr(ref.advisory)}, ${sqlStr(sourceSummary || null)}) ON CONFLICT (ref_id) DO NOTHING;`
      );
    }
  }
  lines.push("");

  // 6. Timed Samples (4h at Sea / 1h in Estuary or River / Manual Push / Moored Transitions)
  lines.push("-- ----------------------------------------------------------------------------");
  lines.push("-- 6. VOYAGE DATA SAMPLES (4H SEA / 1H ESTUARY-RIVER / USER PUSH)");
  lines.push("-- ----------------------------------------------------------------------------");
  if (voyage.samples.length === 0) {
    lines.push("-- No timed samples recorded yet.");
  } else {
    for (const smp of voyage.samples) {
      lines.push(
        `INSERT INTO voyage_samples (sample_id, voyage_id, leg_index, sampled_at_utc, trigger_type, nav_status, water_zone, waterway_name, latitude_deg, longitude_deg, ais_sog_kn, calculated_leg_sog_kn, cog_deg, heading_deg, draught_m, wind_speed_kn, wind_dir_deg, wave_height_m, wave_dir_deg, wave_period_s, current_speed_kn, current_dir_deg, sea_level_msl_m, tide_height_m, tide_phase, river_height_m, river_trend, bathymetry_depth_m, under_keel_clearance_m, hydro_ref_id, notes) VALUES (${sqlStr(smp.id)}, ${sqlStr(voyage.id)}, ${smp.legIndex}, ${sqlStr(smp.sampledAtUtc)}, ${sqlStr(smp.triggerType)}, ${sqlStr(smp.navStatus)}, ${sqlStr(smp.waterZone)}, ${sqlStr(smp.waterwayName)}, ${sqlNum(smp.lat, 5)}, ${sqlNum(smp.lon, 5)}, ${sqlNum(smp.sogKn, 1)}, ${sqlNum(smp.calculatedLegSogKn, 2)}, ${sqlNum(smp.cogDeg, 1)}, ${Math.round(smp.headingDeg)}, ${sqlNum(smp.draughtM, 2)}, ${sqlNum(smp.windSpeedKn, 1)}, ${smp.windDirDeg !== null ? Math.round(smp.windDirDeg) : "NULL"}, ${sqlNum(smp.waveHeightM, 2)}, ${smp.waveDirDeg !== null ? Math.round(smp.waveDirDeg) : "NULL"}, ${sqlNum(smp.wavePeriodS, 1)}, ${sqlNum(smp.currentSpeedKn, 2)}, ${smp.currentDirDeg !== null ? Math.round(smp.currentDirDeg) : "NULL"}, ${sqlNum(smp.seaLevelM, 2)}, ${sqlNum(smp.tideHeightM, 2)}, ${sqlStr(smp.tidePhase)}, ${sqlNum(smp.riverHeightM, 2)}, ${sqlStr(smp.riverTrend)}, ${sqlNum(smp.bathymetryDepthM, 2)}, ${sqlNum(smp.ukcM, 2)}, ${sqlStr(smp.hydroRefId)}, ${sqlStr(smp.notes)}) ON CONFLICT (sample_id) DO NOTHING;`
      );
    }
  }
  lines.push("");
  lines.push("COMMIT;");
  lines.push("");

  return lines.join("\n");
}

export function downloadVoyageSummarySql(sqlContent: string, callsign: string, voyageId: string): string {
  const safeCallsign = (callsign || "VESSEL").replace(/[^A-Z0-9_-]/gi, "_");
  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const shortId = voyageId.slice(-6);
  const filename = `Voyage_Summary_${safeCallsign}_${dateStamp}_${shortId}.sql`;

  const blob = new Blob([sqlContent], { type: "text/sql;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  return filename;
}
