/**
 * Builds a report reference from a slot's currentReportId and the status map.
 * @param {string|null} currentReportId
 * @param {Map<string, string>} reportStatusMap
 * @returns {{ id: string, status: string } | null}
 */
function buildReport(currentReportId, reportStatusMap) {
  if (!currentReportId) {
    return null
  }
  return {
    id: currentReportId,
    status: reportStatusMap.get(currentReportId) ?? 'in_progress'
  }
}

/**
 * Indexes persisted periodic-report slots by "year:period" key for a given cadence.
 * @param {import('../repository/port.js').PeriodicReport[]} periodicReports
 * @param {string} cadence
 * @returns {Map<string, object>}
 */
function indexPersistedSlots(periodicReports, cadence) {
  const slots = new Map()

  for (const pr of periodicReports) {
    const cadenceSlots = pr.reports?.[cadence]
    if (!cadenceSlots) {
      continue
    }

    for (const [periodKey, slot] of Object.entries(cadenceSlots)) {
      slots.set(`${pr.year}:${periodKey}`, {
        ...slot,
        year: pr.year,
        period: Number(periodKey)
      })
    }
  }

  return slots
}

/**
 * Merges computed reporting periods with persisted periodic-report slots.
 *
 * For each period:
 * - If a persisted report exists with a non-null currentReportId, include report: { id, status }
 * - If no persisted report or currentReportId is null, set report: null
 * - Periods with persisted reports that aren't in the computed set are included
 *
 * @param {Array<{year: number, period: number, startDate: string, endDate: string, dueDate: string}>} computedPeriods
 * @param {import('../repository/port.js').PeriodicReport[]} periodicReports
 * @param {string} cadence
 * @param {Map<string, string>} reportStatusMap - Maps reportId to status
 * @returns {Array<{year: number, period: number, startDate: string, endDate: string, dueDate: string, report: {id: string, status: string} | null}>}
 */
export function mergeReportingPeriods(
  computedPeriods,
  periodicReports,
  cadence,
  reportStatusMap = new Map()
) {
  const persistedSlots = indexPersistedSlots(periodicReports, cadence)
  const merged = new Map()

  for (const cp of computedPeriods) {
    const key = `${cp.year}:${cp.period}`
    const slot = persistedSlots.get(key)

    merged.set(key, {
      year: cp.year,
      period: cp.period,
      startDate: cp.startDate,
      endDate: cp.endDate,
      dueDate: cp.dueDate,
      report: buildReport(slot?.currentReportId ?? null, reportStatusMap)
    })
  }

  for (const [key, slot] of persistedSlots) {
    if (merged.has(key) || !slot.currentReportId) {
      continue
    }

    merged.set(key, {
      year: slot.year,
      period: slot.period,
      startDate: slot.startDate,
      endDate: slot.endDate,
      dueDate: slot.dueDate,
      report: buildReport(slot.currentReportId, reportStatusMap)
    })
  }

  return Array.from(merged.values()).sort(
    (a, b) => a.year - b.year || a.period - b.period
  )
}
