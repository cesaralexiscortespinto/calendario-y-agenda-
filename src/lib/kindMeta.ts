import type { EventKind } from './database.types'

export type { EventKind }

export const EVENT_KINDS: EventKind[] = ['entrenamiento', 'partido', 'viaje', 'charla_tecnica', 'tmi', 'otros']

interface KindMeta {
  label: string
  plural: string
  colorVar: string
  softVar: string
}

export const KIND_META: Record<EventKind, KindMeta> = {
  entrenamiento: { label: 'Entrenamiento', plural: 'Entrenamientos', colorVar: '--color-entrenamiento', softVar: '--color-entrenamiento-soft' },
  charla_tecnica: { label: 'Charla Técnica', plural: 'Charlas Técnicas', colorVar: '--color-charla', softVar: '--color-charla-soft' },
  tmi: { label: 'TMI', plural: 'TMI', colorVar: '--color-tmi', softVar: '--color-tmi-soft' },
  partido: { label: 'Partido', plural: 'Partidos', colorVar: '--color-partido', softVar: '--color-partido-soft' },
  viaje: { label: 'Viaje', plural: 'Viajes', colorVar: '--color-viaje', softVar: '--color-viaje-soft' },
  otros: { label: 'Otros', plural: 'Otros', colorVar: '--color-otros', softVar: '--color-otros-soft' },
}

/** Maps a free-text activity label (e.g. from an imported PDF) to one of our event kinds, if recognized. */
export function guessKind(label: string): EventKind | null {
  const s = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
  if (s.includes('ENTRENAMIENTO')) return 'entrenamiento'
  if (s.includes('CHARLA')) return 'charla_tecnica'
  if (s.includes('TMI') || s.includes('MEJORA INDIVIDUAL')) return 'tmi'
  if (s.includes('PARTIDO')) return 'partido'
  if (s.includes('VIAJE') || s.includes('TRASLADO') || s.includes('GIRA')) return 'viaje'
  return null
}
