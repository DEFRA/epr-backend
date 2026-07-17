import { afterEach, describe, expect, it, vi } from 'vitest'

import { mapReport } from './helpers.js'
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
