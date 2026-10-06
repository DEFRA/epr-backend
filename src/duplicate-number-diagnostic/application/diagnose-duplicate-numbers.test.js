import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { partialMock } from '#test/type-helpers.js'

import { diagnoseDuplicateNumbers } from './diagnose-duplicate-numbers.js'

const TEST_ORG_ID = 999999

/**
 * @param {Array<string | null>} accreditationNumbers
 * @param {Array<string | null>} [registrationNumbers]
 * @param {Record<string, unknown>} [overrides]
 */
const organisationNumbering = (
  accreditationNumbers,
  registrationNumbers = [],
  overrides = {}
) =>
  buildOrganisation({
    ...overrides,
    accreditations: accreditationNumbers.map((accreditationNumber) =>
      buildAccreditation({ accreditationNumber })
    ),
    registrations: registrationNumbers.map((registrationNumber) =>
      buildRegistration({ registrationNumber })
    )
  })

/** @param {ReturnType<typeof buildOrganisation>[]} organisations */
const diagnose = (organisations) =>
  diagnoseDuplicateNumbers(
    organisations.map((organisation) => partialMock(organisation))
  )

describe('diagnoseDuplicateNumbers', () => {
  it('names every record holding an accreditation number used in two organisations', () => {
    const first = organisationNumbering(['ACC-1'])
    const second = organisationNumbering(['ACC-1'])

    const { rows } = diagnose([first, second])

    expect(rows).toStrictEqual([
      {
        recordType: 'accreditation',
        number: 'ACC-1',
        organisationCount: 2,
        holders: [first, second].map((organisation) => ({
          number: 'ACC-1',
          organisationId: organisation.id,
          orgId: organisation.orgId,
          testOrganisation: false,
          recordId: organisation.accreditations[0].id,
          status: organisation.accreditations[0].status
        }))
      }
    ])
  })

  it('reports an accreditation number used twice in one organisation', () => {
    const { rows } = diagnose([organisationNumbering(['ACC-1', 'ACC-1'])])

    expect(rows).toStrictEqual([
      expect.objectContaining({
        recordType: 'accreditation',
        number: 'ACC-1',
        organisationCount: 1,
        holders: [expect.anything(), expect.anything()]
      })
    ])
  })

  it('reports a registration number used more than once', () => {
    const first = organisationNumbering([], ['REG-1', 'REG-1'])
    const second = organisationNumbering([], ['REG-1'])

    const { rows } = diagnose([first, second])

    expect(rows).toStrictEqual([
      expect.objectContaining({
        recordType: 'registration',
        number: 'REG-1',
        organisationCount: 2,
        holders: [
          expect.objectContaining({ recordId: first.registrations[0].id }),
          expect.objectContaining({ recordId: first.registrations[1].id }),
          expect.objectContaining({ recordId: second.registrations[0].id })
        ]
      })
    ])
  })

  it('groups numbers that differ only by case or surrounding space, keeping each as stored', () => {
    const { rows } = diagnose([
      organisationNumbering(['ACC-1']),
      organisationNumbering([' acc-1 '])
    ])

    expect(rows).toStrictEqual([
      expect.objectContaining({
        number: 'ACC-1',
        holders: [
          expect.objectContaining({ number: 'ACC-1' }),
          expect.objectContaining({ number: ' acc-1 ' })
        ]
      })
    ])
  })

  it('treats a blank number as no number', () => {
    const { rows, summary } = diagnose([
      organisationNumbering(['', '  '], ['  '])
    ])

    expect(rows).toStrictEqual([])
    expect(summary).toStrictEqual(
      expect.objectContaining({
        numberedAccreditations: 0,
        numberedRegistrations: 0
      })
    )
  })

  it('marks a holder in a test organisation', () => {
    const { rows } = diagnose([
      organisationNumbering(['ACC-1'], [], { orgId: TEST_ORG_ID }),
      organisationNumbering(['ACC-1'])
    ])

    expect(rows).toStrictEqual([
      expect.objectContaining({
        holders: [
          expect.objectContaining({ testOrganisation: true }),
          expect.objectContaining({ testOrganisation: false })
        ]
      })
    ])
  })

  it('leaves out numbers held once and records without a number', () => {
    const { rows } = diagnose([
      organisationNumbering(['ACC-1', null], ['REG-1', null]),
      organisationNumbering(['ACC-2', null], ['REG-2', null])
    ])

    expect(rows).toStrictEqual([])
  })

  it('does not treat an accreditation and a registration with the same number as duplicates', () => {
    const { rows } = diagnose([organisationNumbering(['SAME'], ['SAME'])])

    expect(rows).toStrictEqual([])
  })

  it('counts what it scanned and the duplicated numbers of each kind', () => {
    const { summary } = diagnose([
      organisationNumbering(['ACC-1', 'ACC-2', null], ['REG-1', null]),
      organisationNumbering(['ACC-1', 'ACC-2'], ['REG-2']),
      organisationNumbering(['ACC-3'], ['REG-2'])
    ])

    expect(summary).toStrictEqual({
      scannedOrganisations: 3,
      numberedAccreditations: 5,
      numberedRegistrations: 3,
      duplicateAccreditationNumbers: 2,
      duplicateRegistrationNumbers: 1
    })
  })
})
