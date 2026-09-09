import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Report, ReportType } from '@/lib/database.types'
import { CATEGORIES } from '@/lib/categories'
import { REPORT_TYPES, REPORT_TYPE_META } from '@/lib/reportTypeMeta'

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function humanDate(iso: string) {
  return capital(new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }))
}

interface ModalState {
  reportType: ReportType
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
      report_type: state.reportType,
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
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-ink">
            {r ? 'Editar' : 'Nuevo'} informe · {REPORT_TYPE_META[state.reportType].label}
          </h2>
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

export default function Informes({ userId, reports, onChanged }: { userId: string; reports: Report[]; onChanged: () => void }) {
  const [modal, setModal] = useState<ModalState | null>(null)
  const [typeFilter, setTypeFilter] = useState<'all' | ReportType>('all')

  const visibleReports = useMemo(() => {
    if (typeFilter === 'all') return reports
    return reports.filter((r) => r.report_type === typeFilter)
  }, [reports, typeFilter])

  const countsByType = useMemo(() => {
    const out: Record<ReportType, number> = { pre_partido: 0, post_partido: 0, info_sede: 0, otros: 0 }
    for (const r of reports) out[r.report_type]++
    return out
  }, [reports])

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setTypeFilter('all')}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
              typeFilter === 'all' ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft'
            }`}
          >
            Todos ({reports.length})
          </button>
          {REPORT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                typeFilter === t ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft'
              }`}
            >
              {REPORT_TYPE_META[t].label} ({countsByType[t]})
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {REPORT_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setModal({ reportType: t, editing: null })}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-paper-raised px-3 py-2 text-xs font-bold text-ink hover:border-ink-soft"
          >
            + {REPORT_TYPE_META[t].label}
          </button>
        ))}
      </div>

      {visibleReports.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line py-16 text-center text-sm text-ink-soft">
          {reports.length === 0
            ? 'Aún no has creado informes. Usa uno de los botones de arriba para tu primer pre partido, post partido, info de sede, etc. — puedes enlazar el PDF o Artifact ya generado en Claude Code.'
            : 'Nada que coincida con este filtro.'}
        </div>
      )}
      <div className="flex flex-col gap-3">
        {visibleReports.map((r) => (
          <div key={r.id} className="rounded-2xl border border-line bg-paper-raised p-4 shadow-sm hover:border-ink-soft">
            <button type="button" onClick={() => setModal({ reportType: r.report_type, editing: r })} className="w-full text-left">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-bold text-ink">{r.title}</p>
                <span className="text-xs font-semibold text-ink-soft">{humanDate(r.date)}</span>
              </div>
              <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-accent">
                {REPORT_TYPE_META[r.report_type].label}
                {r.category && ` · ${r.category}`}
              </p>
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

      {modal && <ReportModal state={modal} userId={userId} onClose={() => setModal(null)} onSaved={onChanged} />}
    </div>
  )
}
