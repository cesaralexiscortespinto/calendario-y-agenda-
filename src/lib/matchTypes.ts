import type { MatchType } from './database.types'

export type { MatchType }

export const MATCH_TYPES: MatchType[] = ['amistoso', 'amistoso_internacional', 'torneo_amistoso', 'competicion_oficial']

export const MATCH_TYPE_META: Record<MatchType, { label: string }> = {
  amistoso: { label: 'Amistoso' },
  amistoso_internacional: { label: 'Amistoso Internacional' },
  torneo_amistoso: { label: 'Torneo Amistoso' },
  competicion_oficial: { label: 'Competición Oficial' },
}
