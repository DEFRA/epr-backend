import { safeAudit, SYSTEM_USER } from '#auditing/helpers.js'
import { indexByLedger } from '#waste-balances/application/read-model-accreditations.js'
import { ledgerKey } from '#waste-balances/repository/ledger-schema.js'

import { RECORD_KINDS } from '../mongodb.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */
/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/repository/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */
/** @import { Ledger, RecordCounts, SourceIds, TestOrganisationRecords } from '../mongodb.js' */

export const REMOVAL_ACTION = 'test-organisation-data-removal'

/**
 * @typedef {Object} RemovedLedger
 * @property {Ledger} ledger
 * @property {RecordCounts} counts - its records by kind
 * @property {SourceIds} sources - its summary logs and PRNs
 */

/**
 * @typedef {Object} RemovalResult
 * @property {RemovedLedger[]} removed - each ledger removed (would be, on a dry run)
 * @property {number} undecided - ledgers left because they have no year to judge their accreditation by
 * @property {number} skipped - organisations left whole, because a record they keep cites one they would remove
 * @property {number} failed - organisations or ledgers not fully removed; retried on the next run
 * @property {number} auditFailed - ledgers removed but not audited
 */

/**
 * @typedef {Object} Dependencies
 * @property {Iterable<OrganisationNumber>} testOrganisationNumbers
 * @property {TestOrganisationRecords} records
 * @property {Pick<OrganisationReadRepository, 'findByOrganisationNumber'>} organisationReadRepository
 * @property {Pick<SystemLogsRepository, 'insert'>} systemLogsRepository
 * @property {TypedLogger} logger
 */

/** @param {Ledger} ledger */
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

/** @typedef {'held' | 'invalid' | 'undecided'} Verdict */

const HELD = 'held'
const INVALID = 'invalid'
const UNDECIDED = 'undecided'

/**
 * Judges a ledger against the read model. It is held when the read model
 * holds its registration and, unless it is registered-only, its accreditation
 * for its year. A ledger naming no accreditation at all is invalid. One with
 * no year cannot be judged by year, so is undecided unless its registration
 * alone decides it.
 *
 * @param {Organisation | null} organisation
 * @returns {(ledger: Ledger) => Verdict}
 */
const judgeAgainst = (organisation) => {
  const index = indexByLedger(organisation ? [organisation] : [], {
    includeTestOrganisations: true
  })
  return ({
    organisationNumber,
    registrationNumber,
    accreditationNumber,
    year
  }) => {
    if (
      !organisation ||
      !Object.hasOwn(organisation.registrations, registrationNumber) ||
      accreditationNumber === undefined
    ) {
      return INVALID
    }
    if (accreditationNumber === null) {
      return HELD
    }
    if (year === undefined) {
      return UNDECIDED
    }
    const key = ledgerKey({
      organisationNumber,
      registrationNumber,
      accreditationNumber,
      year
    })
    return index.has(key) ? HELD : INVALID
  }
}

/**
 * @param {Pick<SystemLogsRepository, 'insert'>} systemLogsRepository
 * @param {RemovedLedger} removedLedger
 */
const auditRemoval = async (
  systemLogsRepository,
  { ledger, counts, sources }
) => {
  const payload = {
    event: {
      category: 'waste-reporting',
      subCategory: 'test-organisation-data',
      action: REMOVAL_ACTION
    },
    context: { ...ledger, removed: counts, ...sources },
    user: SYSTEM_USER
  }

  safeAudit(payload)

  await systemLogsRepository.insert({
    createdAt: new Date(),
    createdBy: SYSTEM_USER,
    event: payload.event,
    context: payload.context
  })
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
const removeLedger = async (
  { records, systemLogsRepository, logger },
  ledger,
  isDryRun,
  result
) => {
  const sources = await records.findSourceIds(ledger)
  const { counts, error } = await clearLedger(records, ledger, isDryRun)
  if (error) {
    logger.error({
      err: error,
      message: `Failed to remove test organisation ledger ${describeLedger(ledger)}`
    })
    result.failed++
  }
  if (!holdsAny(counts)) {
    return
  }
  const removedLedger = { ledger, counts, sources }
  result.removed.push(removedLedger)
  if (isDryRun) {
    return
  }
  try {
    await auditRemoval(systemLogsRepository, removedLedger)
  } catch (auditError) {
    logger.error({
      err: auditError,
      message: `Removed but failed to audit test organisation ledger ${describeLedger(ledger)}`
    })
    result.auditFailed++
  }
}

/**
 * @param {Dependencies} dependencies
 * @param {OrganisationNumber} organisationNumber
 * @param {boolean} isDryRun
 * @param {RemovalResult} result
 */
const removeFromOrganisation = async (
  dependencies,
  organisationNumber,
  isDryRun,
  result
) => {
  const { records, organisationReadRepository, logger } = dependencies
  const judge = judgeAgainst(
    await organisationReadRepository.findByOrganisationNumber(
      organisationNumber
    )
  )
  const ledgers = await records.findLedgers(organisationNumber)

  const undecided = ledgers.filter((ledger) => judge(ledger) === UNDECIDED)
  for (const ledger of undecided) {
    logger.warn({
      message: `Leaving test organisation ledger ${describeLedger(ledger)}: it has no year to judge its accreditation by`
    })
  }
  result.undecided += undecided.length

  const invalid = ledgers.filter((ledger) => judge(ledger) === INVALID)
  if (invalid.length === 0) {
    return
  }

  const citations = await records.countCitationsOutside(invalid)
  if (holdsAny(citations)) {
    logger.error({
      message: `Skipping test organisation ${organisationNumber}: kept records citing a summary log or PRN it would remove: ${describeCounts(citations)}`
    })
    result.skipped++
    return
  }

  for (const ledger of invalid) {
    await removeLedger(dependencies, ledger, isDryRun, result) // NOSONAR(javascript:S9382) one ledger at a time, to spare the database
  }
}

/**
 * Removes the records test organisations hold under numbers the organisation
 * read model does not hold for them, with everything stored under those
 * numbers. Test organisations only, so it never reaches an operator's data.
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
    undecided: 0,
    skipped: 0,
    failed: 0,
    auditFailed: 0
  }

  /** @param {OrganisationNumber} organisationNumber */
  const removeFrom = (organisationNumber) =>
    removeFromOrganisation(dependencies, organisationNumber, isDryRun, result)

  for (const organisationNumber of dependencies.testOrganisationNumbers) {
    try {
      await removeFrom(organisationNumber) // NOSONAR(javascript:S9382) one organisation at a time, to spare the database
    } catch (error) {
      dependencies.logger.error({
        err: error,
        message: `Failed to remove the invalid data of test organisation ${organisationNumber}`
      })
      result.failed++
    }
  }

  return result
}
