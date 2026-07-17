import { describe, beforeEach, expect } from 'vitest'
import { StatusCodes } from 'http-status-codes'

import { it } from '#vite/fixtures/server-with-real-db.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { MATERIAL } from '#domain/organisations/model.js'
import {
  buildAwaitingAcceptancePrn,
  buildAccreditation
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import { prnTonnagePath } from './get.js'

/** @import { TestServerWithRealDb } from '#vite/fixtures/server-with-real-db.js' */

const PRNS_COLLECTION = 'packaging-recycling-notes'
const { validToken } = entraIdMockAuthTokens

const orgId = '507f1f77bcf86cd799439011'

describe(`GET ${prnTonnagePath} (integration)`, () => {
  setupAuthContext()

  beforeEach(
    async (/** @type {{ server: TestServerWithRealDb }} */ { server }) => {
      await server.db.collection(PRNS_COLLECTION).deleteMany({})
    }
  )

  it('aggregates PRN tonnage by status via the real db', async ({ server }) => {
    await server.db.collection(PRNS_COLLECTION).insertOne(
      buildAwaitingAcceptancePrn({
        organisation: { id: orgId, name: 'Acme Reprocessing' },
        accreditation: buildAccreditation({
          accreditationNumber: 'ACC-INTEG',
          material: MATERIAL.PLASTIC
        }),
        tonnage: 100
      })
    )

    const response = await server.inject({
      method: 'GET',
      url: prnTonnagePath,
      headers: { Authorization: `Bearer ${validToken}` }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload).rows).toStrictEqual([
      {
        organisationName: 'Acme Reprocessing',
        organisationId: orgId,
        accreditationNumber: 'ACC-INTEG',
        material: MATERIAL.PLASTIC,
        tonnageBand: null,
        awaitingAuthorisationTonnage: 0,
        awaitingAcceptanceTonnage: 100,
        awaitingCancellationTonnage: 0,
        acceptedTonnage: 0,
        cancelledTonnage: 0
      }
    ])
  })
})
