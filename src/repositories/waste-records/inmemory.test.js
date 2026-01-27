import Hapi from '@hapi/hapi'
import { describe, expect, it as base } from 'vitest'
import { createInMemoryWasteRecordsRepository } from './inmemory.js'
import { testWasteRecordsRepositoryContract } from './port.contract.js'
import {
  buildVersionData,
  toWasteRecordVersions
} from './contract/test-data.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { inMemoryWasteRecordsRepositoryPlugin } from '#plugins/repositories/inmemory-waste-records-repository-plugin.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  wasteRecordsRepository: async ({}, use) => {
    const factory = createInMemoryWasteRecordsRepository([])
    await use(factory)
  }
})

describe('In-memory waste records repository', () => {
  describe('waste records repository contract', () => {
    testWasteRecordsRepositoryContract(it)
  })

  describe('plugin wiring', () => {
    it('makes repository available on request via plugin', async () => {
      const server = Hapi.server()
      await server.register(inMemoryWasteRecordsRepositoryPlugin)

      server.route({
        method: 'POST',
        path: '/test',
        options: { auth: false },
        handler: async (request) => {
          const organisationId = 'org-123'
          const registrationId = 'reg-456'

          const wasteRecordVersions = toWasteRecordVersions({
            [WASTE_RECORD_TYPE.RECEIVED]: {
              'row-1': buildVersionData()
            }
          })

          await request.wasteRecordsRepository.appendVersions(
            organisationId,
            registrationId,
            wasteRecordVersions
          )

          const found = await request.wasteRecordsRepository.findByRegistration(
            organisationId,
            registrationId
          )
          return { found: found.length }
        }
      })

      await server.initialize()
      const response = await server.inject({ method: 'POST', url: '/test' })
      const result = JSON.parse(response.payload)

      expect(result.found).toBe(1)
    })
  })
})
