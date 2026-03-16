import { randomUUID } from 'node:crypto'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { ORS_IMPORT_STATUS } from '#overseas-sites/domain/import-status.js'
import { config } from '#root/config.js'
import { orsImportCreatePayloadSchema } from './post-import.schema.js'

/** @import { OrsImportsRepository } from '#overseas-sites/imports/repository/port.js' */
/** @import { UploadsRepository } from '#domain/uploads/repository/port.js' */

/**
 * @typedef {{redirectUrl: string}} OrsImportCreatePayload
 */

export const orsImportCreatePath = '/v1/overseas-sites/imports'

export const orsImportCreate = {
  method: 'POST',
  path: orsImportCreatePath,
  options: {
    auth: getAuthConfig([ROLES.serviceMaintainer]),
    tags: ['api'],
    validate: {
      payload: orsImportCreatePayloadSchema
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest<OrsImportCreatePayload> & {orsImportsRepository: OrsImportsRepository, uploadsRepository: UploadsRepository}} request
   * @param {object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { orsImportsRepository, uploadsRepository, payload, logger } = request
    const { redirectUrl } = payload

    const importId = randomUUID()
    const appBaseUrl = config.get('appBaseUrl')
    const callbackUrl = `${appBaseUrl}/v1/overseas-sites/imports/${importId}/upload-completed`

    try {
      await orsImportsRepository.create({
        _id: importId,
        status: ORS_IMPORT_STATUS.PREPROCESSING,
        files: []
      })

      const cdpResponse = await uploadsRepository.initiateOrsImport({
        importId,
        redirectUrl,
        callbackUrl
      })

      logger.info({
        message: `ORS import initiated: id=${importId}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: importId
        }
      })

      return h
        .response({
          id: importId,
          status: ORS_IMPORT_STATUS.PREPROCESSING,
          uploadUrl: cdpResponse.uploadUrl,
          statusUrl: cdpResponse.statusUrl
        })
        .code(StatusCodes.CREATED)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        err: error,
        message: `Failure on ${orsImportCreatePath}`,
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

      throw Boom.badImplementation(`Failure on ${orsImportCreatePath}`)
    }
  }
}
