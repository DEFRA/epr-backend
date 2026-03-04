import { describe, it, expect } from 'vitest'

import { detectAccreditationStatusChanges } from './detect-accreditation-status-changes.js'

describe('detectAccreditationStatusChanges', () => {
  it('returns empty array when no accreditations changed status', () => {
    const initial = {
      accreditations: [
        { id: 'acc-1', status: 'approved' },
        { id: 'acc-2', status: 'created' }
      ]
    }
    const updated = {
      accreditations: [
        { id: 'acc-1', status: 'approved' },
        { id: 'acc-2', status: 'created' }
      ]
    }

    expect(detectAccreditationStatusChanges(initial, updated)).toEqual([])
  })

  it('returns accreditation IDs where status changed', () => {
    const initial = {
      accreditations: [
        { id: 'acc-1', status: 'approved' },
        { id: 'acc-2', status: 'approved' }
      ]
    }
    const updated = {
      accreditations: [
        { id: 'acc-1', status: 'suspended' },
        { id: 'acc-2', status: 'approved' }
      ]
    }

    expect(detectAccreditationStatusChanges(initial, updated)).toEqual([
      'acc-1'
    ])
  })

  it('detects multiple accreditation status changes', () => {
    const initial = {
      accreditations: [
        { id: 'acc-1', status: 'approved' },
        { id: 'acc-2', status: 'approved' },
        { id: 'acc-3', status: 'created' }
      ]
    }
    const updated = {
      accreditations: [
        { id: 'acc-1', status: 'suspended' },
        { id: 'acc-2', status: 'suspended' },
        { id: 'acc-3', status: 'created' }
      ]
    }

    expect(detectAccreditationStatusChanges(initial, updated)).toEqual([
      'acc-1',
      'acc-2'
    ])
  })

  it('handles orgs with no accreditations', () => {
    const initial = { accreditations: [] }
    const updated = { accreditations: [] }

    expect(detectAccreditationStatusChanges(initial, updated)).toEqual([])
  })

  it('handles undefined accreditations arrays', () => {
    const initial = {}
    const updated = {}

    expect(detectAccreditationStatusChanges(initial, updated)).toEqual([])
  })

  it('ignores accreditations only present in updated (newly added)', () => {
    const initial = {
      accreditations: [{ id: 'acc-1', status: 'approved' }]
    }
    const updated = {
      accreditations: [
        { id: 'acc-1', status: 'approved' },
        { id: 'acc-2', status: 'approved' }
      ]
    }

    expect(detectAccreditationStatusChanges(initial, updated)).toEqual([])
  })
})
