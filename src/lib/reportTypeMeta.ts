import type { ReportType } from './database.types'

export type { ReportType }

export const REPORT_TYPES: ReportType[] = ['pre_partido', 'post_partido', 'info_sede', 'otros']

export const REPORT_TYPE_META: Record<ReportType, { label: string; plural: string }> = {
  pre_partido: { label: 'Pre partido', plural: 'Pre partido' },
  post_partido: { label: 'Post partido', plural: 'Post partido' },
  info_sede: { label: 'Info sede', plural: 'Info sede' },
  otros: { label: 'Otros', plural: 'Otros' },
}
