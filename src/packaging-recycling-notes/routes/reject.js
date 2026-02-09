import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import {
  PRN_NUMBER_MAX_LENGTH,
  PRN_STATUS
} from '#packaging-recycling-notes/domain/model.js'
import { prnMetrics } from '#packaging-recycling-notes/application/metrics.js'
import { auditPrnStatusTransition } from '#packaging-recycling-notes/application/audit.js'

/** @typedef {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository */

export const packagingRecyclingNotesRejectPath =
  '/v1/packaging-recycling-notes/{prnNumber}/reject'

const packagingRecyclingNotesRejectPayloadSchema = Joi.object({
  rejectedAt: Joi.string().isoDate().optional().messages({
    'string.isoDate': 'rejectedAt must be a valid ISO 8601 date-time'
  })
}).allow(null)

export const packagingRecyclingNotesReject = {
  method: 'POST',
  path: packagingRecyclingNotesRejectPath,
  options: {
    auth: { strategy: 'api-gateway-client' },
    tags: ['api'],
    validate: {
      params: Joi.object({
        prnNumber: Joi.string().max(PRN_NUMBER_MAX_LENGTH).required()
      }),
      payload: packagingRecyclingNotesRejectPayloadSchema
    }
  },
  handler: async (request, h) => {
    const { lumpyPackagingRecyclingNotesRepository, params, payload, logger } =
      request
    const { prnNumber } = params

    try {
      const prn =
        await lumpyPackagingRecyclingNotesRepository.findByPrnNumber(prnNumber)

      if (!prn) {
        throw Boom.notFound(`Packaging recycling note not found: ${prnNumber}`)
      }

      if (prn.status.currentStatus !== PRN_STATUS.AWAITING_ACCEPTANCE) {
        throw Boom.conflict(
          `Packaging recycling note has already been ${prn.status.currentStatus}`
        )
      }

      const rejectedAt = payload?.rejectedAt
        ? new Date(payload.rejectedAt)
        : new Date()

      const updatedPrn =
        await lumpyPackagingRecyclingNotesRepository.updateStatus({
          id: prn.id,
          status: PRN_STATUS.AWAITING_CANCELLATION,
          updatedBy: { id: 'rpd', name: 'RPD' },
          updatedAt: rejectedAt
        })

      await prnMetrics.recordStatusTransition({
        fromStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        toStatus: PRN_STATUS.AWAITING_CANCELLATION,
        material: prn.accreditation?.material,
        isExport: prn.isExport
      })

      await auditPrnStatusTransition(request, prn.id, prn, updatedPrn)

      logger.info({
        message: `PRN rejected: ${prnNumber}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: prnNumber
        }
      })

      return h.response().code(StatusCodes.NO_CONTENT)
    } catch (error) {
      if (error.isBoom) {
        throw error
      }

      logger.error({
        err: error,
        message: `Failure on ${packagingRecyclingNotesRejectPath}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        }
      })

      throw Boom.badImplementation(
        `Failure on ${packagingRecyclingNotesRejectPath}`
      )
    }
  }
}
