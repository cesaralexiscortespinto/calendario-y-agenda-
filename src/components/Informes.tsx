import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { CalendarEvent, EventKind, Report } from '@/lib/database.types'
import { CATEGORIES } from '@/lib/categories'
import { KIND_META as LABELS } from '@/lib/kindMeta'

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function humanDate(iso: string) {
  return capital(new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }))
}

interface ModalState {
  editing: Report | null
}

function ReportModal({ state, userId, onClose, onSaved }: { state: ModalState; userId: string; onClose: () => void; onSaved: () => void }) {
  const r = state.editing
  const [title, setTitle] = useState(r?.title ?? '')
  const [category, setCategory] = useState(r?.category ?? '')
  const [date, setDate] = useState(r?.date ?? new Date().toISOString().slice(0, 10))
  const [content, setContent] = useState(r?.content ?? '')
  const [linkUrl, setLinkUrl] = useState(r?.link_url ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      user_id: userId,
      title: title.trim() || 'Informe sin título',
      category: category || null,
      date,
      content: content.trim(),
      link_url: linkUrl.trim() || null,
      updated_at: new Date().toISOString(),
    }
    if (r) {
      await supabase.from('reports').update(payload).eq('id', r.id)
    } else {
      await supabase.from('reports').insert(payload)
    }
    setSaving(false)
    onSaved()
    onClose()
  }

  async function handleDelete() {
    if (!r) return
    if (!confirm('¿Eliminar este informe?')) return
    await supabase.from('reports').delete().eq('id', r.id)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 py-10" onClick={onClose}>
      <div className="mx-auto w-full max-w-lg rounded-2xl border border-line bg-paper-raised p-5 shadow-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-ink">{r ? 'Editar' : 'Nuevo'} informe</h2>
          <button type="button" onClick={onClose} className="rounded-md px-1.5 py-0.5 text-ink-soft hover:bg-line">
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
            Título
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="p. ej. Scouting Panamá Sub-20"
              className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
              Fecha
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
              Categoría
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              >
                <option value="">Sin categoría</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
            Enlace (PDF o Artifact ya generado, opcional)
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://claude.ai/code/artifact/…"
              className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
            Notas
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder="Resumen, hallazgos clave, pendientes…"
              className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </label>

          <div className="mt-2 flex items-center justify-between">
            {r ? (
              <button type="button" onClick={handleDelete} className="text-xs font-bold text-partido hover:underline">
                Eliminar
              </button>
            ) : (
              <span />
            )}
            <button type="submit" disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white disabled:opacity-60">
              {saving ? 'Guardando…' : r ? 'Guardar cambios' : 'Crear informe'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function StatBar({ label, value, max, colorVar, sub }: { label: string; value: number; max: number; colorVar: string; sub?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-3">
        <span className="w-28 shrink-0 text-xs font-semibold text-ink-soft">{label}</span>
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: `var(${colorVar})` }} />
        </div>
        <span className="w-7 shrink-0 text-right text-xs font-bold tabular-nums text-ink">{value}</span>
      </div>
      {sub && <p className="pl-[7.5rem] text-[11px] text-ink-soft">{sub}</p>}
    </div>
  )
}

const PERIODS = [
  { key: 'mes', label: 'Este mes' },
  { key: 'anio', label: 'Este año' },
  { key: 'todo', label: 'Todo' },
] as const
type Period = (typeof PERIODS)[number]['key']

export default function Informes({ userId, events }: { userId: string; events: CalendarEvent[] }) {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [period, setPeriod] = useState<Period>('mes')

  async function loadReports() {
    setLoading(true)
    const { data } = await supabase.from('reports').select('*').order('date', { ascending: false })
    setReports((data as Report[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadReports()
  }, [])

  const inPeriod = useMemo(() => {
    const now = new Date()
    return (iso: string) => {
      const d = new Date(iso + 'T00:00:00')
      if (period === 'mes') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      if (period === 'anio') return d.getFullYear() === now.getFullYear()
      return true
    }
  }, [period])

  const filteredEvents = useMemo(
    () => events.filter((ev) => inPeriod(ev.date) && (!categoryFilter || ev.category === categoryFilter)),
    [events, inPeriod, categoryFilter],
  )
  const filteredReports = useMemo(
    () => reports.filter((r) => inPeriod(r.date) && (!categoryFilter || r.category === categoryFilter)),
    [reports, inPeriod, categoryFilter],
  )

  const stats = useMemo(() => {
    const counts: Record<EventKind, number> = { entrenamiento: 0, partido: 0, viaje: 0, charla_tecnica: 0, tmi: 0, otros: 0 }
    let amistosos = 0
    let torneos = 0
    for (const ev of filteredEvents) {
      counts[ev.kind]++
      if (ev.kind === 'partido') {
        if (ev.match_type === 'amistoso') amistosos++
        else if (ev.match_type === 'torneo') torneos++
      }
    }
    const nonViaje = filteredEvents.filter((ev) => ev.kind !== 'viaje')
    const attendanceRate = nonViaje.length > 0 ? Math.round((nonViaje.filter((ev) => ev.attending).length / nonViaje.length) * 100) : null
    const informesCount = filteredReports.length
    const max = Math.max(counts.entrenamiento, counts.partido, counts.charla_tecnica, counts.tmi, counts.viaje, counts.otros, informesCount, 1)
    return { counts, amistosos, torneos, attendanceRate, informesCount, max }
  }, [filteredEvents, filteredReports])

  return (
    <div>
      <div className="mb-6 rounded-2xl border border-line bg-paper-raised p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="font-display text-[11px] font-bold uppercase tracking-widest text-ink-soft">Control de actividad</span>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-lg border border-line p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPeriod(p.key)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${
                    period === p.key ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[11px] font-bold text-ink outline-none focus:border-accent"
            >
              <option value="">Todas las categorías</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <StatBar label="Entrenamientos" value={stats.counts.entrenamiento} max={stats.max} colorVar={LABELS.entrenamiento.colorVar} />
          <StatBar
            label="Partidos"
            value={stats.counts.partido}
            max={stats.max}
            colorVar={LABELS.partido.colorVar}
            sub={stats.counts.partido > 0 ? `${stats.amistosos} amistosos · ${stats.torneos} de torneo` : undefined}
          />
          <StatBar label="Charlas Técnicas" value={stats.counts.charla_tecnica} max={stats.max} colorVar={LABELS.charla_tecnica.colorVar} />
          <StatBar label="TMI" value={stats.counts.tmi} max={stats.max} colorVar={LABELS.tmi.colorVar} />
          <StatBar label="Viajes" value={stats.counts.viaje} max={stats.max} colorVar={LABELS.viaje.colorVar} />
          <StatBar label="Otros" value={stats.counts.otros} max={stats.max} colorVar={LABELS.otros.colorVar} />
          <StatBar label="Informes" value={stats.informesCount} max={stats.max} colorVar="--color-accent" />
        </div>

        <p className="mt-4 text-xs text-ink-soft">
          Asistencia en el período: <span className="font-bold text-ink">{stats.attendanceRate === null ? '—' : `${stats.attendanceRate}%`}</span>
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="font-display text-[11px] font-bold uppercase tracking-widest text-ink-soft">Informes</span>
        <button
          type="button"
          onClick={() => setModal({ editing: null })}
          className="flex items-center gap-1.5 rounded-lg border border-line bg-paper-raised px-3 py-2 text-xs font-bold text-ink hover:border-ink-soft"
        >
          + Nuevo informe
        </button>
      </div>

      {loading && <p className="text-sm text-ink-soft">Cargando…</p>}
      {!loading && filteredReports.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line py-16 text-center text-sm text-ink-soft">
          {reports.length === 0
            ? 'Aún no has creado informes. Usa "Nuevo informe" para guardar un scouting, evaluación o resumen de partido — puedes enlazar el PDF o Artifact ya generado en Claude Code.'
            : 'Nada que coincida con este filtro.'}
        </div>
      )}
      <div className="flex flex-col gap-3">
        {filteredReports.map((r) => (
          <div key={r.id} className="rounded-2xl border border-line bg-paper-raised p-4 shadow-sm hover:border-ink-soft">
            <button type="button" onClick={() => setModal({ editing: r })} className="w-full text-left">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-bold text-ink">{r.title}</p>
                <span className="text-xs font-semibold text-ink-soft">{humanDate(r.date)}</span>
              </div>
              {r.category && <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-accent">{r.category}</p>}
              {r.content && <p className="mt-1.5 line-clamp-2 text-sm text-ink-soft">{r.content}</p>}
            </button>
            {r.link_url && (
              <a
                href={r.link_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="mt-2 inline-block text-[11px] font-bold text-accent hover:underline"
              >
                Ver informe →
              </a>
            )}
          </div>
        ))}
      </div>

      {modal && <ReportModal state={modal} userId={userId} onClose={() => setModal(null)} onSaved={loadReports} />}
    </div>
  )
}
