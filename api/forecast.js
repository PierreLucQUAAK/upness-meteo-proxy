// ═══════════════════════════════════════════════════════════════
// Proxy YR.no pour Up'ness Agrilife — Vercel Serverless Function
// Fichier : api/forecast.js
// ═══════════════════════════════════════════════════════════════
// YR.no exige un User-Agent identifié + ne tolère pas les appels
// navigateur directs (CORS bloqué). Ce proxy règle les deux.
// ═══════════════════════════════════════════════════════════════

export default async function handler(req, res) {

  // ── CORS : autorise Wix + l'app Netlify ──────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=900'); // cache 15 min

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ── Paramètres lat/lon ────────────────────────────────────────
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ error: 'Paramètres lat et lon obligatoires' });
  }

  const latF = parseFloat(lat);
  const lonF = parseFloat(lon);

  if (isNaN(latF) || isNaN(lonF) ||
      latF < -90 || latF > 90 || lonF < -180 || lonF > 180) {
    return res.status(400).json({ error: 'Coordonnées invalides' });
  }

  // ── Appel YR.no (Institut Météorologique Norvégien) ──────────
  // User-Agent obligatoire selon les CGU de YR.no
  const yrUrl = `https://api.yr.no/weatherapi/locationforecast/2.0/compact`
    + `?lat=${latF.toFixed(4)}&lon=${lonF.toFixed(4)}`;

  try {
    const yrRes = await fetch(yrUrl, {
      headers: {
        'User-Agent': 'upness-agrilife-meteo/1.0 agrilife@upness.fr',
        'Accept':     'application/json'
      },
      signal: AbortSignal.timeout(10000) // 10s max
    });

    if (!yrRes.ok) {
      throw new Error(`YR.no HTTP ${yrRes.status}`);
    }

    const data = await yrRes.json();

    return res.status(200).json({
      source: 'yr.no',
      data:   data
    });

  } catch (err) {
    // ── Fallback Open-Meteo si YR.no inaccessible ────────────
    console.error('YR.no indisponible:', err.message, '→ fallback Open-Meteo');

    try {
      const omUrl = `https://api.open-meteo.com/v1/forecast`
        + `?latitude=${latF.toFixed(4)}&longitude=${lonF.toFixed(4)}`
        + `&hourly=temperature_2m,precipitation,wind_speed_10m,wind_direction_10m`
        + `,surface_pressure,cloud_cover_low,cloud_cover_mid,cloud_cover_high,cloud_cover`
        + `,weather_code,relative_humidity_2m`
        + `&wind_speed_unit=kmh&timezone=auto&forecast_days=7`;

      const omRes = await fetch(omUrl, {
        signal: AbortSignal.timeout(10000)
      });

      if (!omRes.ok) throw new Error(`Open-Meteo HTTP ${omRes.status}`);
      const omData = await omRes.json();

      return res.status(200).json({
        source:   'open-meteo',
        fallback: true,
        data:     omData
      });

    } catch (err2) {
      return res.status(503).json({
        error:   'Sources météo indisponibles',
        details: err2.message
      });
    }
  }
}
