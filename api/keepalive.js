// Ping diario a Supabase (lo dispara el cron de vercel.json) para que el plan gratis no pause el proyecto por inactividad.
export default async function handler(req, res) {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    return res.status(500).json({ ok: false, error: 'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en Vercel' })
  }
  try {
    const r = await fetch(`${url}/rest/v1/events?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status, at: new Date().toISOString() })
  } catch (err) {
    return res.status(502).json({ ok: false, error: String(err) })
  }
}
