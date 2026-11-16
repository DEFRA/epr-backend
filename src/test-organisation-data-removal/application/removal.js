import { safeAudit, SYSTEM_USER } from '#auditing/helpers.js'
import { indexByLedger } from '#waste-balances/application/read-model-accreditations.js'
import { ledgerKey } from '#waste-balances/repository/ledger-schema.js'

import { RECORD_KINDS } from '../mongodb.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */
/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/repository/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */
/** @import { Ledger, RecordCounts, TestOrganisationRecords } from '../mongodb.js' */

export const REMOVAL_ACTION = 'test-organisation-data-removal'

/**
 * @typedef {Object} RemovalResult
 * @property {{ ledger: Ledger, counts: RecordCounts }[]} removed - each ledger removed (would be, on a dry run), with its records by kind
 * @property {number} skipped - organisations left whole, because a record they keep cites one they would remove
 * @property {number} failed - organisations or ledgers not fully removed; retried on the next run
 * @property {number} auditFailed - ledgers removed but not audited
 */

/**
 * @typedef {Object} Dependencies
 * @property {Iterable<OrganisationNumber>} testOrganisationNumbers
 * @property {TestOrganisationRecords} records
 * @property {Pick<OrganisationReadRepository, 'findByOrganisationNumber'>} organisationReadRepository
 * @property {SystemLogsRepository} systemLogsRepository
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

/** @returns {RecordCounts} */
const noRecords = () => ({
  events: 0,
  rowStates: 0,
  reports: 0,
  prns: 0,
  summaryLogs: 0
})

/** @param {RecordCounts} counts */
const holdsAny = (counts) => Object.values(counts).some((count) => count > 0)

/**
 * Whether the read model holds the registration a ledger names, and, unless
 * the ledger is registered-only, the accreditation it names for its year. A
 * ledger naming no accreditation at all is never held.
 *
 * @param {Organisation | null} organisation
 * @returns {(ledger: Ledger) => boolean}
 */
const heldBy = (organisation) => {
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
      !Object.hasOwn(organisation.registrations, registrationNumber)
    ) {
      return false
    }
    if (accreditationNumber === undefined) {
      return false
    }
    return (
      accreditationNumber === null ||
      index.has(
        ledgerKey({
          organisationNumber,
          registrationNumber,
          accreditationNumber,
          year
        })
      )
    )
  }
}

/**
 * @param {SystemLogsRepository} systemLogsRepository
 * @param {Ledger} ledger
 * @param {RecordCounts} removed
 */
const auditRemoval = async (systemLogsRepository, ledger, removed) => {
  const payload = {
    event: {
      category: 'waste-reporting',
      subCategory: 'test-organisation-data',
      action: REMOVAL_ACTION
    },
    context: { ...ledger, removed },
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
 * @param {OrganisationNumber} organisationNumber
 * @param {boolean} isDryRun
 * @param {RemovalResult} result
 */
const removeFromOrganisation = async (
  { records, organisationReadRepository, systemLogsRepository, logger },
  organisationNumber,
  isDryRun,
  result
) => {
  const isHeld = heldBy(
    await organisationReadRepository.findByOrganisationNumber(
      organisationNumber
    )
  )
  const invalid = (await records.findLedgers(organisationNumber)).filter(
    (ledger) => !isHeld(ledger)
  )
  if (invalid.length === 0) {
    return
  }

  const citations = await records.countCitationsOutside(invalid)
  if (citations > 0) {
    logger.error({
      message: `Skipping test organisation ${organisationNumber}: kept records citing a summary log or PRN it would remove=${citations}`
    })
    result.skipped++
    return
  }

  for (const ledger of invalid) {
    const { counts, error } = await clearLedger(records, ledger, isDryRun) // NOSONAR(javascript:S9382) one ledger at a time, to spare the database
    if (error) {
      logger.error({
        err: error,
        message: `Failed to remove test organisation ledger ${describeLedger(ledger)}`
      })
      result.failed++
    }
    if (!holdsAny(counts)) {
      continue
    }
    result.removed.push({ ledger, counts })
    if (isDryRun) {
      continue
    }
    try {
      await auditRemoval(systemLogsRepository, ledger, counts) // NOSONAR(javascript:S9382) one ledger at a time, to spare the database
    } catch (auditError) {
      logger.error({
        err: auditError,
        message: `Removed but failed to audit test organisation ledger ${describeLedger(ledger)}`
      })
      result.auditFailed++
    }
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
  const result = { removed: [], skipped: 0, failed: 0, auditFailed: 0 }

  for (const organisationNumber of dependencies.testOrganisationNumbers) {
    try {
      await removeFromOrganisation(
        dependencies,
        organisationNumber,
        isDryRun,
        result
      ) // NOSONAR(javascript:S9382) one organisation at a time, to spare the database
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
