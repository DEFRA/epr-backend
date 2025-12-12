/**
 * Cross-organisation access control integration tests
 *
 * These tests verify that users can only access their own organisation's data.
 * Unlike auth-injected tests (which bypass org checks entirely), these tests
 * use the in-memory Auth Context Adapter to enforce org-level access control.
 */

import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { UPLOAD_STATUS } from '#domain/summary-logs/status.js'
import { createInMemoryAuthContext } from '#common/helpers/auth/auth-context-adapter.js'
import {
  createTestInfrastructure,
  createUploadPayload,
  buildGetUrl,
  buildPostUrl,
  createStandardMeta,
  asStandardUser
} from './integration-test-helpers.js'

describe('Cross-organisation access control', () => {
  setupAuthContext()

  describe('GET /v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}', () => {
    it('allows user to access their own organisation', async () => {
      const aliceOrgId = new ObjectId().toString()
      const aliceRegId = new ObjectId().toString()
      const summaryLogId = new ObjectId().toString()

      const authContext = createInMemoryAuthContext()
      authContext.grantAccess('alice', aliceOrgId, ['standard_user'])

      const { server } = await createTestInfrastructure(
        aliceOrgId,
        aliceRegId,
        {
          'file-123': {
            meta: createStandardMeta('REPROCESSOR_INPUT'),
            data: {}
          }
        },
        { authContext }
      )

      // Create summary log via API (no auth - callback from CDP uploader)
      await server.inject({
        method: 'POST',
        url: buildPostUrl(aliceOrgId, aliceRegId, summaryLogId),
        payload: createUploadPayload(
          aliceOrgId,
          aliceRegId,
          UPLOAD_STATUS.COMPLETE,
          'file-123',
          'test.xlsx'
        )
      })

      // Alice can access her own org's summary log
      const response = await server.inject({
        method: 'GET',
        url: buildGetUrl(aliceOrgId, aliceRegId, summaryLogId),
        ...asStandardUser({ id: 'alice' })
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('denies user access to another organisation', async () => {
      const aliceOrgId = new ObjectId().toString()
      const bobOrgId = new ObjectId().toString()
      const bobRegId = new ObjectId().toString()
      const summaryLogId = new ObjectId().toString()

      const authContext = createInMemoryAuthContext()
      authContext.grantAccess('alice', aliceOrgId, ['standard_user'])
      authContext.grantAccess('bob', bobOrgId, ['standard_user'])

      // Create infrastructure for Bob's org
      const { server } = await createTestInfrastructure(
        bobOrgId,
        bobRegId,
        {
          'file-456': {
            meta: createStandardMeta('REPROCESSOR_INPUT'),
            data: {}
          }
        },
        { authContext }
      )

      // Bob creates a summary log in his org (no auth - callback from CDP uploader)
      await server.inject({
        method: 'POST',
        url: buildPostUrl(bobOrgId, bobRegId, summaryLogId),
        payload: createUploadPayload(
          bobOrgId,
          bobRegId,
          UPLOAD_STATUS.COMPLETE,
          'file-456',
          'test.xlsx'
        )
      })

      // Alice tries to access Bob's summary log - should be denied
      const response = await server.inject({
        method: 'GET',
        url: buildGetUrl(bobOrgId, bobRegId, summaryLogId),
        ...asStandardUser({ id: 'alice' })
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      expect(JSON.parse(response.payload).message).toBe(
        'Not linked to this organisation'
      )
    })
  })
})
