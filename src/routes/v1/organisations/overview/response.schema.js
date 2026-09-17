import Joi from 'joi'

const accreditationSchema = Joi.object({
  id: Joi.string().required(),
  accreditationNumber: Joi.string().allow(null).required(),
  status: Joi.string().required()
})

const registrationSchema = Joi.object({
  id: Joi.string().required(),
  registrationNumber: Joi.string().allow(null).required(),
  status: Joi.string().required(),
  material: Joi.string().required(),
  processingType: Joi.string().required(),
  reprocessingType: Joi.string().allow(null).required(),
  site: Joi.string().allow(null).required(),
  accreditation: accreditationSchema.optional()
})

// An accreditation no registration on this organisation links to. It carries
// the same display fields as a registration row so the two render together.
const unlinkedAccreditationSchema = Joi.object({
  id: Joi.string().required(),
  accreditationNumber: Joi.string().allow(null).required(),
  status: Joi.string().required(),
  material: Joi.string().required(),
  processingType: Joi.string().required(),
  site: Joi.string().allow(null).required()
})

const linkedDefraOrganisationSchema = Joi.object({
  orgId: Joi.string().required(),
  orgName: Joi.string().required(),
  linkedAt: Joi.date().required(),
  linkedBy: Joi.object({
    email: Joi.string().required()
  }).required()
})

export const organisationsOverviewResponseSchema = Joi.object({
  id: Joi.string().required(),
  companyName: Joi.string().required(),
  registrations: Joi.array().items(registrationSchema).required(),
  unlinkedAccreditations: Joi.array()
    .items(unlinkedAccreditationSchema)
    .required(),
  linkedDefraOrganisation: linkedDefraOrganisationSchema.optional()
})
