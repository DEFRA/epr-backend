import { describe, it, expect } from 'vitest'
import { createRowTransformer } from './create-row-transformer.js'

// Happy-path coverage provided by integration tests (sync-from-summary-log,
// submission-and-placeholders). Only the throw branch is tested here.
describe('createRowTransformer', () => {
  it('throws when ROW_ID is missing', () => {
    const transform = createRowTransformer({
      wasteRecordType: 'received',
      processingType: 'REPROCESSOR_INPUT',
      rowIdField: 'ROW_ID'
    })

    expect(() => transform({}, 5)).toThrow('Missing ROW_ID at row 5')
  })
})
