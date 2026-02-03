import { describe, it, expect, vi } from 'vitest'

import { updatePrnStatus } from './update-status.js'
import { PRN_STATUS } from '#l-packaging-recycling-notes/domain/model.js'
import { PrnNumberConflictError } from '#l-packaging-recycling-notes/repository/mongodb.js'

describe('updatePrnStatus', () => {
  it('throws not found when PRN does not exist', async () => {
    const prnRepository = {
      findById: vi.fn().mockResolvedValue(null)
    }
    const wasteBalancesRepository = {}

    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        userId: 'user-789'
      })
    ).rejects.toThrow('PRN not found')
  })

  it('throws not found when PRN belongs to different organisation', async () => {
    const prnRepository = {
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        issuedByOrganisation: 'different-org',
        issuedByAccreditation: 'acc-456',
        status: { currentStatus: PRN_STATUS.DRAFT }
      })
    }
    const wasteBalancesRepository = {}

    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        userId: 'user-789'
      })
    ).rejects.toThrow('PRN not found')
  })

  it('throws bad request for invalid status transition', async () => {
    const prnRepository = {
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        issuedByOrganisation: 'org-123',
        issuedByAccreditation: 'acc-456',
        status: { currentStatus: PRN_STATUS.DRAFT }
      })
    }
    const wasteBalancesRepository = {}

    // DRAFT cannot transition directly to AWAITING_ACCEPTANCE (must go via AWAITING_AUTHORISATION)
    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        userId: 'user-789'
      })
    ).rejects.toThrow('Invalid status transition')
  })

  it('deducts available waste balance when transitioning to awaiting_authorisation', async () => {
    const prnRepository = {
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        issuedByOrganisation: 'org-123',
        issuedByAccreditation: 'acc-456',
        tonnage: 100,
        status: { currentStatus: PRN_STATUS.DRAFT }
      }),
      updateStatus: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
      })
    }
    const wasteBalancesRepository = {
      findByAccreditationId: vi
        .fn()
        .mockResolvedValue({ accreditationId: 'acc-456' }),
      deductAvailableBalanceForPrnCreation: vi.fn().mockResolvedValue({})
    }

    await updatePrnStatus({
      prnRepository,
      wasteBalancesRepository,
      id: '507f1f77bcf86cd799439011',
      organisationId: 'org-123',
      accreditationId: 'acc-456',
      newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
      userId: 'user-789'
    })

    expect(
      wasteBalancesRepository.deductAvailableBalanceForPrnCreation
    ).toHaveBeenCalledWith({
      accreditationId: 'acc-456',
      organisationId: 'org-123',
      prnId: '507f1f77bcf86cd799439011',
      tonnage: 100,
      userId: 'user-789'
    })
  })

  it('throws error when creating PRN without waste balance', async () => {
    const prnRepository = {
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        issuedByOrganisation: 'org-123',
        issuedByAccreditation: 'acc-456',
        tonnage: 100,
        status: { currentStatus: PRN_STATUS.DRAFT }
      }),
      updateStatus: vi.fn()
    }
    const wasteBalancesRepository = {
      findByAccreditationId: vi.fn().mockResolvedValue(null)
    }

    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        userId: 'user-789'
      })
    ).rejects.toThrow('No waste balance found for accreditation: acc-456')
  })

  it('updates status and returns updated PRN', async () => {
    const updatedPrn = {
      id: '507f1f77bcf86cd799439011',
      issuedByOrganisation: 'org-123',
      issuedByAccreditation: 'acc-456',
      tonnage: 100,
      status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION },
      updatedAt: new Date('2026-02-03T10:00:00Z')
    }
    const prnRepository = {
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        issuedByOrganisation: 'org-123',
        issuedByAccreditation: 'acc-456',
        tonnage: 100,
        status: { currentStatus: PRN_STATUS.DRAFT }
      }),
      updateStatus: vi.fn().mockResolvedValue(updatedPrn)
    }
    const wasteBalancesRepository = {
      findByAccreditationId: vi
        .fn()
        .mockResolvedValue({ accreditationId: 'acc-456' }),
      deductAvailableBalanceForPrnCreation: vi.fn().mockResolvedValue({})
    }

    const result = await updatePrnStatus({
      prnRepository,
      wasteBalancesRepository,
      id: '507f1f77bcf86cd799439011',
      organisationId: 'org-123',
      accreditationId: 'acc-456',
      newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
      userId: 'user-789'
    })

    expect(result).toBe(updatedPrn)
    expect(prnRepository.updateStatus).toHaveBeenCalledWith({
      id: '507f1f77bcf86cd799439011',
      status: PRN_STATUS.AWAITING_AUTHORISATION,
      updatedBy: 'user-789',
      updatedAt: expect.any(Date)
    })
  })

  it('generates PRN number when issuing (transitioning to awaiting_acceptance)', async () => {
    const updatedPrn = {
      id: '507f1f77bcf86cd799439011',
      prnNumber: 'WE26000001',
      status: { currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE }
    }
    const prnRepository = {
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        issuedByOrganisation: 'org-123',
        issuedByAccreditation: 'acc-456',
        nation: 'england',
        isExport: false,
        tonnage: 50,
        status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
      }),
      updateStatus: vi.fn().mockResolvedValue(updatedPrn)
    }
    const wasteBalancesRepository = {
      findByAccreditationId: vi
        .fn()
        .mockResolvedValue({ accreditationId: 'acc-456' }),
      deductTotalBalanceForPrnIssue: vi.fn().mockResolvedValue({})
    }

    const result = await updatePrnStatus({
      prnRepository,
      wasteBalancesRepository,
      id: '507f1f77bcf86cd799439011',
      organisationId: 'org-123',
      accreditationId: 'acc-456',
      newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      userId: 'user-789'
    })

    expect(result).toBe(updatedPrn)
    expect(prnRepository.updateStatus).toHaveBeenCalledWith({
      id: '507f1f77bcf86cd799439011',
      status: PRN_STATUS.AWAITING_ACCEPTANCE,
      updatedBy: 'user-789',
      updatedAt: expect.any(Date),
      prnNumber: expect.stringMatching(/^ER26\d{5}$/)
    })
  })

  it('deducts total waste balance when issuing PRN (transitioning to awaiting_acceptance)', async () => {
    const updatedPrn = {
      id: '507f1f77bcf86cd799439011',
      prnNumber: 'WE26000001',
      status: { currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE }
    }
    const prnRepository = {
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        issuedByOrganisation: 'org-123',
        issuedByAccreditation: 'acc-456',
        nation: 'england',
        isExport: false,
        tonnage: 75,
        status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
      }),
      updateStatus: vi.fn().mockResolvedValue(updatedPrn)
    }
    const wasteBalancesRepository = {
      findByAccreditationId: vi
        .fn()
        .mockResolvedValue({ accreditationId: 'acc-456' }),
      deductTotalBalanceForPrnIssue: vi.fn().mockResolvedValue({})
    }

    await updatePrnStatus({
      prnRepository,
      wasteBalancesRepository,
      id: '507f1f77bcf86cd799439011',
      organisationId: 'org-123',
      accreditationId: 'acc-456',
      newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      userId: 'user-789'
    })

    expect(
      wasteBalancesRepository.deductTotalBalanceForPrnIssue
    ).toHaveBeenCalledWith({
      accreditationId: 'acc-456',
      organisationId: 'org-123',
      prnId: '507f1f77bcf86cd799439011',
      tonnage: 75,
      userId: 'user-789'
    })
  })

  it('throws error when issuing PRN without waste balance', async () => {
    const prnRepository = {
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        issuedByOrganisation: 'org-123',
        issuedByAccreditation: 'acc-456',
        nation: 'england',
        isExport: false,
        tonnage: 75,
        status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
      }),
      updateStatus: vi.fn()
    }
    const wasteBalancesRepository = {
      findByAccreditationId: vi.fn().mockResolvedValue(null)
    }

    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        userId: 'user-789'
      })
    ).rejects.toThrow('No waste balance found for accreditation: acc-456')
  })

  it('retries with suffix when PRN number collision occurs', async () => {
    const updatedPrn = {
      id: '507f1f77bcf86cd799439011',
      prnNumber: 'WE26000001A',
      status: { currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE }
    }
    const prnRepository = {
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        issuedByOrganisation: 'org-123',
        issuedByAccreditation: 'acc-456',
        nation: 'england',
        isExport: false,
        tonnage: 50,
        status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
      }),
      updateStatus: vi
        .fn()
        .mockRejectedValueOnce(new PrnNumberConflictError('WE26000001'))
        .mockResolvedValueOnce(updatedPrn)
    }
    const wasteBalancesRepository = {
      findByAccreditationId: vi
        .fn()
        .mockResolvedValue({ accreditationId: 'acc-456' }),
      deductTotalBalanceForPrnIssue: vi.fn().mockResolvedValue({})
    }

    const result = await updatePrnStatus({
      prnRepository,
      wasteBalancesRepository,
      id: '507f1f77bcf86cd799439011',
      organisationId: 'org-123',
      accreditationId: 'acc-456',
      newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      userId: 'user-789'
    })

    expect(result).toBe(updatedPrn)
    expect(prnRepository.updateStatus).toHaveBeenCalledTimes(2)
    // Second call should have suffix A
    expect(prnRepository.updateStatus).toHaveBeenLastCalledWith({
      id: '507f1f77bcf86cd799439011',
      status: PRN_STATUS.AWAITING_ACCEPTANCE,
      updatedBy: 'user-789',
      updatedAt: expect.any(Date),
      prnNumber: expect.stringMatching(/^ER26\d{5}A$/)
    })
  })

  it('throws error when all PRN number suffixes exhausted', async () => {
    const prnRepository = {
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        issuedByOrganisation: 'org-123',
        issuedByAccreditation: 'acc-456',
        nation: 'england',
        isExport: false,
        tonnage: 50,
        status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
      }),
      // Reject all 27 attempts (no suffix + A-Z)
      updateStatus: vi
        .fn()
        .mockRejectedValue(new PrnNumberConflictError('collision'))
    }
    const wasteBalancesRepository = {
      findByAccreditationId: vi
        .fn()
        .mockResolvedValue({ accreditationId: 'acc-456' }),
      deductTotalBalanceForPrnIssue: vi.fn().mockResolvedValue({})
    }

    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        userId: 'user-789'
      })
    ).rejects.toThrow('Unable to generate unique PRN number after all retries')

    expect(prnRepository.updateStatus).toHaveBeenCalledTimes(27) // 1 + 26 letters
  })

  it('throws non-collision errors immediately without retry', async () => {
    const dbError = new Error('Database connection failed')
    const prnRepository = {
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        issuedByOrganisation: 'org-123',
        issuedByAccreditation: 'acc-456',
        nation: 'england',
        isExport: false,
        tonnage: 50,
        status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
      }),
      updateStatus: vi.fn().mockRejectedValue(dbError)
    }
    const wasteBalancesRepository = {
      findByAccreditationId: vi
        .fn()
        .mockResolvedValue({ accreditationId: 'acc-456' }),
      deductTotalBalanceForPrnIssue: vi.fn().mockResolvedValue({})
    }

    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        userId: 'user-789'
      })
    ).rejects.toThrow('Database connection failed')

    expect(prnRepository.updateStatus).toHaveBeenCalledTimes(1)
  })

  it('throws bad implementation when update returns null', async () => {
    const prnRepository = {
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        issuedByOrganisation: 'org-123',
        issuedByAccreditation: 'acc-456',
        tonnage: 100,
        status: { currentStatus: PRN_STATUS.DRAFT }
      }),
      updateStatus: vi.fn().mockResolvedValue(null)
    }
    const wasteBalancesRepository = {
      findByAccreditationId: vi
        .fn()
        .mockResolvedValue({ accreditationId: 'acc-456' }),
      deductAvailableBalanceForPrnCreation: vi.fn().mockResolvedValue({})
    }

    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        userId: 'user-789'
      })
    ).rejects.toThrow('Failed to update PRN status')
  })

  it('throws error when update returns null during PRN issuing', async () => {
    const prnRepository = {
      findById: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        issuedByOrganisation: 'org-123',
        issuedByAccreditation: 'acc-456',
        nation: 'england',
        isExport: false,
        status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
      }),
      updateStatus: vi.fn().mockResolvedValue(null)
    }
    const wasteBalancesRepository = {}

    await expect(
      updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        userId: 'user-789'
      })
    ).rejects.toThrow('Failed to update PRN status')
  })
})
