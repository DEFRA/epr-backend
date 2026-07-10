import { toDecimal } from '#common/helpers/decimal-utils.js'
import { tonnage, wholeTonnage } from '#common/validation/tonnage-schema.js'
import {
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { periodRefSchema } from '#reports/domain/period-ref.schema.js'
import Joi from 'joi'

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
  name: Joi.string().optional(),
  email: Joi.string().optional(),
  position: Joi.string().optional()
}).required()

const TWO_DECIMAL_PLACES = 2

export const maxTwoDecimalPlaces = (value, helpers) => {
  if (toDecimal(value).decimalPlaces() > TWO_DECIMAL_PLACES) {
    return helpers.error('number.maxDecimalPlaces')
  }
  return value
}

// manual-entry fields are populated by the user via the reporting journey.
export const prnManualFields = {
  totalRevenue: Joi.number().min(0).allow(null).custom(maxTwoDecimalPlaces),
  freeTonnage: wholeTonnage().allow(null)
}

export const recyclingManualFields = {
  tonnageRecycled: tonnage().allow(null).custom(maxTwoDecimalPlaces),
  tonnageNotRecycled: tonnage().allow(null).custom(maxTwoDecimalPlaces)
}

export const exportManualFields = {
  tonnageReceivedNotExported: tonnage().allow(null)
}

export const prnSchema = Joi.object({
  issuedTonnage: wholeTonnage().required(),
  averagePricePerTonne: Joi.number().min(0).allow(null),
  ...prnManualFields
}).optional()

const supplierSchema = Joi.object({
  supplierName: Joi.string().allow(null).optional(),
  facilityType: Joi.string().allow(null).optional(),
  supplierAddress: Joi.string().allow(null).optional(),
  supplierPhone: Joi.string().allow(null).optional(),
  supplierEmail: Joi.string().allow(null).optional(),
  tonnageReceived: tonnage().required()
})

export const recyclingActivitySchema = Joi.object({
  suppliers: Joi.array().items(supplierSchema).required(),
  totalTonnageReceived: tonnage().required(),
  ...recyclingManualFields
}).required()

const overseasSiteSchema = Joi.object({
  orsId: Joi.string().required(),
  siteName: Joi.string().allow(null).required(),
  country: Joi.string().allow(null).required(),
  tonnageExported: tonnage().required(),
  approved: Joi.boolean().required()
})

const unapprovedOverseasSiteSchema = Joi.object({
  orsId: Joi.string().required(),
  tonnageExported: tonnage().required()
})

export const exportActivitySchema = Joi.object({
  overseasSites: Joi.array().items(overseasSiteSchema).required(),
  unapprovedOverseasSites: Joi.array()
    .items(unapprovedOverseasSiteSchema)
    .required(),
  totalTonnageExported: tonnage().required(),
  tonnageRefusedAtDestination: tonnage().required(),
  tonnageStoppedDuringExport: tonnage().required(),
  totalTonnageRefusedOrStopped: tonnage().required(),
  tonnageRepatriated: tonnage().required(),
  ...exportManualFields
}).optional()

const finalDestinationSchema = Joi.object({
  recipientName: Joi.string().allow(null).optional(),
  facilityType: Joi.string().allow(null).optional(),
  address: Joi.string().allow(null).optional(),
  tonnageSentOn: tonnage().required()
})

const wasteSentSchema = Joi.object({
  tonnageSentToReprocessor: tonnage().required(),
  tonnageSentToExporter: tonnage().required(),
  tonnageSentToAnotherSite: tonnage().required(),
  finalDestinations: Joi.array().items(finalDestinationSchema).required()
}).required()

const reportDataFieldsSchema = {
  source: Joi.object({
    summaryLogId: Joi.string().allow(null),
    lastUploadedAt: Joi.string().isoDate().allow(null)
  }).required(),
  recyclingActivity: recyclingActivitySchema,
  exportActivity: exportActivitySchema,
  wasteSent: wasteSentSchema,
  prn: prnSchema.allow(null).required(),
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
  submissionNumber: Joi.number().integer().min(1).default(1),
  changedBy: userSummarySchema,
  ...reportDataFieldsSchema
})

const updatableFieldsSchema = Joi.object({
  supportingInformation: Joi.string().allow(''),
  prn: prnSchema.fork('issuedTonnage', (s) => s.optional()),
  exportActivity: Joi.object({
    tonnageReceivedNotExported: tonnage()
      .allow(null)
      .custom(maxTwoDecimalPlaces)
  }),
  recyclingActivity: Joi.object({
    tonnageRecycled: tonnage().allow(null).custom(maxTwoDecimalPlaces),
    tonnageNotRecycled: tonnage().allow(null).custom(maxTwoDecimalPlaces)
  }).unknown(true)
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
  submissionNumber: Joi.number().integer().min(1).default(1),
  changedBy: userSummarySchema
})

export const updateReportStatusSchema = Joi.object({
  reportId: Joi.string().required(),
  version: Joi.number().integer().min(1).required(),
  status: Joi.string()
    .valid(...Object.values(REPORT_STATUS))
    .required(),
  changedBy: userSummarySchema.required(),
  submissionDeclaredBy: Joi.string().min(2).when('status', {
    is: REPORT_STATUS.SUBMITTED,
    then: Joi.required(),
    otherwise: Joi.forbidden()
  })
})

export const findPeriodicReportsSchema = Joi.object({
  organisationId: MONGO_ID_SCHEMA,
  registrationId: MONGO_ID_SCHEMA
})

export const findReportByIdSchema = Joi.string()
  .guid({ version: 'uuidv4' })
  .required()

export const markActiveReportsStaleSchema = Joi.object({
  organisationId: MONGO_ID_SCHEMA,
  registrationId: MONGO_ID_SCHEMA,
  summaryLogId: Joi.string().required(),
  uploadedAt: Joi.string().isoDate().required()
})

export const markSubmittedReportsRequiringResubmissionSchema = Joi.object({
  organisationId: MONGO_ID_SCHEMA,
  registrationId: MONGO_ID_SCHEMA,
  summaryLogId: Joi.string().required(),
  uploadedAt: Joi.string().isoDate().required(),
  periods: Joi.array().items(periodRefSchema).required()
})
