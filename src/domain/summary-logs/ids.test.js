import { describe, expect, it } from 'vitest'

import { toSummaryLogFileId, toSummaryLogId } from './ids.js'

/** @import { SummaryLogFileId, SummaryLogId } from './ids.js' */

describe('summary log ids', () => {
  it('does not accept a file id as a summary log id', () => {
    const fileId = toSummaryLogFileId('file-1')

    // @ts-expect-error a file id is not a summary log id
    /** @type {SummaryLogId} */ const summaryLogId = fileId

    expect(summaryLogId).toBe('file-1')
  })

  it('does not accept a summary log id as a file id', () => {
    const summaryLogId = toSummaryLogId('summary-log-1')

    // @ts-expect-error a summary log id is not a file id
    /** @type {SummaryLogFileId} */ const fileId = summaryLogId

    expect(fileId).toBe('summary-log-1')
  })
})
