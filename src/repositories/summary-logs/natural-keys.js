/**
 * @import { SummaryLogKey } from '#domain/summary-logs/numbers.js'
 * @import { KeyedSummaryLogWithId, SummaryLogWithId } from './port.js'
 */

/**
 * Names a summary log found by `key` by its numbers alone.
 *
 * @param {SummaryLogKey} key
 * @returns {(found: SummaryLogWithId) => KeyedSummaryLogWithId}
 */
export const keyedBy =
  ({ organisationNumber, registrationNumber }) =>
  ({
    id,
    version,
    summaryLog: {
      organisationId: _o,
      registrationId: _r,
      accreditationId: _a,
      ...summaryLog
    }
  }) => ({
    id,
    version,
    summaryLog: { ...summaryLog, organisationNumber, registrationNumber }
  })
