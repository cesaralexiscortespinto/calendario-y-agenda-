import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { EventKind, ItineraryItem } from '@/lib/database.types'
import { EVENT_KINDS, KIND_META } from '@/lib/kindMeta'
import { PRESET_LOCATIONS } from '@/lib/locations'

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function EditableRow({ item, onSaved, onCancel }: { item: ItineraryItem; onSaved: () => void; onCancel: () => void }) {
  const [time, setTime] = useState(item.start_time.slice(0, 5))
  const [label, setLabel] = useState(item.label)
  const [locationChoice, setLocationChoice] = useState<(typeof PRESET_LOCATIONS)[number] | 'otro'>(() => {
    if (!item.location) return 'Sulantay'
    return (PRESET_LOCATIONS as readonly string[]).includes(item.location)
      ? (item.location as (typeof PRESET_LOCATIONS)[number])
      : 'otro'
  })
  const [locationCustom, setLocationCustom] = useState(() =>
    item.location && !(PRESET_LOCATIONS as readonly string[]).includes(item.location) ? item.location : '',
  )
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const finalLocation = locationChoice === 'otro' ? locationCustom.trim() : locationChoice
    await supabase
      .from('itinerary_items')
      .update({ start_time: time + ':00', label: label.trim() || item.label, location: finalLocation || null })
      .eq('id', item.id)
    setSaving(false)
    onSaved()
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-paper p-2">
      <input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="w-24 rounded-md border border-line bg-paper-raised px-1.5 py-1 text-xs text-ink"
      />
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="min-w-0 flex-1 rounded-md border border-line bg-paper-raised px-1.5 py-1 text-xs text-ink"
      />
      <select
        value={locationChoice}
        onChange={(e) => setLocationChoice(e.target.value as typeof locationChoice)}
        className="min-w-0 flex-1 rounded-md border border-line bg-paper-raised px-1.5 py-1 text-xs text-ink"
      >
        {PRESET_LOCATIONS.map((loc) => (
          <option key={loc} value={loc}>
            {loc}
          </option>
        ))}
        <option value="otro">Otro</option>
      </select>
      {locationChoice === 'otro' && (
        <input
          value={locationCustom}
          onChange={(e) => setLocationCustom(e.target.value)}
          placeholder="Lugar"
          className="min-w-0 flex-1 rounded-md border border-line bg-paper-raised px-1.5 py-1 text-xs text-ink"
        />
      )}
      <button type="button" onClick={onCancel} className="text-[10px] font-bold text-ink-soft hover:underline">
        Cancelar
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="rounded-md bg-accent px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
      >
        {saving ? '…' : 'Guardar'}
      </button>
    </div>
  )
}

interface Draft {
  title: string
  kind: EventKind
}

function BulkAddModal({
  items,
  userId,
  onClose,
  onDone,
}: {
  items: ItineraryItem[]
  userId: string
  onClose: () => void
  onDone: () => void
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(items.map((it) => [it.id, { title: it.label, kind: it.kind ?? 'otros' }])),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  async function handleConfirm() {
    setSaving(true)
    setError(null)
    const payload = items.map((it) => ({
      user_id: userId,
      kind: drafts[it.id].kind,
      title: drafts[it.id].title.trim() || it.label,
      category: it.category,
      date: it.day_date,
      end_date: null,
      start_time: it.start_time,
      end_time: null,
      location: it.location,
      attending: true,
      notes: null,
    }))
    const { data, error } = await supabase.from('events').insert(payload).select()
    if (error || !data) {
      setError(error?.message ?? 'No se pudieron crear los eventos.')
      setSaving(false)
      return
    }
    await Promise.all(
      items.map((it, i) => supabase.from('itinerary_items').update({ added_event_id: data[i].id }).eq('id', it.id)),
    )
    setSaving(false)
    onDone()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/50 p-4 py-10" onClick={onClose}>
      <div
        className="mx-auto w-full max-w-lg rounded-2xl border border-line bg-paper-raised p-5 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-ink">
            Agregar {items.length} al calendario
          </h2>
          <button type="button" onClick={onClose} className="rounded-md px-1.5 py-0.5 text-ink-soft hover:bg-line">
            ✕
          </button>
        </div>

        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
          {items.map((it) => {
            const draft = drafts[it.id]
            return (
              <div key={it.id} className="rounded-lg border border-line p-2.5">
                <div className="mb-2 flex items-center gap-2">
                  <span className="w-12 shrink-0 font-mono text-xs font-semibold text-ink-soft">{it.start_time.slice(0, 5)}</span>
                  <input
                    value={draft.title}
                    onChange={(e) => updateDraft(it.id, { title: e.target.value })}
                    className="min-w-0 flex-1 rounded-md border border-line bg-paper px-2 py-1 text-xs font-bold text-ink"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {EVENT_KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => updateDraft(it.id, { kind: k })}
                      className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold"
                      style={{
                        borderColor: draft.kind === k ? `var(${KIND_META[k].colorVar})` : 'var(--color-line)',
                        color: draft.kind === k ? `var(${KIND_META[k].colorVar})` : 'var(--color-ink-soft)',
                        backgroundColor: draft.kind === k ? `var(${KIND_META[k].softVar})` : 'transparent',
                      }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `var(${KIND_META[k].colorVar})` }} />
                      {KIND_META[k].label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {error && <p className="mt-3 text-xs font-semibold text-partido">{error}</p>}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
          >
            {saving ? 'Creando…' : `Crear ${items.length} eventos`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DayView({
  date,
  userId,
  onClose,
  onEventAdded,
  onNavigate,
}: {
  date: string
  userId: string
  onClose: () => void
  onEventAdded: () => void
  onNavigate: (date: string) => void
}) {
  const [items, setItems] = useState<ItineraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('itinerary_items')
      .select('*')
      .eq('day_date', date)
      .order('start_time', { ascending: true })
    setItems((data as ItineraryItem[]) ?? [])
    setSelected(new Set())
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  async function handleAdd(item: ItineraryItem) {
    setAddingId(item.id)
    const kind = item.kind ?? 'otros'
    const { data, error } = await supabase
      .from('events')
      .insert({
        user_id: userId,
        kind,
        title: item.label,
        category: item.category,
        date: item.day_date,
        end_date: null,
        start_time: item.start_time,
        end_time: null,
        location: item.location,
        attending: true,
        notes: null,
      })
      .select()
      .single()
    if (!error && data) {
      await supabase.from('itinerary_items').update({ added_event_id: data.id }).eq('id', item.id)
      onEventAdded()
      await load()
    }
    setAddingId(null)
  }

  async function handleDelete(item: ItineraryItem) {
    await supabase.from('itinerary_items').delete().eq('id', item.id)
    setConfirmDeleteId(null)
    await load()
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const pending = items.filter((it) => !it.added_event_id)
  const allSelected = pending.length > 0 && pending.every((it) => selected.has(it.id))

  const heading = capital(new Date(date + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }))
  const importLabel = items[0]?.import_label
  const selectedItems = items.filter((it) => selected.has(it.id))

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 py-10" onClick={onClose}>
      <div
        className="mx-auto w-full max-w-lg rounded-2xl border border-line bg-paper-raised p-5 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="font-display text-[11px] font-bold uppercase tracking-widest text-ink-soft">
              {importLabel ?? 'Planilla del día'}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate(addDaysISO(date, -1))}
                className="rounded-md border border-line px-1.5 py-0.5 text-ink-soft hover:bg-line"
              >
                ‹
              </button>
              <h2 className="font-display text-lg font-extrabold text-ink">{heading}</h2>
              <button
                type="button"
                onClick={() => onNavigate(addDaysISO(date, 1))}
                className="rounded-md border border-line px-1.5 py-0.5 text-ink-soft hover:bg-line"
              >
                ›
              </button>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-1.5 py-0.5 text-ink-soft hover:bg-line">
            ✕
          </button>
        </div>

        {loading && <p className="text-sm text-ink-soft">Cargando…</p>}

        {!loading && items.length === 0 && (
          <div className="rounded-xl border border-dashed border-line py-10 text-center text-sm text-ink-soft">
            No hay planilla importada para este día. Usa "Importar cronograma (PDF o foto)" en la pantalla principal.
          </div>
        )}

        {!loading && pending.length > 0 && (
          <div className="mb-2 flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-soft">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => setSelected(e.target.checked ? new Set(pending.map((it) => it.id)) : new Set())}
              />
              Seleccionar todo el día
            </label>
            <p className="text-[11px] text-ink-soft">Corrige con "Editar" si el reconocimiento se equivocó.</p>
          </div>
        )}

        {!loading && items.length > 0 && pending.length === 0 && (
          <div className="rounded-xl border border-dashed border-line py-10 text-center text-sm text-ink-soft">
            Todos los eventos importados de este día ya están en tu calendario.
          </div>
        )}

        <div className="flex flex-col gap-1.5 pb-14">
          {pending.map((item) => {
            if (editingId === item.id) {
              return (
                <EditableRow
                  key={item.id}
                  item={item}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => {
                    setEditingId(null)
                    load()
                  }}
                />
              )
            }
            const meta = item.kind ? KIND_META[item.kind] : null
            return (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded-lg py-1.5 pl-2 pr-2"
                style={{
                  backgroundColor: meta ? `var(${meta.softVar})` : 'transparent',
                  borderLeft: `4px solid ${meta ? `var(${meta.colorVar})` : 'var(--color-line)'}`,
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggleSelected(item.id)}
                  className="shrink-0"
                />
                <span className="w-12 shrink-0 font-mono text-xs font-semibold text-ink-soft">{item.start_time.slice(0, 5)}</span>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold" style={{ color: meta ? `var(${meta.colorVar})` : 'var(--color-ink-soft)' }}>
                    {item.label}
                  </span>
                  {item.location && <span className="block truncate text-[10px] text-ink-soft">{item.location}</span>}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {confirmDeleteId === item.id ? (
                    <>
                      <span className="text-[10px] font-bold text-ink-soft">¿Quitar?</span>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        className="rounded-md border border-partido bg-paper-raised px-2 py-1 text-[10px] font-bold text-partido"
                      >
                        Sí
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-md border border-line bg-paper-raised px-2 py-1 text-[10px] font-bold text-ink-soft"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditingId(item.id)}
                        className="rounded-md border border-line bg-paper-raised px-2 py-1 text-[10px] font-bold text-ink-soft hover:border-ink-soft"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(item.id)}
                        className="rounded-md border border-line bg-paper-raised px-2 py-1 text-[10px] font-bold text-ink-soft hover:border-partido hover:text-partido"
                      >
                        Quitar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAdd(item)}
                        disabled={addingId === item.id}
                        className="rounded-md border border-line bg-paper-raised px-2 py-1 text-[10px] font-bold text-ink-soft hover:border-accent hover:text-accent disabled:opacity-50"
                      >
                        {addingId === item.id ? '…' : '+ Agregar'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {selected.size > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-[55] flex justify-center p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 rounded-full border border-line bg-paper-raised px-4 py-2.5 shadow-2xl">
            <span className="text-xs font-bold text-ink">{selected.size} seleccionados</span>
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-white"
            >
              Agregar al calendario →
            </button>
          </div>
        </div>
      )}

      {bulkOpen && (
        <BulkAddModal
          items={selectedItems}
          userId={userId}
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            onEventAdded()
            load()
          }}
        />
      )}
    </div>
  )
}
