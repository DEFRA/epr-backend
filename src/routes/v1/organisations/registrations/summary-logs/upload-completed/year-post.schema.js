import Joi from 'joi'

import { yearSchema } from '#common/validation/year-schema.js'

export { uploadCompletedPayloadSchema } from './post.schema.js'

export const uploadCompletedYearParamsSchema = Joi.object({
  organisationId: Joi.string().required(),
  registrationId: Joi.string().required(),
  year: yearSchema().required(),
  summaryLogId: Joi.string().required()
})
