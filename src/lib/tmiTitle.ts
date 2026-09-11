export const MC_TITLE_RE = /^MC(\d+)-S(\d+)$/i
export const MC_PREFIX_RE = /^MC(\d+)-S(\d+)\s*-\s*/i

export interface ParsedTmiTitle {
  mc: string
  sesion: string
  momento: 'Ofensivo' | 'Defensivo'
  posicion: string
  objetivo: string
}

/** Descompone un título de TMI ("MC14-S3 - Ofensivo: Volantes: Definición") en sus partes. */
export function parseTmiTitle(title: string): ParsedTmiTitle {
  const mcMatch = title.match(MC_PREFIX_RE)
  const mc = mcMatch ? mcMatch[1] : ''
  const sesion = mcMatch ? mcMatch[2] : ''
  const afterMcS = title.replace(MC_PREFIX_RE, '')
  const momento: 'Ofensivo' | 'Defensivo' = /^\s*defensivo\b/i.test(afterMcS) ? 'Defensivo' : 'Ofensivo'
  const rest = afterMcS.replace(/^\s*(ofensivo|defensivo)\s*:?\s*/i, '')
  const idx = rest.indexOf(':')
  const posicion = (idx >= 0 ? rest.slice(0, idx) : rest).trim()
  const objetivo = idx >= 0 ? rest.slice(idx + 1).trim() : ''
  return { mc, sesion, momento, posicion, objetivo }
}
