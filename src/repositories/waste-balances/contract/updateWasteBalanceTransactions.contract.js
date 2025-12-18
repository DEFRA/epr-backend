import { describe, expect, vi } from 'vitest'
import { buildWasteRecord } from './test-data.js'
import { RECEIVED_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/exporter/fields.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import * as validationPipeline from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import * as tableSchemas from '#domain/summary-logs/table-schemas/index.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'

export const testUpdateWasteBalanceTransactionsBehaviour = (it) => {
  describe('updateWasteBalanceTransactions', () => {
    const accreditationId = 'acc-123'

    it('Should throw if accreditation is not found', async ({
      wasteBalancesRepository,
      organisationsRepository
    }) => {
      // Arrange
      const repository = await wasteBalancesRepository()
      organisationsRepository.findAccreditationById.mockResolvedValue(null)

      const record = buildWasteRecord()

      // Act & Assert
      await expect(
        repository.updateWasteBalanceTransactions([record], accreditationId)
      ).rejects.toThrow(`Accreditation not found: ${accreditationId}`)
    })

    it('Should persist calculated transactions', async ({
      wasteBalancesRepository,
      organisationsRepository
    }) => {
      // Arrange
      const repository = await wasteBalancesRepository()
      const user = { id: 'user-1', name: 'Test User' }

      organisationsRepository.findAccreditationById.mockResolvedValue({
        validFrom: '2023-01-01',
        validTo: '2023-12-31'
      })

      const record = buildWasteRecord({
        updatedBy: user,
        data: {
          processingType: PROCESSING_TYPES.EXPORTER,
          [RECEIVED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: 'No',
          [RECEIVED_LOADS_FIELDS.DATE_OF_EXPORT]: '2023-06-01',
          [RECEIVED_LOADS_FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]: 'No',
          [RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: '10.5'
        }
      })

      // Act
      await repository.updateWasteBalanceTransactions([record], accreditationId)

      // Assert
      const balance = await repository.findByAccreditationId(accreditationId)
      expect(balance).toBeDefined()
      expect(balance.transactions).toHaveLength(1)
      expect(balance.transactions[0].amount).toBe(10.5)
      expect(balance.transactions[0].createdBy).toEqual(user)
      expect(balance.amount).toBe(10.5)
    })

    it('Should do nothing if wasteRecords is empty', async ({
      wasteBalancesRepository,
      organisationsRepository
    }) => {
      // Arrange
      const repository = await wasteBalancesRepository()

      organisationsRepository.findAccreditationById.mockResolvedValue({
        validFrom: '2023-01-01',
        validTo: '2023-12-31'
      })

      // Act
      await repository.updateWasteBalanceTransactions([], accreditationId)

      // Assert
      const balance = await repository.findByAccreditationId(accreditationId)
      expect(balance).toBeNull()
    })

    it('Should update existing balance', async ({
      wasteBalancesRepository,
      organisationsRepository,
      insertWasteBalance
    }) => {
      // Arrange
      const repository = await wasteBalancesRepository()
      const user = { id: 'user-1', name: 'Test User' }

      organisationsRepository.findAccreditationById.mockResolvedValue({
        validFrom: '2023-01-01',
        validTo: '2023-12-31'
      })

      const existingBalance = {
        accreditationId,
        organisationId: 'org-1',
        amount: 5,
        availableAmount: 5,
        transactions: [{ id: 'tx-1', amount: 5 }],
        version: 1,
        schemaVersion: 1
      }
      await insertWasteBalance(existingBalance)

      const record = buildWasteRecord({
        updatedBy: user,
        data: {
          processingType: PROCESSING_TYPES.EXPORTER,
          [RECEIVED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: 'No',
          [RECEIVED_LOADS_FIELDS.DATE_OF_EXPORT]: '2023-06-01',
          [RECEIVED_LOADS_FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]: 'No',
          [RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: '10.5'
        }
      })

      // Act
      await repository.updateWasteBalanceTransactions([record], accreditationId)

      // Assert
      const balance = await repository.findByAccreditationId(accreditationId)
      expect(balance.transactions).toHaveLength(2)
      expect(balance.amount).toBe(15.5)
    })

    it('Should not update if no transactions generated', async ({
      wasteBalancesRepository,
      organisationsRepository
    }) => {
      // Arrange
      const repository = await wasteBalancesRepository()

      organisationsRepository.findAccreditationById.mockResolvedValue({
        validFrom: '2023-01-01',
        validTo: '2023-12-31'
      })

      // Record outside validity period
      const record = buildWasteRecord({
        data: {
          processingType: PROCESSING_TYPES.EXPORTER,
          [RECEIVED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: 'No',
          [RECEIVED_LOADS_FIELDS.DATE_OF_EXPORT]: '2022-01-01', // Outside valid range
          [RECEIVED_LOADS_FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]: 'No',
          [RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: '10.5'
        }
      })

      // Act
      await repository.updateWasteBalanceTransactions([record], accreditationId)

      // Assert
      const balance = await repository.findByAccreditationId(accreditationId)
      expect(balance).toBeNull()
    })

    it('Should handle missing transactions array in existing balance', async ({
      wasteBalancesRepository,
      organisationsRepository,
      insertWasteBalance
    }) => {
      // Arrange
      const repository = await wasteBalancesRepository()
      const user = { id: 'user-1', name: 'Test User' }

      organisationsRepository.findAccreditationById.mockResolvedValue({
        validFrom: '2023-01-01',
        validTo: '2023-12-31'
      })

      const existingBalance = {
        accreditationId,
        organisationId: 'org-1',
        amount: 5,
        availableAmount: 5,
        // transactions missing
        version: 1,
        schemaVersion: 1
      }
      await insertWasteBalance(existingBalance)

      const record = buildWasteRecord({
        updatedBy: user,
        data: {
          processingType: PROCESSING_TYPES.EXPORTER,
          [RECEIVED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: 'No',
          [RECEIVED_LOADS_FIELDS.DATE_OF_EXPORT]: '2023-06-01',
          [RECEIVED_LOADS_FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]: 'No',
          [RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: '10.5'
        }
      })

      // Act
      await repository.updateWasteBalanceTransactions([record], accreditationId)

      // Assert
      const balance = await repository.findByAccreditationId(accreditationId)
      expect(balance.transactions).toHaveLength(1)
      expect(balance.amount).toBe(15.5)
    })

    it('Should ignore records with outcome other than INCLUDED', async ({
      wasteBalancesRepository,
      organisationsRepository
    }) => {
      // Arrange
      const repository = await wasteBalancesRepository()
      const user = { id: 'user-1', name: 'Test User' }

      organisationsRepository.findAccreditationById.mockResolvedValue({
        validFrom: '2023-01-01',
        validTo: '2023-12-31'
      })

      const validRecord = buildWasteRecord({
        type: WASTE_RECORD_TYPE.EXPORTED,
        updatedBy: user,
        data: {
          processingType: PROCESSING_TYPES.EXPORTER,
          [RECEIVED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: 'No',
          [RECEIVED_LOADS_FIELDS.DATE_OF_EXPORT]: '2023-06-01',
          [RECEIVED_LOADS_FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]: 'No',
          [RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: '10.5'
        }
      })

      const invalidRecord = buildWasteRecord({
        type: WASTE_RECORD_TYPE.EXPORTED,
        updatedBy: user,
        data: {
          processingType: PROCESSING_TYPES.EXPORTER,
          [RECEIVED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: 'No',
          [RECEIVED_LOADS_FIELDS.DATE_OF_EXPORT]: '2023-06-01',
          [RECEIVED_LOADS_FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]: 'No',
          [RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: '20.0'
        }
      })

      const input = [validRecord, invalidRecord]

      // Mock validation
      const classifyRowSpy = vi.spyOn(validationPipeline, 'classifyRow')
      const createTableSchemaGetterSpy = vi.spyOn(
        tableSchemas,
        'createTableSchemaGetter'
      )

      createTableSchemaGetterSpy.mockReturnValue(() => ({}))
      classifyRowSpy
        .mockReturnValueOnce({ outcome: ROW_OUTCOME.INCLUDED })
        .mockReturnValueOnce({ outcome: ROW_OUTCOME.REJECTED })

      // Act
      await repository.updateWasteBalanceTransactions(input, accreditationId)

      // Assert
      const balance = await repository.findByAccreditationId(accreditationId)
      expect(balance).toBeDefined()
      expect(balance.transactions).toHaveLength(1)
      expect(balance.transactions[0].amount).toBe(10.5)
      expect(balance.amount).toBe(10.5)

      // Cleanup
      classifyRowSpy.mockRestore()
      createTableSchemaGetterSpy.mockRestore()
    })
  })
}
