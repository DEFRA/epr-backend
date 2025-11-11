import { StatusCodes } from 'http-status-codes'
import { describe, it, expect } from 'vitest'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#test/helpers/setup-auth-mocking.js'

describe('GET /health', () => {
  setupAuthContext()
  it('returns 200 with success message', async () => {
    const server = await createTestServer({ skipMongoDb: true })

    const response = await server.inject({
      method: 'GET',
      url: '/health'
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toEqual({ message: 'success' })
  })
})
