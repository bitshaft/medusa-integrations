import type { LoyaltySettings } from "./settings"

const DAY = 86_400_000

/** Parses `YYYY-MM-DD` (or `--MM-DD` without a year) into month and day; null when it is not a real date. */
export function parseBirthday(value: string): { year: number | null; month: number; day: number } | null {
  const match = /^(?:(\d{4})-|--)(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const year = match[1] ? Number(match[1]) : null
  const month = Number(match[2])
  const day = Number(match[3])
  const probe = new Date(Date.UTC(year ?? 2000, month - 1, day))
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null
  return { year, month, day }
}

/** The date `YYYY-MM-DD` of a day in a time zone. */
export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at)
}

/** The birthday in a given year; 29 February falls on 28 February in other years. */
export function birthdayIn(year: number, birthday: { month: number; day: number }): string {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const day = birthday.month === 2 && birthday.day === 29 && !leap ? 28 : birthday.day
  return `${year}-${String(birthday.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/**
 * Whether the birthday bonus is due today: it is the birthday, and the date
 * was set at least `min_days_before` days earlier (so a date cannot be set
 * to "today" just for the points).
 */
export function birthdayDue(
  input: { birthday: string | null; set_at: Date | null },
  settings: LoyaltySettings["actions"]["birthday"],
  now: Date,
  timeZone: string
): { due: boolean; year: number } {
  const today = localDate(now, timeZone)
  const year = Number(today.slice(0, 4))
  const parsed = input.birthday ? parseBirthday(input.birthday) : null
  if (!settings.enabled || !parsed || !input.set_at) return { due: false, year }
  if (birthdayIn(year, parsed) !== today) return { due: false, year }
  const setDaysAgo = (now.getTime() - input.set_at.getTime()) / DAY
  return { due: setDaysAgo >= settings.min_days_before, year }
}

/** When a customer may change their birthday again; null when they may now. */
export function birthdayLockedUntil(
  setAt: Date | null,
  settings: LoyaltySettings["actions"]["birthday"],
  now: Date
): Date | null {
  if (!setAt || settings.change_interval_days <= 0) return null
  const until = new Date(setAt.getTime() + settings.change_interval_days * DAY)
  return until.getTime() > now.getTime() ? until : null
}
