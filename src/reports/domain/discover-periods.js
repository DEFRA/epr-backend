import { formatDateISO } from '#common/helpers/date-formatter.js'
import { DATE_FIELDS_BY_OPERATOR_CATEGORY } from './fields-by-operator-category.js'

/**
 * Derives distinct reporting periods from waste record dates.
 *
 * Pure function — no repository or infrastructure dependencies.
 *
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} wasteRecords
 * @param {string} operatorCategory - Operator category (e.g. 'EXPORTER_REGISTERED_ONLY')
 * @param {import('./cadence.js').MONTHLY | import('./cadence.js').QUARTERLY} cadence
 * @param {{ year?: number }} [options]
 * @returns {{ year: number, period: number, startDate: string, endDate: string }[]}
 */
export function discoverPeriods(
  wasteRecords,
  operatorCategory,
  cadence,
  options
) {
  const wasteRecordTypeMap = DATE_FIELDS_BY_OPERATOR_CATEGORY[operatorCategory]

  if (!wasteRecordTypeMap) {
    throw new TypeError(`Unknown operator category: ${operatorCategory}`)
  }

  const periodSet = new Set()
  const periods = []

  for (const wasteRecord of wasteRecords) {
    const dateFields = wasteRecordTypeMap[wasteRecord.type]

    if (!dateFields) {
      continue
    }

    for (const dateField of dateFields) {
      const periodEntry = toPeriodEntry(
        wasteRecord.data[dateField],
        cadence,
        options?.year
      )

      if (periodEntry && !periodSet.has(periodEntry.key)) {
        periodSet.add(periodEntry.key)
        periods.push(periodEntry.period)
      }
    }
  }

  periods.sort((a, b) => a.year - b.year || a.period - b.period)

  return periods
}

/**
 * Converts a date value to a period entry, or returns null if the
 * value is missing, unparseable, or outside the year filter.
 * @param {*} dateValue
 * @param {import('./cadence.js').MONTHLY | import('./cadence.js').QUARTERLY} cadence
 * @param {number} [yearFilter]
 * @returns {{ key: string, period: { year: number, period: number, startDate: string, endDate: string } } | null}
 */
function toPeriodEntry(dateValue, cadence, yearFilter) {
  const parsed = parseDate(dateValue)

  if (!parsed) {
    return null
  }

  const { year, month } = parsed

  if (yearFilter !== undefined && year !== yearFilter) {
    return null
  }

  const period = Math.floor(month / cadence.monthsPerPeriod) + 1
  const startMonth = (period - 1) * cadence.monthsPerPeriod

  return {
    key: `${year}-${period}`,
    period: {
      year,
      period,
      startDate: formatDateISO(year, startMonth, 1),
      endDate: formatDateISO(year, startMonth + cadence.monthsPerPeriod, 0)
    }
  }
}

/**
 * Parses an ISO date string into year and 0-indexed month.
 * Returns null for unparseable values.
 * @param {string} value
 * @returns {{ year: number, month: number } | null}
 */
function parseDate(value) {
  if (typeof value !== 'string') {
    return null
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return { year: date.getUTCFullYear(), month: date.getUTCMonth() }
}
