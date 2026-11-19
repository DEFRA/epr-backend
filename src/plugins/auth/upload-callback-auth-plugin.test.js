import { StatusCodes } from 'http-status-codes'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  toUploadCallbackKey,
  toUploadCallbackPath,
  uploadCallbackSignature
} from '#common/helpers/auth/upload-callback-signature.js'
import { STRATEGY_NAME as UPLOAD_CALLBACK } from '#plugins/auth/upload-callback-auth-plugin.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

/** @import { TestServer } from '#test/create-test-server.js' */

const key = toUploadCallbackKey('0'.repeat(64))
const otherKey = toUploadCallbackKey('f'.repeat(64))
const path = toUploadCallbackPath('/test-upload-callback/abc/upload-completed')
const signature = uploadCallbackSignature(key, path)

describe('upload-callback strategy', () => {
  setupAuthContext()

  /** @type {TestServer} */
  let server

  beforeEach(async () => {
    server = await createTestServer()

    server.route({
      method: 'POST',
      path: '/test-upload-callback/{id}/upload-completed',
      options: { auth: { strategies: [UPLOAD_CALLBACK] } },
      handler: () => 'called back'
    })
  })

  it('should accept a callback whose metadata carries the signature for its path', async () => {
    const response = await server.inject({
      method: 'POST',
      url: path,
      payload: { metadata: { signature } }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
  })

  it.for([
    { description: 'no body', payload: undefined },
    { description: 'no metadata', payload: {} },
    { description: 'no signature', payload: { metadata: {} } },
    {
      description: 'an empty signature',
      payload: { metadata: { signature: '' } }
    },
    {
      description: 'a signature that is not hex',
      payload: { metadata: { signature: 'zz' } }
    },
    {
      description: 'a signature that is not a string',
      payload: { metadata: { signature: [signature] } }
    },
    {
      description: 'a signature for another path',
      payload: {
        metadata: {
          signature: uploadCallbackSignature(
            key,
            toUploadCallbackPath('/test-upload-callback/xyz/upload-completed')
          )
        }
      }
    },
    {
      description: 'a signature from another key',
      payload: {
        metadata: { signature: uploadCallbackSignature(otherKey, path) }
      }
    },
    {
      description: 'a valid signature followed by non-hex characters',
      payload: { metadata: { signature: `${signature}zzzz` } }
    },
    {
      description: 'a valid signature in upper case',
      payload: { metadata: { signature: signature.toUpperCase() } }
    }
  ])('should reject a callback with $description', async ({ payload }) => {
    const response = await server.inject({ method: 'POST', url: path, payload })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
  })
})
