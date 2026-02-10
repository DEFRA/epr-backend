import Joi from 'joi'

import {
  PRN_NUMBER_MAX_LENGTH,
  PRN_STATUS
} from '#packaging-recycling-notes/domain/model.js'
import { EXTERNAL_API_TAG } from '#plugins/external-api-error-formatter.js'
import { createExternalTransitionHandler } from './external-transition-handler.js'

export const packagingRecyclingNotesAcceptPath =
  '/v1/packaging-recycling-notes/{prnNumber}/accept'

const packagingRecyclingNotesAcceptPayloadSchema = Joi.object({
  acceptedAt: Joi.string().isoDate().optional().messages({
    'string.isoDate': 'acceptedAt must be a valid ISO 8601 date-time'
  })
}).allow(null)

export const packagingRecyclingNotesAccept = {
  method: 'POST',
  path: packagingRecyclingNotesAcceptPath,
  options: {
    auth: { strategy: 'api-gateway-client' },
    tags: ['api', EXTERNAL_API_TAG],
    validate: {
      params: Joi.object({
        prnNumber: Joi.string().max(PRN_NUMBER_MAX_LENGTH).required()
      }),
      payload: packagingRecyclingNotesAcceptPayloadSchema
    }
  },
  ...createExternalTransitionHandler({
    newStatus: PRN_STATUS.ACCEPTED,
    timestampField: 'acceptedAt',
    actionVerb: 'accepted',
    path: packagingRecyclingNotesAcceptPath
  })
}
