import { describe, expect, vi } from 'vitest'
import { buildWasteBalance, buildWasteRecord } from './test-data.js'
import { RECEIVED_LOADS_FIELDS as FIELDS } from '#domain/summary-logs/table-schemas/exporter/fields.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import * as validationPipeline from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'

export const testUpdateWasteBalanceTransactionsBehaviour = (it) => {
  describe('updateWasteBalanceTransactions', () => {
    const accreditation = {
      id: 'acc-123',
      validFrom: '2023-01-01',
      validTo: '2023-12-31',
      statusHistory: [
        { status: 'created', updatedAt: '2022-12-01T00:00:00.000Z' },
        { status: 'approved', updatedAt: '2022-12-15T00:00:00.000Z' }
      ]
    }

    const user = {
      id: 'user-1',
      email: 'user-1@example.test',
      scope: ['standard_user']
    }

    it('credits a new balance from a valid record, resolved from the stream', async ({
      wasteBalancesRepository
    }) => {
      const repository = await wasteBalancesRepository()

      const record = buildWasteRecord({
        accreditationId: accreditation.id,
        data: {
          processingType: PROCESSING_TYPES.EXPORTER,
          [FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: 'No',
          [FIELDS.DATE_OF_EXPORT]: '2023-06-01',
          [FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]: 'No',
          [FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: '10.5'
        }
      })

      await repository.updateWasteBalanceTransactions([record], {
        user,
        accreditation,
        overseasSites: ORS_VALIDATION_DISABLED,
        summaryLogId: 'log-1'
      })

      const balance = await repository.findByAccreditationId(accreditation.id)
      expect(balance).not.toBeNull()
      expect(balance.amount).toBe(10.5)
      expect(balance.availableAmount).toBe(10.5)
    })

    it('does nothing if wasteRecords is empty (no balance document created)', async ({
      wasteBalancesRepository
    }) => {
      const repository = await wasteBalancesRepository()

      await repository.updateWasteBalanceTransactions([], {
        accreditation,
        overseasSites: ORS_VALIDATION_DISABLED,
        summaryLogId: 'log-1'
      })

      const balance = await repository.findByAccreditationId(accreditation.id)
      expect(balance).toBeNull()
    })

    it('updates an existing balance, resolved from the stream', async ({
      wasteBalancesRepository,
      insertWasteBalance
    }) => {
      const repository = await wasteBalancesRepository()

      const existingBalance = buildWasteBalance({
        accreditationId: accreditation.id,
        organisationId: 'org-1',
        registrationId: 'reg-1'
      })
      await insertWasteBalance(existingBalance)

      const record = buildWasteRecord({
        accreditationId: accreditation.id,
        data: {
          processingType: PROCESSING_TYPES.EXPORTER,
          [FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: 'No',
          [FIELDS.DATE_OF_EXPORT]: '2023-06-01',
          [FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]: 'No',
          [FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: '10.5'
        }
      })

      await repository.updateWasteBalanceTransactions([record], {
        user,
        accreditation,
        overseasSites: ORS_VALIDATION_DISABLED,
        summaryLogId: 'log-1'
      })

      const balance = await repository.findByAccreditationId(accreditation.id)
      expect(balance.amount).toBe(10.5)
      expect(balance.availableAmount).toBe(10.5)
    })

    it('does not credit an out-of-period record', async ({
      wasteBalancesRepository
    }) => {
      const repository = await wasteBalancesRepository()

      // Record outside validity period
      const record = buildWasteRecord({
        accreditationId: accreditation.id,
        data: {
          processingType: PROCESSING_TYPES.EXPORTER,
          [FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: 'No',
          [FIELDS.DATE_OF_EXPORT]: '2022-01-01', // Outside valid range
          [FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]: 'No',
          [FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: '10.5'
        }
      })

      await repository.updateWasteBalanceTransactions([record], {
        user,
        accreditation,
        overseasSites: ORS_VALIDATION_DISABLED,
        summaryLogId: 'log-1'
      })

      const balance = await repository.findByAccreditationId(accreditation.id)
      expect(balance.amount).toBe(0)
      expect(balance.availableAmount).toBe(0)
    })

    it('ignores records with outcome other than INCLUDED', async ({
      wasteBalancesRepository
    }) => {
      const repository = await wasteBalancesRepository()

      const validRecord = buildWasteRecord({
        accreditationId: accreditation.id,
        type: WASTE_RECORD_TYPE.EXPORTED,
        data: {
          processingType: PROCESSING_TYPES.EXPORTER,
          [FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: 'No',
          [FIELDS.DATE_OF_EXPORT]: '2023-06-01',
          [FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]: 'No',
          [FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: '10.5'
        }
      })

      const invalidRecord = buildWasteRecord({
        accreditationId: accreditation.id,
        type: WASTE_RECORD_TYPE.EXPORTED,
        data: {
          processingType: PROCESSING_TYPES.EXPORTER,
          [FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: 'No',
          [FIELDS.DATE_OF_EXPORT]: '2023-06-01',
          [FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]: 'No',
          [FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: '20.0'
        }
      })

      const input = [validRecord, invalidRecord]

      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      classifyRowSpy
        .mockReturnValueOnce({
          outcome: ROW_OUTCOME.INCLUDED,
          issues: [],
          data: {}
        })
        .mockReturnValueOnce({
          outcome: ROW_OUTCOME.REJECTED,
          issues: [],
          data: {}
        })

      await repository.updateWasteBalanceTransactions(input, {
        user,
        accreditation,
        overseasSites: ORS_VALIDATION_DISABLED,
        summaryLogId: 'log-1'
      })

      const balance = await repository.findByAccreditationId(accreditation.id)
      expect(balance).not.toBeNull()
      expect(balance.amount).toBe(10.5)
      expect(balance.availableAmount).toBe(10.5)

      classifyRowSpy.mockRestore()
    })
  })
}
