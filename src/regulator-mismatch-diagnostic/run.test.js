import { logger } from '#common/helpers/logging/logger.js'
import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { partialMock } from '#test/type-helpers.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'

import { runRegulatorMismatchDiagnostic } from './run.js'

/** @import { Lock } from 'mongo-locks' */
/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn()
}))

describe('runRegulatorMismatchDiagnostic', () => {
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
    await runRegulatorMismatchDiagnostic(server)

    expect(server.locker.lock).toHaveBeenCalledWith(
      'regulator-mismatch-diagnostic'
    )
    expect(lock.free).toHaveBeenCalled()
  })

  it('skips the run when the lock is held by another instance', async () => {
    vi.mocked(server.locker.lock).mockResolvedValue(null)

    await runRegulatorMismatchDiagnostic(server)

    expect(createOrganisationsRepository).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping regulator mismatch diagnostic'
    })
  })

  it('logs one line per mismatched pair plus the summary', async () => {
    const numbered = buildAccreditation({
      submittedToRegulator: 'nrw',
      accreditationNumber: 'A25ER500010PL'
    })
    const unnumbered = buildAccreditation({
      submittedToRegulator: 'sepa',
      accreditationNumber: null
    })
    const first = buildRegistration({
      accreditationId: numbered.id,
      registrationNumber: 'R25ER500010PL'
    })
    const second = buildRegistration({
      accreditationId: unnumbered.id,
      registrationNumber: null
    })
    const organisation = buildOrganisation({
      registrations: [first, second],
      accreditations: [numbered, unnumbered]
    })
    storeOrganisations([partialMock(organisation)])

    await runRegulatorMismatchDiagnostic(server)

    expect(logger.info).toHaveBeenCalledWith({
      message: `Regulator mismatch: organisationId=${organisation.id} orgId=${organisation.orgId} testOrganisation=false registrationId=${first.id} registrationNumber=R25ER500010PL registrationStatus=created registrationRegulator=ea accreditationId=${numbered.id} accreditationNumber=A25ER500010PL accreditationStatus=created accreditationRegulator=nrw`
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: `Regulator mismatch: organisationId=${organisation.id} orgId=${organisation.orgId} testOrganisation=false registrationId=${second.id} registrationNumber=none registrationStatus=created registrationRegulator=ea accreditationId=${unnumbered.id} accreditationNumber=none accreditationStatus=created accreditationRegulator=sepa`
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Regulator mismatch diagnostic: scannedOrganisations=1 linkedPairs=2 mismatchedPairs=2 mismatchedInTestOrganisations=0'
    })
  })

  it('releases the lock and logs an error when reading the organisations fails', async () => {
    const error = new Error('mongo unavailable')
    vi.mocked(createOrganisationsRepository).mockRejectedValue(error)

    await runRegulatorMismatchDiagnostic(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run regulator mismatch diagnostic'
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    vi.mocked(server.locker.lock).mockRejectedValue(error)

    await runRegulatorMismatchDiagnostic(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run regulator mismatch diagnostic'
    })
  })
})
