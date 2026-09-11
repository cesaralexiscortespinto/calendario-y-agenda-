import { useMemo, useState } from 'react'
import type { CalendarEvent, EventKind, Report } from '@/lib/database.types'
import { CATEGORIES } from '@/lib/categories'
import { KIND_META as LABELS } from '@/lib/kindMeta'
import { MATCH_TYPES, MATCH_TYPE_META } from '@/lib/matchTypes'

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

export default function ControlPanel({ events, reports }: { events: CalendarEvent[]; reports: Report[] }) {
  const [categoryFilter, setCategoryFilter] = useState('')
  const [period, setPeriod] = useState<Period>('mes')

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
    const matchTypeCounts: Record<string, number> = {}
    for (const ev of filteredEvents) {
      counts[ev.kind]++
      if (ev.kind === 'partido' && ev.match_type) {
        matchTypeCounts[ev.match_type] = (matchTypeCounts[ev.match_type] ?? 0) + 1
      }
    }
    const nonViaje = filteredEvents.filter((ev) => ev.kind !== 'viaje')
    const attendanceRate = nonViaje.length > 0 ? Math.round((nonViaje.filter((ev) => ev.attending).length / nonViaje.length) * 100) : null
    const informesCount = filteredReports.length
    const max = Math.max(counts.entrenamiento, counts.partido, counts.charla_tecnica, counts.tmi, counts.viaje, counts.otros, informesCount, 1)
    const matchTypeSub = MATCH_TYPES.filter((t) => matchTypeCounts[t] > 0)
      .map((t) => `${matchTypeCounts[t]} ${MATCH_TYPE_META[t].label.toLowerCase()}`)
      .join(' · ')
    return { counts, matchTypeSub, attendanceRate, informesCount, max }
  }, [filteredEvents, filteredReports])

  return (
    <div className="rounded-2xl border border-line bg-paper-raised p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="font-display text-[11px] font-bold uppercase tracking-widest text-ink-soft">Control de actividad</span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-line p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${period === p.key ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'}`}
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
          sub={stats.matchTypeSub || undefined}
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
  )
}
