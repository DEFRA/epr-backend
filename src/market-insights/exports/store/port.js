/**
 * A signed download of a stored export. An expired URL is a normal outcome, not
 * an error: asking for the export again is the answer, and nothing re-signs an
 * old object.
 *
 * @typedef {Object} PresignedExportDownload
 * @property {string} url
 * @property {string} expiresAt - ISO 8601
 */

/**
 * Where a built zip is put and how it is handed back. The key is the caller's,
 * and carries the moment the figures were taken, so every build writes a new
 * object and nothing a reader already holds is replaced underneath them.
 *
 * @typedef {Object} MarketInsightsExportStore
 * @property {(params: { key: string, body: Buffer }) => Promise<void>} save
 * @property {(params: { key: string, fileName: string }) => Promise<PresignedExportDownload>} signDownload
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
