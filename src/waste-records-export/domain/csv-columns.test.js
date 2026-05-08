import {
  METADATA_COLUMNS,
  DATA_FIELD_COLUMNS,
  ALL_COLUMNS,
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
        'Reported Period',
        'Submitted At',
        'Included in Waste Balance',
        'Row ID'
      ])
    })
  })

  describe('DATA_FIELD_COLUMNS', () => {
    it('is alphabetically sorted', () => {
      const sorted = [...DATA_FIELD_COLUMNS].sort()
      expect(DATA_FIELD_COLUMNS).toEqual(sorted)
    })

    it('does not contain ROW_ID (already in metadata prefix)', () => {
      expect(DATA_FIELD_COLUMNS).not.toContain('ROW_ID')
    })

    it('contains representative fields from each schema area', () => {
      // sanity — exporter-only field
      expect(DATA_FIELD_COLUMNS).toContain('DATE_RECEIVED_FOR_EXPORT')
      // reprocessor-only field
      expect(DATA_FIELD_COLUMNS).toContain('TONNAGE_RECEIVED_FOR_RECYCLING')
      // shared sent-on field
      expect(DATA_FIELD_COLUMNS).toContain('FINAL_DESTINATION_NAME')
      // registered-only field
      expect(DATA_FIELD_COLUMNS).toContain('WAS_THE_WASTE_REFUSED')
      // reprocessed loads
      expect(DATA_FIELD_COLUMNS).toContain('PRODUCT_DESCRIPTION')
    })

    it('has no duplicates', () => {
      expect(new Set(DATA_FIELD_COLUMNS).size).toBe(DATA_FIELD_COLUMNS.length)
    })
  })

  describe('ALL_COLUMNS', () => {
    it('is METADATA_COLUMNS followed by DATA_FIELD_COLUMNS', () => {
      expect(ALL_COLUMNS).toEqual([...METADATA_COLUMNS, ...DATA_FIELD_COLUMNS])
    })
  })

  describe('buildHeaderRow', () => {
    it('returns ALL_COLUMNS as an array', () => {
      expect(buildHeaderRow()).toEqual(ALL_COLUMNS)
    })
  })

  describe('buildDataRow', () => {
    const baseInput = {
      org: { regulator: 'ea', companyDetails: { name: 'Acme Ltd' } },
      registration: {
        material: 'plastic',
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
        reportingPeriod: 'Jan-Mar 2026',
        submittedAt: '2026-04-15T09:00:00Z'
      },
      includedInWasteBalance: true
    }

    it('emits metadata columns followed by data field columns in the same order as ALL_COLUMNS', () => {
      const row = buildDataRow(baseInput)
      expect(row.length).toBe(ALL_COLUMNS.length)
    })

    it('formats the metadata prefix correctly', () => {
      const row = buildDataRow(baseInput)
      expect(row[0]).toBe('EA') // Regulator (uppercased)
      expect(row[1]).toBe('Acme Ltd') // Organisation Name
      expect(row[2]).toBe('plastic') // Material
      expect(row[3]).toBe('REPROCESSOR_INPUT') // Operator Processing Type
      expect(row[4]).toBe('Yes') // Accredited
      expect(row[5]).toBe('received') // Waste Record Type
      expect(row[6]).toBe('Jan-Mar 2026') // Reported Period
      expect(row[7]).toBe('2026-04-15T09:00:00Z') // Submitted At
      expect(row[8]).toBe('true') // Included in Waste Balance
      expect(row[9]).toBe('1001') // Row ID
    })

    it('emits empty string when a data field is absent on the record', () => {
      const row = buildDataRow(baseInput)
      const containerNumberIdx = ALL_COLUMNS.indexOf('CONTAINER_NUMBER')
      expect(row[containerNumberIdx]).toBe('')
    })

    it('emits the field value when a data field is present on the record', () => {
      const row = buildDataRow(baseInput)
      const grossIdx = ALL_COLUMNS.indexOf('GROSS_WEIGHT')
      expect(row[grossIdx]).toBe('10')
    })

    it('emits "No" for Accredited when registration is registered-only', () => {
      const row = buildDataRow({
        ...baseInput,
        registration: { ...baseInput.registration, accreditation: null }
      })
      expect(row[4]).toBe('No')
    })

    it('emits empty Reported Period and Submitted At when no summary log entry is found', () => {
      const row = buildDataRow({ ...baseInput, summaryLogEntry: null })
      expect(row[6]).toBe('')
      expect(row[7]).toBe('')
    })

    it('emits "false" for Included in Waste Balance when input is false', () => {
      const row = buildDataRow({ ...baseInput, includedInWasteBalance: false })
      expect(row[8]).toBe('false')
    })
  })
})
