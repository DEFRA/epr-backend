/**
 * Integration test demonstrating that per-repository plugins work with
 * existing route handlers WITHOUT requiring changes to those handlers.
 *
 * This validates the spike hypothesis: the per-repository approach allows
 * zero-migration-cost adoption because handlers already destructure
 * `request.organisationsRepository` directly.
 */
import Hapi from '@hapi/hapi'
import { describe, test, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { inMemoryOrganisationsRepositoryPlugin } from './inmemory-organisations-repository-plugin.js'

// Import an actual route handler that uses organisationsRepository
import { organisationsGetAll } from '#routes/v1/organisations/get.js'

describe('per-repository plugins integration', () => {
  describe('with existing route handlers', () => {
    /** @type {import('@hapi/hapi').Server} */
    let server

    beforeEach(async () => {
      server = Hapi.server()

      // Register the per-repository plugin (not the bundled one)
      await server.register(inMemoryOrganisationsRepositoryPlugin)

      // Insert test data directly via server.app is not possible because
      // the plugin registers on request. Instead, we add a setup route.
      server.route({
        method: 'POST',
        path: '/test-setup',
        options: { auth: false },
        handler: async (request) => {
          const org = buildOrganisation()
          await request.organisationsRepository.insert(org)
          return { id: org.id }
        }
      })

      // Register the actual route handler (modified to skip auth for test)
      server.route({
        ...organisationsGetAll,
        options: { ...organisationsGetAll.options, auth: false }
      })

      await server.initialize()
    })

    test('existing route handler works with per-repository plugin', async () => {
      // Setup: insert an organisation
      const setupResponse = await server.inject({
        method: 'POST',
        url: '/test-setup'
      })
      expect(setupResponse.statusCode).toBe(200)

      // Execute: call the actual route handler
      const response = await server.inject({
        method: 'GET',
        url: '/v1/organisations'
      })

      // Verify: handler works without modification
      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBeDefined()
    })

    test('demonstrates zero-migration for route handlers', async () => {
      // The organisationsGetAll handler destructures directly:
      //   handler: async ({ organisationsRepository }, h) => { ... }
      //
      // The per-repository plugin adds organisationsRepository to request:
      //   request.organisationsRepository
      //
      // Therefore: existing handlers work unchanged.
      //
      // This test confirms that the handler code does not need to change
      // from { organisationsRepository } to { repositories: { organisations } }

      const response = await server.inject({
        method: 'GET',
        url: '/v1/organisations'
      })

      // If this passes, the zero-migration hypothesis is validated
      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })
})
