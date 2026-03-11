import { formatDateISO } from '#common/helpers/date-formatter.js'
import { DATE_FIELDS_BY_OPERATOR_CATEGORY } from './date-fields-by-operator-category.js'

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
    throw new Error(`Unknown operator category: ${operatorCategory}`)
  }

  const periodSet = new Set()
  const periods = []

  for (const wasteRecord of wasteRecords) {
    const dateFields = wasteRecordTypeMap[wasteRecord.type]

    if (!dateFields) {
      continue
    }

    for (const dateField of dateFields) {
      const dateValue = wasteRecord.data[dateField]

      if (!dateValue) {
        continue
      }

      const parsed = parseDate(dateValue)

      if (!parsed) {
        continue
      }

      const { year, month } = parsed

      if (options?.year !== undefined && year !== options.year) {
        continue
      }

      const period = Math.floor(month / cadence.monthsPerPeriod) + 1
      const periodKey = `${year}-${period}`

      if (!periodSet.has(periodKey)) {
        periodSet.add(periodKey)

        const startMonth = (period - 1) * cadence.monthsPerPeriod

        periods.push({
          year,
          period,
          startDate: formatDateISO(year, startMonth, 1),
          endDate: formatDateISO(year, startMonth + cadence.monthsPerPeriod, 0)
        })
      }
    }
  }

  periods.sort((a, b) => a.year - b.year || a.period - b.period)

  return periods
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

  if (isNaN(date.getTime())) {
    return null
  }

  return { year: date.getUTCFullYear(), month: date.getUTCMonth() }
}
