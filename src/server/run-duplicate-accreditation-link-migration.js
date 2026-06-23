import { logger } from '#common/helpers/logging/logger.js'
import { auditDuplicateAccreditationLinkMigration } from '#auditing/duplicate-accreditation-link-migration.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { createSystemLogsRepository } from '#repositories/system-logs/mongodb.js'
import { REG_ACC_STATUS } from '#domain/organisations/model.js'

/** @import {Organisation} from '#domain/organisations/model.js' */

const LOCK_NAME = 'duplicate-accreditation-link-migration'

/**
 * For a given set of registrations sharing the same accreditationId, determine
 * which one to keep linked and which to unlink.
 *
 * Rules:
 * - If more than one registration is in a non-created status, return null (skip with warning).
 * - If exactly one is non-created, keep that one.
 * - If all are created, keep the one with the latest formSubmission.time.
 *
 * @param {{id: string, status: string, formSubmission: {time: Date}}[]} regs
 * @returns {{keepId: string, unlinkIds: string[]} | null}
 */
const resolveKeepAndUnlink = (regs) => {
  const nonCreated = regs.filter((r) => r.status !== REG_ACC_STATUS.CREATED)

  if (nonCreated.length > 1) {
    return null
  }

  const keepReg =
    nonCreated.length === 1
      ? nonCreated[0]
      : regs.reduce(
          (latest, r) =>
            new Date(r.formSubmission.time) >
            new Date(latest.formSubmission.time)
              ? r
              : latest,
          regs[0]
        )

  return {
    keepId: keepReg.id,
    unlinkIds: regs.filter((r) => r.id !== keepReg.id).map((r) => r.id)
  }
}

/**
 * Groups an organisation's registrations by accreditationId, ignoring
 * registrations that aren't linked to an accreditation.
 *
 * @param {Organisation} org
 * @returns {Map<string, {id: string, status: string, formSubmission: {time: Date}}[]>}
 */
const groupRegistrationsByAccreditation = (org) => {
  /** @type {Map<string, {id: string, status: string, formSubmission: {time: Date}}[]>} */
  const accToRegs = new Map()

  for (const reg of org.registrations) {
    if (!reg.accreditationId) {
      continue
    }
    const existing = accToRegs.get(reg.accreditationId) ?? []
    existing.push({
      id: reg.id,
      status: reg.status,
      formSubmission: reg.formSubmission
    })
    accToRegs.set(reg.accreditationId, existing)
  }

  return accToRegs
}

/**
 * Builds a fix for one accreditation's set of linked registrations, logging
 * the duplicate and, if ambiguous, a warning. Returns null when there is
 * nothing to fix (skipped due to ambiguity).
 *
 * @param {string} organisationId
 * @param {string} accreditationId
 * @param {{id: string, status: string, formSubmission: {time: Date}}[]} regs
 * @returns {{
 *   accreditationId: string,
 *   registrations: {id: string, status: string}[],
 *   keepId: string,
 *   unlinkIds: string[]
 * } | null}
 */
const buildFixForAccreditation = (organisationId, accreditationId, regs) => {
  const regSummary = regs.map(({ id, status }) => ({ id, status }))
  const regSummaryStr = regSummary.map((r) => `${r.id}(${r.status})`).join(', ')

  logger.info({
    message: `Duplicate accreditation link: organisationId=${organisationId} accreditationId=${accreditationId} registrations=[${regSummaryStr}]`
  })

  const resolution = resolveKeepAndUnlink(regs)

  if (!resolution) {
    logger.warn({
      message: `Duplicate accreditation link skipped (multiple non-created registrations): organisationId=${organisationId} accreditationId=${accreditationId} registrations=[${regSummaryStr}]`
    })
    return null
  }

  return {
    accreditationId,
    registrations: regSummary,
    keepId: resolution.keepId,
    unlinkIds: resolution.unlinkIds
  }
}

/**
 * Analyses one organisation for accreditations linked to multiple registrations.
 * Returns fixes to apply and the total count of duplicate accreditations found
 * (including those skipped due to ambiguity).
 *
 * @param {Organisation} org
 * @returns {{
 *   fixes: {
 *     accreditationId: string,
 *     registrations: {id: string, status: string}[],
 *     keepId: string,
 *     unlinkIds: string[]
 *   }[],
 *   duplicatesFound: number
 * }}
 */
const findFixes = (org) => {
  const accToRegs = groupRegistrationsByAccreditation(org)

  const duplicateEntries = [...accToRegs].filter(([, regs]) => regs.length >= 2)

  const fixes = duplicateEntries
    .map(([accreditationId, regs]) =>
      buildFixForAccreditation(org.id, accreditationId, regs)
    )
    .filter((fix) => fix !== null)

  return { fixes, duplicatesFound: duplicateEntries.length }
}

/**
 * Applies fixes to an organisation's registrations by clearing accreditationId
 * from all registrations in unlinkIds.
 *
 * @param {Organisation} org
 * @param {{accreditationId: string, unlinkIds: string[]}[]} fixes
 * @returns {Organisation}
 */
const applyFixes = (org, fixes) => {
  const unlinkSet = new Set(fixes.flatMap((f) => f.unlinkIds))

  const updatedRegistrations = org.registrations.map((reg) => {
    if (!unlinkSet.has(reg.id)) {
      return reg
    }
    const { accreditationId: _removed, ...rest } = reg
    return rest
  })

  return { ...org, registrations: updatedRegistrations }
}

/**
 * Logs the fixes that would be applied to an organisation without writing
 * anything, for dry-run mode.
 *
 * @param {Organisation} org
 * @param {{accreditationId: string, keepId: string, unlinkIds: string[]}[]} fixes
 */
const logDryRunFixes = (org, fixes) => {
  const fixSummary = fixes
    .map(
      (f) =>
        `accreditationId=${f.accreditationId} keep=${f.keepId} unlink=[${f.unlinkIds.join(',')}]`
    )
    .join('; ')
  logger.info({
    message: `Dry run — would fix duplicate accreditation links: organisationId=${org.id} fixes=[${fixSummary}]`
  })
}

/**
 * Analyses and, unless in dry-run mode, applies duplicate accreditation link
 * fixes for a single organisation.
 *
 * @param {object} params
 * @param {import('#repositories/organisations/port.js').OrganisationsRepository} params.organisationsRepository
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} params.systemLogsRepository
 * @param {Organisation} params.org
 * @param {boolean} params.isDryRun
 * @returns {Promise<{duplicatesFound: number, updated: boolean, failed: boolean}>}
 */
const processOrganisation = async ({
  organisationsRepository,
  systemLogsRepository,
  org,
  isDryRun
}) => {
  const { fixes, duplicatesFound } = findFixes(org)

  if (duplicatesFound === 0) {
    return { duplicatesFound, updated: false, failed: false }
  }

  if (isDryRun) {
    logDryRunFixes(org, fixes)
    return { duplicatesFound, updated: false, failed: false }
  }

  if (fixes.length === 0) {
    return { duplicatesFound, updated: false, failed: false }
  }

  try {
    const updatedOrg = applyFixes(org, fixes)
    const { id: _id, ...updates } = updatedOrg
    await organisationsRepository.replace(org.id, org.version, updates)
    await auditDuplicateAccreditationLinkMigration(
      systemLogsRepository,
      org.id,
      org,
      updatedOrg
    )

    return { duplicatesFound, updated: true, failed: false }
  } catch (error) {
    logger.error({
      message: `Failed to fix duplicate accreditation links for organisation: organisationId=${org.id}`,
      err: error
    })
    return { duplicatesFound, updated: false, failed: true }
  }
}

/**
 * @param {object} server
 * @param {boolean} isDryRun
 */
const runMigration = async (server, isDryRun) => {
  const organisationsRepository = (
    await createOrganisationsRepository(server.db)
  )()
  const systemLogsRepository = (await createSystemLogsRepository(server.db))(
    logger
  )

  const organisations = await organisationsRepository.findAll()

  let totalDuplicateAccreditations = 0
  let totalOrgsUpdated = 0
  let totalOrgsFailed = 0

  for (const org of organisations) {
    const result = await processOrganisation({
      organisationsRepository,
      systemLogsRepository,
      org,
      isDryRun
    })

    totalDuplicateAccreditations += result.duplicatesFound
    totalOrgsUpdated += result.updated ? 1 : 0
    totalOrgsFailed += result.failed ? 1 : 0
  }

  logger.info({
    message: `Duplicate accreditation link migration complete: isDryRun=${isDryRun} totalDuplicateAccreditations=${totalDuplicateAccreditations} totalOrgsUpdated=${totalOrgsUpdated} totalOrgsFailed=${totalOrgsFailed}`
  })
}

/**
 * Startup migration that removes duplicate accreditation links from organisation
 * registrations. Runs under a distributed lock so only one pod executes it per
 * deploy.
 *
 * When the feature flag is disabled the migration runs in dry-run mode: it logs
 * everything it would do but makes no database changes.
 *
 * @param {object} server - Hapi server instance
 */
export const runDuplicateAccreditationLinkMigration = async (server) => {
  const isDryRun =
    !server.featureFlags.isFixDuplicateAccreditationLinksEnabled()

  try {
    logger.info({
      message: `Starting duplicate accreditation link migration: isDryRun=${isDryRun}`
    })

    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message:
          'Unable to obtain lock, skipping duplicate accreditation link migration'
      })
      return
    }

    try {
      await runMigration(server, isDryRun)
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({
      message: 'Failed to run duplicate accreditation link migration',
      err: error
    })
  }
}
