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

/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {RegistrationOrAccreditation} from '#domain/organisations/model.js' */

export const PREVIOUS_SCHEMA_VERSION = 2
export const CURRENT_SCHEMA_VERSION = 3

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
 * @param {RegistrationOrAccreditation[]} items
 * @returns {[string, RegistrationOrAccreditation[]][]}
 */
function findDuplicateApprovals(items) {
  const grouped = Object.groupBy(
    items.filter((item) => item.status === REG_ACC_STATUS.APPROVED),
    (item) => getRegAccKey(item)
  )

  return (
    /** @type {[string, RegistrationOrAccreditation[]][]} */
    (Object.entries(grouped)).filter(([, group]) => group.length > 1)
  )
}

function formatDuplicateError(duplicates, itemType) {
  const keys = duplicates.map(([key]) => key).join(', ')
  const ids = duplicates
    .flatMap(([_key, group]) => group.map((item) => item.id))
    .join(', ')
  return `Multiple approved ${itemType} found with duplicate keys [${keys}]: ${ids}`
}

/**
 * @param {Registration[]} registrations
 * @returns {[string, Registration[]][]}
 */
function findAccreditationIdsLinkedToMultipleRegistrations(registrations) {
  const linkedRegistrations = registrations.filter(
    (reg) => reg.accreditationId !== undefined && reg.accreditationId !== null
  )

  const grouped = Object.groupBy(
    linkedRegistrations,
    (reg) => /** @type {string} */ (reg.accreditationId)
  )

  return (
    /** @type {[string, Registration[]][]} */
    (Object.entries(grouped)).filter(([, regs]) => regs.length > 1)
  )
}

/**
 * @param {Registration[]} registrations
 */
export function validateAccreditationLinkUniqueness(registrations) {
  const duplicates =
    findAccreditationIdsLinkedToMultipleRegistrations(registrations)

  if (duplicates.length === 0) {
    return
  }

  const details = duplicates
    .map(
      ([accId, regs]) =>
        `accreditation ${accId} linked to registrations ${regs.map((reg) => reg.id).join(', ')}`
    )
    .join('; ')
  throw Boom.badData(
    `Each accreditation must be linked to at most one registration: ${details}`
  )
}

/**
 * @param {Registration[]} registrations
 * @param {import('#domain/organisations/accreditation.js').Accreditation[]} accreditations
 */
export function validateAccreditationLinkExists(registrations, accreditations) {
  const accreditationIds = new Set(accreditations.map((acc) => acc.id))

  const missing = registrations.filter(
    (reg) => !!reg.accreditationId && !accreditationIds.has(reg.accreditationId)
  )

  if (missing.length === 0) {
    return
  }

  const details = missing
    .map(
      (reg) => `registration ${reg.id} -> accreditation ${reg.accreditationId}`
    )
    .join('; ')
  throw Boom.badData(
    `Registrations are linked to accreditations that do not exist: ${details}`
  )
}

/**
 * @param {Registration[]} registrations
 * @param {import('#domain/organisations/accreditation.js').Accreditation[]} accreditations
 */
export function validateAccreditationLinkMatches(
  registrations,
  accreditations
) {
  const accreditationsById = new Map(accreditations.map((acc) => [acc.id, acc]))

  const mismatched = registrations.filter((reg) => {
    if (!reg.accreditationId) {
      return false
    }
    const acc = accreditationsById.get(reg.accreditationId)
    return acc !== undefined && !isAccreditationForRegistration(acc, reg)
  })

  if (mismatched.length === 0) {
    return
  }

  const details = mismatched
    .map(
      (reg) => `registration ${reg.id} -> accreditation ${reg.accreditationId}`
    )
    .join('; ')
  throw Boom.badData(
    `Registrations are linked to accreditations that do not match their type, material, or site: ${details}`
  )
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
      if (JSON.stringify(item[field]) !== JSON.stringify(originalItem[field])) {
        return helpers.error('any.invalid', {
          message: `Field '${field}' cannot be modified` // Joi will use this as a custom error message
        })
      }
    }
  }

  return value
}
