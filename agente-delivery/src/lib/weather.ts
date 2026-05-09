import * as cache from './cache';

const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';
const LAT = -25.61;
const LON = -54.58;

interface WeatherData {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  precipitation: number;
  description: string;
  forecast: { date: string; max: number; min: number; rain_prob: number; desc: string }[];
}

const WMO_CODES: Record<number, string> = {
  0: 'despejado',
  1: 'mayormente despejado',
  2: 'parcialmente nublado',
  3: 'nublado',
  45: 'niebla',
  48: 'niebla con escarcha',
  51: 'llovizna ligera',
  53: 'llovizna moderada',
  55: 'llovizna intensa',
  61: 'lluvia leve',
  63: 'lluvia moderada',
  65: 'lluvia intensa',
  66: 'lluvia con hielo leve',
  67: 'lluvia con hielo intensa',
  71: 'nieve leve',
  73: 'nieve moderada',
  75: 'nieve intensa',
  80: 'chaparrones leves',
  81: 'chaparrones moderados',
  82: 'chaparrones fuertes',
  95: 'tormenta',
  96: 'tormenta con granizo leve',
  99: 'tormenta con granizo fuerte',
};

const WMO_CODES_EN: Record<number, string> = {
  0: 'clear sky',
  1: 'mostly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'fog',
  48: 'fog with frost',
  51: 'light drizzle',
  53: 'moderate drizzle',
  55: 'heavy drizzle',
  61: 'light rain',
  63: 'moderate rain',
  65: 'heavy rain',
  80: 'light showers',
  81: 'moderate showers',
  82: 'heavy showers',
  95: 'thunderstorm',
  96: 'thunderstorm with hail',
  99: 'thunderstorm with heavy hail',
};

const WMO_CODES_PT: Record<number, string> = {
  0: 'céu limpo',
  1: 'predominantemente limpo',
  2: 'parcialmente nublado',
  3: 'nublado',
  45: 'nevoeiro',
  48: 'nevoeiro com geada',
  51: 'garoa leve',
  53: 'garoa moderada',
  55: 'garoa forte',
  61: 'chuva leve',
  63: 'chuva moderada',
  65: 'chuva forte',
  80: 'pancadas leves',
  81: 'pancadas moderadas',
  82: 'pancadas fortes',
  95: 'trovoada',
};

function wmoDesc(code: number, lang: string): string {
  if (lang === 'en') return WMO_CODES_EN[code] ?? WMO_CODES[code] ?? 'unknown';
  if (lang === 'pt') return WMO_CODES_PT[code] ?? WMO_CODES[code] ?? 'unknown';
  return WMO_CODES[code] ?? 'unknown';
}

export async function getWeatherContext(lang: string = 'es'): Promise<string> {
  const cacheKey = `iguazu_weather_${lang}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const url = `${WEATHER_API}?latitude=${LAT}&longitude=${LON}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=America/Argentina/Buenos_Aires&forecast_days=7`;

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return '';

    const data = await res.json();
    const c = data.current;
    const d = data.daily;

    const current: WeatherData = {
      temperature: c?.temperature_2m,
      feelsLike: c?.apparent_temperature,
      humidity: c?.relative_humidity_2m,
      windSpeed: c?.wind_speed_10m,
      precipitation: c?.precipitation,
      description: wmoDesc(c?.weather_code, lang),
      forecast: [],
    };

    if (d?.time && d?.temperature_2m_max) {
      for (let i = 0; i < d.time.length; i++) {
        current.forecast.push({
          date: d.time[i],
          max: d.temperature_2m_max[i],
          min: d.temperature_2m_min[i],
          rain_prob: d.precipitation_probability_max?.[i] ?? 0,
          desc: wmoDesc(d.weather_code?.[i] ?? 0, lang),
        });
      }
    }

    const lines: string[] = [];

    if (lang === 'en') {
      lines.push(`CLIMA ACTUAL en Puerto Iguazú: ${current.temperature}°C (feels like ${current.feelsLike}°C), ${current.description}, humidity ${current.humidity}%, wind ${current.windSpeed} km/h.`);
    } else if (lang === 'pt') {
      lines.push(`CLIMA ATUAL em Puerto Iguazú: ${current.temperature}°C (sensação ${current.feelsLike}°C), ${current.description}, umidade ${current.humidity}%, vento ${current.windSpeed} km/h.`);
    } else {
      lines.push(`CLIMA ACTUAL en Puerto Iguazú: ${current.temperature}°C (sensación térmica ${current.feelsLike}°C), ${current.description}, humedad ${current.humidity}%, viento ${current.windSpeed} km/h.`);
    }

    if (current.precipitation > 0) {
      lines.push(lang === 'en'
        ? `Currently raining: ${current.precipitation} mm.`
        : lang === 'pt'
          ? `Chovendo agora: ${current.precipitation} mm.`
          : `Lloviendo actualmente: ${current.precipitation} mm.`
      );
    }

    if (current.forecast.length > 0) {
      const label = lang === 'en' ? 'FORECAST' : lang === 'pt' ? 'PREVISÃO' : 'PRONÓSTICO';
      lines.push(`${label} próximos días:`);
      for (const day of current.forecast) {
        lines.push(`- ${day.date}: ${day.min}°C a ${day.max}°C, ${day.desc}, lluvia ${day.rain_prob}%`);
      }
    }

    const context = lines.join('\n');
    cache.set(cacheKey, context, 30 * 60_000); // 30 min cache
    return context;
  } catch (err) {
    console.error('[weather] Error fetching Open-Meteo:', err);
    return '';
  }
}