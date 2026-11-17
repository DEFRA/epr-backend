import { safeAudit, SYSTEM_USER } from '#auditing/helpers.js'

import { RECORD_KINDS } from '../mongodb.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */
/** @import { Citation, CitingKind, Ledger, RecordCounts, SourceIds, TestOrganisationRecords, UnnumberedSummaryLogs } from '../mongodb.js' */

export const REMOVAL_ACTION = 'test-organisation-data-removal'

/**
 * @typedef {Object} RemovedLedger
 * @property {Ledger} ledger
 * @property {RecordCounts} counts - its records by kind
 * @property {SourceIds} sources - its summary logs and PRNs
 */

/**
 * @typedef {Object} RemovedUnnumberedSummaryLogs
 * @property {OrganisationNumber} organisationNumber
 * @property {string} organisationId
 * @property {string[]} summaryLogIds
 * @property {number} removed - how many of them were removed (would be, on a dry run)
 */

/**
 * What was removed, and from where: a ledger, or an organisation's summary
 * logs under its database id.
 *
 * @typedef {(Ledger & SourceIds & { removed: RecordCounts })
 *   | (UnnumberedSummaryLogs & {
 *       organisationNumber: OrganisationNumber
 *       removed: { summaryLogs: number }
 *     })} RemovalAuditContext
 */

/**
 * @typedef {Object} RemovalResult
 * @property {RemovedLedger[]} removed - each ledger removed (would be, on a dry run)
 * @property {RemovedUnnumberedSummaryLogs[]} unnumbered - each organisation's summary logs removed from under its database id (would be, on a dry run)
 * @property {number} skipped - organisations left whole, because a record the removal keeps cites one they would remove
 * @property {number} failed - organisations, ledgers or unnumbered summary logs not fully removed; retried on the next run
 * @property {number} auditFailed - ledgers or unnumbered summary logs removed but not audited
 */

/**
 * @typedef {Object} Holdings
 * @property {OrganisationNumber} organisationNumber
 * @property {Ledger[]} ledgers
 * @property {UnnumberedSummaryLogs | undefined} unnumbered
 */

/**
 * @typedef {Object} Dependencies
 * @property {Iterable<OrganisationNumber>} testOrganisationNumbers
 * @property {TestOrganisationRecords} records
 * @property {Pick<SystemLogsRepository, 'insert'>} systemLogsRepository
 * @property {TypedLogger} logger
 */

/** @param {Partial<Ledger>} ledger - partial for a citing record, which may hold no numbers */
export const describeLedger = ({
  organisationNumber,
  registrationNumber,
  accreditationNumber,
  year
}) =>
  `organisationNumber=${organisationNumber} registrationNumber=${registrationNumber} accreditationNumber=${accreditationNumber === undefined ? 'absent' : accreditationNumber} year=${year}`

/** @param {Record<string, number>} counts */
export const describeCounts = (counts) =>
  Object.entries(counts)
    .map(([kind, count]) => `${kind}=${count}`)
    .join(' ')

/** @param {Citation[]} citations */
const describeCitations = (citations) => {
  /** @type {Record<CitingKind, number>} */
  const counts = { events: 0, rowStates: 0, reports: 0 }
  for (const { kind } of citations) {
    counts[kind]++
  }
  const each = citations.map(
    ({ kind, id, ...numbers }) =>
      `; ${kind} id=${id} ${describeLedger(numbers)}`
  )
  return `${describeCounts(counts)}${each.join('')}`
}

/** @returns {RecordCounts} */
const noRecords = () => ({
  events: 0,
  rowStates: 0,
  reports: 0,
  prns: 0,
  summaryLogs: 0
})

/** @param {Record<string, number>} counts */
const holdsAny = (counts) => Object.values(counts).some((count) => count > 0)

/**
 * @param {Dependencies} dependencies
 * @param {RemovalAuditContext} context
 * @param {string} description - of what was removed, for the log
 * @param {RemovalResult} result
 */
const auditRemoval = async (
  { systemLogsRepository, logger },
  context,
  description,
  result
) => {
  const payload = {
    event: {
      category: 'waste-reporting',
      subCategory: 'test-organisation-data',
      action: REMOVAL_ACTION
    },
    context,
    user: SYSTEM_USER
  }

  safeAudit(payload)

  try {
    await systemLogsRepository.insert({
      createdAt: new Date(),
      createdBy: SYSTEM_USER,
      event: payload.event,
      context: payload.context
    })
  } catch (auditError) {
    logger.error({
      err: auditError,
      message: `Removed but failed to audit ${description}`
    })
    result.auditFailed++
  }
}

/**
 * Counts, or removes, a ledger's records kind by kind. A removal that fails
 * still returns what it removed, so that it can be audited.
 *
 * @param {TestOrganisationRecords} records
 * @param {Ledger} ledger
 * @param {boolean} isDryRun
 * @returns {Promise<{ counts: RecordCounts, error?: Error }>}
 */
const clearLedger = async (records, ledger, isDryRun) => {
  const counts = noRecords()
  try {
    for (const kind of RECORD_KINDS) {
      counts[kind] = isDryRun
        ? await records.count(kind, ledger) // NOSONAR(javascript:S9382) one kind at a time, derived records first
        : await records.remove(kind, ledger) // NOSONAR(javascript:S9382) one kind at a time, derived records first
    }
    return { counts }
  } catch (error) {
    return { counts, error }
  }
}

/**
 * @param {Dependencies} dependencies
 * @param {Ledger} ledger
 * @param {boolean} isDryRun
 * @param {RemovalResult} result
 */
const removeLedger = async (dependencies, ledger, isDryRun, result) => {
  const { records, logger } = dependencies
  /** @param {Error} cause */
  const fail = (cause) => {
    logger.error({
      err: cause,
      message: `Failed to remove test organisation ledger ${describeLedger(ledger)}`
    })
    result.failed++
  }
  let sources
  try {
    sources = await records.findSourceIds(ledger)
  } catch (sourcesError) {
    fail(sourcesError)
    return
  }
  const { counts, error } = await clearLedger(records, ledger, isDryRun)
  if (error) {
    fail(error)
  }
  if (!holdsAny(counts)) {
    return
  }
  const removedLedger = { ledger, counts, sources }
  result.removed.push(removedLedger)
  if (isDryRun) {
    return
  }
  await auditRemoval(
    dependencies,
    { ...ledger, removed: counts, ...sources },
    `test organisation ledger ${describeLedger(ledger)}`,
    result
  )
}

/**
 * @param {Dependencies} dependencies
 * @param {OrganisationNumber} organisationNumber
 * @param {UnnumberedSummaryLogs} unnumbered
 * @param {boolean} isDryRun
 * @param {RemovalResult} result
 */
const removeUnnumberedSummaryLogs = async (
  dependencies,
  organisationNumber,
  { organisationId, summaryLogIds },
  isDryRun,
  result
) => {
  const description = `test organisation ${organisationNumber}'s summary logs under organisationId=${organisationId}`
  let removed
  try {
    removed = isDryRun
      ? summaryLogIds.length
      : await dependencies.records.removeUnnumberedSummaryLogs(summaryLogIds)
  } catch (error) {
    dependencies.logger.error({
      err: error,
      message: `Failed to remove ${description}`
    })
    result.failed++
    return
  }
  result.unnumbered.push({
    organisationNumber,
    organisationId,
    summaryLogIds,
    removed
  })
  if (isDryRun) {
    return
  }
  await auditRemoval(
    dependencies,
    {
      organisationNumber,
      organisationId,
      removed: { summaryLogs: removed },
      summaryLogIds
    },
    description,
    result
  )
}

/**
 * @param {Dependencies} dependencies
 * @param {RemovalResult} result
 * @returns {Promise<Holdings[]>} each test organisation that holds any records
 */
const findHoldings = async (
  { testOrganisationNumbers, records, logger },
  result
) => {
  /** @type {Holdings[]} */
  const holdings = []
  for (const organisationNumber of testOrganisationNumbers) {
    try {
      const ledgers = await records.findLedgers(organisationNumber) // NOSONAR(javascript:S9382) one organisation at a time, to spare the database
      const unnumbered =
        await records.findUnnumberedSummaryLogs(organisationNumber) // NOSONAR(javascript:S9382) one organisation at a time, to spare the database
      if (ledgers.length > 0 || unnumbered) {
        holdings.push({ organisationNumber, ledgers, unnumbered })
      }
    } catch (error) {
      logger.error({
        err: error,
        message: `Failed to remove the data of test organisation ${organisationNumber}`
      })
      result.failed++
    }
  }
  return holdings
}

/**
 * @param {Dependencies} dependencies
 * @param {Holdings} holdings
 * @param {OrganisationNumber[]} removedOrganisationNumbers
 * @param {RemovalResult} result
 * @returns {Promise<boolean>} whether a record the removal keeps cites one the organisation would remove
 */
const isCited = async (
  { records, logger },
  { organisationNumber, unnumbered },
  removedOrganisationNumbers,
  result
) => {
  try {
    const citations = await records.findCitationsOutside(
      organisationNumber,
      unnumbered?.summaryLogIds ?? [],
      removedOrganisationNumbers
    )
    if (citations.length === 0) {
      return false
    }
    logger.error({
      message: `Skipping test organisation ${organisationNumber}: records the removal keeps cite a summary log or PRN it would remove: ${describeCitations(citations)}`
    })
    result.skipped++
  } catch (error) {
    logger.error({
      err: error,
      message: `Failed to remove the data of test organisation ${organisationNumber}`
    })
    result.failed++
  }
  return true
}

/**
 * Keeps back each organisation that a record the removal keeps cites. A kept
 * organisation's records are kept too, so the check repeats until it keeps
 * back no more.
 *
 * @param {Dependencies} dependencies
 * @param {Holdings[]} holdings
 * @param {RemovalResult} result
 * @returns {Promise<Holdings[]>} the organisations safe to remove
 */
const uncited = async (dependencies, holdings, result) => {
  let removable = holdings
  let keptBack
  do {
    const removedOrganisationNumbers = removable.map(
      ({ organisationNumber }) => organisationNumber
    )
    /** @param {Holdings} organisation */
    const check = (organisation) =>
      isCited(dependencies, organisation, removedOrganisationNumbers, result)
    /** @type {Holdings[]} */
    const next = []
    for (const organisation of removable) {
      const cited = await check(organisation) // NOSONAR(javascript:S9382) one organisation at a time, to spare the database
      if (!cited) {
        next.push(organisation)
      }
    }
    keptBack = next.length < removable.length
    removable = next
  } while (keptBack)
  return removable
}

/**
 * @param {Dependencies} dependencies
 * @param {Holdings} holdings
 * @param {boolean} isDryRun
 * @param {RemovalResult} result
 */
const removeHoldings = async (
  dependencies,
  { organisationNumber, ledgers, unnumbered },
  isDryRun,
  result
) => {
  for (const ledger of ledgers) {
    await removeLedger(dependencies, ledger, isDryRun, result) // NOSONAR(javascript:S9382) one ledger at a time, to spare the database
  }
  if (unnumbered) {
    await removeUnnumberedSummaryLogs(
      dependencies,
      organisationNumber,
      unnumbered,
      isDryRun,
      result
    )
  }
}

/**
 * Removes every record test organisations hold, on every ledger and under
 * their database ids, keeping the organisations themselves, their users and
 * the system logs. Test organisations only, so it never reaches an operator's
 * data.
 *
 * @param {Dependencies} dependencies
 * @param {{ isDryRun: boolean }} options
 * @returns {Promise<RemovalResult>}
 */
export const removeTestOrganisationData = async (
  dependencies,
  { isDryRun }
) => {
  /** @type {RemovalResult} */
  const result = {
    removed: [],
    unnumbered: [],
    skipped: 0,
    failed: 0,
    auditFailed: 0
  }

  const holdings = await findHoldings(dependencies, result)
  const removable = await uncited(dependencies, holdings, result)
  for (const organisation of removable) {
    await removeHoldings(dependencies, organisation, isDryRun, result) // NOSONAR(javascript:S9382) one organisation at a time, to spare the database
  }

  return result
}
