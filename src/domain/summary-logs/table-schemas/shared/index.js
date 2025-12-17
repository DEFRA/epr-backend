export {
  MESSAGES,
  YES_NO_VALUES,
  DROPDOWN_PLACEHOLDER
} from './joi-messages.js'
export { areNumbersEqual, isProductCorrect } from './number-validation.js'
export { createRowIdSchema } from './row-id.schema.js'

// Field schema factories
export {
  createWeightFieldSchema,
  createYesNoFieldSchema,
  createDateFieldSchema,
  createThreeDigitIdSchema,
  createPercentageFieldSchema,
  createAlphanumericFieldSchema,
  createEnumFieldSchema
} from './field-schemas.js'

// Shared field definitions
export {
  SENT_ON_LOADS_FIELDS,
  RECEIVED_LOADS_FOR_REPROCESSING_FIELDS
} from './fields.js'

// Schema factories
export { createSentOnLoadsSchema } from './sent-on-loads-schema.js'

// Enums
export { EWC_CODES } from './enums/ewc-codes.js'
export { RECYCLABLE_PROPORTION_METHODS } from './enums/recyclable-proportion-methods.js'
export { WASTE_DESCRIPTIONS } from './enums/waste-descriptions.js'
export { BASEL_CODES } from './enums/basel-codes.js'
export { EXPORT_CONTROLS } from './enums/export-controls.js'
