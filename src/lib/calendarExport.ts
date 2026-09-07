import type { CalendarEvent, EventKind } from './database.types'

const KIND_LABEL: Record<EventKind, string> = {
  entrenamiento: 'Entrenamiento',
  partido: 'Partido',
  viaje: 'Viaje',
}

function escapeICS(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function icsDate(dateStr: string): string {
  return dateStr.replace(/-/g, '')
}

function icsDateTime(dateStr: string, timeStr: string): string {
  let t = timeStr.replace(/:/g, '')
  if (t.length === 4) t += '00'
  return dateStr.replace(/-/g, '') + 'T' + t
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function icsTimestamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z'
  )
}

function defaultEndTime(kind: EventKind, startTime: string): string {
  const minutes = kind === 'partido' ? 120 : 90
  const [h, m] = startTime.split(':').map(Number)
  const d = new Date(2000, 0, 1, h, m)
  d.setMinutes(d.getMinutes() + minutes)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

function eventToVEVENT(ev: CalendarEvent): string {
  const lines = ['BEGIN:VEVENT', `UID:${ev.id}@calendario-cesar`, `DTSTAMP:${icsTimestamp()}`]
  const isAllDay = !ev.start_time
  if (isAllDay) {
    lines.push(`DTSTART;VALUE=DATE:${icsDate(ev.date)}`)
    lines.push(`DTEND;VALUE=DATE:${icsDate(addDaysISO(ev.end_date ?? ev.date, 1))}`)
  } else {
    const start = ev.start_time!
    const end = ev.end_time ?? defaultEndTime(ev.kind, start)
    lines.push(`DTSTART:${icsDateTime(ev.date, start)}`)
    lines.push(`DTEND:${icsDateTime(ev.date, end)}`)
  }
  lines.push(`SUMMARY:${escapeICS(`[${KIND_LABEL[ev.kind]}] ${ev.title}`)}`)
  if (ev.location) lines.push(`LOCATION:${escapeICS(ev.location)}`)
  const desc = [ev.category ? `Categoría: ${ev.category}` : null, ev.notes].filter(Boolean).join('\n')
  if (desc) lines.push(`DESCRIPTION:${escapeICS(desc)}`)
  lines.push('END:VEVENT')
  return lines.join('\r\n')
}

export function buildICS(events: CalendarEvent[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Calendario César//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
    .concat(events.map(eventToVEVENT))
    .concat(['END:VCALENDAR'])
    .join('\r\n')
}

export function downloadICS(filename: string, icsText: string) {
  const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'evento'
  )
}
