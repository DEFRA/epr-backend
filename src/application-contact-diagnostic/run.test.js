import { logger } from '#common/helpers/logging/logger.js'
import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { partialMock } from '#test/type-helpers.js'

import { runApplicationContactDiagnostic } from './run.js'

/** @import { Lock } from 'mongo-locks' */
/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn()
}))

describe('runApplicationContactDiagnostic', () => {
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
    await runApplicationContactDiagnostic(server)

    expect(server.locker.lock).toHaveBeenCalledWith(
      'application-contact-diagnostic'
    )
    expect(lock.free).toHaveBeenCalled()
  })

  it('skips the run when the lock is held by another instance', async () => {
    vi.mocked(server.locker.lock).mockResolvedValue(null)

    await runApplicationContactDiagnostic(server)

    expect(createOrganisationsRepository).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping application contact diagnostic'
    })
  })

  it('logs each registration without an application contact and the summary', async () => {
    const { applicationContactDetails: _, ...registration } = buildRegistration(
      {
        registrationNumber: 'R26ER5001180041PL',
        statusHistory: [
          { status: 'created', updatedAt: new Date('2026-01-02T09:00:00Z') }
        ]
      }
    )
    const organisation = buildOrganisation({
      schemaVersion: 2,
      registrations: [registration, buildRegistration()]
    })
    storeOrganisations([partialMock(organisation)])

    await runApplicationContactDiagnostic(server)

    expect(vi.mocked(logger.info).mock.calls).toStrictEqual([
      [
        {
          message: `Registration missing application contact: organisationId=${organisation.id} orgId=${organisation.orgId} testOrganisation=false schemaVersion=2 registrationId=${registration.id} registrationNumber=R26ER5001180041PL status=created`
        }
      ],
      [
        {
          message:
            'Application contact diagnostic: scannedOrganisations=1 scannedRegistrations=2 missingApplicationContact=1 missingWithRegistrationNumber=1'
        }
      ]
    ])
  })

  it('logs "none" for a registration without a number', async () => {
    const { applicationContactDetails: _, ...registration } = buildRegistration(
      { registrationNumber: undefined }
    )
    storeOrganisations([
      partialMock(buildOrganisation({ registrations: [registration] }))
    ])

    await runApplicationContactDiagnostic(server)

    expect(logger.info).toHaveBeenCalledWith({
      message: expect.stringContaining('registrationNumber=none')
    })
  })

  it('releases the lock and logs an error when reading the organisations fails', async () => {
    const error = new Error('mongo unavailable')
    vi.mocked(createOrganisationsRepository).mockRejectedValue(error)

    await runApplicationContactDiagnostic(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run application contact diagnostic'
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    vi.mocked(server.locker.lock).mockRejectedValue(error)

    await runApplicationContactDiagnostic(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run application contact diagnostic'
    })
  })
})
