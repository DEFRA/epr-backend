import { backfillNumbersByLedger } from '#common/helpers/numbers-backfill-by-ledger.js'
import { auditLedgerEventNumbersBackfill } from './audit.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { LedgerBackfillResult } from '#common/helpers/numbers-backfill-by-ledger.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { SystemLogsRepository } from '#repositories/system-logs/port.js' */
/** @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js' */

/**
 * @typedef {Object} Repositories
 * @property {WasteBalanceLedgerRepository} ledgerRepository
 * @property {SystemLogsRepository} systemLogsRepository
 * @property {OrganisationsRepository} organisationsRepository
 */

/**
 * Adds to each waste balance ledger event the organisation, registration and
 * accreditation numbers it lacks, read from its organisation record.
 *
 * @param {Repositories & { logger: TypedLogger }} deps
 * @param {{ isDryRun: boolean }} options
 * @returns {Promise<LedgerBackfillResult>}
 */
export const backfillLedgerEventNumbers = (
  { ledgerRepository, systemLogsRepository, organisationsRepository, logger },
  options
) =>
  backfillNumbersByLedger(
    {
      documents: {
        findLedgerIdsWithoutNumbers:
          ledgerRepository.findLedgerIdsWithoutNumbers,
        countLacking: ledgerRepository.countEventsLacking,
        assignNumbers: ledgerRepository.assignNumbers,
        audit: (ledgerId, events, next) =>
          auditLedgerEventNumbersBackfill(systemLogsRepository, {
            ...ledgerId,
            events,
            next
          }),
        name: 'events'
      },
      organisationsRepository,
      logger
    },
    options
  )
