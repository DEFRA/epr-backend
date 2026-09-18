/**
 * One reporting period's export, keyed by the period itself. It tracks progress
 * rather than identity: the zip's location is derivable from the period alone,
 * so a rebuild reuses this record rather than starting a new one.
 *
 * @typedef {Object} MarketInsightsExport
 * @property {string} id - the period key
 * @property {number} year
 * @property {string} cadence
 * @property {number} period
 * @property {import('#market-insights/domain/export.js').MarketInsightsExportStatus} status
 * @property {string} buildToken - identifies the build currently entitled to write this record
 * @property {string} createdAt - ISO 8601
 * @property {string} updatedAt - ISO 8601
 * @property {string | null} generatedAt - the one moment every file in the zip was taken, once built
 * @property {string | null} s3Key - the stored zip, once written
 * @property {string | null} failureReason - why the last attempt failed, shown on the wait page
 */

/**
 * @typedef {import('#market-insights/domain/export.js').ReportingPeriodRef} ReportingPeriodRef
 */

/**
 * What `claimForBuild` settled. `claimed` is true when this caller now owns a
 * build of the period and must enqueue it; false when a build was already
 * running, in which case `record` is the one to wait on.
 *
 * @typedef {Object} ClaimResult
 * @property {MarketInsightsExport} record
 * @property {boolean} claimed
 */

/**
 * `claimForBuild` is the only way a build starts. It finds or creates the
 * period's record and, in the same write, takes it over for a fresh build
 * unless a build is already running on it. Concurrent calls settle on one
 * winner, so the wait page's refresh joins the build it is waiting on rather
 * than starting another.
 *
 * A completed export is never reused: a request that arrives after one has
 * finished takes the period over and builds a new snapshot.
 *
 * `markReady` and `markFailed` apply only while the record still carries the
 * build's own token. An abandoned build that comes back to life after the
 * period was claimed again writes nothing.
 *
 * Every write takes the caller's `now`, so the `updatedAt` a build is judged
 * abandoned by and the cutoff it is judged against come from one clock.
 *
 * @typedef {Object} MarketInsightsExportsRepository
 * @property {(claim: ReportingPeriodRef & { now: Date, abandonedBefore: string }) => Promise<ClaimResult>} claimForBuild
 * @property {(period: ReportingPeriodRef) => Promise<MarketInsightsExport | null>} findForPeriod
 * @property {(update: { id: string, buildToken: string, generatedAt: string, s3Key: string, now: Date }) => Promise<boolean>} markReady
 * @property {(update: { id: string, buildToken: string, failureReason: string, now: Date }) => Promise<boolean>} markFailed
 */

/**
 * @typedef {() => MarketInsightsExportsRepository} MarketInsightsExportsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
