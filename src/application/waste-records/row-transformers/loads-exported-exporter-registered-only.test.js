import { describe, it, expect } from 'vitest'
import { transformLoadsExportedRowRegisteredOnly } from './loads-exported-exporter-registered-only.js'

// Happy-path coverage provided by sync-from-summary-log integration test.
// Only the throw branch (unreachable via the normal pipeline) is tested here.
describe('transformLoadsExportedRowRegisteredOnly', () => {
  it('throws when ROW_ID is missing', () => {
    expect(() => transformLoadsExportedRowRegisteredOnly({}, 5)).toThrow(
      'Missing ROW_ID at row 5'
    )
  })
})
