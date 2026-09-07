import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Login() {
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (error) setError(error.message)
  }

  async function handleMagicSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    setLoading(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-paper-raised p-7 shadow-sm">
        <p className="font-display text-[11px] font-bold uppercase tracking-widest text-ink-soft">Calendario</p>
        <h1 className="mt-1 font-display text-xl font-extrabold text-ink">Entrenamientos, partidos y viajes</h1>

        {sent ? (
          <p className="mt-5 text-sm text-ink-soft">
            Te enviamos un enlace de acceso a <strong className="text-ink">{email}</strong>. Ábrelo desde este mismo
            dispositivo para entrar.
          </p>
        ) : mode === 'password' ? (
          <form onSubmit={handlePasswordSubmit} className="mt-5 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-soft">
              Correo
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                className="rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-soft">
              Contraseña
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
              />
            </label>
            {error && <p className="text-xs font-semibold text-partido">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="mt-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('magic')
                setError(null)
              }}
              className="text-xs font-semibold text-ink-soft hover:text-accent hover:underline"
            >
              ¿No tienes contraseña todavía? Usar enlace mágico por correo
            </button>
          </form>
        ) : (
          <form onSubmit={handleMagicSubmit} className="mt-5 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink-soft">
              Correo
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                className="rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
              />
            </label>
            {error && <p className="text-xs font-semibold text-partido">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="mt-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {loading ? 'Enviando…' : 'Enviar enlace de acceso'}
            </button>
            <p className="text-[11px] text-ink-soft">
              Una vez dentro, ve a "Configurar contraseña" para poder entrar directo la próxima vez, en cualquier
              navegador, sin pasar por el correo.
            </p>
            <button
              type="button"
              onClick={() => {
                setMode('password')
                setError(null)
              }}
              className="text-xs font-semibold text-ink-soft hover:text-accent hover:underline"
            >
              ← Ya tengo contraseña
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
