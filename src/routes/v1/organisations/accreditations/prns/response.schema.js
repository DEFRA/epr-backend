import Joi from 'joi'
import { PRN_STATUS } from '#domain/packaging-recycling-notes/status.js'

export const prnListResponseSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        id: Joi.string().required(),
        prnNumber: Joi.string().required(),
        issuedToOrganisation: Joi.object({
          name: Joi.string().required(),
          tradingName: Joi.string().optional()
        }).required(),
        tonnageValue: Joi.number().required(),
        createdAt: Joi.string().isoDate().required(),
        status: Joi.string()
          .valid(
            PRN_STATUS.AWAITING_AUTHORISATION,
            PRN_STATUS.AWAITING_ACCEPTANCE,
            PRN_STATUS.ACCEPTED,
            PRN_STATUS.REJECTED,
            PRN_STATUS.CANCELLED,
            PRN_STATUS.AWAITING_CANCELLATION
          )
          .required()
      })
    )
    .required(),
  hasMore: Joi.boolean().required(),
  nextCursor: Joi.string().optional()
})
