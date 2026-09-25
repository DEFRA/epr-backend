import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { diagnoseUnsplitGlass } from '#unsplit-glass-diagnostic/application/diagnose-unsplit-glass.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { UnsplitGlassRow } from '#unsplit-glass-diagnostic/application/diagnose-unsplit-glass.js' */

const LOCK_NAME = 'unsplit-glass-diagnostic'

/** @param {UnsplitGlassRow} r */
const formatUnsplitLine = (r) =>
  [
    'Unsplit glass record:',
    `organisationId=${r.organisationId}`,
    `orgId=${r.orgId}`,
    `recordKind=${r.recordKind}`,
    `recordId=${r.recordId}`,
    `status=${r.status}`,
    `number=${r.number ?? 'none'}`,
    `glassRecyclingProcess=${JSON.stringify(r.glassRecyclingProcess)}`
  ].join(' ')

/** @param {StartedServer} server */
const runDiagnostic = async (server) => {
  const organisationsRepository = (
    await createOrganisationsRepository(server.db)
  )()

  const { rows, summary } = diagnoseUnsplitGlass(
    await organisationsRepository.findAll()
  )

  for (const row of rows) {
    logger.info({ message: formatUnsplitLine(row) })
  }

  logger.info({
    message: `Unsplit glass diagnostic: scannedOrganisations=${summary.scannedOrganisations} scannedRegistrations=${summary.scannedRegistrations} scannedAccreditations=${summary.scannedAccreditations} unsplitRegistrations=${summary.unsplitRegistrations} unsplitAccreditations=${summary.unsplitAccreditations}`
  })
}

/**
 * Read-only startup diagnostic for PAE-2003: lists every stored registration
 * and accreditation that applied for glass without carrying exactly one
 * recycling process, so the fix can be sized before regulators find them one
 * page at a time. It writes nothing.
 *
 * It runs on every startup, like the other read-only sweeps, and is removed
 * once the count is known. The Mongo lock keeps a single pod doing the work;
 * any error is caught so it can never crash boot.
 *
 * @param {StartedServer} server - Hapi server instance
 */
export const runUnsplitGlassDiagnostic = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping unsplit glass diagnostic'
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
      message: 'Failed to run unsplit glass diagnostic'
    })
  }
}
