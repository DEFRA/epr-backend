import { describe, it as base, expect, beforeEach } from 'vitest'
import { createInMemoryOrganisationsRepository } from './inmemory.js'
import { testOrganisationsRepositoryContract } from './port.contract.js'
import { buildOrganisation } from './contract/test-data.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  organisationsRepository: async ({}, use) => {
    const factory = createInMemoryOrganisationsRepository([])
    await use(factory)
  }
})

describe('In-memory organisations repository', () => {
  describe('organisations repository contract', () => {
    testOrganisationsRepositoryContract(it)
  })

  describe('In-memory specific: status field storage', () => {
    let repository

    beforeEach(() => {
      const factory = createInMemoryOrganisationsRepository([])
      repository = factory()
    })

    it('does not persist status field to storage', async () => {
      const organisation = buildOrganisation()
      await repository.insert(organisation)

      await repository.update(organisation.id, 1, {
        status: 'rejected',
        registrations: [
          {
            ...organisation.registrations[0],
            status: 'rejected'
          }
        ],
        accreditations: [
          {
            ...organisation.accreditations[0],
            status: 'archived'
          }
        ]
      })

      // Read directly from storage (bypassing repository enrichment)
      const storage = repository._getStorageForTesting()
      const storedOrg = storage.find((o) => o.id === organisation.id)

      expect(storedOrg.status == null).toBe(true)
      expect(storedOrg.registrations[0].status == null).toBe(true)
      expect(storedOrg.accreditations[0].status == null).toBe(true)
    })
  })
})
