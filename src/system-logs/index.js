/**
 * System logs
 *
 * Records what was done to the service's data and who did it, and finds those
 * records again. Its README names the module's entry points.
 *
 * @module system-logs
 */

/** @typedef {import('./repository/port.js').FindParams} FindParams */
/** @typedef {import('./repository/port.js').PaginatedSystemLogs} PaginatedSystemLogs */
/** @typedef {import('./repository/port.js').SummaryLogSubmitActor} SummaryLogSubmitActor */
/** @typedef {import('./repository/port.js').SystemLog} SystemLog */
/** @typedef {import('./repository/port.js').SystemLogActor} SystemLogActor */
/** @typedef {import('./repository/port.js').SystemLogHumanActor} SystemLogHumanActor */
/** @typedef {import('./repository/port.js').SystemLogsRepository} SystemLogsRepository */

export {
  SUMMARY_LOG_SUB_CATEGORY,
  SUMMARY_LOG_SUBMIT_ACTION
} from './domain/summary-log-submission.js'
