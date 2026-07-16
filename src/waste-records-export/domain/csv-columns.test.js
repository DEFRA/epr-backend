import {
  METADATA_COLUMNS,
  METADATA_COL_INDEX,
  SCHEMA_FIELD_NAMES,
  OSR_COUNTRY_REVISED,
  OSR_NAME_REVISED,
  buildDataFieldColumns,
  buildHeaderRow,
  buildDataRow
} from './csv-columns.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'

/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */

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
        'Waste Balance Exclusion Reason',
        'Waste Balance Tonnage',
        'Row ID',
        'OSR Country Revised',
        'OSR Name Revised'
      ])
    })

    it('ends with the derived OSR columns', () => {
      expect(METADATA_COLUMNS.slice(-2)).toEqual([
        OSR_COUNTRY_REVISED,
        OSR_NAME_REVISED
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
    it('returns the metadata columns followed by the supplied data field columns', () => {
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
    const dataCol = (name) =>
      METADATA_COLUMNS.length + dataFieldColumns.indexOf(name)

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

    // Coerced committed row data, carrying its `processingType`, as the
    // application layer hands it to `buildDataRow`.
    const dataFixture = {
      processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
      DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01',
      GROSS_WEIGHT: 10,
      TONNAGE_RECEIVED_FOR_RECYCLING: 9
    }

    /** @returns {Registration} */
    const buildReg = (overrides = {}) => ({ ...regFixture, ...overrides })

    const baseInput = {
      org: orgFixture,
      registration: regFixture,
      accreditation: accreditationFixture,
      data: dataFixture,
      wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
      rowId: '1001',
      classification: {
        outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
        reasons: [],
        transactionAmount: 9
      },
      summaryLogEntry: {
        submittedAt: '2026-04-15T09:00:00Z'
      },
      dataFieldColumns
    }

    it('produces a row whose length matches metadata + dataFieldColumns', () => {
      const row = buildDataRow(baseInput)
      expect(row.length).toBe(METADATA_COLUMNS.length + dataFieldColumns.length)
    })

    it('formats the metadata prefix correctly', () => {
      const row = buildDataRow(baseInput)
      expect(row[METADATA_COL_INDEX['Regulator']]).toBe('EA')
      expect(row[METADATA_COL_INDEX['Organisation Name']]).toBe('Acme Ltd')
      expect(row[METADATA_COL_INDEX['Registration Number']]).toBe('REG-001')
      expect(row[METADATA_COL_INDEX['Material']]).toBe('plastic')
      expect(row[METADATA_COL_INDEX['Operator Processing Type']]).toBe(
        'REPROCESSOR_INPUT'
      )
      expect(row[METADATA_COL_INDEX['Accredited']]).toBe('Yes')
      expect(row[METADATA_COL_INDEX['Accreditation Number']]).toBe('ACC-001')
      expect(row[METADATA_COL_INDEX['Waste Record Type']]).toBe('received')
      expect(row[METADATA_COL_INDEX['Submitted At']]).toBe(
        '2026-04-15T09:00:00Z'
      )
      expect(row[METADATA_COL_INDEX['Included in Waste Balance']]).toBe('true')
      expect(row[METADATA_COL_INDEX['Waste Balance Exclusion Reason']]).toBe('')
      expect(row[METADATA_COL_INDEX['Waste Balance Tonnage']]).toBe(9)
      expect(row[METADATA_COL_INDEX['Row ID']]).toBe('1001')
    })

    it('emits the glass recycling process in place of "glass" for the Material column', () => {
      const row = buildDataRow({
        ...baseInput,
        registration: buildReg({
          material: 'glass',
          glassRecyclingProcess: ['glass_re_melt']
        })
      })
      expect(row[METADATA_COL_INDEX['Material']]).toBe('glass_re_melt')
    })

    it('emits an empty Registration Number when the registration has none', () => {
      const row = buildDataRow({
        ...baseInput,
        registration: buildReg({ registrationNumber: undefined })
      })
      expect(row[METADATA_COL_INDEX['Registration Number']]).toBe('')
    })

    it('emits an empty Accreditation Number when the row has no accreditation', () => {
      const row = buildDataRow({ ...baseInput, accreditation: null })
      expect(row[METADATA_COL_INDEX['Accredited']]).toBe('No')
      expect(row[METADATA_COL_INDEX['Accreditation Number']]).toBe('')
    })

    it('emits empty string when a data field is absent on the row', () => {
      const row = buildDataRow(baseInput)
      expect(row[dataCol('CONTAINER_NUMBER')]).toBe('')
    })

    it('passes a numeric data field through as a real number', () => {
      const row = buildDataRow(baseInput)
      expect(row[dataCol('GROSS_WEIGHT')]).toBe(10)
    })

    it('apostrophe-prefixes a string data cell that begins with a formula trigger', () => {
      const row = buildDataRow({
        ...baseInput,
        data: { ...dataFixture, PRODUCT_DESCRIPTION: '=SUM(A1:A2)' }
      })
      expect(row[dataCol('PRODUCT_DESCRIPTION')]).toBe("'=SUM(A1:A2)")
    })

    it.each(['+1', '-1', '@cmd'])(
      'apostrophe-prefixes a string cell beginning with %s',
      (value) => {
        const row = buildDataRow({
          ...baseInput,
          data: { ...dataFixture, PRODUCT_DESCRIPTION: value }
        })
        expect(row[dataCol('PRODUCT_DESCRIPTION')]).toBe(`'${value}`)
      }
    )

    it('apostrophe-prefixes the organisation name when it begins with a formula trigger', () => {
      const row = buildDataRow({
        ...baseInput,
        org: { ...orgFixture, companyDetails: { name: '=cmd|calc' } }
      })
      expect(row[METADATA_COL_INDEX['Organisation Name']]).toBe("'=cmd|calc")
    })

    it('does not prefix a numeric cell even though numbers are not strings', () => {
      const row = buildDataRow(baseInput)
      expect(row[dataCol('GROSS_WEIGHT')]).toBe(10)
    })

    it('emits values for runtime-observed columns not in any schema', () => {
      const observedKeys = ['BILL_OF_LANDING_REFERENCE_NUMBER']
      const cols = buildDataFieldColumns(observedKeys)
      const row = buildDataRow({
        ...baseInput,
        data: { ...dataFixture, BILL_OF_LANDING_REFERENCE_NUMBER: 'BL-99' },
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
      expect(row[METADATA_COL_INDEX['Accredited']]).toBe('No')
    })

    it('emits empty Submitted At when no summary log entry is found', () => {
      const row = buildDataRow({ ...baseInput, summaryLogEntry: null })
      expect(row[METADATA_COL_INDEX['Submitted At']]).toBe('')
    })

    it('emits waste balance columns from a stamped EXCLUDED classification', () => {
      const excluded = buildDataRow({
        ...baseInput,
        classification: {
          outcome: WASTE_BALANCE_OUTCOME.EXCLUDED,
          reasons: [
            { code: 'PRN_ISSUED' },
            { code: 'MISSING_REQUIRED_FIELD', field: 'EWC_CODE' }
          ],
          transactionAmount: 0
        }
      })
      expect(excluded[METADATA_COL_INDEX['Included in Waste Balance']]).toBe(
        'false'
      )
      expect(
        excluded[METADATA_COL_INDEX['Waste Balance Exclusion Reason']]
      ).toBe('PRN_ISSUED; MISSING_REQUIRED_FIELD: EWC_CODE')
      expect(excluded[METADATA_COL_INDEX['Waste Balance Tonnage']]).toBe('')
    })

    it('emits the contributed tonnage from a stamped INCLUDED classification', () => {
      const included = buildDataRow({
        ...baseInput,
        classification: {
          outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
          reasons: [],
          transactionAmount: -5.25
        }
      })
      expect(included[METADATA_COL_INDEX['Included in Waste Balance']]).toBe(
        'true'
      )
      expect(included[METADATA_COL_INDEX['Waste Balance Tonnage']]).toBe(-5.25)
    })

    it('emits "NA" and blank reason/tonnage for a stamped NOT_APPLICABLE classification', () => {
      const row = buildDataRow({
        ...baseInput,
        classification: {
          outcome: WASTE_BALANCE_OUTCOME.NOT_APPLICABLE,
          reasons: [],
          transactionAmount: 0
        }
      })
      expect(row[METADATA_COL_INDEX['Included in Waste Balance']]).toBe('NA')
      expect(row[METADATA_COL_INDEX['Waste Balance Exclusion Reason']]).toBe('')
      expect(row[METADATA_COL_INDEX['Waste Balance Tonnage']]).toBe('')
    })

    describe('derived OSR columns', () => {
      const countryIdx = METADATA_COLUMNS.indexOf(OSR_COUNTRY_REVISED)
      const nameIdx = METADATA_COLUMNS.indexOf(OSR_NAME_REVISED)

      const overseasSites = {
        '001': {
          validFrom: new Date('2026-01-01'),
          siteName: 'Acme Recycling',
          country: 'Germany'
        }
      }

      it('populates OSR_COUNTRY_REVISED and OSR_NAME_REVISED from the site matched by OSR_ID', () => {
        const row = buildDataRow({
          ...baseInput,
          data: { ...dataFixture, OSR_ID: '001' },
          overseasSites
        })
        expect(row[countryIdx]).toBe('Germany')
        expect(row[nameIdx]).toBe('Acme Recycling')
      })

      it('zero-pads OSR_ID before looking up the approved site', () => {
        const row = buildDataRow({
          ...baseInput,
          data: { ...dataFixture, OSR_ID: 1 },
          overseasSites
        })
        expect(row[countryIdx]).toBe('Germany')
        expect(row[nameIdx]).toBe('Acme Recycling')
      })

      it('leaves both derived columns blank when the row has no OSR_ID', () => {
        const row = buildDataRow({ ...baseInput, overseasSites })
        expect(row[countryIdx]).toBe('')
        expect(row[nameIdx]).toBe('')
      })

      it('leaves both derived columns blank when OSR_ID has no matching approved site', () => {
        const row = buildDataRow({
          ...baseInput,
          data: { ...dataFixture, OSR_ID: '999' },
          overseasSites
        })
        expect(row[countryIdx]).toBe('')
        expect(row[nameIdx]).toBe('')
      })

      it('leaves both derived columns blank when the matched site has null name and country', () => {
        const row = buildDataRow({
          ...baseInput,
          data: { ...dataFixture, OSR_ID: '001' },
          overseasSites: {
            '001': { validFrom: null, siteName: null, country: null }
          }
        })
        expect(row[countryIdx]).toBe('')
        expect(row[nameIdx]).toBe('')
      })

      it('leaves both derived columns blank when no overseas-sites context is supplied', () => {
        const row = buildDataRow({
          ...baseInput,
          data: { ...dataFixture, OSR_ID: '001' }
        })
        expect(row[countryIdx]).toBe('')
        expect(row[nameIdx]).toBe('')
      })
    })
  })
})
