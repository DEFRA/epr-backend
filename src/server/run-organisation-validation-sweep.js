import { logger } from '#common/helpers/logging/logger.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { validateOrganisation } from '#domain/organisations/validation/validate-organisation.js'

/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { ValidationIssue } from '#domain/organisations/validation/issue.js' */

const LOCK_NAME = 'organisation-validation-sweep'

/**
 * @param {Organisation} org
 * @param {ValidationIssue} issue
 */
const formatIssueLine = (org, issue) =>
  [
    'Organisation validation issue:',
    `organisationId=${org.id}`,
    `code=${issue.code}`,
    `severity=${issue.severity}`,
    `targetType=${issue.target.type}`,
    `targetId=${issue.target.id}`,
    `message="${issue.message}"`
  ].join(' ')

/**
 * @param {Object} server - Hapi server instance
 */
const runSweep = async (server) => {
  const repository = (await createOrganisationsRepository(server.db))()
  const organisations = await repository.findAll()

  let scanned = 0
  let flagged = 0
  let issueCount = 0

  for (const org of organisations) {
    scanned += 1
    const issues = validateOrganisation(org)
    if (issues.length === 0) {
      continue
    }
    flagged += 1
    issueCount += issues.length
    for (const issue of issues) {
      logger.warn({ message: formatIssueLine(org, issue) })
    }
  }

  logger.info({
    message: `Organisation validation sweep: scanned=${scanned} flagged=${flagged} issues=${issueCount}`
  })
}

/**
 * One-shot startup diagnostic that validates every organisation as a graph and
 * logs anomalies in its embedded registration/accreditation cross-references —
 * the shapes the per-item Joi schema never checks and that only hand-edited
 * production data reaches. Every issue is logged at warn regardless of its
 * severity classification, followed by a single info summary line.
 *
 * Read-only, safe under live traffic. Runs under a cross-instance lock so a
 * single pod per deploy executes the scan. Loads the whole organisation
 * population with `findAll` — deliberate, and consistent with the reporting and
 * export paths: organisations are a bounded top-level set, unlike the
 * per-transaction waste-balance population the sibling diagnostics stream.
 *
 * @param {Object} server - Hapi server instance
 */
export const runOrganisationValidationSweep = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping organisation validation sweep'
      })
      return
    }
    try {
      await runSweep(server)
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to run organisation validation sweep'
    })
  }
}
