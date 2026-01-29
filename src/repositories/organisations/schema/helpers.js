import Joi from 'joi'
import {
  MATERIAL,
  REG_ACC_STATUS,
  WASTE_PERMIT_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { statusHistoryItemSchema } from './base.js'
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
 * GLASS SPLIT MIGRATION WORKAROUND (PAE-840 / Defra-5av8)
 *
 * Glass registrations/accreditations with both 'remelt' and 'other' processing types
 * were originally stored as single records. A migration splits these into two separate
 * records - but the new 'other' record gets a fresh ID. Without special handling, the
 * repository layer would reset its status to 'created' (as it does for all new items).
 *
 * This schema allows the migration to pass through the original statusHistory, but ONLY
 * for glass items with split suffixes (GR = glass remelt, GO = glass other). For all
 * other items, statusHistory is silently stripped because the repository layer manages
 * it internally - callers don't need to worry about removing it from their input.
 *
 * @param {string} numberFieldName - The field containing the reg/acc number (e.g. 'registrationNumber')
 * @returns {Joi.Schema} Schema that preserves statusHistory only for glass splits
 */
export const statusHistoryOnlyForGlassSplitMigration = (numberFieldName) =>
  Joi.array()
    .items(statusHistoryItemSchema)
    .when('material', {
      is: MATERIAL.GLASS,
      then: Joi.when(numberFieldName, {
        is: Joi.string().pattern(/G[RO]$/),
        then: Joi.optional(),
        otherwise: Joi.strip()
      }),
      otherwise: Joi.strip()
    })
