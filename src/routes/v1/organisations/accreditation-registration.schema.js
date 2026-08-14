import Joi from 'joi'

// The accreditation is identified by the path; the body names only the
// registration it is being assigned to.
export const accreditationRegistrationPayloadSchema = Joi.object({
  registrationId: Joi.string().trim().min(1).required()
}).required()
