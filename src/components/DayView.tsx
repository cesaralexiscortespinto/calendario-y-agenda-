import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ItineraryItem } from '@/lib/database.types'
import { KIND_META } from '@/lib/kindMeta'

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
  const [location, setLocation] = useState(item.location ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await supabase
      .from('itinerary_items')
      .update({ start_time: time + ':00', label: label.trim() || item.label, location: location.trim() || null })
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
      <input
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="Lugar"
        className="min-w-0 flex-1 rounded-md border border-line bg-paper-raised px-1.5 py-1 text-xs text-ink"
      />
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

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('itinerary_items')
      .select('*')
      .eq('day_date', date)
      .order('start_time', { ascending: true })
    setItems((data as ItineraryItem[]) ?? [])
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
    if (!confirm('¿Quitar esta fila de la planilla? (no afecta tu calendario)')) return
    await supabase.from('itinerary_items').delete().eq('id', item.id)
    await load()
  }

  const heading = capital(new Date(date + 'T00:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }))
  const importLabel = items[0]?.import_label

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

        <p className="mb-2 text-[11px] text-ink-soft">
          Si el reconocimiento se equivocó en alguna fila (frecuente en fotos), corrígela con "Editar" antes de agregarla.
        </p>

        <div className="flex flex-col gap-1.5">
          {items.map((item) => {
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
            const added = !!item.added_event_id
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-lg py-1.5 pl-3 pr-2"
                style={{
                  backgroundColor: meta ? `var(${meta.softVar})` : 'transparent',
                  borderLeft: `4px solid ${meta ? `var(${meta.colorVar})` : 'var(--color-line)'}`,
                }}
              >
                <span className="w-12 shrink-0 font-mono text-xs font-semibold text-ink-soft">{item.start_time.slice(0, 5)}</span>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold" style={{ color: meta ? `var(${meta.colorVar})` : 'var(--color-ink-soft)' }}>
                    {item.label}
                  </span>
                  {item.location && <span className="block truncate text-[10px] text-ink-soft">{item.location}</span>}
                </div>
                {added ? (
                  <span className="shrink-0 text-[10px] font-bold text-accent">✓ En tu calendario</span>
                ) : (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditingId(item.id)}
                      className="rounded-md border border-line bg-paper-raised px-2 py-1 text-[10px] font-bold text-ink-soft hover:border-ink-soft"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
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
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
