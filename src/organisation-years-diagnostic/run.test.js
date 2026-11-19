import { logger } from '#common/helpers/logging/logger.js'
import {
  buildInYearAccreditation,
  buildInYearRegistration,
  buildStoredOrganisation
} from '#organisation-years-diagnostic/validity-test-data.js'
import { partialMock } from '#test/type-helpers.js'

import { runOrganisationYearsDiagnostic } from './run.js'

/** @import { Lock } from 'mongo-locks' */
/** @import { StartedServer } from '#common/hapi-types.js' */

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

describe('runOrganisationYearsDiagnostic', () => {
  /** @type {StartedServer} */
  let server
  /** @type {Lock} */
  let lock
  const findAll = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ now: new Date('2026-11-19T12:00:00.000Z') })

    lock = partialMock({ free: vi.fn().mockResolvedValue(true) })
    server = partialMock({
      app: partialMock({
        organisationAdministrationRepository: partialMock({ findAll })
      }),
      locker: partialMock({ lock: vi.fn().mockResolvedValue(lock) })
    })

    findAll.mockResolvedValue([])
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

  it('logs one line per registration and accreditation with a date outside the year plus the summary', async () => {
    findAll.mockResolvedValue([
      buildStoredOrganisation({
        registrations: [
          buildInYearRegistration({ validFrom: '2027-01-01' }),
          buildInYearRegistration({
            id: 'reg-2',
            registrationNumber: null,
            status: 'created',
            validFrom: null
          }),
          buildInYearRegistration({ id: 'reg-3' })
        ],
        accreditations: [
          buildInYearAccreditation({
            status: 'suspended',
            validFrom: '2025-01-01'
          }),
          buildInYearAccreditation({
            id: 'acc-2',
            accreditationNumber: null,
            status: 'created',
            validTo: undefined
          }),
          buildInYearAccreditation({ id: 'acc-3' })
        ]
      })
    ])

    await runOrganisationYearsDiagnostic(server)

    expect(vi.mocked(logger.info).mock.calls).toStrictEqual([
      [
        {
          message:
            'Registration validity outside year: organisationNumber=500001 testOrganisation=false registrationId=reg-1 registrationNumber=R26ER500001PL status=approved validFrom=2027-01-01(after)'
        }
      ],
      [
        {
          message:
            'Registration validity outside year: organisationNumber=500001 testOrganisation=false registrationId=reg-2 registrationNumber=none status=created validFrom=none(empty)'
        }
      ],
      [
        {
          message:
            'Accreditation validity outside year: organisationNumber=500001 testOrganisation=false accreditationId=acc-1 accreditationNumber=A26ER500001PL status=suspended validFrom=2025-01-01(before) validTo=2026-12-31(in-year)'
        }
      ],
      [
        {
          message:
            'Accreditation validity outside year: organisationNumber=500001 testOrganisation=false accreditationId=acc-2 accreditationNumber=none status=created validFrom=2026-01-01(in-year) validTo=none(empty)'
        }
      ],
      [
        {
          message:
            'Validity outside year diagnostic: year=2026 scannedRegistrations=3 registrationsOutsideYear=2 registrationValidFrom=before:0,after:1,empty:1,unparseable:0 scannedAccreditations=3 accreditationsOutsideYear=2 accreditationValidFrom=before:1,after:0,empty:0,unparseable:0 accreditationValidTo=before:0,after:0,empty:1,unparseable:0 rowsInTestOrganisations=0'
        }
      ]
    ])
  })

  it('logs only the summary when every date falls in the year', async () => {
    await runOrganisationYearsDiagnostic(server)

    expect(logger.info).toHaveBeenCalledExactlyOnceWith({
      message:
        'Validity outside year diagnostic: year=2026 scannedRegistrations=0 registrationsOutsideYear=0 registrationValidFrom=before:0,after:0,empty:0,unparseable:0 scannedAccreditations=0 accreditationsOutsideYear=0 accreditationValidFrom=before:0,after:0,empty:0,unparseable:0 accreditationValidTo=before:0,after:0,empty:0,unparseable:0 rowsInTestOrganisations=0'
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
