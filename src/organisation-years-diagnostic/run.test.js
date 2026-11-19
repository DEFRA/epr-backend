import { logger } from '#common/helpers/logging/logger.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'
import {
  approvedStatusFrom,
  buildReadOrganisation,
  buildReadReprocessorRegistration
} from '#organisation-read-model/test-support.js'
import { partialMock } from '#test/type-helpers.js'

import { runOrganisationYearsDiagnostic } from './run.js'

/** @import { Lock } from 'mongo-locks' */
/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { Organisation } from '#organisation-read-model/vocabulary.js' */

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

describe('runOrganisationYearsDiagnostic', () => {
  /** @type {StartedServer} */
  let server
  /** @type {Lock} */
  let lock
  const findAll = vi.fn()

  /** @param {Organisation[]} organisations */
  const serveOrganisations = (organisations) =>
    findAll.mockResolvedValue(organisations)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ now: new Date('2026-11-19T12:00:00.000Z') })

    lock = partialMock({ free: vi.fn().mockResolvedValue(true) })
    server = partialMock({
      app: partialMock({
        organisationReadRepository: partialMock({ findAll })
      }),
      locker: partialMock({ lock: vi.fn().mockResolvedValue(lock) })
    })

    serveOrganisations([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('acquires a lock scoped to the diagnostic and releases it afterwards', async () => {
    await runOrganisationYearsDiagnostic(server)

    expect(server.locker.lock).toHaveBeenCalledWith(
      'organisation-years-diagnostic'
    )
    expect(lock.free).toHaveBeenCalled()
  })

  it('skips the run when the lock is held by another instance', async () => {
    vi.mocked(server.locker.lock).mockResolvedValue(null)

    await runOrganisationYearsDiagnostic(server)

    expect(findAll).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping organisation years diagnostic'
    })
  })

  it('logs one line per organisation with another year plus the summary', async () => {
    const earlier = buildReadOrganisation({
      registrations: {
        [toRegistrationNumber('R1')]: buildReadReprocessorRegistration({
          status: approvedStatusFrom('2025-11-01')
        })
      }
    })
    const current = buildReadOrganisation({
      registrations: {
        [toRegistrationNumber('R2')]: buildReadReprocessorRegistration({
          status: approvedStatusFrom('2026-02-01')
        })
      }
    })
    serveOrganisations([earlier, current])

    await runOrganisationYearsDiagnostic(server)

    expect(logger.info).toHaveBeenCalledWith({
      message: `Organisation years: organisationNumber=${earlier.organisationNumber} testOrganisation=false years=2026,2025 registrations=R1|approved|2025-11-01T00:00:00.000Z|2025,2026`
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Organisation years diagnostic: openYear=2026 scannedOrganisations=2 organisationsWithOtherYears=1 otherYearsInTestOrganisations=0 organisationsWithNoYear=0 organisationsByYear=2025:1,2026:2'
    })
  })

  it('logs none when no organisation has a year', async () => {
    await runOrganisationYearsDiagnostic(server)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Organisation years diagnostic: openYear=2026 scannedOrganisations=0 organisationsWithOtherYears=0 otherYearsInTestOrganisations=0 organisationsWithNoYear=0 organisationsByYear=none'
    })
  })

  it('releases the lock and logs an error when reading the organisations fails', async () => {
    const error = new Error('mongo unavailable')
    findAll.mockRejectedValue(error)

    await runOrganisationYearsDiagnostic(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run organisation years diagnostic'
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    vi.mocked(server.locker.lock).mockRejectedValue(error)

    await runOrganisationYearsDiagnostic(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run organisation years diagnostic'
    })
  })
})
