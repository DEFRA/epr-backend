import { StatusCodes } from 'http-status-codes'

import { config } from '#root/config.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { isWithinDecemberWasteWindow } from '#packaging-recycling-notes/domain/december-waste-window.js'
import { decemberWasteControlModeFor } from '#packaging-recycling-notes/domain/december-waste-control-mode.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { PrnKeys, PrnRecords } from './at-prn-keys.js' */

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
   * @param {HapiRequest & { params: PrnKeys, app: PrnRecords }} request
   * @param {HapiResponseToolkit} h - Hapi response toolkit
   */
  handler: async (request, h) =>
    h
      .response({
        mode: decemberWasteControlModeFor(request.app.registration),
        windowOpen: isWithinDecemberWasteWindow(
          request.params.year,
          new Date(),
          config.get('decemberWaste')
        )
      })
      .code(StatusCodes.OK)
}
