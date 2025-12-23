import Joi from 'joi'
import {
  REG_ACC_STATUS,
  WASTE_PERMIT_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  getRegAccKey,
  isAccreditationForRegistration
} from '#formsubmission/submission-keys.js'

export const whenReprocessor = (schema) =>
  Joi.when('wasteProcessingType', {
    is: WASTE_PROCESSING_TYPE.REPROCESSOR,
    then: schema.required(),
    otherwise: Joi.forbidden()
  })

export const whenExporter = (schema) =>
  Joi.when('wasteProcessingType', {
    is: WASTE_PROCESSING_TYPE.EXPORTER,
    then: schema.required(),
    otherwise: Joi.forbidden()
  })

export const requiredForReprocessor = (baseSchema) =>
  baseSchema.when('wasteProcessingType', {
    is: WASTE_PROCESSING_TYPE.REPROCESSOR,
    then: Joi.required(),
    otherwise: Joi.forbidden()
  })

export const requiredForReprocessorOptionalForExporter = (schema) =>
  Joi.when('wasteProcessingType', {
    is: WASTE_PROCESSING_TYPE.REPROCESSOR,
    then: schema.required(),
    otherwise: schema.optional()
  })

export const requiredForExporterOptionalForReprocessor = (schema) =>
  Joi.when('wasteProcessingType', {
    is: WASTE_PROCESSING_TYPE.EXPORTER,
    then: schema.required(),
    otherwise: schema.optional()
  })

export const whenMaterial = (material, schema) =>
  Joi.when('material', {
    is: material,
    then: schema.required(),
    otherwise: Joi.valid(null).optional()
  })

export const requiredForPermitAndReprocessor = (schema) =>
  Joi.when('type', {
    is: Joi.valid(
      WASTE_PERMIT_TYPE.ENVIRONMENTAL_PERMIT,
      WASTE_PERMIT_TYPE.INSTALLATION_PERMIT
    ),
    then: Joi.when('....wasteProcessingType', {
      is: WASTE_PROCESSING_TYPE.REPROCESSOR,
      then: schema.required(),
      otherwise: Joi.forbidden()
    }),
    otherwise: Joi.forbidden()
  })

export const requiredForWasteExemptionAndReprocessor = (schema) =>
  Joi.when('type', {
    is: WASTE_PERMIT_TYPE.WASTE_EXEMPTION,
    then: Joi.when('....wasteProcessingType', {
      is: WASTE_PROCESSING_TYPE.REPROCESSOR,
      then: schema.required(),
      otherwise: Joi.forbidden()
    }),
    otherwise: Joi.forbidden()
  })

export const requiredWhenApprovedOrSuspended = {
  switch: [
    { is: REG_ACC_STATUS.APPROVED, then: Joi.required().invalid(null) },
    { is: REG_ACC_STATUS.SUSPENDED, then: Joi.required().invalid(null) }
  ],
  otherwise: Joi.optional().allow(null)
}

export const dateRequiredWhenApprovedOrSuspended = () =>
  Joi.date().iso().when('status', requiredWhenApprovedOrSuspended).default(null)

function findAccreditationsWithoutApprovedRegistration(
  accreditations,
  registrations
) {
  return accreditations
    .filter((acc) => acc.status === REG_ACC_STATUS.APPROVED)
    .filter((acc) => {
      const hasApprovedRegistration = registrations.some(
        (reg) =>
          reg.accreditationId === acc.id &&
          reg.status === REG_ACC_STATUS.APPROVED &&
          isAccreditationForRegistration(acc, reg)
      )
      return !hasApprovedRegistration
    })
}

function findDuplicateApprovals(items) {
  const grouped = Object.groupBy(
    items.filter((item) => item.status === REG_ACC_STATUS.APPROVED),
    (item) => getRegAccKey(item)
  )

  return Object.entries(grouped).filter(([_key, group]) => group.length > 1)
}

function formatDuplicateError(duplicates, itemType) {
  const keys = duplicates.map(([key]) => key).join(', ')
  const ids = duplicates
    .flatMap(([_key, group]) => group.map((item) => item.id))
    .join(', ')
  return `Multiple approved ${itemType} found with duplicate keys [${keys}]: ${ids}`
}

export function validateApprovals(value, helpers) {
  const errorMessages = []

  // Check if approved accreditations have linked registrations
  const accWithoutReg = findAccreditationsWithoutApprovedRegistration(
    value.accreditations,
    value.registrations
  )

  if (accWithoutReg.length > 0) {
    const ids = accWithoutReg.map((acc) => acc.id).join(', ')
    errorMessages.push(
      `Accreditations with id ${ids} are approved but not linked to an approved registration`
    )
  }

  // Check for duplicate approved accreditations
  const accDuplicates = findDuplicateApprovals(value.accreditations)
  if (accDuplicates.length > 0) {
    errorMessages.push(formatDuplicateError(accDuplicates, 'accreditations'))
  }

  // Check for duplicate approved registrations
  const regDuplicates = findDuplicateApprovals(value.registrations)
  if (regDuplicates.length > 0) {
    errorMessages.push(formatDuplicateError(regDuplicates, 'registrations'))
  }

  if (errorMessages.length > 0) {
    return helpers.error('organisation.validationErrors', {
      message: errorMessages.join('; ')
    })
  }

  return value
}

export const approvalValidationMessages = {
  'organisation.validationErrors': '{{#message}}'
}
