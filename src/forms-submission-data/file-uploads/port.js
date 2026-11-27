/** @import { Readable } from 'node:stream' */
/** @import { RegulatorValue } from '#domain/organisations/model.js' */

/**
 * Copies the files operators uploaded with their forms from the Forms
 * Submission API into S3, and reads them back.
 *
 * @typedef {{
 *   copyFormFileToS3: (params: { fileId: string, regulator: RegulatorValue }) => Promise<void>
 *   getFileById: (fileId: string) => Promise<Readable>
 * }} FormsFileUploadsRepository
 */

export {}
