import Joi from 'joi'
import {
  REGULATOR,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { capitalize } from '#common/helpers/formatters.js'

const summaryLogUploadReportRowSchema = Joi.object({
  appropriateAgency: Joi.string()
    .valid(
      ...Object.values(REGULATOR).map((regulator) => regulator.toUpperCase())
    )
    .required(),
  type: Joi.string()
    .valid(
      ...Object.values(WASTE_PROCESSING_TYPE).map((type) => capitalize(type))
    )
    .required(),
  businessName: Joi.string().required(),
  orgId: Joi.number().required(),
  registrationNumber: Joi.string().allow('').required(),
  accreditationNumber: Joi.string().allow('').required(),
  reprocessingSite: Joi.string().allow('').required(),
  packagingWasteCategory: Joi.string()
    .valid(
      'Aluminium',
      'Fibre based composite',
      'Paper and board',
      'Plastic',
      'Steel',
      'Wood',
      'Glass-remelt',
      'Glass-other',
      'Glass-remelt-other'
    )
    .required(),
  lastSuccessfulUpload: Joi.string().allow('').required(),
  lastFailedUpload: Joi.string().allow('').required(),
  successfulUploads: Joi.number().required(),
  failedUploads: Joi.number().required()
})

export const summaryLogUploadsReportResponseSchema = Joi.object({
  summaryLogUploads: Joi.array()
    .items(summaryLogUploadReportRowSchema)
    .required(),
  generatedAt: Joi.string().isoDate().required()
}).required()
