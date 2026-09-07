import { createWorker } from 'tesseract.js'
import { guessKind, type EventKind } from './kindMeta'

export interface ParsedImageItem {
  time: string
  label: string
  location: string | null
  kind: EventKind | null
}

export interface ParsedCronogramaImage {
  date: string
  items: ParsedImageItem[]
}

interface OcrWord {
  text: string
  x: number
  y: number
}

const DAY_RE = /(LUNES|MARTES|MIERCOLES|JUEVES|VIERNES|SABADO|DOMINGO)\s+(\d{1,2})\/(\d{1,2})/i

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * These single-day schedule cards render some rows as bold white text on a
 * solid color band (GYM, ENTRENAMIENTO, etc). Tesseract's binarization is
 * tuned for the dominant black-on-white polarity and misses those rows
 * entirely, so we invert any row whose average luminance is dark before
 * handing the image to OCR — that turns "white on red" into "black on cyan",
 * which reads far more reliably (though not perfectly: very saturated
 * backgrounds can still fail and may need a manual add afterward).
 */
async function invertDarkRows(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data, width, height } = imageData
  const THRESHOLD = 140

  for (let y = 0; y < height; y++) {
    let sum = 0
    const rowStart = y * width * 4
    for (let x = 0; x < width; x++) {
      const idx = rowStart + x * 4
      sum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
    }
    if (sum / width < THRESHOLD) {
      for (let x = 0; x < width; x++) {
        const idx = rowStart + x * 4
        data[idx] = 255 - data[idx]
        data[idx + 1] = 255 - data[idx + 1]
        data[idx + 2] = 255 - data[idx + 2]
      }
    }
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

function groupRows(words: OcrWord[], yTolerance = 15) {
  const rows: { y: number; words: OcrWord[] }[] = []
  for (const w of words) {
    let row = rows.find((r) => Math.abs(r.y - w.y) <= yTolerance)
    if (!row) {
      row = { y: w.y, words: [] }
      rows.push(row)
    }
    row.words.push(w)
  }
  for (const r of rows) r.words.sort((a, b) => a.x - b.x)
  rows.sort((a, b) => a.y - b.y)
  return rows
}

function joinWords(words: OcrWord[]): string {
  return words
    .map((w) => w.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function parseCronogramaImage(file: File, year = new Date().getFullYear()): Promise<ParsedCronogramaImage> {
  const canvas = await invertDarkRows(file)

  const worker = await createWorker('spa')
  const { data } = await worker.recognize(canvas, {}, { blocks: true })
  await worker.terminate()

  const words: OcrWord[] = []
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const w of line.words ?? []) {
          words.push({ text: w.text, x: w.bbox.x0, y: w.bbox.y0 })
        }
      }
    }
  }

  const dayMatch = stripAccents(data.text).toUpperCase().match(DAY_RE)
  if (!dayMatch) {
    throw new Error('No se reconoció la fecha en la imagen (se esperaba un encabezado como "LUNES 07/09").')
  }
  const date = `${year}-${String(+dayMatch[3]).padStart(2, '0')}-${String(+dayMatch[2]).padStart(2, '0')}`

  // Column headers ("HORA"/"ACTIVIDAD"/"LUGAR") are exactly the kind of short
  // all-caps word OCR sometimes drops, so we don't rely on finding them.
  // Instead: any row that starts with a HH:MM token is a data row (this also
  // doubles as the header/title-row filter), and within that row the
  // activity/location split falls at its single largest horizontal gap —
  // words inside one label sit close together, columns don't.
  const rows = groupRows(words)
  const gapThreshold = canvas.width * 0.06

  const items: ParsedImageItem[] = []
  for (const row of rows) {
    if (row.words.length === 0) continue
    const timeMatch = row.words[0].text.match(/^(\d{1,2}:\d{2})$/)
    if (!timeMatch) continue
    const rest = row.words.slice(1)
    if (rest.length === 0) continue

    let splitAt = rest.length
    let biggestGap = 0
    for (let i = 1; i < rest.length; i++) {
      const gap = rest[i].x - rest[i - 1].x
      if (gap > biggestGap) {
        biggestGap = gap
        splitAt = i
      }
    }
    const hasLocationColumn = biggestGap > gapThreshold
    const label = joinWords(hasLocationColumn ? rest.slice(0, splitAt) : rest)
    if (!label) continue
    const location = hasLocationColumn ? joinWords(rest.slice(splitAt)) || null : null
    items.push({ time: timeMatch[1], label, location, kind: guessKind(label) })
  }

  if (items.length === 0) {
    throw new Error('No se reconoció ninguna fila con hora en la imagen.')
  }

  return { date, items }
}
