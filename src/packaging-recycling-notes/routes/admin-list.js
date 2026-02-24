import Joi from 'joi'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { ROLES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { getProcessCode } from '#packaging-recycling-notes/domain/get-process-code.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { createStatusesValidator } from '#packaging-recycling-notes/routes/validation.js'

/**
 * @import {PackagingRecyclingNotesRepository} from '#packaging-recycling-notes/repository/port.js'
 */

const DEFAULT_LIMIT = 500

export const adminPackagingRecyclingNotesListPath =
  '/v1/admin/packaging-recycling-notes'

/**
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} prn
 */
const buildResponseItem = (prn) => ({
  id: prn.id,
  prnNumber: prn.prnNumber ?? null,
  status: prn.status.currentStatus,
  issuedToOrganisation: prn.issuedToOrganisation,
  tonnage: prn.tonnage,
  material: prn.accreditation.material,
  processToBeUsed: getProcessCode(prn.accreditation.material),
  isDecemberWaste: prn.isDecemberWaste,
  notes: prn.notes ?? null,
  issuedAt: prn.status.issued?.at ?? null,
  issuedBy: prn.status.issued?.by ?? null,
  accreditationNumber: prn.accreditation.accreditationNumber ?? null,
  accreditationYear: prn.accreditation.accreditationYear,
  submittedToRegulator: prn.accreditation.submittedToRegulator ?? null,
  wasteProcessingType: prn.isExport
    ? WASTE_PROCESSING_TYPE.EXPORTER
    : WASTE_PROCESSING_TYPE.REPROCESSOR,
  organisationName: prn.organisation.name,
  createdAt: prn.createdAt
})

export const adminPackagingRecyclingNotesList = {
  method: 'GET',
  path: adminPackagingRecyclingNotesListPath,
  options: {
    auth: getAuthConfig([ROLES.serviceMaintainer]),
    tags: ['api'],
    validate: {
      query: Joi.object({
        statuses: createStatusesValidator(Object.values(PRN_STATUS)),
        limit: Joi.number().integer().min(1).max(1000).optional(),
        cursor: Joi.string().optional()
      })
    }
  },
  /** @param {import('#common/hapi-types.js').HapiRequest & {packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository}} request */
  handler: async (request, h) => {
    const { packagingRecyclingNotesRepository, logger } = request
    const { statuses, limit, cursor } = request.query

    try {
      const effectiveLimit = limit ?? DEFAULT_LIMIT
      const { excludeOrganisationIds = [] } =
        request.server.app.prnVisibilityFilter ?? {}

      const result = await packagingRecyclingNotesRepository.findByStatus({
        cursor,
        excludeOrganisationIds,
        limit: effectiveLimit,
        statuses
      })

      const response = {
        items: result.items.map(buildResponseItem),
        hasMore: result.hasMore
      }

      if (result.nextCursor) {
        response.nextCursor = result.nextCursor
      }

      logger.info({
        message: `Admin listed ${result.items.length} PRNs`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
        }
      })

      return h.response(response).code(StatusCodes.OK)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        err: error,
        message: `Failure on ${adminPackagingRecyclingNotesListPath}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        }
      })

      throw Boom.badImplementation(
        `Failure on ${adminPackagingRecyclingNotesListPath}`
      )
    }
  }
}
