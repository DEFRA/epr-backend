import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { ORS_IMPORT_STATUS } from '#overseas-sites/domain/import-status.js'

/** @import { OrsImportsRepository } from '#overseas-sites/imports/repository/port.js' */

export const orsImportStatusPath = '/v1/ors-imports/{importId}'

export const orsImportStatus = {
  method: 'GET',
  path: orsImportStatusPath,
  options: {
    auth: getAuthConfig([ROLES.serviceMaintainer]),
    tags: ['api']
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {orsImportsRepository: OrsImportsRepository}} request
   * @param {object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { orsImportsRepository, params, logger } = request
    const { importId } = params

    try {
      const result = await orsImportsRepository.findById(importId)

      if (!result) {
        return h
          .response({ status: ORS_IMPORT_STATUS.PENDING })
          .code(StatusCodes.OK)
      }

      const response = {
        status: result.status,
        files: result.files.map((file) => ({
          fileId: file.fileId,
          fileName: file.fileName,
          result: file.result ?? null
        }))
      }

      logger.info({
        message: `ORS import status retrieved: id=${importId}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: importId
        }
      })

      return h.response(response).code(StatusCodes.OK)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        err: error,
        message: `Failure on ${orsImportStatusPath}`,
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

      throw Boom.badImplementation(`Failure on ${orsImportStatusPath}`)
    }
  }
}
