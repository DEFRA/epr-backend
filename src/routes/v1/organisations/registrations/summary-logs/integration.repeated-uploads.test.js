import { describe, it, expect, beforeEach, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'

import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import {
  asStandardUser,
  buildGetUrl,
  buildPostUrl,
  buildSubmitUrl,
  createUploadPayload,
  pollForValidation,
  pollWhileStatus,
  setupIntegrationEnvironment,
  performSubmission,
  createReprocessorInputUploadData,
  createWasteBalanceMeta
} from './test-helpers/index.js'

const performFirstSubmission = async ({
  env,
  organisationId,
  registrationId,
  firstSummaryLogId,
  firstFileId,
  uploadData,
  sharedMeta
}) => {
  const firstSubmissionStatus = await performSubmission(
    env,
    organisationId,
    registrationId,
    firstSummaryLogId,
    firstFileId,
    {
      filename: 'waste-data-1.xlsx',
      uploadData,
      sharedMeta
    }
  )

  if (firstSubmissionStatus !== SUMMARY_LOG_STATUS.SUBMITTED) {
    const response = await env.server.inject({
      method: 'GET',
      url: buildGetUrl(organisationId, registrationId, firstSummaryLogId),
      ...asStandardUser({ linkedOrgId: organisationId })
    })
    throw new Error(`First submission failed validation: ${response.payload}`)
  }
}

const performRepeatedUploadSetup = async ({
  env,
  organisationId,
  registrationId,
  firstSummaryLogId,
  firstFileId,
  secondSummaryLogId,
  secondFileId,
  uploadData,
  sharedMeta
}) => {
  await performFirstSubmission({
    env,
    organisationId,
    registrationId,
    firstSummaryLogId,
    firstFileId,
    uploadData,
    sharedMeta
  })

  // === Second upload: upload the same data again ===
  const secondUploadResponse = await env.server.inject({
    method: 'POST',
    url: buildPostUrl(organisationId, registrationId, secondSummaryLogId),
    payload: createUploadPayload(
      organisationId,
      registrationId,
      UPLOAD_STATUS.COMPLETE,
      secondFileId,
      'waste-data.xlsx'
    )
  })

  await pollForValidation(
    env.server,
    organisationId,
    registrationId,
    secondSummaryLogId
  )

  return secondUploadResponse
}

describe('Repeated uploads - Classification', () => {
  let organisationId
  let registrationId

  const { getServer } = setupAuthContext()

  beforeEach(() => {
    organisationId = new ObjectId().toString()
    registrationId = new ObjectId().toString()

    getServer().use(
      http.post(
        'http://localhost:3001/v1/organisations/:orgId/registrations/:regId/summary-logs/:summaryLogId/upload-completed',
        () => HttpResponse.json({ success: true }, { status: StatusCodes.OK })
      )
    )
  })

  describe('when the same data is uploaded and submitted twice - classification', () => {
    const firstSummaryLogId = 'summary-log-first-upload'
    const secondSummaryLogId = 'summary-log-second-upload'
    const firstFileId = 'file-first-upload'
    const secondFileId = 'file-second-upload'

    let env
    let secondUploadResponse

    beforeEach(async () => {
      const accreditationId = new ObjectId().toString()
      const sharedMeta = createWasteBalanceMeta('REPROCESSOR_INPUT')

      const sharedRows = [
        { rowId: 1001, tonnageReceived: 850 },
        { rowId: 1002, tonnageReceived: 765 }
      ]

      const uploadData = createReprocessorInputUploadData(sharedRows)

      const extractorData = {
        [firstFileId]: { meta: sharedMeta, data: uploadData },
        [secondFileId]: { meta: sharedMeta, data: uploadData }
      }

      const mockWasteBalancesRepository = {
        updateWasteBalanceTransactions: vi.fn()
      }

      env = await setupIntegrationEnvironment(
        /** @type {any} */ ({
          organisationId,
          registrationId,
          accreditationId,
          material: 'paper',
          wasteProcessingType: 'reprocessor',
          reprocessingType: 'input',
          extractorData,
          extraRepositories: {
            wasteBalancesRepository: () => mockWasteBalancesRepository
          }
        })
      )

      secondUploadResponse = await performRepeatedUploadSetup({
        env,
        organisationId,
        registrationId,
        firstSummaryLogId,
        firstFileId,
        secondSummaryLogId,
        secondFileId,
        uploadData,
        sharedMeta
      })
    })

    it('should accept the second upload', () => {
      expect(secondUploadResponse.statusCode).toBe(StatusCodes.ACCEPTED)
    })

    it('should classify all loads as unchanged on second upload', async () => {
      const response = await env.server.inject({
        method: 'GET',
        url: buildGetUrl(organisationId, registrationId, secondSummaryLogId),
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const payload = JSON.parse(response.payload)

      // Check no validation failures first - will show issues if any
      expect(payload.validation?.failures ?? []).toEqual([])
      expect(payload.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)

      // No loads should be added or adjusted
      expect(payload.loads.added.valid.count).toBe(0)
      expect(payload.loads.added.invalid.count).toBe(0)
      expect(payload.loads.adjusted.valid.count).toBe(0)
      expect(payload.loads.adjusted.invalid.count).toBe(0)

      // All loads should be unchanged
      const totalUnchanged =
        payload.loads.unchanged.valid.count +
        payload.loads.unchanged.invalid.count
      expect(totalUnchanged).toBeGreaterThan(0)
    })
  })
})

describe('Repeated uploads - Waste Records', () => {
  let organisationId
  let registrationId

  const { getServer } = setupAuthContext()

  beforeEach(() => {
    organisationId = new ObjectId().toString()
    registrationId = new ObjectId().toString()

    getServer().use(
      http.post(
        'http://localhost:3001/v1/organisations/:orgId/registrations/:regId/summary-logs/:summaryLogId/upload-completed',
        () => HttpResponse.json({ success: true }, { status: StatusCodes.OK })
      )
    )
  })

  describe('when the same data is uploaded and submitted twice - waste records', () => {
    const firstSummaryLogId = 'summary-log-first-upload'
    const secondSummaryLogId = 'summary-log-second-upload'
    const firstFileId = 'file-first-upload'
    const secondFileId = 'file-second-upload'

    let env

    beforeEach(async () => {
      const accreditationId = new ObjectId().toString()
      const sharedMeta = createWasteBalanceMeta('REPROCESSOR_INPUT')
      const sharedRows = [
        { rowId: 1001, tonnageReceived: 850 },
        { rowId: 1002, tonnageReceived: 765 }
      ]
      const uploadData = createReprocessorInputUploadData(sharedRows)

      const extractorData = {
        [firstFileId]: { meta: sharedMeta, data: uploadData },
        [secondFileId]: { meta: sharedMeta, data: uploadData }
      }

      const mockWasteBalancesRepository = {
        updateWasteBalanceTransactions: vi.fn()
      }

      env = await setupIntegrationEnvironment(
        /** @type {any} */ ({
          organisationId,
          registrationId,
          accreditationId,
          material: 'paper',
          wasteProcessingType: 'reprocessor',
          reprocessingType: 'input',
          extractorData,
          extraRepositories: {
            wasteBalancesRepository: () => mockWasteBalancesRepository
          }
        })
      )

      await performRepeatedUploadSetup({
        env,
        organisationId,
        registrationId,
        firstSummaryLogId,
        firstFileId,
        secondSummaryLogId,
        secondFileId,
        uploadData,
        sharedMeta
      })
    })

    it(
      'should not create additional waste record versions on second submission',
      { timeout: 60000 },
      async () => {
        // Get waste records before second submission
        const recordsBefore =
          await env.wasteRecordsRepository.findByRegistration(
            organisationId,
            registrationId
          )
        const versionCountsBefore = recordsBefore.map((r) => r.versions.length)

        // Submit the second upload
        await env.server.inject({
          method: 'POST',
          url: buildSubmitUrl(
            organisationId,
            registrationId,
            secondSummaryLogId
          ),
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        await pollWhileStatus(
          env.server,
          organisationId,
          registrationId,
          secondSummaryLogId,
          { waitWhile: SUMMARY_LOG_STATUS.SUBMITTING }
        )

        // Get waste records after second submission
        const recordsAfter =
          await env.wasteRecordsRepository.findByRegistration(
            organisationId,
            registrationId
          )
        const versionCountsAfter = recordsAfter.map((r) => r.versions.length)

        // Version counts should be unchanged (no new versions created)
        expect(versionCountsAfter).toEqual(versionCountsBefore)
      }
    )
  })
})
