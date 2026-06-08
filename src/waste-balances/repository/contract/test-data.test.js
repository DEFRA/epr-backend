import { describe, it, expect } from 'vitest'
import { buildWasteRecord } from './test-data.js'

describe('buildWasteRecord', () => {
  it('generates a waste record with default values', () => {
    const record = buildWasteRecord()

    expect(record.organisationId).toBe('org-1')
    expect(record.registrationId).toBe('reg-1')
    expect(record.accreditationId).toBe('acc-1')
    expect(record.rowId).toBeDefined()
    expect(record.type).toBe('exported')
    expect(record.data).toBeDefined()
    expect(record.versions).toHaveLength(1)
  })

  it('applies custom versions when provided', () => {
    /** @type {import('#domain/waste-records/model.js').WasteRecordVersion[]} */
    const customVersions = [
      {
        id: 'version-1',
        createdAt: '2025-01-01',
        status: 'created',
        summaryLog: { id: 'log-1', uri: 's3://...' },
        data: {}
      }
    ]
    const record = buildWasteRecord({ versions: customVersions })

    expect(record.versions).toEqual(customVersions)
  })

  it('merges custom data with default data', () => {
    const customData = { 'Custom Field': 'Value' }
    const record = buildWasteRecord({ data: customData })

    expect(record.data['Custom Field']).toBe('Value')
    expect(record.data.DATE_OF_EXPORT).toBe('2023-06-01')
  })

  it('overrides default data fields', () => {
    const customData = { DATE_OF_EXPORT: '2025-02-01' }
    const record = buildWasteRecord({ data: customData })

    expect(record.data.DATE_OF_EXPORT).toBe('2025-02-01')
  })
})
