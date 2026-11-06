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

const ORGANISATION_NUMBER = 500064
const ACCREDITATION_NUMBER = 'A26EX5000640122PL'
const HISTORY_MISMATCH =
  'status history does not end approved, suspended, cancelled with the last two on 2026-10-19'

const CREATED = {
  status: 'created',
  updatedAt: new Date('2026-01-10T09:00:00Z')
}
const APPROVED = {
  status: 'approved',
  updatedAt: new Date('2026-02-01T09:00:00Z')
}
const SUSPENDED = {
  status: 'suspended',
  updatedAt: new Date('2026-10-19T09:30:00Z')
}
const CANCELLED = {
  status: 'cancelled',
  updatedAt: new Date('2026-10-19T14:00:00Z')
}
const REVERSIBLE_HISTORY = [CREATED, APPROVED, SUSPENDED, CANCELLED]

/**
 * @param {{
 *   accreditationHistory?: Array<{ status: string, updatedAt: Date }>,
 *   accreditationOverrides?: object,
 *   registrationStatus?: string,
 *   linked?: boolean,
 *   orgId?: number
 * }} [options]
 */
const buildTargetOrganisation = ({
  accreditationHistory = REVERSIBLE_HISTORY,
  accreditationOverrides = {},
  registrationStatus = 'approved',
  linked = true,
  orgId = ORGANISATION_NUMBER
} = {}) => {
  const accreditationId = new ObjectId().toString()
  return buildOrganisation({
    orgId,
    registrations: [
      buildRegistration({
        ...(linked && { accreditationId }),
        reprocessingType: 'input',
        registrationNumber: 'R26EX5000640122PL',
        validFrom: '2026-01-01',
        statusHistory: [CREATED, { ...APPROVED, status: registrationStatus }]
      })
    ],
    accreditations: [
      buildAccreditation({
        id: accreditationId,
        reprocessingType: 'input',
        accreditationNumber: toAccreditationNumber(ACCREDITATION_NUMBER),
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
        // @ts-expect-error fixture statuses are plain strings
        statusHistory: accreditationHistory,
        ...accreditationOverrides
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
    const organisationsFactory =
      createInMemoryOrganisationsRepository(organisations)
    const systemLogsFactory = createInMemorySystemLogsRepository()
    organisationsRepository = organisationsFactory()
    systemLogsRepository = systemLogsFactory(logger)
    vi.mocked(createOrganisationsRepository).mockResolvedValue(
      () => organisationsRepository
    )
    vi.mocked(createSystemLogsRepository).mockResolvedValue(
      () => systemLogsRepository
    )
  }

  const storedAccreditation = async (organisation, minimumVersion) => {
    const stored = await organisationsRepository.findById(
      organisation.id,
      minimumVersion
    )
    return stored.accreditations[0]
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

  describe('when the accreditation was suspended and cancelled on 19/10/2026', () => {
    it('removes the suspended and cancelled entries so the accreditation is approved again', async () => {
      const organisation = buildTargetOrganisation()
      seedWith([organisation])

      await runReverseAccreditationCancellation(mockServer)

      const accreditation = await storedAccreditation(organisation, 2)
      expect(accreditation.status).toBe('approved')
      expect(accreditation.statusHistory).toEqual([CREATED, APPROVED])
    })

    it('leaves the validity window and accreditation number as they were', async () => {
      const organisation = buildTargetOrganisation()
      seedWith([organisation])

      await runReverseAccreditationCancellation(mockServer)

      const accreditation = await storedAccreditation(organisation, 2)
      expect(accreditation).toMatchObject({
        accreditationNumber: ACCREDITATION_NUMBER,
        validFrom: '2026-01-01',
        validTo: '2026-12-31'
      })
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

    it('reads the dates in UK time, so a suspension late on 18/10 UTC counts as 19/10', async () => {
      const organisation = buildTargetOrganisation({
        accreditationHistory: [
          CREATED,
          APPROVED,
          { ...SUSPENDED, updatedAt: new Date('2026-10-18T23:30:00Z') },
          CANCELLED
        ]
      })
      seedWith([organisation])

      await runReverseAccreditationCancellation(mockServer)

      const accreditation = await storedAccreditation(organisation, 2)
      expect(accreditation.status).toBe('approved')
    })

    it('changes nothing more when it runs again', async () => {
      const organisation = buildTargetOrganisation()
      seedWith([organisation])

      await runReverseAccreditationCancellation(mockServer)
      await runReverseAccreditationCancellation(mockServer)

      const stored = await organisationsRepository.findById(organisation.id, 2)
      expect(stored.version).toBe(2)
      expect(stored.accreditations[0].statusHistory).toEqual([
        CREATED,
        APPROVED
      ])
      expect(await storedSystemLogs()).toHaveLength(1)
    })
  })

  describe('when the record does not match exactly', () => {
    it.each([
      {
        scenario: 'the organisation does not exist',
        organisation: () => buildTargetOrganisation({ orgId: 500065 }),
        reason: 'organisation not found'
      },
      {
        scenario: 'the organisation has no accreditation with that number',
        organisation: () =>
          buildTargetOrganisation({
            accreditationOverrides: {
              accreditationNumber: toAccreditationNumber('A26EX0000000000PL')
            }
          }),
        reason: 'accreditation not found on organisation'
      },
      {
        scenario: 'the accreditation is not cancelled',
        organisation: () =>
          buildTargetOrganisation({
            accreditationHistory: [CREATED, APPROVED]
          }),
        reason: HISTORY_MISMATCH
      },
      {
        scenario: 'the cancellation went straight from approved',
        organisation: () =>
          buildTargetOrganisation({
            accreditationHistory: [CREATED, APPROVED, CANCELLED]
          }),
        reason: HISTORY_MISMATCH
      },
      {
        scenario: 'the cancellation was on 20/10 in UK time',
        organisation: () =>
          buildTargetOrganisation({
            accreditationHistory: [
              CREATED,
              APPROVED,
              SUSPENDED,
              { ...CANCELLED, updatedAt: new Date('2026-10-19T23:30:00Z') }
            ]
          }),
        reason: HISTORY_MISMATCH
      },
      {
        scenario: 'the suspension was on an earlier day',
        organisation: () =>
          buildTargetOrganisation({
            accreditationHistory: [
              CREATED,
              APPROVED,
              { ...SUSPENDED, updatedAt: new Date('2026-10-01T09:00:00Z') },
              CANCELLED
            ]
          }),
        reason: HISTORY_MISMATCH
      },
      {
        scenario: 'the accreditation has no validity window',
        organisation: () =>
          buildTargetOrganisation({
            accreditationOverrides: { validFrom: null, validTo: null }
          }),
        reason: 'accreditation has no validity window'
      },
      {
        scenario: 'the linked registration is cancelled',
        organisation: () =>
          buildTargetOrganisation({ registrationStatus: 'cancelled' }),
        reason: 'linked registration is not approved'
      },
      {
        scenario: 'no registration is linked to the accreditation',
        organisation: () => buildTargetOrganisation({ linked: false }),
        reason: 'linked registration is not approved'
      }
    ])(
      'changes nothing and says why when $scenario',
      async ({ organisation: build, reason }) => {
        const organisation = build()
        seedWith([organisation])

        await runReverseAccreditationCancellation(mockServer)

        const stored = await organisationsRepository.findById(organisation.id)
        expect(stored.version).toBe(1)
        expect(stored.accreditations[0].statusHistory).toEqual(
          organisation.accreditations[0].statusHistory
        )
        expect(await storedSystemLogs()).toEqual([])
        expect(logger.info).toHaveBeenCalledWith({
          message: `Skipping accreditation cancellation reversal: organisationNumber=500064 accreditationNumber=A26EX5000640122PL reason="${reason}"`
        })
      }
    )
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
