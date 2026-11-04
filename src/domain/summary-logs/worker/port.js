/** @import {SummaryLogId} from '#domain/summary-logs/ids.js' */

/**
 * @typedef {Object} SubmitUser
 * @property {string} id
 * @property {string} [name]
 * @property {string} email
 * @property {string[]} scope
 * @property {string | null} role
 */

/**
 * @typedef {Object} SummaryLogsCommandExecutor
 * @property {(summaryLogId: SummaryLogId) => Promise<void>} validate
 * @property {(summaryLogId: SummaryLogId, request: import('#common/hapi-types.js').AuthenticatedRequest) => Promise<void>} submit
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
