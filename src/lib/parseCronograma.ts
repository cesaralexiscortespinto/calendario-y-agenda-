import './pdfjsSetup'
import { getDocument } from 'pdfjs-dist'
import type { TextItem as PdfTextItem } from 'pdfjs-dist/types/src/display/api'
import { guessKind, type EventKind } from './kindMeta'

interface TextItem {
  str: string
  x: number
  y: number
  width: number
}

export interface ParsedItem {
  time: string
  label: string
  kind: EventKind | null
}

export interface ParsedDay {
  date: string
  dayName: string
  items: ParsedItem[]
}

export interface ParsedCronograma {
  title: string | null
  category: string | null
  days: ParsedDay[]
}

const DAY_RE = /^(LUNES|MARTES|MIERCOLES|JUEVES|VIERNES|SABADO|DOMINGO)\s+(\d{1,2})\/(\d{1,2})$/i
const CATEGORY_RE = /SUB\.?\s?-?\s?(\d{1,2})/i

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function groupLines(items: TextItem[], yTolerance = 3) {
  const byY: { y: number; items: TextItem[] }[] = []
  for (const it of items) {
    let bucket = byY.find((b) => Math.abs(b.y - it.y) <= yTolerance)
    if (!bucket) {
      bucket = { y: it.y, items: [] }
      byY.push(bucket)
    }
    bucket.items.push(it)
  }
  for (const b of byY) b.items.sort((a, c) => a.x - c.x)
  byY.sort((a, b) => b.y - a.y)
  return byY
}

/** Collapses "bold simulation" duplicate text stamps: same string, heavily overlapping x-range. */
function collapseDuplicates(lineItems: TextItem[]): TextItem[] {
  const out: TextItem[] = []
  for (const it of lineItems) {
    const prev = out[out.length - 1]
    if (prev && prev.str === it.str && it.x - prev.x < prev.width * 0.7) continue
    out.push(it)
  }
  return out
}

function lineText(lineItems: TextItem[]): string {
  const collapsed = collapseDuplicates(lineItems)
  let text = ''
  let prevEnd: number | null = null
  for (const it of collapsed) {
    if (prevEnd !== null && it.x - prevEnd > 1.5) text += ' '
    text += it.str
    prevEnd = it.x + (it.width ?? 0)
  }
  return text.replace(/\s+/g, ' ').trim()
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Parses a "Cronograma Semanal" weekly schedule PDF (Selección Nacional format):
 * a 7-day table with one column per day and time-stamped activity rows.
 * Tuned to this specific federation template — column x-anchors come from the
 * day-name headers, and duplicate text stamps (used to fake bold) are collapsed
 * by overlap rather than exact offset, since that offset varies per text run.
 */
export async function parseCronogramaPdf(file: File, year = new Date().getFullYear()): Promise<ParsedCronograma> {
  const buffer = await file.arrayBuffer()
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise
  const page = await doc.getPage(1)
  const content = await page.getTextContent()

  const items: TextItem[] = content.items
    .filter((it): it is PdfTextItem => 'transform' in it && !!it.str?.trim())
    .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width }))

  const dayAnchors = items
    .map((it) => {
      const m = stripAccents(it.str).toUpperCase().match(DAY_RE)
      return m ? { name: m[1], day: +m[2], month: +m[3], x: it.x, y: it.y } : null
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .sort((a, b) => a.x - b.x)

  if (dayAnchors.length === 0) {
    throw new Error('No se reconoció el formato del cronograma (no se encontraron los encabezados de los días).')
  }

  const columns = dayAnchors.map((d, i) => ({
    ...d,
    xStart: i === 0 ? -Infinity : (dayAnchors[i - 1].x + d.x) / 2,
    xEnd: i === dayAnchors.length - 1 ? Infinity : (d.x + dayAnchors[i + 1].x) / 2,
  }))

  const headerY = dayAnchors[0].y
  const bodyItems = items.filter((it) => it.y < headerY - 5)

  const days: ParsedDay[] = columns.map((col) => {
    const colItems = bodyItems.filter((it) => it.x >= col.xStart && it.x < col.xEnd)
    const lines = groupLines(colItems, 3)
    const rows: { time: string; label: string }[] = []
    for (const l of lines) {
      const text = lineText(l.items)
      const m = text.match(/^(\d{1,2}:\d{2})\s+(.+)$/)
      if (!m) continue
      rows.push({ time: m[1], label: m[2] })
    }
    const byTime = new Map<string, { time: string; label: string }>()
    for (const r of rows) {
      const existing = byTime.get(r.time)
      if (!existing || r.label.length > existing.label.length) byTime.set(r.time, r)
    }
    const finalRows = [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time))
    return {
      date: `${year}-${pad(col.month)}-${pad(col.day)}`,
      dayName: col.name,
      items: finalRows.map((r) => ({ time: r.time, label: r.label, kind: guessKind(r.label) })),
    }
  })

  const fullText = items.map((it) => it.str).join(' ')
  const titleMatch = fullText.match(/MICROCICLO\s*#?\s*\d+/i)
  const categoryMatch = fullText.match(CATEGORY_RE)

  return {
    title: titleMatch ? titleMatch[0].toUpperCase() : null,
    category: categoryMatch ? `Sub-${categoryMatch[1]}` : null,
    days,
  }
}
