import { http, HttpResponse } from 'msw'
import { vi } from 'vitest'

import { getOidcConfigs } from './get-oidc-configs.js'
import {
  entraIdMockOidcWellKnownResponse,
  entraIdMockWellKnownUrl
} from '#vite/helpers/mock-entra-oidc.js'
import {
  defraIdMockOidcWellKnownResponse,
  defraIdMockWellKnownUrl
} from '#vite/helpers/mock-defra-id-oidc.js'
import { it } from '#vite/fixtures/msw.js'

describe('#getOidcConfigs', () => {
  let entraIdWellKnownSpy
  let defraIdWellKnownSpy

  it.beforeEach(({ msw }) => {
    entraIdWellKnownSpy = vi.fn(() =>
      HttpResponse.json(entraIdMockOidcWellKnownResponse)
    )
    defraIdWellKnownSpy = vi.fn(() =>
      HttpResponse.json(defraIdMockOidcWellKnownResponse)
    )

    msw.use(
      http.get(entraIdMockWellKnownUrl, entraIdWellKnownSpy),
      http.get(defraIdMockWellKnownUrl, defraIdWellKnownSpy)
    )
  })

  describe('on successful fetch', () => {
    it('returns both OIDC configs when fetch succeeds', async () => {
      const result = await getOidcConfigs()

      expect(result).toEqual({
        entraIdOidcConfig: entraIdMockOidcWellKnownResponse,
        defraIdOidcConfig: defraIdMockOidcWellKnownResponse
      })
    })

    it('calls both OIDC well-known endpoints once', async () => {
      await getOidcConfigs()

      expect(entraIdWellKnownSpy).toHaveBeenCalledTimes(1)
      expect(defraIdWellKnownSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('concurrent fetching', () => {
    it('calls each endpoint once when using Promise.all', async () => {
      await getOidcConfigs()

      expect(entraIdWellKnownSpy).toHaveBeenCalledTimes(1)
      expect(defraIdWellKnownSpy).toHaveBeenCalledTimes(1)
    })

    it('calls endpoints multiple times when invoked multiple times', async () => {
      await Promise.all([getOidcConfigs(), getOidcConfigs(), getOidcConfigs()])

      expect(entraIdWellKnownSpy).toHaveBeenCalledTimes(3)
      expect(defraIdWellKnownSpy).toHaveBeenCalledTimes(3)
    })
  })
})
