import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createReportsRepository } from '#reports/repository/mongodb.js'
import { createAndSubmitReport } from '#reports/repository/contract/test-data.js'
import { partialMock } from '#test/type-helpers.js'

import { runCancelledAccreditationReportsDiagnostic } from './run.js'

/** @import { Lock } from 'mongo-locks' */
/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn()
}))
vi.mock('#reports/repository/mongodb.js', () => ({
  createReportsRepository: vi.fn()
}))

describe('runCancelledAccreditationReportsDiagnostic', () => {
  /** @type {StartedServer} */
  let server
  /** @type {Lock} */
  let lock
  /** @type {ReturnType<typeof createInMemoryReportsRepository>} */
  let reportsRepositoryFactory

  /** @param {Organisation[]} organisations */
  const storeOrganisations = (organisations) =>
    vi
      .mocked(createOrganisationsRepository)
      .mockResolvedValue(createInMemoryOrganisationsRepository(organisations))

  beforeEach(() => {
    vi.clearAllMocks()

    lock = partialMock({ free: vi.fn().mockResolvedValue(true) })
    server = partialMock({
      db: partialMock({}),
      locker: partialMock({ lock: vi.fn().mockResolvedValue(lock) })
    })

    storeOrganisations([])
    reportsRepositoryFactory = createInMemoryReportsRepository()
    vi.mocked(createReportsRepository).mockResolvedValue(
      reportsRepositoryFactory
    )
  })

  it('acquires a lock scoped to the diagnostic and releases it afterwards', async () => {
    await runCancelledAccreditationReportsDiagnostic(server)

    expect(server.locker.lock).toHaveBeenCalledWith(
      'cancelled-accreditation-reports-diagnostic'
    )
    expect(lock.free).toHaveBeenCalled()
  })

  it('skips the run when the lock is held by another instance', async () => {
    vi.mocked(server.locker.lock).mockResolvedValue(null)

    await runCancelledAccreditationReportsDiagnostic(server)

    expect(createOrganisationsRepository).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Unable to obtain lock, skipping cancelled accreditation reports diagnostic'
    })
  })

  it('logs each cancelled accreditation, each of its reports and the summary', async () => {
    const accreditation = buildAccreditation({
      status: 'cancelled',
      accreditationNumber: 'A26RE000001PA',
      material: 'paper',
      statusHistory: [
        { status: 'approved', updatedAt: new Date('2026-01-05T09:00:00.000Z') },
        { status: 'cancelled', updatedAt: new Date('2026-08-14T10:30:00.000Z') }
      ]
    })
    const registration = buildRegistration({
      accreditationId: accreditation.id
    })
    const organisation = buildOrganisation({
      registrations: [registration],
      accreditations: [accreditation]
    })
    storeOrganisations([partialMock(organisation)])
    await createAndSubmitReport(reportsRepositoryFactory(), {
      organisationId: organisation.id,
      registrationId: registration.id,
      year: 2026,
      cadence: 'monthly',
      period: 3
    })

    await runCancelledAccreditationReportsDiagnostic(server)

    expect(vi.mocked(logger.info).mock.calls).toStrictEqual([
      [
        {
          message: `Cancelled accreditation: organisationId=${organisation.id} orgId=${organisation.orgId} testOrganisation=false accreditationId=${accreditation.id} accreditationNumber=A26RE000001PA material=paper cancelledAt=2026-08-14T10:30:00.000Z linkedRegistrations=1 reports=1 monthlyReports=1 quarterlyReports=0`
        }
      ],
      [
        {
          message: `Cancelled accreditation report: organisationId=${organisation.id} accreditationId=${accreditation.id} registrationId=${registration.id} cadence=monthly year=2026 period=3 submissionNumber=1 status=submitted`
        }
      ],
      [
        {
          message:
            'Cancelled accreditation reports diagnostic: scannedOrganisations=1 scannedAccreditations=1 cancelledAccreditations=1 reports=1'
        }
      ]
    ])
  })

  it('logs "none" for a missing accreditation number and cancellation date', async () => {
    const accreditation = buildAccreditation({
      status: 'cancelled',
      accreditationNumber: undefined,
      statusHistory: [
        { status: 'created', updatedAt: new Date('2026-01-02T09:00:00.000Z') }
      ]
    })
    const organisation = buildOrganisation({
      registrations: [],
      accreditations: [accreditation]
    })
    // The repositories derive status from the history, so only a raw read
    // can hold a cancelled accreditation whose history never says so.
    vi.mocked(createOrganisationsRepository).mockResolvedValue(() =>
      partialMock({ findAll: async () => [partialMock(organisation)] })
    )

    await runCancelledAccreditationReportsDiagnostic(server)

    expect(logger.info).toHaveBeenCalledWith({
      message: expect.stringContaining(
        'accreditationNumber=none material=glass cancelledAt=none linkedRegistrations=0 reports=0'
      )
    })
  })

  it('releases the lock and logs an error when reading the organisations fails', async () => {
    const error = new Error('mongo unavailable')
    vi.mocked(createOrganisationsRepository).mockRejectedValue(error)

    await runCancelledAccreditationReportsDiagnostic(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run cancelled accreditation reports diagnostic'
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    vi.mocked(server.locker.lock).mockRejectedValue(error)

    await runCancelledAccreditationReportsDiagnostic(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run cancelled accreditation reports diagnostic'
    })
  })
})
