import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runRowIdCollisionDiagnostic } from './run-row-id-collision-diagnostic.js'
import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn()
}))

describe('runRowIdCollisionDiagnostic', () => {
  let mockServer
  let mockLock
  let mockOrganisationsRepository
  let mockAggregate
  let mockToArray

  beforeEach(() => {
    vi.clearAllMocks()

    mockLock = { free: vi.fn().mockResolvedValue(undefined) }

    mockToArray = vi.fn().mockResolvedValue([])
    mockAggregate = vi.fn().mockReturnValue({ toArray: mockToArray })
    const db = {
      collection: vi.fn().mockReturnValue({ aggregate: mockAggregate })
    }

    mockServer = {
      db,
      locker: {
        lock: vi.fn().mockResolvedValue(mockLock)
      }
    }

    mockOrganisationsRepository = {
      findRegistrationById: vi.fn()
    }

    createOrganisationsRepository.mockResolvedValue(
      () => mockOrganisationsRepository
    )
  })

  it('acquires a lock scoped to the diagnostic and releases it afterwards', async () => {
    await runRowIdCollisionDiagnostic(mockServer)

    expect(mockServer.locker.lock).toHaveBeenCalledWith(
      'row-id-collision-diagnostic'
    )
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('skips running when the lock is held by another instance', async () => {
    mockServer.locker.lock.mockResolvedValue(null)

    await runRowIdCollisionDiagnostic(mockServer)

    expect(mockServer.db.collection).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping row-id collision diagnostic'
    })
  })

  it('runs the aggregation against the waste-records collection with allowDiskUse', async () => {
    await runRowIdCollisionDiagnostic(mockServer)

    expect(mockServer.db.collection).toHaveBeenCalledWith('waste-records')
    expect(mockAggregate).toHaveBeenCalledWith(expect.any(Array), {
      allowDiskUse: true
    })
  })

  it('logs the start of the diagnostic before running the aggregation', async () => {
    mockToArray.mockResolvedValue([])

    await runRowIdCollisionDiagnostic(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Running waste-balance row-id collision diagnostic'
    })
  })

  it('logs a zero-count summary line when no collisions are present', async () => {
    mockToArray.mockResolvedValue([])

    await runRowIdCollisionDiagnostic(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-balance row-id collision diagnostic: 0 affected registrations'
    })
    expect(
      mockOrganisationsRepository.findRegistrationById
    ).not.toHaveBeenCalled()
  })

  it('logs a summary line plus one line per affected registration with resolved numbers', async () => {
    mockToArray.mockResolvedValue([
      {
        _id: { organisationId: 'org-A', registrationId: 'reg-1' },
        collidingRowIds: 281,
        collidingRecordCount: 562
      },
      {
        _id: { organisationId: 'org-B', registrationId: 'reg-2' },
        collidingRowIds: 2,
        collidingRecordCount: 4
      }
    ])
    mockOrganisationsRepository.findRegistrationById.mockImplementation(
      async (orgId, regId) => {
        if (orgId === 'org-A' && regId === 'reg-1') {
          return {
            id: 'reg-1',
            registrationNumber: 'REG-001',
            accreditation: { accreditationNumber: 'ACC-001' }
          }
        }
        return {
          id: 'reg-2',
          registrationNumber: 'REG-002',
          accreditation: null
        }
      }
    )

    await runRowIdCollisionDiagnostic(mockServer)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-balance row-id collision diagnostic: 2 affected registrations (logging first 2 below)'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-balance row-id collision affected registration: organisationId=org-A registrationNumber=REG-001 accreditationNumber=ACC-001 collidingRowIds=281 collidingRecordCount=562'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-balance row-id collision affected registration: organisationId=org-B registrationNumber=REG-002 accreditationNumber=<none> collidingRowIds=2 collidingRecordCount=4'
    })
  })

  it('caps the per-registration log lines at 100', async () => {
    const rolledUp = Array.from({ length: 150 }, (_, index) => ({
      _id: {
        organisationId: `org-${index}`,
        registrationId: `reg-${index}`
      },
      collidingRowIds: 1,
      collidingRecordCount: 2
    }))
    mockToArray.mockResolvedValue(rolledUp)
    mockOrganisationsRepository.findRegistrationById.mockImplementation(
      async (_orgId, regId) => ({
        id: regId,
        registrationNumber: `num-${regId}`,
        accreditation: null
      })
    )

    await runRowIdCollisionDiagnostic(mockServer)

    expect(
      mockOrganisationsRepository.findRegistrationById
    ).toHaveBeenCalledTimes(100)
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-balance row-id collision diagnostic: 150 affected registrations (logging first 100 below)'
    })
    const perRegistrationLines = logger.info.mock.calls.filter(([arg]) =>
      arg.message.startsWith(
        'Waste-balance row-id collision affected registration:'
      )
    )
    expect(perRegistrationLines).toHaveLength(100)
  })

  it('records a lookup error against a registration rather than failing the whole run', async () => {
    mockToArray.mockResolvedValue([
      {
        _id: { organisationId: 'org-missing', registrationId: 'reg-X' },
        collidingRowIds: 2,
        collidingRecordCount: 3
      }
    ])
    mockOrganisationsRepository.findRegistrationById.mockRejectedValue(
      new Error('Organisation with id org-missing not found')
    )

    await runRowIdCollisionDiagnostic(mockServer)

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Waste-balance row-id collision affected registration (lookup failed): organisationId=org-missing registrationId=reg-X collidingRowIds=2 collidingRecordCount=3 lookupError="Organisation with id org-missing not found"'
    })
  })

  it('releases the lock and logs an error when the aggregation throws', async () => {
    const error = new Error('aggregate exploded')
    mockAggregate.mockImplementation(() => {
      throw error
    })

    await runRowIdCollisionDiagnostic(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run row-id collision diagnostic'
    })
    expect(mockLock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    mockServer.locker.lock.mockRejectedValue(error)

    await runRowIdCollisionDiagnostic(mockServer)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run row-id collision diagnostic'
    })
  })
})
