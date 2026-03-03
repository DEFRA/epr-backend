import { detectAccreditationStatusChanges } from './detect-accreditation-changes.js'

describe('detectAccreditationStatusChanges', () => {
  it('returns empty array when updated has no accreditations', () => {
    const result = detectAccreditationStatusChanges(
      { accreditations: [] },
      { accreditations: [] }
    )

    expect(result).toEqual([])
  })

  it('returns empty array when updated is null', () => {
    const result = detectAccreditationStatusChanges({}, null)

    expect(result).toEqual([])
  })

  it('returns empty array when updated accreditations is undefined', () => {
    const result = detectAccreditationStatusChanges({}, {})

    expect(result).toEqual([])
  })

  it('returns empty array when no statuses have changed', () => {
    const initial = {
      accreditations: [{ id: 'acc-1', status: 'approved' }],
      registrations: [{ id: 'reg-1', accreditationId: 'acc-1' }]
    }
    const updated = {
      accreditations: [{ id: 'acc-1', status: 'approved' }],
      registrations: [{ id: 'reg-1', accreditationId: 'acc-1' }]
    }

    const result = detectAccreditationStatusChanges(initial, updated)

    expect(result).toEqual([])
  })

  it('detects a status change and returns the accreditation with registrationId', () => {
    const initial = {
      accreditations: [{ id: 'acc-1', status: 'approved' }],
      registrations: [{ id: 'reg-1', accreditationId: 'acc-1' }]
    }
    const updated = {
      accreditations: [{ id: 'acc-1', status: 'suspended' }],
      registrations: [{ id: 'reg-1', accreditationId: 'acc-1' }]
    }

    const result = detectAccreditationStatusChanges(initial, updated)

    expect(result).toEqual([
      {
        accreditationId: 'acc-1',
        registrationId: 'reg-1',
        previousStatus: 'approved',
        newStatus: 'suspended'
      }
    ])
  })

  it('detects multiple status changes', () => {
    const initial = {
      accreditations: [
        { id: 'acc-1', status: 'approved' },
        { id: 'acc-2', status: 'pending' }
      ],
      registrations: [
        { id: 'reg-1', accreditationId: 'acc-1' },
        { id: 'reg-2', accreditationId: 'acc-2' }
      ]
    }
    const updated = {
      accreditations: [
        { id: 'acc-1', status: 'suspended' },
        { id: 'acc-2', status: 'approved' }
      ],
      registrations: [
        { id: 'reg-1', accreditationId: 'acc-1' },
        { id: 'reg-2', accreditationId: 'acc-2' }
      ]
    }

    const result = detectAccreditationStatusChanges(initial, updated)

    expect(result).toHaveLength(2)
    expect(result).toContainEqual({
      accreditationId: 'acc-1',
      registrationId: 'reg-1',
      previousStatus: 'approved',
      newStatus: 'suspended'
    })
    expect(result).toContainEqual({
      accreditationId: 'acc-2',
      registrationId: 'reg-2',
      previousStatus: 'pending',
      newStatus: 'approved'
    })
  })

  it('ignores accreditations that are new (not in initial)', () => {
    const initial = {
      accreditations: [],
      registrations: []
    }
    const updated = {
      accreditations: [{ id: 'acc-new', status: 'approved' }],
      registrations: [{ id: 'reg-1', accreditationId: 'acc-new' }]
    }

    const result = detectAccreditationStatusChanges(initial, updated)

    expect(result).toEqual([])
  })

  it('ignores accreditations without a status in initial', () => {
    const initial = {
      accreditations: [{ id: 'acc-1' }],
      registrations: [{ id: 'reg-1', accreditationId: 'acc-1' }]
    }
    const updated = {
      accreditations: [{ id: 'acc-1', status: 'approved' }],
      registrations: [{ id: 'reg-1', accreditationId: 'acc-1' }]
    }

    const result = detectAccreditationStatusChanges(initial, updated)

    expect(result).toEqual([])
  })

  it('ignores accreditations without a status in updated', () => {
    const initial = {
      accreditations: [{ id: 'acc-1', status: 'approved' }],
      registrations: [{ id: 'reg-1', accreditationId: 'acc-1' }]
    }
    const updated = {
      accreditations: [{ id: 'acc-1' }],
      registrations: [{ id: 'reg-1', accreditationId: 'acc-1' }]
    }

    const result = detectAccreditationStatusChanges(initial, updated)

    expect(result).toEqual([])
  })

  it('skips accreditations with no linked registration', () => {
    const initial = {
      accreditations: [{ id: 'acc-1', status: 'approved' }],
      registrations: []
    }
    const updated = {
      accreditations: [{ id: 'acc-1', status: 'suspended' }],
      registrations: []
    }

    const result = detectAccreditationStatusChanges(initial, updated)

    expect(result).toEqual([])
  })

  it('handles initial with null accreditations', () => {
    const initial = { accreditations: null }
    const updated = {
      accreditations: [{ id: 'acc-1', status: 'approved' }],
      registrations: [{ id: 'reg-1', accreditationId: 'acc-1' }]
    }

    const result = detectAccreditationStatusChanges(initial, updated)

    expect(result).toEqual([])
  })

  it('handles missing registrations array in updated', () => {
    const initial = {
      accreditations: [{ id: 'acc-1', status: 'approved' }],
      registrations: [{ id: 'reg-1', accreditationId: 'acc-1' }]
    }
    const updated = {
      accreditations: [{ id: 'acc-1', status: 'suspended' }]
    }

    const result = detectAccreditationStatusChanges(initial, updated)

    expect(result).toEqual([])
  })

  it('handles registrations without accreditationId', () => {
    const initial = {
      accreditations: [{ id: 'acc-1', status: 'approved' }],
      registrations: [{ id: 'reg-1' }]
    }
    const updated = {
      accreditations: [{ id: 'acc-1', status: 'suspended' }],
      registrations: [{ id: 'reg-1' }]
    }

    const result = detectAccreditationStatusChanges(initial, updated)

    expect(result).toEqual([])
  })
})
