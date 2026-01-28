/**
 * Integration tests for per-repository adapter plugins.
 *
 * These tests verify that each plugin correctly wires its repository onto
 * the request object by performing ONE real operation per repository.
 * This is not about testing repository behaviour (that's what contract tests
 * are for) - it's about verifying the plugin composition is correct.
 */
import Hapi from '@hapi/hapi'
import { describe, test, expect, beforeEach, vi } from 'vitest'
import { StatusCodes } from 'http-status-codes'

// Test data builders
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import {
  buildVersionData,
  toWasteRecordVersions
} from '#repositories/waste-records/contract/test-data.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

// In-memory plugin factories (used in tests)
import { createInMemoryOrganisationsRepositoryPlugin } from './inmemory-organisations-repository-plugin.js'
import { createInMemorySummaryLogsRepositoryPlugin } from './inmemory-summary-logs-repository-plugin.js'
import { createInMemoryFormSubmissionsRepositoryPlugin } from './inmemory-form-submissions-repository-plugin.js'
import { createInMemoryWasteRecordsRepositoryPlugin } from './inmemory-waste-records-repository-plugin.js'
import { createInMemoryWasteBalancesRepositoryPlugin } from './inmemory-waste-balances-repository-plugin.js'
import { createInMemorySystemLogsRepositoryPlugin } from './inmemory-system-logs-repository-plugin.js'
import { createInMemoryUploadsRepositoryPlugin } from './inmemory-uploads-repository-plugin.js'
import { createInMemoryPublicRegisterRepositoryPlugin } from './inmemory-public-register-repository-plugin.js'

// Actual route handler (proves zero-migration)
import { organisationsGetAll } from '#routes/v1/organisations/get.js'

describe('per-repository plugins integration', () => {
  describe('zero-migration: existing route handlers work unchanged', () => {
    /** @type {import('@hapi/hapi').Server} */
    let server

    beforeEach(async () => {
      server = Hapi.server()
      const plugin = createInMemoryOrganisationsRepositoryPlugin()
      await server.register(plugin)

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

      server.route({
        ...organisationsGetAll,
        options: { ...organisationsGetAll.options, auth: false }
      })

      await server.initialize()
    })

    test('organisationsGetAll handler works with per-repository plugin', async () => {
      await server.inject({ method: 'POST', url: '/test-setup' })

      const response = await server.inject({
        method: 'GET',
        url: '/v1/organisations'
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toHaveLength(1)
    })
  })

  describe('organisationsRepository plugin', () => {
    test('insert and findById works via plugin', async () => {
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

  describe('summaryLogsRepository plugin', () => {
    test('insert and findById works via plugin', async () => {
      const server = Hapi.server()
      const plugin = createInMemorySummaryLogsRepositoryPlugin()
      await server.register(plugin)

      // Mock request.logger for per-request instantiation
      server.ext('onRequest', (request, h) => {
        request.logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
        return h.continue
      })

      server.route({
        method: 'POST',
        path: '/test',
        options: { auth: false },
        handler: async (request) => {
          const id = 'summary-log-test-123'
          const organisationId = 'org-123'
          const summaryLog = summaryLogFactory.validating({
            organisationId,
            registrationId: 'reg-456'
          })
          await request.summaryLogsRepository.insert(id, summaryLog)
          const found = await request.summaryLogsRepository.findById(id)
          return {
            wasFound: found !== null,
            organisationId: found?.summaryLog?.organisationId
          }
        }
      })

      await server.initialize()
      const response = await server.inject({ method: 'POST', url: '/test' })
      const result = JSON.parse(response.payload)

      expect(result.wasFound).toBe(true)
      expect(result.organisationId).toBe('org-123')
    })
  })

  describe('formSubmissionsRepository plugin', () => {
    test('findAllAccreditations works via plugin', async () => {
      const server = Hapi.server()
      const plugin = createInMemoryFormSubmissionsRepositoryPlugin({
        accreditations: [
          { id: 'acc-1', referenceNumber: 'ACC001', orgId: 'org-1' }
        ]
      })
      await server.register(plugin)

      server.route({
        method: 'GET',
        path: '/test',
        options: { auth: false },
        handler: async (request) => {
          const accreditations =
            await request.formSubmissionsRepository.findAllAccreditations()
          return { count: accreditations.length }
        }
      })

      await server.initialize()
      const response = await server.inject({ method: 'GET', url: '/test' })
      const result = JSON.parse(response.payload)

      expect(result.count).toBe(1)
    })
  })

  describe('wasteRecordsRepository plugin', () => {
    test('appendVersions and findByRegistration works via plugin', async () => {
      const server = Hapi.server()
      const plugin = createInMemoryWasteRecordsRepositoryPlugin()
      await server.register(plugin)

      server.route({
        method: 'POST',
        path: '/test',
        options: { auth: false },
        handler: async (request) => {
          const organisationId = 'org-123'
          const registrationId = 'reg-456'

          const wasteRecordVersions = toWasteRecordVersions({
            [WASTE_RECORD_TYPE.RECEIVED]: {
              'row-1': buildVersionData(),
              'row-2': buildVersionData()
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

      expect(result.found).toBe(2)
    })
  })

  describe('wasteBalancesRepository plugin', () => {
    test('findByAccreditationId works via plugin', async () => {
      const server = Hapi.server()
      const plugin = createInMemoryWasteBalancesRepositoryPlugin()
      await server.register(plugin)

      server.route({
        method: 'GET',
        path: '/test',
        options: { auth: false },
        handler: async (request) => {
          // Should return null for non-existent accreditation (not throw)
          const balance =
            await request.wasteBalancesRepository.findByAccreditationId(
              'non-existent-accreditation'
            )
          return { found: balance !== null }
        }
      })

      await server.initialize()
      const response = await server.inject({ method: 'GET', url: '/test' })
      const result = JSON.parse(response.payload)

      expect(result.found).toBe(false)
    })
  })

  describe('systemLogsRepository plugin', () => {
    test('insert and findByOrganisationId works via plugin', async () => {
      const server = Hapi.server()
      const plugin = createInMemorySystemLogsRepositoryPlugin()
      await server.register(plugin)

      server.route({
        method: 'POST',
        path: '/test',
        options: { auth: false },
        handler: async (request) => {
          const organisationId = 'org-123'
          await request.systemLogsRepository.insert({
            id: 'log-1',
            context: { organisationId },
            message: 'Test log entry',
            createdAt: new Date()
          })
          const results =
            await request.systemLogsRepository.findByOrganisationId(
              organisationId
            )
          return { count: results.length }
        }
      })

      await server.initialize()
      const response = await server.inject({ method: 'POST', url: '/test' })
      const result = JSON.parse(response.payload)

      expect(result.count).toBe(1)
    })
  })

  describe('uploadsRepository plugin', () => {
    test('initiateSummaryLogUpload returns upload metadata via plugin', async () => {
      const server = Hapi.server()
      const plugin = createInMemoryUploadsRepositoryPlugin()
      await server.register(plugin)

      server.route({
        method: 'POST',
        path: '/test',
        options: { auth: false },
        handler: async (request) => {
          const result =
            await request.uploadsRepository.initiateSummaryLogUpload({
              organisationId: 'org-123',
              registrationId: 'reg-456',
              callbackUrl: 'http://localhost/callback'
            })
          return {
            hasUploadUrl: !!result.uploadUrl,
            hasUploadId: !!result.uploadId
          }
        }
      })

      await server.initialize()
      const response = await server.inject({ method: 'POST', url: '/test' })
      const result = JSON.parse(response.payload)

      expect(result.hasUploadUrl).toBe(true)
      expect(result.hasUploadId).toBe(true)
    })
  })

  describe('publicRegisterRepository plugin', () => {
    test('save and generatePresignedUrl works via plugin', async () => {
      const server = Hapi.server()
      const plugin = createInMemoryPublicRegisterRepositoryPlugin()
      await server.register(plugin)

      server.route({
        method: 'POST',
        path: '/test',
        options: { auth: false },
        handler: async (request) => {
          const fileName = 'test-register.csv'
          const content = 'header1,header2\nvalue1,value2'

          await request.publicRegisterRepository.save(fileName, content)
          const result =
            await request.publicRegisterRepository.generatePresignedUrl(
              fileName
            )

          return { hasUrl: !!result.url }
        }
      })

      await server.initialize()
      const response = await server.inject({ method: 'POST', url: '/test' })
      const result = JSON.parse(response.payload)

      expect(result.hasUrl).toBe(true)
    })
  })
})
