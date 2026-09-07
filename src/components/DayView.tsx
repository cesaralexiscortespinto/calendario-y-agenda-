import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { ItineraryItem } from '@/lib/database.types'
import { KIND_META } from '@/lib/kindMeta'

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function DayView({
  date,
  userId,
  onClose,
  onEventAdded,
}: {
  date: string
  userId: string
  onClose: () => void
  onEventAdded: () => void
}) {
  const [items, setItems] = useState<ItineraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [addingId, setAddingId] = useState<string | null>(null)

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
        location: null,
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
            <h2 className="font-display text-lg font-extrabold text-ink">{heading}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-1.5 py-0.5 text-ink-soft hover:bg-line">
            ✕
          </button>
        </div>

        {loading && <p className="text-sm text-ink-soft">Cargando…</p>}

        {!loading && items.length === 0 && (
          <div className="rounded-xl border border-dashed border-line py-10 text-center text-sm text-ink-soft">
            No hay planilla importada para este día. Usa "Importar cronograma (PDF)" en la pantalla principal.
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          {items.map((item) => {
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
                <span
                  className="min-w-0 flex-1 truncate text-xs font-bold"
                  style={{ color: meta ? `var(${meta.colorVar})` : 'var(--color-ink-soft)' }}
                >
                  {item.label}
                </span>
                {added ? (
                  <span className="shrink-0 text-[10px] font-bold text-accent">✓ En tu calendario</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleAdd(item)}
                    disabled={addingId === item.id}
                    className="shrink-0 rounded-md border border-line bg-paper-raised px-2 py-1 text-[10px] font-bold text-ink-soft hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    {addingId === item.id ? '…' : '+ Agregar'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
