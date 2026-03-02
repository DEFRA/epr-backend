import { vi, describe, test, expect, beforeEach } from 'vitest'

describe('#getCognitoToken', () => {
  const clientId = 'test-client-id'
  const clientSecret = 'test-client-secret'
  const serviceName = 'forms-submission-api'

  let mockFetchJson
  let getCognitoToken

  beforeEach(async () => {
    vi.resetModules()

    mockFetchJson = vi.fn()

    vi.doMock('./fetch-json.js', () => ({
      fetchJson: mockFetchJson
    }))

    const module = await import('./cognito-token.js')
    getCognitoToken = module.getCognitoToken
  })

  describe('token fetching', () => {
    test('returns access token when Cognito responds successfully', async () => {
      const mockTokenResponse = {
        access_token: 'mock-access-token-123',
        token_type: 'Bearer',
        expires_in: 3600
      }

      mockFetchJson.mockResolvedValue(mockTokenResponse)

      const token = await getCognitoToken(clientId, clientSecret, serviceName)

      expect(token).toBe('mock-access-token-123')

      const expectedUrl =
        'https://forms-submission-api-6bf3a.auth.eu-west-2.amazoncognito.com/oauth2/token'
      const expectedAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
        'base64'
      )

      expect(mockFetchJson).toHaveBeenCalledWith(expectedUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${expectedAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: expect.any(URLSearchParams)
      })

      const callArgs = mockFetchJson.mock.calls[0]
      const bodyParams = callArgs[1].body
      expect(bodyParams.get('grant_type')).toBe('client_credentials')
    })
  })

  describe('token caching', () => {
    test('returns cached token on second call if not expired', async () => {
      const mockTokenResponse = {
        access_token: 'mock-access-token-123',
        token_type: 'Bearer',
        expires_in: 3600
      }

      mockFetchJson.mockResolvedValue(mockTokenResponse)

      // First call - should fetch from API
      const token1 = await getCognitoToken(clientId, clientSecret, serviceName)
      expect(token1).toBe('mock-access-token-123')
      expect(mockFetchJson).toHaveBeenCalledTimes(1)

      // Second call - should use cache
      const token2 = await getCognitoToken(clientId, clientSecret, serviceName)
      expect(token2).toBe('mock-access-token-123')
      expect(mockFetchJson).toHaveBeenCalledTimes(1) // Still only called once
    })

    test('fetches new token when cached token is expiring soon', async () => {
      const mockTokenResponse1 = {
        access_token: 'mock-token-1',
        token_type: 'Bearer',
        expires_in: 100 // Expires in 100 seconds (< 2 min buffer)
      }

      const mockTokenResponse2 = {
        access_token: 'mock-token-2',
        token_type: 'Bearer',
        expires_in: 3600
      }

      mockFetchJson
        .mockResolvedValueOnce(mockTokenResponse1)
        .mockResolvedValueOnce(mockTokenResponse2)

      // First call
      const token1 = await getCognitoToken(clientId, clientSecret, serviceName)
      expect(token1).toBe('mock-token-1')
      expect(mockFetchJson).toHaveBeenCalledTimes(1)

      // Second call - token expiring soon, should fetch new one
      const token2 = await getCognitoToken(clientId, clientSecret, serviceName)
      expect(token2).toBe('mock-token-2')
      expect(mockFetchJson).toHaveBeenCalledTimes(2)
    })

    test('caches tokens separately for different services', async () => {
      const mockTokenResponse1 = {
        access_token: 'service1-token',
        token_type: 'Bearer',
        expires_in: 3600
      }

      const mockTokenResponse2 = {
        access_token: 'service2-token',
        token_type: 'Bearer',
        expires_in: 3600
      }

      mockFetchJson
        .mockResolvedValueOnce(mockTokenResponse1)
        .mockResolvedValueOnce(mockTokenResponse2)

      // Get token for service 1
      const token1 = await getCognitoToken(clientId, clientSecret, 'service1')
      expect(token1).toBe('service1-token')

      // Get token for service 2
      const token2 = await getCognitoToken(clientId, clientSecret, 'service2')
      expect(token2).toBe('service2-token')

      expect(mockFetchJson).toHaveBeenCalledTimes(2)

      // Get cached token for service 1
      const token1Again = await getCognitoToken(
        clientId,
        clientSecret,
        'service1'
      )
      expect(token1Again).toBe('service1-token')
      expect(mockFetchJson).toHaveBeenCalledTimes(2) // No new call
    })
  })

  describe('on error responses', () => {
    test('throws error when fetchJson fails', async () => {
      const error = new Error('Failed to fetch')
      error.isBoom = true
      error.output = { statusCode: 401 }

      mockFetchJson.mockRejectedValue(error)

      await expect(
        getCognitoToken(clientId, clientSecret, serviceName)
      ).rejects.toThrow('Failed to fetch')
    })
  })
})
