import Joi from 'joi'

/**
 * A registration line carries the number the public register publishes and the
 * id that pairs it with its accreditation. A registration holds no number
 * until it is approved, and holds no accreditation id until its accreditation
 * is numbered, so both keys are optional here.
 */
const registrationSchema = Joi.object({
  registrationNumber: Joi.string().allow(null).optional(),
  accreditationId: Joi.string().optional()
})

const accreditationSchema = Joi.object({
  id: Joi.string().required(),
  accreditationNumber: Joi.string().allow(null).optional()
})

const listItemSchema = Joi.object({
  id: Joi.string().required(),
  orgId: Joi.number().required(),
  companyDetails: Joi.object({
    name: Joi.string().required()
  }).required(),
  status: Joi.string().required(),
  submittedToRegulator: Joi.string().required(),
  registrations: Joi.array().items(registrationSchema).required(),
  accreditations: Joi.array().items(accreditationSchema).required()
})

const pageSchema = Joi.object({
  items: Joi.array().items(listItemSchema).required(),
  page: Joi.number().required(),
  pageSize: Joi.number().required(),
  totalItems: Joi.number().required(),
  totalPages: Joi.number().required()
})

/**
 * The width of the organisations list, enforced at the wire.
 *
 * The list view builds each item from named fields, so an unexpected key can
 * only arrive if someone adds one to the view. This schema makes that arrival
 * a failed response instead of a served one, which is the guarantee the route
 * offers its callers.
 *
 * The route answers a request carrying no criteria with every organisation it
 * holds, unpaginated, so the two arms below are the two payloads the handler
 * builds.
 */
export const organisationsListResponseSchema = Joi.alternatives().try(
  pageSchema,
  Joi.array().items(listItemSchema)
)
