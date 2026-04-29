import { parseS3Uri } from '#adapters/repositories/uploads/s3-uri.js'
import { internal } from '#common/helpers/logging/cdp-boom.js'

import { errorCodes } from './enums/error-codes.js'

/**
 * Parses a summary log's S3 file URI, throwing a structured CdpBoom on
 * failure so the corruption surfaces as an indexable event in OpenSearch
 * rather than a bare 500. Used by both the mongo and in-memory adapters.
 *
 * @param {string} uri
 * @param {string} summaryLogId
 * @returns {{ Bucket: string, Key: string }}
 */
export const parseSummaryLogUri = (uri, summaryLogId) => {
  try {
    return parseS3Uri(uri)
  } catch (error) {
    const err =
      /** @type {Error & { code?: string, cause?: Error & { code?: string } }} */ (
        error
      )
    const cause = err.cause ?? err
    const classifier = cause.code
      ? `type=${cause.name} code=${cause.code}`
      : `type=${cause.name}`

    throw internal(
      `Failed to parse S3 URI for summary log ${summaryLogId}`,
      errorCodes.summaryLogUriCorrupt,
      {
        event: {
          action: 'get_download_url',
          reason: `summaryLogId=${summaryLogId} ${classifier}`
        }
      }
    )
  }
}
