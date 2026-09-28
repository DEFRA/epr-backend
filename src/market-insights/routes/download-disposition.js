import { buildDownloadDisposition } from '#repositories/summary-logs/download-disposition.js'

/**
 * Names a market insights download for the period it holds and the second it
 * was taken.
 *
 * @param {{ year: number, cadence: string, period: number }} params
 * @param {Date} now
 * @param {string} extension
 * @returns {string} the Content-Disposition header value
 */
export const marketInsightsDownloadDisposition = (
  { year, cadence, period },
  now,
  extension
) =>
  buildDownloadDisposition(
    `market-insights-${year}-${cadence}-${period}`,
    now.toISOString(),
    extension
  )
