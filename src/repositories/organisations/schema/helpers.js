import Joi from 'joi'
import {
  MATERIAL,
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

/**
 * Glass registrations can be split into remelt and other processes,
 * which should be treated as distinct entities for duplicate detection.
 *
 * @param {import('#formsubmission/types.js').RegistrationOrAccreditation} item
 * @returns {string}
 */
function getDuplicateDetectionKey(item) {
  const baseKey = getRegAccKey(item)

  if (item.material === MATERIAL.GLASS && item.glassRecyclingProcess?.[0]) {
    return `${baseKey}::${item.glassRecyclingProcess[0]}`
  }

  return baseKey
}

function findDuplicateApprovals(items) {
  const grouped = Object.groupBy(
    items.filter((item) => item.status === REG_ACC_STATUS.APPROVED),
    (item) => getDuplicateDetectionKey(item)
  )

  return Object.entries(grouped).filter(
    // Object.entries yields only keys that exist, so group is always present
    ([_key, group]) => /** @type {typeof items} */ (group).length > 1
  )
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

/**
 * Validates that specific fields in array items have not been modified.
 * Matches items by 'id' rather than array index to allow safe deletions.
 *
 * @param {string[]} fields - List of field names that cannot be modified.
 */
export const validateImmutableFields = (fields) => (value, helpers) => {
  const original = helpers.prefs.context?.original
  if (!original) {
    return value
  }

  // Identify which array we are validating (e.g. 'registrations', 'accreditations')
  const key = helpers.state.path.at(-1)
  const originalItems = original[key]

  if (!Array.isArray(originalItems)) {
    return value
  } 

  // Create a map of existing items for O(1) lookup
  const originalItemsMap = new Map(originalItems.map((i) => [String(i.id), i]))

  for (const item of value) {
    // If item has no ID or is new, skip checks
    if (!item.id) {
      continue
    }

    const originalItem = originalItemsMap.get(String(item.id))

    // Only check if we found a matching ID (validation against persistence)
    if (!originalItem) {
      continue
    }

    for (const field of fields) {
      // strict equality check
      if (
        JSON.stringify(item[field]) !== JSON.stringify(originalItem[field])
      ) {
        return helpers.error('any.invalid', {
          message: `Field '${field}' cannot be modified` // Joi will use this as a custom error message
        })
      }
    }
  }

  return value
}
