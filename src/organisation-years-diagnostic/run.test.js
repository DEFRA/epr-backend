import { logger } from '#common/helpers/logging/logger.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import {
  approvedStatusFrom,
  buildReadOrganisation,
  buildReadReprocessorRegistration
} from '#organisation-read-model/repository/read-model-test-data.js'
import { partialMock } from '#test/type-helpers.js'

import { runOrganisationYearsDiagnostic } from './run.js'

/** @import { Lock } from 'mongo-locks' */
/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { Organisation } from '#organisation-read-model/domain/model.js' */

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

describe('runOrganisationYearsDiagnostic', () => {
  /** @type {StartedServer} */
  let server
  /** @type {Lock} */
  let lock
  const findAll = vi.fn()
  const findAllStored = vi.fn()

  /** @param {Organisation[]} organisations */
  const serveOrganisations = (organisations) =>
    findAll.mockResolvedValue(organisations)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ now: new Date('2026-11-19T12:00:00.000Z') })

    lock = partialMock({ free: vi.fn().mockResolvedValue(true) })
    server = partialMock({
      app: partialMock({
        organisationReadRepository: partialMock({ findAll }),
        organisationAdministrationRepository: partialMock({
          findAll: findAllStored
        })
      }),
      locker: partialMock({ lock: vi.fn().mockResolvedValue(lock) })
    })

    serveOrganisations([])
    findAllStored.mockResolvedValue([])
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

  it('logs one line per registration and accreditation valid outside the year plus the summary', async () => {
    findAllStored.mockResolvedValue([
      partialMock({
        organisationNumber: toOrganisationNumber('500001'),
        registrations: [
          {
            id: 'reg-1',
            registrationNumber: toRegistrationNumber('R25ER500001PL'),
            status: 'approved',
            validFrom: '2025-11-01'
          },
          {
            id: 'reg-2',
            registrationNumber: null,
            status: 'created',
            validFrom: '2024-01-01'
          }
        ],
        accreditations: [
          {
            id: 'acc-1',
            accreditationNumber: toAccreditationNumber('A26ER500001PL'),
            status: 'approved',
            validFrom: '2026-01-01',
            validTo: '2027-03-31'
          },
          {
            id: 'acc-3',
            accreditationNumber: toAccreditationNumber('A26ER500002PL'),
            status: 'approved',
            validFrom: '2026-01-01',
            validTo: '2027-01-01'
          },
          {
            id: 'acc-2',
            accreditationNumber: null,
            status: 'created',
            validFrom: '2025-01-01'
          },
          {
            id: 'acc-4',
            accreditationNumber: null,
            status: 'created',
            validTo: '2027-06-30'
          }
        ]
      })
    ])

    await runOrganisationYearsDiagnostic(server)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Registration validity: organisationNumber=500001 testOrganisation=false registrationId=reg-1 registrationNumber=R25ER500001PL status=approved validFrom=2025-11-01'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Registration validity: organisationNumber=500001 testOrganisation=false registrationId=reg-2 registrationNumber=none status=created validFrom=2024-01-01'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Accreditation validity: organisationNumber=500001 testOrganisation=false accreditationId=acc-1 accreditationNumber=A26ER500001PL status=approved validFrom=2026-01-01 validTo=2027-03-31'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Accreditation validity: organisationNumber=500001 testOrganisation=false accreditationId=acc-2 accreditationNumber=none status=created validFrom=2025-01-01 validTo=none'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Accreditation validity: organisationNumber=500001 testOrganisation=false accreditationId=acc-4 accreditationNumber=none status=created validFrom=none validTo=2027-06-30'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Validity diagnostic: year=2026 scannedRegistrations=2 registrationsStartingBefore=2 scannedAccreditations=4 accreditationsStartingBefore=1 accreditationsEndingAfter=2 accreditationsEndingOnFirstJanuary=1 rowsInTestOrganisations=0'
    })
  })

  it('logs a validity summary with nothing outside the year', async () => {
    await runOrganisationYearsDiagnostic(server)

    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Validity diagnostic: year=2026 scannedRegistrations=0 registrationsStartingBefore=0 scannedAccreditations=0 accreditationsStartingBefore=0 accreditationsEndingAfter=0 accreditationsEndingOnFirstJanuary=0 rowsInTestOrganisations=0'
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
