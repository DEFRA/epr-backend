import Joi from 'joi'
import { CADENCE } from '#reports/domain/cadence.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import {
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'

const START_YEAR = 2024
const MAX_YEAR = 2100
const YEAR_SCHEMA = Joi.number()
  .integer()
  .min(START_YEAR)
  .max(MAX_YEAR)
  .required()
const MONGO_ID_LENGTH = 24
const MONGO_ID_SCHEMA = Joi.string().hex().length(MONGO_ID_LENGTH).required()

export const cadenceSchema = Joi.string()
  .valid(...Object.values(CADENCE))
  .required()

const PERIOD_END = 12
const PERIOD_START = 1
export const periodSchema = Joi.number()
  .integer()
  .min(PERIOD_START)
  .max(PERIOD_END)
  .required()

export const userSummarySchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().required(),
  position: Joi.string().optional()
}).required()

export const prnSchema = Joi.object({
  issuedTonnage: Joi.number().min(0).required()
}).optional()

const reportDataFieldsSchema = {
  recyclingActivity: Joi.object().optional(),
  exportActivity: Joi.object().optional(),
  wasteSent: Joi.object().optional(),
  prn: prnSchema,
  supportingInformation: Joi.string().optional()
}

export const createReportSchema = Joi.object({
  organisationId: MONGO_ID_SCHEMA,
  registrationId: MONGO_ID_SCHEMA,
  year: YEAR_SCHEMA,
  cadence: cadenceSchema,
  period: periodSchema,
  startDate: Joi.string().isoDate().required(),
  endDate: Joi.string().isoDate().required(),
  dueDate: Joi.string().isoDate().required(),
  material: Joi.string()
    .valid(...TONNAGE_MONITORING_MATERIALS)
    .required(),
  wasteProcessingType: Joi.string()
    .valid(...Object.values(WASTE_PROCESSING_TYPE))
    .required(),
  siteAddress: Joi.string().optional(),
  changedBy: userSummarySchema,
  ...reportDataFieldsSchema
})

const updatableFieldsSchema = Joi.object({
  status: Joi.string().valid(
    REPORT_STATUS.IN_PROGRESS,
    REPORT_STATUS.READY_TO_SUBMIT,
    REPORT_STATUS.SUBMITTED,
    REPORT_STATUS.SUPERSEDED,
    REPORT_STATUS.DELETED
  ),
  supportingInformation: Joi.string().allow('')
})
  .min(1)
  .required()

export const updateReportSchema = Joi.object({
  reportId: Joi.string().required(),
  version: Joi.number().integer().min(1).required(),
  fields: updatableFieldsSchema,
  changedBy: userSummarySchema.optional()
})

export const deleteReportParamsSchema = Joi.object({
  organisationId: MONGO_ID_SCHEMA,
  registrationId: MONGO_ID_SCHEMA,
  year: YEAR_SCHEMA,
  cadence: cadenceSchema,
  period: periodSchema,
  changedBy: userSummarySchema
})

export const findPeriodicReportsSchema = Joi.object({
  organisationId: MONGO_ID_SCHEMA,
  registrationId: MONGO_ID_SCHEMA
})

export const findReportByIdSchema = Joi.string()
  .guid({ version: 'uuidv4' })
  .required()
