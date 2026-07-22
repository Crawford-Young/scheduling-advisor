import type { CalendarService } from './interfaces/calendar'
import type { NotificationService } from './interfaces/notification'
import type { TravelService } from './interfaces/travel'

let _calendarService: CalendarService | null = null
let _notificationService: NotificationService | null = null
let _travelService: TravelService | null = null

export async function getCalendarService(): Promise<CalendarService> {
  if (_calendarService) return _calendarService

  const impl = process.env.CALENDAR_SERVICE_IMPL ?? 'google-calendar'
  if (impl === 'google-calendar') {
    const { googleCalendarService } = await import('./impl/google-calendar')
    _calendarService = googleCalendarService
  } else {
    throw new Error(`Unknown CALENDAR_SERVICE_IMPL: ${impl}`)
  }
  return _calendarService
}

export async function getNotificationService(): Promise<NotificationService> {
  if (_notificationService) return _notificationService

  const impl = process.env.NOTIFICATION_SERVICE_IMPL ?? 'web-push'
  if (impl === 'web-push') {
    const { webPushService } = await import('./impl/web-push')
    _notificationService = webPushService
  } else {
    throw new Error(`Unknown NOTIFICATION_SERVICE_IMPL: ${impl}`)
  }
  return _notificationService
}

export async function getTravelService(): Promise<TravelService> {
  if (_travelService) return _travelService

  const impl = process.env.TRAVEL_SERVICE_IMPL ?? 'stub'
  if (impl === 'google-maps') {
    const { googleMapsTravelService } = await import('./impl/google-maps')
    _travelService = googleMapsTravelService
  } else if (impl === 'stub') {
    const { travelStubService } = await import('./impl/travel-stub')
    _travelService = travelStubService
  } else {
    throw new Error(`Unknown TRAVEL_SERVICE_IMPL: ${impl}`)
  }
  return _travelService
}

export function _resetServices() {
  _calendarService = null
  _notificationService = null
  _travelService = null
}
