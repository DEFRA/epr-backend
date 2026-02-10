import Hapi from '@hapi/hapi'
import Boom from '@hapi/boom'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

import {
  externalApiErrorFormatter,
  EXTERNAL_API_TAG
} from './external-api-error-formatter.js'

function createTestServer() {
  const server = Hapi.server({ port: 0 })

  server.route({
    method: 'GET',
    path: '/external/not-found',
    options: { tags: [EXTERNAL_API_TAG], auth: false },
    handler: () => {
      throw Boom.notFound('PRN not found: ER2600001')
    }
  })

  server.route({
    method: 'GET',
    path: '/external/conflict',
    options: { tags: [EXTERNAL_API_TAG], auth: false },
    handler: () => {
      throw Boom.conflict('PRN already accepted')
    }
  })

  server.route({
    method: 'GET',
    path: '/external/bad-request',
    options: { tags: [EXTERNAL_API_TAG], auth: false },
    handler: () => {
      throw Boom.badRequest('Invalid PRN number format')
    }
  })

  server.route({
    method: 'GET',
    path: '/external/validation-error',
    options: { tags: [EXTERNAL_API_TAG], auth: false },
    handler: () => {
      throw Boom.badData('acceptedAt must be a valid ISO 8601 date-time')
    }
  })

  server.route({
    method: 'GET',
    path: '/external/server-error',
    options: { tags: [EXTERNAL_API_TAG], auth: false },
    handler: () => {
      throw Boom.badImplementation('Failure on /test')
    }
  })

  server.route({
    method: 'GET',
    path: '/external/unmapped-status',
    options: { tags: [EXTERNAL_API_TAG], auth: false },
    handler: () => {
      throw Boom.tooManyRequests('Rate limit exceeded')
    }
  })

  server.route({
    method: 'GET',
    path: '/external/success',
    options: { tags: [EXTERNAL_API_TAG], auth: false },
    handler: (_request, h) => {
      return h.response({ items: [] }).code(200)
    }
  })

  server.route({
    method: 'GET',
    path: '/internal/not-found',
    options: { auth: false },
    handler: () => {
      throw Boom.notFound('Resource not found')
    }
  })

  return server
}

describe('externalApiErrorFormatter', () => {
  let server

  beforeAll(async () => {
    server = createTestServer()
    await server.register(externalApiErrorFormatter)
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop()
  })

  describe('external API routes', () => {
    it('formats 404 as { code, message }', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/external/not-found'
      })

      expect(response.statusCode).toBe(404)
      expect(JSON.parse(response.payload)).toEqual({
        code: 'NOT_FOUND',
        message: 'PRN not found: ER2600001'
      })
    })

    it('formats 409 as { code, message }', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/external/conflict'
      })

      expect(response.statusCode).toBe(409)
      expect(JSON.parse(response.payload)).toEqual({
        code: 'CONFLICT',
        message: 'PRN already accepted'
      })
    })

    it('formats 400 as { code, message }', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/external/bad-request'
      })

      expect(response.statusCode).toBe(400)
      expect(JSON.parse(response.payload)).toEqual({
        code: 'BAD_REQUEST',
        message: 'Invalid PRN number format'
      })
    })

    it('maps 422 validation errors to 400 BAD_REQUEST', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/external/validation-error'
      })

      expect(response.statusCode).toBe(400)
      expect(JSON.parse(response.payload)).toEqual({
        code: 'BAD_REQUEST',
        message: 'acceptedAt must be a valid ISO 8601 date-time'
      })
    })

    it('formats 500 as { code, message }', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/external/server-error'
      })

      expect(response.statusCode).toBe(500)
      expect(JSON.parse(response.payload)).toEqual({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An internal server error occurred'
      })
    })

    it('falls back to INTERNAL_SERVER_ERROR for unmapped status codes', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/external/unmapped-status'
      })

      expect(response.statusCode).toBe(429)
      expect(JSON.parse(response.payload)).toEqual({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Rate limit exceeded'
      })
    })

    it('does not modify successful responses', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/external/success'
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.payload)).toEqual({ items: [] })
    })
  })

  describe('internal routes', () => {
    it('does not modify Boom errors on routes without the external-api tag', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/internal/not-found'
      })

      expect(response.statusCode).toBe(404)
      const payload = JSON.parse(response.payload)
      expect(payload).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: 'Resource not found'
      })
    })
  })
})
