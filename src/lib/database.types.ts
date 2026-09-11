export type EventKind = 'entrenamiento' | 'partido' | 'viaje' | 'charla_tecnica' | 'tmi' | 'otros'

export type MatchType = 'amistoso' | 'amistoso_internacional' | 'torneo_amistoso' | 'competicion_oficial'

export interface CalendarEvent {
  id: string
  user_id: string
  kind: EventKind
  title: string
  category: string | null
  date: string
  end_date: string | null
  start_time: string | null
  end_time: string | null
  location: string | null
  attending: boolean
  notes: string | null
  match_type: MatchType | null
  competition_name: string | null
  created_at: string
}

export type ReportType = 'pre_partido' | 'post_partido' | 'info_sede' | 'otros'

export interface Report {
  id: string
  user_id: string
  title: string
  category: string | null
  report_type: ReportType
  date: string
  content: string
  link_url: string | null
  created_at: string
  updated_at: string
}

export interface ItineraryItem {
  id: string
  user_id: string
  import_label: string | null
  category: string | null
  day_date: string
  start_time: string
  label: string
  location: string | null
  kind: EventKind | null
  added_event_id: string | null
  created_at: string
}
