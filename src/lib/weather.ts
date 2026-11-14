export interface WeatherData {
  timeUnit: number;
  windSpeed: number | null; // knots
  windDirection: number | null;
  waveHeight: number | null; // meters
  waveDirection: number | null;
  wavePeriod: number | null; // seconds
  currentVelocity: number | null; // knots
  currentDirection: number | null;
  seaLevelM: number | null; // meters MSL (for coastal/estuary sampling)
}

export async function getWaypointWeather(lat: number, lon: number, timeUtc: Date): Promise<WeatherData | null> {
  const targetTimeUnix = Math.floor(timeUtc.getTime() / 1000);
  
  // Format dates for the API to reduce payload (fetch 2 days window around the time)
  const dLat = Math.round(lat * 100) / 100;
  const dLon = Math.round(lon * 100) / 100;
  
  try {
    const startObj = new Date(timeUtc.getTime() - 24 * 3600 * 1000);
    const endObj = new Date(timeUtc.getTime() + 24 * 3600 * 1000);
    const startDate = startObj.toISOString().split('T')[0];
    const endDate = endObj.toISOString().split('T')[0];

    const [marineRes, weatherRes] = await Promise.all([
      fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${dLat}&longitude=${dLon}&hourly=wave_height,wave_direction,wave_period,ocean_current_velocity,ocean_current_direction,sea_level_height_msl&start_date=${startDate}&end_date=${endDate}&timeformat=unixtime`),
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${dLat}&longitude=${dLon}&hourly=wind_speed_10m,wind_direction_10m&start_date=${startDate}&end_date=${endDate}&timeformat=unixtime`)
    ]);

    const marineData = marineRes.ok ? await marineRes.json().catch(() => null) : null;
    const weatherData = weatherRes.ok ? await weatherRes.json().catch(() => null) : null;

    if (!marineData?.hourly && !weatherData?.hourly) {
      return null;
    }

    const times: number[] = weatherData?.hourly?.time || marineData?.hourly?.time || [];
    if (times.length === 0) {
      return null;
    }

    // Find closest hour index for forecast
    let closestWeatherIdx = 0;
    let minWeatherDiff = Infinity;
    const weatherTimes: number[] = weatherData?.hourly?.time || [];
    for (let i = 0; i < weatherTimes.length; i++) {
      const diff = Math.abs(weatherTimes[i] - targetTimeUnix);
      if (diff < minWeatherDiff) {
        minWeatherDiff = diff;
        closestWeatherIdx = i;
      }
    }

    // Find closest hour index for marine
    let closestMarineIdx = 0;
    let minMarineDiff = Infinity;
    const marineTimes: number[] = marineData?.hourly?.time || [];
    for (let i = 0; i < marineTimes.length; i++) {
      const diff = Math.abs(marineTimes[i] - targetTimeUnix);
      if (diff < minMarineDiff) {
        minMarineDiff = diff;
        closestMarineIdx = i;
      }
    }

    const windKmh = weatherData?.hourly?.wind_speed_10m?.[closestWeatherIdx];
    const currentKmh = marineData?.hourly?.ocean_current_velocity?.[closestMarineIdx];

    return {
      timeUnit: weatherTimes[closestWeatherIdx] ?? marineTimes[closestMarineIdx] ?? targetTimeUnix,
      windSpeed: typeof windKmh === 'number' ? windKmh / 1.852 : null,
      windDirection: weatherData?.hourly?.wind_direction_10m?.[closestWeatherIdx] ?? null,
      waveHeight: marineData?.hourly?.wave_height?.[closestMarineIdx] ?? null,
      waveDirection: marineData?.hourly?.wave_direction?.[closestMarineIdx] ?? null,
      wavePeriod: marineData?.hourly?.wave_period?.[closestMarineIdx] ?? null,
      currentVelocity: typeof currentKmh === 'number' ? currentKmh / 1.852 : null,
      currentDirection: marineData?.hourly?.ocean_current_direction?.[closestMarineIdx] ?? null,
      seaLevelM: marineData?.hourly?.sea_level_height_msl?.[closestMarineIdx] ?? null,
    };
  } catch (e) {
    console.error("Weather API Error: ", e);
    return null;
  }
}
