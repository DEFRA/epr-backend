import { onTestFinished } from 'vitest'

import { config } from '#root/config.js'
import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { findExternalAccreditations } from '#organisation-read-model/repository/mongodb.js'
import {
  ACCREDITATION_NUMBER,
  REPROCESSOR_NUMBER,
  accreditation,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { partialMock } from '#test/type-helpers.js'

import { runPrnSiteAddressDiagnostic } from './run.js'

const { buildOrganisation } = createOrganisationBuilders()

/** @import { Lock } from 'mongo-locks' */
/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn()
}))
vi.mock('#organisation-read-model/repository/mongodb.js', () => ({
  findExternalAccreditations: vi.fn()
}))

describe('runPrnSiteAddressDiagnostic', () => {
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
    vi.mocked(findExternalAccreditations).mockResolvedValue([])
  })

  it('acquires a lock scoped to the diagnostic and releases it afterwards', async () => {
    await runPrnSiteAddressDiagnostic(server)

    expect(server.locker.lock).toHaveBeenCalledWith(
      'prn-site-address-diagnostic'
    )
    expect(lock.free).toHaveBeenCalled()
  })

  it('skips the run when the lock is held by another instance', async () => {
    vi.mocked(server.locker.lock).mockResolvedValue(null)

    await runPrnSiteAddressDiagnostic(server)

    expect(createOrganisationsRepository).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping PRN site address diagnostic'
    })
  })

  it('logs each finding, then the summary', async () => {
    config.set('openNextYear', true)
    onTestFinished(() => config.reset('openNextYear'))
    const differing = accreditation({
      site: { address: { line1: '7', postcode: 'SW2A 0AA' } }
    })
    const withoutSite = accreditation({
      accreditationNumber: 'A27ER5001180114PL',
      validFrom: '2027-01-01',
      site: {}
    })
    const organisation = buildOrganisation({
      registrations: [
        reprocessor({ accreditationId: differing.id }),
        reprocessor({
          registrationNumber: 'R26ER5001180043PL',
          accreditationId: withoutSite.id
        }),
        reprocessor({
          registrationNumber: 'R26ER5001180044PL',
          site: {
            address: {
              fullAddress: '7 Glass processing site London SW2A 0AA'
            }
          }
        })
      ],
      accreditations: [differing, withoutSite]
    })
    storeOrganisations([partialMock(organisation)])

    await runPrnSiteAddressDiagnostic(server)

    expect(findExternalAccreditations).toHaveBeenCalledWith(server.db, [
      expect.objectContaining({
        organisationNumber: organisation.organisationNumber
      })
    ])
    expect(vi.mocked(logger.info).mock.calls).toStrictEqual([
      [
        {
          message: `PRN site address finding: finding=siteDiffers differs=line1 organisationNumber=${organisation.organisationNumber} testOrganisation=false registrationNumber=${REPROCESSOR_NUMBER} accreditationNumber=${ACCREDITATION_NUMBER} year=2026 status=approved`
        }
      ],
      [
        {
          message: `PRN site address finding: finding=noAccreditationSite organisationNumber=${organisation.organisationNumber} testOrganisation=false registrationNumber=R26ER5001180043PL accreditationNumber=A27ER5001180114PL year=2027 status=approved`
        }
      ],
      [
        {
          message: `PRN site address finding: finding=fullAddressOnly organisationNumber=${organisation.organisationNumber} testOrganisation=false registrationNumber=R26ER5001180044PL hasLine1=false hasTown=false hasPostcode=false accreditations=0 heldAccreditations=0`
        }
      ],
      [
        {
          message:
            'PRN site address diagnostic: scannedOrganisations=1 checkedRegistrations=3 fullAddressOnly=1 fullOnlyHeld=0 checkedAccreditations=2 matched=0 siteDiffers=1 siteDiffersLine1=1 siteDiffersPostcode=0 siteDiffersBoth=0 noAccreditationSite=1'
        }
      ]
    ])
  })

  it('releases the lock and logs an error when the repository cannot be created', async () => {
    const error = new Error('mongo unavailable')
    vi.mocked(createOrganisationsRepository).mockRejectedValue(error)

    await runPrnSiteAddressDiagnostic(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run PRN site address diagnostic'
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    vi.mocked(server.locker.lock).mockRejectedValue(error)

    await runPrnSiteAddressDiagnostic(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run PRN site address diagnostic'
    })
  })
})
