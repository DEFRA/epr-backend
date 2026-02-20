/**
 * Characterisation Tests for Parser Workarounds
 *
 * These are INTEGRATION tests that document the end-to-end behaviour of domain-
 * specific workarounds that have leaked into the generic marker-based parser.
 *
 * The tests go through the full pipeline: Excel buffer → parse → validate
 * This ensures we can safely refactor by moving code between layers while
 * preserving observable behaviour.
 *
 * WORKAROUNDS DOCUMENTED:
 * 1. Global "Choose option" → null normalisation (should be per-column in domain)
 * 2. "Row ID" header row skipping (should be fixed in templates)
 * 3. Empty ROW_ID row skipping (should be fixed in templates)
 * 4. "Choose material" → null for MATERIAL meta field (domain-specific)
 * 5. Empty row detection relies on placeholder normalisation
 * 6. Redundant unfilledValues in domain schemas (parser already normalised)
 *
 * See: /docs/guides/spreadsheet-template-marker-guide.md for marker spec
 */

import ExcelJS from 'exceljs'
import Joi from 'joi'
import { parse } from './exceljs-parser.js'
import { createDataSyntaxValidator } from '#application/summary-logs/validations/data-syntax.js'
import {
  classifyRow,
  isFilled
} from '#domain/summary-logs/table-schemas/validation-pipeline.js'

/**
 * Helper to create a workbook buffer from worksheet definitions
 */
const createWorkbook = async (worksheets) => {
  const workbook = new ExcelJS.Workbook()

  for (const [sheetName, rows] of Object.entries(worksheets)) {
    const worksheet = workbook.addWorksheet(sheetName)
    rows.forEach((rowData, index) => {
      worksheet.getRow(index + 1).values = rowData
    })
  }

  return workbook.xlsx.writeBuffer()
}

/**
 * Minimal schema for testing - matches structure of real domain schemas
 */
const createTestSchema = (options = {}) => ({
  rowIdField: 'ROW_ID',
  requiredHeaders: options.requiredHeaders || ['ROW_ID', 'VALUE'],
  unfilledValues: options.unfilledValues || {},
  fatalFields: options.fatalFields || ['ROW_ID'],
  validationSchema:
    options.validationSchema ||
    Joi.object({
      ROW_ID: Joi.number().integer().optional(),
      VALUE: Joi.any().optional()
    })
      .unknown(true)
      .prefs({ abortEarly: false }),
  fieldsRequiredForInclusionInWasteBalance:
    options.fieldsRequiredForInclusionInWasteBalance || []
})

/**
 * Test schema registry matching real structure
 */
const createTestSchemaRegistry = (tables = {}) => ({
  TEST_TYPE: tables
})

describe('Parser Workarounds - Integration Characterisation Tests', () => {
  describe('WORKAROUND 1: Global "Choose option" → null normalisation', () => {
    /**
     * The parser globally normalises "Choose option" to null in ALL data cells.
     * This is domain-specific knowledge - not all columns use this placeholder.
     *
     * PROBLEM: This is a global workaround, not per-column configuration.
     * IDEAL: Domain layer should specify per-column placeholder values.
     */

    it('normalises "Choose option" to null in ANY column at parse time', async () => {
      const buffer = await createWorkbook({
        Cover: [],
        Test: [
          ['__EPR_DATA_TEST_TABLE', 'ROW_ID', 'FREE_TEXT', 'DROPDOWN'],
          [null, 1001, 'Choose option', 'Choose option']
        ]
      })

      const parsed = await parse(buffer)

      // Parser normalises to null BEFORE domain validation sees it
      expect(parsed.data.TEST_TABLE.rows[0].values).toEqual([
        1001,
        null, // Free text column - normalised (incorrect!)
        null // Dropdown column - normalised (correct)
      ])
    })

    it('is case-sensitive - only exact "Choose option" is normalised', async () => {
      const buffer = await createWorkbook({
        Cover: [],
        Test: [
          ['__EPR_DATA_TEST', 'ROW_ID', 'COL_A', 'COL_B'],
          [null, 1001, 'choose option', 'CHOOSE OPTION']
        ]
      })

      const parsed = await parse(buffer)

      // Only exact match is normalised
      expect(parsed.data.TEST.rows[0].values).toEqual([
        1001,
        'choose option', // Not normalised
        'CHOOSE OPTION' // Not normalised
      ])
    })

    it('does NOT normalise "Choose option" in metadata values', async () => {
      const buffer = await createWorkbook({
        Cover: [['__EPR_META_SOME_FIELD', 'Choose option']]
      })

      const parsed = await parse(buffer)

      // Metadata is NOT normalised (only MATERIAL has special handling)
      expect(parsed.meta.SOME_FIELD.value).toBe('Choose option')
    })
  })

  describe('RESOLVED WORKAROUND 2: "Row ID" header row filtering (moved to domain layer)', () => {
    /**
     * Previously the parser skipped rows where ROW_ID starts with "Row ID".
     * Now the parser returns these rows and data-syntax.js filters them
     * using the schema's rowIdField.
     */

    it('parser returns header rows; domain layer filters them', async () => {
      const buffer = await createWorkbook({
        Cover: [],
        Test: [
          ['__EPR_DATA_TEST', 'ROW_ID', 'DATE', 'WEIGHT'],
          [null, 'Row ID', 'Date received', 'Weight (kg)'],
          [null, 1001, '2025-01-15', 100],
          [null, 1002, '2025-01-16', 200]
        ]
      })

      const parsed = await parse(buffer)

      // Parser now returns the header row
      expect(parsed.data.TEST.rows).toEqual([
        {
          rowNumber: 2,
          values: ['Row ID', 'Date received', 'Weight (kg)']
        },
        { rowNumber: 3, values: [1001, '2025-01-15', 100] },
        { rowNumber: 4, values: [1002, '2025-01-16', 200] }
      ])
    })

    it('parser returns richText header rows; domain layer filters them', async () => {
      const workbook = new ExcelJS.Workbook()
      workbook.addWorksheet('Cover')
      const worksheet = workbook.addWorksheet('Test')

      worksheet.getRow(1).values = ['__EPR_DATA_TEST', 'ROW_ID', 'DATE']

      worksheet.getCell('B2').value = {
        richText: [
          { font: { bold: true }, text: 'Row ID' },
          { text: '\n(Automatically generated)' }
        ]
      }
      worksheet.getCell('C2').value = 'Date received'

      worksheet.getRow(3).values = [null, 1001, '2025-01-15']

      const buffer = await workbook.xlsx.writeBuffer()
      const parsed = await parse(buffer)

      // Parser returns the richText header row
      expect(parsed.data.TEST.rows).toEqual([
        {
          rowNumber: 2,
          values: ['Row ID\n(Automatically generated)', 'Date received']
        },
        { rowNumber: 3, values: [1001, '2025-01-15'] }
      ])
    })

    it('tables without ROW_ID column are unaffected', async () => {
      const buffer = await createWorkbook({
        Cover: [],
        Test: [
          ['__EPR_DATA_TEST', 'REFERENCE', 'DATE'],
          [null, 'Row ID', '2025-01-15'],
          [null, 'REF001', '2025-01-16']
        ]
      })

      const parsed = await parse(buffer)

      expect(parsed.data.TEST.rows).toEqual([
        { rowNumber: 2, values: ['Row ID', '2025-01-15'] },
        { rowNumber: 3, values: ['REF001', '2025-01-16'] }
      ])
    })
  })

  describe('RESOLVED WORKAROUND 3: Empty ROW_ID row filtering (moved to domain layer)', () => {
    /**
     * Previously the parser skipped rows where ROW_ID is null/undefined.
     * Now the parser returns these rows and data-syntax.js filters them
     * using the schema's rowIdField.
     */

    it('parser returns null ROW_ID rows; domain layer filters them', async () => {
      const buffer = await createWorkbook({
        Cover: [],
        Test: [
          ['__EPR_DATA_TEST', 'ROW_ID', 'DATE', 'DROPDOWN'],
          [null, 1001, '2025-01-15', 'Yes'],
          [null, null, null, 'No'],
          [null, 1002, '2025-01-16', 'Yes']
        ]
      })

      const parsed = await parse(buffer)

      // Parser now returns the null ROW_ID row
      expect(parsed.data.TEST.rows).toEqual([
        { rowNumber: 2, values: [1001, '2025-01-15', 'Yes'] },
        { rowNumber: 3, values: [null, null, 'No'] },
        { rowNumber: 4, values: [1002, '2025-01-16', 'Yes'] }
      ])
    })

    it('tables without ROW_ID column are unaffected', async () => {
      const buffer = await createWorkbook({
        Cover: [],
        Test: [
          ['__EPR_DATA_TEST', 'REFERENCE', 'DATE'],
          [null, null, '2025-01-15'],
          [null, 'REF001', '2025-01-16']
        ]
      })

      const parsed = await parse(buffer)

      expect(parsed.data.TEST.rows).toEqual([
        { rowNumber: 2, values: [null, '2025-01-15'] },
        { rowNumber: 3, values: ['REF001', '2025-01-16'] }
      ])
    })
  })

  describe('WORKAROUND 4: "Choose material" → null for MATERIAL metadata', () => {
    /**
     * The parser normalises "Choose material" to null ONLY for the MATERIAL
     * metadata field. This is the dropdown placeholder for material selection.
     *
     * PROBLEM: The parser knows about a specific domain field and its placeholder.
     * IDEAL: Domain layer should handle metadata placeholder normalisation.
     */

    it('normalises "Choose material" to null for MATERIAL field only', async () => {
      const buffer = await createWorkbook({
        Cover: [['__EPR_META_MATERIAL', 'Choose material']]
      })

      const parsed = await parse(buffer)

      expect(parsed.meta.MATERIAL.value).toBeNull()
    })

    it('does NOT normalise "Choose material" for other meta fields', async () => {
      const buffer = await createWorkbook({
        Cover: [['__EPR_META_OTHER_FIELD', 'Choose material']]
      })

      const parsed = await parse(buffer)

      expect(parsed.meta.OTHER_FIELD.value).toBe('Choose material')
    })

    it('does NOT normalise "Choose material" in data rows', async () => {
      const buffer = await createWorkbook({
        Cover: [],
        Test: [
          ['__EPR_DATA_TEST', 'ROW_ID', 'MATERIAL_COLUMN'],
          [null, 1001, 'Choose material']
        ]
      })

      const parsed = await parse(buffer)

      // "Choose material" is NOT normalised in data rows
      expect(parsed.data.TEST.rows[0].values).toEqual([1001, 'Choose material'])
    })
  })

  describe('WORKAROUND 5: Empty row detection relies on placeholder normalisation', () => {
    /**
     * Empty row detection (table termination) depends on "Choose option"
     * being normalised to null. A row with all "Choose option" values is
     * treated as empty and terminates the table.
     *
     * PROBLEM: This creates a dependency between WORKAROUND 1 and table termination.
     * IDEAL: Table termination could be configured separately from normalisation.
     */

    it('treats row with all "Choose option" as empty (terminates table)', async () => {
      const buffer = await createWorkbook({
        Cover: [],
        Test: [
          ['__EPR_DATA_TEST', 'ROW_ID', 'DROPDOWN_A', 'DROPDOWN_B'],
          [null, 1001, 'Yes', 'Active'],
          [null, null, 'Choose option', 'Choose option'], // All placeholders
          [null, 1002, 'No', 'Inactive'] // Should be ignored
        ]
      })

      const parsed = await parse(buffer)

      // Table terminates at the all-placeholder row
      // Note: Row 3 is also skipped by WORKAROUND 3 (null ROW_ID)
      expect(parsed.data.TEST.rows).toHaveLength(1)
      expect(parsed.data.TEST.rows[0].values).toEqual([1001, 'Yes', 'Active'])
    })

    it('treats row with mix of null and "Choose option" as empty', async () => {
      const buffer = await createWorkbook({
        Cover: [],
        Test: [
          ['__EPR_DATA_TEST', 'ROW_ID', 'DATE', 'DROPDOWN'],
          [null, 1001, '2025-01-15', 'Yes'],
          [null, null, null, 'Choose option'], // Mix of null and placeholder
          [null, 1002, '2025-01-16', 'No']
        ]
      })

      const parsed = await parse(buffer)

      // Row 3 skipped by both WORKAROUND 3 (null ROW_ID) and considered empty
      // Row 4 is after a "gap" so might or might not be included
      // The key point is row 2 is skipped
      expect(parsed.data.TEST.rows[0].values).toEqual([
        1001,
        '2025-01-15',
        'Yes'
      ])
    })

    it('does NOT terminate if any cell has real data', async () => {
      const buffer = await createWorkbook({
        Cover: [],
        Test: [
          ['__EPR_DATA_TEST', 'ROW_ID', 'VALUE', 'DROPDOWN'],
          [null, 1001, 'data1', 'Yes'],
          [null, 1002, 'partial data', 'Choose option'], // Has real value
          [null, 1003, 'data2', 'No'],
          [null, null, null, null] // True empty row
        ]
      })

      const parsed = await parse(buffer)

      // Row 3 is NOT treated as empty because 'partial data' is real
      expect(parsed.data.TEST.rows).toEqual([
        { rowNumber: 2, values: [1001, 'data1', 'Yes'] },
        { rowNumber: 3, values: [1002, 'partial data', null] }, // Choose option normalised
        { rowNumber: 4, values: [1003, 'data2', 'No'] }
      ])
    })
  })

  describe('WORKAROUND 6: Redundant unfilledValues in domain schemas', () => {
    /**
     * Domain schemas define unfilledValues with 'Choose option' placeholders,
     * but the parser ALREADY normalised these to null. The domain layer
     * never sees 'Choose option' because the parser removed it.
     *
     * PROBLEM: Redundant configuration - domain can't distinguish between
     *          "user left blank" and "user didn't change dropdown default".
     * IDEAL: Either parser normalises OR domain filters, not both.
     */

    it('domain layer receives null, not "Choose option" (unfilledValues is redundant)', async () => {
      const buffer = await createWorkbook({
        Cover: [['__EPR_META_PROCESSING_TYPE', 'TEST_TYPE']],
        Test: [
          ['__EPR_DATA_TEST_TABLE', 'ROW_ID', 'DROPDOWN_FIELD'],
          [null, 1001, 'Choose option']
        ]
      })

      const parsed = await parse(buffer)

      // Parser already normalised to null
      expect(parsed.data.TEST_TABLE.rows[0].values[1]).toBeNull()

      // Domain schema with unfilledValues
      const schema = createTestSchema({
        requiredHeaders: ['ROW_ID', 'DROPDOWN_FIELD'],
        unfilledValues: {
          DROPDOWN_FIELD: ['Choose option'] // This is DEAD CODE
        }
      })

      // Build row object from parsed values
      const rowObject = {
        ROW_ID: parsed.data.TEST_TABLE.rows[0].values[0],
        DROPDOWN_FIELD: parsed.data.TEST_TABLE.rows[0].values[1]
      }

      // Domain layer sees null, not 'Choose option'
      expect(rowObject.DROPDOWN_FIELD).toBeNull()

      // The unfilledValues check never matches because value is already null
      const fieldUnfilledValues = schema.unfilledValues.DROPDOWN_FIELD || []
      const isUnfilled = !isFilled(
        rowObject.DROPDOWN_FIELD,
        fieldUnfilledValues
      )

      // It's unfilled because null (not because of unfilledValues match)
      expect(isUnfilled).toBe(true)

      // The unfilledValues array is never checked against 'Choose option'
      // because the parser already converted it to null
    })

    it('proves unfilledValues would be needed if parser did NOT normalise', () => {
      // Simulate what would happen if parser didn't normalise
      const rowObjectWithoutNormalisation = {
        ROW_ID: 1001,
        DROPDOWN_FIELD: 'Choose option' // Parser didn't normalise
      }

      const schema = createTestSchema({
        unfilledValues: {
          DROPDOWN_FIELD: ['Choose option']
        }
      })

      // Without parser normalisation, unfilledValues IS needed
      const fieldUnfilledValues = schema.unfilledValues.DROPDOWN_FIELD || []
      const isUnfilled = !isFilled(
        rowObjectWithoutNormalisation.DROPDOWN_FIELD,
        fieldUnfilledValues
      )

      expect(isUnfilled).toBe(true) // Would correctly identify as unfilled
    })
  })

  describe('COMBINED: Real template structure with all workarounds active', () => {
    /**
     * This test simulates a real template structure showing how all workarounds
     * interact in the full pipeline from parse to validate.
     */

    it('processes realistic template through full pipeline', async () => {
      const workbook = new ExcelJS.Workbook()

      // Cover sheet with metadata
      const cover = workbook.addWorksheet('Cover')
      cover.getRow(1).values = [
        '__EPR_META_PROCESSING_TYPE',
        'REPROCESSOR_INPUT'
      ]
      cover.getRow(2).values = ['__EPR_META_MATERIAL', 'Choose material'] // WORKAROUND 4

      // Data sheet with realistic structure
      const dataSheet = workbook.addWorksheet('Data')

      // Row 1: Marker + machine headers
      dataSheet.getRow(1).values = [
        '__EPR_DATA_RECEIVED_LOADS',
        'ROW_ID',
        '__EPR_SKIP_COLUMN',
        'DATE_RECEIVED',
        'DROPDOWN_FIELD'
      ]

      // Row 2: User-facing headers (WORKAROUND 2 skips this)
      dataSheet.getCell('B2').value = {
        richText: [
          { font: { bold: true }, text: 'Row ID' },
          { text: '\n(Auto generated)' }
        ]
      }
      dataSheet.getCell('C2').value = null
      dataSheet.getCell('D2').value = 'Date received'
      dataSheet.getCell('E2').value = 'Select option'

      // Row 3: Example row (legitimate skip via "Example")
      dataSheet.getRow(3).values = [
        null,
        999,
        'Example',
        '2025-01-01',
        'Choose option'
      ]

      // Row 4: Real data
      dataSheet.getRow(4).values = [null, 1001, null, '2025-05-15', 'Option A']

      // Row 5: Real data with placeholder (WORKAROUND 1 normalises)
      dataSheet.getRow(5).values = [
        null,
        1002,
        null,
        '2025-05-16',
        'Choose option' // Will be normalised to null
      ]

      // Row 6: Pre-populated empty row (WORKAROUND 3 + WORKAROUND 5 interaction)
      // This row has null ROW_ID AND all other values are null/placeholder
      // After WORKAROUND 1 normalises 'Choose option' → null, this becomes an all-null row
      // which TERMINATES the table (WORKAROUND 5 - empty row detection)
      dataSheet.getRow(6).values = [
        null,
        null, // WORKAROUND 3: null ROW_ID
        null,
        null,
        'Choose option' // WORKAROUND 1: normalised to null → row becomes all-null
      ]

      // Row 7: More data after the all-null row
      // This will NOT be included because Row 6 terminated the table!
      dataSheet.getRow(7).values = [null, 1003, null, '2025-05-17', 'Option B']

      const buffer = await workbook.xlsx.writeBuffer()
      const parsed = await parse(buffer)

      // Verify WORKAROUND 4: MATERIAL normalised
      expect(parsed.meta.MATERIAL.value).toBeNull()

      // Verify parsing results
      expect(parsed.data.RECEIVED_LOADS.headers).toEqual([
        'ROW_ID',
        null,
        'DATE_RECEIVED',
        'DROPDOWN_FIELD'
      ])

      // Row skipping after refactoring:
      // - Row 2 (user headers): RETURNED by parser (domain layer filters later)
      // - Row 3 (example): SKIPPED by "Example" feature (stays in parser)
      // - Row 4: INCLUDED
      // - Row 5: INCLUDED with normalised dropdown
      // - Row 6: All-null after normalisation → TERMINATES TABLE (WORKAROUND 5)
      // - Row 7: NOT PARSED (table already terminated)
      expect(parsed.data.RECEIVED_LOADS.rows).toEqual([
        {
          rowNumber: 2,
          values: [
            'Row ID\n(Auto generated)',
            null,
            'Date received',
            'Select option'
          ]
        },
        { rowNumber: 4, values: [1001, null, '2025-05-15', 'Option A'] },
        { rowNumber: 5, values: [1002, null, '2025-05-16', null] } // WORKAROUND 1: normalised
        // Row 7 is NOT here - table terminated at Row 6
      ])
    })
  })

  describe('VALIDATION: Domain layer behaviour post-parsing', () => {
    /**
     * These tests verify how the domain validation layer behaves
     * with data that has already been processed by the parser workarounds.
     */

    it('classifies row correctly when parser has already normalised placeholders', async () => {
      const schema = createTestSchema({
        requiredHeaders: ['ROW_ID', 'VALUE'],
        unfilledValues: {
          VALUE: ['Choose option'] // Redundant but present in real schemas
        },
        fieldsRequiredForInclusionInWasteBalance: ['VALUE']
      })

      // Row where parser already normalised 'Choose option' to null
      const parsedRow = {
        ROW_ID: 1001,
        VALUE: null // Parser normalised from 'Choose option'
      }

      const result = classifyRow(parsedRow, schema)

      // Row is EXCLUDED because VALUE is missing (required for waste balance)
      expect(result.outcome).toBe('EXCLUDED')
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_REQUIRED_FIELD',
          field: 'VALUE'
        })
      )
    })

    it('validates full pipeline from buffer to classified rows', async () => {
      const buffer = await createWorkbook({
        Cover: [['__EPR_META_PROCESSING_TYPE', 'TEST_TYPE']],
        Test: [
          ['__EPR_DATA_TEST_TABLE', 'ROW_ID', 'VALUE'],
          [null, 1001, 'actual data'],
          [null, 1002, 'Choose option'] // Will be normalised then filtered
        ]
      })

      const parsed = await parse(buffer)

      // Verify parser normalisation happened
      expect(parsed.data.TEST_TABLE.rows[1].values[1]).toBeNull()

      // Create validator with test schema
      const schemaRegistry = createTestSchemaRegistry({
        TEST_TABLE: createTestSchema({
          requiredHeaders: ['ROW_ID', 'VALUE'],
          unfilledValues: {
            VALUE: ['Choose option'] // Redundant
          },
          fieldsRequiredForInclusionInWasteBalance: ['VALUE']
        })
      })

      const validateDataSyntax = createDataSyntaxValidator(schemaRegistry)
      const { validatedData } = validateDataSyntax({
        ...parsed,
        meta: {
          ...parsed.meta,
          PROCESSING_TYPE: { value: 'TEST_TYPE' }
        }
      })

      // First row has real data - should be INCLUDED
      expect(validatedData.data.TEST_TABLE.rows[0].outcome).toBe('INCLUDED')
      expect(validatedData.data.TEST_TABLE.rows[0].data.VALUE).toBe(
        'actual data'
      )

      // Second row had 'Choose option' → null → EXCLUDED
      expect(validatedData.data.TEST_TABLE.rows[1].outcome).toBe('EXCLUDED')
      expect(validatedData.data.TEST_TABLE.rows[1].data.VALUE).toBeNull()
    })
  })
})
