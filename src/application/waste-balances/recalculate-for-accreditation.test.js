import { recalculateWasteBalancesForAccreditation } from './recalculate-for-accreditation.js'

describe('recalculateWasteBalancesForAccreditation', () => {
  const organisationId = 'org-1'
  const accreditationId = 'acc-1'
  const registrationId = 'reg-1'

  const buildDependencies = (overrides = {}) => ({
    organisationsRepository: {
      findById: vi.fn().mockResolvedValue({
        registrations: [{ id: registrationId, accreditationId }]
      }),
      ...overrides.organisationsRepository
    },
    wasteRecordsRepository: {
      findByRegistration: vi
        .fn()
        .mockResolvedValue([{ id: 'wr-1', organisationId, registrationId }]),
      ...overrides.wasteRecordsRepository
    },
    wasteBalancesRepository: {
      updateWasteBalanceTransactions: vi.fn().mockResolvedValue(undefined),
      ...overrides.wasteBalancesRepository
    }
  })

  describe('happy path', () => {
    it('finds the linked registration and recalculates the waste balance', async () => {
      const dependencies = buildDependencies()

      await recalculateWasteBalancesForAccreditation({
        organisationId,
        accreditationId,
        dependencies
      })

      expect(
        dependencies.organisationsRepository.findById
      ).toHaveBeenCalledWith(organisationId)
      expect(
        dependencies.wasteRecordsRepository.findByRegistration
      ).toHaveBeenCalledWith(organisationId, registrationId)
      expect(
        dependencies.wasteBalancesRepository.updateWasteBalanceTransactions
      ).toHaveBeenCalledWith(
        [{ id: 'wr-1', organisationId, registrationId }],
        accreditationId
      )
    })
  })

  describe('when no linked registration exists', () => {
    it('returns early without loading waste records', async () => {
      const dependencies = buildDependencies({
        organisationsRepository: {
          findById: vi.fn().mockResolvedValue({
            registrations: [{ id: 'reg-other', accreditationId: 'acc-other' }]
          })
        }
      })

      await recalculateWasteBalancesForAccreditation({
        organisationId,
        accreditationId,
        dependencies
      })

      expect(
        dependencies.wasteRecordsRepository.findByRegistration
      ).not.toHaveBeenCalled()
      expect(
        dependencies.wasteBalancesRepository.updateWasteBalanceTransactions
      ).not.toHaveBeenCalled()
    })
  })

  describe('when the organisation has no registrations', () => {
    it('returns early without loading waste records', async () => {
      const dependencies = buildDependencies({
        organisationsRepository: {
          findById: vi.fn().mockResolvedValue({
            registrations: []
          })
        }
      })

      await recalculateWasteBalancesForAccreditation({
        organisationId,
        accreditationId,
        dependencies
      })

      expect(
        dependencies.wasteRecordsRepository.findByRegistration
      ).not.toHaveBeenCalled()
    })
  })

  describe('when the organisation is null', () => {
    it('returns early without loading waste records', async () => {
      const dependencies = buildDependencies({
        organisationsRepository: {
          findById: vi.fn().mockResolvedValue(null)
        }
      })

      await recalculateWasteBalancesForAccreditation({
        organisationId,
        accreditationId,
        dependencies
      })

      expect(
        dependencies.wasteRecordsRepository.findByRegistration
      ).not.toHaveBeenCalled()
    })
  })

  describe('when there are no waste records', () => {
    it('returns early without updating the waste balance', async () => {
      const dependencies = buildDependencies({
        wasteRecordsRepository: {
          findByRegistration: vi.fn().mockResolvedValue([])
        }
      })

      await recalculateWasteBalancesForAccreditation({
        organisationId,
        accreditationId,
        dependencies
      })

      expect(
        dependencies.wasteBalancesRepository.updateWasteBalanceTransactions
      ).not.toHaveBeenCalled()
    })
  })

  describe('error propagation', () => {
    it('propagates errors from updateWasteBalanceTransactions', async () => {
      const expectedError = new Error('Balance update failed')
      const dependencies = buildDependencies({
        wasteBalancesRepository: {
          updateWasteBalanceTransactions: vi
            .fn()
            .mockRejectedValue(expectedError)
        }
      })

      await expect(
        recalculateWasteBalancesForAccreditation({
          organisationId,
          accreditationId,
          dependencies
        })
      ).rejects.toThrow('Balance update failed')
    })

    it('propagates errors from findById', async () => {
      const expectedError = new Error('Organisation lookup failed')
      const dependencies = buildDependencies({
        organisationsRepository: {
          findById: vi.fn().mockRejectedValue(expectedError)
        }
      })

      await expect(
        recalculateWasteBalancesForAccreditation({
          organisationId,
          accreditationId,
          dependencies
        })
      ).rejects.toThrow('Organisation lookup failed')
    })

    it('propagates errors from findByRegistration', async () => {
      const expectedError = new Error('Waste records lookup failed')
      const dependencies = buildDependencies({
        wasteRecordsRepository: {
          findByRegistration: vi.fn().mockRejectedValue(expectedError)
        }
      })

      await expect(
        recalculateWasteBalancesForAccreditation({
          organisationId,
          accreditationId,
          dependencies
        })
      ).rejects.toThrow('Waste records lookup failed')
    })
  })
})
