export type EventKind = 'entrenamiento' | 'partido' | 'viaje'

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
