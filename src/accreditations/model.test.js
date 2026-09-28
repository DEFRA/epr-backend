import { describe, expect, it } from 'vitest'
import { toAccreditationRecord } from './model.js'

/** @import { Accreditation } from '#domain/organisations/accreditation.js' */

describe('toAccreditationRecord', () => {
  it('gives an accreditation not yet granted nulls for what it lacks', () => {
    const accreditation = /** @type {Accreditation} */ (
      /** @type {unknown} */ ({
        id: 'acc-1',
        status: 'created',
        statusHistory: [{ status: 'created', updatedAt: '2025-08-20' }]
      })
    )

    expect(toAccreditationRecord(accreditation, 'reg-1')).toStrictEqual({
      id: 'acc-1',
      registrationId: 'reg-1',
      year: 2026,
      status: 'created',
      statusHistory: [{ status: 'created', updatedAt: '2025-08-20' }],
      accreditationNumber: null,
      validFrom: null,
      prnIssuance: { tonnageBand: null, signatories: [] },
      submitterContactDetails: null
    })
  })
})
