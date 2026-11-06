import { ObjectId } from 'mongodb'

import { logger } from '#common/helpers/logging/logger.js'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'
import {
  buildAccreditation,
  buildRegistration,
  createOrganisationBuilders
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSystemLogsRepository as createInMemorySystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { runReverseAccreditationCancellation } from './run-reverse-accreditation-cancellation.js'

const { buildOrganisation } = createOrganisationBuilders()

const mockAudit = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))
vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn()
}))
vi.mock('#repositories/system-logs/mongodb.js', () => ({
  createSystemLogsRepository: vi.fn()
}))

const ACCREDITATION_NUMBER = 'A26EX5000640122PL'
const SKIPPED_MESSAGE = {
  message: `Skipping accreditation cancellation reversal: accreditationNumber=${ACCREDITATION_NUMBER} not found or already reversed`
}

// The accreditation's status history in production.
const CREATED = {
  status: 'created',
  updatedAt: new Date('2025-12-30T11:43:44.248Z')
}
const APPROVED = {
  status: 'approved',
  updatedAt: new Date('2026-01-08T09:59:33.397Z')
}
const SUSPENDED = {
  status: 'suspended',
  updatedAt: new Date('2026-10-19T10:37:26.074Z')
}
const CANCELLED = {
  status: 'cancelled',
  updatedAt: new Date('2026-10-19T10:37:32.973Z')
}
const PRODUCTION_HISTORY = [CREATED, APPROVED, SUSPENDED, CANCELLED]

/**
 * @param {{
 *   accreditationHistory?: Array<{ status: string, updatedAt: Date }>,
 *   accreditationNumber?: string,
 *   orgId?: number
 * }} [options]
 */
const buildTargetOrganisation = ({
  accreditationHistory = PRODUCTION_HISTORY,
  accreditationNumber = ACCREDITATION_NUMBER,
  orgId = 500064
} = {}) => {
  const accreditationId = new ObjectId().toString()
  return buildOrganisation({
    orgId,
    registrations: [
      buildRegistration({
        accreditationId,
        reprocessingType: 'input',
        registrationNumber: 'R26EX5000640122PL',
        validFrom: '2026-01-01',
        statusHistory: [CREATED, APPROVED]
      })
    ],
    accreditations: [
      buildAccreditation({
        id: accreditationId,
        reprocessingType: 'input',
        accreditationNumber: toAccreditationNumber(accreditationNumber),
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
        // @ts-expect-error fixture statuses are plain strings
        statusHistory: accreditationHistory
      }),
      buildAccreditation()
    ]
  })
}

describe('runReverseAccreditationCancellation', () => {
  let mockServer
  let mockLock
  let organisationsRepository
  let systemLogsRepository

  const seedWith = (organisations) => {
    organisationsRepository =
      createInMemoryOrganisationsRepository(organisations)()
    systemLogsRepository = createInMemorySystemLogsRepository()(logger)
    vi.mocked(createOrganisationsRepository).mockResolvedValue(
      () => organisationsRepository
    )
    vi.mocked(createSystemLogsRepository).mockResolvedValue(
      () => systemLogsRepository
    )
  }

  const storedSystemLogs = async () => {
    const { systemLogs } = await systemLogsRepository.find({ limit: 10 })
    return systemLogs
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockLock = { free: vi.fn().mockResolvedValue(undefined) }
    mockServer = {
      db: {},
      locker: { lock: vi.fn().mockResolvedValue(mockLock) }
    }
  })

  describe('on the first run', () => {
    it('removes the suspended and cancelled entries so the accreditation is approved again', async () => {
      const organisation = buildTargetOrganisation()
      seedWith([organisation])

      await runReverseAccreditationCancellation(mockServer)

      const stored = await organisationsRepository.findById(organisation.id, 2)
      expect(stored.accreditations[0].status).toBe('approved')
      expect(stored.accreditations[0].statusHistory).toEqual([
        CREATED,
        APPROVED
      ])
    })

    it("leaves the organisation's other accreditations untouched", async () => {
      const organisation = buildTargetOrganisation()
      seedWith([organisation])

      await runReverseAccreditationCancellation(mockServer)

      const stored = await organisationsRepository.findById(organisation.id, 2)
      expect(stored.accreditations[1]).toMatchObject({
        id: organisation.accreditations[1].id,
        status: 'created',
        statusHistory: [{ status: 'created' }]
      })
    })

    it('records a system log against the organisation as the system user', async () => {
      const organisation = buildTargetOrganisation()
      seedWith([organisation])

      await runReverseAccreditationCancellation(mockServer)

      const [systemLog] = await storedSystemLogs()
      expect(systemLog).toMatchObject({
        createdBy: { id: 'system', email: 'system', scope: [], role: null },
        event: {
          category: 'entity',
          subCategory: 'epr-organisations',
          action: 'reverse-accreditation-cancellation'
        },
        context: {
          organisationId: organisation.id,
          accreditationId: organisation.accreditations[0].id,
          reason: 'Court order reversing the cancellation of 19/10/2026'
        }
      })
      expect(systemLog.context.previous.accreditations[0].status).toBe(
        'cancelled'
      )
      expect(systemLog.context.next.accreditations[0].status).toBe('approved')
    })

    it('sends the change to the CDP audit', async () => {
      seedWith([buildTargetOrganisation()])

      await runReverseAccreditationCancellation(mockServer)

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'reverse-accreditation-cancellation'
          })
        })
      )
    })

    it('matches on the day, not the exact time', async () => {
      const organisation = buildTargetOrganisation({
        accreditationHistory: [
          CREATED,
          APPROVED,
          { ...SUSPENDED, updatedAt: new Date('2026-10-19T08:00:00.000Z') },
          { ...CANCELLED, updatedAt: new Date('2026-10-19T16:00:00.000Z') }
        ]
      })
      seedWith([organisation])

      await runReverseAccreditationCancellation(mockServer)

      const stored = await organisationsRepository.findById(organisation.id, 2)
      expect(stored.accreditations[0].status).toBe('approved')
    })
  })

  it('changes nothing when it runs again', async () => {
    const organisation = buildTargetOrganisation()
    seedWith([organisation])

    await runReverseAccreditationCancellation(mockServer)
    await runReverseAccreditationCancellation(mockServer)

    const stored = await organisationsRepository.findById(organisation.id, 2)
    expect(stored.version).toBe(2)
    expect(stored.accreditations[0].statusHistory).toEqual([CREATED, APPROVED])
    expect(await storedSystemLogs()).toHaveLength(1)
    expect(logger.info).toHaveBeenCalledWith(SKIPPED_MESSAGE)
  })

  it.each([
    {
      scenario: 'the organisation does not exist',
      organisation: () => buildTargetOrganisation({ orgId: 500065 })
    },
    {
      scenario: 'the organisation has no accreditation with that number',
      organisation: () =>
        buildTargetOrganisation({ accreditationNumber: 'A26EX0000000000PL' })
    },
    {
      scenario: 'the cancellation is on a different day',
      organisation: () =>
        buildTargetOrganisation({
          accreditationHistory: [
            CREATED,
            APPROVED,
            SUSPENDED,
            { ...CANCELLED, updatedAt: new Date('2026-10-20T10:37:32.973Z') }
          ]
        })
    },
    {
      scenario: 'the last two entries are not suspended then cancelled',
      organisation: () =>
        buildTargetOrganisation({
          accreditationHistory: [CREATED, APPROVED, CANCELLED, SUSPENDED]
        })
    }
  ])('changes nothing when $scenario', async ({ organisation: build }) => {
    const organisation = build()
    seedWith([organisation])

    await runReverseAccreditationCancellation(mockServer)

    const stored = await organisationsRepository.findById(organisation.id)
    expect(stored.version).toBe(1)
    expect(await storedSystemLogs()).toEqual([])
    expect(logger.info).toHaveBeenCalledWith(SKIPPED_MESSAGE)
  })

  describe('locking', () => {
    it('runs under its own lock and releases it afterwards', async () => {
      seedWith([buildTargetOrganisation()])

      await runReverseAccreditationCancellation(mockServer)

      expect(mockServer.locker.lock).toHaveBeenCalledWith(
        'reverse-accreditation-cancellation'
      )
      expect(mockLock.free).toHaveBeenCalled()
    })

    it('does nothing when another instance holds the lock', async () => {
      mockServer.locker.lock.mockResolvedValue(null)

      await runReverseAccreditationCancellation(mockServer)

      expect(createOrganisationsRepository).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Unable to obtain lock, skipping accreditation cancellation reversal'
      })
    })
  })

  it('logs an error and releases the lock when the update fails', async () => {
    const error = new Error('replace failed')
    seedWith([buildTargetOrganisation()])
    vi.spyOn(organisationsRepository, 'replace').mockRejectedValue(error)

    await runReverseAccreditationCancellation(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to reverse accreditation cancellation'
    })
    expect(mockLock.free).toHaveBeenCalled()
    expect(await storedSystemLogs()).toEqual([])
  })
})
