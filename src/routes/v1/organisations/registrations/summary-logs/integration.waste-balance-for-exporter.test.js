import { http, HttpResponse } from 'msw'
import { vi } from 'vitest'
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
  setupWasteBalanceIntegrationEnvironment,
  createWasteBalanceMeta,
  createExporterRowValues,
  EXPORTER_HEADERS,
  pollWhileStatus
} from './integration-test-helpers.js'

describe('Submission and placeholder tests (Exporter)', () => {
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
    const summaryLogId = 'summary-submit-test'
    const fileId = 'file-submit-123'
    const filename = 'waste-data.xlsx'

    const sharedMeta = createWasteBalanceMeta('EXPORTER')

    const createUploadData = (rows) => ({
      RECEIVED_LOADS_FOR_EXPORT: {
        location: { sheet: 'Received', row: 7, column: 'A' },
        headers: EXPORTER_HEADERS,
        rows: rows.map((row, index) => ({
          rowNumber: 8 + index,
          values: createExporterRowValues(row)
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

      // Register the file data for this submission
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

    it('should update waste balance with transactions', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { wasteBalancesRepository, accreditationId } = env

      const firstUploadData = createUploadData([
        { rowId: 1001, exportTonnage: 100 },
        {
          rowId: 1002,
          exportTonnage: 200,
          dateReceived: '2025-01-16T00:00:00.000Z',
          dateOfExport: '2025-01-21T00:00:00.000Z'
        }
      ])

      await performSubmission(
        env,
        summaryLogId,
        fileId,
        filename,
        firstUploadData
      )

      const balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)

      expect(balance).toBeDefined()
      expect(balance.transactions).toHaveLength(2)

      // Check total amount
      // 100 + 200 = 300
      expect(balance.amount).toBeCloseTo(300)
      expect(balance.availableAmount).toBeCloseTo(300)

      // Verify individual transactions
      const transaction1 = balance.transactions.find(
        (t) => Math.abs(t.amount - 100) < 0.001
      )
      const transaction2 = balance.transactions.find(
        (t) => Math.abs(t.amount - 200) < 0.001
      )

      expect(transaction1).toBeDefined()
      expect(transaction1.type).toBe('credit')
      expect(transaction1.entities).toHaveLength(1)
      expect(transaction1.entities[0].id).toBe('1001')

      expect(transaction2).toBeDefined()
      expect(transaction2.type).toBe('credit')
      expect(transaction2.entities).toHaveLength(1)
      expect(transaction2.entities[0].id).toBe('1002')
    })

    it('should update waste balance correctly when a revised summary log is submitted', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { wasteBalancesRepository, accreditationId } = env

      const firstUploadData = createUploadData([
        { rowId: 1001, exportTonnage: 100 },
        {
          rowId: 1002,
          exportTonnage: 200,
          dateReceived: '2025-01-16T00:00:00.000Z',
          dateOfExport: '2025-01-21T00:00:00.000Z'
        }
      ])

      // First submission
      await performSubmission(
        env,
        'summary-log-1',
        'file-1',
        'waste-data.xlsx',
        firstUploadData
      )

      let balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(300)
      expect(balance.availableAmount).toBeCloseTo(300)

      // Second submission (revised data)
      const secondUploadData = createUploadData([
        { rowId: 1001, exportTonnage: 100 },
        {
          rowId: 1002,
          exportTonnage: 100,
          dateReceived: '2025-01-16T00:00:00.000Z',
          dateOfExport: '2025-01-21T00:00:00.000Z',
          grossWeight: 1000,
          tareWeight: 100,
          palletWeight: 50,
          netWeight: 850
        }
      ])

      // Submit revised log (new summary log ID, new file ID)
      await performSubmission(
        env,
        'summary-log-2',
        'file-2',
        'waste-data-v2.xlsx',
        secondUploadData
      )

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)

      // 100 + 100 = 200
      expect(balance.amount).toBeCloseTo(200)
      expect(balance.availableAmount).toBeCloseTo(200)

      // Verify transactions
      expect(balance.transactions).toHaveLength(3)

      // 1. Original credit for row 1001 (100)
      const tx1 = balance.transactions.find(
        (t) => t.entities[0].id === '1001' && t.type === 'credit'
      )
      expect(tx1).toBeDefined()
      expect(tx1.amount).toBeCloseTo(100)

      // 2. Original credit for row 1002 (200)
      const tx2 = balance.transactions.find(
        (t) => t.entities[0].id === '1002' && t.type === 'credit'
      )
      expect(tx2).toBeDefined()
      expect(tx2.amount).toBeCloseTo(200)
      expect(tx2.entities[0].previousVersionIds).toHaveLength(0)
      const v1Id = tx2.entities[0].currentVersionId
      expect(v1Id).toBeDefined()

      // 3. Debit for row 1002 (100) - correction
      const tx3 = balance.transactions.find(
        (t) => t.entities[0].id === '1002' && t.type === 'debit'
      )
      expect(tx3).toBeDefined()
      expect(tx3.amount).toBeCloseTo(100)
      expect(tx3.entities[0].currentVersionId).not.toBe(v1Id)
      expect(tx3.entities[0].previousVersionIds).toContain(v1Id)
    })

    it('should not create transaction for a row where PRN was already issued', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { wasteBalancesRepository, accreditationId } = env

      const uploadData = createUploadData([
        { rowId: 2001, prnIssued: 'Yes', exportTonnage: 100 },
        {
          rowId: 2002,
          prnIssued: 'No',
          exportTonnage: 200,
          dateReceived: '2025-01-16T00:00:00.000Z',
          dateOfExport: '2025-01-21T00:00:00.000Z'
        }
      ])

      await performSubmission(
        env,
        'summary-prn-issued',
        'file-prn-issued',
        'waste-data-prn.xlsx',
        uploadData
      )

      const balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)

      expect(balance).toBeDefined()
      // Only row 2002 should contribute (PRN not issued)
      expect(balance.transactions).toHaveLength(1)
      expect(balance.amount).toBeCloseTo(200)
      expect(balance.availableAmount).toBeCloseTo(200)

      // Verify only the non-PRN-issued row created a transaction
      const transaction = balance.transactions[0]
      expect(transaction.entities[0].id).toBe('2002')
      expect(transaction.type).toBe('credit')
      expect(transaction.amount).toBeCloseTo(200)
    })

    it('should not create transaction for a row that falls outside the accreditation period', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { wasteBalancesRepository, accreditationId } = env

      const uploadData = createUploadData([
        {
          rowId: 3001,
          dateReceived: '2024-06-15T00:00:00.000Z',
          exportDate: '2024-06-20T00:00:00.000Z',
          exportTonnage: 100
        },
        {
          rowId: 3002,
          dateReceived: '2025-06-15T00:00:00.000Z',
          exportDate: '2025-06-21T00:00:00.000Z',
          exportTonnage: 200
        }
      ])

      await performSubmission(
        env,
        'summary-outside-period',
        'file-outside-period',
        'waste-data-period.xlsx',
        uploadData
      )

      const balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)

      expect(balance).toBeDefined()
      // Only row 3002 should contribute (within accreditation period)
      expect(balance.transactions).toHaveLength(1)
      expect(balance.amount).toBeCloseTo(200)
      expect(balance.availableAmount).toBeCloseTo(200)

      // Verify only the in-period row created a transaction
      const transaction = balance.transactions[0]
      expect(transaction.entities[0].id).toBe('3002')
      expect(transaction.type).toBe('credit')
    })

    it('should handle submission with missing mandatory fields', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })

      const response = await uploadAndValidate(
        env,
        'summary-missing-fields',
        'file-missing-fields',
        'waste-data-missing.xlsx',
        createUploadData([{ rowId: 4001, exportTonnage: 'not-a-number' }])
      )

      const summaryLog = JSON.parse(response.payload)

      // Should either be in INVALID status or have validation errors
      expect(
        summaryLog.status === SUMMARY_LOG_STATUS.INVALID ||
          (summaryLog.validation && summaryLog.validation.errors?.length > 0)
      ).toBe(true)
    })

    it('should create debit transaction when a row previously within accreditation period is revised to fall outside', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { wasteBalancesRepository, accreditationId } = env

      // First submission: row within accreditation period
      const firstUploadData = createUploadData([
        { rowId: 5001, exportTonnage: 100 }
      ])

      // First submission
      await performSubmission(
        env,
        'summary-period-change-1',
        'file-period-1',
        'waste-data-v1.xlsx',
        firstUploadData
      )

      let balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(100)
      expect(balance.transactions).toHaveLength(1)

      // Second submission: same row ID but date revised to fall outside accreditation period
      const secondUploadData = createUploadData([
        {
          rowId: 5001,
          dateReceived: '2024-06-15T00:00:00.000Z',
          exportDate: '2024-06-20T00:00:00.000Z',
          exportTonnage: 100
        }
      ])

      // Submit revised log
      await performSubmission(
        env,
        'summary-period-change-2',
        'file-period-2',
        'waste-data-v2.xlsx',
        secondUploadData
      )

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)

      // Balance should now be 0 - the credit was reversed
      expect(balance.amount).toBeCloseTo(0)
      expect(balance.availableAmount).toBeCloseTo(0)

      // Should have 2 transactions: original credit and corrective debit
      expect(balance.transactions).toHaveLength(2)

      // Verify the original credit
      const creditTx = balance.transactions.find((t) => t.type === 'credit')
      expect(creditTx).toBeDefined()
      expect(creditTx.amount).toBeCloseTo(100)
      expect(creditTx.entities[0].id).toBe('5001')

      // Verify the corrective debit
      const debitTx = balance.transactions.find((t) => t.type === 'debit')
      expect(debitTx).toBeDefined()
      expect(debitTx.amount).toBeCloseTo(100)
      expect(debitTx.entities[0].id).toBe('5001')
    })

    it('should create debit transaction when a row is revised to have PRN issued', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { wasteBalancesRepository, accreditationId } = env

      // First submission: row without PRN issued (gets credited)
      const firstUploadData = createUploadData([
        { rowId: 6001, prnIssued: 'No', exportTonnage: 100 }
      ])

      // First submission - should credit 100
      await performSubmission(
        env,
        'summary-prn-change-1',
        'file-prn-1',
        'waste-data-v1.xlsx',
        firstUploadData
      )

      let balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(balance.amount).toBeCloseTo(100)
      expect(balance.transactions).toHaveLength(1)

      // Second submission: same row but now PRN has been issued
      const secondUploadData = createUploadData([
        { rowId: 6001, prnIssued: 'Yes', exportTonnage: 100 }
      ])

      // Submit revised log - should debit 100 (PRN now issued)
      await performSubmission(
        env,
        'summary-prn-change-2',
        'file-prn-2',
        'waste-data-v2.xlsx',
        secondUploadData
      )

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)

      // Balance should now be 0 - the credit was reversed because PRN was issued
      expect(balance.amount).toBeCloseTo(0)
      expect(balance.availableAmount).toBeCloseTo(0)

      // Should have 2 transactions: original credit and corrective debit
      expect(balance.transactions).toHaveLength(2)

      const creditTx = balance.transactions.find((t) => t.type === 'credit')
      expect(creditTx).toBeDefined()
      expect(creditTx.amount).toBeCloseTo(100)

      const debitTx = balance.transactions.find((t) => t.type === 'debit')
      expect(debitTx).toBeDefined()
      expect(debitTx.amount).toBeCloseTo(100)
      expect(debitTx.entities[0].id).toBe('6001')
    })

    it('should create credit transaction when a row is revised from PRN issued to no PRN', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { wasteBalancesRepository, accreditationId } = env

      // First submission: row with PRN already issued (no credit)
      const firstUploadData = createUploadData([
        { rowId: 7001, prnIssued: 'Yes', exportTonnage: 100 }
      ])

      // First submission - should not credit (PRN issued)
      await performSubmission(
        env,
        'summary-prn-reverse-1',
        'file-prn-rev-1',
        'waste-data-v1.xlsx',
        firstUploadData
      )

      let balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)

      // No transactions should exist - PRN was issued
      expect(balance?.transactions?.length ?? 0).toBe(0)
      expect(balance?.amount ?? 0).toBeCloseTo(0)

      // Second submission: same row but PRN status corrected to No
      const secondUploadData = createUploadData([
        { rowId: 7001, prnIssued: 'No', exportTonnage: 100 }
      ])

      // Submit revised log - should now credit 100
      await performSubmission(
        env,
        'summary-prn-reverse-2',
        'file-prn-rev-2',
        'waste-data-v2.xlsx',
        secondUploadData
      )

      balance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)

      // Balance should now be 100 - credited after PRN status corrected
      expect(balance.amount).toBeCloseTo(100)
      expect(balance.availableAmount).toBeCloseTo(100)

      // Should have 1 credit transaction
      expect(balance.transactions).toHaveLength(1)
      expect(balance.transactions[0].type).toBe('credit')
      expect(balance.transactions[0].amount).toBeCloseTo(100)
      expect(balance.transactions[0].entities[0].id).toBe('7001')
    })

    it('should track multiple sequential revisions to the same row with correct running balance', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { wasteBalancesRepository, accreditationId } = env

      const revisions = [
        { tonnage: 100, expectedBalance: 100 },
        { tonnage: 150, expectedBalance: 150 },
        { tonnage: 80, expectedBalance: 80 },
        { tonnage: 200, expectedBalance: 200 }
      ]

      for (let i = 0; i < revisions.length; i++) {
        const rev = revisions[i]
        await performSubmission(
          env,
          `summary-multi-rev-${i + 1}`,
          `file-multi-${i + 1}`,
          `waste-data-v${i + 1}.xlsx`,
          createUploadData([{ rowId: 8001, exportTonnage: rev.tonnage }])
        )

        const balance =
          await wasteBalancesRepository.findByAccreditationId(accreditationId)
        expect(balance.amount).toBeCloseTo(rev.expectedBalance)
        expect(balance.transactions).toHaveLength(i + 1)
      }

      const finalBalance =
        await wasteBalancesRepository.findByAccreditationId(accreditationId)
      expect(finalBalance.availableAmount).toBeCloseTo(200)

      finalBalance.transactions.forEach((tx) => {
        expect(tx.entities[0].id).toBe('8001')
      })

      expect(
        finalBalance.transactions[0].entities[0].previousVersionIds?.length ?? 0
      ).toBe(0)
      for (let i = 1; i < finalBalance.transactions.length; i++) {
        expect(
          finalBalance.transactions[i].entities[0].previousVersionIds?.length
        ).toBeGreaterThan(0)
      }
    })
  })
})
