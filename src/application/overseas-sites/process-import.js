import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { ORS_IMPORT_STATUS } from '#domain/overseas-sites/import-status.js'
import { PermanentError } from '#server/queue-consumer/permanent-error.js'
import { processImportFile } from './process-import-file.js'

/**
 * Processes an ORS import batch: fetches each file from S3, parses it,
 * creates overseas site records, and records per-file results.
 *
 * Per-file failure isolation: a failure on one file does not block others.
 *
 * @param {string} importId
 * @param {object} deps
 * @param {object} deps.orsImportsRepository
 * @param {object} deps.uploadsRepository
 * @param {object} deps.overseasSitesRepository
 * @param {object} deps.organisationsRepository
 * @param {object} deps.logger
 */
export const processOrsImport = async (importId, deps) => {
  const {
    orsImportsRepository,
    uploadsRepository,
    overseasSitesRepository,
    organisationsRepository,
    logger
  } = deps

  const importDoc = await orsImportsRepository.findById(importId)
  if (!importDoc) {
    throw new PermanentError(`ORS import ${importId} not found`)
  }

  await orsImportsRepository.updateStatus(
    importId,
    ORS_IMPORT_STATUS.PROCESSING
  )

  for (let i = 0; i < importDoc.files.length; i++) {
    const file = importDoc.files[i]
    const result = await processFile(file, {
      uploadsRepository,
      overseasSitesRepository,
      organisationsRepository,
      logger
    })

    await orsImportsRepository.recordFileResult(importId, i, result)
  }

  await orsImportsRepository.updateStatus(importId, ORS_IMPORT_STATUS.COMPLETED)
}

/**
 * @param {object} file
 * @param {object} deps
 * @returns {Promise<object>}
 */
const processFile = async (file, deps) => {
  const {
    uploadsRepository,
    overseasSitesRepository,
    organisationsRepository,
    logger
  } = deps

  try {
    const buffer = await uploadsRepository.findByLocation(file.s3Uri)
    if (!buffer) {
      return {
        status: 'failure',
        sitesCreated: 0,
        mappingsUpdated: 0,
        registrationNumber: null,
        errors: [
          {
            field: 'file',
            message: `File ${file.fileName} could not be retrieved from storage`
          }
        ]
      }
    }

    return await processImportFile(buffer, {
      overseasSitesRepository,
      organisationsRepository,
      logger
    })
  } catch (err) {
    logger.error({
      err,
      message: `Unexpected error processing file ${file.fileName}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })

    return {
      status: 'failure',
      sitesCreated: 0,
      mappingsUpdated: 0,
      registrationNumber: null,
      errors: [{ field: 'file', message: err.message }]
    }
  }
}
