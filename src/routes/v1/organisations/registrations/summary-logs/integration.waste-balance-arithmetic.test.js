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

import {
  asStandardUser,
  buildGetUrl,
  buildPostUrl,
  buildSubmitUrl,
  createUploadPayload,
  getWasteBalance,
  pollForValidation,
  setupWasteBalanceIntegrationEnvironment,
  createWasteBalanceMeta,
  createExporterRowValues,
  EXPORTER_HEADERS
} from './integration-test-helpers.js'

/**
 * Integration tests for waste balance arithmetic across multiple operations.
 *
 * Tests verify that waste balance calculations remain correct when performing
 * a series of credits (from summary log submissions) and debits (from PRN creation).
 *
 * Per PAE-1003: available balance = total credits - PRN deductions
 */
describe('Waste balance arithmetic integration tests', () => {
  const { getServer } = setupAuthContext()

  beforeEach(() => {
    getServer().use(
      http.post(
        'http://localhost:3001/v1/organisations/:orgId/registrations/:regId/summary-logs/:summaryLogId/upload-completed',
        () => HttpResponse.json({ success: true }, { status: 200 })
      )
    )
  })

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

    while (status === SUMMARY_LOG_STATUS.SUBMITTING && attempts < maxAttempts) {
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

  const performSummaryLogSubmission = async (
    env,
    summaryLogId,
    fileId,
    filename,
    uploadData
  ) => {
    await uploadAndValidate(env, summaryLogId, fileId, filename, uploadData)
    await submitAndPoll(env, summaryLogId)
  }

  const createPrn = async (env, tonnage) => {
    const { server, organisationId, registrationId, accreditationId } = env

    const response = await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes`,
      ...asStandardUser({ linkedOrgId: organisationId }),
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

  const transitionPrnStatus = async (env, prnId, status) => {
    const { server, organisationId, registrationId, accreditationId } = env

    const response = await server.inject({
      method: 'POST',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/${prnId}/status`,
      ...asStandardUser({ linkedOrgId: organisationId }),
      payload: { status }
    })

    return JSON.parse(response.payload)
  }

  describe('series of credits and debits', () => {
    it('should maintain correct balance through multiple summary log submissions and PRN creations', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { accreditationId, registrationId } = env

      // Step 1: Submit first summary log with 100 + 200 = 300 tonnes
      await performSummaryLogSubmission(
        env,
        'log-1',
        'file-1',
        'waste-1.xlsx',
        createUploadData([
          { rowId: 1001, exportTonnage: 100 },
          { rowId: 1002, exportTonnage: 200 }
        ])
      )

      let balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(300) // 100 + 200 = 300
      expect(balance.availableAmount).toBe(300)

      // Step 2: Create PRN for 50 tonnes and raise it (deduct from available)
      const prn1 = await createPrn(env, 50)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(300) // Total unchanged
      expect(balance.availableAmount).toBe(250) // 300 - 50 = 250

      // Step 3: Submit revised summary log with additional row (all rows included)
      // Summary logs represent complete snapshots, so include all rows
      await performSummaryLogSubmission(
        env,
        'log-2',
        'file-2',
        'waste-2.xlsx',
        createUploadData([
          { rowId: 1001, exportTonnage: 100 },
          { rowId: 1002, exportTonnage: 200 },
          { rowId: 2001, exportTonnage: 150 }
        ])
      )

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(450) // 100 + 200 + 150 = 450
      expect(balance.availableAmount).toBe(400) // 450 - 50 = 400

      // Step 4: Create another PRN for 75 tonnes
      const prn2 = await createPrn(env, 75)
      await transitionPrnStatus(env, prn2.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(450) // Total unchanged
      expect(balance.availableAmount).toBe(325) // 400 - 75 = 325

      // Step 5: Create a third PRN for 100 tonnes
      const prn3 = await createPrn(env, 100)
      await transitionPrnStatus(env, prn3.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(450) // Total unchanged
      expect(balance.availableAmount).toBe(225) // 325 - 100 = 225
    })

    it('should handle interleaved credits and debits correctly', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { accreditationId, registrationId } = env

      // Interleave summary log submissions and PRN creations
      // Credit: 100
      await performSummaryLogSubmission(
        env,
        'log-a',
        'file-a',
        'waste-a.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 100 }])
      )

      let balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(100)
      expect(balance.availableAmount).toBe(100)

      // Debit: 30
      const prn1 = await createPrn(env, 30)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(100)
      expect(balance.availableAmount).toBe(70) // 100 - 30 = 70

      // Credit: 50 (include previous row 1001 in snapshot)
      await performSummaryLogSubmission(
        env,
        'log-b',
        'file-b',
        'waste-b.xlsx',
        createUploadData([
          { rowId: 1001, exportTonnage: 100 },
          { rowId: 2001, exportTonnage: 50 }
        ])
      )

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(150) // 100 + 50 = 150
      expect(balance.availableAmount).toBe(120) // 70 + 50 = 120

      // Debit: 45
      const prn2 = await createPrn(env, 45)
      await transitionPrnStatus(env, prn2.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(150) // Total unchanged
      expect(balance.availableAmount).toBe(75) // 120 - 45 = 75

      // Credit: 200 (include all previous rows in snapshot)
      await performSummaryLogSubmission(
        env,
        'log-c',
        'file-c',
        'waste-c.xlsx',
        createUploadData([
          { rowId: 1001, exportTonnage: 100 },
          { rowId: 2001, exportTonnage: 50 },
          { rowId: 3001, exportTonnage: 200 }
        ])
      )

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(350) // 100 + 50 + 200 = 350
      expect(balance.availableAmount).toBe(275) // 75 + 200 = 275

      // Debit: 125
      const prn3 = await createPrn(env, 125)
      await transitionPrnStatus(env, prn3.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(350) // Total unchanged
      expect(balance.availableAmount).toBe(150) // 275 - 125 = 150

      // Final verification: total credits = 100 + 50 + 200 = 350
      // Total debits = 30 + 45 + 125 = 200
      // Available = 350 - 200 = 150
    })

    it('preserves an issued PRN debit in amount when the same rows are re-uploaded (PAE-1380)', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { accreditationId, registrationId } = env

      await performSummaryLogSubmission(
        env,
        'log-issue-1',
        'file-issue-1',
        'waste-issue-1.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 200 }])
      )

      let balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(200)
      expect(balance.availableAmount).toBe(200)

      const prn = await createPrn(env, 50)
      await transitionPrnStatus(env, prn.id, PRN_STATUS.AWAITING_AUTHORISATION)
      await transitionPrnStatus(env, prn.id, PRN_STATUS.AWAITING_ACCEPTANCE)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(150)
      expect(balance.availableAmount).toBe(150)

      await performSummaryLogSubmission(
        env,
        'log-issue-2',
        'file-issue-2',
        'waste-issue-2.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 200 }])
      )

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(150)
      expect(balance.availableAmount).toBe(150)
    })

    it('should handle decimal tonnage values correctly', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { accreditationId, registrationId } = env

      // Credit: 100.5 (decimal tonnes from summary log)
      const firstCredit = 100.5
      await performSummaryLogSubmission(
        env,
        'log-decimal',
        'file-decimal',
        'waste-decimal.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: firstCredit }])
      )

      let balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(firstCredit)
      expect(balance.availableAmount).toBe(firstCredit)

      // Debit: 33 (PRN tonnage must be whole numbers)
      const debit1 = 33
      const expectedAvailable1 = 67.5
      const prn1 = await createPrn(env, debit1)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(firstCredit) // Total unchanged
      expect(balance.availableAmount).toBe(expectedAvailable1) // 100.5 - 33 = 67.5

      // Credit: 50.25 (include previous row in snapshot)
      const secondCredit = 50.25
      const expectedTotal2 = 150.75
      const expectedAvailable2 = 117.75
      await performSummaryLogSubmission(
        env,
        'log-decimal-2',
        'file-decimal-2',
        'waste-decimal-2.xlsx',
        createUploadData([
          { rowId: 1001, exportTonnage: firstCredit },
          { rowId: 2001, exportTonnage: secondCredit }
        ])
      )

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(expectedTotal2) // 100.5 + 50.25 = 150.75
      expect(balance.availableAmount).toBe(expectedAvailable2) // 150.75 - 33 = 117.75

      // Debit: 17 (PRN tonnage must be whole numbers)
      const debit2 = 17
      const expectedAvailable3 = 100.75
      const prn2 = await createPrn(env, debit2)
      await transitionPrnStatus(env, prn2.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(expectedTotal2) // Total unchanged
      expect(balance.availableAmount).toBe(expectedAvailable3) // 117.75 - 17 = 100.75
    })

    it('should reject PRN creation when tonnage exceeds available balance', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { accreditationId, registrationId } = env

      // Credit: 100
      const creditAmount = 100
      await performSummaryLogSubmission(
        env,
        'log-negative',
        'file-negative',
        'waste-negative.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: creditAmount }])
      )

      let balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(creditAmount)
      expect(balance.availableAmount).toBe(creditAmount)

      // Attempt to create PRN for 150 (more than available) - should be rejected
      const highTonnage = 150
      const prn1 = await createPrn(env, highTonnage)
      const result = await transitionPrnStatus(
        env,
        prn1.id,
        PRN_STATUS.AWAITING_AUTHORISATION
      )
      expect(result.statusCode).toBe(409)
      expect(result.message).toBe('Insufficient available waste balance')

      // Balance should be unchanged
      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(100)
      expect(balance.availableAmount).toBe(100)
    })

    it('should reject PRN issue when tonnage exceeds total balance', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { accreditationId, registrationId } = env

      // Credit: 100
      await performSummaryLogSubmission(
        env,
        'log-total-reject',
        'file-total-reject',
        'waste-total-reject.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 100 }])
      )

      let balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(100)
      expect(balance.availableAmount).toBe(100)

      // Create and raise PRN for 50 (within available)
      const prn1 = await createPrn(env, 50)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(100)
      expect(balance.availableAmount).toBe(50)

      // Manually reduce total balance to simulate concurrent deduction
      await env.wasteBalanceService.issuePrn(
        {
          organisationId: env.organisationId,
          registrationId: env.registrationId,
          accreditationId
        },
        { prnId: 'other-prn', amount: 80 },
        { id: 'test-user' }
      )

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(20) // 100 - 80

      // Attempt to issue PRN for 50 (more than remaining total of 20) - should be rejected
      const result = await transitionPrnStatus(
        env,
        prn1.id,
        PRN_STATUS.AWAITING_ACCEPTANCE
      )
      expect(result.statusCode).toBe(409)
      expect(result.message).toBe('Insufficient total waste balance')

      // Balance should be unchanged
      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(20)
    })

    it('should deduct from total balance when PRN is issued', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { accreditationId, registrationId } = env

      // Credit: 200
      await performSummaryLogSubmission(
        env,
        'log-issue-1',
        'file-issue-1',
        'waste-issue-1.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 200 }])
      )

      let balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(200)
      expect(balance.availableAmount).toBe(200)

      // Create PRN for 50 tonnes
      const prn1 = await createPrn(env, 50)

      // Raise PRN (deduct from available only)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(200) // Total unchanged
      expect(balance.availableAmount).toBe(150) // 200 - 50 = 150

      // Issue PRN (deduct from total only)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_ACCEPTANCE)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(150) // 200 - 50 = 150 (now deducted)
      expect(balance.availableAmount).toBe(150) // Unchanged from issue
    })

    it('should handle complete PRN lifecycle with multiple PRNs', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { accreditationId, registrationId } = env

      // Credit: 500
      await performSummaryLogSubmission(
        env,
        'log-lifecycle',
        'file-lifecycle',
        'waste-lifecycle.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 500 }])
      )

      let balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(500)
      expect(balance.availableAmount).toBe(500)

      // Create and raise PRN 1 for 100 tonnes
      const prn1 = await createPrn(env, 100)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(500)
      expect(balance.availableAmount).toBe(400) // 500 - 100

      // Create and raise PRN 2 for 75 tonnes
      const prn2 = await createPrn(env, 75)
      await transitionPrnStatus(env, prn2.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(500)
      expect(balance.availableAmount).toBe(325) // 400 - 75

      // Issue PRN 1 (total deducted, available unchanged)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_ACCEPTANCE)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(400) // 500 - 100
      expect(balance.availableAmount).toBe(325) // Unchanged

      // Create and raise PRN 3 for 50 tonnes
      const prn3 = await createPrn(env, 50)
      await transitionPrnStatus(env, prn3.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(400) // Unchanged
      expect(balance.availableAmount).toBe(275) // 325 - 50

      // Issue PRN 2 (total deducted, available unchanged)
      await transitionPrnStatus(env, prn2.id, PRN_STATUS.AWAITING_ACCEPTANCE)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(325) // 400 - 75
      expect(balance.availableAmount).toBe(275) // Unchanged

      // Issue PRN 3 (total deducted, available unchanged)
      await transitionPrnStatus(env, prn3.id, PRN_STATUS.AWAITING_ACCEPTANCE)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(275) // 325 - 50
      expect(balance.availableAmount).toBe(275) // Now matches total

      // Final state: All PRNs issued, total = available = 500 - 100 - 75 - 50 = 275
    })

    it('should handle revisions that affect running totals', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { accreditationId, registrationId } = env

      // Initial submission: 100 tonnes
      await performSummaryLogSubmission(
        env,
        'log-revision-1',
        'file-revision-1',
        'waste-revision-1.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 100 }])
      )

      let balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(100)
      expect(balance.availableAmount).toBe(100)

      // Create PRN for 30 tonnes
      const prn1 = await createPrn(env, 30)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(100)
      expect(balance.availableAmount).toBe(70)

      // Revise the row - reduce to 80 tonnes
      await performSummaryLogSubmission(
        env,
        'log-revision-2',
        'file-revision-2',
        'waste-revision-2.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 80 }])
      )

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(80) // Revised down
      expect(balance.availableAmount).toBe(50) // 80 - 30 = 50

      // Create another PRN for 25 tonnes
      const prn2 = await createPrn(env, 25)
      await transitionPrnStatus(env, prn2.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(80)
      expect(balance.availableAmount).toBe(25) // 50 - 25 = 25

      // Revise up to 120 tonnes
      await performSummaryLogSubmission(
        env,
        'log-revision-3',
        'file-revision-3',
        'waste-revision-3.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 120 }])
      )

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(120) // Revised up
      expect(balance.availableAmount).toBe(65) // 120 - 30 - 25 = 65
    })
  })

  describe('PRN deletion', () => {
    it('should restore available balance when deleting from awaiting_authorisation', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { accreditationId, registrationId } = env

      // Credit: 200
      await performSummaryLogSubmission(
        env,
        'log-cancel-1',
        'file-cancel-1',
        'waste-cancel-1.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 200 }])
      )

      let balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(200)
      expect(balance.availableAmount).toBe(200)

      // Raise PRN for 50 (deducts available)
      const prn1 = await createPrn(env, 50)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(200)
      expect(balance.availableAmount).toBe(150)

      // Delete the PRN (restores available)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.DELETED)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(200) // Total unchanged
      expect(balance.availableAmount).toBe(200) // Restored: 150 + 50
    })

    it('should not change balance when discarding from draft', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { accreditationId, registrationId } = env

      // Credit: 200
      await performSummaryLogSubmission(
        env,
        'log-cancel-draft',
        'file-cancel-draft',
        'waste-cancel-draft.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 200 }])
      )

      // Create PRN (stays in draft, no balance deduction)
      const prn1 = await createPrn(env, 50)

      let balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(200)
      expect(balance.availableAmount).toBe(200)

      // Discard from draft (no balance change)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.DISCARDED)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(200) // Unchanged
      expect(balance.availableAmount).toBe(200) // Unchanged
    })

    it('should only restore the deleted PRN tonnage among multiple raised PRNs', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { accreditationId, registrationId } = env

      // Credit: 500
      await performSummaryLogSubmission(
        env,
        'log-cancel-multi',
        'file-cancel-multi',
        'waste-cancel-multi.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 500 }])
      )

      // Raise three PRNs: 100, 75, 50
      const prn1 = await createPrn(env, 100)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_AUTHORISATION)

      const prn2 = await createPrn(env, 75)
      await transitionPrnStatus(env, prn2.id, PRN_STATUS.AWAITING_AUTHORISATION)

      const prn3 = await createPrn(env, 50)
      await transitionPrnStatus(env, prn3.id, PRN_STATUS.AWAITING_AUTHORISATION)

      let balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(500)
      expect(balance.availableAmount).toBe(275) // 500 - 100 - 75 - 50

      // Delete only the 75-tonne PRN
      await transitionPrnStatus(env, prn2.id, PRN_STATUS.DELETED)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(500) // Total unchanged
      expect(balance.availableAmount).toBe(350) // 275 + 75
    })

    it('should allow new PRN creation using restored balance', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { accreditationId, registrationId } = env

      // Credit: 100
      await performSummaryLogSubmission(
        env,
        'log-cancel-reuse',
        'file-cancel-reuse',
        'waste-cancel-reuse.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 100 }])
      )

      // Raise PRN for 80 (available drops to 20)
      const prn1 = await createPrn(env, 80)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_AUTHORISATION)

      let balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.availableAmount).toBe(20)

      // Delete it (available restored to 100)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.DELETED)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.availableAmount).toBe(100)

      // Raise a new PRN for 90 using the restored balance
      const prn2 = await createPrn(env, 90)
      await transitionPrnStatus(env, prn2.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(100) // Total unchanged throughout
      expect(balance.availableAmount).toBe(10) // 100 - 90
    })

    it('should handle deletion interleaved with issuance', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { accreditationId, registrationId } = env

      // Credit: 500
      await performSummaryLogSubmission(
        env,
        'log-cancel-interleave',
        'file-cancel-interleave',
        'waste-cancel-interleave.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 500 }])
      )

      // Raise three PRNs: 100, 75, 50
      const prn1 = await createPrn(env, 100)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_AUTHORISATION)

      const prn2 = await createPrn(env, 75)
      await transitionPrnStatus(env, prn2.id, PRN_STATUS.AWAITING_AUTHORISATION)

      const prn3 = await createPrn(env, 50)
      await transitionPrnStatus(env, prn3.id, PRN_STATUS.AWAITING_AUTHORISATION)

      let balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(500)
      expect(balance.availableAmount).toBe(275) // 500 - 100 - 75 - 50

      // Issue PRN 1 (total deducted, available unchanged)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_ACCEPTANCE)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(400) // 500 - 100
      expect(balance.availableAmount).toBe(275) // Unchanged

      // Delete PRN 2 (available credited, total unchanged)
      await transitionPrnStatus(env, prn2.id, PRN_STATUS.DELETED)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(400) // Unchanged
      expect(balance.availableAmount).toBe(350) // 275 + 75

      // Issue PRN 3 (total deducted, available unchanged)
      await transitionPrnStatus(env, prn3.id, PRN_STATUS.AWAITING_ACCEPTANCE)

      balance = await getWasteBalance(env, accreditationId, registrationId)
      expect(balance.amount).toBe(350) // 400 - 50
      expect(balance.availableAmount).toBe(350) // Now matches total
    })
  })

  describe('balance after a series of credits and debits', () => {
    it('reflects the net of two credits and two debits', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { accreditationId, registrationId } = env

      // Credit: 100
      await performSummaryLogSubmission(
        env,
        'log-audit-1',
        'file-audit-1',
        'waste-audit-1.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 100 }])
      )

      // Debit: 40
      const prn1 = await createPrn(env, 40)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_AUTHORISATION)

      // Credit: 60 (include previous row in snapshot)
      await performSummaryLogSubmission(
        env,
        'log-audit-2',
        'file-audit-2',
        'waste-audit-2.xlsx',
        createUploadData([
          { rowId: 1001, exportTonnage: 100 },
          { rowId: 2001, exportTonnage: 60 }
        ])
      )

      // Debit: 25
      const prn2 = await createPrn(env, 25)
      await transitionPrnStatus(env, prn2.id, PRN_STATUS.AWAITING_AUTHORISATION)

      const balance = await getWasteBalance(
        env,
        accreditationId,
        registrationId
      )

      // Two credits (100 + 60) raise the total; two raised PRNs (40 + 25)
      // ringfence the available balance.
      expect(balance.amount).toBe(160) // 100 + 60
      expect(balance.availableAmount).toBe(95) // 160 - 40 - 25
    })

    it('restores the available balance when a raised PRN is deleted', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { accreditationId, registrationId } = env

      // Credit: 200
      await performSummaryLogSubmission(
        env,
        'log-audit-cancel',
        'file-audit-cancel',
        'waste-audit-cancel.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 200 }])
      )

      // Raise PRN for 50 — ringfences the available balance to 150
      const prn1 = await createPrn(env, 50)
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.AWAITING_AUTHORISATION)

      const afterRaise = await getWasteBalance(
        env,
        accreditationId,
        registrationId
      )
      expect(afterRaise.amount).toBe(200)
      expect(afterRaise.availableAmount).toBe(150) // 200 - 50 ringfenced

      // Delete it — the 50 ringfence is released back to the available balance
      await transitionPrnStatus(env, prn1.id, PRN_STATUS.DELETED)

      const afterDelete = await getWasteBalance(
        env,
        accreditationId,
        registrationId
      )
      expect(afterDelete.amount).toBe(200) // total unchanged
      expect(afterDelete.availableAmount).toBe(200) // ringfence released
    })
  })

  describe('rejected issuance does not transition the PRN', () => {
    it('keeps the PRN in awaiting_authorisation when total balance is insufficient at issue time', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { packagingRecyclingNotesRepository, accreditationId } = env

      await performSummaryLogSubmission(
        env,
        'log-phantom-1',
        'file-phantom-1',
        'waste-phantom-1.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 100 }])
      )

      const prn = await createPrn(env, 50)
      await transitionPrnStatus(env, prn.id, PRN_STATUS.AWAITING_AUTHORISATION)

      await env.wasteBalanceService.issuePrn(
        {
          organisationId: env.organisationId,
          registrationId: env.registrationId,
          accreditationId
        },
        { prnId: 'other-prn', amount: 80 },
        { id: 'test-user' }
      )

      const result = await transitionPrnStatus(
        env,
        prn.id,
        PRN_STATUS.AWAITING_ACCEPTANCE
      )
      expect(result.statusCode).toBe(409)

      const refetched = await packagingRecyclingNotesRepository.findById(prn.id)
      assert(refetched)

      expect(refetched.status.currentStatus).toBe(
        PRN_STATUS.AWAITING_AUTHORISATION
      )
      expect(refetched.prnNumber).toBeUndefined()
      expect(refetched.status.issued).toBeUndefined()
    })

    it('issues only one PRN when two concurrent issuances exceed the total balance', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const {
        packagingRecyclingNotesRepository,
        accreditationId,
        registrationId
      } = env

      await performSummaryLogSubmission(
        env,
        'log-cross-prn',
        'file-cross-prn',
        'waste-cross-prn.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 100 }])
      )

      const prnA = await createPrn(env, 50)
      await transitionPrnStatus(env, prnA.id, PRN_STATUS.AWAITING_AUTHORISATION)

      const prnB = await createPrn(env, 50)
      await transitionPrnStatus(env, prnB.id, PRN_STATUS.AWAITING_AUTHORISATION)

      await env.wasteBalanceService.issuePrn(
        {
          organisationId: env.organisationId,
          registrationId: env.registrationId,
          accreditationId
        },
        { prnId: 'other-prn', amount: 20 },
        { id: 'test-user' }
      )

      await Promise.allSettled([
        transitionPrnStatus(env, prnA.id, PRN_STATUS.AWAITING_ACCEPTANCE),
        transitionPrnStatus(env, prnB.id, PRN_STATUS.AWAITING_ACCEPTANCE)
      ])

      const refetchedA = await packagingRecyclingNotesRepository.findById(
        prnA.id
      )
      assert(refetchedA)
      const refetchedB = await packagingRecyclingNotesRepository.findById(
        prnB.id
      )
      assert(refetchedB)

      const issuedCount = [refetchedA, refetchedB].filter(
        (p) => p.status.currentStatus === PRN_STATUS.AWAITING_ACCEPTANCE
      ).length
      expect(issuedCount).toBe(1)

      const balance = await getWasteBalance(
        env,
        accreditationId,
        registrationId
      )
      expect(balance.amount).toBe(30)
    })
  })

  describe('balance integrity under contention and supersession', () => {
    it('credits availableAmount for both PRNs when two concurrent pending cancellations race', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { accreditationId, registrationId } = env

      await performSummaryLogSubmission(
        env,
        'log-pending-cancel-race',
        'file-pending-cancel-race',
        'waste-pending-cancel-race.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 200 }])
      )

      const prnA = await createPrn(env, 50)
      await transitionPrnStatus(env, prnA.id, PRN_STATUS.AWAITING_AUTHORISATION)
      const prnB = await createPrn(env, 50)
      await transitionPrnStatus(env, prnB.id, PRN_STATUS.AWAITING_AUTHORISATION)

      await Promise.allSettled([
        transitionPrnStatus(env, prnA.id, PRN_STATUS.DELETED),
        transitionPrnStatus(env, prnB.id, PRN_STATUS.DELETED)
      ])

      const balanceAfter = await getWasteBalance(
        env,
        accreditationId,
        registrationId
      )
      expect(balanceAfter.amount).toBe(200)
      expect(balanceAfter.availableAmount).toBe(200)
    })

    it('does not strand a balance debit when two concurrent creations race on the same PRN', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { accreditationId, registrationId } = env

      await performSummaryLogSubmission(
        env,
        'log-same-prn-create-race',
        'file-same-prn-create-race',
        'waste-same-prn-create-race.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 100 }])
      )

      const prn = await createPrn(env, 50)

      await Promise.allSettled([
        transitionPrnStatus(env, prn.id, PRN_STATUS.AWAITING_AUTHORISATION),
        transitionPrnStatus(env, prn.id, PRN_STATUS.AWAITING_AUTHORISATION)
      ])

      const balanceAfter = await getWasteBalance(
        env,
        accreditationId,
        registrationId
      )
      expect(balanceAfter.amount).toBe(100)
      expect(balanceAfter.availableAmount).toBe(50)
    })

    it('debits availableAmount for both PRNs when two concurrent creations race on the same accreditation with sufficient balance', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { accreditationId, registrationId } = env

      await performSummaryLogSubmission(
        env,
        'log-create-race-sufficient',
        'file-create-race-sufficient',
        'waste-create-race-sufficient.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 200 }])
      )

      const prnA = await createPrn(env, 30)
      const prnB = await createPrn(env, 30)

      await Promise.allSettled([
        transitionPrnStatus(env, prnA.id, PRN_STATUS.AWAITING_AUTHORISATION),
        transitionPrnStatus(env, prnB.id, PRN_STATUS.AWAITING_AUTHORISATION)
      ])

      const balanceAfter = await getWasteBalance(
        env,
        accreditationId,
        registrationId
      )
      expect(balanceAfter.amount).toBe(200)
      expect(balanceAfter.availableAmount).toBe(140)
    })

    it('debits the balance once when the same waste records are submitted via two summary logs', async () => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter'
      })
      const { accreditationId, registrationId } = env

      await performSummaryLogSubmission(
        env,
        'log-supersede-a',
        'file-supersede-a',
        'waste-supersede-a.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 100 }])
      )

      const balanceAfterA = await getWasteBalance(
        env,
        accreditationId,
        registrationId
      )
      expect(balanceAfterA.amount).toBe(100)

      await performSummaryLogSubmission(
        env,
        'log-supersede-b',
        'file-supersede-b',
        'waste-supersede-b.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 100 }])
      )

      const balanceAfterB = await getWasteBalance(
        env,
        accreditationId,
        registrationId
      )
      expect(balanceAfterB.amount).toBe(100)
    })
  })

  describe('on the event-sourced ledger path', () => {
    const setupLedgerEnv = () => {
      const organisationId = new ObjectId().toString()
      const registrationId = new ObjectId().toString()
      return setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter',
        organisationId,
        registrationId
      })
    }

    it('ringfences available balance and stamps the PRN watermark when raising', async () => {
      const env = await setupLedgerEnv()
      const {
        packagingRecyclingNotesRepository,
        streamRepository,
        registrationId
      } = env

      await performSummaryLogSubmission(
        env,
        'log-ledger-raise',
        'file-ledger-raise',
        'waste-ledger-raise.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 300 }])
      )

      let balance = await getWasteBalance(env, 'ACC-123', registrationId)
      expect(balance.amount).toBe(300)
      expect(balance.availableAmount).toBe(300)

      const prn = await createPrn(env, 50)
      await transitionPrnStatus(env, prn.id, PRN_STATUS.AWAITING_AUTHORISATION)

      balance = await getWasteBalance(env, 'ACC-123', registrationId)
      expect(balance.amount).toBe(300) // total unchanged
      expect(balance.availableAmount).toBe(250) // 300 - 50 ringfenced

      // The document watermark is the event the raise appended, not just any number.
      const latest = await streamRepository.findLatestByPartition(
        registrationId,
        'ACC-123'
      )
      const stored = await packagingRecyclingNotesRepository.findById(prn.id)
      assert(stored)
      expect(stored.lastAppliedEventNumber).toBe(latest?.number)
    })

    it('deducts from total balance when issuing', async () => {
      const env = await setupLedgerEnv()
      const { registrationId } = env

      await performSummaryLogSubmission(
        env,
        'log-ledger-issue',
        'file-ledger-issue',
        'waste-ledger-issue.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 200 }])
      )

      const prn = await createPrn(env, 50)
      await transitionPrnStatus(env, prn.id, PRN_STATUS.AWAITING_AUTHORISATION)
      await transitionPrnStatus(env, prn.id, PRN_STATUS.AWAITING_ACCEPTANCE)

      const balance = await getWasteBalance(env, 'ACC-123', registrationId)
      expect(balance.amount).toBe(150) // 200 - 50 finalised
      expect(balance.availableAmount).toBe(150)
    })

    it('restores available balance when deleting a raised PRN', async () => {
      const env = await setupLedgerEnv()
      const { registrationId } = env

      await performSummaryLogSubmission(
        env,
        'log-ledger-delete',
        'file-ledger-delete',
        'waste-ledger-delete.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 100 }])
      )

      const prn = await createPrn(env, 40)
      await transitionPrnStatus(env, prn.id, PRN_STATUS.AWAITING_AUTHORISATION)

      let balance = await getWasteBalance(env, 'ACC-123', registrationId)
      expect(balance.availableAmount).toBe(60)

      await transitionPrnStatus(env, prn.id, PRN_STATUS.DELETED)

      balance = await getWasteBalance(env, 'ACC-123', registrationId)
      expect(balance.amount).toBe(100)
      expect(balance.availableAmount).toBe(100) // ringfence released
    })

    it('debits available balance once per PRN when two raises are submitted together on the same accreditation', async () => {
      const env = await setupLedgerEnv()
      const { registrationId } = env

      await performSummaryLogSubmission(
        env,
        'log-ledger-race',
        'file-ledger-race',
        'waste-ledger-race.xlsx',
        createUploadData([{ rowId: 1001, exportTonnage: 200 }])
      )

      const prnA = await createPrn(env, 30)
      const prnB = await createPrn(env, 30)

      await Promise.allSettled([
        transitionPrnStatus(env, prnA.id, PRN_STATUS.AWAITING_AUTHORISATION),
        transitionPrnStatus(env, prnB.id, PRN_STATUS.AWAITING_AUTHORISATION)
      ])

      const balance = await getWasteBalance(env, 'ACC-123', registrationId)
      expect(balance.amount).toBe(200)
      expect(balance.availableAmount).toBe(140) // 200 - 30 - 30
    })
  })
})
