const ISO_SECONDS_LENGTH = 19
const PERIOD_DIGITS = 2

/**
 * @typedef {typeof MARKET_INSIGHTS_EXPORT_STATUS[keyof typeof MARKET_INSIGHTS_EXPORT_STATUS]} MarketInsightsExportStatus
 */
export const MARKET_INSIGHTS_EXPORT_STATUS = Object.freeze({
  BUILDING: 'building',
  READY: 'ready',
  FAILED: 'failed'
})

export const MARKET_INSIGHTS_COMMAND = Object.freeze({
  EXPORT: 'market-insights-export'
})

/**
 * @typedef {Object} ReportingPeriodRef
 * @property {number} year
 * @property {string} cadence
 * @property {number} period
 */

/**
 * @param {number} period
 * @returns {string}
 */
const paddedPeriod = (period) => String(period).padStart(PERIOD_DIGITS, '0')

/**
 * The one export a reporting period has. There is no other identity: a request
 * asks for this period's export, and gets the one that is there or the one it
 * causes to be built.
 *
 * @param {ReportingPeriodRef} period
 * @returns {string}
 */
export const marketInsightsExportPeriodKey = ({ year, cadence, period }) =>
  `${year}-${cadence}-${paddedPeriod(period)}`

/**
 * The exports share the public register's bucket, under a prefix of their own,
 * because a bucket of their own needs provisioning outside this team. The
 * prefix is what keeps the two kinds of object apart: the public register
 * writes `public-register-…csv` at the root and never below this.
 */
const OBJECT_KEY_PREFIX = 'market-insights/'

/**
 * What a regulator's browser saves the download as. It says which period it
 * holds and when the figures were taken, down to the second and without colons,
 * following the convention `buildDownloadDisposition` set.
 *
 * @param {ReportingPeriodRef & { generatedAt: string }} params
 * @returns {string}
 */
export const marketInsightsExportFileName = ({
  year,
  cadence,
  period,
  generatedAt
}) => {
  const taken = generatedAt
    .slice(0, ISO_SECONDS_LENGTH)
    .replace('T', '-')
    .replaceAll(':', '')

  return `market-insights-${year}-${cadence}-${period}-${taken}.zip`
}

/**
 * Where a build puts its zip: the name it will be saved as, under the prefix.
 *
 * Every build writes a new object, since the name carries the moment. A rebuild
 * does not overwrite the last one, so a regulator part-way through a download
 * is not handed different figures underneath them, and no object ever disagrees
 * with the `generatedAt` that was quoted alongside it.
 *
 * @param {ReportingPeriodRef & { generatedAt: string }} params
 * @returns {string}
 */
export const marketInsightsExportObjectKey = (params) =>
  `${OBJECT_KEY_PREFIX}${marketInsightsExportFileName(params)}`

/**
 * The moment a build must have been claimed since for work to still be
 * happening on it. Past the queue's command timeout the consumer has abandoned
 * the message, so a record still sitting at `building` is nobody's build and
 * the period is free to be built again.
 *
 * Nothing else decides whether to build. Every request for a period builds a
 * fresh snapshot of it; the only thing a request will not do is start a second
 * build beside one that is already running.
 *
 * @param {number} inFlightMs - the queue's command timeout
 * @param {Date} now
 * @returns {string} ISO 8601
 */
export const abandonedBuildCutoff = (inFlightMs, now) =>
  new Date(now.getTime() - inFlightMs).toISOString()
