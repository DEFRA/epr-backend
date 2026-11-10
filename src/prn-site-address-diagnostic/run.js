import { logger } from '#common/helpers/logging/logger.js'
import { findExternalAccreditations } from '#organisation-read-model/repository/mongodb.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import {
  SITE_FINDING,
  diagnosePrnSiteAddresses
} from '#prn-site-address-diagnostic/application/diagnose-prn-site-addresses.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { SiteAddressRow, SiteAddressSummary } from '#prn-site-address-diagnostic/application/diagnose-prn-site-addresses.js' */

const LOCK_NAME = 'prn-site-address-diagnostic'

/** @param {SiteAddressRow} row */
const findingLine = (row) =>
  [
    'PRN site address finding:',
    `finding=${row.finding}`,
    ...(row.differs ? [`differs=${row.differs}`] : []),
    `organisationNumber=${row.organisationNumber}`,
    `testOrganisation=${row.testOrganisation}`,
    `registrationNumber=${row.registrationNumber}`,
    ...(row.finding === SITE_FINDING.FULL_ADDRESS_ONLY
      ? [
          `hasLine1=${row.hasLine1}`,
          `hasTown=${row.hasTown}`,
          `hasPostcode=${row.hasPostcode}`,
          `accreditations=${row.accreditations}`,
          `heldAccreditations=${row.heldAccreditations}`
        ]
      : []),
    ...(row.accreditationNumber
      ? [
          `accreditationNumber=${row.accreditationNumber}`,
          `year=${row.year}`,
          `status=${row.status}`
        ]
      : [])
  ].join(' ')

/** @param {SiteAddressSummary} summary */
const summaryLine = (summary) =>
  [
    'PRN site address diagnostic:',
    ...Object.entries(summary).map(([name, count]) => `${name}=${count}`)
  ].join(' ')

/** @param {StartedServer} server */
const runDiagnostic = async (server) => {
  const organisationsRepository = (
    await createOrganisationsRepository(server.db)
  )()

  const organisations = await organisationsRepository.findAll()
  const { rows, summary } = diagnosePrnSiteAddresses(
    organisations,
    await findExternalAccreditations(server.db, organisations),
    new Date().toISOString().slice(0, 10)
  )

  for (const row of rows) {
    logger.info({ message: findingLine(row) })
  }

  logger.info({ message: summaryLine(summary) })
}

/**
 * Read-only startup diagnostic: how far the registration site the read model
 * serves differs from the accreditation site a PRN snapshots today (PAE-2226).
 * Removed once the counts are known.
 *
 * @param {StartedServer} server
 */
export const runPrnSiteAddressDiagnostic = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping PRN site address diagnostic'
      })
      return
    }
    try {
      await runDiagnostic(server)
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to run PRN site address diagnostic'
    })
  }
}
