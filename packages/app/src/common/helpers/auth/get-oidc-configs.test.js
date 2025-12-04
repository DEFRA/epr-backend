import { vi, describe, test, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'

import { getOidcConfigs } from './get-oidc-configs.js'
import {
  entraIdMockOidcWellKnownResponse,
  entraIdMockWellKnownUrl
} from '#vite/helpers/mock-entra-oidc.js'
import {
  defraIdMockOidcWellKnownResponse,
  defraIdMockWellKnownUrl
} from '#vite/helpers/mock-defra-id-oidc.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

describe('#getOidcConfigs', () => {
  const { getServer } = setupAuthContext()

  let entraIdWellKnownSpy
  let defraIdWellKnownSpy

  beforeEach(() => {
    entraIdWellKnownSpy = vi.fn(() =>
      HttpResponse.json(entraIdMockOidcWellKnownResponse)
    )
    defraIdWellKnownSpy = vi.fn(() =>
      HttpResponse.json(defraIdMockOidcWellKnownResponse)
    )

    getServer().use(
      http.get(entraIdMockWellKnownUrl, entraIdWellKnownSpy),
      http.get(defraIdMockWellKnownUrl, defraIdWellKnownSpy)
    )
  })

  describe('on successful fetch', () => {
    test('returns both OIDC configs when fetch succeeds', async () => {
      const result = await getOidcConfigs()

      expect(result).toEqual({
        entraIdOidcConfig: entraIdMockOidcWellKnownResponse,
        defraIdOidcConfig: defraIdMockOidcWellKnownResponse
      })
    })

    test('calls both OIDC well-known endpoints once', async () => {
      await getOidcConfigs()

      expect(entraIdWellKnownSpy).toHaveBeenCalledTimes(1)
      expect(defraIdWellKnownSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('concurrent fetching', () => {
    test('calls each endpoint once when using Promise.all', async () => {
      await getOidcConfigs()

      expect(entraIdWellKnownSpy).toHaveBeenCalledTimes(1)
      expect(defraIdWellKnownSpy).toHaveBeenCalledTimes(1)
    })

    test('calls endpoints multiple times when invoked multiple times', async () => {
      await Promise.all([getOidcConfigs(), getOidcConfigs(), getOidcConfigs()])

      expect(entraIdWellKnownSpy).toHaveBeenCalledTimes(3)
      expect(defraIdWellKnownSpy).toHaveBeenCalledTimes(3)
    })
  })
})
