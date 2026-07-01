import { logger } from '#common/helpers/logging/logger.js'
import { findDuplicateBusinessEvents } from '#waste-balances/monitoring/duplicate-business-events.js'
import { WASTE_BALANCE_EVENTS_COLLECTION_NAME } from '#waste-balances/repository/stream-mongodb.js'

/** @import { Document } from 'mongodb' */

const LOCK_NAME = 'waste-balance-duplicate-events-report'

/**
 * @param {Document} group - a {@link import('#waste-balances/monitoring/duplicate-business-events.js').DuplicateGroup}
 */
const formatFinding = (group) => {
  const identity = Object.entries(group._id)
    .map(([field, value]) => `${field}=${value}`)
    .join(' ')
  const createdAt = group.createdAt
    .map((/** @type {Date} */ at) => new Date(at).toISOString())
    .join(',')
  return `Duplicate waste-balance event: ${identity} count=${group.count} numbers=[${group.numbers.join(',')}] createdAt=[${createdAt}]`
}

/**
 * @param {Object} server - Hapi server instance
 */
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
 * One-shot startup diagnostic that scans the waste-balance event stream for
 * duplicate business events — two events written for a single action, the
 * signature of the pre-optimistic-concurrency append path. Each duplicate group
 * is logged on its own line, followed by a single summary line. Everything is
 * logged at info: these are findings to read and confirm, not failures to alarm
 * on, so info keeps them queryable without tripping the warn/error OpenSearch
 * alerts. There is no pass/fail gate and no remediation.
 *
 * This is the sanctioned route to production data — there is no ad-hoc
 * production query. Read-only, safe under live traffic. Runs under a
 * cross-instance lock so a single pod per deploy executes the scan; the
 * aggregations run server-side so only the duplicate groups are returned.
 *
 * @param {Object} server - Hapi server instance
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
