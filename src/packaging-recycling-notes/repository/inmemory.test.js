import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { createMockLogger } from '#test/mock-logger.js'
import { ObjectId } from 'mongodb'
import { it as base, describe, expect } from 'vitest'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import {
  buildAwaitingAuthorisationPrn,
  buildCancelledPrn,
  generateTestPrnNumber
} from './contract/test-data.js'
import { createInMemoryPackagingRecyclingNotesRepository } from './inmemory.plugin.js'
import { testPackagingRecyclingNotesRepositoryContract } from './port.contract.js'

/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */
/** @import { PackagingRecyclingNote } from '#packaging-recycling-notes/domain/model.js' */
/** @import { PackagingRecyclingNotesRepository, PackagingRecyclingNotesRepositoryFactory } from './port.js' */

/**
 * @typedef {object} PrnRepoFixtures
 * @property {PackagingRecyclingNotesRepositoryFactory} prnRepositoryFactory
 * @property {PackagingRecyclingNotesRepository} prnRepository
 */

const it = /** @type {import('vitest').TestAPI<PrnRepoFixtures>} */ (
  base.extend({
    // eslint-disable-next-line no-empty-pattern
    prnRepositoryFactory: async ({}, use) => {
      const factory = createInMemoryPackagingRecyclingNotesRepository([])
      await use(factory)
    },

    prnRepository: async ({ prnRepositoryFactory }, use) => {
      const mockLogger = createMockLogger()
      const repository = prnRepositoryFactory(mockLogger)
      await use(repository)
    }
  })
)

describe('In-memory packaging recycling notes repository', () => {
  testPackagingRecyclingNotesRepositoryContract(it)
})

describe('in-memory adapter organisation exclusion', () => {
  /**
   * @param {string} name
   * @param {OrganisationNumber} organisationNumber
   */
  const organisationNumbered = (name, organisationNumber) => ({
    id: new ObjectId().toHexString(),
    name,
    organisationNumber
  })

  base(
    'should exclude PRNs belonging to excluded organisation numbers',
    async () => {
      const testOrganisationNumber = toOrganisationNumber('500001')

      const repository = createInMemoryPackagingRecyclingNotesRepository(
        [],
        [testOrganisationNumber]
      )(createMockLogger())

      const testPrn = await repository.create(
        buildCancelledPrn({
          prnNumber: generateTestPrnNumber(),
          organisation: organisationNumbered('Test Org', testOrganisationNumber)
        })
      )
      const realPrn = await repository.create(
        buildCancelledPrn({
          prnNumber: generateTestPrnNumber(),
          organisation: organisationNumbered(
            'Real Org',
            toOrganisationNumber('500002')
          )
        })
      )

      const result = await repository.findByStatus({
        statuses: [PRN_STATUS.CANCELLED],
        limit: 200
      })

      const ids = result.items.map((p) => p.id)
      expect(ids).toContain(realPrn.id)
      expect(ids).not.toContain(testPrn.id)
    }
  )

  base(
    'should return all items when no organisation numbers are excluded',
    async () => {
      const repository = createInMemoryPackagingRecyclingNotesRepository(
        [],
        []
      )(createMockLogger())

      const prn = await repository.create(
        buildCancelledPrn({ prnNumber: generateTestPrnNumber() })
      )

      const result = await repository.findByStatus({
        statuses: [PRN_STATUS.CANCELLED],
        limit: 200
      })

      expect(result.items.map((p) => p.id)).toContain(prn.id)
    }
  )

  base(
    'should derive hasMore and nextCursor from the filtered universe',
    async () => {
      const testOrganisationNumber = toOrganisationNumber('500003')

      const repository = createInMemoryPackagingRecyclingNotesRepository(
        [],
        [testOrganisationNumber]
      )(createMockLogger())

      const sentinel = await repository.create(
        buildCancelledPrn({ prnNumber: generateTestPrnNumber() })
      )
      const realPrn1 = await repository.create(
        buildCancelledPrn({
          prnNumber: generateTestPrnNumber(),
          organisation: organisationNumbered(
            'Real Org 1',
            toOrganisationNumber('500004')
          )
        })
      )
      const realPrn2 = await repository.create(
        buildCancelledPrn({
          prnNumber: generateTestPrnNumber(),
          organisation: organisationNumbered(
            'Real Org 2',
            toOrganisationNumber('500005')
          )
        })
      )
      await repository.create(
        buildCancelledPrn({
          prnNumber: generateTestPrnNumber(),
          organisation: organisationNumbered('Test Org', testOrganisationNumber)
        })
      )

      const result = await repository.findByStatus({
        statuses: [PRN_STATUS.CANCELLED],
        cursor: sentinel.id,
        limit: 1
      })

      expect(result.items).toHaveLength(1)
      expect(result.items[0].id).toBe(realPrn1.id)
      expect(result.hasMore).toBe(true)
      expect(result.nextCursor).toBe(realPrn1.id)
      expect(result.items.map((p) => p.id)).not.toContain(realPrn2.id)
    }
  )
})

describe('in-memory adapter legacy documents without a version field', () => {
  const buildVersionlessSeed = () => {
    const id = new ObjectId().toHexString()
    const { version: _version, ...prnWithoutVersion } =
      buildAwaitingAuthorisationPrn()
    // Legacy documents predate the version field; the adapter defaults it to 1.
    const prn = /** @type {PackagingRecyclingNote} */ (
      /** @type {unknown} */ ({ ...prnWithoutVersion, id })
    )
    return { id, prn }
  }

  base('reads back as version 1', async () => {
    const { id, prn } = buildVersionlessSeed()
    const repository = createInMemoryPackagingRecyclingNotesRepository([prn])(
      createMockLogger()
    )

    const found = await repository.findById(id)

    expect(found?.version).toBe(1)
  })

  base(
    'accepts a CAS update with version 1 and bumps to version 2',
    async () => {
      const { id, prn } = buildVersionlessSeed()
      const repository = createInMemoryPackagingRecyclingNotesRepository([prn])(
        createMockLogger()
      )

      const updated = await repository.updateStatus({
        id,
        version: 1,
        status: PRN_STATUS.AWAITING_ACCEPTANCE,
        updatedBy: { id: 'user-issuer', name: 'Issuer User' },
        updatedAt: new Date(),
        prnNumber: `TT2688888`
      })

      expect(updated?.version).toBe(2)
      expect(updated?.status.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)
    }
  )
})
