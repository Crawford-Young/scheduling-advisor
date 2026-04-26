export interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  calendarId: string
}

export interface FreeSlot {
  start: Date
  end: Date
  durationMinutes: number
}

export interface CalendarService {
  getEvents(userId: string, start: Date, end: Date): Promise<CalendarEvent[]>
  getFreeSlots(
    userId: string,
    start: Date,
    end: Date,
    minDurationMinutes: number,
  ): Promise<FreeSlot[]>
  createEvent(
    userId: string,
    event: Omit<CalendarEvent, 'id' | 'calendarId'>,
  ): Promise<CalendarEvent>
  deleteEvent(userId: string, eventId: string): Promise<void>
}
