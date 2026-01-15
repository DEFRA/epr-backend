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
import Boom from '@hapi/boom'

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
  Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .custom((value, helpers) => {
      const date = new Date(value + 'T00:00:00.000Z')
      if (Number.isNaN(date.getTime())) {
        return helpers.error('string.pattern.base')
      }
      return value
    })
    .messages({ 'string.pattern.base': 'Date must be in YYYY-MM-DD format' })
    .when('status', requiredWhenApprovedOrSuspended)
    .default(null)

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

export function validateApprovals(registrations, accreditations) {
  const errorMessages = []

  // Check if approved accreditations have linked registrations
  const accWithoutReg = findAccreditationsWithoutApprovedRegistration(
    accreditations,
    registrations
  )

  if (accWithoutReg.length > 0) {
    const ids = accWithoutReg.map((acc) => acc.id).join(', ')
    errorMessages.push(
      `Accreditations with id ${ids} are approved but not linked to an approved registration`
    )
  }

  // Check for duplicate approved accreditations
  const accDuplicates = findDuplicateApprovals(accreditations)
  if (accDuplicates.length > 0) {
    errorMessages.push(formatDuplicateError(accDuplicates, 'accreditations'))
  }

  // Check for duplicate approved registrations
  const regDuplicates = findDuplicateApprovals(registrations)
  if (regDuplicates.length > 0) {
    errorMessages.push(formatDuplicateError(regDuplicates, 'registrations'))
  }

  if (errorMessages.length > 0) {
    throw Boom.badData(errorMessages.join('; '))
  }
}

const NON_EDITABLE_KEYS = ['id']

export const makeEditable = (schema) => {
  if (!schema) {
    return schema
  }
  let newSchema = schema.clone()
  const description = newSchema.describe()

  // Heuristic: If schema has a specific type (not 'any') and has strict 'when' conditionals,
  // we strip the conditionals to fallback to the base type definition (making it permissive).
  // If the schema is effectively a conditional wrapper (type 'any' with 'whens'),
  // we try to unwrap the active branch (e.g. the 'then' branch that isn't forbidden)
  // to get the actual schema shape.
  if (newSchema.$_terms?.whens) {
    if (description.type && description.type !== 'any') {
      delete newSchema.$_terms.whens
    } else {
      // It's a conditional wrapper. Find the 'real' schema.
      const candidates = []
      newSchema.$_terms.whens.forEach((w) => {
        if (w.then) candidates.push(w.then)
        if (w.otherwise) candidates.push(w.otherwise)
        if (w.switch) {
          w.switch.forEach((s) => {
            if (s.then) candidates.push(s.then)
            if (s.otherwise) candidates.push(s.otherwise)
          })
        }
      })

      // Filter out forbidden branches to find the "permissive" intent
      const realSchema = candidates.find(
        (c) => c.describe().flags?.presence !== 'forbidden'
      )

      if (realSchema) {
        // Recurse on the unwrapped schema
        return makeEditable(realSchema)
      }
      
      // If we couldn't find a real schema, strip whens and fallback (likely becomes any)
      delete newSchema.$_terms.whens
    }
  }

  // Recursively handle Array items
  if (newSchema.$_terms?.items) {
    newSchema.$_terms.items = newSchema.$_terms.items.map((item) =>
      makeEditable(item)
    )
  }

  // Handle Object keys
  if (description.type === 'object' && description.keys) {
    const keys = Object.keys(description.keys)
    const nonEditable = keys.filter((k) => NON_EDITABLE_KEYS.includes(k))
    const editable = keys.filter((k) => !NON_EDITABLE_KEYS.includes(k))

    if (nonEditable.length > 0) {
      newSchema = newSchema.fork(nonEditable, (s) =>
        s.optional().allow(null).meta({ readOnly: true })
      )
    }
    if (editable.length > 0) {
      newSchema = newSchema.fork(editable, (s) => makeEditable(s))
    }
  }

  return newSchema.allow(null).optional()
}
