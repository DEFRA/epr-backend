import { StatusCodes } from 'http-status-codes'
import { describe, it, expect } from 'vitest'
import { createTestServer } from '#test/create-test-server.js'

describe('GET /health', () => {
  it('returns 200 with success message', async () => {
    const server = await createTestServer()

    const response = await server.inject({
      method: 'GET',
      url: '/health'
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toEqual({ message: 'success' })
  })
})
