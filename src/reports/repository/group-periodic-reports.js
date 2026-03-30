import { REPORT_STATUS } from '#reports/domain/report-status.js'

/**
 * Groups raw report documents into the PeriodicReport nested structure.
 *
 * Sorts by submissionNumber descending so the latest submission is processed first.
 * The highest-numbered non-submitted report becomes `current`;
 * all submitted reports are collected in `previousSubmissions`.
 *
 * @param {string} organisationId
 * @param {string} registrationId
 * @param {Object[]} docs
 * @returns {import('./port.js').PeriodicReport[]}
 */
export const groupAsPeriodicReports = (
  organisationId,
  registrationId,
  docs
) => {
  const sorted = [...docs].sort(
    (a, b) => b.submissionNumber - a.submissionNumber
  )

  const slotMap = sorted.reduce((acc, doc) => {
    const {
      year,
      cadence,
      period,
      startDate,
      endDate,
      dueDate,
      id,
      submissionNumber
    } = doc
    const currentStatus = doc.status.currentStatus
    const key = `${year}:${cadence}:${period}`

    if (!acc.has(key)) {
      acc.set(key, {
        year,
        cadence,
        period,
        startDate,
        endDate,
        dueDate,
        current: null,
        previousSubmissions: []
      })
    }

    const slot = acc.get(key)
    if (currentStatus !== REPORT_STATUS.SUBMITTED && slot.current === null) {
      slot.current = { id, status: currentStatus, submissionNumber }
    } else {
      slot.previousSubmissions.push({
        id,
        status: currentStatus,
        submissionNumber
      })
    }

    return acc
  }, new Map())

  const byYear = [...slotMap.values()].reduce(
    (
      acc,
      {
        year,
        cadence,
        period,
        startDate,
        endDate,
        dueDate,
        current,
        previousSubmissions
      }
    ) => {
      acc[year] ??= {}
      acc[year][cadence] ??= {}
      acc[year][cadence][period] = {
        startDate,
        endDate,
        dueDate,
        current,
        previousSubmissions
      }
      return acc
    },
    {}
  )

  return Object.entries(byYear).map(([year, reports]) => ({
    organisationId,
    registrationId,
    year: Number(year),
    reports
  }))
}
