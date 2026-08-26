import { logger } from '#common/helpers/logging/logger.js'
import { findDuplicateBusinessEvents } from '#waste-balances/monitoring/duplicate-business-events.js'
import { WASTE_BALANCE_EVENTS_COLLECTION_NAME } from '#waste-balances/repository/ledger-mongodb.js'

/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { DuplicateGroup } from '#waste-balances/monitoring/duplicate-business-events.js' */

const LOCK_NAME = 'waste-balance-duplicate-events-report'

/**
 * A stored write time that is absent, or present but unparseable, reads as
 * `unknown`. `toISOString` throws on an invalid date, and one such event must
 * not take down the whole report.
 *
 * @param {Date} [createdAt]
 */
const writtenAt = (createdAt) => {
  const at = createdAt && new Date(createdAt)
  return at && !Number.isNaN(at.getTime()) ? at.toISOString() : 'unknown'
}

/** @param {DuplicateGroup} group */
const formatFinding = (group) => {
  const identity = Object.entries(group._id)
    .map(([field, value]) => `${field}=${value}`)
    .join(' ')
  const slots = group.entries
    .map(({ number, createdAt }) => `${number}@${writtenAt(createdAt)}`)
    .join(',')
  return `Duplicate waste-balance event: ${identity} organisationIds=[${group.organisationIds.join(',')}] count=${group.count} slots=[${slots}]`
}

/** @param {StartedServer} server */
const runReport = async (server) => {
  const collection = server.db.collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME)
  const { prn, summaryLog } = await findDuplicateBusinessEvents(collection)

  for (const group of [...prn, ...summaryLog]) {
    logger.info({ message: formatFinding(group) })
  }

  logger.info({
    message: `Waste-balance duplicate events report: prnDuplicates=${prn.length} summaryLogDuplicates=${summaryLog.length}`
  })
}

/**
 * Startup diagnostic for duplicate waste-balance events. Read-only, and safe
 * under live traffic.
 *
 * Findings are logged at info, not warn: they are for a human to confirm, and
 * info keeps them out of the OpenSearch alerts. It reports and does not correct
 * — the ledger is append-only, so a duplicate credit needs a correcting entry.
 *
 * @param {StartedServer} server
 */
export const runWasteBalanceDuplicateEventsReport = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message:
          'Unable to obtain lock, skipping waste-balance duplicate events report'
      })
      return
    }
    try {
      await runReport(server)
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to run waste-balance duplicate events report'
    })
  }
}
