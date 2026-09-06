import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    setSending(false)
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
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
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
              disabled={sending}
              className="mt-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {sending ? 'Enviando…' : 'Enviar enlace de acceso'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
