/** Open-Meteo forecast and geocoding (free, no key). */
import { normalize, type Weather } from './weather';

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';

export interface Place {
  lat: number;
  lon: number;
  name: string;
}

async function getJson(url: string, timeoutMs: number): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
  return res.json();
}

/** "Warszawa" -> its coordinates; null when nothing matches. */
export async function geocode(name: string, timeoutMs = 5000): Promise<Place | null> {
  const r = await getJson(`${GEOCODE}?name=${encodeURIComponent(name)}&count=1&format=json`, timeoutMs);
  const p = r?.results?.[0];
  if (!p || typeof p.latitude !== 'number' || typeof p.longitude !== 'number') return null;
  return { lat: p.latitude, lon: p.longitude, name: typeof p.name === 'string' ? p.name : name };
}

export async function forecast(place: Place, timeoutMs = 6000): Promise<Weather> {
  const params = new URLSearchParams({
    latitude: place.lat.toFixed(4),
    longitude: place.lon.toFixed(4),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,precipitation,is_day',
    hourly: 'temperature_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,is_day',
    daily: 'sunrise,sunset',
    timezone: 'auto',
    forecast_days: '3',
    wind_speed_unit: 'kmh'
  });
  return normalize(await getJson(`${FORECAST}?${params}`, timeoutMs), place.name);
}
