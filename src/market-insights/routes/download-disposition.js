const ISO_SECONDS_LENGTH = 19

/**
 * Names a market insights download for the period it holds and the second it
 * was taken, without colons, following the convention
 * `buildDownloadDisposition` set.
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
) => {
  const taken = now
    .toISOString()
    .slice(0, ISO_SECONDS_LENGTH)
    .replace('T', '-')
    .replaceAll(':', '')

  return `attachment; filename="market-insights-${year}-${cadence}-${period}-${taken}.${extension}"`
}
