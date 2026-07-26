export class CalendarNotConnectedError extends Error {
  constructor() {
    super('calendar_not_connected')
    this.name = 'CalendarNotConnectedError'
  }
}
