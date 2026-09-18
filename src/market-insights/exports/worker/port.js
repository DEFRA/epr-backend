/**
 * What the request hands the queue: which period to build, the build it belongs
 * to, and the reporting months the route already settled — decided there, and
 * an unended period rejected, before anything was enqueued.
 *
 * `buildToken` is what entitles this build to record its outcome. A build the
 * period has since moved on from carries a stale one and writes nothing.
 *
 * @typedef {Object} MarketInsightsExportCommand
 * @property {string} exportId - the period key
 * @property {string} buildToken
 * @property {number} year
 * @property {string} cadence
 * @property {number} period
 * @property {string[]} months
 */

/**
 * @typedef {Object} MarketInsightsExportsCommandExecutor
 * @property {(command: MarketInsightsExportCommand) => Promise<void>} requestExport
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
