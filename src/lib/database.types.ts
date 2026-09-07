export type EventKind = 'entrenamiento' | 'partido' | 'viaje' | 'charla_tecnica' | 'tmi' | 'otros'

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
  created_at: string
}

export interface ItineraryItem {
  id: string
  user_id: string
  import_label: string | null
  category: string | null
  day_date: string
  start_time: string
  label: string
  kind: EventKind | null
  added_event_id: string | null
  created_at: string
}
