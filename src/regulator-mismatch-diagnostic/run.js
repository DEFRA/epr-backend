import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { diagnoseRegulatorMismatch } from '#regulator-mismatch-diagnostic/application/diagnose-regulator-mismatch.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { RegulatorMismatchRow } from '#regulator-mismatch-diagnostic/application/diagnose-regulator-mismatch.js' */

const LOCK_NAME = 'regulator-mismatch-diagnostic'

/** @param {RegulatorMismatchRow} r */
const formatMismatchLine = (r) =>
  [
    'Regulator mismatch:',
    `organisationId=${r.organisationId}`,
    `orgId=${r.orgId}`,
    `testOrganisation=${r.testOrganisation}`,
    `registrationId=${r.registrationId}`,
    `registrationNumber=${r.registrationNumber ?? 'none'}`,
    `registrationStatus=${r.registrationStatus}`,
    `registrationRegulator=${r.registrationRegulator}`,
    `accreditationId=${r.accreditationId}`,
    `accreditationNumber=${r.accreditationNumber ?? 'none'}`,
    `accreditationStatus=${r.accreditationStatus}`,
    `accreditationRegulator=${r.accreditationRegulator}`
  ].join(' ')

/** @param {StartedServer} server */
const runDiagnostic = async (server) => {
  const organisationsRepository = (
    await createOrganisationsRepository(server.db)
  )()

  const { rows, summary } = diagnoseRegulatorMismatch(
    await organisationsRepository.findAll()
  )

  for (const row of rows) {
    logger.info({ message: formatMismatchLine(row) })
  }

  logger.info({
    message: `Regulator mismatch diagnostic: scannedOrganisations=${summary.scannedOrganisations} linkedPairs=${summary.linkedPairs} mismatchedPairs=${summary.mismatchedPairs} mismatchedInTestOrganisations=${summary.mismatchedInTestOrganisations}`
  })
}

/**
 * Read-only startup diagnostic for PAE-2026: sizes the linked
 * registration/accreditation pairs whose regulators differ before the match
 * rule requires them to agree. Removed once the count is known.
 *
 * @param {StartedServer} server
 */
export const runRegulatorMismatchDiagnostic = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping regulator mismatch diagnostic'
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
      message: 'Failed to run regulator mismatch diagnostic'
    })
  }
}
