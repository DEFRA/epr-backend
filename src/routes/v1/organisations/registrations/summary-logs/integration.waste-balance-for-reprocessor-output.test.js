import { http, HttpResponse } from 'msw'
import { vi } from 'vitest'

import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { syncFromSummaryLog } from '#application/waste-records/sync-from-summary-log.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS,
  transitionStatus
} from '#domain/summary-logs/status.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { createInMemoryWasteBalancesRepository } from '#repositories/waste-balances/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { ObjectId } from 'mongodb'

import {
  asStandardUser,
  buildGetUrl,
  buildPostUrl,
  buildSubmitUrl,
  createUploadPayload,
  pollForValidation
} from './integration-test-helpers.js'

describe('Submission and placeholder tests (Reprocessor Output)', () => {
  let organisationId
  let registrationId

  const { getServer } = setupAuthContext()

  beforeEach(() => {
    organisationId = new ObjectId().toString()
    registrationId = new ObjectId().toString()

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

    const sharedMeta = {
      REGISTRATION_NUMBER: {
        value: 'REG-12345',
        location: { sheet: 'Data', row: 1, column: 'B' }
      },
      PROCESSING_TYPE: {
        value: 'REPROCESSOR_OUTPUT',
        location: { sheet: 'Data', row: 2, column: 'B' }
      },
      MATERIAL: {
        value: 'Paper_and_board',
        location: { sheet: 'Data', row: 3, column: 'B' }
      },
      TEMPLATE_VERSION: {
        value: 5,
        location: { sheet: 'Data', row: 4, column: 'B' }
      },
      ACCREDITATION_NUMBER: {
        value: 'ACC-2025-001',
        location: { sheet: 'Data', row: 5, column: 'B' }
      }
    }

    const reprocessedHeaders = [
      'ROW_ID',
      'DATE_LOAD_LEFT_SITE',
      'PRODUCT_TONNAGE',
      'UK_PACKAGING_WEIGHT_PERCENTAGE',
      'PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION',
      'ADD_PRODUCT_WEIGHT'
    ]

    const createReprocessedRowValues = (overrides = {}) => {
      const defaults = {
        rowId: 3001,
        dateLeft: '2025-01-15T00:00:00.000Z',
        productTonnage: 100,
        ukPackagingWeightPercentage: 1,
        productUkPackagingWeightProportion: 100,
        addProductWeight: 'Yes'
      }
      const d = { ...defaults, ...overrides }
      return [
        d.rowId,
        d.dateLeft,
        d.productTonnage,
        d.ukPackagingWeightPercentage,
        d.productUkPackagingWeightProportion,
        d.addProductWeight
      ]
    }

    const createUploadData = (reprocessedRows = []) => ({
      REPROCESSED_LOADS: {
        location: { sheet: 'Reprocessed', row: 7, column: 'A' },
        headers: reprocessedHeaders,
        rows: reprocessedRows.map((row, index) => ({
          rowNumber: 8 + index,
          values: createReprocessedRowValues(row)
        }))
      }
    })

    const setupIntegrationEnvironment = async () => {
      const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        fatal: vi.fn()
      }
      const uploadsRepository = createInMemoryUploadsRepository()
      const summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

      const accreditationId = new ObjectId().toString()
      const testOrg = buildOrganisation({
        registrations: [
          {
            id: registrationId,
            registrationNumber: 'REG-12345',
            status: 'approved',
            material: 'paper',
            wasteProcessingType: 'reprocessor',
            reprocessingType: 'output',
            formSubmissionTime: new Date(),
            submittedToRegulator: 'ea',
            validFrom: '2025-01-01',
            validTo: '2025-12-31',
            accreditationId
          }
        ],
        accreditations: [
          {
            id: accreditationId,
            accreditationNumber: 'ACC-2025-001',
            validFrom: '2025-01-01',
            validTo: '2025-12-31'
          }
        ]
      })
      testOrg.id = organisationId

      const organisationsRepository = createInMemoryOrganisationsRepository([
        testOrg
      ])()

      const wasteRecordsRepositoryFactory =
        createInMemoryWasteRecordsRepository()
      const wasteRecordsRepository = wasteRecordsRepositoryFactory()

      const wasteBalancesRepositoryFactory =
        createInMemoryWasteBalancesRepository([], { organisationsRepository })
      const wasteBalancesRepository = wasteBalancesRepositoryFactory()

      const fileDataMap = {}
      const dynamicExtractor = {
        extract: async (summaryLog) => {
          const fileId = summaryLog.file.id
          if (!fileDataMap[fileId]) {
            throw new Error(`No data found for file ${fileId}`)
          }
          return fileDataMap[fileId]
        }
      }

      const validateSummaryLog = createSummaryLogsValidator({
        summaryLogsRepository,
        organisationsRepository,
        wasteRecordsRepository,
        summaryLogExtractor: dynamicExtractor
      })

      const featureFlags = createInMemoryFeatureFlags({
        summaryLogs: true
      })

      const syncWasteRecords = syncFromSummaryLog({
        extractor: dynamicExtractor,
        wasteRecordRepository: wasteRecordsRepository,
        wasteBalancesRepository,
        organisationsRepository
      })

      const submitterWorker = {
        validate: validateSummaryLog,
        submit: async (summaryLogId) => {
          await new Promise((resolve) => setImmediate(resolve))

          const existing = await summaryLogsRepository.findById(summaryLogId)
          const { version, summaryLog } = existing

          await syncWasteRecords(summaryLog)

          await summaryLogsRepository.update(
            summaryLogId,
            version,
            transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMITTED)
          )
        }
      }

      const server = await createTestServer({
        repositories: {
          summaryLogsRepository: summaryLogsRepositoryFactory,
          uploadsRepository,
          wasteRecordsRepository: wasteRecordsRepositoryFactory,
          organisationsRepository: () => organisationsRepository,
          wasteBalancesRepository: wasteBalancesRepositoryFactory
        },
        workers: {
          summaryLogsWorker: submitterWorker
        },
        featureFlags
      })

      return {
        server,
        wasteBalancesRepository,
        accreditationId,
        fileDataMap,
        submitterWorker
      }
    }

    const uploadAndValidate = async (
      env,
      summaryLogId,
      fileId,
      filename,
      uploadData
    ) => {
      const { server, fileDataMap } = env

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
      const { server } = env

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
      const env = await setupIntegrationEnvironment()
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
      const env = await setupIntegrationEnvironment()
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
      const env = await setupIntegrationEnvironment()
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
      const env = await setupIntegrationEnvironment()
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
