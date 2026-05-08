export interface WeatherData {
  timeUnit: number;
  windSpeed: number | null; // knots
  windDirection: number | null;
  waveHeight: number | null; // meters
  waveDirection: number | null;
  wavePeriod: number | null; // seconds
  currentVelocity: number | null; // knots
  currentDirection: number | null;
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
      fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${dLat}&longitude=${dLon}&hourly=wave_height,wave_direction,wave_period,ocean_current_velocity,ocean_current_direction&start_date=${startDate}&end_date=${endDate}&timeformat=unixtime`),
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${dLat}&longitude=${dLon}&hourly=wind_speed_10m,wind_direction_10m&start_date=${startDate}&end_date=${endDate}&timeformat=unixtime`)
    ]);

    const marineData = await marineRes.json();
    const weatherData = await weatherRes.json();

    if (!marineData.hourly || !weatherData.hourly) {
       return null;
    }

    // Find closest hour index
    let closestIndex = 0;
    let minDiff = Infinity;
    const times = marineData.hourly.time;
    
    for (let i = 0; i < times.length; i++) {
        const diff = Math.abs(times[i] - targetTimeUnix);
        if (diff < minDiff) {
            minDiff = diff;
            closestIndex = i;
        }
    }

    // Velocity conversions (open-meteo returns km/h usually for wind, let's just assume we get default km/h and convert to knots: kmh / 1.852)
    // Actually wind_speed_10m is in km/h by default. ocean_current_velocity is km/h.
    
    const windKmh = weatherData.hourly.wind_speed_10m[closestIndex];
    const currentKmh = marineData.hourly.ocean_current_velocity?.[closestIndex];
    
    return {
       timeUnit: times[closestIndex],
       windSpeed: typeof windKmh === 'number' ? windKmh / 1.852 : null,
       windDirection: weatherData.hourly.wind_direction_10m[closestIndex] ?? null,
       waveHeight: marineData.hourly.wave_height?.[closestIndex] ?? null,
       waveDirection: marineData.hourly.wave_direction?.[closestIndex] ?? null,
       wavePeriod: marineData.hourly.wave_period?.[closestIndex] ?? null,
       currentVelocity: typeof currentKmh === 'number' ? currentKmh / 1.852 : null,
       currentDirection: marineData.hourly.ocean_current_direction?.[closestIndex] ?? null,
    };
  } catch (e) {
     console.error("Weather API Error: ", e);
     return null;
  }
}
