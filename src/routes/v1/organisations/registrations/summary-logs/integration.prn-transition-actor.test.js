import assert from 'node:assert/strict'

import { ObjectId } from 'mongodb'
import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'

import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'

import {
  asOperator,
  buildGetUrl,
  buildPostUrl,
  buildSubmitUrl,
  createUploadPayload,
  pollForValidation,
  setupWasteBalanceIntegrationEnvironment,
  createWasteBalanceMeta,
  createExporterRowValues,
  EXPORTER_HEADERS
} from './integration-test-helpers.js'

const LEDGER_ACCREDITATION_ID = 'ACC-123'
const POLL_INTERVAL_MS = 50
const MAX_POLL_ATTEMPTS = 20

/**
 * The human whose authenticated session drives the PRN transition. The route
 * reads id, name and email from the request credentials; the test asserts all
 * three reach the appended waste-balance stream event.
 */
const SIGNATORY = Object.freeze({
  id: 'signatory-user-7',
  name: 'Ada Lovelace',
  email: 'ada.lovelace@example.com'
})

const sharedMeta = createWasteBalanceMeta('EXPORTER')

const setupLedgerEnv = () => {
  const organisationId = new ObjectId().toString()
  const registrationId = new ObjectId().toString()
  return setupWasteBalanceIntegrationEnvironment({
    processingType: 'exporter',
    organisationId,
    registrationId
  })
}

const submitCredit = async (env, tonnage) => {
  const { server, fileDataMap, organisationId, registrationId } = env
  const summaryLogId = 'log-actor'
  const fileId = 'file-actor'

  fileDataMap[fileId] = {
    meta: sharedMeta,
    data: {
      RECEIVED_LOADS_FOR_EXPORT: {
        location: { sheet: 'Received', row: 7, column: 'A' },
        headers: EXPORTER_HEADERS,
        rows: [
          {
            rowNumber: 8,
            values: createExporterRowValues({
              rowId: 1001,
              exportTonnage: tonnage
            })
          }
        ]
      }
    }
  }

  await server.inject({
    method: 'POST',
    url: buildPostUrl(organisationId, registrationId, summaryLogId),
    payload: createUploadPayload(
      organisationId,
      registrationId,
      UPLOAD_STATUS.COMPLETE,
      fileId,
      'waste-actor.xlsx'
    )
  })

  await pollForValidation(server, organisationId, registrationId, summaryLogId)

  await server.inject({
    method: 'POST',
    url: buildSubmitUrl(organisationId, registrationId, summaryLogId),
    ...asOperator()
  })

  let attempts = 0
  let status = SUMMARY_LOG_STATUS.SUBMITTING
  while (
    status === SUMMARY_LOG_STATUS.SUBMITTING &&
    attempts < MAX_POLL_ATTEMPTS
  ) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))

    const checkResponse = await server.inject({
      method: 'GET',
      url: buildGetUrl(organisationId, registrationId, summaryLogId),
      ...asOperator()
    })

    status = JSON.parse(checkResponse.payload).status
    attempts++
  }

  assert.equal(status, SUMMARY_LOG_STATUS.SUBMITTED)
}

const createPrn = async (env, tonnage) => {
  const { server, organisationId, registrationId, accreditationId } = env

  const response = await server.inject({
    method: 'POST',
    url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
    ...asOperator(),
    payload: {
      issuedToOrganisation: {
        id: 'producer-org-123',
        name: 'Producer Org',
        tradingName: 'Producer Trading'
      },
      tonnage
    }
  })

  return JSON.parse(response.payload)
}

/**
 * Raises a PRN through the status route as a named human, threading the
 * signatory's full credentials so the route can carry id, name and email onto
 * the stream event.
 */
const raiseAs = async (env, prnId, credentials) => {
  const { server, organisationId, registrationId, accreditationId } = env

  return server.inject({
    method: 'POST',
    url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
    ...asOperator(credentials),
    payload: { status: PRN_STATUS.AWAITING_AUTHORISATION }
  })
}

describe('PRN transition actor on the waste-balance stream', () => {
  const { getServer } = setupAuthContext()

  beforeEach(() => {
    getServer().use(
      http.post(
        'http://localhost:3001/v1/organisations/:orgId/registrations/:regId/summary-logs/:summaryLogId/upload-completed',
        () => HttpResponse.json({ success: true }, { status: 200 })
      )
    )
  })

  it('carries the requesting human id, name and email onto the appended stream event', async () => {
    const env = await setupLedgerEnv()
    const { ledgerRepository, registrationId } = env

    await submitCredit(env, 300)

    const prn = await createPrn(env, 50)
    const response = await raiseAs(env, prn.id, {
      id: SIGNATORY.id,
      name: SIGNATORY.name,
      email: SIGNATORY.email
    })
    expect(response.statusCode).toBe(200)

    const latest = await ledgerRepository.findLatestInLedger(
      registrationId,
      LEDGER_ACCREDITATION_ID
    )
    assert(latest)
    expect(latest.kind).toBe(LEDGER_EVENT_KIND.PRN_CREATED)
    expect(latest.payload).toEqual({ prnId: prn.id, amount: 50 })
    expect(latest.createdBy).toEqual({
      id: SIGNATORY.id,
      name: SIGNATORY.name,
      email: SIGNATORY.email
    })
  })
})
