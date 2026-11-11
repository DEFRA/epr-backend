import {
  indexAccreditationsByLedger,
  ledgerKey
} from './accreditation-index.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'

const accreditation = { id: 'acc-1', accreditationNumber: 'ACC-1' }

/** @param {object[]} registrations */
const organisationWith = (registrations) =>
  /** @type {any} */ ({
    organisationNumber: '500001',
    registrations,
    accreditations: [accreditation]
  })

describe('indexAccreditationsByLedger', () => {
  it('indexes a registration under the ledger of the accreditation it links to', () => {
    const registration = {
      registrationNumber: 'REG-1',
      accreditationId: 'acc-1'
    }

    const index = indexAccreditationsByLedger([
      organisationWith([registration])
    ])

    const key = ledgerKey({
      organisationNumber: toOrganisationNumber('500001'),
      registrationNumber: toRegistrationNumber('REG-1'),
      accreditationNumber: toAccreditationNumber('ACC-1')
    })
    expect(index.get(key)).toMatchObject({ registration, accreditation })
  })

  it('leaves out a registered-only registration, which links to no accreditation', () => {
    const index = indexAccreditationsByLedger([
      organisationWith([{ registrationNumber: 'REG-1' }])
    ])

    expect(index.size).toBe(0)
  })

  it('leaves out a registration whose accreditation the organisation does not hold', () => {
    const index = indexAccreditationsByLedger([
      organisationWith([
        { registrationNumber: 'REG-1', accreditationId: 'acc-missing' }
      ])
    ])

    expect(index.size).toBe(0)
  })
})
