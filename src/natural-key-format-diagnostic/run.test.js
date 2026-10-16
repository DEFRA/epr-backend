import { logger } from '#common/helpers/logging/logger.js'
import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { partialMock } from '#test/type-helpers.js'

import { runNaturalKeyFormatDiagnostic } from './run.js'

/** @import { Lock } from 'mongo-locks' */
/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn()
}))

describe('runNaturalKeyFormatDiagnostic', () => {
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

    lock = partialMock({ free: vi.fn().mockResolvedValue(true) })
    server = partialMock({
      db: partialMock({}),
      locker: partialMock({ lock: vi.fn().mockResolvedValue(lock) })
    })

    storeOrganisations([])
  })

  it('acquires a lock scoped to the diagnostic and releases it afterwards', async () => {
    await runNaturalKeyFormatDiagnostic(server)

    expect(server.locker.lock).toHaveBeenCalledWith(
      'natural-key-format-diagnostic'
    )
    expect(lock.free).toHaveBeenCalled()
  })

  it('skips the run when the lock is held by another instance', async () => {
    vi.mocked(server.locker.lock).mockResolvedValue(null)

    await runNaturalKeyFormatDiagnostic(server)

    expect(createOrganisationsRepository).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Unable to obtain lock, skipping page URL number format diagnostic'
    })
  })

  it('logs each number in another format, then the summary', async () => {
    const organisation = buildOrganisation({
      accreditations: [],
      registrations: [
        buildRegistration({
          registrationNumber: 'EPR/AB1234CD/R1',
          statusHistory: [
            { status: 'created', updatedAt: '2026-01-01T00:00:00.000Z' },
            { status: 'approved', updatedAt: '2026-01-02T00:00:00.000Z' }
          ]
        })
      ]
    })
    storeOrganisations([partialMock(organisation)])

    await runNaturalKeyFormatDiagnostic(server)

    expect(vi.mocked(logger.info).mock.calls).toStrictEqual([
      [
        {
          message: `Page URL number format mismatch: recordType=registration number="EPR/AB1234CD/R1" breaksUrlSegment=true organisationId=${organisation.id} orgId=${organisation.orgId} testOrganisation=false recordId=${organisation.registrations[0].id} status=approved`
        }
      ],
      [
        {
          message:
            'Page URL number format diagnostic: scannedOrganisations=1 checkedRegistrations=1 checkedAccreditations=0 mismatchedRegistrationNumbers=1 mismatchedAccreditationNumbers=0'
        }
      ]
    ])
  })

  it('releases the lock and logs an error when the repository cannot be created', async () => {
    const error = new Error('mongo unavailable')
    vi.mocked(createOrganisationsRepository).mockRejectedValue(error)

    await runNaturalKeyFormatDiagnostic(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run page URL number format diagnostic'
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    vi.mocked(server.locker.lock).mockRejectedValue(error)

    await runNaturalKeyFormatDiagnostic(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run page URL number format diagnostic'
    })
  })
})
