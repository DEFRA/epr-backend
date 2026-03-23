import { describe, it, expect } from 'vitest'
import { transformReceivedLoadsExportRowRegisteredOnly } from './received-loads-export-exporter-registered-only.js'

// Happy-path coverage provided by sync-from-summary-log integration test.
// Only the throw branch (unreachable via the normal pipeline) is tested here.
describe('transformReceivedLoadsExportRowRegisteredOnly', () => {
  it('throws when ROW_ID is missing', () => {
    expect(() => transformReceivedLoadsExportRowRegisteredOnly({}, 5)).toThrow(
      'Missing ROW_ID at row 5'
    )
  })
})
