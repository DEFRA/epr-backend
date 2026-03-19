import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'

import {
  orsUploadCompletedPayloadSchema,
  UPLOAD_FILE_STATUS
} from './post-upload-completed.schema.js'

/** @import { OrsImportsRepository } from '#overseas-sites/imports/repository/port.js' */
/** @import { OrsImportsCommandExecutor } from '#overseas-sites/imports/worker/port.js' */

/**
 * @typedef {{ form: { orsUpload: object | object[] } }} OrsUploadCompletedPayload
 */

/**
 * @param {object|object[]} fileOrFiles
 * @returns {object[]}
 */
const normaliseToArray = (fileOrFiles) =>
  Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles]

/**
 * @param {object} upload
 * @returns {{ fileId: string, fileName: string, s3Uri: string }}
 */
const toFileRecord = (upload) => ({
  fileId: upload.fileId,
  fileName: upload.filename,
  s3Uri: `s3://${upload.s3Bucket}/${upload.s3Key}`
})

/**
 * @param {object[]} uploads
 * @returns {boolean}
 */
const hasCompletedFiles = (uploads) =>
  uploads.some((u) => u.fileStatus === UPLOAD_FILE_STATUS.COMPLETE)

export const orsUploadCompletedPath =
  '/v1/overseas-sites/imports/{id}/upload-completed'

export const orsUploadCompleted = {
  method: 'POST',
  path: orsUploadCompletedPath,
  options: {
    auth: false,
    validate: {
      payload: orsUploadCompletedPayloadSchema
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest<OrsUploadCompletedPayload> & {orsImportsRepository: OrsImportsRepository, orsImportsWorker: OrsImportsCommandExecutor}} request
   * @param {object} h
   */
  handler: async (request, h) => {
    const { orsImportsRepository, orsImportsWorker, payload, params, logger } =
      request
    const { id } = params

    try {
      const existing = await orsImportsRepository.findById(id)

      if (!existing) {
        throw Boom.notFound(`ORS import ${id} not found`)
      }

      const uploads = normaliseToArray(payload.form.orsUpload)
      const completedFiles = uploads
        .filter((u) => u.fileStatus === UPLOAD_FILE_STATUS.COMPLETE)
        .map(toFileRecord)

      if (completedFiles.length > 0) {
        await orsImportsRepository.addFiles(id, completedFiles)
      }

      if (hasCompletedFiles(uploads)) {
        await orsImportsWorker.importOverseasSites(id)
      }

      const fileCount = uploads.length
      const completedCount = completedFiles.length

      logger.info({
        message: `ORS upload completed: importId=${id}, files=${fileCount}, completed=${completedCount}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: id
        }
      })

      return h.response().code(StatusCodes.ACCEPTED)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        err: error,
        message: `Failure on ${orsUploadCompletedPath}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        },
        http: {
          response: {
            status_code: StatusCodes.INTERNAL_SERVER_ERROR
          }
        }
      })

      throw Boom.badImplementation(`Failure on ${orsUploadCompletedPath}`)
    }
  }
}
