import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'

describe('GET /health', () => {
  let server

  beforeEach(async () => {
    server = await createTestServer()
  })

  it('returns 200 with success message', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health'
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toEqual({ message: 'success' })
  })
})
