import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { logger } from '#common/helpers/logging/logger.js'

/**
 * Mapping between spreadsheet material values and registration material types
 */
const SPREADSHEET_MATERIAL_TO_REGISTRATION_MATERIAL = {
  Aluminium: 'aluminium',
  Fibre_based_composite: 'fibre',
  Glass: 'glass',
  Paper_and_board: 'paper',
  Plastic: 'plastic',
  Steel: 'steel',
  Wood: 'wood'
}

const VALID_REGISTRATION_MATERIALS = Object.values(
  SPREADSHEET_MATERIAL_TO_REGISTRATION_MATERIAL
)

/**
 * Validates that the material in the spreadsheet matches the registration's material type
 *
 * @param {Object} params
 * @param {Object} params.parsed - The parsed summary log structure from the parser
 * @param {Object} params.registration - The registration object from the organisations repository
 * @param {string} params.loggingContext - Logging context message
 * @throws {Error} If validation fails
 */
export const validateSummaryLogMaterialType = ({
  parsed,
  registration,
  loggingContext
}) => {
  const { material } = registration
  const spreadsheetMaterial = parsed?.meta?.MATERIAL?.value

  if (!spreadsheetMaterial) {
    throw new Error('Invalid summary log: missing material')
  }

  if (!VALID_REGISTRATION_MATERIALS.includes(material)) {
    logger.error({
      message: `Unexpected registration material: ${loggingContext}, material=${material}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.PROCESS_FAILURE
      }
    })
  }

  const expectedRegistrationMaterial =
    SPREADSHEET_MATERIAL_TO_REGISTRATION_MATERIAL[spreadsheetMaterial]
  if (expectedRegistrationMaterial !== material) {
    throw new Error('Material does not match registration material')
  }

  logger.info({
    message: `Validated material: ${loggingContext}, spreadsheetMaterial=${spreadsheetMaterial}, registrationMaterial=${material}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })
}
