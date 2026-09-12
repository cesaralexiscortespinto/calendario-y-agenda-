import { useEffect, useMemo, useState } from 'react'
import '@/lib/pdfjsSetup'
import { getDocument } from 'pdfjs-dist'
import type { CalendarEvent } from '@/lib/database.types'
import { CATEGORIES } from '@/lib/categories'
import { parseTmiTitle } from '@/lib/tmiTitle'

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
function humanDate(iso: string) {
  return capital(new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }))
}
function isImageUrl(url: string) {
  return /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(url.split('?')[0])
}
function filenameFromUrl(url: string, fallback: string) {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').pop() || '')
    return last || fallback
  } catch {
    return fallback
  }
}

async function downloadFile(url: string, filename: string) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(objectUrl)
  } catch {
    window.open(url, '_blank')
  }
}

function ShareButton({ url, title, label }: { url: string; title: string; label: string }) {
  const [copied, setCopied] = useState(false)

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
        return
      } catch {
        return
      }
    }
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button type="button" onClick={handleShare} className="text-ink-soft hover:underline">
      {copied ? '¡Copiado!' : label}
    </button>
  )
}

function AssetRow({ url, filename, label }: { url: string; filename: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-[11px] font-bold">
      <span className="text-ink-soft">{label}</span>
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
        Ver
      </a>
      <button type="button" onClick={() => downloadFile(url, filename)} className="text-ink-soft hover:underline">
        Descargar
      </button>
      <ShareButton url={url} title={filename} label="Compartir" />
    </div>
  )
}

const pdfThumbCache = new Map<string, string>()

/** Dibuja la primera página del PDF de la ficha en un canvas y la muestra como imagen. */
function PdfFichaThumbnail({ url }: { url: string }) {
  const [thumb, setThumb] = useState<string | null>(() => pdfThumbCache.get(url) ?? null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (thumb) return
    let cancelled = false
    ;(async () => {
      try {
        const pdf = await getDocument({ url }).promise
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 1.2 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('sin contexto de canvas')
        await page.render({ canvasContext: ctx, viewport }).promise
        const dataUrl = canvas.toDataURL('image/png')
        pdfThumbCache.set(url, dataUrl)
        if (!cancelled) setThumb(dataUrl)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [url, thumb])

  if (failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-soft">
        <span className="text-2xl">📄</span>
        <span className="text-[10px] font-bold uppercase tracking-wide">Ver ficha (PDF)</span>
      </div>
    )
  }
  if (!thumb) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">Cargando ficha…</span>
      </div>
    )
  }
  return <img src={thumb} alt="Ficha del ejercicio" className="h-full w-full object-cover object-top" />
}

function CardVisual({ ev }: { ev: CalendarEvent }) {
  if (ev.ficha_url) {
    return (
      <a href={ev.ficha_url} target="_blank" rel="noopener noreferrer" className="block h-full w-full">
        {isImageUrl(ev.ficha_url) ? (
          <img src={ev.ficha_url} alt="Ficha del ejercicio" className="h-full w-full object-cover" />
        ) : (
          <PdfFichaThumbnail url={ev.ficha_url} />
        )}
      </a>
    )
  }
  if (ev.video_url) {
    return <video src={ev.video_url} controls preload="metadata" className="h-full w-full object-cover" />
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-ink-soft">
      <span className="text-3xl">⚽</span>
      <span className="text-[10px] font-bold uppercase tracking-wide">Sin ficha ni video</span>
    </div>
  )
}

const MOMENTO_FILTERS = ['all', 'Ofensivo', 'Defensivo'] as const

const POSITION_FILTERS = ['Portero', 'Laterales', 'Centrales', 'Volantes', 'Media Punta', 'Delantero', 'Extremo'] as const

function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

const POSITION_PATTERNS: Record<(typeof POSITION_FILTERS)[number], RegExp> = {
  Portero: /porter/,
  Laterales: /later/,
  Centrales: /central/,
  Volantes: /volante/,
  'Media Punta': /media\s*-?\s*punta|mediapunta/,
  Delantero: /delanter/,
  Extremo: /extrem/,
}

function matchesPositionFilter(posicion: string, filter: (typeof POSITION_FILTERS)[number]) {
  return POSITION_PATTERNS[filter].test(normalize(posicion))
}

export default function TmiLibrary({ events }: { events: CalendarEvent[] }) {
  const [categoryFilter, setCategoryFilter] = useState('')
  const [momentoFilter, setMomentoFilter] = useState<(typeof MOMENTO_FILTERS)[number]>('all')
  const [positionFilter, setPositionFilter] = useState<'all' | (typeof POSITION_FILTERS)[number]>('all')
  const [onlyWithMedia, setOnlyWithMedia] = useState(false)
  const [search, setSearch] = useState('')

  const tmis = useMemo(() => {
    return events
      .filter((e) => e.kind === 'tmi')
      .map((ev) => ({ ev, parsed: parseTmiTitle(ev.title) }))
      .filter(({ ev, parsed }) => {
        if (categoryFilter && ev.category !== categoryFilter) return false
        if (momentoFilter !== 'all' && parsed.momento !== momentoFilter) return false
        if (positionFilter !== 'all' && !matchesPositionFilter(parsed.posicion, positionFilter)) return false
        if (onlyWithMedia && !ev.video_url && !ev.ficha_url) return false
        if (search) {
          const q = search.toLowerCase()
          if (!parsed.posicion.toLowerCase().includes(q) && !parsed.objetivo.toLowerCase().includes(q)) return false
        }
        return true
      })
      .sort((a, b) => (a.ev.date < b.ev.date ? 1 : a.ev.date > b.ev.date ? -1 : 0))
  }, [events, categoryFilter, momentoFilter, positionFilter, onlyWithMedia, search])

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por posición u objetivo…"
          className="min-w-0 flex-1 rounded-lg border border-line bg-paper-raised px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-line bg-paper-raised px-2.5 py-2 text-[11px] font-bold text-ink outline-none focus:border-accent"
        >
          <option value="">Todas las categorías</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="flex gap-1 rounded-lg border border-line p-0.5">
          {MOMENTO_FILTERS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMomentoFilter(m)}
              className={`rounded-md px-2.5 py-1.5 text-[11px] font-bold ${
                momentoFilter === m ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {m === 'all' ? 'Todos' : m}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-ink-soft">
          <input type="checkbox" checked={onlyWithMedia} onChange={(e) => setOnlyWithMedia(e.target.checked)} />
          Solo con video/ficha
        </label>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setPositionFilter('all')}
          className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
            positionFilter === 'all' ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft'
          }`}
        >
          Todas las posiciones
        </button>
        {POSITION_FILTERS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPositionFilter(p)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
              positionFilter === p ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {tmis.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line py-16 text-center text-sm text-ink-soft">
          {events.filter((e) => e.kind === 'tmi').length === 0
            ? 'Aún no hay TMI registrados.'
            : 'Nada que coincida con este filtro.'}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tmis.map(({ ev, parsed }) => (
          <div key={ev.id} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-paper-raised shadow-sm">
            <div className="relative aspect-[4/3] w-full bg-line">
              <CardVisual ev={ev} />
              <span
                className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow"
                style={{ backgroundColor: parsed.momento === 'Ofensivo' ? 'rgba(180,90,20,0.85)' : 'rgba(40,60,110,0.85)' }}
              >
                {parsed.momento}
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-[10px] font-bold uppercase tracking-widest text-ink-soft">
                  {parsed.mc && parsed.sesion ? `MC${parsed.mc}-S${parsed.sesion}` : 'Sin MC/S'} · {humanDate(ev.date)}
                </p>
                {ev.category && <span className="shrink-0 text-[10px] font-bold text-ink-soft">{ev.category}</span>}
              </div>

              <div>
                <p className="text-sm font-extrabold uppercase tracking-tight text-ink">{parsed.posicion || 'Sin posición'}</p>
                {parsed.objetivo && <p className="line-clamp-2 text-xs text-ink-soft">{parsed.objetivo}</p>}
              </div>

              {ev.ficha_url && ev.video_url && (
                <video src={ev.video_url} controls preload="metadata" className="w-full rounded-lg border border-line bg-black" />
              )}

              {(ev.video_url || ev.ficha_url) && (
                <div className="mt-auto flex flex-col gap-1 border-t border-line pt-2">
                  {ev.video_url && <AssetRow url={ev.video_url} filename={filenameFromUrl(ev.video_url, 'video.mp4')} label="Video" />}
                  {ev.ficha_url && <AssetRow url={ev.ficha_url} filename={filenameFromUrl(ev.ficha_url, 'ficha.pdf')} label="Ficha" />}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
