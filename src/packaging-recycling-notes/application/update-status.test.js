import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  PRN_STATUS,
  PRN_ACTOR,
  StatusConflictError,
  UnauthorisedTransitionError
} from '#packaging-recycling-notes/domain/model.js'
import { REGULATOR, ORGANISATION_STATUS } from '#domain/organisations/model.js'
import { STREAM_EVENT_KIND } from '#waste-balances/repository/stream-schema.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { createWasteBalancesRepository } from '#waste-balances/repository/repository.js'
import { createInMemoryStreamRepository } from '#waste-balances/repository/stream-inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  buildOrganisation,
  buildAccreditation
} from '#repositories/organisations/contract/test-data.js'
import { createMockLogger } from '#test/mock-logger.js'

const mockRecordStatusTransition = vi.fn()

vi.mock('./metrics.js', () => ({
  prnMetrics: {
    recordStatusTransition: (...args) => mockRecordStatusTransition(...args)
  }
}))

const { updatePrnStatus } = await import('./update-status.js')

const ORG_ID = '507f1f77bcf86cd799439aaa'
const ACC_ID = 'acc-456'
const REG_ID = 'reg-789'
const PRN_ID = '507f1f77bcf86cd799439011'
const USER = { id: 'user-789', name: 'Test User' }
const EVENT_AT = new Date('2026-02-01T12:00:00.000Z')

/**
 * @param {Object} [overrides]
 * @returns {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote}
 */
const buildPrn = (overrides = {}) => ({
  id: PRN_ID,
  schemaVersion: 2,
  version: 1,
  registrationId: REG_ID,
  organisation: { id: ORG_ID, name: 'Test Reprocessor' },
  accreditation: {
    id: ACC_ID,
    accreditationNumber: 'ACC-1',
    accreditationYear: 2026,
    material: 'plastic',
    submittedToRegulator: REGULATOR.EA
  },
  tonnage: 100,
  isExport: false,
  status: {
    currentStatus: PRN_STATUS.DRAFT,
    currentStatusAt: EVENT_AT,
    history: []
  },
  createdAt: EVENT_AT,
  createdBy: USER,
  updatedAt: EVENT_AT,
  updatedBy: USER,
  ...overrides
})

/**
 * Seed an opening waste balance as a single stream event. `findBalance`
 * resolves the latest event's closing balance, so this is the balance the
 * transition opens against.
 *
 * @param {{ amount: number, availableAmount: number }} closingBalance
 * @returns {import('#waste-balances/repository/stream-schema.js').StreamEvent}
 */
const buildOpeningBalanceEvent = ({ amount, availableAmount }) => ({
  id: 'opening-balance',
  registrationId: REG_ID,
  accreditationId: ACC_ID,
  organisationId: ORG_ID,
  number: 1,
  kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
  payload: { summaryLogId: 'seed-summary-log', creditTotal: amount },
  openingBalance: { amount: 0, availableAmount: 0 },
  closingBalance: { amount, availableAmount },
  createdAt: EVENT_AT,
  createdBy: USER
})

/**
 * An organisation carrying the accreditation under test, with `ORG_ID` and
 * `ACC_ID` pinned so the seeded PRN's links resolve. `withAccreditation: false`
 * removes the accreditation so issuance can't find it.
 *
 * @param {Object} [options]
 * @param {Object} [options.accreditation] - accreditation field overrides
 * @param {boolean} [options.withAccreditation]
 */
const buildOrgWithAccreditation = ({
  accreditation = {},
  withAccreditation = true
} = {}) => ({
  // `status` is derived from `statusHistory` on read; the seeded value only
  // satisfies the constructor's Organisation type.
  status: ORGANISATION_STATUS.APPROVED,
  ...buildOrganisation({
    id: ORG_ID,
    accreditations: withAccreditation
      ? [
          buildAccreditation({
            id: ACC_ID,
            accreditationYear: 2026,
            submittedToRegulator: REGULATOR.EA,
            ...accreditation
          })
        ]
      : []
  })
})

/**
 * Wire up the three real in-memory adapters for one case. The PRN doc and the
 * waste balance are seeded; the organisation always carries the accreditation
 * unless `withAccreditation: false` removes it.
 *
 * @param {Object} [options]
 * @param {Object} [options.prn] - PRN to seed, or omitted for an empty repo
 * @param {{ amount: number, availableAmount: number }} [options.balance] - opening balance, or omitted for none
 * @param {Object} [options.accreditation] - accreditation field overrides
 * @param {boolean} [options.withAccreditation]
 */
const seedRepositories = ({
  prn,
  balance,
  accreditation,
  withAccreditation = true
} = {}) => {
  const prnRepository = createInMemoryPackagingRecyclingNotesRepository(
    prn ? [prn] : []
  )(createMockLogger())
  const streamRepository = createInMemoryStreamRepository(
    balance ? [buildOpeningBalanceEvent(balance)] : []
  )()
  const wasteBalancesRepository = createWasteBalancesRepository({
    streamRepository
  })()
  const organisationsRepository = createInMemoryOrganisationsRepository([
    buildOrgWithAccreditation({ accreditation, withAccreditation })
  ])()
  return { prnRepository, wasteBalancesRepository, organisationsRepository }
}

const readBalance = (wasteBalancesRepository) =>
  wasteBalancesRepository.findBalance({
    registrationId: REG_ID,
    accreditationId: ACC_ID
  })

const callUpdate = (overrides) =>
  updatePrnStatus({
    logger: createMockLogger(),
    id: PRN_ID,
    organisationId: ORG_ID,
    registrationId: REG_ID,
    accreditationId: ACC_ID,
    user: USER,
    ...overrides
  })

describe('updatePrnStatus', () => {
  beforeEach(() => {
    mockRecordStatusTransition.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('PRN lookup and tenancy', () => {
    it('throws not found when the PRN does not exist', async () => {
      const repositories = seedRepositories()

      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER
        })
      ).rejects.toThrow('PRN not found')
    })

    it('throws not found when the PRN belongs to a different organisation', async () => {
      const repositories = seedRepositories({ prn: buildPrn() })

      await expect(
        callUpdate({
          ...repositories,
          organisationId: '507f1f77bcf86cd799439bbb',
          newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER
        })
      ).rejects.toThrow('PRN not found')
    })

    it('throws not found when the PRN belongs to a different accreditation', async () => {
      const repositories = seedRepositories({ prn: buildPrn() })

      await expect(
        callUpdate({
          ...repositories,
          accreditationId: 'different-acc',
          newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER
        })
      ).rejects.toThrow('PRN not found')
    })
  })

  describe('transition rules', () => {
    it('throws StatusConflictError when the transition is not permitted', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        })
      })

      // DRAFT can only reach AWAITING_AUTHORISATION, never AWAITING_ACCEPTANCE
      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER
        })
      ).rejects.toThrow(StatusConflictError)
    })

    it('throws UnauthorisedTransitionError when the actor may not perform the transition', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
            history: []
          }
        })
      })

      // Only the producer may accept; a reprocessor/exporter may not
      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.ACCEPTED,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER
        })
      ).rejects.toThrow(UnauthorisedTransitionError)
    })
  })

  describe('creating a PRN (draft to awaiting authorisation)', () => {
    it('ringfences the available balance and advances the PRN', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        }),
        balance: { amount: 1000, availableAmount: 1000 }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER
      })

      const reread = await repositories.prnRepository.findById(PRN_ID)
      expect(reread?.status.currentStatus).toBe(
        PRN_STATUS.AWAITING_AUTHORISATION
      )
      expect(reread?.version).toBe(2)

      expect(
        await readBalance(repositories.wasteBalancesRepository)
      ).toMatchObject({ amount: 1000, availableAmount: 900 })
    })

    it('allows creation when the tonnage equals the available balance exactly', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        }),
        balance: { amount: 500, availableAmount: 100 }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER
      })

      expect(
        await readBalance(repositories.wasteBalancesRepository)
      ).toMatchObject({ amount: 500, availableAmount: 0 })
    })

    it('throws conflict and leaves the balance untouched when the tonnage exceeds the available balance', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        }),
        balance: { amount: 500, availableAmount: 50 }
      })

      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER
        })
      ).rejects.toThrow('Insufficient available waste balance')

      expect(
        await readBalance(repositories.wasteBalancesRepository)
      ).toMatchObject({ amount: 500, availableAmount: 50 })
    })

    it('throws when creating a PRN with no waste balance', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        })
      })

      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER
        })
      ).rejects.toThrow('No waste balance found for accreditation: acc-456')
    })

    it('treats an absent available amount as zero when creating', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 1,
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        })
      })

      await expect(
        callUpdate({
          ...repositories,
          // The stream-backed balance always carries both amounts; a partial
          // balance only arises from a hand-built double, exercising the guard.
          wasteBalancesRepository: {
            findBalance: vi
              .fn()
              .mockResolvedValue({ accreditationId: ACC_ID, amount: 500 })
          },
          newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER
        })
      ).rejects.toThrow('Insufficient available waste balance')
    })
  })

  describe('issuing a PRN (awaiting authorisation to awaiting acceptance)', () => {
    it('generates a PRN number and deducts the total balance when issuing', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 75,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        balance: { amount: 1000, availableAmount: 1000 }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        actor: PRN_ACTOR.SIGNATORY
      })

      const reread = await repositories.prnRepository.findById(PRN_ID)
      expect(reread?.status.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)
      expect(reread?.prnNumber).toMatch(/^ER26\d{5}$/)

      expect(
        await readBalance(repositories.wasteBalancesRepository)
      ).toMatchObject({ amount: 925, availableAmount: 1000 })
    })

    it('throws conflict and leaves the balance untouched when the tonnage exceeds the total balance', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        balance: { amount: 50, availableAmount: 200 }
      })

      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
          actor: PRN_ACTOR.SIGNATORY
        })
      ).rejects.toThrow('Insufficient total waste balance')

      expect(
        await readBalance(repositories.wasteBalancesRepository)
      ).toMatchObject({ amount: 50, availableAmount: 200 })
    })

    it('throws when issuing a PRN with no waste balance', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        })
      })

      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
          actor: PRN_ACTOR.SIGNATORY
        })
      ).rejects.toThrow('No waste balance found for accreditation: acc-456')
    })

    it('treats an absent total amount as zero when issuing', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 1,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        })
      })

      await expect(
        callUpdate({
          ...repositories,
          // The stream-backed balance always carries both amounts; a partial
          // balance only arises from a hand-built double, exercising the guard.
          wasteBalancesRepository: {
            findBalance: vi.fn().mockResolvedValue({
              accreditationId: ACC_ID,
              availableAmount: 200
            })
          },
          newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
          actor: PRN_ACTOR.SIGNATORY
        })
      ).rejects.toThrow('Insufficient total waste balance')
    })

    it('throws when the accreditation cannot be found when issuing', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        balance: { amount: 1000, availableAmount: 1000 },
        withAccreditation: false
      })

      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
          actor: PRN_ACTOR.SIGNATORY
        })
      ).rejects.toThrow()
    })
  })

  describe('discarding a draft PRN', () => {
    it('discards at the provided timestamp without touching the balance', async () => {
      const explicitTimestamp = new Date('2026-01-15T12:00:00Z')
      const repositories = seedRepositories({
        prn: buildPrn({
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        }),
        balance: { amount: 1000, availableAmount: 1000 }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.DISCARDED,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER,
        updatedAt: explicitTimestamp
      })

      const reread = await repositories.prnRepository.findById(PRN_ID)
      expect(reread?.status.currentStatus).toBe(PRN_STATUS.DISCARDED)
      expect(reread?.status.currentStatusAt).toEqual(explicitTimestamp)
      expect(reread?.version).toBe(2)

      expect(
        await readBalance(repositories.wasteBalancesRepository)
      ).toMatchObject({ amount: 1000, availableAmount: 1000 })
    })

    it('throws when the discard write reports no updated PRN', async () => {
      const prn = buildPrn({
        status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
      })

      await expect(
        callUpdate({
          // A successful findById guarantees the document exists, so the real
          // twin's updateStatus never returns null; this double exercises the
          // defensive guard.
          prnRepository: {
            findById: vi.fn().mockResolvedValue(prn),
            updateStatus: vi.fn().mockResolvedValue(null)
          },
          wasteBalancesRepository: {},
          organisationsRepository: {},
          newStatus: PRN_STATUS.DISCARDED,
          actor: PRN_ACTOR.REPROCESSOR_EXPORTER
        })
      ).rejects.toThrow('Failed to update PRN status')
    })
  })

  describe('cancelling an issued PRN (awaiting cancellation to cancelled)', () => {
    it('credits the full balance when the cancellation completes', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 60,
          status: {
            currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
            history: []
          }
        }),
        balance: { amount: 440, availableAmount: 940 }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.CANCELLED,
        actor: PRN_ACTOR.SIGNATORY
      })

      const reread = await repositories.prnRepository.findById(PRN_ID)
      expect(reread?.status.currentStatus).toBe(PRN_STATUS.CANCELLED)

      expect(
        await readBalance(repositories.wasteBalancesRepository)
      ).toMatchObject({ amount: 500, availableAmount: 1000 })
    })

    it('throws when cancelling an issued PRN with no waste balance', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 60,
          status: {
            currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
            history: []
          }
        })
      })

      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.CANCELLED,
          actor: PRN_ACTOR.SIGNATORY
        })
      ).rejects.toThrow('No waste balance found for accreditation: acc-456')
    })
  })

  describe('deleting a pending PRN (awaiting authorisation to deleted)', () => {
    it('credits the available balance when the pending PRN is deleted', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 75,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        }),
        balance: { amount: 1000, availableAmount: 925 }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.DELETED,
        actor: PRN_ACTOR.SIGNATORY
      })

      const reread = await repositories.prnRepository.findById(PRN_ID)
      expect(reread?.status.currentStatus).toBe(PRN_STATUS.DELETED)

      expect(
        await readBalance(repositories.wasteBalancesRepository)
      ).toMatchObject({ amount: 1000, availableAmount: 1000 })
    })

    it('throws when deleting a pending PRN with no waste balance', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 50,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            history: []
          }
        })
      })

      await expect(
        callUpdate({
          ...repositories,
          newStatus: PRN_STATUS.DELETED,
          actor: PRN_ACTOR.SIGNATORY
        })
      ).rejects.toThrow('No waste balance found for accreditation: acc-456')
    })
  })

  describe('metrics', () => {
    it('records the status transition metric on a successful update', async () => {
      const repositories = seedRepositories({
        prn: buildPrn({
          tonnage: 100,
          status: { currentStatus: PRN_STATUS.DRAFT, history: [] }
        }),
        balance: { amount: 1000, availableAmount: 1000 }
      })

      await callUpdate({
        ...repositories,
        newStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        actor: PRN_ACTOR.REPROCESSOR_EXPORTER
      })

      expect(mockRecordStatusTransition).toHaveBeenCalledWith({
        fromStatus: PRN_STATUS.DRAFT,
        toStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        material: 'plastic',
        isExport: false
      })
    })
  })
})
