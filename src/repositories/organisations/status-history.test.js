import { prepareStatusHistoryAppend } from './status-history.js'

/**
 * Derived-status organisation test double. Cast through unknown because the
 * fixture intentionally carries only the fields the pure helper reads.
 *
 * @param {object} [overrides]
 * @returns {import('#domain/organisations/model.js').Organisation}
 */
const orgWith = (overrides = {}) =>
  /** @type {import('#domain/organisations/model.js').Organisation} */ (
    /** @type {unknown} */ ({
      id: 'org-1',
      version: 4,
      status: 'created',
      statusHistory: [{ status: 'created', updatedAt: new Date('2020-01-01') }],
      registrations: [],
      accreditations: [],
      ...overrides
    })
  )

const reg = (overrides = {}) => ({
  id: 'reg-1',
  status: 'approved',
  material: 'plastic',
  wasteProcessingType: 'reprocessor',
  registrationNumber: 'R1',
  site: { address: { postcode: 'AB1 2CD' } },
  validFrom: new Date('2024-01-01'),
  validTo: new Date('2024-12-31'),
  statusHistory: [{ status: 'approved', updatedAt: new Date('2020-01-01') }],
  ...overrides
})

const acc = (overrides = {}) => ({
  id: 'acc-1',
  status: 'approved',
  material: 'plastic',
  wasteProcessingType: 'reprocessor',
  accreditationNumber: 'A1',
  site: { address: { postcode: 'AB1 2CD' } },
  validFrom: new Date('2024-01-01'),
  validTo: new Date('2024-12-31'),
  statusHistory: [{ status: 'approved', updatedAt: new Date('2020-01-01') }],
  ...overrides
})

describe('prepareStatusHistoryAppend', () => {
  it('appends an organisation status entry', () => {
    const org = orgWith({
      status: 'created',
      registrations: [reg({ status: 'approved' })]
    })
    const result = prepareStatusHistoryAppend(
      org,
      { type: 'organisation' },
      'approved'
    )
    expect(result.previousStatus).toBe('created')
    expect(result.changes).toEqual([
      {
        itemType: 'organisation',
        entry: {
          status: 'approved',
          updatedAt: expect.any(Date)
        }
      }
    ])
  })

  it('rejects organisation transition to active (link-flow owned)', () => {
    const org = orgWith({ status: 'approved', registrations: [reg()] })
    expect(() =>
      prepareStatusHistoryAppend(org, { type: 'organisation' }, 'active')
    ).toThrow(/active/i)
  })

  it('rejects approving an organisation with no approved registration', () => {
    const org = orgWith({
      status: 'created',
      registrations: [reg({ status: 'created' })]
    })
    expect(() =>
      prepareStatusHistoryAppend(org, { type: 'organisation' }, 'approved')
    ).toThrow(/at least one approved registration/i)
  })

  it('rejects an invalid organisation transition with 422', () => {
    const org = orgWith({ status: 'approved', registrations: [reg()] })
    expect(() =>
      prepareStatusHistoryAppend(org, { type: 'organisation' }, 'rejected')
    ).toThrow(/Cannot transition organisation status/i)
  })

  it('appends a registration status entry', () => {
    const org = orgWith({
      registrations: [reg({ status: 'created', registrationNumber: 'R1' })]
    })
    const result = prepareStatusHistoryAppend(
      org,
      { type: 'registration', registrationId: 'reg-1' },
      'approved'
    )
    expect(result.changes).toEqual([
      {
        itemType: 'registration',
        id: 'reg-1',
        entry: {
          status: 'approved',
          updatedAt: expect.any(Date)
        }
      }
    ])
  })

  it('cascades a registration suspend to its linked accreditation', () => {
    const org = orgWith({
      registrations: [
        reg({ id: 'reg-1', status: 'approved', accreditationId: 'acc-1' })
      ],
      accreditations: [acc({ id: 'acc-1', status: 'approved' })]
    })
    const result = prepareStatusHistoryAppend(
      org,
      { type: 'registration', registrationId: 'reg-1' },
      'suspended'
    )
    expect(result.changes).toContainEqual({
      itemType: 'registration',
      id: 'reg-1',
      entry: {
        status: 'suspended',
        updatedAt: expect.any(Date)
      }
    })
    expect(result.changes).toContainEqual({
      itemType: 'accreditation',
      id: 'acc-1',
      entry: {
        status: 'suspended',
        updatedAt: expect.any(Date)
      }
    })
  })

  it('cascades a direct registration cancel to its linked accreditation', () => {
    const org = orgWith({
      registrations: [
        reg({ id: 'reg-1', status: 'approved', accreditationId: 'acc-1' })
      ],
      accreditations: [acc({ id: 'acc-1', status: 'approved' })]
    })
    const result = prepareStatusHistoryAppend(
      org,
      { type: 'registration', registrationId: 'reg-1' },
      'cancelled'
    )
    expect(result.changes).toContainEqual({
      itemType: 'registration',
      id: 'reg-1',
      entry: {
        status: 'cancelled',
        updatedAt: expect.any(Date)
      }
    })
    expect(result.changes).toContainEqual({
      itemType: 'accreditation',
      id: 'acc-1',
      entry: {
        status: 'cancelled',
        updatedAt: expect.any(Date)
      }
    })
  })

  it('reinstates a cancelled registration to approved', () => {
    const org = orgWith({
      registrations: [reg({ id: 'reg-1', status: 'cancelled' })]
    })
    const result = prepareStatusHistoryAppend(
      org,
      { type: 'registration', registrationId: 'reg-1' },
      'approved'
    )
    expect(result.previousStatus).toBe('cancelled')
    expect(result.changes).toEqual([
      {
        itemType: 'registration',
        id: 'reg-1',
        entry: {
          status: 'approved',
          updatedAt: expect.any(Date)
        }
      }
    ])
  })

  it('appends an accreditation status entry', () => {
    const org = orgWith({
      registrations: [
        reg({ id: 'reg-1', status: 'approved', accreditationId: 'acc-1' })
      ],
      accreditations: [acc({ id: 'acc-1', status: 'approved' })]
    })
    const result = prepareStatusHistoryAppend(
      org,
      {
        type: 'accreditation',
        registrationId: 'reg-1',
        accreditationId: 'acc-1'
      },
      'suspended'
    )
    expect(result.previousStatus).toBe('approved')
    expect(result.changes).toEqual([
      {
        itemType: 'accreditation',
        id: 'acc-1',
        entry: {
          status: 'suspended',
          updatedAt: expect.any(Date)
        }
      }
    ])
  })

  it('throws notFound for an unknown registration on the accreditation path', () => {
    const org = orgWith({
      registrations: [
        reg({ id: 'reg-1', status: 'approved', accreditationId: 'acc-1' })
      ],
      accreditations: [acc({ id: 'acc-1', status: 'approved' })]
    })
    expect(() =>
      prepareStatusHistoryAppend(
        org,
        {
          type: 'accreditation',
          registrationId: 'nope',
          accreditationId: 'acc-1'
        },
        'suspended'
      )
    ).toThrow(/registration nope not found/i)
  })

  it('throws notFound when the accreditation is not linked to the registration', () => {
    const org = orgWith({
      registrations: [
        reg({ id: 'reg-1', status: 'approved', accreditationId: 'acc-1' })
      ],
      accreditations: [acc({ id: 'acc-1', status: 'approved' })]
    })
    expect(() =>
      prepareStatusHistoryAppend(
        org,
        {
          type: 'accreditation',
          registrationId: 'reg-1',
          accreditationId: 'acc-2'
        },
        'suspended'
      )
    ).toThrow(/not linked to registration/i)
  })

  it('rejects approving an accreditation not linked to an approved registration', () => {
    const org = orgWith({
      registrations: [
        reg({ id: 'reg-1', status: 'created', accreditationId: 'acc-1' })
      ],
      accreditations: [acc({ id: 'acc-1', status: 'created' })]
    })
    expect(() =>
      prepareStatusHistoryAppend(
        org,
        {
          type: 'accreditation',
          registrationId: 'reg-1',
          accreditationId: 'acc-1'
        },
        'approved'
      )
    ).toThrow(/not linked to an approved registration/i)
  })

  it('throws notFound when the registration id is unknown', () => {
    const org = orgWith({ registrations: [reg({ id: 'reg-1' })] })
    expect(() =>
      prepareStatusHistoryAppend(
        org,
        { type: 'registration', registrationId: 'nope' },
        'suspended'
      )
    ).toThrow(/not found/i)
  })

  it('suspends one registration, leaving other items and unaffected accreditations untouched', () => {
    const org = orgWith({
      registrations: [
        reg({ id: 'reg-1', status: 'approved', accreditationId: 'acc-1' }),
        reg({
          id: 'reg-2',
          status: 'approved',
          accreditationId: 'acc-2',
          site: { address: { postcode: 'XY9 9ZZ' } }
        })
      ],
      accreditations: [
        acc({ id: 'acc-1', status: 'approved' }),
        acc({
          id: 'acc-2',
          status: 'approved',
          site: { address: { postcode: 'XY9 9ZZ' } }
        })
      ]
    })
    const result = prepareStatusHistoryAppend(
      org,
      { type: 'registration', registrationId: 'reg-1' },
      'suspended'
    )
    expect(result.changes).toContainEqual({
      itemType: 'registration',
      id: 'reg-1',
      entry: {
        status: 'suspended',
        updatedAt: expect.any(Date)
      }
    })
    expect(result.changes).toContainEqual({
      itemType: 'accreditation',
      id: 'acc-1',
      entry: {
        status: 'suspended',
        updatedAt: expect.any(Date)
      }
    })
    expect(result.changes).toHaveLength(2)
  })

  it('suspends one accreditation, leaving other accreditations untouched', () => {
    const org = orgWith({
      registrations: [
        reg({ id: 'reg-1', status: 'approved', accreditationId: 'acc-1' }),
        reg({
          id: 'reg-2',
          status: 'approved',
          accreditationId: 'acc-2',
          site: { address: { postcode: 'XY9 9ZZ' } }
        })
      ],
      accreditations: [
        acc({ id: 'acc-1', status: 'approved' }),
        acc({
          id: 'acc-2',
          status: 'approved',
          site: { address: { postcode: 'XY9 9ZZ' } }
        })
      ]
    })
    const result = prepareStatusHistoryAppend(
      org,
      {
        type: 'accreditation',
        registrationId: 'reg-1',
        accreditationId: 'acc-1'
      },
      'suspended'
    )
    expect(result.changes).toEqual([
      {
        itemType: 'accreditation',
        id: 'acc-1',
        entry: {
          status: 'suspended',
          updatedAt: expect.any(Date)
        }
      }
    ])
  })
})
