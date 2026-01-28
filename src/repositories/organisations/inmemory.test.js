import Hapi from '@hapi/hapi'
import { beforeEach, describe, expect, it as base } from 'vitest'
import { createInMemoryOrganisationsRepository } from './inmemory.js'
import { testOrganisationsRepositoryContract } from './port.contract.js'
import { buildOrganisation, prepareOrgUpdate } from './contract/test-data.js'
import {
  ORGANISATION_STATUS,
  REG_ACC_STATUS
} from '#domain/organisations/model.js'
import { createInMemoryOrganisationsRepositoryPlugin } from './inmemory.plugin.js'

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

      const orgReplacement = prepareOrgUpdate(organisation, {
        status: ORGANISATION_STATUS.REJECTED,
        registrations: [
          {
            ...organisation.registrations[0],
            status: REG_ACC_STATUS.REJECTED
          }
        ],
        accreditations: [
          {
            ...organisation.accreditations[0],
            status: REG_ACC_STATUS.REJECTED
          }
        ]
      })
      await repository.replace(organisation.id, 1, orgReplacement)

      // Read directly from storage (bypassing repository enrichment)
      const storage = repository._getStorageForTesting()
      const storedOrg = storage.find((o) => o._id === organisation.id)

      expect(storedOrg.status).toBeUndefined()
      expect(storedOrg.registrations[0].status).toBeUndefined()
      expect(storedOrg.accreditations[0].status).toBeUndefined()
    })
  })

  describe('plugin wiring', () => {
    it('makes repository available on request via plugin', async () => {
      const server = Hapi.server()
      const plugin = createInMemoryOrganisationsRepositoryPlugin()
      await server.register(plugin)

      server.route({
        method: 'POST',
        path: '/test',
        options: { auth: false },
        handler: async (request) => {
          const org = buildOrganisation()
          await request.organisationsRepository.insert(org)
          const found = await request.organisationsRepository.findById(org.id)
          return { inserted: org.id, found: found?.id }
        }
      })

      await server.initialize()
      const response = await server.inject({ method: 'POST', url: '/test' })
      const result = JSON.parse(response.payload)

      expect(result.found).toBe(result.inserted)
    })
  })
})
