import { describe, it as base, expect } from 'vitest'

import { createInMemorySummaryLogRowStatesBackfillWatermarkRepository } from './inmemory.js'
import { testSummaryLogRowStatesBackfillWatermarkRepositoryContract } from './port.contract.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  watermarkRepository: async ({}, use) => {
    await use(createInMemorySummaryLogRowStatesBackfillWatermarkRepository())
  }
})

describe('summary-log-row-states backfill watermark - in-memory implementation', () => {
  it('exposes the watermark port surface', () => {
    const repository =
      createInMemorySummaryLogRowStatesBackfillWatermarkRepository()()
    expect(repository.read).toBeTypeOf('function')
    expect(repository.advance).toBeTypeOf('function')
  })

  testSummaryLogRowStatesBackfillWatermarkRepositoryContract(it)
})
