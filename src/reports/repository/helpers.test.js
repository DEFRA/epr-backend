import { afterEach, describe, expect, it, vi } from 'vitest'

import { assertPresent } from '#test/type-helpers.js'
import { groupAsPeriodicReports, mapReport } from './helpers.js'
import { logger } from '#common/helpers/logging/logger.js'
import { LOGGING_EVENT_ACTIONS } from '#common/enums/event.js'

const buildReport = (stale) => ({
  id: 'report-1',
  version: 1,
  ...(stale ? { stale } : {})
})

describe('mapReport', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the report unchanged when there is no stale field', () => {
    const report = buildReport()

    expect(mapReport(report)).toBe(report)
  })

  it('normalises the stale field to the nested shape', () => {
    const report = buildReport({
      uploadedAt: '2025-01-01T00:00:00.000Z',
      reason: 'summary_log_changed',
      summaryLogId: 'sl-1'
    })

    expect(mapReport(report).stale).toEqual({
      summaryLogChanged: {
        uploadedAt: '2025-01-01T00:00:00.000Z',
        summaryLogId: 'sl-1'
      }
    })
  })

  it('does not log for a clean nested-shape stale', () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => logger)

    mapReport(
      buildReport({
        summaryLogChanged: {
          uploadedAt: '2025-01-01T00:00:00.000Z',
          summaryLogId: 'sl-1'
        }
      })
    )

    expect(info).not.toHaveBeenCalled()
  })

  it('logs at info with the report id and stripped keys when normalising a legacy stale shape', () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => logger)

    mapReport(
      buildReport({
        uploadedAt: '2025-01-01T00:00:00.000Z',
        reason: 'summary_log_changed',
        summaryLogId: 'sl-1',
        summaryLogChanged: {
          uploadedAt: '2025-02-01T00:00:00.000Z',
          summaryLogId: 'sl-2'
        }
      })
    )

    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({
          action: LOGGING_EVENT_ACTIONS.LEGACY_STALE_SHAPE_NORMALISED,
          reason:
            'reportId=report-1 strippedKeys=uploadedAt,reason,summaryLogId'
        })
      })
    )
  })
})

describe('groupAsPeriodicReports', () => {
  const buildDoc = (activity = {}) => ({
    id: 'report-1',
    year: 2026,
    cadence: 'monthly',
    period: 1,
    submissionNumber: 1,
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    dueDate: '2026-02-20',
    status: { currentStatus: 'submitted' },
    ...activity
  })

  const currentOf = (docs) => {
    const period = groupAsPeriodicReports('org-1', 'reg-1', docs)[0].reports
      .monthly?.[1]
    assertPresent(period)
    const { current } = period
    assertPresent(current)
    return current
  }

  it('omits activity payloads a projection did not select', () => {
    const current = currentOf([buildDoc()])

    expect(current.recyclingActivity).toBeUndefined()
    expect(current.exportActivity).toBeUndefined()
    expect(current.wasteSent).toBeUndefined()
  })

  it('carries the summary figures when the projection selected them', () => {
    const current = currentOf([
      buildDoc({
        recyclingActivity: { totalTonnageReceived: 10 },
        wasteSent: { tonnageSentToReprocessor: 4 }
      })
    ])

    assertPresent(current.recyclingActivity)
    assertPresent(current.wasteSent)
    expect(current.recyclingActivity.totalTonnageReceived).toBe(10)
    expect(current.wasteSent.tonnageSentToReprocessor).toBe(4)
  })
})
