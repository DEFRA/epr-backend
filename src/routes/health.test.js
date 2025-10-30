import { StatusCodes } from 'http-status-codes'
import {
  testServerFixture as test,
  describe,
  expect
} from '../test/create-test-server-fixture.js'

describe('GET /health', () => {
  test('returns 200 with success message', async ({ testServer }) => {
    const response = await testServer.inject({
      method: 'GET',
      url: '/health'
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toEqual({ message: 'success' })
  })
})
