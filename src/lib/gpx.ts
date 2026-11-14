import { parseSistramCoord, ShipData, GeneratorOutput } from "./sistram";

export interface ParsedGpxPoint {
  lat: number;
  lon: number;
  latS: string;
  lonS: string;
  name: string;
  time?: string;
  sym?: string;
}

/**
 * Parses raw text input lines into structured WGS84 coordinates.
 */
export function parseWaypointsForGpx(
  waypointsStr: string,
  shipData?: ShipData,
  output?: GeneratorOutput | null,
  times?: { etd: string; etdZone: number; eta: string; etaZone: number }
): ParsedGpxPoint[] {
  // If output with calculated waypoints and UTC times already exists, use them
  if (output && output.waypoints && output.waypoints.length > 0) {
    return output.waypoints.map((wp, idx) => {
      let name = `WP${(idx + 1).toString().padStart(2, "0")}`;
      let sym = "Waypoint";
      if (wp.type === "G") {
        name = shipData?.dep_port ? `DEP - ${shipData.dep_port}` : "Departure (G)";
        sym = "Anchor";
      } else if (wp.type === "I") {
        name = shipData?.arr_port ? `ARR - ${shipData.arr_port}` : "Arrival (I)";
        sym = "Anchor";
      }

      return {
        lat: wp.latDecl,
        lon: wp.lonDecl,
        latS: wp.latS,
        lonS: wp.lonS,
        name,
        time: wp.timeUtc ? wp.timeUtc.toISOString() : undefined,
        sym,
      };
    });
  }

  // Otherwise, parse raw string directly
  const lines = waypointsStr.trim().split("\n");
  const rawPairs = lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return null;

      // Check tab separated
      let parts = trimmed.split("\t").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        return { lat: parts[0], lon: parts[1] };
      }

      // Check comma separated
      if (trimmed.includes(",")) {
        parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          return { lat: parts[0], lon: parts[1] };
        }
      }

      // Check space separated (e.g. 23°55.61' S 046°19.12' W)
      parts = trimmed.split(/\s+/);
      if (parts.length === 4) {
        return { lat: parts[0] + parts[1], lon: parts[2] + parts[3] };
      }

      if (parts.length >= 2) {
        return { lat: parts[0], lon: parts[1] };
      }

      return null;
    })
    .filter((p): p is { lat: string; lon: string } => p !== null && Boolean(p.lat && p.lon));

  let etdUtc: Date | null = null;
  let etaUtc: Date | null = null;

  if (times?.etd) {
    try {
      etdUtc = new Date(times.etd + ":00Z");
      if (!isNaN(etdUtc.getTime()) && times.etdZone !== undefined) {
        etdUtc.setUTCHours(etdUtc.getUTCHours() - times.etdZone);
      }
    } catch {
      etdUtc = null;
    }
  }

  if (times?.eta) {
    try {
      etaUtc = new Date(times.eta + ":00Z");
      if (!isNaN(etaUtc.getTime()) && times.etaZone !== undefined) {
        etaUtc.setUTCHours(etaUtc.getUTCHours() - times.etaZone);
      }
    } catch {
      etaUtc = null;
    }
  }

  const totalPoints = rawPairs.length;

  return rawPairs.map((pair, idx) => {
    // Check if directly decimal degrees (e.g. -23.965 -46.303889)
    const latNum = parseFloat(pair.lat);
    const lonNum = parseFloat(pair.lon);
    let lat: number;
    let lon: number;
    let latS = "";
    let lonS = "";

    if (!isNaN(latNum) && !isNaN(lonNum) && !/[NS]/i.test(pair.lat) && !/[EW]/i.test(pair.lon) && !pair.lat.includes("°")) {
      lat = latNum;
      lon = lonNum;
    } else {
      const parsedLat = parseSistramCoord(pair.lat, true);
      const parsedLon = parseSistramCoord(pair.lon, false);
      lat = parsedLat.decimal;
      lon = parsedLon.decimal;
      latS = parsedLat.sistramStr;
      lonS = parsedLon.sistramStr;
    }

    let name = `WP${(idx + 1).toString().padStart(2, "0")}`;
    let sym = "Waypoint";
    if (idx === 0) {
      name = shipData?.dep_port ? `DEP - ${shipData.dep_port}` : "Departure (G)";
      sym = "Anchor";
    } else if (idx === totalPoints - 1) {
      name = shipData?.arr_port ? `ARR - ${shipData.arr_port}` : "Arrival (I)";
      sym = "Anchor";
    }

    // Interpolate time if ETD and ETA are available
    let timeStr: string | undefined;
    if (etdUtc && etaUtc && totalPoints > 1) {
      const fraction = idx / (totalPoints - 1);
      const pointTime = new Date(etdUtc.getTime() + fraction * (etaUtc.getTime() - etdUtc.getTime()));
      timeStr = pointTime.toISOString();
    } else if (etdUtc && idx === 0) {
      timeStr = etdUtc.toISOString();
    } else if (etaUtc && idx === totalPoints - 1) {
      timeStr = etaUtc.toISOString();
    }

    return {
      lat,
      lon,
      latS,
      lonS,
      name,
      time: timeStr,
      sym,
    };
  });
}

/**
 * Builds standard GPX 1.1 XML string from waypoints.
 */
export function generateGPXContent(
  points: ParsedGpxPoint[],
  shipData?: ShipData,
  routeName?: string
): string {
  const effectiveRouteName =
    routeName ||
    (shipData?.dep_port && shipData?.arr_port
      ? `Rota ${shipData.dep_port} - ${shipData.arr_port}`
      : "Rota SISTRAM");

  const shipName = shipData?.name || "Vessel";
  const nowUtc = new Date().toISOString();

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SISTRAM Type 1 - Voyage Planner"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">

  <metadata>
    <name>${escapeXml(effectiveRouteName)}</name>
    <desc>Plano de Viagem Marítima / SISTRAM Type 1 - Embarcação: ${escapeXml(shipName)}</desc>
    <time>${nowUtc}</time>
  </metadata>
`;

  // 1. Waypoints (<wpt>)
  for (const pt of points) {
    const latFormatted = pt.lat.toFixed(6);
    const lonFormatted = pt.lon.toFixed(6);
    xml += `  <wpt lat="${latFormatted}" lon="${lonFormatted}">\n`;
    xml += `    <ele>0</ele>\n`;
    if (pt.time) {
      xml += `    <time>${pt.time}</time>\n`;
    }
    xml += `    <name>${escapeXml(pt.name)}</name>\n`;
    if (pt.latS && pt.lonS) {
      xml += `    <desc>SISTRAM: ${escapeXml(pt.latS)} ${escapeXml(pt.lonS)}</desc>\n`;
    }
    xml += `    <sym>${pt.sym || "Waypoint"}</sym>\n`;
    xml += `  </wpt>\n`;
  }

  // 2. Route (<rte>)
  xml += `
  <rte>
    <name>${escapeXml(effectiveRouteName)}</name>
    <desc>Rota planejada para ${escapeXml(shipName)}</desc>
`;
  for (const pt of points) {
    const latFormatted = pt.lat.toFixed(6);
    const lonFormatted = pt.lon.toFixed(6);
    xml += `    <rtept lat="${latFormatted}" lon="${lonFormatted}">\n`;
    xml += `      <ele>0</ele>\n`;
    if (pt.time) {
      xml += `      <time>${pt.time}</time>\n`;
    }
    xml += `      <name>${escapeXml(pt.name)}</name>\n`;
    xml += `      <sym>${pt.sym || "Waypoint"}</sym>\n`;
    xml += `    </rtept>\n`;
  }
  xml += `  </rte>\n`;

  // 3. Track (<trk>)
  xml += `
  <trk>
    <name>${escapeXml(effectiveRouteName)}</name>
    <trkseg>
`;
  for (const pt of points) {
    const latFormatted = pt.lat.toFixed(6);
    const lonFormatted = pt.lon.toFixed(6);
    xml += `      <trkpt lat="${latFormatted}" lon="${lonFormatted}">\n`;
    xml += `        <ele>0</ele>\n`;
    if (pt.time) {
      xml += `        <time>${pt.time}</time>\n`;
    }
    xml += `      </trkpt>\n`;
  }
  xml += `    </trkseg>
  </trk>
</gpx>`;

  return xml;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Downloads generated GPX as a .gpx file to client's browser.
 */
export function downloadGPXFile(
  waypointsStr: string,
  shipData?: ShipData,
  output?: GeneratorOutput | null,
  times?: { etd: string; etdZone: number; eta: string; etaZone: number }
): { success: boolean; error?: string; count?: number } {
  try {
    const points = parseWaypointsForGpx(waypointsStr, shipData, output, times);

    if (points.length === 0) {
      return { success: false, error: "Nenhum waypoint válido encontrado para exportar." };
    }

    const xmlContent = generateGPXContent(points, shipData);
    const blob = new Blob([xmlContent], { type: "application/gpx+xml;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const safeDep = shipData?.dep_port?.replace(/[^a-zA-Z0-9_-]/g, "_") || "DEP";
    const safeArr = shipData?.arr_port?.replace(/[^a-zA-Z0-9_-]/g, "_") || "ARR";
    const filename = `ROTA_${safeDep}_${safeArr}_${new Date().toISOString().slice(0, 10)}.gpx`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true, count: points.length };
  } catch (err: any) {
    console.error("Erro ao gerar GPX:", err);
    return { success: false, error: err.message || "Erro desconhecido ao exportar arquivo GPX." };
  }
}
