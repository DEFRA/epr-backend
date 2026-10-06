import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { partialMock } from '#test/type-helpers.js'
import {
  REPROCESSOR_NUMBER,
  accreditation,
  granted,
  reprocessor
} from './organisation-view-test-helpers.js'
import {
  findAccreditationForYear,
  findRegistrationByNumber
} from './natural-keys.js'

/**
 * @param {ReturnType<typeof buildOrganisation>} organisation
 */
const findIn = (organisation) =>
  findRegistrationByNumber(
    createInMemoryOrganisationsRepository([partialMock(organisation)])(),
    organisation.orgId,
    REPROCESSOR_NUMBER
  )

describe('findRegistrationByNumber', () => {
  it('finds a registration by its organisation and registration numbers', async () => {
    const registration = reprocessor()
    const organisation = buildOrganisation({ registrations: [registration] })

    const found = await findIn(organisation)

    expect(found.organisation.id).toBe(organisation.id)
    expect(found.registration.id).toBe(registration.id)
  })

  it('rejects an unknown organisation', async () => {
    const organisationsRepository = createInMemoryOrganisationsRepository([])()

    await expect(
      findRegistrationByNumber(organisationsRepository, 1, REPROCESSOR_NUMBER)
    ).rejects.toMatchObject({ output: { statusCode: 404 } })
  })

  it.each([
    [
      'a registration the read model does not serve',
      [
        reprocessor({
          statusHistory: [{ status: 'created', updatedAt: '2026-01-01' }]
        })
      ]
    ],
    [
      'a registration the read model cannot show',
      [reprocessor({ validFrom: undefined })]
    ],
    ['a number two registrations share', [reprocessor(), reprocessor()]]
  ])('rejects %s', async (_, registrations) => {
    await expect(
      findIn(buildOrganisation({ registrations }))
    ).rejects.toMatchObject({ output: { statusCode: 404 } })
  })

  it('finds the served registration when an unserved one shares its number', async () => {
    const served = reprocessor()
    const organisation = buildOrganisation({
      registrations: [reprocessor({ validFrom: undefined }), served]
    })

    const found = await findIn(organisation)

    expect(found.registration.id).toBe(served.id)
  })
})

describe('findAccreditationForYear', () => {
  /**
   * @param {Parameters<typeof accreditation>[0]} [overrides]
   */
  const accreditedRegistration = async (overrides = {}) => {
    const accredited = accreditation(overrides)
    const { organisation, registration } = await findIn(
      buildOrganisation({
        registrations: [reprocessor({ accreditationId: accredited.id })],
        accreditations: [accredited]
      })
    )
    return { accredited, organisation, registration }
  }

  it("finds a registration's accreditation for a year", async () => {
    const { accredited, organisation, registration } =
      await accreditedRegistration()

    expect(findAccreditationForYear(organisation, registration, 2026).id).toBe(
      accredited.id
    )
  })

  it.each([
    ['another year', {}, 2027],
    [
      'an accreditation with no number',
      { accreditationNumber: undefined },
      2026
    ],
    ['an accreditation with no start date', { validFrom: undefined }, 2026],
    [
      'an accreditation the read model does not serve',
      { statusHistory: granted('rejected') },
      2026
    ]
  ])('rejects %s', async (_, overrides, year) => {
    const { organisation, registration } =
      await accreditedRegistration(overrides)

    expect(() =>
      findAccreditationForYear(organisation, registration, year)
    ).toThrow(
      expect.objectContaining({
        output: expect.objectContaining({ statusCode: 404 })
      })
    )
  })
})
