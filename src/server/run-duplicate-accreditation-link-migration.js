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
      : regs.reduce((latest, r) =>
          new Date(r.formSubmission.time) > new Date(latest.formSubmission.time)
            ? r
            : latest
        )

  return {
    keepId: keepReg.id,
    unlinkIds: regs.filter((r) => r.id !== keepReg.id).map((r) => r.id)
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

  const fixes = []
  let duplicatesFound = 0

  for (const [accreditationId, regs] of accToRegs) {
    if (regs.length < 2) {
      continue
    }

    duplicatesFound += 1
    const regSummary = regs.map(({ id, status }) => ({ id, status }))

    const regSummaryStr = regSummary
      .map((r) => `${r.id}(${r.status})`)
      .join(', ')

    logger.info({
      message: `Duplicate accreditation link: organisationId=${org.id} accreditationId=${accreditationId} registrations=[${regSummaryStr}]`
    })

    const resolution = resolveKeepAndUnlink(regs)

    if (!resolution) {
      logger.warn({
        message: `Duplicate accreditation link skipped (multiple non-created registrations): organisationId=${org.id} accreditationId=${accreditationId} registrations=[${regSummaryStr}]`
      })
      continue
    }

    fixes.push({
      accreditationId,
      registrations: regSummary,
      keepId: resolution.keepId,
      unlinkIds: resolution.unlinkIds
    })
  }

  return { fixes, duplicatesFound }
}

/**
 * Applies fixes to an organisation's registrations by clearing accreditationId
 * from all registrations in unlinkIds. Strips `id` so the result is suitable
 * as the `updates` argument to `repository.replace()`.
 *
 * @param {Organisation} org
 * @param {{accreditationId: string, unlinkIds: string[]}[]} fixes
 * @returns {Omit<Organisation, 'id'>}
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

  const { id: _id, ...orgWithoutId } = org
  return { ...orgWithoutId, registrations: updatedRegistrations }
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
    const { fixes, duplicatesFound } = findFixes(org)

    if (duplicatesFound === 0) {
      continue
    }

    totalDuplicateAccreditations += duplicatesFound

    if (isDryRun) {
      const fixSummary = fixes
        .map(
          (f) =>
            `accreditationId=${f.accreditationId} keep=${f.keepId} unlink=[${f.unlinkIds.join(',')}]`
        )
        .join('; ')
      logger.info({
        message: `Dry run — would fix duplicate accreditation links: organisationId=${org.id} fixes=[${fixSummary}]`
      })
      continue
    }

    if (fixes.length === 0) {
      continue
    }

    try {
      const updatedOrg = applyFixes(org, fixes)
      await organisationsRepository.replace(org.id, org.version, updatedOrg)
      await auditDuplicateAccreditationLinkMigration(
        systemLogsRepository,
        org.id,
        org,
        updatedOrg
      )

      totalOrgsUpdated += 1
    } catch (error) {
      totalOrgsFailed += 1
      logger.error({
        message: `Failed to fix duplicate accreditation links for organisation: organisationId=${org.id}`,
        err: error
      })
    }
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
