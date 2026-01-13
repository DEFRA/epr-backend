import Boom from '@hapi/boom'
import { withTraceId } from '@defra/hapi-tracing'

/**
 * Fetch JSON from a given url
 * @param {string} url -
 * @param {RequestInit} [options] - Fetch API options (method, headers, body, etc.)
 * @returns {Promise<*>} The parsed JSON response or throws a Boom error
 */
export const fetchJson = async (url, options) => {
  const completeOptions = {
    ...options,
    headers: withTraceId('x-cdp-request-id', {
      ...options?.headers,
      'Content-Type': 'application/json'
    })
  }

  try {
    const response = await fetch(url, completeOptions)

    if (!response.ok) {
      // Create a Boom error that matches the response
      const error = Boom.boomify(
        new Error(
          `Failed to fetch from url: ${url}: ${response.status} ${response.statusText}`
        ),
        { statusCode: response.status }
      )

      // Add response body to the error payload if needed
      if (response.headers.get('content-type')?.includes('application/json')) {
        error.output.payload = await response.json()
      }

      throw error
    }

    return await response.json()
  } catch (error) {
    // If it's already a Boom error, re-throw it
    if (error.isBoom) {
      throw error
    }

    // For network errors or other non-HTTP errors, create a 500 Boom error
    throw Boom.internal(`Failed to fetch from url: ${url}: ${error.message}`)
  }
}
