import { buildDownloadDisposition } from '#repositories/summary-logs/download-disposition.js'

/**
 * Names a market insights download for the period it holds and the second it
 * was taken, with a label after the period where the download needs telling
 * apart from the usual one.
 *
 * @param {{ year: number, cadence: string, period: number }} params
 * @param {Date} now
 * @param {string} extension
 * @param {string} [label]
 * @returns {string} the Content-Disposition header value
 */
export const marketInsightsDownloadDisposition = (
  { year, cadence, period },
  now,
  extension,
  label
) =>
  buildDownloadDisposition(
    [`market-insights-${year}-${cadence}-${period}`, label]
      .filter(Boolean)
      .join('-'),
    now.toISOString(),
    extension
  )
