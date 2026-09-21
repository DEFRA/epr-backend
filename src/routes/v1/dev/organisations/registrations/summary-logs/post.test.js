import { StatusCodes } from 'http-status-codes'

import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { createAndSubmitReport } from '#reports/repository/contract/test-data.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import {
  asOperator,
  createReprocessorReceivedRowValues,
  getWasteBalance,
  REPROCESSOR_RECEIVED_HEADERS,
  setupWasteBalanceIntegrationEnvironment
} from '#routes/v1/organisations/registrations/summary-logs/integration-test-helpers.js'

import { devSummaryLogsSubmitPath } from './post.js'

const DEV_ENDPOINTS_ON = { featureFlags: { devEndpoints: true } }

const META = {
  REGISTRATION_NUMBER: 'REG-123',
  MATERIAL: 'Paper_and_board',
  ACCREDITATION_NUMBER: 'ACC-123'
}

const payloadWithReceived = (rows) => ({
  meta: META,
  data: {
    RECEIVED_LOADS_FOR_REPROCESSING: {
      headers: REPROCESSOR_RECEIVED_HEADERS,
      rows: rows.map(createReprocessorReceivedRowValues)
    }
  }
})

const submitUrl = (organisationId, registrationId) =>
  `/v1/dev/organisations/${organisationId}/registrations/${registrationId}/summary-logs`

const createEnvironment = () =>
  setupWasteBalanceIntegrationEnvironment({
    processingType: 'reprocessor',
    reprocessingType: 'input',
    config: DEV_ENDPOINTS_ON
  })

const submit = (env, payload) =>
  env.server.inject({
    method: 'POST',
    url: submitUrl(env.organisationId, env.registrationId),
    payload,
    ...asOperator()
  })

describe(`${devSummaryLogsSubmitPath} route`, () => {
  setupAuthContext()

  it('submits a valid summary log and answers with the submitted document and its loads', async () => {
    const env = await createEnvironment()

    const response = await submit(
      env,
      payloadWithReceived([
        { rowId: 1001, tonnageReceived: 100 },
        {
          rowId: 1002,
          tonnageReceived: 200,
          dateReceived: '2025-01-16T00:00:00.000Z'
        }
      ])
    )

    expect(response.statusCode).toBe(StatusCodes.OK)
    const body = JSON.parse(response.payload)
    expect(body).toMatchObject({
      summaryLogId: expect.any(String),
      status: SUMMARY_LOG_STATUS.SUBMITTED,
      processingType: 'REPROCESSOR_INPUT',
      loads: expect.objectContaining({
        added: expect.objectContaining({ valid: expect.any(Object) })
      }),
      loadsByReportingPeriod: expect.any(Object)
    })

    const stored = await env.summaryLogsRepository.findById(body.summaryLogId)
    expect(stored?.summaryLog.status).toBe(SUMMARY_LOG_STATUS.SUBMITTED)

    const balance = await getWasteBalance(env)
    expect(balance.amount).toBe(300)
  })

  it('answers with the invalid document and its issues when the content fails validation', async () => {
    const env = await createEnvironment()

    const response = await submit(
      env,
      payloadWithReceived([{ rowId: 1001, tonnageReceived: -5 }])
    )

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    const body = JSON.parse(response.payload)
    expect(body).toMatchObject({
      summaryLogId: expect.any(String),
      status: SUMMARY_LOG_STATUS.INVALID,
      validation: expect.objectContaining({
        counts: expect.objectContaining({ fatal: expect.any(Number) })
      })
    })
    expect(body.validation.counts.total).toBeGreaterThan(0)

    const balance = await env.wasteBalanceService.currentBalance({
      organisationId: env.organisationId,
      registrationId: env.registrationId,
      accreditationId: env.accreditationId
    })
    expect(balance?.amount ?? 0).toBe(0)
  })

  it('answers with a conflict when another submission for the registration is in progress', async () => {
    const env = await createEnvironment()
    await env.summaryLogsRepository.insert(
      'another-submission',
      summaryLogFactory.submitting({
        organisationId: env.organisationId,
        registrationId: env.registrationId
      })
    )

    const response = await submit(
      env,
      payloadWithReceived([{ rowId: 1001, tonnageReceived: 100 }])
    )

    expect(response.statusCode).toBe(StatusCodes.CONFLICT)
  })

  it("supersedes the registration's earlier submission with a later one", async () => {
    const env = await createEnvironment()
    const first = await submit(
      env,
      payloadWithReceived([{ rowId: 1001, tonnageReceived: 100 }])
    )
    expect(first.statusCode).toBe(StatusCodes.OK)

    const second = await submit(
      env,
      payloadWithReceived([{ rowId: 1001, tonnageReceived: 150 }])
    )

    expect(second.statusCode).toBe(StatusCodes.OK)
    const { summaryLogId } = JSON.parse(second.payload)
    const stored = await env.summaryLogsRepository.findById(summaryLogId)
    expect(stored?.summaryLog.validatedAgainstSummaryLogId).toBe(
      JSON.parse(first.payload).summaryLogId
    )
    const balance = await getWasteBalance(env)
    expect(balance.amount).toBe(150)
  })

  // The interleavings below happen between the validate and submit steps of one
  // request, so a spy on the exclusive transition is the only seam to place them.
  // It also captures the id the route minted, which a conflict answer omits.
  const beforeTransitionToSubmitting = (env, interleave) => {
    const original = env.summaryLogsRepository.transitionToSubmittingExclusive
    const minted = { summaryLogId: undefined }
    vi.spyOn(
      env.summaryLogsRepository,
      'transitionToSubmittingExclusive'
    ).mockImplementation(async (summaryLogId) => {
      minted.summaryLogId = summaryLogId
      await interleave()
      return original(summaryLogId)
    })
    return minted
  }

  const storedAfterReplication = async (env, summaryLogId) => {
    await new Promise((resolve) => setImmediate(resolve))
    const stored = await env.summaryLogsRepository.findById(summaryLogId)
    return stored?.summaryLog
  }

  it('answers with a conflict and supersedes the log when a submission landed while it validated', async () => {
    const env = await createEnvironment()
    const minted = beforeTransitionToSubmitting(env, () =>
      env.summaryLogsRepository.insert(
        'landed-meanwhile',
        summaryLogFactory.submitted({
          organisationId: env.organisationId,
          registrationId: env.registrationId
        })
      )
    )

    const response = await submit(
      env,
      payloadWithReceived([{ rowId: 1001, tonnageReceived: 100 }])
    )

    expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    const superseded = await storedAfterReplication(env, minted.summaryLogId)
    expect(superseded?.status).toBe(SUMMARY_LOG_STATUS.SUPERSEDED)
  })

  it('answers 500 and leaves the log submission-failed when the submit step throws', async () => {
    const env = await createEnvironment()
    const minted = beforeTransitionToSubmitting(env, () =>
      createAndSubmitReport(env.server.app.reportsRepository, {
        organisationId: env.organisationId,
        registrationId: env.registrationId
      })
    )

    const response = await submit(
      env,
      payloadWithReceived([{ rowId: 1001, tonnageReceived: 100 }])
    )

    expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    const failed = await storedAfterReplication(env, minted.summaryLogId)
    expect(failed?.status).toBe(SUMMARY_LOG_STATUS.SUBMISSION_FAILED)
  })

  it('rejects a table with no rows, since an empty table is omitted', async () => {
    const env = await createEnvironment()

    const response = await submit(env, {
      meta: META,
      data: {
        RECEIVED_LOADS_FOR_REPROCESSING: {
          headers: REPROCESSOR_RECEIVED_HEADERS,
          rows: []
        }
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(JSON.parse(response.payload)).not.toHaveProperty('summaryLogId')
  })

  it('rejects a payload that names the template, since it is inferred from the registration', async () => {
    const env = await createEnvironment()

    const response = await submit(env, {
      ...payloadWithReceived([{ rowId: 1001, tonnageReceived: 100 }]),
      meta: { ...META, PROCESSING_TYPE: 'REPROCESSOR_OUTPUT' }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    expect(JSON.parse(response.payload)).not.toHaveProperty('summaryLogId')
  })

  it('requires the organisation write scope', async () => {
    const env = await createEnvironment()

    const response = await env.server.inject({
      method: 'POST',
      url: submitUrl(env.organisationId, env.registrationId),
      payload: payloadWithReceived([{ rowId: 1001, tonnageReceived: 100 }])
    })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
  })

  it('is not registered when the dev endpoints flag is off', async () => {
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'reprocessor',
      reprocessingType: 'input'
    })

    const response = await submit(
      env,
      payloadWithReceived([{ rowId: 1001, tonnageReceived: 100 }])
    )

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })
})
