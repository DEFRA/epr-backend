import { vi, describe, test, expect, afterEach } from 'vitest'

import { fetchJson } from './fetch-json.js'

const MOCK_TRACE_ID = 'mock-trace-id-1'

describe('#fetchJson', () => {
  const url = 'http://mock-url'
  const originalFetch = global.fetch

  vi.mock('@defra/hapi-tracing', async () => {
    const actual = await vi.importActual('@defra/hapi-tracing')

    return {
      ...actual,
      withTraceId: (headerName, headers = {}) => {
        headers[headerName] = MOCK_TRACE_ID
        return headers
      }
    }
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('on a successful response', () => {
    test('returns data when backend responds with ok=true', async () => {
      const mockData = { id: 1, name: 'Test Data' }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockData,
        headers: new Map()
      })

      const result = await fetchJson(url)

      expect(result).toEqual(mockData)
      expect(global.fetch).toHaveBeenCalledWith(url, {
        headers: {
          'Content-Type': 'application/json',
          'x-cdp-request-id': MOCK_TRACE_ID
        }
      })
    })

    test('merges custom headers with default Content-Type header', async () => {
      const mockData = { success: true }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockData,
        headers: new Map()
      })

      await fetchJson(url, {
        headers: {
          Authorization: 'Bearer token123',
          'X-Custom-Header': 'custom-value'
        }
      })

      expect(global.fetch).toHaveBeenCalledWith(url, {
        headers: {
          Authorization: 'Bearer token123',
          'X-Custom-Header': 'custom-value',
          'Content-Type': 'application/json',
          'x-cdp-request-id': MOCK_TRACE_ID
        }
      })
    })

    test('passes through fetch options like method and body', async () => {
      const mockData = { created: true }
      const requestBody = { name: 'New Item' }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockData,
        headers: new Map()
      })

      await fetchJson(url, {
        method: 'POST',
        body: JSON.stringify(requestBody)
      })

      expect(global.fetch).toHaveBeenCalledWith(url, {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
          'x-cdp-request-id': MOCK_TRACE_ID
        }
      })
    })
  })

  describe('on error responses', () => {
    test('throws Boom unauthorised error when status is 401', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Map()
      })

      await expect(fetchJson(url)).rejects.toMatchObject({
        isBoom: true,
        output: {
          statusCode: 401
        },
        message: expect.stringContaining(
          `Failed to fetch from url: ${url}: 401 Unauthorized`
        )
      })
    })

    test('throws Boom error matching response status for 404', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Map()
      })

      await expect(fetchJson(url)).rejects.toMatchObject({
        isBoom: true,
        output: {
          statusCode: 404
        },
        message: expect.stringContaining(
          `Failed to fetch from url: ${url}: 404 Not Found`
        )
      })
    })

    test('throws Boom error matching response status for 500', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Map()
      })

      await expect(fetchJson(url)).rejects.toMatchObject({
        isBoom: true,
        output: {
          statusCode: 500
        },
        message: expect.stringContaining(
          `Failed to fetch from url: ${url}: 500 Internal Server Error`
        )
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

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Map([['content-type', 'application/json']]),
        json: async () => errorPayload
      })

      await expect(fetchJson(url)).rejects.toMatchObject({
        isBoom: true,
        output: {
          statusCode: 400,
          payload: errorPayload
        },
        message: expect.stringContaining(
          `Failed to fetch from url: ${url}: 400 Bad Request`
        )
      })
    })

    test('does not include payload when error response is not JSON', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Map([['content-type', 'text/html']])
      })

      await expect(fetchJson(url)).rejects.toMatchObject({
        isBoom: true,
        output: {
          statusCode: 403
        },
        message: expect.stringContaining(
          `Failed to fetch from url: ${url}: 403 Forbidden`
        )
      })
    })
  })

  describe('on network errors', () => {
    test('throws Boom internal server error when fetch throws network error', async () => {
      const networkError = new Error('Network request failed')
      global.fetch = vi.fn().mockRejectedValue(networkError)

      await expect(fetchJson(url)).rejects.toMatchObject({
        isBoom: true,
        output: {
          statusCode: 500
        },
        message: expect.stringContaining(
          `Failed to fetch from url: ${url}: Network request failed`
        )
      })
    })

    test('throws Boom internal server error when fetch throws timeout error', async () => {
      const timeoutError = new Error('Request timeout')
      global.fetch = vi.fn().mockRejectedValue(timeoutError)

      await expect(fetchJson(url)).rejects.toMatchObject({
        isBoom: true,
        output: {
          statusCode: 500
        },
        message: expect.stringContaining(
          `Failed to fetch from url: ${url}: Request timeout`
        )
      })
    })

    test('re-throws Boom error if error is already a Boom error', async () => {
      const Boom = await import('@hapi/boom')
      const existingBoomError = Boom.badRequest('Custom boom error')

      global.fetch = vi.fn().mockRejectedValue(existingBoomError)

      await expect(fetchJson(url)).rejects.toBe(existingBoomError)
    })
  })

  describe('edge cases', () => {
    test('handles undefined options parameter', async () => {
      const mockData = { data: 'test' }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockData,
        headers: new Map()
      })

      const result = await fetchJson(url)

      expect(result).toEqual(mockData)
      expect(global.fetch).toHaveBeenCalledWith(url, {
        headers: {
          'Content-Type': 'application/json',
          'x-cdp-request-id': MOCK_TRACE_ID
        }
      })
    })

    test('handles content-type header with charset', async () => {
      const errorPayload = { error: 'Invalid input' }

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        headers: new Map([['content-type', 'application/json; charset=utf-8']]),
        json: async () => errorPayload
      })

      await expect(fetchJson(url)).rejects.toMatchObject({
        isBoom: true,
        output: {
          statusCode: 422,
          payload: errorPayload
        }
      })
    })
  })
})
