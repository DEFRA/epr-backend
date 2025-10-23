import { describe, it, expect, beforeEach, vi } from 'vitest'
import { cacheControl } from './cache-control.js'

describe('cache-control plugin', () => {
  let server
  let request
  let h
  let onPreResponseHandler

  beforeEach(() => {
    onPreResponseHandler = null

    server = {
      ext: vi.fn((event, handler) => {
        if (event === 'onPreResponse') {
          onPreResponseHandler = handler
        }
      })
    }

    h = {
      continue: Symbol('continue')
    }
  })

  it('should have correct plugin structure', () => {
    expect(cacheControl.plugin.name).toBe('cache-control')
    expect(cacheControl.plugin.version).toBe('1.0.0')
    expect(cacheControl.plugin.register).toBeTypeOf('function')
  })

  it('should add Cache-Control header to successful responses', () => {
    const mockResponse = {
      header: vi.fn()
    }

    request = {
      response: mockResponse
    }

    cacheControl.plugin.register(server)
    expect(server.ext).toHaveBeenCalledWith(
      'onPreResponse',
      expect.any(Function)
    )

    const result = onPreResponseHandler(request, h)

    expect(mockResponse.header).toHaveBeenCalledWith(
      'Cache-Control',
      'no-cache, no-store, must-revalidate'
    )
    expect(result).toBe(h.continue)
  })

  it('should add cache-control header to Boom error responses', () => {
    const mockBoomResponse = {
      isBoom: true,
      output: {
        headers: {}
      }
    }

    request = {
      response: mockBoomResponse
    }

    cacheControl.plugin.register(server)

    const result = onPreResponseHandler(request, h)

    expect(mockBoomResponse.output.headers['cache-control']).toBe(
      'no-cache, no-store, must-revalidate'
    )
    expect(result).toBe(h.continue)
  })
})
