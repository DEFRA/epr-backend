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
import { isWithinDecemberWasteWindow } from '#packaging-recycling-notes/domain/december-waste-window.js'
import { decemberWasteControlModeFor } from '#packaging-recycling-notes/domain/december-waste-control-mode.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */

const DECEMBER_ELIGIBILITY_FAILURE = 'Failure reading December PRN eligibility'

/**
 * Which December Waste declaration control an accreditation should be shown,
 * and whether it may currently be submitted (PAE-1913, PAE-1922). For a live
 * accreditation `mode` is a fixed property of its type - `manual` or `pool`
 * (see december-waste-control-mode.js) - while `windowOpen` is time-varying.
 * The frontend composes the two; this endpoint states them separately so it never has to
 * restate the rule.
 */
export const packagingRecyclingNotesDecemberEligibility = {
  method: 'GET',
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
          mode: decemberWasteControlModeFor(accreditation),
          windowOpen
        })
        .code(StatusCodes.OK)
    } catch (error) {
      logger.error({
        error,
        message: DECEMBER_ELIGIBILITY_FAILURE,
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

      throw Boom.badImplementation(DECEMBER_ELIGIBILITY_FAILURE)
    }
  }
}
