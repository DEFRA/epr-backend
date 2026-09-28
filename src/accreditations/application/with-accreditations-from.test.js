import { describe, expect, it, vi } from 'vitest'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildAccreditedOrganisation } from '../routes/test-helpers.js'
import { withAccreditationsFrom } from './with-accreditations-from.js'

/** @import { Accreditation } from '#domain/organisations/accreditation.js' */
/** @import { AccreditationsSource } from '../port.js' */

/**
 * @param {Accreditation[]} accreditations
 * @returns {AccreditationsSource & { list: import('vitest').Mock }}
 */
const sourceHolding = (accreditations) => ({
  findForRegistration: vi.fn(),
  list: vi.fn(async () => accreditations)
})

/** @param {Array<Record<string, any>>} organisations */
const repositoryHolding = (organisations) =>
  createInMemoryOrganisationsRepository(/** @type {any} */ (organisations))()

/**
 * The organisation's accreditation as the source holds it: a different
 * number from the stored one, so a read shows which it came from.
 *
 * @param {ReturnType<typeof buildAccreditedOrganisation>} accredited
 * @returns {Accreditation}
 */
const heldElsewhere = ({ accreditation }) =>
  /** @type {Accreditation} */ ({
    ...accreditation,
    accreditationNumber: 'FROM-SOURCE'
  })

describe('withAccreditationsFrom', () => {
  it('replaces stored accreditations with those the source holds', async () => {
    const accredited = buildAccreditedOrganisation()
    const repository = withAccreditationsFrom(
      repositoryHolding([accredited.organisation]),
      sourceHolding([heldElsewhere(accredited)])
    )

    const read = await repository.findById(accredited.organisation.id)

    expect(read.accreditations).toStrictEqual([heldElsewhere(accredited)])
  })

  it('leaves out accreditations no registration links to', async () => {
    const accredited = buildAccreditedOrganisation()
    const repository = withAccreditationsFrom(
      repositoryHolding([accredited.organisation]),
      sourceHolding([
        heldElsewhere(accredited),
        /** @type {Accreditation} */ ({ ...accredited.accreditation, id: 'x' })
      ])
    )

    const read = await repository.findById(accredited.organisation.id)

    expect(read.accreditations.map((a) => a.id)).toStrictEqual([
      accredited.accreditation.id
    ])
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
    const source = sourceHolding([heldElsewhere(first), heldElsewhere(second)])
    const repository = withAccreditationsFrom(
      repositoryHolding([first.organisation, second.organisation]),
      source
    )

    const organisations = await repository.findAll()

    expect(source.list).toHaveBeenCalledExactlyOnceWith({ year: 2026 })
    expect(
      organisations.map((o) => o.accreditations.map((a) => a.id))
    ).toStrictEqual(
      expect.arrayContaining([
        [first.accreditation.id],
        [second.accreditation.id]
      ])
    )
  })

  describe('reads that return organisations', () => {
    const accredited = buildAccreditedOrganisation()
    const withIdentity = {
      ...accredited.organisation,
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
      sourceHolding([heldElsewhere(accredited)])
    )

    /** @param {{ accreditations: Array<{ accreditationNumber: string | null }> } | null | undefined} result */
    const numbers = (result) =>
      result?.accreditations.map((a) => a.accreditationNumber)

    it.each([
      [
        'find',
        async () => (await repository.find({ page: 1, pageSize: 10 })).items[0]
      ],
      [
        'findByIds',
        async () =>
          (await repository.findByIds([accredited.organisation.id]))[0]
      ],
      [
        'findByRegistrationIds',
        async () =>
          (
            await repository.findByRegistrationIds([accredited.registration.id])
          )[0]
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
          repository.findByRegistrationNumber(
            accredited.registration.registrationNumber
          )
      ],
      ['findByOrgId', () => repository.findByOrgId(612345)]
    ])('%s carries the source’s accreditations', async (_, read) => {
      expect(numbers(await read())).toStrictEqual(['FROM-SOURCE'])
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
    const accredited = buildAccreditedOrganisation()
    const { organisation, registration, registeredOnly, accreditation } =
      accredited
    const repository = withAccreditationsFrom(
      repositoryHolding([organisation]),
      sourceHolding([heldElsewhere(accredited)])
    )

    it('attaches the accreditation the source holds to its registration', async () => {
      const found = await repository.findRegistrationById(
        organisation.id,
        registration.id
      )

      expect(found.accreditation?.accreditationNumber).toBe('FROM-SOURCE')
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

    it('finds an accreditation as the source holds it', async () => {
      const found = await repository.findAccreditationById(
        organisation.id,
        accreditation.id
      )

      expect(found.accreditationNumber).toBe('FROM-SOURCE')
    })

    it('throws not found for an accreditation the source does not hold', async () => {
      await expect(
        repository.findAccreditationById(organisation.id, 'missing')
      ).rejects.toMatchObject({ output: { statusCode: 404 } })
    })
  })
})
