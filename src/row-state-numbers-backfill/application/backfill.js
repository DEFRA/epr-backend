import { backfillNumbersByLedger } from '#common/helpers/numbers-backfill-by-ledger.js'
import { auditRowStateNumbersBackfill } from './audit.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { LedgerBackfillResult } from '#common/helpers/numbers-backfill-by-ledger.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */
/** @import { SummaryLogRowStatesRepository } from '#waste-records/repository/port.js' */

/**
 * @typedef {Object} Repositories
 * @property {SummaryLogRowStatesRepository} summaryLogRowStatesRepository
 * @property {SystemLogsRepository} systemLogsRepository
 * @property {OrganisationsRepository} organisationsRepository
 */

/**
 * Adds to each row state the organisation, registration and accreditation
 * numbers it lacks, read from its organisation record.
 *
 * @param {Repositories & { logger: TypedLogger }} deps
 * @param {{ isDryRun: boolean }} options
 * @returns {Promise<LedgerBackfillResult>}
 */
export const backfillRowStateNumbers = (
  {
    summaryLogRowStatesRepository,
    systemLogsRepository,
    organisationsRepository,
    logger
  },
  options
) =>
  backfillNumbersByLedger(
    {
      documents: {
        findLedgerIdsWithoutNumbers:
          summaryLogRowStatesRepository.findLedgerIdsWithoutNumbers,
        countLacking: summaryLogRowStatesRepository.countRowStatesLacking,
        assignNumbers: summaryLogRowStatesRepository.assignNumbers,
        audit: (ledgerId, rowStates, next) =>
          auditRowStateNumbersBackfill(systemLogsRepository, {
            ...ledgerId,
            rowStates,
            next
          }),
        name: 'row states'
      },
      organisationsRepository,
      logger
    },
    options
  )
