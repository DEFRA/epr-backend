import { fetchJson } from './fetch-json.js'
import { config } from '../../config.js'

const tokenCache = new Map()

const REFRESH_BUFFER_MS = 2 * 60 * 1000
const calculateExpiryTimestamp = (expiresInSeconds) => {
  const expiresInMs = expiresInSeconds * 1000
  return Date.now() + expiresInMs - REFRESH_BUFFER_MS
}

const buildCognitoTokenUrl = (serviceName) => {
  const cdpEnvSuffix = config.get('cdpEnvSuffix')
  const awsRegion = config.get('awsRegion')

  return `https://${serviceName}-${cdpEnvSuffix}.auth.${awsRegion}.amazoncognito.com/oauth2/token`
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

const fetchNewToken = async (clientId, clientSecret, serviceName) => {
  const tokenUrl = buildCognitoTokenUrl(serviceName)
  const clientCredentials = `${clientId}:${clientSecret}`
  const encodedCredentials = Buffer.from(clientCredentials).toString('base64')

  const body = new URLSearchParams({
    grant_type: 'client_credentials'
  })

  return fetchJson(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${encodedCredentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  })
}

/**
 * Get Cognito access token using client credentials with caching
 * @param {string} clientId - Cognito client ID
 * @param {string} clientSecret - Cognito client secret
 * @param {string} serviceName - Service name (e.g., 'forms-submission-api')
 * @returns {Promise<string>} The access token
 */
export const getCognitoToken = async (clientId, clientSecret, serviceName) => {
  const cacheKey = getCacheKey(clientId, serviceName)
  const cachedEntry = tokenCache.get(cacheKey)

  if (isCachedTokenValid(cachedEntry)) {
    return cachedEntry.token
  }

  const tokenResponse = await fetchNewToken(clientId, clientSecret, serviceName)

  tokenCache.set(cacheKey, {
    token: tokenResponse.access_token,
    expiresAt: calculateExpiryTimestamp(tokenResponse.expires_in)
  })

  return tokenResponse.access_token
}
