import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { PRN_STATUS } from '#l-packaging-recycling-notes/domain/model.js'
import { PrnNumberConflictError } from '#l-packaging-recycling-notes/repository/mongodb.js'

const mockRecordStatusTransition = vi.fn()

vi.mock('./metrics.js', () => ({
  prnMetrics: {
    recordStatusTransition: (...args) => mockRecordStatusTransition(...args)
  }
}))

const { updatePrnStatus } = await import('./update-status.js')

describe('updatePrnStatus', () => {
  beforeEach(() => {
    mockRecordStatusTransition.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })
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
      findByAccreditationId: vi.fn().mockResolvedValue({
        accreditationId: 'acc-456',
        amount: 1000,
        availableAmount: 1000
      }),
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
      findByAccreditationId: vi.fn().mockResolvedValue({
        accreditationId: 'acc-456',
        amount: 1000,
        availableAmount: 1000
      }),
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
      findByAccreditationId: vi.fn().mockResolvedValue({
        accreditationId: 'acc-456',
        amount: 1000,
        availableAmount: 1000
      }),
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
      issuedAt: expect.any(Date),
      prnNumber: expect.stringMatching(/^ER26\d{5}$/)
    })
  })

  it('sets issuedAt to the same timestamp as updatedAt when issuing', async () => {
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
      updateStatus: vi.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        prnNumber: 'ER2600001',
        status: { currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE }
      })
    }
    const wasteBalancesRepository = {
      findByAccreditationId: vi.fn().mockResolvedValue({
        accreditationId: 'acc-456',
        amount: 1000,
        availableAmount: 1000
      }),
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

    const updateCall = prnRepository.updateStatus.mock.calls[0][0]
    expect(updateCall.issuedAt).toStrictEqual(updateCall.updatedAt)
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
      findByAccreditationId: vi.fn().mockResolvedValue({
        accreditationId: 'acc-456',
        amount: 1000,
        availableAmount: 1000
      }),
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
      findByAccreditationId: vi.fn().mockResolvedValue({
        accreditationId: 'acc-456',
        amount: 1000,
        availableAmount: 1000
      }),
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
      issuedAt: expect.any(Date),
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
      findByAccreditationId: vi.fn().mockResolvedValue({
        accreditationId: 'acc-456',
        amount: 1000,
        availableAmount: 1000
      }),
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
      findByAccreditationId: vi.fn().mockResolvedValue({
        accreditationId: 'acc-456',
        amount: 1000,
        availableAmount: 1000
      }),
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
      findByAccreditationId: vi.fn().mockResolvedValue({
        accreditationId: 'acc-456',
        amount: 1000,
        availableAmount: 1000
      }),
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
        tonnage: 50,
        status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
      }),
      updateStatus: vi.fn().mockResolvedValue(null)
    }
    const wasteBalancesRepository = {
      findByAccreditationId: vi.fn().mockResolvedValue({
        accreditationId: 'acc-456',
        amount: 1000,
        availableAmount: 1000
      }),
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
    ).rejects.toThrow('Failed to update PRN status')
  })

  describe('negative waste balance prevention', () => {
    it('throws conflict when PRN tonnage exceeds available waste balance at creation', async () => {
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
        findByAccreditationId: vi.fn().mockResolvedValue({
          accreditationId: 'acc-456',
          amount: 500,
          availableAmount: 50
        }),
        deductAvailableBalanceForPrnCreation: vi.fn()
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
      ).rejects.toThrow('Insufficient available waste balance')

      expect(
        wasteBalancesRepository.deductAvailableBalanceForPrnCreation
      ).not.toHaveBeenCalled()
      expect(prnRepository.updateStatus).not.toHaveBeenCalled()
    })

    it('throws conflict when PRN tonnage exceeds total waste balance at issue', async () => {
      const prnRepository = {
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          issuedByOrganisation: 'org-123',
          issuedByAccreditation: 'acc-456',
          nation: 'england',
          isExport: false,
          tonnage: 100,
          status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
        }),
        updateStatus: vi.fn()
      }
      const wasteBalancesRepository = {
        findByAccreditationId: vi.fn().mockResolvedValue({
          accreditationId: 'acc-456',
          amount: 50,
          availableAmount: 200
        }),
        deductTotalBalanceForPrnIssue: vi.fn()
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
      ).rejects.toThrow('Insufficient total waste balance')

      expect(
        wasteBalancesRepository.deductTotalBalanceForPrnIssue
      ).not.toHaveBeenCalled()
      expect(prnRepository.updateStatus).not.toHaveBeenCalled()
    })

    it('allows creation when tonnage equals available waste balance exactly', async () => {
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
        findByAccreditationId: vi.fn().mockResolvedValue({
          accreditationId: 'acc-456',
          amount: 500,
          availableAmount: 100
        }),
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
      ).toHaveBeenCalled()
    })

    it('treats undefined available balance as zero', async () => {
      const prnRepository = {
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          issuedByOrganisation: 'org-123',
          issuedByAccreditation: 'acc-456',
          tonnage: 1,
          status: { currentStatus: PRN_STATUS.DRAFT }
        }),
        updateStatus: vi.fn()
      }
      const wasteBalancesRepository = {
        findByAccreditationId: vi.fn().mockResolvedValue({
          accreditationId: 'acc-456',
          amount: 500
        })
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
      ).rejects.toThrow('Insufficient available waste balance')
    })

    it('treats undefined total balance as zero', async () => {
      const prnRepository = {
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          issuedByOrganisation: 'org-123',
          issuedByAccreditation: 'acc-456',
          nation: 'england',
          isExport: false,
          tonnage: 1,
          status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
        }),
        updateStatus: vi.fn()
      }
      const wasteBalancesRepository = {
        findByAccreditationId: vi.fn().mockResolvedValue({
          accreditationId: 'acc-456',
          availableAmount: 200
        })
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
      ).rejects.toThrow('Insufficient total waste balance')
    })

    it('allows issue when tonnage equals total waste balance exactly', async () => {
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
        updateStatus: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          prnNumber: 'ER2600001',
          status: { currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE }
        })
      }
      const wasteBalancesRepository = {
        findByAccreditationId: vi.fn().mockResolvedValue({
          accreditationId: 'acc-456',
          amount: 50,
          availableAmount: 200
        }),
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
      ).toHaveBeenCalled()
    })
  })

  describe('metrics', () => {
    it('records status transition metric on successful update', async () => {
      const prnRepository = {
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          issuedByOrganisation: 'org-123',
          issuedByAccreditation: 'acc-456',
          tonnage: 100,
          material: 'paper',
          isExport: false,
          status: { currentStatus: PRN_STATUS.DRAFT }
        }),
        updateStatus: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
        })
      }
      const wasteBalancesRepository = {
        findByAccreditationId: vi.fn().mockResolvedValue({
          accreditationId: 'acc-456',
          amount: 1000,
          availableAmount: 1000
        }),
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

      expect(mockRecordStatusTransition).toHaveBeenCalledWith({
        fromStatus: PRN_STATUS.DRAFT,
        toStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        material: 'paper',
        isExport: false
      })
    })

    it('records status transition metric when issuing PRN', async () => {
      const prnRepository = {
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          issuedByOrganisation: 'org-123',
          issuedByAccreditation: 'acc-456',
          nation: 'england',
          material: 'plastic',
          tonnage: 50,
          isExport: true,
          status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
        }),
        updateStatus: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          prnNumber: 'PE26000001',
          status: { currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE }
        })
      }
      const wasteBalancesRepository = {
        findByAccreditationId: vi.fn().mockResolvedValue({
          accreditationId: 'acc-456',
          amount: 1000,
          availableAmount: 1000
        }),
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

      expect(mockRecordStatusTransition).toHaveBeenCalledWith({
        fromStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        toStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        material: 'plastic',
        isExport: true
      })
    })

    it('does not record metric when PRN not found', async () => {
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

      expect(mockRecordStatusTransition).not.toHaveBeenCalled()
    })

    it('does not record metric when status transition is invalid', async () => {
      const prnRepository = {
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          issuedByOrganisation: 'org-123',
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
          newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
          userId: 'user-789'
        })
      ).rejects.toThrow('Invalid status transition')

      expect(mockRecordStatusTransition).not.toHaveBeenCalled()
    })
  })

  describe('cancellation waste balance credit', () => {
    it('credits available waste balance when cancelling from awaiting_authorisation', async () => {
      const prnRepository = {
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          issuedByOrganisation: 'org-123',
          issuedByAccreditation: 'acc-456',
          tonnage: 75,
          material: 'paper',
          isExport: false,
          status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
        }),
        updateStatus: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          status: { currentStatus: PRN_STATUS.CANCELLED }
        })
      }
      const wasteBalancesRepository = {
        findByAccreditationId: vi
          .fn()
          .mockResolvedValue({ accreditationId: 'acc-456' }),
        creditAvailableBalanceForPrnCancellation: vi.fn().mockResolvedValue({})
      }

      await updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.CANCELLED,
        userId: 'user-789'
      })

      expect(
        wasteBalancesRepository.creditAvailableBalanceForPrnCancellation
      ).toHaveBeenCalledWith({
        accreditationId: 'acc-456',
        organisationId: 'org-123',
        prnId: '507f1f77bcf86cd799439011',
        tonnage: 75,
        userId: 'user-789'
      })
    })

    it('does not credit waste balance when cancelling from draft', async () => {
      const prnRepository = {
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          issuedByOrganisation: 'org-123',
          issuedByAccreditation: 'acc-456',
          tonnage: 50,
          material: 'plastic',
          isExport: false,
          status: { currentStatus: PRN_STATUS.DRAFT }
        }),
        updateStatus: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          status: { currentStatus: PRN_STATUS.CANCELLED }
        })
      }
      const wasteBalancesRepository = {
        creditAvailableBalanceForPrnCancellation: vi.fn()
      }

      await updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.CANCELLED,
        userId: 'user-789'
      })

      expect(
        wasteBalancesRepository.creditAvailableBalanceForPrnCancellation
      ).not.toHaveBeenCalled()
    })

    it('throws error when cancelling awaiting_authorisation PRN without waste balance', async () => {
      const prnRepository = {
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          issuedByOrganisation: 'org-123',
          issuedByAccreditation: 'acc-456',
          tonnage: 50,
          material: 'paper',
          isExport: false,
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
          newStatus: PRN_STATUS.CANCELLED,
          userId: 'user-789'
        })
      ).rejects.toThrow('No waste balance found for accreditation: acc-456')
    })
  })

  describe('deletion waste balance credit', () => {
    it('credits available waste balance when deleting from awaiting_authorisation', async () => {
      const prnRepository = {
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          issuedByOrganisation: 'org-123',
          issuedByAccreditation: 'acc-456',
          tonnage: 75,
          material: 'paper',
          isExport: false,
          status: { currentStatus: PRN_STATUS.AWAITING_AUTHORISATION }
        }),
        updateStatus: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          status: { currentStatus: PRN_STATUS.DELETED }
        })
      }
      const wasteBalancesRepository = {
        findByAccreditationId: vi
          .fn()
          .mockResolvedValue({ accreditationId: 'acc-456' }),
        creditAvailableBalanceForPrnCancellation: vi.fn().mockResolvedValue({})
      }

      await updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.DELETED,
        userId: 'user-789'
      })

      expect(
        wasteBalancesRepository.creditAvailableBalanceForPrnCancellation
      ).toHaveBeenCalledWith({
        accreditationId: 'acc-456',
        organisationId: 'org-123',
        prnId: '507f1f77bcf86cd799439011',
        tonnage: 75,
        userId: 'user-789'
      })
    })

    it('does not credit waste balance when deleting from draft', async () => {
      const prnRepository = {
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          issuedByOrganisation: 'org-123',
          issuedByAccreditation: 'acc-456',
          tonnage: 50,
          material: 'plastic',
          isExport: false,
          status: { currentStatus: PRN_STATUS.DRAFT }
        }),
        updateStatus: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          status: { currentStatus: PRN_STATUS.DELETED }
        })
      }
      const wasteBalancesRepository = {
        creditAvailableBalanceForPrnCancellation: vi.fn()
      }

      await updatePrnStatus({
        prnRepository,
        wasteBalancesRepository,
        id: '507f1f77bcf86cd799439011',
        organisationId: 'org-123',
        accreditationId: 'acc-456',
        newStatus: PRN_STATUS.DELETED,
        userId: 'user-789'
      })

      expect(
        wasteBalancesRepository.creditAvailableBalanceForPrnCancellation
      ).not.toHaveBeenCalled()
    })

    it('throws error when deleting awaiting_authorisation PRN without waste balance', async () => {
      const prnRepository = {
        findById: vi.fn().mockResolvedValue({
          id: '507f1f77bcf86cd799439011',
          issuedByOrganisation: 'org-123',
          issuedByAccreditation: 'acc-456',
          tonnage: 50,
          material: 'paper',
          isExport: false,
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
          newStatus: PRN_STATUS.DELETED,
          userId: 'user-789'
        })
      ).rejects.toThrow('No waste balance found for accreditation: acc-456')
    })
  })
})
