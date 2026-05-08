import {
  METADATA_COLUMNS,
  SCHEMA_FIELD_NAMES,
  buildDataFieldColumns,
  buildHeaderRow,
  buildDataRow
} from './csv-columns.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

describe('csv-columns', () => {
  describe('METADATA_COLUMNS', () => {
    it('starts with the fixed metadata prefix in the documented order', () => {
      expect(METADATA_COLUMNS).toEqual([
        'Regulator',
        'Organisation Name',
        'Material',
        'Operator Processing Type',
        'Accredited',
        'Waste Record Type',
        'Submitted At',
        'Included in Waste Balance',
        'Row ID'
      ])
    })
  })

  describe('SCHEMA_FIELD_NAMES', () => {
    it('does not contain ROW_ID (already in metadata prefix)', () => {
      expect(SCHEMA_FIELD_NAMES).not.toContain('ROW_ID')
    })

    it('contains representative fields from each schema area', () => {
      expect(SCHEMA_FIELD_NAMES).toContain('DATE_RECEIVED_FOR_EXPORT')
      expect(SCHEMA_FIELD_NAMES).toContain('TONNAGE_RECEIVED_FOR_RECYCLING')
      expect(SCHEMA_FIELD_NAMES).toContain('FINAL_DESTINATION_NAME')
      expect(SCHEMA_FIELD_NAMES).toContain('WAS_THE_WASTE_REFUSED')
      expect(SCHEMA_FIELD_NAMES).toContain('PRODUCT_DESCRIPTION')
    })

    it('has no duplicates', () => {
      expect(new Set(SCHEMA_FIELD_NAMES).size).toBe(SCHEMA_FIELD_NAMES.length)
    })
  })

  describe('buildDataFieldColumns', () => {
    it('returns all schema field names sorted when no keys are observed', () => {
      const cols = buildDataFieldColumns([])
      const sorted = [...SCHEMA_FIELD_NAMES].sort((a, b) => a.localeCompare(b))
      expect(cols).toEqual(sorted)
    })

    it('unions observed keys with the schema baseline', () => {
      const cols = buildDataFieldColumns([
        'BILL_OF_LANDING_REFERENCE_NUMBER',
        'WASTE_TRANSFER_NOTE',
        'EWC_CODE' // already in schema; should not duplicate
      ])
      expect(cols).toContain('BILL_OF_LANDING_REFERENCE_NUMBER')
      expect(cols).toContain('WASTE_TRANSFER_NOTE')
      expect(new Set(cols).size).toBe(cols.length)
    })

    it('emits the union sorted alphabetically', () => {
      const cols = buildDataFieldColumns(['ZZZ_LATE', 'AAA_EARLY'])
      const sorted = [...cols].sort((a, b) => a.localeCompare(b))
      expect(cols).toEqual(sorted)
    })

    it('excludes ROW_ID even when observed', () => {
      const cols = buildDataFieldColumns(['ROW_ID', 'OTHER'])
      expect(cols).not.toContain('ROW_ID')
      expect(cols).toContain('OTHER')
    })
  })

  describe('buildHeaderRow', () => {
    it('returns metadata columns followed by the supplied data field columns', () => {
      const dataFieldColumns = ['ALPHA', 'BETA']
      expect(buildHeaderRow(dataFieldColumns)).toEqual([
        ...METADATA_COLUMNS,
        'ALPHA',
        'BETA'
      ])
    })
  })

  describe('buildDataRow', () => {
    const dataFieldColumns = buildDataFieldColumns([])

    const baseInput = {
      org: { companyDetails: { name: 'Acme Ltd' } },
      registration: {
        material: 'plastic',
        submittedToRegulator: 'ea',
        accreditation: { status: 'approved' }
      },
      record: {
        type: WASTE_RECORD_TYPE.RECEIVED,
        rowId: '1001',
        data: {
          processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
          DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01',
          GROSS_WEIGHT: 10,
          TONNAGE_RECEIVED_FOR_RECYCLING: 9
        },
        versions: [{ summaryLog: { id: 'sl-1' } }]
      },
      summaryLogEntry: {
        submittedAt: '2026-04-15T09:00:00Z'
      },
      includedInWasteBalance: true,
      dataFieldColumns
    }

    it('produces a row whose length matches metadata + dataFieldColumns', () => {
      const row = buildDataRow(baseInput)
      expect(row.length).toBe(METADATA_COLUMNS.length + dataFieldColumns.length)
    })

    it('formats the metadata prefix correctly', () => {
      const row = buildDataRow(baseInput)
      expect(row[0]).toBe('EA') // Regulator
      expect(row[1]).toBe('Acme Ltd') // Organisation Name
      expect(row[2]).toBe('plastic') // Material
      expect(row[3]).toBe('REPROCESSOR_INPUT') // Operator Processing Type
      expect(row[4]).toBe('Yes') // Accredited
      expect(row[5]).toBe('received') // Waste Record Type
      expect(row[6]).toBe('2026-04-15T09:00:00Z') // Submitted At
      expect(row[7]).toBe('true') // Included in Waste Balance
      expect(row[8]).toBe('1001') // Row ID
    })

    it('emits empty string when a data field is absent on the record', () => {
      const row = buildDataRow(baseInput)
      const containerNumberIdx =
        METADATA_COLUMNS.length + dataFieldColumns.indexOf('CONTAINER_NUMBER')
      expect(row[containerNumberIdx]).toBe('')
    })

    it('emits the field value when a data field is present on the record', () => {
      const row = buildDataRow(baseInput)
      const grossIdx =
        METADATA_COLUMNS.length + dataFieldColumns.indexOf('GROSS_WEIGHT')
      expect(row[grossIdx]).toBe('10')
    })

    it('emits values for runtime-observed columns not in any schema', () => {
      const observedKeys = ['BILL_OF_LANDING_REFERENCE_NUMBER']
      const cols = buildDataFieldColumns(observedKeys)
      const row = buildDataRow({
        ...baseInput,
        record: {
          ...baseInput.record,
          data: {
            ...baseInput.record.data,
            BILL_OF_LANDING_REFERENCE_NUMBER: 'BL-99'
          }
        },
        dataFieldColumns: cols
      })
      const idx =
        METADATA_COLUMNS.length +
        cols.indexOf('BILL_OF_LANDING_REFERENCE_NUMBER')
      expect(row[idx]).toBe('BL-99')
    })

    it('emits "No" for Accredited when registration is registered-only', () => {
      const row = buildDataRow({
        ...baseInput,
        registration: { ...baseInput.registration, accreditation: null }
      })
      expect(row[4]).toBe('No')
    })

    it('emits empty Submitted At when no summary log entry is found', () => {
      const row = buildDataRow({ ...baseInput, summaryLogEntry: null })
      expect(row[6]).toBe('')
    })

    it('emits "false" for Included in Waste Balance when input is false', () => {
      const row = buildDataRow({ ...baseInput, includedInWasteBalance: false })
      expect(row[7]).toBe('false')
    })
  })
})
