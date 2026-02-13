import { http, HttpResponse } from 'msw'

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
  setupWasteBalanceIntegrationEnvironment,
  createWasteBalanceMeta,
  createReprocessedRowValues,
  REPROCESSED_LOADS_HEADERS
} from './integration-test-helpers.js'

describe('Submission and placeholder tests (Reprocessor Output)', () => {
  const { getServer } = setupAuthContext()

  beforeEach(() => {
    getServer().use(
      http.post(
        'http://localhost:3001/v1/organisations/:orgId/registrations/:regId/summary-logs/:summaryLogId/upload-completed',
        () => HttpResponse.json({ success: true }, { status: 200 })
      )
    )
  })

  describe('submitting a validated summary log', () => {
    const summaryLogId = 'summary-submit-test-repro-out'
    const fileId = 'file-submit-repro-out-123'
    const filename = 'waste-data-repro-out.xlsx'

    const sharedMeta = createWasteBalanceMeta('REPROCESSOR_OUTPUT')

    const createUploadData = (reprocessedRows = []) => ({
      REPROCESSED_LOADS: {
        location: { sheet: 'Reprocessed', row: 7, column: 'A' },
        headers: REPROCESSED_LOADS_HEADERS,
        rows: reprocessedRows.map((row, index) => ({
          rowNumber: 8 + index,
          values: createReprocessedRowValues(row)
        }))
      }
    })

    const uploadAndValidate = async (
      env,
      summaryLogId,
      fileId,
      filename,
      uploadData
    ) => {
      const { server, fileDataMap, organisationId, registrationId } = env

      fileDataMap[fileId] = { meta: sharedMeta, data: uploadData }

      await server.inject({
        method: 'POST',
        url: buildPostUrl(organisationId, registrationId, summaryLogId),
        payload: createUploadPayload(
          organisationId,
          registrationId,
          UPLOAD_STATUS.COMPLETE,
          fileId,
          filename
        )
      })

      await pollForValidation(
        server,
        organisationId,
        registrationId,
        summaryLogId
      )

      return server.inject({
        method: 'GET',
        url: buildGetUrl(organisationId, registrationId, summaryLogId),
        ...asStandardUser({ linkedOrgId: organisationId })
      })
    }

    const submitAndPoll = async (env, summaryLogId) => {
      const { server, organisationId, registrationId } = env

      await server.inject({
        method: 'POST',
        url: buildSubmitUrl(organisationId, registrationId, summaryLogId),
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      let attempts = 0
      const maxAttempts = 10
      let status = SUMMARY_LOG_STATUS.SUBMITTING

      while (
        status === SUMMARY_LOG_STATUS.SUBMITTING &&
        attempts < maxAttempts
      ) {
        await new Promise((resolve) => setTimeout(resolve, 50))

        const checkResponse = await server.inject({
          method: 'GET',
          url: buildGetUrl(organisationId, registrationId, summaryLogId),
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        status = JSON.parse(checkResponse.payload).status
        attempts++
      }
      return status
    }

    const performSubmission = async (
      env,
      summaryLogId,
      fileId,
      filename,
      uploadData
    ) => {
      await uploadAndValidate(env, summaryLogId, fileId, filename, uploadData)
      await submitAndPoll(env, summaryLogId)
    }

    it('should update waste balance with credits from reprocessed loads', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'reprocessor',
        reprocessingType: 'output'
      })
      const { wasteBalancesRepository, accreditationId } = env

      const uploadData = createUploadData([
        { rowId: 3001, productUkPackagingWeightProportion: 100 },
        {
          rowId: 3002,
          productTonnage: 200,
          productUkPackagingWeightProportion: 200,
          dateLeft: '2025-01-16T00:00:00.000Z'
        }
      ])

      await performSubmission(env, summaryLogId, fileId, filename, uploadData)

      const balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)

      expect(balance).toBeDefined()
      expect(balance.transactions).toHaveLength(2)

      // 100 + 200 = 300
      expect(balance.amount).toBeCloseTo(300)
      expect(balance.availableAmount).toBeCloseTo(300)

      const transaction1 = balance.transactions.find(
        (t) => Math.abs(t.amount - 100) < 0.001
      )
      expect(transaction1).toBeDefined()
      expect(transaction1.type).toBe('credit')
      expect(transaction1.entities[0].id).toBe('3001')
    })

    it('should not create transaction if ADD_PRODUCT_WEIGHT is No', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'reprocessor',
        reprocessingType: 'output'
      })
      const { wasteBalancesRepository, accreditationId } = env

      const uploadData = createUploadData([
        {
          rowId: 3001,
          productUkPackagingWeightProportion: 100,
          addProductWeight: 'No'
        },
        {
          rowId: 3002,
          productTonnage: 200,
          productUkPackagingWeightProportion: 200,
          addProductWeight: 'Yes'
        }
      ])

      await performSubmission(
        env,
        'summary-eligibility-check',
        'file-eligibility-check',
        'waste-data-eligibility.xlsx',
        uploadData
      )

      const balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)

      expect(balance.transactions).toHaveLength(1)
      expect(balance.amount).toBeCloseTo(200)
      expect(balance.transactions[0].entities[0].id).toBe('3002')
    })

    it('should not create transaction for reprocessed load outside accreditation period', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'reprocessor',
        reprocessingType: 'output'
      })
      const { wasteBalancesRepository, accreditationId } = env

      const uploadData = createUploadData([
        {
          rowId: 3001,
          productUkPackagingWeightProportion: 100,
          dateLeft: '2024-12-31T00:00:00.000Z' // Before 2025-01-01
        },
        {
          rowId: 3002,
          productTonnage: 200,
          productUkPackagingWeightProportion: 200,
          dateLeft: '2025-01-01T00:00:00.000Z' // On start date
        }
      ])

      await performSubmission(
        env,
        'summary-date-check',
        'file-date-check',
        'waste-data-date.xlsx',
        uploadData
      )

      const balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)

      expect(balance.transactions).toHaveLength(1)
      expect(balance.amount).toBeCloseTo(200)
      expect(balance.transactions[0].entities[0].id).toBe('3002')
    })

    it('should update waste balance correctly when a reprocessed load is updated', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'reprocessor',
        reprocessingType: 'output'
      })
      const { wasteBalancesRepository, accreditationId } = env

      // 1. Initial Submission: 100 tonnes
      const uploadData1 = createUploadData([
        { rowId: 3001, productUkPackagingWeightProportion: 100 }
      ])

      await performSubmission(
        env,
        'summary-update-1',
        'file-update-1',
        'waste-data-1.xlsx',
        uploadData1
      )

      let balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(100)

      // 2. Update Submission: 150 tonnes (Increase)
      const uploadData2 = createUploadData([
        {
          rowId: 3001,
          productTonnage: 150,
          productUkPackagingWeightProportion: 150
        }
      ])

      await performSubmission(
        env,
        'summary-update-2',
        'file-update-2',
        'waste-data-2.xlsx',
        uploadData2
      )

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(150)

      // Check for the delta transaction
      const transactions = balance.transactions
      expect(transactions).toHaveLength(2)
      const deltaTransaction = transactions[1]
      expect(deltaTransaction.amount).toBeCloseTo(50)
      expect(deltaTransaction.type).toBe('credit')

      // 3. Update Submission: 120 tonnes (Decrease)
      const uploadData3 = createUploadData([
        {
          rowId: 3001,
          productTonnage: 120,
          productUkPackagingWeightProportion: 120
        }
      ])

      await performSubmission(
        env,
        'summary-update-3',
        'file-update-3',
        'waste-data-3.xlsx',
        uploadData3
      )

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(120)

      // Check for the debit transaction
      expect(balance.transactions).toHaveLength(3)
      const debitTransaction = balance.transactions[2]
      expect(debitTransaction.amount).toBeCloseTo(30)
      expect(debitTransaction.type).toBe('debit')
    })
  })
})
