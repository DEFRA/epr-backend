import Boom from '@hapi/boom'
import { withTraceId } from '@defra/hapi-tracing'
import { errorCodes } from '#common/enums/error-codes.js'
import { internal } from './logging/cdp-boom.js'
import { getTracingHeaderName } from './request-tracing.js'

/**
 * Fetch JSON from a given url
 * @param {string} url -
 * @param {RequestInit} [options] - Fetch API options (method, headers, body, etc.)
 * @returns {Promise<*>} The parsed JSON response or throws a Boom error
 */
export const fetchJson = async (url, options) => {
  const completeOptions = {
    ...options,
    headers: withTraceId(getTracingHeaderName(), {
      'Content-Type': 'application/json',
      ...options?.headers
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

    // error.message is not interpolated because it can echo unbounded content
    // (URL query strings, response body fragments). Bounded classifiers from
    // the underlying error (name, code) land in event.reason instead, where
    // they are CDP-allowlisted and indexed in OpenSearch.
    throw internal(
      `Failed to fetch from url: ${url}`,
      errorCodes.externalFetchFailed,
      {
        event: {
          action: 'external_fetch',
          reason: `type=${error?.name ?? 'Error'} code=${error?.code ?? 'unknown'}`
        }
      }
    )
  }
}
