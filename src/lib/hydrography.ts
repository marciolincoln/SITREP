/**
 * Maritime Zone Classifier (Sea vs. Estuary vs. River) & Hydrography Client
 * Determines adaptive sampling cadence (4h at sea, 1h in estuary/river) and
 * queries the server-side Gemini AI Search-Grounded Port Authority endpoint.
 */

export type WaterZone = "SEA" | "ESTUARY" | "RIVER";

export interface ZoneClassification {
  zone: WaterZone;
  waterwayName: string;
  authorityHint: string;
  stationHint: string;
  baselineChartDepthM: number | null;
  samplingIntervalHours: 1 | 4;
}

export interface HydrographicSource {
  title: string;
  uri: string;
}

export interface HydrographicReport {
  id: string;
  authorityName: string;
  stationName: string;
  waterwayName: string;
  waterZone: WaterZone;
  riverHeightM: number | null;
  riverTrend: "RISING" | "FALLING" | "STEADY" | "UNKNOWN" | null;
  tideHeightM: number | null;
  tidePhase: "FLOOD" | "EBB" | "HIGH" | "LOW" | "SLACK" | null;
  seaLevelM: number | null;
  bathymetryDepthM: number | null;
  datum: string | null;
  bulletinTimestamp: string | null;
  advisory: string;
  retrievedAtUtc: string;
  groundedByAi: boolean;
  cached?: boolean;
  sources: HydrographicSource[];
}

interface CorridorBox {
  zone: WaterZone;
  waterwayName: string;
  authorityHint: string;
  stationHint: string;
  baselineChartDepthM: number;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

const MARITIME_CORRIDORS: CorridorBox[] = [
  // Rivers (1-hour sampling + Port Authority river height & bathymetry)
  {
    zone: "RIVER",
    waterwayName: "Paraná River (Hidrovía Paraná-Paraguay)",
    authorityHint: "Prefectura Naval Argentina (PNA) / INA",
    stationHint: "Rosario / San Lorenzo / Zárate",
    baselineChartDepthM: 10.5,
    minLat: -34.15,
    maxLat: -27.0,
    minLon: -61.3,
    maxLon: -58.35,
  },
  {
    zone: "RIVER",
    waterwayName: "Itajaí-Açu River Channel (Navegantes / Itajaí)",
    authorityHint: "Praticagem de Itajaí / Superintendência do Porto",
    stationHint: "Portonave / Barra de Itajaí",
    baselineChartDepthM: 14.0,
    minLat: -26.93,
    maxLat: -26.86,
    minLon: -48.75,
    maxLon: -48.62,
  },
  {
    zone: "RIVER",
    waterwayName: "Guaíba River / Porto Alegre Channel",
    authorityHint: "Portos RS / Marinha do Brasil DHN",
    stationHint: "Cais Mauá / Itapuã",
    baselineChartDepthM: 6.0,
    minLat: -30.25,
    maxLat: -29.95,
    minLon: -51.35,
    maxLon: -51.02,
  },
  {
    zone: "RIVER",
    waterwayName: "Amazon / Pará River System",
    authorityHint: "Marinha do Brasil DHN / Praticagem da Bacia Amazônica",
    stationHint: "Barra Norte / Vila do Conde / Manaus",
    baselineChartDepthM: 12.5,
    minLat: -2.1,
    maxLat: 1.2,
    minLon: -60.5,
    maxLon: -48.2,
  },

  // Estuaries (1-hour sampling + sea level, tide & bathymetry)
  {
    zone: "ESTUARY",
    waterwayName: "Río de la Plata Estuary",
    authorityHint: "Servicio de Hidrografía Naval (SHN) / CARP / PNA",
    stationHint: "Buenos Aires / La Plata / Canal Punta Indio",
    baselineChartDepthM: 10.4,
    minLat: -36.05,
    maxLat: -34.15,
    minLon: -58.6,
    maxLon: -54.85,
  },
  {
    zone: "ESTUARY",
    waterwayName: "Santos Estuary & Access Channel (BRSSZ)",
    authorityHint: "Autoridade Portuária de Santos (APS) / Marinha DHN",
    stationHint: "Torre Grande / Ponta da Praia / Barnabé",
    baselineChartDepthM: 15.0,
    minLat: -24.06,
    maxLat: -23.85,
    minLon: -46.44,
    maxLon: -46.25,
  },
  {
    zone: "ESTUARY",
    waterwayName: "Itajaí-Açu River Mouth Estuary (BRNVT)",
    authorityHint: "Marinha do Brasil DHN / Praticagem de Itajaí",
    stationHint: "Barra do Rio Itajaí-Açu",
    baselineChartDepthM: 14.0,
    minLat: -26.96,
    maxLat: -26.84,
    minLon: -48.62,
    maxLon: -48.53,
  },
  {
    zone: "ESTUARY",
    waterwayName: "Paranaguá Bay Estuary (BRPNG)",
    authorityHint: "Portos do Paraná (APPA) / Marinha DHN",
    stationHint: "Canal da Galheta / Ponta do Félix",
    baselineChartDepthM: 13.5,
    minLat: -25.68,
    maxLat: -25.4,
    minLon: -48.68,
    maxLon: -48.18,
  },
  {
    zone: "ESTUARY",
    waterwayName: "Rio Grande Estuary / Lagoa dos Patos Mouth (BRRIG)",
    authorityHint: "Portos RS / Marinha DHN",
    stationHint: "Molhes da Barra / Superporto Rio Grande",
    baselineChartDepthM: 14.5,
    minLat: -32.28,
    maxLat: -31.94,
    minLon: -52.22,
    maxLon: -51.94,
  },
  {
    zone: "ESTUARY",
    waterwayName: "Guanabara Bay Estuary (BRRIO)",
    authorityHint: "Marinha do Brasil DHN / PortosRio",
    stationHint: "Ilha Fiscal / Ponta do Calabouço",
    baselineChartDepthM: 16.0,
    minLat: -23.0,
    maxLat: -22.7,
    minLon: -43.28,
    maxLon: -43.05,
  },
];

export function classifyWaterZone(
  lat: number,
  lon: number,
  manualOverride?: WaterZone | "AUTO"
): ZoneClassification {
  let matchedCorridor: CorridorBox | null = null;
  for (const box of MARITIME_CORRIDORS) {
    if (lat >= box.minLat && lat <= box.maxLat && lon >= box.minLon && lon <= box.maxLon) {
      matchedCorridor = box;
      break;
    }
  }

  const effectiveZone: WaterZone =
    manualOverride && manualOverride !== "AUTO"
      ? manualOverride
      : matchedCorridor
        ? matchedCorridor.zone
        : "SEA";

  if (effectiveZone === "SEA") {
    return {
      zone: "SEA",
      waterwayName: matchedCorridor ? `${matchedCorridor.waterwayName} (Offshore Override)` : "Open Sea / Coastal Offshore",
      authorityHint: "METAREA V / Open-Meteo Marine",
      stationHint: "Offshore Grid",
      baselineChartDepthM: null,
      samplingIntervalHours: 4,
    };
  }

  return {
    zone: effectiveZone,
    waterwayName:
      matchedCorridor?.waterwayName ||
      (effectiveZone === "RIVER" ? "Inland Navigable River" : "Coastal Estuary / Channel"),
    authorityHint:
      matchedCorridor?.authorityHint || "Local Port Authority / National Hydrographic Office",
    stationHint: matchedCorridor?.stationHint || "Local Tide / River Gauge",
    baselineChartDepthM: matchedCorridor?.baselineChartDepthM ?? (effectiveZone === "RIVER" ? 10.5 : 13.5),
    samplingIntervalHours: 1,
  };
}

export function getSamplingIntervalMs(zone: WaterZone): number {
  return zone === "SEA" ? 4 * 3600 * 1000 : 1 * 3600 * 1000;
}

/**
 * Computes a semi-diurnal M2 tidal reference estimate when live Port Authority / marine tide data is pending.
 */
export function estimateHarmonicTide(lat: number, lon: number, timestampUtc: Date): {
  tideHeightM: number;
  tidePhase: "FLOOD" | "EBB" | "HIGH" | "LOW";
} {
  const hoursSinceEpoch = timestampUtc.getTime() / 3600000;
  const m2PeriodHrs = 12.4206;
  const lonPhaseRad = ((lon + 48) * Math.PI) / 180;
  const phaseRad = ((2 * Math.PI * hoursSinceEpoch) / m2PeriodHrs) + lonPhaseRad;

  // Approximate semi-diurnal tidal range in South Atlantic / Plata estuaries (~0.9m to 1.4m)
  const amplitude = Math.abs(lat) > 33 ? 0.55 : 0.65;
  const meanLevel = 0.75;
  const tideHeightM = Math.round((meanLevel + amplitude * Math.sin(phaseRad)) * 100) / 100;

  const derivative = Math.cos(phaseRad);
  const sinVal = Math.sin(phaseRad);

  let tidePhase: "FLOOD" | "EBB" | "HIGH" | "LOW" = "FLOOD";
  if (sinVal > 0.92) tidePhase = "HIGH";
  else if (sinVal < -0.92) tidePhase = "LOW";
  else tidePhase = derivative >= 0 ? "FLOOD" : "EBB";

  return { tideHeightM, tidePhase };
}

export async function fetchPortAuthorityHydrography(params: {
  lat: number;
  lon: number;
  waterZone: WaterZone;
  waterwayName: string;
  portCode?: string;
  destination?: string;
  vesselDraught?: number;
  forceRefresh?: boolean;
}): Promise<{ ok: boolean; hydrography?: HydrographicReport; aiWarning?: string; error?: string }> {
  try {
    const res = await fetch("/api/hydrography/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(params),
    });

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return {
        ok: false,
        error: `Backend proxy is restarting or returned non-JSON (${res.status} ${contentType || "text/html"}). Wait a few seconds and retry.`,
      };
    }

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok || !data?.hydrography) {
      return {
        ok: false,
        error: data?.error || `Hydrography service returned HTTP ${res.status}`,
      };
    }

    const h = data.hydrography;
    const report: HydrographicReport = {
      id: `hydro_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      authorityName: h.authorityName,
      stationName: h.stationName,
      waterwayName: h.waterwayName,
      waterZone: params.waterZone,
      riverHeightM: h.riverHeightM ?? null,
      riverTrend: h.riverTrend ?? null,
      tideHeightM: h.tideHeightM ?? null,
      tidePhase: h.tidePhase ?? null,
      seaLevelM: h.seaLevelM ?? null,
      bathymetryDepthM: h.bathymetryDepthM ?? null,
      datum: h.datum ?? "Chart Datum",
      bulletinTimestamp: h.bulletinTimestamp ?? null,
      advisory: h.advisory ?? "",
      retrievedAtUtc: h.retrievedAtUtc || new Date().toISOString(),
      groundedByAi: Boolean(h.groundedByAi),
      cached: Boolean(data.cached),
      sources: Array.isArray(h.sources) ? h.sources : [],
    };

    return {
      ok: true,
      hydrography: report,
      aiWarning: typeof data.aiWarning === "string" ? data.aiWarning : undefined,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "Network error while querying AI Port Authority service.",
    };
  }
}
