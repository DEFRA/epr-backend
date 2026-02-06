/**
 * @typedef {object} BuildMetaOptions
 * @property {string} [registrationNumber]
 * @property {string} [processingType]
 * @property {string} [material]
 * @property {number} [templateVersion]
 * @property {string} [accreditationNumber]
 * @property {string} [sheet]
 */

/**
 * @param {BuildMetaOptions} options
 */
export const buildMeta = ({
  registrationNumber = 'REG-123',
  processingType,
  material = 'Paper_and_board',
  templateVersion = 5,
  accreditationNumber = 'ACC-123',
  sheet = 'Cover'
} = {}) => ({
  REGISTRATION_NUMBER: {
    value: registrationNumber,
    location: { sheet, row: 1, column: 'B' }
  },
  PROCESSING_TYPE: {
    value: processingType,
    location: { sheet, row: 2, column: 'B' }
  },
  MATERIAL: {
    value: material,
    location: { sheet, row: 3, column: 'B' }
  },
  TEMPLATE_VERSION: {
    value: templateVersion,
    location: { sheet, row: 4, column: 'B' }
  },
  ACCREDITATION_NUMBER: {
    value: accreditationNumber,
    location: { sheet, row: 5, column: 'B' }
  }
})

export const createStandardMeta = (processingType) =>
  buildMeta({ processingType })

export const createWasteBalanceMeta = (processingType, options = {}) =>
  buildMeta({
    registrationNumber: 'REG-12345',
    processingType,
    accreditationNumber: 'ACC-2025-001',
    sheet: 'Data',
    ...options
  })
