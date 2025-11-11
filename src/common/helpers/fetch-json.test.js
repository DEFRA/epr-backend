import { vi, describe, test, expect } from 'vitest'

import { fetchJsonFrom } from './fetch-json.js'

vi.mock('#server/common/helpers/auth/get-user-session.js', () => ({
  getUserSession: vi.fn().mockReturnValue(null)
}))

describe('#fetchJson', () => {
  const url = 'http://mock-url'

  describe('on a successful response', () => {
    test('returns data when backend responds with ok=true', async () => {
      const result = await fetchJsonFrom(url)

      // mocj json response

      expect(result).toEqual()
    })
  })

  test('throws Boom unauthorised error when status is 401', async () => {
    await expect(fetchJsonFrom(url)).rejects.toMatchObject({
      isBoom: true,
      output: {
        statusCode: 401
      },
      message: expect
        .stringContaining
        // Error message
        ()
    })
  })

  test('throws Boom internal server error when response not ok (non-401)', async () => {
    await expect(fetchJsonFrom(url)).rejects.toMatchObject({
      isBoom: true,
      output: {
        statusCode: 500
      },
      message: expect
        .stringContaining
        // Error message
        ()
    })
  })

  test('throws Boom internal server error when fetch throws', async () => {
    await expect(fetchJsonFrom(url)).rejects.toMatchObject({
      isBoom: true,
      output: {
        statusCode: 500
      },
      message: expect
        .stringContaining
        // eerror
        ()
    })
  })

  test('includes JSON payload in Boom error when server returns error with JSON body', async () => {
    const errorPayload = {
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      validation: {
        source: 'payload',
        keys: ['email', 'password']
      }
    }

    await expect(fetchJsonFrom(url)).rejects.toMatchObject({
      isBoom: true,
      output: {
        statusCode: 400,
        payload: errorPayload
      },
      message: expect
        .stringContaining
        // Error message
        ()
    })
  })
})
