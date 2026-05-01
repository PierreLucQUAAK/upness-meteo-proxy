// api/forecast.js — v3 CommonJS, compatible Vercel Node 18
const https = require('https');

module.exports = async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=900');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat et lon requis' });

  const latF = parseFloat(lat);
  const lonF = parseFloat(lon);
  if (isNaN(latF) || isNaN(lonF)) return res.status(400).json({ error: 'Coordonnées invalides' });

  // ── Fetch via https natif Node (pas de fetch API) ─────────────
  function httpsGet(url, headers) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout 10s')), 10000);
      https.get(url, { headers }, (r) => {
        clearTimeout(timer);
        let body = '';
        r.on('data', c => body += c);
        r.on('end', () => {
          if (r.statusCode !== 200) {
            reject(new Error('HTTP ' + r.statusCode));
          } else {
            try { resolve(JSON.parse(body)); }
            catch(e) { reject(new Error('JSON invalide')); }
          }
        });
      }).on('error', e => { clearTimeout(timer); reject(e); });
    });
  }

  // ── YR.no ─────────────────────────────────────────────────────
  const yrUrl = 'https://api.yr.no/weatherapi/locationforecast/2.0/compact'
    + '?lat=' + latF.toFixed(4) + '&lon=' + lonF.toFixed(4);

  try {
    const data = await httpsGet(yrUrl, {
      'User-Agent': 'upness-agrilife-meteo/1.0 agrilife@upness.fr',
      'Accept': 'application/json'
    });
    return res.status(200).json({ source: 'yr.no', data });
  } catch (err) {
    console.error('YR.no KO:', err.message);
  }

  // ── Fallback Open-Meteo ───────────────────────────────────────
  try {
    const omUrl = 'https://api.open-meteo.com/v1/forecast'
      + '?latitude=' + latF.toFixed(4) + '&longitude=' + lonF.toFixed(4)
      + '&hourly=temperature_2m,precipitation,wind_speed_10m,wind_direction_10m'
      + ',surface_pressure,cloud_cover_low,cloud_cover_mid,cloud_cover_high'
      + ',cloud_cover,weather_code,relative_humidity_2m'
      + '&wind_speed_unit=kmh&timezone=auto&forecast_days=7';
    const omData = await httpsGet(omUrl, { 'Accept': 'application/json' });
    return res.status(200).json({ source: 'open-meteo', fallback: true, data: omData });
  } catch (err2) {
    return res.status(503).json({ error: 'Sources indisponibles', details: err2.message });
  }
};
