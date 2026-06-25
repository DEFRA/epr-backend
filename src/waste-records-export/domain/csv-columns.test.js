import {
  METADATA_COLUMNS,
  SCHEMA_FIELD_NAMES,
  buildDataFieldColumns,
  buildHeaderRow,
  buildDataRow
} from './csv-columns.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {WasteRecord} from '#domain/waste-records/model.js' */

describe('csv-columns', () => {
  describe('METADATA_COLUMNS', () => {
    it('starts with the fixed metadata prefix in the documented order', () => {
      expect(METADATA_COLUMNS).toEqual([
        'Regulator',
        'Organisation Name',
        'Registration Number',
        'Material',
        'Operator Processing Type',
        'Accredited',
        'Accreditation Number',
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

    it('excludes processingType (already in the metadata prefix)', () => {
      const cols = buildDataFieldColumns(['processingType', 'OTHER'])
      expect(cols).not.toContain('processingType')
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

    const userFixture = {
      fullName: 'Test User',
      email: 'test@example.com',
      phone: '01234567890'
    }

    /** @type {Organisation} */
    const orgFixture = {
      id: 'org-1',
      orgId: 500001,
      accreditations: [],
      registrations: [],
      companyDetails: { name: 'Acme Ltd' },
      formSubmission: { id: 'fs-1', time: new Date('2026-01-01') },
      schemaVersion: 1,
      status: 'active',
      statusHistory: [
        { status: 'approved', updatedAt: new Date('2026-01-01') }
      ],
      submittedToRegulator: 'ea',
      submitterContactDetails: userFixture,
      users: [],
      version: 1,
      wasteProcessingTypes: []
    }

    /** @type {Registration} */
    const regFixture = {
      id: 'reg-1',
      accreditation: null,
      applicationContactDetails: userFixture,
      approvedPersons: [],
      formSubmission: { id: 'fs-1', time: new Date('2026-01-01') },
      material: 'plastic',
      orgName: 'Acme Ltd',
      site: { address: {}, gridReference: 'TQ123456', siteCapacity: [] },
      submittedToRegulator: 'ea',
      submitterContactDetails: userFixture,
      wasteProcessingType: 'reprocessor',
      registrationNumber: 'REG-001',
      status: 'approved',
      statusHistory: [],
      validFrom: '2026-01-01',
      validTo: '2026-12-31'
    }

    /** @type {Accreditation} */
    const accreditationFixture = {
      id: 'acc-1',
      statusHistory: [],
      formSubmission: { id: 'fs-1', time: new Date('2026-01-01') },
      material: 'plastic',
      prnIssuance: {
        incomeBusinessPlan: [],
        signatories: [],
        tonnageBand: '500'
      },
      submittedToRegulator: 'ea',
      submitterContactDetails: userFixture,
      wasteProcessingType: 'reprocessor',
      accreditationNumber: 'ACC-001',
      status: 'approved',
      validFrom: '2026-01-01',
      validTo: '2026-12-31'
    }

    /** @type {WasteRecord} */
    const recordFixture = {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      type: WASTE_RECORD_TYPE.RECEIVED,
      rowId: '1001',
      data: {
        processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
        DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01',
        GROSS_WEIGHT: 10,
        TONNAGE_RECEIVED_FOR_RECYCLING: 9
      },
      versions: [
        {
          id: 'v1',
          createdAt: '2026-02-01T00:00:00Z',
          status: 'created',
          summaryLog: { id: 'sl-1', uri: 's3://bucket/sl-1' },
          data: {}
        }
      ]
    }

    /** @returns {Registration} */
    const buildReg = (overrides = {}) => ({ ...regFixture, ...overrides })

    /** @returns {WasteRecord} */
    const buildRecord = (overrides = {}) => ({ ...recordFixture, ...overrides })

    const baseInput = {
      org: orgFixture,
      registration: regFixture,
      accreditation: accreditationFixture,
      record: recordFixture,
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
      expect(row[2]).toBe('REG-001') // Registration Number
      expect(row[3]).toBe('plastic') // Material
      expect(row[4]).toBe('REPROCESSOR_INPUT') // Operator Processing Type
      expect(row[5]).toBe('Yes') // Accredited
      expect(row[6]).toBe('ACC-001') // Accreditation Number
      expect(row[7]).toBe('received') // Waste Record Type
      expect(row[8]).toBe('2026-04-15T09:00:00Z') // Submitted At
      expect(row[9]).toBe('true') // Included in Waste Balance
      expect(row[10]).toBe('1001') // Row ID
    })

    it('emits the glass recycling process in place of "glass" for the Material column', () => {
      const row = buildDataRow({
        ...baseInput,
        registration: buildReg({
          material: 'glass',
          glassRecyclingProcess: ['glass_re_melt']
        })
      })
      expect(row[3]).toBe('glass_re_melt') // Material
    })

    it('emits an empty Registration Number when the registration has none', () => {
      const row = buildDataRow({
        ...baseInput,
        registration: buildReg({ registrationNumber: undefined })
      })
      expect(row[2]).toBe('')
    })

    it('emits an empty Accreditation Number when the row has no accreditation', () => {
      const row = buildDataRow({ ...baseInput, accreditation: null })
      expect(row[5]).toBe('No') // Accredited
      expect(row[6]).toBe('') // Accreditation Number
    })

    it('emits empty string when a data field is absent on the record', () => {
      const row = buildDataRow(baseInput)
      const containerNumberIdx =
        METADATA_COLUMNS.length + dataFieldColumns.indexOf('CONTAINER_NUMBER')
      expect(row[containerNumberIdx]).toBe('')
    })

    it('passes a numeric data field through as a real number', () => {
      const row = buildDataRow(baseInput)
      const grossIdx =
        METADATA_COLUMNS.length + dataFieldColumns.indexOf('GROSS_WEIGHT')
      expect(row[grossIdx]).toBe(10)
    })

    it('apostrophe-prefixes a string data cell that begins with a formula trigger', () => {
      const row = buildDataRow({
        ...baseInput,
        record: buildRecord({
          data: { ...recordFixture.data, PRODUCT_DESCRIPTION: '=SUM(A1:A2)' }
        })
      })
      const idx =
        METADATA_COLUMNS.length +
        dataFieldColumns.indexOf('PRODUCT_DESCRIPTION')
      expect(row[idx]).toBe("'=SUM(A1:A2)")
    })

    it.each(['+1', '-1', '@cmd'])(
      'apostrophe-prefixes a string cell beginning with %s',
      (value) => {
        const row = buildDataRow({
          ...baseInput,
          record: buildRecord({
            data: { ...recordFixture.data, PRODUCT_DESCRIPTION: value }
          })
        })
        const idx =
          METADATA_COLUMNS.length +
          dataFieldColumns.indexOf('PRODUCT_DESCRIPTION')
        expect(row[idx]).toBe(`'${value}`)
      }
    )

    it('apostrophe-prefixes the organisation name when it begins with a formula trigger', () => {
      const row = buildDataRow({
        ...baseInput,
        org: { ...orgFixture, companyDetails: { name: '=cmd|calc' } }
      })
      expect(row[1]).toBe("'=cmd|calc")
    })

    it('does not prefix a numeric cell even though numbers are not strings', () => {
      const row = buildDataRow(baseInput)
      const grossIdx =
        METADATA_COLUMNS.length + dataFieldColumns.indexOf('GROSS_WEIGHT')
      expect(row[grossIdx]).toBe(10)
    })

    it('emits values for runtime-observed columns not in any schema', () => {
      const observedKeys = ['BILL_OF_LANDING_REFERENCE_NUMBER']
      const cols = buildDataFieldColumns(observedKeys)
      const row = buildDataRow({
        ...baseInput,
        record: buildRecord({
          data: {
            ...recordFixture.data,
            BILL_OF_LANDING_REFERENCE_NUMBER: 'BL-99'
          }
        }),
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
        accreditation: null
      })
      expect(row[5]).toBe('No')
    })

    it('emits empty Submitted At when no summary log entry is found', () => {
      const row = buildDataRow({ ...baseInput, summaryLogEntry: null })
      expect(row[8]).toBe('')
    })

    it('emits "false" for Included in Waste Balance when input is false', () => {
      const row = buildDataRow({ ...baseInput, includedInWasteBalance: false })
      expect(row[9]).toBe('false')
    })
  })
})
