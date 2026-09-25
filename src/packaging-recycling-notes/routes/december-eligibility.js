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
import { ACTIVE_ACCREDITATION_STATUSES } from '#domain/organisations/model.js'
import { isWithinDecemberWasteWindow } from '#packaging-recycling-notes/domain/december-waste-window.js'
import {
  DECEMBER_WASTE_CONTROL_MODE,
  decemberWasteControlModeFor
} from '#packaging-recycling-notes/domain/december-waste-control-mode.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */

export const packagingRecyclingNotesDecemberEligibilityPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/packaging-recycling-notes/december-prn-eligibility'

/**
 * Which December Waste declaration control an accreditation should be shown,
 * and whether it may currently be submitted (PAE-1913, PAE-1922). For a live
 * accreditation `mode` is a fixed property of its type - `manual` or `pool`
 * (see december-waste-control-mode.js) - while `windowOpen` is time-varying.
 * A non-live accreditation has no eligibility and answers `none`. The frontend
 * composes the two; this endpoint states them separately so it never has to
 * restate the rule.
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

      // A non-live accreditation (created/rejected/cancelled) carries no
      // December eligibility and has no validFrom to derive a year from, so
      // answer `none` rather than reaching deriveAccreditationYear, which
      // throws on a missing validFrom. Every active status carries validFrom.
      if (!ACTIVE_ACCREDITATION_STATUSES.has(accreditation.status)) {
        return h
          .response({
            mode: DECEMBER_WASTE_CONTROL_MODE.NONE,
            windowOpen: false
          })
          .code(StatusCodes.OK)
      }

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
