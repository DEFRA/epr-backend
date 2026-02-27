import ExcelJS from 'exceljs'
import Joi from 'joi'

import {
  SpreadsheetValidationError,
  extractCellValue
} from '#adapters/parsers/summary-logs/exceljs-parser.js'

const ORS_SHEET_NAME = 'ORS ID Log'

/** Column indices (1-based, matching Excel columns B-K) */
const COL = Object.freeze({
  ORS_ID: 2,
  COUNTRY: 3,
  NAME: 4,
  LINE1: 5,
  LINE2: 6,
  TOWN_OR_CITY: 7,
  STATE_OR_REGION: 8,
  POSTCODE: 9,
  COORDINATES: 10,
  VALID_FROM: 11
})

/** Metadata row numbers and the column holding the value */
const META_ROW = Object.freeze({
  PACKAGING_WASTE_CATEGORY: 4,
  ORG_ID: 5,
  REGISTRATION_NUMBER: 6,
  ACCREDITATION_NUMBER: 7
})
const META_VALUE_COL = 4

const DATA_START_ROW = 10

// The number branch handles numeric values and coercible strings (e.g. '42' → 42).
// The string branch catches strings that fail number coercion range checks
// (e.g. '000' coerces to 0 which fails min(1), then falls through here).
const orsIdSchema = Joi.alternatives().try(
  Joi.number().integer().min(1).max(999),
  Joi.string()
    .pattern(/^\d{1,3}$/)
    .custom((value) => {
      const num = parseInt(value, 10)
      if (num < 1 || num > 999) {
        throw new Error('ORS ID must be between 1 and 999')
      }
      return value
    })
)

const siteRowSchema = Joi.object({
  orsId: orsIdSchema.required(),
  country: Joi.string().required(),
  name: Joi.string().required(),
  address: Joi.object({
    line1: Joi.string().required(),
    line2: Joi.string().allow(null),
    townOrCity: Joi.string().required(),
    stateOrRegion: Joi.string().allow(null),
    postcode: Joi.string().allow(null)
  }).required(),
  coordinates: Joi.string().allow(null),
  validFrom: Joi.string().allow(null)
}).prefs({ abortEarly: false })

/**
 * Converts a cell value to a trimmed string or null.
 */
const cellToString = (cellValue) => {
  const extracted = extractCellValue(cellValue)
  if (extracted === null || extracted === undefined || extracted === '') {
    return null
  }
  const str = String(extracted).trim()
  return str === '' ? null : str
}

/**
 * Converts a cell value preserving its original type (for org ID which may be numeric).
 */
const cellToValue = (cellValue) => {
  const extracted = extractCellValue(cellValue)
  if (extracted === null || extracted === undefined || extracted === '') {
    return null
  }
  return extracted
}

/**
 * Zero-pads an ORS ID to three digits.
 */
const zeroPadOrsId = (orsId) => {
  const num = typeof orsId === 'string' ? parseInt(orsId, 10) : orsId
  return String(num).padStart(3, '0')
}

/**
 * Extracts metadata from the fixed header rows.
 */
const extractMetadata = (worksheet) => ({
  packagingWasteCategory: cellToString(
    worksheet.getRow(META_ROW.PACKAGING_WASTE_CATEGORY).getCell(META_VALUE_COL)
      .value
  ),
  orgId: cellToValue(
    worksheet.getRow(META_ROW.ORG_ID).getCell(META_VALUE_COL).value
  ),
  registrationNumber: cellToString(
    worksheet.getRow(META_ROW.REGISTRATION_NUMBER).getCell(META_VALUE_COL).value
  ),
  accreditationNumber: cellToString(
    worksheet.getRow(META_ROW.ACCREDITATION_NUMBER).getCell(META_VALUE_COL)
      .value
  )
})

/**
 * Determines whether a data row is a placeholder (ORS ID only, no other content).
 */
const isPlaceholderRow = (row) => {
  for (let col = COL.COUNTRY; col <= COL.VALID_FROM; col++) {
    const val = cellToString(row.getCell(col).value)
    if (val !== null) {
      return false
    }
  }
  return true
}

/**
 * Extracts a structured site object from a worksheet row.
 */
const extractSiteFromRow = (row) => {
  const rawOrsId = cellToValue(row.getCell(COL.ORS_ID).value)
  const postcode = cellToValue(row.getCell(COL.POSTCODE).value)
  const validFromRaw = cellToString(row.getCell(COL.VALID_FROM).value)

  return {
    orsId: rawOrsId,
    country: cellToString(row.getCell(COL.COUNTRY).value),
    name: cellToString(row.getCell(COL.NAME).value),
    address: {
      line1: cellToString(row.getCell(COL.LINE1).value),
      line2: cellToString(row.getCell(COL.LINE2).value),
      townOrCity: cellToString(row.getCell(COL.TOWN_OR_CITY).value),
      stateOrRegion: cellToString(row.getCell(COL.STATE_OR_REGION).value),
      postcode: postcode !== null ? String(postcode) : null
    },
    coordinates: cellToString(row.getCell(COL.COORDINATES).value),
    validFrom: validFromRaw
  }
}

/**
 * Converts Joi validation errors to row-level error objects.
 */
const joiErrorsToRowErrors = (joiError, rowNumber) =>
  joiError.details.map((detail) => ({
    rowNumber,
    field: detail.path.join('.'),
    message: detail.message
  }))

/**
 * Parses an ORS spreadsheet buffer and returns structured site data.
 *
 * @param {Buffer} buffer - Excel file buffer
 * @returns {Promise<{metadata: Object, sites: Array, errors: Array}>}
 * @throws {SpreadsheetValidationError} For file-level structural failures
 */
export const parse = async (buffer) => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(
    /** @type {import('exceljs').Buffer} */ (/** @type {unknown} */ (buffer))
  )

  const worksheet = workbook.getWorksheet(ORS_SHEET_NAME)
  if (!worksheet) {
    throw new SpreadsheetValidationError(
      `Missing required '${ORS_SHEET_NAME}' worksheet`
    )
  }

  const metadata = extractMetadata(worksheet)

  if (!metadata.registrationNumber) {
    throw new SpreadsheetValidationError(
      'Spreadsheet is missing a registration number (expected in row 6, column D)'
    )
  }

  const sites = []
  const errors = []
  const seenOrsIds = new Set()

  for (let rowNum = DATA_START_ROW; rowNum <= worksheet.rowCount; rowNum++) {
    const row = worksheet.getRow(rowNum)
    const orsIdRaw = cellToValue(row.getCell(COL.ORS_ID).value)

    // Skip completely empty rows
    if (orsIdRaw === null && isPlaceholderRow(row)) {
      continue
    }

    // Skip placeholder rows (ORS ID only)
    if (isPlaceholderRow(row)) {
      continue
    }

    const site = extractSiteFromRow(row)
    const { error } = siteRowSchema.validate(site)

    if (error) {
      errors.push(...joiErrorsToRowErrors(error, rowNum))
    } else {
      const paddedId = zeroPadOrsId(site.orsId)

      if (seenOrsIds.has(paddedId)) {
        errors.push({
          rowNumber: rowNum,
          field: 'orsId',
          message: `Duplicate ORS ID: ${paddedId}`
        })
      } else {
        seenOrsIds.add(paddedId)
        sites.push({
          ...site,
          rowNumber: rowNum,
          orsId: paddedId
        })
      }
    }
  }

  return { metadata, sites, errors }
}
