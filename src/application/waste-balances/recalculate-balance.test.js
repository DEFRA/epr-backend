import { describe, it, expect, vi, beforeEach } from 'vitest'

import { recalculateBalance } from './recalculate-balance.js'

describe('recalculateBalance', () => {
  let organisationsRepository
  let wasteRecordsRepository
  let wasteBalancesRepository
  let logger

  beforeEach(() => {
    organisationsRepository = {
      findAllIds: vi.fn(),
      findById: vi.fn()
    }
    wasteRecordsRepository = {
      findByRegistration: vi.fn()
    }
    wasteBalancesRepository = {
      updateWasteBalanceTransactions: vi.fn().mockResolvedValue(undefined)
    }
    logger = {
      info: vi.fn(),
      warn: vi.fn()
    }
  })

  const createDeps = () => ({
    organisationsRepository,
    wasteRecordsRepository,
    wasteBalancesRepository,
    logger
  })

  it('recalculates waste balance for the given accreditation', async () => {
    organisationsRepository.findAllIds.mockResolvedValue({
      organisations: new Set(['org-1']),
      registrations: new Set(['reg-1']),
      accreditations: new Set(['acc-123'])
    })
    organisationsRepository.findById.mockResolvedValue({
      registrations: [{ id: 'reg-1', accreditationId: 'acc-123' }],
      accreditations: [{ id: 'acc-123' }]
    })
    wasteRecordsRepository.findByRegistration.mockResolvedValue([
      { type: 'input', data: {} },
      { type: 'output', data: {} }
    ])

    await recalculateBalance('acc-123', createDeps())

    expect(wasteRecordsRepository.findByRegistration).toHaveBeenCalledWith(
      'org-1',
      'reg-1'
    )
    expect(
      wasteBalancesRepository.updateWasteBalanceTransactions
    ).toHaveBeenCalledWith(
      [
        { type: 'input', data: {} },
        { type: 'output', data: {} }
      ],
      'acc-123'
    )
  })

  it('handles accreditation with no linked registration', async () => {
    organisationsRepository.findAllIds.mockResolvedValue({
      organisations: new Set(['org-1']),
      registrations: new Set(['reg-1']),
      accreditations: new Set(['acc-123'])
    })
    organisationsRepository.findById.mockResolvedValue({
      registrations: [{ id: 'reg-1' }],
      accreditations: [{ id: 'acc-123' }]
    })

    await recalculateBalance('acc-123', createDeps())

    expect(wasteRecordsRepository.findByRegistration).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith({
      message:
        'No registration linked to accreditationId=acc-123 — skipping recalculation'
    })
  })

  it('throws when accreditation not found in any organisation', async () => {
    organisationsRepository.findAllIds.mockResolvedValue({
      organisations: new Set(['org-1']),
      registrations: new Set(),
      accreditations: new Set()
    })

    await expect(recalculateBalance('acc-999', createDeps())).rejects.toThrow(
      'Accreditation acc-999 not found in any organisation'
    )
  })

  it('finds the correct organisation among multiple', async () => {
    organisationsRepository.findAllIds.mockResolvedValue({
      organisations: new Set(['org-1', 'org-2']),
      registrations: new Set(['reg-1', 'reg-2']),
      accreditations: new Set(['acc-other', 'acc-target'])
    })
    organisationsRepository.findById.mockImplementation(async (id) => {
      if (id === 'org-1') {
        return {
          registrations: [{ id: 'reg-1' }],
          accreditations: [{ id: 'acc-other' }]
        }
      }
      return {
        registrations: [{ id: 'reg-2', accreditationId: 'acc-target' }],
        accreditations: [{ id: 'acc-target' }]
      }
    })
    wasteRecordsRepository.findByRegistration.mockResolvedValue([])

    await recalculateBalance('acc-target', createDeps())

    expect(wasteRecordsRepository.findByRegistration).toHaveBeenCalledWith(
      'org-2',
      'reg-2'
    )
  })
})
