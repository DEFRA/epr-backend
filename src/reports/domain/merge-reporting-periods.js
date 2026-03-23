/**
 * Merges computed reporting periods with persisted periodic-report slots.
 *
 * - Computed periods come from generateReportingPeriods() (periods with ended dates)
 * - Persisted reports come from reportsRepository.findPeriodicReports()
 * - reportStatusMap maps reportId -> status string (fetched from reports collection)
 *
 * For each period:
 * - If a persisted report exists with a non-null currentReportId, include report: { id, status }
 * - If no persisted report or currentReportId is null, omit the report field
 * - Periods with persisted reports that aren't in the computed set are included
 *   (e.g. waste records deleted but report still exists)
 *
 * @param {Array<{year: number, period: number, startDate: string, endDate: string, dueDate: string}>} computedPeriods
 * @param {import('../repository/port.js').PeriodicReport[]} periodicReports
 * @param {string} cadence
 * @param {Map<string, string>} reportStatusMap - Maps reportId to status
 * @returns {Array<{year: number, period: number, startDate: string, endDate: string, dueDate: string, report?: {id: string, status: string}}>}
 */
export function mergeReportingPeriods(
  computedPeriods,
  periodicReports,
  cadence,
  reportStatusMap = new Map()
) {
  const persistedSlots = new Map()

  for (const pr of periodicReports) {
    const cadenceSlots = pr.reports?.[cadence]
    if (!cadenceSlots) continue

    for (const [periodKey, slot] of Object.entries(cadenceSlots)) {
      const key = `${pr.year}:${periodKey}`
      persistedSlots.set(key, {
        ...slot,
        year: pr.year,
        period: Number(periodKey)
      })
    }
  }

  const merged = new Map()

  for (const cp of computedPeriods) {
    const key = `${cp.year}:${cp.period}`
    const slot = persistedSlots.get(key)

    const entry = {
      year: cp.year,
      period: cp.period,
      startDate: cp.startDate,
      endDate: cp.endDate,
      dueDate: cp.dueDate
    }

    if (slot?.currentReportId) {
      entry.report = {
        id: slot.currentReportId,
        status: reportStatusMap.get(slot.currentReportId) ?? 'in_progress'
      }
    }

    merged.set(key, entry)
  }

  for (const [key, slot] of persistedSlots) {
    if (merged.has(key)) continue
    if (!slot.currentReportId) continue

    merged.set(key, {
      year: slot.year,
      period: slot.period,
      startDate: slot.startDate,
      endDate: slot.endDate,
      dueDate: slot.dueDate,
      report: {
        id: slot.currentReportId,
        status: reportStatusMap.get(slot.currentReportId) ?? 'in_progress'
      }
    })
  }

  return Array.from(merged.values()).sort(
    (a, b) => a.year - b.year || a.period - b.period
  )
}
