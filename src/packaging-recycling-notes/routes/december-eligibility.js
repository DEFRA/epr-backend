import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { config } from '#root/config.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { deriveAccreditationYear } from '#common/helpers/dates/accreditation.js'
import {
  declaresDecemberWasteManually,
  isWithinDecemberWasteWindow
} from '#packaging-recycling-notes/domain/december-waste-window.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */

export const packagingRecyclingNotesDecemberEligibilityPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/packaging-recycling-notes/december-prn-eligibility'

/**
 * Whether an accreditation's December Waste declaration control should be
 * shown, and whether it may currently be submitted (PAE-1913). Two
 * independent answers: `declaresDecemberWasteManually` is a fixed property of
 * the accreditation's type (only a reprocessor on output today - see
 * declaresDecemberWasteManually in december-waste-window.js), while
 * `windowOpen` is time-varying. The frontend composes the two; this endpoint
 * states them separately so it never has to restate the rule.
 */
export const packagingRecyclingNotesDecemberEligibility = {
  method: 'GET',
  path: packagingRecyclingNotesDecemberEligibilityPath,
  options: {
    auth: getAuthConfig([SCOPES.organisationRead]),
    tags: ['api']
  },
  /**
   * @param {HapiRequest & {
   *   organisationsRepository: OrganisationsRepository,
   *   params: { organisationId: string, registrationId: string, accreditationId: string }
   * }} request
   * @param {HapiResponseToolkit} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { organisationsRepository, params, logger } = request
    const { organisationId, accreditationId } = params

    try {
      const accreditation = await organisationsRepository.findAccreditationById(
        organisationId,
        accreditationId
      )

      const relevantYear = deriveAccreditationYear(accreditation)
      const windowOpen = isWithinDecemberWasteWindow(
        relevantYear,
        new Date(),
        config.get('decemberWaste')
      )

      return h
        .response({
          declaresDecemberWasteManually:
            declaresDecemberWasteManually(accreditation),
          windowOpen
        })
        .code(StatusCodes.OK)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        error,
        message: `Failure on ${packagingRecyclingNotesDecemberEligibilityPath}`,
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

      throw Boom.badImplementation(
        `Failure on ${packagingRecyclingNotesDecemberEligibilityPath}`
      )
    }
  }
}
