import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { CalendarEvent, EventKind, Report } from '@/lib/database.types'
import { CATEGORIES } from '@/lib/categories'
import { buildICS, downloadICS, slugify } from '@/lib/calendarExport'
import { EVENT_KINDS, KIND_META as LABELS } from '@/lib/kindMeta'
import { parseCronogramaPdf } from '@/lib/parseCronograma'
import { parseCronogramaImage } from '@/lib/parseCronogramaImage'
import DayView from '@/components/DayView'
import ControlPanel from '@/components/ControlPanel'
import Informes from '@/components/Informes'
import { PRESET_LOCATIONS } from '@/lib/locations'
import { MATCH_TYPES, MATCH_TYPE_META, type MatchType } from '@/lib/matchTypes'

const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const KIND_META: Record<EventKind, { dot: string; text: string; border: string; chipBg: string }> = {
  entrenamiento: { dot: 'bg-entrenamiento', text: 'text-entrenamiento', border: 'border-l-entrenamiento', chipBg: 'bg-entrenamiento-soft' },
  charla_tecnica: { dot: 'bg-charla', text: 'text-charla', border: 'border-l-charla', chipBg: 'bg-charla-soft' },
  tmi: { dot: 'bg-tmi', text: 'text-tmi', border: 'border-l-tmi', chipBg: 'bg-tmi-soft' },
  partido: { dot: 'bg-partido', text: 'text-partido', border: 'border-l-partido', chipBg: 'bg-partido-soft' },
  viaje: { dot: 'bg-viaje', text: 'text-viaje', border: 'border-l-viaje', chipBg: 'bg-viaje-soft' },
  otros: { dot: 'bg-otros', text: 'text-otros', border: 'border-l-otros', chipBg: 'bg-otros-soft' },
}

function todayISO() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function humanDay(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  const t = new Date(todayISO() + 'T00:00:00')
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000)
  const full = capital(d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }))
  if (diff === 0) return `Hoy · ${full}`
  if (diff === 1) return `Mañana · ${full}`
  return full
}

interface ModalState {
  kind: EventKind
  editing: CalendarEvent | null
}

const MC_TITLE_RE = /^MC(\d+)-S(\d+)$/i
const MC_PREFIX_RE = /^MC(\d+)-S(\d+)\s*-\s*/i

/**
 * Último entrenamiento con MC/S válido cuya fecha es `date` o anterior (partidos y otros
 * días sin entrenamiento no cuentan ni cortan la secuencia). Incluir el mismo día permite que
 * un segundo turno de entreno el mismo día siga la sesión del primero, en vez de repetirla.
 */
function findMicrocicloUpTo(events: CalendarEvent[], date: string): { mc: string; s: number } | null {
  let latest: { mc: string; s: number; date: string } | null = null
  for (const e of events) {
    if (e.kind !== 'entrenamiento') continue
    if (e.date > date) continue
    const m = e.title.match(MC_TITLE_RE)
    if (!m) continue
    const s = Number(m[2])
    if (!latest || e.date > latest.date || (e.date === latest.date && s > latest.s)) {
      latest = { mc: m[1], s, date: e.date }
    }
  }
  return latest ? { mc: latest.mc, s: latest.s } : null
}

/** MC/S para un Entrenamiento nuevo en `date`: sesión siguiente a la del último entrenamiento hasta esa fecha (mismo día incluido, para dos turnos). */
function findMcSForNewEntreno(events: CalendarEvent[], date: string): { mc: string; s: number } | null {
  const upTo = findMicrocicloUpTo(events, date)
  return upTo ? { mc: upTo.mc, s: upTo.s + 1 } : null
}

/** MC/S para un TMI nuevo en `date`: la sesión más alta del entrenamiento de ese día si existe (por si hay 2 turnos), si no el que le tocaría a un entrenamiento nuevo ese día. */
function findMcSForDate(events: CalendarEvent[], date: string): { mc: string; s: number } | null {
  let sameDayBest: { mc: string; s: number } | null = null
  for (const e of events) {
    if (e.kind !== 'entrenamiento' || e.date !== date) continue
    const m = e.title.match(MC_TITLE_RE)
    if (!m) continue
    const s = Number(m[2])
    if (!sameDayBest || s > sameDayBest.s) sameDayBest = { mc: m[1], s }
  }
  if (sameDayBest) return sameDayBest
  return findMcSForNewEntreno(events, date)
}

async function uploadTmiFile(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'bin'
  const path = `${userId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('tmi-media').upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from('tmi-media').getPublicUrl(path)
  return data.publicUrl
}

function EventModal({
  state,
  userId,
  defaultDate,
  events,
  onClose,
  onSaved,
}: {
  state: ModalState
  userId: string
  defaultDate: string | null
  events: CalendarEvent[]
  onClose: () => void
  onSaved: () => void
}) {
  const ev = state.editing
  const isViaje = state.kind === 'viaje'
  const isPartido = state.kind === 'partido'
  const isTmi = state.kind === 'tmi'
  const isEntreno = state.kind === 'entrenamiento'
  const isAllDay = isViaje

  const [title, setTitle] = useState(ev?.title ?? '')
  const tmiTitleAfterMcS = ev && isTmi ? ev.title.replace(MC_PREFIX_RE, '') : ''
  const tmiRestOfTitle = tmiTitleAfterMcS.replace(/^\s*(ofensivo|defensivo)\s*:?\s*/i, '')
  const [momento, setMomento] = useState<'Ofensivo' | 'Defensivo'>(() =>
    ev && isTmi && /^\s*defensivo\b/i.test(tmiTitleAfterMcS) ? 'Defensivo' : 'Ofensivo',
  )
  const [posicion, setPosicion] = useState(() => (tmiRestOfTitle.split(':')[0]?.trim() ?? ''))
  const [objetivo, setObjetivo] = useState(() => {
    const idx = tmiRestOfTitle.indexOf(':')
    return idx >= 0 ? tmiRestOfTitle.slice(idx + 1).trim() : ''
  })
  const needsMcS = isEntreno || isTmi
  const [date, setDate] = useState(ev?.date ?? defaultDate ?? todayISO())
  const [mc, setMc] = useState(() => {
    if (!needsMcS) return ''
    if (isEntreno) {
      const m = ev?.title.match(MC_TITLE_RE)
      if (m) return m[1]
      return findMcSForNewEntreno(events, date)?.mc ?? ''
    }
    const m = ev?.title.match(MC_PREFIX_RE)
    if (m) return m[1]
    return findMcSForDate(events, date)?.mc ?? ''
  })
  const [sesion, setSesion] = useState(() => {
    if (!needsMcS) return ''
    if (isEntreno) {
      const m = ev?.title.match(MC_TITLE_RE)
      if (m) return m[2]
      return String(findMcSForNewEntreno(events, date)?.s ?? 1)
    }
    const m = ev?.title.match(MC_PREFIX_RE)
    if (m) return m[2]
    return String(findMcSForDate(events, date)?.s ?? 1)
  })

  const mcsTouched = useRef(false)
  useEffect(() => {
    if (ev || !needsMcS || mcsTouched.current) return
    const found = isEntreno ? findMcSForNewEntreno(events, date) : findMcSForDate(events, date)
    setMc(found?.mc ?? '')
    setSesion(String(found?.s ?? 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const [category, setCategory] = useState(ev?.category ?? '')
  const [endDate, setEndDate] = useState(ev?.end_date ?? '')
  const [startTime, setStartTime] = useState(ev?.start_time?.slice(0, 5) ?? (isAllDay ? '' : '18:00'))
  const [endTime] = useState(ev?.end_time?.slice(0, 5) ?? '')
  const [locationChoice, setLocationChoice] = useState<(typeof PRESET_LOCATIONS)[number] | 'otro'>(() => {
    if (!ev?.location) return 'Sulantay'
    return (PRESET_LOCATIONS as readonly string[]).includes(ev.location) ? (ev.location as (typeof PRESET_LOCATIONS)[number]) : 'otro'
  })
  const [locationCustom, setLocationCustom] = useState(() =>
    ev?.location && !(PRESET_LOCATIONS as readonly string[]).includes(ev.location) ? ev.location : '',
  )
  const [attending, setAttending] = useState(ev?.attending ?? true)
  const [matchType, setMatchType] = useState<MatchType>(ev?.match_type ?? 'amistoso')
  const [competitionName, setCompetitionName] = useState(ev?.competition_name ?? '')
  const [notes, setNotes] = useState(ev?.notes ?? '')
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [fichaFile, setFichaFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState(ev?.video_url ?? null)
  const [fichaUrl, setFichaUrl] = useState(ev?.ficha_url ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    let finalVideoUrl = videoUrl
    let finalFichaUrl = fichaUrl
    try {
      if (videoFile) finalVideoUrl = await uploadTmiFile(userId, videoFile)
      if (fichaFile) finalFichaUrl = await uploadTmiFile(userId, fichaFile)
    } catch (err) {
      setSaving(false)
      setError(err instanceof Error ? err.message : 'No se pudo subir el archivo.')
      return
    }
    const finalTitle = isTmi
      ? `MC${mc.trim()}-S${sesion.trim()} - ${[momento, ...[posicion.trim(), objetivo.trim()].filter(Boolean)].join(': ')}`
      : isEntreno
        ? `MC${mc.trim()}-S${sesion.trim()}`
        : title.trim() || (isViaje ? 'Viaje sin título' : 'Evento sin título')
    const finalLocation = locationChoice === 'otro' ? locationCustom.trim() : locationChoice
    const payload = {
      user_id: userId,
      kind: state.kind,
      title: finalTitle,
      category: category || null,
      date,
      end_date: isAllDay ? endDate || date : null,
      start_time: isAllDay ? null : startTime || null,
      end_time: isAllDay ? null : endTime || null,
      location: finalLocation || null,
      attending: isViaje ? true : attending,
      match_type: isPartido ? matchType : null,
      competition_name: isPartido && matchType === 'competicion_oficial' ? competitionName.trim() || null : null,
      video_url: isTmi ? finalVideoUrl : null,
      ficha_url: isTmi ? finalFichaUrl : null,
      notes: notes.trim() || null,
    }
    const { error: saveError } = ev
      ? await supabase.from('events').update(payload).eq('id', ev.id)
      : await supabase.from('events').insert(payload)
    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    onSaved()
    onClose()
  }

  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function handleDelete() {
    if (!ev) return
    setSaving(true)
    const { error: deleteError } = await supabase.from('events').delete().eq('id', ev.id)
    setSaving(false)
    if (deleteError) {
      setError(deleteError.message)
      setConfirmingDelete(false)
      return
    }
    onSaved()
    onClose()
  }

  const meta = KIND_META[state.kind]

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 py-10" onClick={onClose}>
      <div className="mx-auto w-full max-w-md rounded-2xl border border-line bg-paper-raised p-5 shadow-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className={`font-display text-xs font-bold uppercase tracking-widest ${meta.text}`}>
            {ev ? 'Editar' : 'Nuevo'} {LABELS[state.kind].label.toLowerCase()}
          </h2>
          <button type="button" onClick={onClose} className="rounded-md px-1.5 py-0.5 text-ink-soft hover:bg-line">
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {isTmi ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
                  Microciclo
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-ink-soft">MC</span>
                    <input
                      value={mc}
                      onChange={(e) => {
                      mcsTouched.current = true
                      setMc(e.target.value)
                    }}
                      placeholder="13"
                      inputMode="numeric"
                      required
                      className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                    />
                  </div>
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
                  Sesión
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-ink-soft">S</span>
                    <input
                      value={sesion}
                      onChange={(e) => {
                      mcsTouched.current = true
                      setSesion(e.target.value)
                    }}
                      placeholder="2"
                      inputMode="numeric"
                      required
                      className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                    />
                  </div>
                </label>
              </div>
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
                Momento
                <select
                  value={momento}
                  onChange={(e) => setMomento(e.target.value as 'Ofensivo' | 'Defensivo')}
                  className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                >
                  <option value="Ofensivo">Ofensivo</option>
                  <option value="Defensivo">Defensivo</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
                  Posición
                  <input
                    value={posicion}
                    onChange={(e) => setPosicion(e.target.value)}
                    placeholder="p. ej. Volantes"
                    className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
                  Objetivo
                  <input
                    value={objetivo}
                    onChange={(e) => setObjetivo(e.target.value)}
                    placeholder="p. ej. Definición"
                    className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
                Video del ejercicio
                {videoUrl && !videoFile && (
                  <div className="flex items-center gap-2 text-xs">
                    <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-accent hover:underline">
                      Ver video actual →
                    </a>
                    <button type="button" onClick={() => setVideoUrl(null)} className="text-ink-soft hover:underline">
                      Quitar
                    </button>
                  </div>
                )}
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
                  className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none file:mr-2 file:rounded-md file:border-0 file:bg-line file:px-2 file:py-1 file:text-xs file:font-bold focus:border-accent"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
                Ficha del ejercicio (PDF o imagen)
                {fichaUrl && !fichaFile && (
                  <div className="flex items-center gap-2 text-xs">
                    <a href={fichaUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-accent hover:underline">
                      Ver ficha actual →
                    </a>
                    <button type="button" onClick={() => setFichaUrl(null)} className="text-ink-soft hover:underline">
                      Quitar
                    </button>
                  </div>
                )}
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setFichaFile(e.target.files?.[0] ?? null)}
                  className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink outline-none file:mr-2 file:rounded-md file:border-0 file:bg-line file:px-2 file:py-1 file:text-xs file:font-bold focus:border-accent"
                />
              </label>
            </div>
          ) : isEntreno ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
                Microciclo
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-ink-soft">MC</span>
                  <input
                    value={mc}
                    onChange={(e) => {
                      mcsTouched.current = true
                      setMc(e.target.value)
                    }}
                    placeholder="13"
                    inputMode="numeric"
                    required
                    className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                  />
                </div>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
                Sesión
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-ink-soft">S</span>
                  <input
                    value={sesion}
                    onChange={(e) => {
                      mcsTouched.current = true
                      setSesion(e.target.value)
                    }}
                    placeholder="2"
                    inputMode="numeric"
                    required
                    className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                  />
                </div>
              </label>
            </div>
          ) : (
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
              {isViaje ? 'Título' : 'Título / rival'}
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isViaje ? 'p. ej. Gira Regional Sub-16' : state.kind === 'partido' ? 'p. ej. vs. Universidad de Chile' : 'Título'}
                className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
            </label>
          )}

          {isAllDay ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
                Fecha inicio
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
                Fecha fin
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                />
              </label>
            </div>
          ) : (
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
                Hora
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                />
              </label>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
              {isViaje ? 'Destino' : 'Lugar'}
              <select
                value={locationChoice}
                onChange={(e) => setLocationChoice(e.target.value as typeof locationChoice)}
                className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              >
                {PRESET_LOCATIONS.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
                <option value="otro">Otro (especificar)</option>
              </select>
            </label>
            {locationChoice === 'otro' && (
              <input
                value={locationCustom}
                onChange={(e) => setLocationCustom(e.target.value)}
                placeholder="Escribe el lugar"
                className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
            )}
          </div>

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

          {isPartido && (
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
              Tipo de partido
              <select
                value={matchType}
                onChange={(e) => setMatchType(e.target.value as MatchType)}
                className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              >
                {MATCH_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {MATCH_TYPE_META[t].label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {isPartido && matchType === 'competicion_oficial' && (
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
              Especificar competencia
              <input
                value={competitionName}
                onChange={(e) => setCompetitionName(e.target.value)}
                placeholder="p. ej. Sudamericano, Mundial"
                className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
            </label>
          )}

          {!isViaje && (
            <div className="flex flex-col gap-1.5 text-xs font-semibold text-ink-soft">
              ¿Vas a asistir?
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAttending(true)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold ${attending ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-soft'}`}
                >
                  Sí, asisto
                </button>
                <button
                  type="button"
                  onClick={() => setAttending(false)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold ${!attending ? 'border-ink-soft bg-line text-ink' : 'border-line text-ink-soft'}`}
                >
                  No asisto
                </button>
              </div>
            </div>
          )}

          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
            Notas
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </label>

          {error && <p className="text-xs font-semibold text-partido">{error}</p>}

          <div className="mt-2 flex items-center justify-between">
            {ev ? (
              confirmingDelete ? (
                <div className="flex items-center gap-2 text-xs font-bold">
                  <span className="text-ink-soft">¿Eliminar?</span>
                  <button type="button" onClick={handleDelete} disabled={saving} className="text-partido hover:underline disabled:opacity-60">
                    {saving ? 'Eliminando…' : 'Sí, eliminar'}
                  </button>
                  <button type="button" onClick={() => setConfirmingDelete(false)} className="text-ink-soft hover:underline">
                    Cancelar
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmingDelete(true)} className="text-xs font-bold text-partido hover:underline">
                  Eliminar
                </button>
              )
            ) : (
              <span />
            )}
            <button type="submit" disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white disabled:opacity-60">
              {saving ? 'Guardando…' : ev ? 'Guardar cambios' : 'Añadir'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PasswordModal({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) setError(error.message)
    else setDone(true)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 py-10" onClick={onClose}>
      <div className="mx-auto w-full max-w-sm rounded-2xl border border-line bg-paper-raised p-5 shadow-2xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-ink">Configurar contraseña</h2>
          <button type="button" onClick={onClose} className="rounded-md px-1.5 py-0.5 text-ink-soft hover:bg-line">
            ✕
          </button>
        </div>
        {done ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-soft">
              Listo. Ahora puedes entrar directo con tu correo y esta contraseña, en cualquier navegador, sin pasar por
              el correo.
            </p>
            <button type="button" onClick={onClose} className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white">
              Cerrar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
              Nueva contraseña
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink-soft">
              Repetir contraseña
              <input
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
            </label>
            {error && <p className="text-xs font-semibold text-partido">{error}</p>}
            <button type="submit" disabled={saving} className="mt-1 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white disabled:opacity-60">
              {saving ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function CalendarApp({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filterKind, setFilterKind] = useState<'all' | EventKind>('all')
  const [onlyAttending, setOnlyAttending] = useState(true)
  const [showPast, setShowPast] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [modal, setModal] = useState<ModalState | null>(null)
  const [dayViewDate, setDayViewDate] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [tab, setTab] = useState<'control' | 'agenda' | 'informes'>('agenda')
  const [reports, setReports] = useState<Report[]>([])

  const [itineraryDates, setItineraryDates] = useState<Set<string>>(new Set())

  async function loadEvents() {
    setLoading(true)
    const { data } = await supabase.from('events').select('*').order('date', { ascending: true })
    setEvents((data as CalendarEvent[]) ?? [])
    setLoading(false)
  }

  async function loadItineraryDates() {
    const { data } = await supabase.from('itinerary_items').select('day_date')
    setItineraryDates(new Set((data ?? []).map((r) => r.day_date as string)))
  }

  async function loadReports() {
    const { data } = await supabase.from('reports').select('*').order('date', { ascending: false })
    setReports((data as Report[]) ?? [])
  }

  useEffect(() => {
    loadEvents()
    loadItineraryDates()
    loadReports()
  }, [])

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    setImportError(null)
    try {
      let rows: {
        user_id: string
        import_label: string | null
        category: string | null
        day_date: string
        start_time: string
        label: string
        location: string | null
        kind: EventKind | null
      }[]
      let firstDate: string

      if (file.type === 'application/pdf') {
        const parsed = await parseCronogramaPdf(file)
        rows = parsed.days.flatMap((day) =>
          day.items.map((item) => ({
            user_id: userId,
            import_label: parsed.title,
            category: parsed.category,
            day_date: day.date,
            start_time: item.time + ':00',
            label: item.label,
            location: null,
            kind: item.kind,
          })),
        )
        firstDate = parsed.days[0]?.date
      } else {
        const parsed = await parseCronogramaImage(file)
        rows = parsed.items.map((item) => ({
          user_id: userId,
          import_label: null,
          category: null,
          day_date: parsed.date,
          start_time: item.time + ':00',
          label: item.label,
          location: item.location,
          kind: item.kind,
        }))
        firstDate = parsed.date
      }

      if (rows.length === 0) throw new Error('No se encontraron actividades en el archivo.')

      // Re-importing the same schedule should converge to the same state, not
      // pile up duplicates: clear out this user's not-yet-added rows for the
      // dates being (re)imported first. Rows already added to the calendar
      // (added_event_id set) are left alone — the real event stays put either way.
      const dates = [...new Set(rows.map((r) => r.day_date))]
      const { error: deleteError } = await supabase
        .from('itinerary_items')
        .delete()
        .eq('user_id', userId)
        .in('day_date', dates)
        .is('added_event_id', null)
      if (deleteError) throw deleteError

      const { error } = await supabase.from('itinerary_items').insert(rows)
      if (error) throw error
      await loadItineraryDates()
      setDayViewDate(firstDate)
    } catch (err) {
      const message = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String(err.message) : null
      setImportError(message || 'No se pudo leer el archivo.')
    } finally {
      setImporting(false)
    }
  }

  const today = todayISO()

  const visible = useMemo(() => {
    return events
      .filter((ev) => {
        if (filterKind !== 'all' && ev.kind !== filterKind) return false
        if (onlyAttending && !ev.attending) return false
        if (selectedDate) {
          const inRange = selectedDate >= ev.date && selectedDate <= (ev.end_date ?? ev.date)
          if (!inRange) return false
        } else if (!showPast) {
          const lastDay = ev.end_date ?? ev.date
          if (lastDay < today) return false
        }
        return true
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1
        const ta = a.start_time ?? '00:00'
        const tb = b.start_time ?? '00:00'
        return ta < tb ? -1 : ta > tb ? 1 : 0
      })
  }, [events, filterKind, onlyAttending, selectedDate, showPast, today])

  const byDate = useMemo(() => {
    const map: Record<string, EventKind[]> = {}
    for (const ev of events) {
      if (onlyAttending && !ev.attending) continue
      let d = ev.date
      const end = ev.end_date ?? ev.date
      while (d <= end) {
        if (!map[d]) map[d] = []
        if (!map[d].includes(ev.kind)) map[d].push(ev.kind)
        d = addDaysISO(d, 1)
      }
    }
    return map
  }, [events, onlyAttending])

  const groups = useMemo(() => {
    const out: { date: string; items: CalendarEvent[] }[] = []
    for (const ev of visible) {
      const last = out[out.length - 1]
      if (last && last.date === ev.date) last.items.push(ev)
      else out.push({ date: ev.date, items: [ev] })
    }
    return out
  }, [visible])

  const y = viewMonth.getFullYear()
  const m = viewMonth.getMonth()
  const first = new Date(y, m, 1)
  const startOffset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(y, m + 1, 0).getDate()

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-display text-[11px] font-bold uppercase tracking-widest text-ink-soft">Panel de trabajo</p>
          <h1 className="font-display text-2xl font-extrabold text-ink">
            {tab === 'control' ? 'Control de actividades' : tab === 'agenda' ? 'Entrenamientos, partidos y viajes' : 'Informes'}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setPasswordModalOpen(true)}
            className="text-xs font-semibold text-ink-soft hover:text-ink"
          >
            Configurar contraseña
          </button>
          <button type="button" onClick={() => supabase.auth.signOut()} className="text-xs font-semibold text-ink-soft hover:text-ink">
            Cerrar sesión ({userEmail})
          </button>
        </div>
      </header>

      <div className="mb-6 flex gap-1 border-b border-line">
        {(
          [
            ['control', 'Control de Actividades'],
            ['agenda', 'Agenda'],
            ['informes', 'Informes'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 font-display text-xs font-bold uppercase tracking-widest ${
              tab === key ? 'border-accent text-ink' : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'control' && <ControlPanel events={events} reports={reports} />}
      {tab === 'informes' && <Informes userId={userId} reports={reports} onChanged={loadReports} />}
      {tab === 'agenda' && (
        <>
      <div className="mb-2 flex flex-wrap gap-2">
        {EVENT_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setModal({ kind: k, editing: null })}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-paper-raised px-3 py-2 text-xs font-bold text-ink hover:border-ink-soft"
          >
            <span className={`h-2 w-2 rounded-full ${KIND_META[k].dot}`} />+ {LABELS[k].label}
          </button>
        ))}
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-line bg-paper-raised px-3 py-2 text-xs font-bold text-ink-soft hover:border-accent">
          ⭱ {importing ? 'Importando…' : 'Importar cronograma (PDF o foto)'}
          <input type="file" accept="application/pdf,image/*" className="hidden" disabled={importing} onChange={handleImportFile} />
        </label>
      </div>
      {importError && <p className="mb-4 text-xs font-semibold text-partido">{importError}</p>}
      <div className="mb-6" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-line bg-paper-raised p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <button type="button" onClick={() => setViewMonth(new Date(y, m - 1, 1))} className="rounded-md border border-line px-2 py-0.5 text-ink-soft">
                ‹
              </button>
              <span className="font-display text-xs font-bold uppercase tracking-wide text-ink">
                {capital(viewMonth.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }))}
              </span>
              <button type="button" onClick={() => setViewMonth(new Date(y, m + 1, 1))} className="rounded-md border border-line px-2 py-0.5 text-ink-soft">
                ›
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {DOW.map((d) => (
                <div key={d} className="text-[10px] font-bold uppercase text-ink-soft">
                  {d}
                </div>
              ))}
              {Array.from({ length: startOffset }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const iso = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0')
                const kinds = byDate[iso] ?? []
                const isToday = iso === today
                const isSelected = iso === selectedDate
                const hasItinerary = itineraryDates.has(iso)
                return (
                  <button
                    type="button"
                    key={iso}
                    onClick={() => setSelectedDate(selectedDate === iso ? null : iso)}
                    title={hasItinerary ? 'Tiene planilla importada' : undefined}
                    className={`relative rounded-lg py-1.5 text-[12px] font-medium text-ink hover:bg-line ${isToday ? 'ring-1 ring-accent' : ''} ${isSelected ? 'bg-line' : ''}`}
                  >
                    {day}
                    {hasItinerary && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full border border-ink-soft" />}
                    {kinds.length > 0 && (
                      <span className="absolute bottom-0.5 left-1/2 flex -translate-x-1/2 gap-0.5">
                        {kinds.map((k) => (
                          <span key={k} className={`h-1 w-1 rounded-full ${KIND_META[k].dot}`} />
                        ))}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-line bg-paper-raised p-4 shadow-sm">
            <span className="font-display text-[11px] font-bold uppercase tracking-widest text-ink-soft">Filtrar</span>
            <div className="flex flex-wrap gap-1.5">
              {(['all', ...EVENT_KINDS] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFilterKind(k)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                    filterKind === k ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft'
                  }`}
                >
                  {k === 'all' ? 'Todos' : LABELS[k].plural}
                </button>
              ))}
            </div>
            <label className="mt-1 flex items-center gap-2 text-xs text-ink-soft">
              <input type="checkbox" checked={onlyAttending} onChange={(e) => setOnlyAttending(e.target.checked)} />
              Solo a los que asisto
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-soft">
              <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} disabled={!!selectedDate} />
              Ver eventos pasados
            </label>
          </div>

          <button
            type="button"
            onClick={() => visible.length > 0 && downloadICS('calendario.ics', buildICS(visible))}
            disabled={visible.length === 0}
            className="rounded-2xl border border-line bg-paper-raised px-4 py-3 text-xs font-bold text-ink-soft shadow-sm disabled:opacity-50"
          >
            ⭳ Exportar vista (.ics)
          </button>
          <p className="px-1 text-[11px] leading-relaxed text-ink-soft">
            En iPhone/Mac: abre el archivo descargado y elige "Añadir a Calendario". Se exportan los eventos que ves en la lista.
          </p>
        </div>

        <div>
          {loading && <p className="text-sm text-ink-soft">Cargando…</p>}
          {!loading && selectedDate && (
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setSelectedDate(null)} className="text-xs font-bold text-accent hover:underline">
                ← Ver toda la agenda
              </button>
              <button type="button" onClick={() => setDayViewDate(selectedDate)} className="text-xs font-bold text-ink-soft hover:underline">
                Ver planilla del día →
              </button>
            </div>
          )}
          {!loading && groups.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line py-16 text-center text-sm text-ink-soft">
              {events.length === 0 ? 'Aún no hay entrenamientos, partidos ni viajes agendados.' : 'Nada que coincida con este filtro.'}
            </div>
          )}
          {groups.map((g) => (
            <div key={g.date} className="mb-5">
              <h2 className="mb-2 font-display text-xs font-bold uppercase tracking-widest text-ink-soft">{humanDay(g.date)}</h2>
              <div className="flex flex-col gap-2">
                {g.items.map((ev) => {
                  const meta = KIND_META[ev.kind]
                  const timeLabel = !ev.start_time
                    ? ev.end_date && ev.end_date !== ev.date
                      ? `${new Date(ev.date + 'T00:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })} – ${new Date(ev.end_date + 'T00:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}`
                      : 'Todo el día'
                    : ev.start_time.slice(0, 5)
                  return (
                    <div
                      key={ev.id}
                      className={`flex gap-3 rounded-xl border border-line border-l-4 bg-paper-raised p-3 shadow-sm ${meta.border} ${!ev.attending ? 'opacity-60' : ''}`}
                    >
                      <div className="w-16 shrink-0 pt-0.5 text-xs font-semibold text-ink-soft">{timeLabel}</div>
                      <div className="min-w-0 flex-1">
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${meta.text}`}>
                          {LABELS[ev.kind].label}
                          {ev.match_type && ` · ${MATCH_TYPE_META[ev.match_type].label}`}
                          {ev.competition_name && ` (${ev.competition_name})`}
                          {!ev.attending && ' · no asisto'}
                        </span>
                        <p className="truncate text-sm font-bold text-ink">{ev.title}</p>
                        {(ev.location || ev.category) && (
                          <p className="text-xs text-ink-soft">{[ev.location, ev.category].filter(Boolean).join(' · ')}</p>
                        )}
                        <div className="mt-1.5 flex gap-3 text-[11px] font-bold">
                          <button type="button" onClick={() => setModal({ kind: ev.kind, editing: ev })} className="text-ink-soft hover:underline">
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadICS(`${slugify(ev.title)}.ics`, buildICS([ev]))}
                            className="text-ink-soft hover:underline"
                          >
                            Exportar .ics
                          </button>
                          {ev.video_url && (
                            <a href={ev.video_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                              🎥 Video
                            </a>
                          )}
                          {ev.ficha_url && (
                            <a href={ev.ficha_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                              📄 Ficha
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
        </>
      )}

      {modal && (
        <EventModal
          state={modal}
          userId={userId}
          defaultDate={selectedDate}
          events={events}
          onClose={() => setModal(null)}
          onSaved={loadEvents}
        />
      )}
      {dayViewDate && (
        <DayView
          date={dayViewDate}
          userId={userId}
          onClose={() => {
            setDayViewDate(null)
            loadItineraryDates()
          }}
          onEventAdded={loadEvents}
          onNavigate={setDayViewDate}
        />
      )}
      {passwordModalOpen && <PasswordModal onClose={() => setPasswordModalOpen(false)} />}
    </div>
  )
}
