import { detectAccreditationStatusChanges } from './detect-accreditation-status-changes.js'

describe('detectAccreditationStatusChanges', () => {
  it('returns empty array when no accreditations changed status', () => {
    const initial = {
      accreditations: [
        { id: 'acc-1', status: 'approved' },
        { id: 'acc-2', status: 'approved' }
      ]
    }
    const updated = {
      accreditations: [
        { id: 'acc-1', status: 'approved' },
        { id: 'acc-2', status: 'approved' }
      ]
    }

    expect(detectAccreditationStatusChanges(initial, updated)).toEqual([])
  })

  it('detects a single accreditation status change', () => {
    const initial = {
      accreditations: [{ id: 'acc-1', status: 'approved' }]
    }
    const updated = {
      accreditations: [{ id: 'acc-1', status: 'suspended' }]
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
        { id: 'acc-2', status: 'approved' },
        { id: 'acc-3', status: 'approved' }
      ]
    }

    expect(detectAccreditationStatusChanges(initial, updated)).toEqual([
      'acc-1',
      'acc-3'
    ])
  })

  it('ignores new accreditations that did not exist in the initial state', () => {
    const initial = {
      accreditations: [{ id: 'acc-1', status: 'approved' }]
    }
    const updated = {
      accreditations: [
        { id: 'acc-1', status: 'approved' },
        { id: 'acc-new', status: 'created' }
      ]
    }

    expect(detectAccreditationStatusChanges(initial, updated)).toEqual([])
  })

  it('handles organisations with no accreditations', () => {
    const initial = { accreditations: [] }
    const updated = { accreditations: [] }

    expect(detectAccreditationStatusChanges(initial, updated)).toEqual([])
  })

  it('handles undefined accreditations arrays gracefully', () => {
    expect(detectAccreditationStatusChanges({}, {})).toEqual([])
  })
})
