// Small input checks shared by the API routes.

// True for an id that fits in a Postgres int column, e.g. '12' or 12
export function isPositiveInt(value) {
  return /^\d+$/.test(String(value)) && Number(value) > 0 && Number(value) <= 2147483647
}

// True for a real calendar day written as YYYY-MM-DD (rejects 2026-02-30)
export function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

// pantry_amount_id: 0 = plenty, 1 = running low, 2 = none
export function isPantryAmount(value) {
  return [0, 1, 2].includes(value)
}
