import { describe, expect, it, vi } from 'vitest'
import { buildRegistration } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildAccreditedOrganisation } from '../routes/test-helpers.js'
import { withAccreditationsFrom } from './with-accreditations-from.js'

/** @import { AccreditationRecord } from '../model.js' */
/** @import { AccreditationsSource } from '../port.js' */

/**
 * @param {Partial<AccreditationRecord>} overrides
 * @returns {AccreditationRecord}
 */
const recordFor = (overrides) => ({
  id: 'held-elsewhere',
  registrationId: 'unknown',
  year: 2026,
  status: 'approved',
  statusHistory: [
    { status: 'approved', updatedAt: '2026-02-01T00:00:00.000Z' }
  ],
  accreditationNumber: 'FROM-SOURCE',
  validFrom: '2026-02-01',
  prnIssuance: { tonnageBand: 'up_to_500', signatories: [] },
  submitterContactDetails: null,
  ...overrides
})

/**
 * @param {AccreditationRecord[]} records
 * @returns {AccreditationsSource & { list: import('vitest').Mock }}
 */
const sourceHolding = (records) => ({
  findForRegistration: vi.fn(),
  list: vi.fn(async ({ registrationIds }) =>
    records.filter(
      (record) =>
        !registrationIds || registrationIds.includes(record.registrationId)
    )
  )
})

/** @param {Array<Record<string, any>>} organisations */
const repositoryHolding = (organisations) =>
  createInMemoryOrganisationsRepository(/** @type {any} */ (organisations))()

describe('withAccreditationsFrom', () => {
  it('replaces stored accreditations with those the source holds', async () => {
    const { organisation, registration } = buildAccreditedOrganisation()
    const source = sourceHolding([
      recordFor({ registrationId: registration.id })
    ])
    const repository = withAccreditationsFrom(
      repositoryHolding([organisation]),
      source
    )

    const read = await repository.findById(organisation.id)

    expect(read.accreditations).toStrictEqual([
      expect.objectContaining({
        id: 'held-elsewhere',
        accreditationNumber: 'FROM-SOURCE',
        validFrom: '2026-02-01',
        validTo: '2026-12-31',
        material: registration.material,
        wasteProcessingType: registration.wasteProcessingType,
        orgName: registration.orgName,
        site: {
          address: {
            line1: registration.site.address.line1,
            postcode: registration.site.address.postcode
          }
        }
      })
    ])
    expect(
      read.registrations.find((r) => r.id === registration.id)?.accreditationId
    ).toBe('held-elsewhere')
  })

  it('leaves no accreditations when the source holds none', async () => {
    const { organisation } = buildAccreditedOrganisation()
    const repository = withAccreditationsFrom(
      repositoryHolding([organisation]),
      sourceHolding([])
    )

    const read = await repository.findById(organisation.id)

    expect(read.accreditations).toStrictEqual([])
  })

  it('gives an undated accreditation no validity window', async () => {
    const { organisation, registration } = buildAccreditedOrganisation()
    const repository = withAccreditationsFrom(
      repositoryHolding([organisation]),
      sourceHolding([
        recordFor({
          registrationId: registration.id,
          status: 'created',
          validFrom: null
        })
      ])
    )

    const [accreditation] = (await repository.findById(organisation.id))
      .accreditations

    expect(accreditation).not.toHaveProperty('validFrom')
    expect(accreditation).not.toHaveProperty('validTo')
  })

  it('gives an exporter accreditation no site', async () => {
    const exporter = buildRegistration({ wasteProcessingType: 'exporter' })
    const { organisation } = buildAccreditedOrganisation()
    const withExporter = { ...organisation, registrations: [exporter] }
    const repository = withAccreditationsFrom(
      repositoryHolding([withExporter]),
      sourceHolding([recordFor({ registrationId: exporter.id })])
    )

    const [accreditation] = (await repository.findById(organisation.id))
      .accreditations

    expect(accreditation).not.toHaveProperty('site')
  })

  it('does not ask the source about an organisation with no registrations', async () => {
    const { organisation } = buildAccreditedOrganisation()
    const source = sourceHolding([])
    const repository = withAccreditationsFrom(
      repositoryHolding([
        { ...organisation, registrations: [], accreditations: [] }
      ]),
      source
    )

    await repository.findById(organisation.id)

    expect(source.list).not.toHaveBeenCalled()
  })

  it('asks the source once for everything when reading every organisation', async () => {
    const first = buildAccreditedOrganisation()
    const second = buildAccreditedOrganisation()
    const source = sourceHolding([
      recordFor({ id: 'one', registrationId: first.registration.id }),
      recordFor({ id: 'two', registrationId: second.registration.id })
    ])
    const repository = withAccreditationsFrom(
      repositoryHolding([first.organisation, second.organisation]),
      source
    )

    const organisations = await repository.findAll()

    expect(source.list).toHaveBeenCalledExactlyOnceWith({ year: 2026 })
    expect(
      organisations.map((o) => o.accreditations.map((a) => a.id))
    ).toStrictEqual(expect.arrayContaining([['one'], ['two']]))
  })

  describe('reads that return organisations', () => {
    const { organisation, registration } = buildAccreditedOrganisation()
    const withIdentity = {
      ...organisation,
      orgId: 612345,
      linkedDefraOrganisation: {
        orgId: 'defra-org',
        orgName: 'Linked',
        linkedBy: { email: 'someone@example.com', id: 'user-1' },
        linkedAt: new Date('2026-01-01')
      }
    }
    const repository = withAccreditationsFrom(
      repositoryHolding([withIdentity]),
      sourceHolding([recordFor({ registrationId: registration.id })])
    )

    /** @param {{ accreditations: Array<{ id: string }> } | null | undefined} result */
    const accreditationIds = (result) => result?.accreditations.map((a) => a.id)

    it.each([
      [
        'find',
        async () => (await repository.find({ page: 1, pageSize: 10 })).items[0]
      ],
      [
        'findByIds',
        async () => (await repository.findByIds([organisation.id]))[0]
      ],
      [
        'findByLinkedDefraOrgId',
        () => repository.findByLinkedDefraOrgId('defra-org')
      ],
      [
        'findByAccreditationNumber',
        () => repository.findByAccreditationNumber('A26SR5120384065PA')
      ],
      [
        'findByRegistrationNumber',
        () =>
          repository.findByRegistrationNumber(registration.registrationNumber)
      ],
      ['findByOrgId', () => repository.findByOrgId(612345)]
    ])('%s carries the source’s accreditations', async (_, read) => {
      expect(accreditationIds(await read())).toStrictEqual(['held-elsewhere'])
    })

    it('findAllLinkableForUser carries the source’s accreditations', async () => {
      const found =
        await repository.findAllLinkableForUser('nobody@example.com')

      expect(found.flatMap((o) => o.accreditations)).toStrictEqual([])
    })

    it('passes a missing organisation through as null', async () => {
      expect(await repository.findByOrgId(999)).toBeNull()
    })
  })

  describe('registration and accreditation lookups', () => {
    const { organisation, registration, registeredOnly } =
      buildAccreditedOrganisation()
    const repository = withAccreditationsFrom(
      repositoryHolding([organisation]),
      sourceHolding([recordFor({ registrationId: registration.id })])
    )

    it('attaches the accreditation the source holds to its registration', async () => {
      const found = await repository.findRegistrationById(
        organisation.id,
        registration.id
      )

      expect(found.accreditation?.id).toBe('held-elsewhere')
    })

    it('returns a registration that holds none as it is', async () => {
      const found = await repository.findRegistrationById(
        organisation.id,
        registeredOnly.id
      )

      expect(found.accreditation ?? null).toBeNull()
    })

    it('throws not found for an unknown registration', async () => {
      await expect(
        repository.findRegistrationById(organisation.id, 'missing')
      ).rejects.toMatchObject({ output: { statusCode: 404 } })
    })

    it('finds an accreditation by the id the source gives it', async () => {
      const found = await repository.findAccreditationById(
        organisation.id,
        'held-elsewhere'
      )

      expect(found.accreditationNumber).toBe('FROM-SOURCE')
    })

    it('throws not found for an accreditation only the organisation document holds', async () => {
      const stored = organisation.accreditations[0].id

      await expect(
        repository.findAccreditationById(organisation.id, stored)
      ).rejects.toMatchObject({ output: { statusCode: 404 } })
    })
  })
})
