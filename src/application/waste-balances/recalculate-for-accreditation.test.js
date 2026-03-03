import { recalculateWasteBalancesForAccreditation } from './recalculate-for-accreditation.js'

describe('recalculateWasteBalancesForAccreditation', () => {
  let wasteRecordsRepository
  let wasteBalancesRepository
  let logger

  beforeEach(() => {
    wasteRecordsRepository = {
      findByRegistration: vi.fn()
    }
    wasteBalancesRepository = {
      updateWasteBalanceTransactions: vi.fn()
    }
    logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }
  })

  it('loads waste records and delegates to updateWasteBalanceTransactions', async () => {
    const wasteRecords = [
      { id: 'wr-1', type: 'paper' },
      { id: 'wr-2', type: 'plastic' }
    ]
    wasteRecordsRepository.findByRegistration.mockResolvedValue(wasteRecords)
    wasteBalancesRepository.updateWasteBalanceTransactions.mockResolvedValue()

    await recalculateWasteBalancesForAccreditation({
      organisationId: 'org-1',
      accreditationId: 'acc-1',
      registrationId: 'reg-1',
      wasteRecordsRepository,
      wasteBalancesRepository,
      logger
    })

    expect(wasteRecordsRepository.findByRegistration).toHaveBeenCalledWith(
      'org-1',
      'reg-1'
    )
    expect(
      wasteBalancesRepository.updateWasteBalanceTransactions
    ).toHaveBeenCalledWith(wasteRecords, 'acc-1')
  })

  it('logs start and completion messages', async () => {
    wasteRecordsRepository.findByRegistration.mockResolvedValue([
      { id: 'wr-1' }
    ])
    wasteBalancesRepository.updateWasteBalanceTransactions.mockResolvedValue()

    await recalculateWasteBalancesForAccreditation({
      organisationId: 'org-1',
      accreditationId: 'acc-1',
      registrationId: 'reg-1',
      wasteRecordsRepository,
      wasteBalancesRepository,
      logger
    })

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          'Recalculating waste balance: accreditationId=acc-1'
        )
      })
    )
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          'Waste balance recalculation complete: accreditationId=acc-1'
        )
      })
    )
  })

  it('skips recalculation and logs when no waste records found', async () => {
    wasteRecordsRepository.findByRegistration.mockResolvedValue([])

    await recalculateWasteBalancesForAccreditation({
      organisationId: 'org-1',
      accreditationId: 'acc-1',
      registrationId: 'reg-1',
      wasteRecordsRepository,
      wasteBalancesRepository,
      logger
    })

    expect(
      wasteBalancesRepository.updateWasteBalanceTransactions
    ).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('No waste records found')
      })
    )
  })
})
