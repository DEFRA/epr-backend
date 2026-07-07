import { describe, it, expect } from 'vitest'

import {
  compareSubmissionOrder,
  isCoveredByWatermark
} from './submission-order.js'

describe('compareSubmissionOrder', () => {
  it('orders an earlier submission before a later one', () => {
    expect(
      compareSubmissionOrder(
        '2025-01-01T00:00:00.000Z',
        'log-b',
        '2025-02-01T00:00:00.000Z',
        'log-a'
      )
    ).toBeLessThan(0)
  })

  it('breaks a submittedAt tie on the summary-log id', () => {
    expect(
      compareSubmissionOrder(
        '2025-01-01T00:00:00.000Z',
        'log-a',
        '2025-01-01T00:00:00.000Z',
        'log-b'
      )
    ).toBeLessThan(0)
  })

  it('reports equality for the same submittedAt and id', () => {
    expect(
      compareSubmissionOrder(
        '2025-01-01T00:00:00.000Z',
        'log-a',
        '2025-01-01T00:00:00.000Z',
        'log-a'
      )
    ).toBe(0)
  })
})

describe('isCoveredByWatermark', () => {
  const submission = {
    submittedAt: '2025-02-01T00:00:00.000Z',
    summaryLogId: 'log-2'
  }

  it('is false when there is no watermark yet', () => {
    expect(isCoveredByWatermark(submission, null)).toBe(false)
  })

  it('is true when the submission is at the watermark', () => {
    expect(
      isCoveredByWatermark(submission, {
        submittedAt: '2025-02-01T00:00:00.000Z',
        summaryLogId: 'log-2'
      })
    ).toBe(true)
  })

  it('is true when the submission is before the watermark', () => {
    expect(
      isCoveredByWatermark(submission, {
        submittedAt: '2025-03-01T00:00:00.000Z',
        summaryLogId: 'log-3'
      })
    ).toBe(true)
  })

  it('is false when the submission is after the watermark', () => {
    expect(
      isCoveredByWatermark(submission, {
        submittedAt: '2025-01-01T00:00:00.000Z',
        summaryLogId: 'log-1'
      })
    ).toBe(false)
  })
})
