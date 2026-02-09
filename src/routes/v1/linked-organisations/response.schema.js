import Joi from 'joi'

const linkedDefraOrganisationResponseSchema = Joi.object({
  orgId: Joi.string().uuid().required(),
  orgName: Joi.string().required(),
  linkedBy: Joi.object({
    email: Joi.string().email().required(),
    id: Joi.string().uuid().required()
  }).required(),
  linkedAt: Joi.date().iso().required()
})

const linkedOrganisationItemSchema = Joi.object({
  id: Joi.string().required(),
  orgId: Joi.number().integer().required(),
  companyDetails: Joi.object({
    name: Joi.string().required()
  }).required(),
  status: Joi.string().required(),
  linkedDefraOrganisation: linkedDefraOrganisationResponseSchema.required()
})

export const linkedOrganisationsResponseSchema = Joi.array()
  .items(linkedOrganisationItemSchema)
  .example([
    {
      id: '507f1f77bcf86cd799439011',
      orgId: 100001,
      companyDetails: {
        name: 'Acme Recycling Ltd'
      },
      status: 'active',
      linkedDefraOrganisation: {
        orgId: '550e8400-e29b-41d4-a716-446655440001',
        orgName: 'Defra Org Name',
        linkedBy: {
          email: 'admin@defra.gov.uk',
          id: '660e8400-e29b-41d4-a716-446655440001'
        },
        linkedAt: '2025-06-15T10:30:00.000Z'
      }
    }
  ])
