import { recalculateWasteBalancesForAccreditation } from './recalculate-for-accreditation.js'

describe('recalculateWasteBalancesForAccreditation', () => {
  const organisationId = 'org-1'
  const accreditationId = 'acc-1'
  const registrationId = 'reg-1'

  const makeOrganisation = (registrations = []) => ({
    id: organisationId,
    registrations,
    accreditations: [{ id: accreditationId }]
  })

  const makeWasteRecord = (rowId = 1) => ({
    rowId,
    organisationId,
    registrationId,
    type: 'received',
    data: { processingType: 'reprocessor_input' },
    versions: [{ id: 'v1' }]
  })

  let organisationsRepository
  let wasteRecordsRepository
  let wasteBalancesRepository
  let logger

  beforeEach(() => {
    organisationsRepository = {
      findById: vi.fn()
    }

    wasteRecordsRepository = {
      findByRegistration: vi.fn().mockResolvedValue([])
    }

    wasteBalancesRepository = {
      updateWasteBalanceTransactions: vi.fn().mockResolvedValue(undefined)
    }

    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  })

  it('recalculates when a registration links to the accreditation and has waste records', async () => {
    const org = makeOrganisation([{ id: registrationId, accreditationId }])
    organisationsRepository.findById.mockResolvedValue(org)

    const wasteRecords = [makeWasteRecord(1), makeWasteRecord(2)]
    wasteRecordsRepository.findByRegistration.mockResolvedValue(wasteRecords)

    const user = { id: 'user-1', email: 'user@example.com' }

    await recalculateWasteBalancesForAccreditation({
      organisationId,
      accreditationId,
      organisationsRepository,
      wasteRecordsRepository,
      wasteBalancesRepository,
      logger,
      user
    })

    expect(wasteRecordsRepository.findByRegistration).toHaveBeenCalledWith(
      organisationId,
      registrationId
    )
    expect(
      wasteBalancesRepository.updateWasteBalanceTransactions
    ).toHaveBeenCalledWith(wasteRecords, accreditationId, user)
  })

  it('skips recalculation when no registrations link to the accreditation', async () => {
    const org = makeOrganisation([
      { id: registrationId, accreditationId: 'other-acc' }
    ])
    organisationsRepository.findById.mockResolvedValue(org)

    await recalculateWasteBalancesForAccreditation({
      organisationId,
      accreditationId,
      organisationsRepository,
      wasteRecordsRepository,
      wasteBalancesRepository,
      logger
    })

    expect(wasteRecordsRepository.findByRegistration).not.toHaveBeenCalled()
    expect(
      wasteBalancesRepository.updateWasteBalanceTransactions
    ).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ accreditationId }),
      expect.stringContaining('No linked registrations')
    )
  })

  it('skips recalculation when registration has no waste records', async () => {
    const org = makeOrganisation([{ id: registrationId, accreditationId }])
    organisationsRepository.findById.mockResolvedValue(org)
    wasteRecordsRepository.findByRegistration.mockResolvedValue([])

    await recalculateWasteBalancesForAccreditation({
      organisationId,
      accreditationId,
      organisationsRepository,
      wasteRecordsRepository,
      wasteBalancesRepository,
      logger
    })

    expect(wasteRecordsRepository.findByRegistration).toHaveBeenCalledWith(
      organisationId,
      registrationId
    )
    expect(
      wasteBalancesRepository.updateWasteBalanceTransactions
    ).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ accreditationId, registrationId }),
      expect.stringContaining('No waste records')
    )
  })

  it('processes multiple registrations linked to the same accreditation', async () => {
    const regId2 = 'reg-2'
    const org = makeOrganisation([
      { id: registrationId, accreditationId },
      { id: regId2, accreditationId }
    ])
    organisationsRepository.findById.mockResolvedValue(org)

    const wasteRecords1 = [makeWasteRecord(1)]
    const wasteRecords2 = [makeWasteRecord(2)]
    wasteRecordsRepository.findByRegistration
      .mockResolvedValueOnce(wasteRecords1)
      .mockResolvedValueOnce(wasteRecords2)

    await recalculateWasteBalancesForAccreditation({
      organisationId,
      accreditationId,
      organisationsRepository,
      wasteRecordsRepository,
      wasteBalancesRepository,
      logger
    })

    expect(wasteRecordsRepository.findByRegistration).toHaveBeenCalledTimes(2)
    expect(
      wasteBalancesRepository.updateWasteBalanceTransactions
    ).toHaveBeenCalledTimes(2)
  })

  it('logs an informational message before recalculating', async () => {
    const org = makeOrganisation([{ id: registrationId, accreditationId }])
    organisationsRepository.findById.mockResolvedValue(org)
    wasteRecordsRepository.findByRegistration.mockResolvedValue([
      makeWasteRecord(1)
    ])

    await recalculateWasteBalancesForAccreditation({
      organisationId,
      accreditationId,
      organisationsRepository,
      wasteRecordsRepository,
      wasteBalancesRepository,
      logger
    })

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        accreditationId,
        registrationId,
        trigger: 'status-change'
      }),
      expect.stringContaining('Recalculating waste balance')
    )
  })
})
