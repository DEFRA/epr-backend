import { describe, expect } from 'vitest'
import { buildWasteRecord } from './test-data.js'
import { EXPORTER_FIELD } from '#domain/waste-balances/constants.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

export const testUpdateWasteBalanceTransactionsBehaviour = (it) => {
  describe('updateWasteBalanceTransactions', () => {
    const accreditationId = 'acc-123'

    it('Should persist calculated transactions', async ({
      wasteBalancesRepository,
      organisationsRepository
    }) => {
      // Arrange
      const repository = await wasteBalancesRepository()
      const user = { id: 'user-1', name: 'Test User' }

      organisationsRepository.getAccreditationById.mockResolvedValue({
        validFrom: '2023-01-01',
        validTo: '2023-12-31'
      })

      const record = buildWasteRecord({
        updatedBy: user,
        data: {
          processingType: PROCESSING_TYPES.EXPORTER,
          [EXPORTER_FIELD.PRN_ISSUED]: 'No',
          [EXPORTER_FIELD.DATE_OF_DISPATCH]: '2023-06-01',
          [EXPORTER_FIELD.INTERIM_SITE]: 'No',
          [EXPORTER_FIELD.EXPORT_TONNAGE]: '10.5'
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

      organisationsRepository.getAccreditationById.mockResolvedValue({
        validFrom: '2023-01-01',
        validTo: '2023-12-31'
      })

      // Act
      await repository.updateWasteBalanceTransactions([], accreditationId)

      // Assert
      const balance = await repository.findByAccreditationId(accreditationId)
      expect(balance).toBeNull()
    })
  })
}
