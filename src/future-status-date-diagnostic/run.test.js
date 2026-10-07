import { logger } from '#common/helpers/logging/logger.js'
import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { partialMock } from '#test/type-helpers.js'

import { runFutureStatusDateDiagnostic } from './run.js'

/** @import { Lock } from 'mongo-locks' */
/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn()
}))

describe('runFutureStatusDateDiagnostic', () => {
  /** @type {StartedServer} */
  let server
  /** @type {Lock} */
  let lock

  /** @param {Organisation[]} organisations */
  const storeOrganisations = (organisations) =>
    vi
      .mocked(createOrganisationsRepository)
      .mockResolvedValue(createInMemoryOrganisationsRepository(organisations))

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-07T12:00:00.000Z'))

    lock = partialMock({ free: vi.fn().mockResolvedValue(true) })
    server = partialMock({
      db: partialMock({}),
      locker: partialMock({ lock: vi.fn().mockResolvedValue(lock) })
    })

    storeOrganisations([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('acquires a lock scoped to the diagnostic and releases it afterwards', async () => {
    await runFutureStatusDateDiagnostic(server)

    expect(server.locker.lock).toHaveBeenCalledWith(
      'future-status-date-diagnostic'
    )
    expect(lock.free).toHaveBeenCalled()
  })

  it('skips the run when the lock is held by another instance', async () => {
    vi.mocked(server.locker.lock).mockResolvedValue(null)

    await runFutureStatusDateDiagnostic(server)

    expect(createOrganisationsRepository).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping future status date diagnostic'
    })
  })

  it('logs each future-dated entry and the summary', async () => {
    const registration = buildRegistration({
      statusHistory: [
        { status: 'created', updatedAt: new Date('2026-01-01T00:00:00Z') },
        { status: 'approved', updatedAt: new Date('2027-01-01T00:00:00Z') }
      ]
    })
    const organisation = buildOrganisation({
      registrations: [registration],
      accreditations: []
    })
    storeOrganisations([partialMock(organisation)])

    await runFutureStatusDateDiagnostic(server)

    expect(vi.mocked(logger.info).mock.calls).toStrictEqual([
      [
        {
          message: `Future-dated status history entry: organisationId=${organisation.id} orgId=${organisation.orgId} testOrganisation=false itemType=registration itemId=${registration.id} status=approved updatedAt=2027-01-01T00:00:00.000Z`
        }
      ],
      [
        {
          message:
            'Future status date diagnostic: scannedOrganisations=1 scannedEntries=3 futureDatedEntries=1'
        }
      ],
      [
        {
          message:
            'Approved accreditation year diagnostic: year=2026 scannedApproved=0 outsideYear=0'
        }
      ]
    ])
  })

  it('logs each approved accreditation valid from another year', async () => {
    const accreditation = buildAccreditation({
      accreditationNumber: 'ACC12345',
      validFrom: '2025-01-01',
      statusHistory: [
        { status: 'created', updatedAt: new Date('2025-01-01T00:00:00Z') },
        { status: 'approved', updatedAt: new Date('2025-02-01T00:00:00Z') }
      ]
    })
    const organisation = buildOrganisation({
      registrations: [],
      accreditations: [accreditation]
    })
    storeOrganisations([partialMock(organisation)])

    await runFutureStatusDateDiagnostic(server)

    expect(logger.info).toHaveBeenCalledWith({
      message: `Approved accreditation outside year: organisationId=${organisation.id} orgId=${organisation.orgId} testOrganisation=false accreditationId=${accreditation.id} accreditationNumber=ACC12345 validFrom=2025-01-01`
    })
  })

  it('releases the lock and logs an error when reading the organisations fails', async () => {
    const error = new Error('mongo unavailable')
    vi.mocked(createOrganisationsRepository).mockRejectedValue(error)

    await runFutureStatusDateDiagnostic(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run future status date diagnostic'
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    vi.mocked(server.locker.lock).mockRejectedValue(error)

    await runFutureStatusDateDiagnostic(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run future status date diagnostic'
    })
  })
})
