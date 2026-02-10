import Joi from 'joi'

import {
  PRN_NUMBER_MAX_LENGTH,
  PRN_STATUS
} from '#packaging-recycling-notes/domain/model.js'
import { EXTERNAL_API_TAG } from '#plugins/external-api-error-formatter.js'
import { createExternalTransitionHandler } from './external-transition-handler.js'

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
    tags: ['api', EXTERNAL_API_TAG],
    validate: {
      params: Joi.object({
        prnNumber: Joi.string().max(PRN_NUMBER_MAX_LENGTH).required()
      }),
      payload: packagingRecyclingNotesRejectPayloadSchema
    }
  },
  ...createExternalTransitionHandler({
    newStatus: PRN_STATUS.AWAITING_CANCELLATION,
    timestampField: 'rejectedAt',
    actionVerb: 'rejected',
    path: packagingRecyclingNotesRejectPath
  })
}
