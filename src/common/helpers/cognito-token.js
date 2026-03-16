import { fetchJson } from './fetch-json.js'
import { logger } from '#common/helpers/logging/logger.js'

const tokenCache = new Map()

const REFRESH_BUFFER_MS = 2 * 60 * 1000
const calculateExpiryTimestamp = (expiresInSeconds) => {
  const expiresInMs = expiresInSeconds * 1000
  return Date.now() + expiresInMs - REFRESH_BUFFER_MS
}

const getCacheKey = (clientId, serviceName) => {
  return `${serviceName}:${clientId}`
}

const isCachedTokenValid = (cachedEntry) => {
  if (!cachedEntry) {
    return false
  }
  return Date.now() < cachedEntry.expiresAt
}

const fetchNewToken = async (clientId, clientSecret, cognitoUrl) => {
  logger.info({ message: `Fetching token from ${cognitoUrl}` })
  const clientCredentials = `${clientId}:${clientSecret}`
  const encodedCredentials = Buffer.from(clientCredentials).toString('base64')

  const body = new URLSearchParams({
    grant_type: 'client_credentials'
  })

  const response = await fetchJson(cognitoUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${encodedCredentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  })
  logger.info({ message: `Fetched token from ${cognitoUrl}` })
  return response
}

/**
 * Get Cognito access token using client credentials with caching
 * @param {string} clientId - Cognito client ID
 * @param {string} clientSecret - Cognito client secret
 * @param {string} cognitoUrl - congnito token url
 * @returns {Promise<string>} The access token
 */
export const getCognitoToken = async (clientId, clientSecret, cognitoUrl) => {
  const cacheKey = getCacheKey(clientId, cognitoUrl)
  const cachedEntry = tokenCache.get(cacheKey)

  if (isCachedTokenValid(cachedEntry)) {
    return cachedEntry.token
  }

  const tokenResponse = await fetchNewToken(clientId, clientSecret, cognitoUrl)

  tokenCache.set(cacheKey, {
    token: tokenResponse.access_token,
    expiresAt: calculateExpiryTimestamp(tokenResponse.expires_in)
  })

  return tokenResponse.access_token
}
