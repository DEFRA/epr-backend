import { logger } from '#common/helpers/logging/logger.js'
import {
  buildAccreditation,
  buildOrganisation
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { partialMock } from '#test/type-helpers.js'

import { runDuplicateNumberDiagnostic } from './run.js'

/** @import { Lock } from 'mongo-locks' */
/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn()
}))

describe('runDuplicateNumberDiagnostic', () => {
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
    await runDuplicateNumberDiagnostic(server)

    expect(server.locker.lock).toHaveBeenCalledWith(
      'duplicate-number-diagnostic'
    )
    expect(lock.free).toHaveBeenCalled()
  })

  it('skips the run when the lock is held by another instance', async () => {
    vi.mocked(server.locker.lock).mockResolvedValue(null)

    await runDuplicateNumberDiagnostic(server)

    expect(createOrganisationsRepository).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping duplicate number diagnostic'
    })
  })

  it('logs each duplicated number with every record holding it, then the summary', async () => {
    const first = buildOrganisation({
      accreditations: [buildAccreditation({ accreditationNumber: 'ACC-1' })],
      registrations: []
    })
    const second = buildOrganisation({
      accreditations: [buildAccreditation({ accreditationNumber: 'ACC-1' })],
      registrations: []
    })
    storeOrganisations([partialMock(first), partialMock(second)])

    await runDuplicateNumberDiagnostic(server)

    const holder = (
      /** @type {ReturnType<typeof buildOrganisation>} */ organisation
    ) =>
      `[number="ACC-1" organisationId=${organisation.id} orgId=${organisation.orgId} testOrganisation=false recordId=${organisation.accreditations[0].id} status=created]`

    expect(vi.mocked(logger.info).mock.calls).toStrictEqual([
      [
        {
          message: `Duplicate accreditation number: number="ACC-1" holders=2 organisationCount=2 ${holder(first)} ${holder(second)}`
        }
      ],
      [
        {
          message:
            'Duplicate number diagnostic: scannedOrganisations=2 numberedAccreditations=2 numberedRegistrations=0 duplicateAccreditationNumbers=1 duplicateRegistrationNumbers=0'
        }
      ]
    ])
  })

  it('releases the lock and logs an error when the repository cannot be created', async () => {
    const error = new Error('mongo unavailable')
    vi.mocked(createOrganisationsRepository).mockRejectedValue(error)

    await runDuplicateNumberDiagnostic(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run duplicate number diagnostic'
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    vi.mocked(server.locker.lock).mockRejectedValue(error)

    await runDuplicateNumberDiagnostic(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run duplicate number diagnostic'
    })
  })
})
