import { StatusCodes } from 'http-status-codes'
import { beforeEach, describe, expect, it } from 'vitest'

import { signedUploadCallbackPath } from '#common/helpers/auth/upload-callback-signature.js'
import { STRATEGY_NAME as UPLOAD_CALLBACK } from '#plugins/auth/upload-callback-auth-plugin.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

/** @import { TestServer } from '#test/create-test-server.js' */

const key = '0'.repeat(64)
const otherKey = 'f'.repeat(64)
const path = '/test-upload-callback/abc/upload-completed'

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

  it('should accept a callback to the path it was signed for', async () => {
    const response = await server.inject({
      method: 'POST',
      url: signedUploadCallbackPath(key, path)
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
  })

  it.for([
    { description: 'no signature', url: path },
    { description: 'an empty signature', url: `${path}?signature=` },
    { description: 'a signature that is not hex', url: `${path}?signature=zz` },
    {
      description: 'a signature for another path',
      url: signedUploadCallbackPath(
        key,
        '/test-upload-callback/xyz/upload-completed'
      ).replace('xyz', 'abc')
    },
    {
      description: 'a signature from another key',
      url: signedUploadCallbackPath(otherKey, path)
    },
    {
      description: 'two signatures',
      url: `${signedUploadCallbackPath(key, path)}&signature=00`
    }
  ])('should reject a callback with $description', async ({ url }) => {
    const response = await server.inject({ method: 'POST', url })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
  })
})
