import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export const WEEK_STARTS_ON = 1 as const;

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function monthDate(year: number, month: number) {
  return new Date(year, month, 1);
}

/** Monday-start month grid, including leading/trailing days from adjacent months. */
export function useMonthDays(year: number, month: number) {
  const date = monthDate(year, month);
  const calendarStart = startOfWeek(startOfMonth(date), { weekStartsOn: WEEK_STARTS_ON });
  const calendarEnd = endOfWeek(endOfMonth(date), { weekStartsOn: WEEK_STARTS_ON });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weekCount = Math.round(days.length / 7);
  return { date, days, calendarStart, calendarEnd, weekCount };
}
