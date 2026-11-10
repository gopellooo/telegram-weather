export async function jsonFetch(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(options.timeout ?? 8000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function findCity(name) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({ name: name.trim().slice(0, 80), count: '1', language: 'ru', format: 'json' });
  const city = (await jsonFetch(url)).results?.[0];
  if (!city) throw new Error('Город не найден. Попробуйте другое название.');
  return { city: city.name.slice(0, 40), lat: city.latitude, lon: city.longitude };
}

export function compactForecast(raw, place, now = Date.now()) {
  const c = raw.current;
  const required = [c?.temperature_2m, c?.apparent_temperature, c?.wind_speed_10m, c?.relative_humidity_2m, c?.weather_code, c?.is_day];
  if (!c?.time || required.some(v => !Number.isFinite(v))) throw new Error('Погодный сервис вернул неполные данные.');
  const start = raw.hourly.time.findIndex(t => t >= c.time);
  if (start < 0) throw new Error('Нет почасового прогноза.');
  const round = n => Number.isFinite(n) ? Math.round(n) : null;
  const state = {
    ...place, rev: now, time: c.time, t: round(c.temperature_2m), f: round(c.apparent_temperature),
    w: Math.round(c.wind_speed_10m * 10) / 10, hum: round(c.relative_humidity_2m), code: c.weather_code, day: c.is_day,
    h: raw.hourly.time.slice(start, start + 6).map((t, i) => [t.slice(11, 16), round(raw.hourly.temperature_2m[start + i]), raw.hourly.weather_code[start + i], round(raw.hourly.precipitation_probability[start + i])]),
    d: raw.daily.time.slice(0, 3).map((t, i) => [t, round(raw.daily.temperature_2m_max[i]), round(raw.daily.temperature_2m_min[i]), raw.daily.weather_code[i]])
  };
  if (new TextEncoder().encode(JSON.stringify(state)).length > 1024) throw new Error('Данные превышают лимит Telegram.');
  return state;
}

export function createWeatherService(fetchJSON = jsonFetch) {
  const cache = new Map();
  return async function forecast(place) {
    const lat = Number(place.lat), lon = Number(place.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Некорректные координаты.');
    const key = `${lat}:${lon}`;
    let entry = cache.get(key);
    if (!entry || Date.now() - entry.at > 300000) {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.search = new URLSearchParams({ latitude: String(lat), longitude: String(lon), timezone: 'auto', forecast_days: '3', wind_speed_unit: 'ms', current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m', hourly: 'temperature_2m,weather_code,precipitation_probability', daily: 'weather_code,temperature_2m_max,temperature_2m_min' });
      const raw = await fetchJSON(url);
      entry = { at: Date.now(), state: compactForecast(raw, { lat, lon }) };
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      cache.set(key, entry);
    }
    return { ...entry.state, ...(place.city ? { city: place.city } : {}) };
  };
}
export const forecast = createWeatherService();
