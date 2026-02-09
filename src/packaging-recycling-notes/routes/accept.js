import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'

/** @typedef {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository */

export const acceptPrnPath = '/v1/packaging-recycling-notes/{prnNumber}/accept'

const acceptPrnPayloadSchema = Joi.object({
  acceptedAt: Joi.string().isoDate().optional().messages({
    'string.isoDate': 'acceptedAt must be a valid ISO 8601 date-time'
  })
}).allow(null)

export const acceptPrn = {
  method: 'POST',
  path: acceptPrnPath,
  options: {
    auth: false,
    tags: ['api'],
    validate: {
      params: Joi.object({
        prnNumber: Joi.string().max(20).required()
      }),
      payload: acceptPrnPayloadSchema
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

      const acceptedAt = payload?.acceptedAt
        ? new Date(payload.acceptedAt)
        : new Date()

      await lumpyPackagingRecyclingNotesRepository.updateStatus({
        id: prn.id,
        status: PRN_STATUS.ACCEPTED,
        updatedBy: { id: 'rpd', name: 'RPD' },
        updatedAt: acceptedAt
      })

      logger.info({
        message: `PRN accepted: ${prnNumber}`,
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
        message: `Failure on ${acceptPrnPath}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        }
      })

      throw Boom.badImplementation(`Failure on ${acceptPrnPath}`)
    }
  }
}
