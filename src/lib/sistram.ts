export interface ShipData {
  name: string;
  callsign: string;
  flag: string;
  type: string;
  dep_port: string;
  arr_port: string;
  medical: string;
  mmsi: string;
  rpm: number;
  stw: number;
  sog: number;
  cog: number;
  hdg: number;
  draftFwd: number;
  draftAft: number;
  avgDraft: number;
  displacement: number;
  windArea: number;
}

export interface Waypoint {
  lat: string;
  lon: string;
}

export interface WaypointDetail {
  latS: string;
  lonS: string;
  latDecl: number;
  lonDecl: number;
  timeUtc: Date;
  type: 'G' | 'L' | 'I';
  bearingFromPrev?: number;
}

export interface GeneratorOutput {
  message: string;
  totalDist: number;
  avgSpeed: number;
  totalHours: number;
  waypoints: WaypointDetail[];
}

export const PT_MONTHS: Record<number, string> = {
  0: "JAN", 1: "FEV", 2: "MAR", 3: "ABR", 4: "MAI", 5: "JUN",
  6: "JUL", 7: "AGO", 8: "SET", 9: "OUT", 10: "NOV", 11: "DEZ"
};

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3440.065; // Earth radius in Nautical Miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const dLon = (lon2 - lon1) * toRad;
  const y = Math.sin(dLon) * Math.cos(lat2 * toRad);
  const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
            Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos(dLon);
  return (Math.atan2(y, x) * toDeg + 360) % 360;
}

export function calculateMaxSOG(
  shipData: ShipData, 
  windSpeedKnots: number | null,
  windDirDeg: number | null,
  waveHeightM: number | null,
  waveDirDeg: number | null,
  wavePeriodS: number | null,
  currentVelocityKnots: number | null,
  currentDirectionDeg: number | null,
  cog: number
): number {
  const BASE_SPEED = 23.2;
  const DRAFT_COEFF = 0.36;
  const DISP_COEFF = 0.00058;
  const RPM_EXPONENT = 0.65;

  const k_w = 2.55e-07;
  const k_h = 0.716;

  const Tn = 8.1;
  const A = 0.7;
  const sigma = 1.5;

  const avgDraft = shipData.avgDraft || 8.1;
  const rpm = shipData.rpm || 92;
  const disp = shipData.displacement || 50000;
  
  const vCalm = BASE_SPEED - (DRAFT_COEFF * Math.pow(avgDraft - 8.1, 2)) - (DISP_COEFF * Math.pow(disp, 2 / 3));
  const stwBase = vCalm * Math.pow(rpm / 92, RPM_EXPONENT);

  const currSpeed = currentVelocityKnots || 0; 
  const currDir = currentDirectionDeg || 0;
  
  const dCurrent = currSpeed * Math.cos((cog - currDir) * Math.PI / 180);

  const windSpeed = windSpeedKnots || 0;
  const windDir = windDirDeg || 0;
  const windArea = shipData.windArea || 1000;
  // Convert windArea (likely m2) and windSpeed (knots). The Python uses Wind_Speed presumably in m/s or knots? Wait, coefficient is small, maybe knots ok.
  const dWind = -k_w * windArea * Math.pow(windSpeed, 2) * Math.cos((cog - windDir) * Math.PI / 180);

  const waveHeight = waveHeightM || 0;
  const waveDir = waveDirDeg ?? cog;
  const wavePeriod = wavePeriodS || 8;
  
  const resFactor = 1 + A * Math.exp(-Math.pow(wavePeriod - Tn, 2) / (2 * Math.pow(sigma, 2)));
  const dWave = -k_h * Math.pow(waveHeight, 1.1) * Math.cos((cog - waveDir) * Math.PI / 180) * resFactor;

  const stwModelRaw = stwBase + dWind + dWave;
  const etaHull = 1.0; 
  const stwModel = stwModelRaw * etaHull;
  const sogModel = stwModel + dCurrent;

  return Math.round(sogModel * 100) / 100;
}

export function parseSistramCoord(coordStr: string, isLat: boolean) {
  if (!coordStr) return { decimal: 0, sistramStr: "" };
  
  let str = coordStr.toUpperCase().replace(/\s+/g, '');
  let dir = str.slice(-1);
  if (!['N', 'S', 'E', 'W'].includes(dir)) {
    dir = isLat ? 'N' : 'W';
  } else {
    str = str.slice(0, -1);
  }
  
  let deg = 0;
  let min = 0;
  
  if (str.includes('°')) {
    const parts = str.split('°');
    deg = parseInt(parts[0], 10) || 0;
    min = parseFloat(parts[1].replace(/'/g, '')) || 0;
  } else {
    if (isLat) {
       deg = parseInt(str.slice(0, 2), 10) || 0;
       min = parseFloat(str.slice(2)) || 0;
    } else {
       deg = parseInt(str.slice(0, 3), 10) || 0;
       min = parseFloat(str.slice(3)) || 0;
    }
  }
  
  const decimal = deg + (min / 60.0);
  const signed = (dir === 'S' || dir === 'W') ? -decimal : decimal;
  
  const degStr = deg.toString().padStart(isLat ? 2 : 3, '0');
  const minStr = Math.round(min).toString().padStart(2, '0');
  
  return {
    decimal: signed,
    sistramStr: `${degStr}${minStr}${dir}`
  };
}

function formatSistramDate(dt: Date) {
  const day = dt.getUTCDate().toString().padStart(2, '0');
  const hr = dt.getUTCHours().toString().padStart(2, '0');
  const mn = dt.getUTCMinutes().toString().padStart(2, '0');
  const month = PT_MONTHS[dt.getUTCMonth()];
  const yr = dt.getUTCFullYear().toString().slice(-2);
  return `${day}${hr}${mn}Z${month}${yr}`;
}

export function generateSistramPlan(
  shipData: ShipData,
  waypointsRaw: Waypoint[],
  times: {
    etd: string;
    etdZone: number;
    eta: string;
    etaZone: number;
    sendTime: string;
    sendZone: number;
  }
): GeneratorOutput | null {
  try {
    const etdUtc = new Date(times.etd + ':00Z');
    etdUtc.setUTCHours(etdUtc.getUTCHours() - times.etdZone);
    
    const etaUtc = new Date(times.eta + ':00Z');
    etaUtc.setUTCHours(etaUtc.getUTCHours() - times.etaZone);
    
    const sendUtc = new Date(times.sendTime + ':00Z');
    sendUtc.setUTCHours(sendUtc.getUTCHours() - times.sendZone);
    
    const totalDurationHrs = (etaUtc.getTime() - etdUtc.getTime()) / (1000 * 3600);
    if (totalDurationHrs <= 0) {
      throw new Error("ETA must be after ETD");
    }
    
    const coords = waypointsRaw.map(wp => {
      const parsedLat = parseSistramCoord(wp.lat, true);
      const parsedLon = parseSistramCoord(wp.lon, false);
      return {
        lat: parsedLat.decimal,
        lon: parsedLon.decimal,
        latS: parsedLat.sistramStr,
        lonS: parsedLon.sistramStr
      };
    });

    if (coords.length < 2) {
      throw new Error("At least 2 waypoints are required");
    }

    let totalDist = 0;
    const legDistances = [0];
    for (let i = 1; i < coords.length; i++) {
        const d = haversine(coords[i-1].lat, coords[i-1].lon, coords[i].lat, coords[i].lon);
        totalDist += d;
        legDistances.push(d);
    }
    
    const avgSpeed = totalDist / totalDurationHrs;
    
    const msg: string[] = [];
    const waypoints: WaypointDetail[] = [];

    msg.push(`SISTRAM/1/${formatSistramDate(sendUtc)}/REF//`);
    msg.push(`A/${shipData.callsign}/${shipData.name}/${shipData.flag}/${shipData.type}//`);
    msg.push(`B/${formatSistramDate(etdUtc)}//`);
    msg.push(`G/${shipData.dep_port}/${coords[0].latS}/${coords[0].lonS}//`);
    
    waypoints.push({
      latS: coords[0].latS,
      lonS: coords[0].lonS,
      latDecl: coords[0].lat,
      lonDecl: coords[0].lon,
      timeUtc: etdUtc,
      type: 'G'
    });

    let cumulativeDist = 0;
    for (let i = 1; i < coords.length - 1; i++) {
        cumulativeDist += legDistances[i];
        const timeOffset = (cumulativeDist / totalDist) * totalDurationHrs;
        const wpTime = new Date(etdUtc.getTime() + timeOffset * 3600 * 1000);
        msg.push(`L/${coords[i].latS}/${coords[i].lonS}/${formatSistramDate(wpTime)}//`);
        waypoints.push({
          latS: coords[i].latS,
          lonS: coords[i].lonS,
          latDecl: coords[i].lat,
          lonDecl: coords[i].lon,
          timeUtc: wpTime,
          type: 'L',
          bearingFromPrev: calculateBearing(coords[i-1].lat, coords[i-1].lon, coords[i].lat, coords[i].lon)
        });
    }

    msg.push(`I/${shipData.arr_port}/${coords[coords.length-1].latS}/${coords[coords.length-1].lonS}/${formatSistramDate(etaUtc)}//`);
    waypoints.push({
      latS: coords[coords.length-1].latS,
      lonS: coords[coords.length-1].lonS,
      latDecl: coords[coords.length-1].lat,
      lonDecl: coords[coords.length-1].lon,
      timeUtc: etaUtc,
      type: 'I',
      bearingFromPrev: calculateBearing(coords[coords.length-2].lat, coords[coords.length-2].lon, coords[coords.length-1].lat, coords[coords.length-1].lon)
    });

    msg.push(`V/${shipData.medical}//`);
    msg.push(`Y/MMSI-${shipData.mmsi}//`);
    msg.push(`NNNN`);
    
    return {
      message: msg.join('\n'),
      totalDist: Math.round(totalDist * 100) / 100,
      avgSpeed: Math.round(avgSpeed * 100) / 100,
      totalHours: Math.round(totalDurationHrs * 100) / 100,
      waypoints
    };
  } catch(e) {
    console.error(e);
    return null;
  }
}
