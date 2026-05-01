// ═══════════════════════════════════════════════════════════════
// Proxy YR.no pour Up'ness Agrilife — Vercel Serverless Function
// Fichier : api/forecast.js  — v2 (compatible Node 16+)
// ═══════════════════════════════════════════════════════════════

export default async function handler(req, res) {

  // ── CORS ─────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=900');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Paramètres ───────────────────────────────────────────────
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'Paramètres lat et lon obligatoires' });
  }
  const latF = parseFloat(lat);
  const lonF = parseFloat(lon);
  if (isNaN(latF) || isNaN(lonF)) {
    return res.status(400).json({ error: 'Coordonnées invalides' });
  }

  // ── Helper timeout compatible Node 16 ────────────────────────
  function fetchWithTimeout(url, options, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout ' + ms + 'ms')), ms);
      fetch(url, options)
        .then(r  => { clearTimeout(timer); resolve(r); })
        .catch(e => { clearTimeout(timer); reject(e);  });
    });
  }

  // ── Tentative YR.no ──────────────────────────────────────────
  const yrUrl = 'https://api.yr.no/weatherapi/locationforecast/2.0/compact'
    + '?lat=' + latF.toFixed(4) + '&lon=' + lonF.toFixed(4);

  try {
    const yrRes = await fetchWithTimeout(yrUrl, {
      headers: {
        'User-Agent': 'upness-agrilife-meteo/1.0 agrilife@upness.fr',
        'Accept':     'application/json'
      }
    }, 10000);

    if (!yrRes.ok) throw new Error('YR.no HTTP ' + yrRes.status);

    const data = await yrRes.json();
    return res.status(200).json({ source: 'yr.no', data });

  } catch (err) {
    console.error('YR.no KO:', err.message, '→ Open-Meteo fallback');
  }

  // ── Fallback Open-Meteo ───────────────────────────────────────
  try {
    const omUrl = 'https://api.open-meteo.com/v1/forecast'
      + '?latitude='  + latF.toFixed(4) + '&longitude=' + lonF.toFixed(4)
      + '&hourly=temperature_2m,precipitation,wind_speed_10m,wind_direction_10m'
      + ',surface_pressure,cloud_cover_low,cloud_cover_mid,cloud_cover_high,cloud_cover'
      + ',weather_code,relative_humidity_2m'
      + '&wind_speed_unit=kmh&timezone=auto&forecast_days=7';

    const omRes = await fetchWithTimeout(omUrl, {}, 10000);
    if (!omRes.ok) throw new Error('Open-Meteo HTTP ' + omRes.status);
    const omData = await omRes.json();
    return res.status(200).json({ source: 'open-meteo', fallback: true, data: omData });

  } catch (err2) {
    return res.status(503).json({ error: 'Sources météo indisponibles', details: err2.message });
  }
}
