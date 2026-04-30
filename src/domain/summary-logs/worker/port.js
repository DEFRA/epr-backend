/**
 * @typedef {Object} SubmitUser
 * @property {string} id
 * @property {string} email
 * @property {string[]} scope
 */

/**
 * @typedef {Object} SummaryLogsCommandExecutor
 * @property {(summaryLogId: string) => Promise<void>} validate
 * @property {(summaryLogId: string, request: import('#common/hapi-types.js').HapiRequest) => Promise<void>} submit
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
