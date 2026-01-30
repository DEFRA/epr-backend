import { StatusCodes } from 'http-status-codes'
import { ROLES } from '#common/helpers/auth/constants.js'
import { generatePublicRegister } from '#application/public-register/generate-public-register.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import Boom from '@hapi/boom'
import { auditPublicRegisterGenerate } from '#root/auditing/public-register.js'

/**
 * @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository
 * @typedef {import('#domain/public-register/repository/port.js').PublicRegisterRepository} PublicRegisterRepository
 * @typedef {import('#repositories/system-logs/port.js').SystemLogsRepository} SystemLogsRepository
 */

export const publicRegisterGeneratePath = '/v1/public-register/generate'

export const generateLatestPublicRegister = {
  method: 'POST',
  path: publicRegisterGeneratePath,
  options: {
    auth: {
      scope: [ROLES.serviceMaintainer]
    },
    tags: ['api']
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository, publicRegisterRepository: PublicRegisterRepository, systemLogsRepository: SystemLogsRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { organisationsRepository, publicRegisterRepository, logger } =
      request
    try {
      const result = await generatePublicRegister(
        organisationsRepository,
        publicRegisterRepository
      )

      const generatedTime = new Date().toISOString()
      await auditPublicRegisterGenerate(request, {
        url: result.url,
        expiresAt: result.expiresAt,
        generatedAt: generatedTime
      })

      logger.info({
        message: 'Public register generated successfully',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
        }
      })

      return h
        .response({
          status: 'generated',
          downloadUrl: result.url,
          generatedAt: generatedTime,
          expiresAt: result.expiresAt
        })
        .code(StatusCodes.CREATED)
    } catch (error) {
      logger.error({
        err: error,
        message: `Failure on ${publicRegisterGeneratePath}`,
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

      throw Boom.badImplementation(`Failure on ${publicRegisterGeneratePath}`)
    }
  }
}
