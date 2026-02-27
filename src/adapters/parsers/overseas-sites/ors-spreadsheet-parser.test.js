import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import ExcelJS from 'exceljs'

import { SpreadsheetValidationError } from '#adapters/parsers/summary-logs/exceljs-parser.js'
import { parse } from './ors-spreadsheet-parser.js'

const FIXTURES_DIR = join(
  import.meta.dirname,
  '../../../data/fixtures/spreadsheet/templates/ors'
)

/**
 * Builds a minimal ORS ID Log workbook for testing.
 * Row layout matches the real spreadsheet structure:
 *   Row 4: Packaging waste category
 *   Row 5: Org ID
 *   Row 6: Registration Number
 *   Row 7: Accreditation Number
 *   Row 9: Column headers
 *   Row 10+: Data rows
 */
const buildOrsWorkbook = ({
  metadata = {},
  dataRows = [],
  sheetName = 'ORS ID Log'
} = {}) => {
  const {
    packagingWasteCategory = 'Steel',
    orgId = 500065,
    registrationNumber = 'R26EX5000650066ST',
    accreditationNumber = 'A26EX5000650032ST'
  } = metadata

  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(sheetName)

  // Row 4: Packaging waste category (cols B-D = 2-4)
  const row4 = worksheet.getRow(4)
  row4.getCell(2).value = 'Packaging waste category:'
  row4.getCell(4).value = packagingWasteCategory

  // Row 5: Org ID
  const row5 = worksheet.getRow(5)
  row5.getCell(2).value = 'Org ID:'
  row5.getCell(4).value = orgId

  // Row 6: Registration Number
  const row6 = worksheet.getRow(6)
  row6.getCell(2).value = 'Registration Number:'
  row6.getCell(4).value = registrationNumber

  // Row 7: Accreditation Number
  const row7 = worksheet.getRow(7)
  row7.getCell(2).value = 'Accreditation Number: '
  row7.getCell(4).value = accreditationNumber

  // Row 9: Headers (B through K)
  const row9 = worksheet.getRow(9)
  row9.getCell(2).value = 'ORS ID'
  row9.getCell(3).value = 'Destination country'
  row9.getCell(4).value = 'Overseas Reprocessor Name'
  row9.getCell(5).value = 'Address line 1'
  row9.getCell(6).value = 'Address line 2 (optional)'
  row9.getCell(7).value = 'City or town'
  row9.getCell(8).value = 'State, province or region (optional)'
  row9.getCell(9).value = 'Postcode or similar (optional)'
  row9.getCell(10).value =
    "Latitude and longitude coordinates for the site's main entrance"
  row9.getCell(11).value = 'Valid from\n(To issue PERNs, accredited sites only)'

  // Data rows starting at row 10
  for (let i = 0; i < dataRows.length; i++) {
    const dataRow = dataRows[i]
    const row = worksheet.getRow(10 + i)
    row.getCell(2).value = dataRow.orsId ?? null
    row.getCell(3).value = dataRow.country ?? null
    row.getCell(4).value = dataRow.name ?? null
    row.getCell(5).value = dataRow.line1 ?? null
    row.getCell(6).value = dataRow.line2 ?? null
    row.getCell(7).value = dataRow.townOrCity ?? null
    row.getCell(8).value = dataRow.stateOrRegion ?? null
    row.getCell(9).value = dataRow.postcode ?? null
    row.getCell(10).value = dataRow.coordinates ?? null
    row.getCell(11).value = dataRow.validFrom ?? null
  }

  return workbook
}

const writeBuffer = (workbook) => workbook.xlsx.writeBuffer()

describe('ORS spreadsheet parser', () => {
  describe('file-level validation', () => {
    it('should throw for invalid Excel buffer', async () => {
      await expect(parse(Buffer.from('not excel'))).rejects.toThrow()
    })

    it('should throw SpreadsheetValidationError when ORS ID Log sheet is missing', async () => {
      const workbook = new ExcelJS.Workbook()
      workbook.addWorksheet('Wrong Sheet')
      const buffer = await writeBuffer(workbook)

      await expect(parse(buffer)).rejects.toThrow(SpreadsheetValidationError)
      await expect(parse(buffer)).rejects.toThrow(
        "Missing required 'ORS ID Log' worksheet"
      )
    })

    it('should throw SpreadsheetValidationError when registration number is missing', async () => {
      const workbook = buildOrsWorkbook({
        metadata: { registrationNumber: null }
      })
      const buffer = await writeBuffer(workbook)

      await expect(parse(buffer)).rejects.toThrow(SpreadsheetValidationError)
      await expect(parse(buffer)).rejects.toThrow('registration number')
    })
  })

  describe('metadata extraction', () => {
    it('should extract all header metadata', async () => {
      const workbook = buildOrsWorkbook({
        metadata: {
          packagingWasteCategory: 'Steel',
          orgId: 500065,
          registrationNumber: 'R26EX5000650066ST',
          accreditationNumber: 'A26EX5000650032ST'
        }
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.metadata).toEqual({
        packagingWasteCategory: 'Steel',
        orgId: 500065,
        registrationNumber: 'R26EX5000650066ST',
        accreditationNumber: 'A26EX5000650032ST'
      })
    })

    it('should handle string org ID', async () => {
      const workbook = buildOrsWorkbook({
        metadata: { orgId: '500065' }
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.metadata.orgId).toBe('500065')
    })
  })

  describe('site data extraction', () => {
    it('should parse a single site row with all fields', async () => {
      const workbook = buildOrsWorkbook({
        dataRows: [
          {
            orsId: 1,
            country: 'India',
            name: 'Surya Ferrous Alloys Pvt. Ltd',
            line1: 'Wada Sahapur Road',
            line2: 'Abitghar, Tal. Wada',
            townOrCity: 'PALGHAR',
            stateOrRegion: 'Maharastra',
            postcode: null,
            coordinates: '19°35\'10.9"N 73°09\'54.0"E',
            validFrom: new Date('2026-01-01')
          }
        ]
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.sites).toHaveLength(1)
      expect(result.sites[0]).toEqual({
        rowNumber: 10,
        orsId: '001',
        country: 'India',
        name: 'Surya Ferrous Alloys Pvt. Ltd',
        address: {
          line1: 'Wada Sahapur Road',
          line2: 'Abitghar, Tal. Wada',
          townOrCity: 'PALGHAR',
          stateOrRegion: 'Maharastra',
          postcode: null
        },
        coordinates: '19°35\'10.9"N 73°09\'54.0"E',
        validFrom: '2026-01-01'
      })
    })

    it('should zero-pad ORS IDs to three digits', async () => {
      const workbook = buildOrsWorkbook({
        dataRows: [
          {
            orsId: 1,
            country: 'India',
            name: 'Site A',
            line1: 'Addr 1',
            townOrCity: 'Town'
          },
          {
            orsId: 42,
            country: 'China',
            name: 'Site B',
            line1: 'Addr 2',
            townOrCity: 'City'
          },
          {
            orsId: 999,
            country: 'Turkey',
            name: 'Site C',
            line1: 'Addr 3',
            townOrCity: 'Btown'
          }
        ]
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.sites.map((s) => s.orsId)).toEqual(['001', '042', '999'])
    })

    it('should accept already zero-padded ORS IDs', async () => {
      const workbook = buildOrsWorkbook({
        dataRows: [
          {
            orsId: '007',
            country: 'India',
            name: 'Site A',
            line1: 'Addr',
            townOrCity: 'Town'
          }
        ]
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.sites[0].orsId).toBe('007')
    })

    it('should handle optional fields being absent', async () => {
      const workbook = buildOrsWorkbook({
        dataRows: [
          {
            orsId: 1,
            country: 'India',
            name: 'Minimal Site',
            line1: 'Some Address',
            townOrCity: 'Town'
          }
        ]
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.sites[0].address.line2).toBeNull()
      expect(result.sites[0].address.stateOrRegion).toBeNull()
      expect(result.sites[0].address.postcode).toBeNull()
      expect(result.sites[0].coordinates).toBeNull()
      expect(result.sites[0].validFrom).toBeNull()
    })

    it('should trim whitespace from string cell values', async () => {
      const workbook = buildOrsWorkbook({
        dataRows: [
          {
            orsId: 1,
            country: '  India  ',
            name: 'Site With Spaces  ',
            line1: '  42 High Street',
            townOrCity: '  LONDON  '
          }
        ]
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.sites[0].country).toBe('India')
      expect(result.sites[0].name).toBe('Site With Spaces')
      expect(result.sites[0].address.line1).toBe('42 High Street')
      expect(result.sites[0].address.townOrCity).toBe('LONDON')
    })

    it('should treat whitespace-only cell values as null', async () => {
      const workbook = buildOrsWorkbook({
        dataRows: [
          {
            orsId: 1,
            country: 'India',
            name: 'Site',
            line1: 'Addr',
            townOrCity: 'Town',
            line2: '   ',
            stateOrRegion: '  '
          }
        ]
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.sites[0].address.line2).toBeNull()
      expect(result.sites[0].address.stateOrRegion).toBeNull()
    })

    it('should parse numeric postcode as string', async () => {
      const workbook = buildOrsWorkbook({
        dataRows: [
          {
            orsId: 1,
            country: 'India',
            name: 'Site',
            line1: 'Addr',
            townOrCity: 'Town',
            postcode: 421312
          }
        ]
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.sites[0].address.postcode).toBe('421312')
    })

    it('should parse multiple data rows', async () => {
      const workbook = buildOrsWorkbook({
        dataRows: [
          {
            orsId: 1,
            country: 'India',
            name: 'Site A',
            line1: 'Addr 1',
            townOrCity: 'Town A'
          },
          {
            orsId: 2,
            country: 'China',
            name: 'Site B',
            line1: 'Addr 2',
            townOrCity: 'Town B'
          },
          {
            orsId: 3,
            country: 'Turkey',
            name: 'Site C',
            line1: 'Addr 3',
            townOrCity: 'Town C'
          }
        ]
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.sites).toHaveLength(3)
      expect(result.sites[0].rowNumber).toBe(10)
      expect(result.sites[1].rowNumber).toBe(11)
      expect(result.sites[2].rowNumber).toBe(12)
    })
  })

  describe('placeholder row skipping', () => {
    it('should skip rows that only have an ORS ID and no other data', async () => {
      const workbook = buildOrsWorkbook({
        dataRows: [
          {
            orsId: 1,
            country: 'India',
            name: 'Real Site',
            line1: 'Addr',
            townOrCity: 'Town'
          },
          { orsId: 2 },
          { orsId: 3 }
        ]
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.sites).toHaveLength(1)
      expect(result.sites[0].name).toBe('Real Site')
    })

    it('should skip completely empty rows', async () => {
      const workbook = buildOrsWorkbook({
        dataRows: [
          {
            orsId: 1,
            country: 'India',
            name: 'Site A',
            line1: 'Addr',
            townOrCity: 'Town'
          },
          {},
          {
            orsId: 3,
            country: 'China',
            name: 'Site B',
            line1: 'Addr 2',
            townOrCity: 'Town 2'
          }
        ]
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.sites).toHaveLength(2)
    })
  })

  describe('row-level validation errors', () => {
    it('should report error for row missing required country', async () => {
      const workbook = buildOrsWorkbook({
        dataRows: [
          {
            orsId: 1,
            name: 'Site Without Country',
            line1: 'Addr',
            townOrCity: 'Town'
          }
        ]
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.sites).toHaveLength(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toEqual(
        expect.objectContaining({
          rowNumber: 10,
          field: 'country'
        })
      )
    })

    it('should report error for row missing required name', async () => {
      const workbook = buildOrsWorkbook({
        dataRows: [
          {
            orsId: 1,
            country: 'India',
            line1: 'Addr',
            townOrCity: 'Town'
          }
        ]
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.sites).toHaveLength(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toEqual(
        expect.objectContaining({
          rowNumber: 10,
          field: 'name'
        })
      )
    })

    it('should report error for row missing required address line 1', async () => {
      const workbook = buildOrsWorkbook({
        dataRows: [
          {
            orsId: 1,
            country: 'India',
            name: 'Site',
            townOrCity: 'Town'
          }
        ]
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.sites).toHaveLength(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toEqual(
        expect.objectContaining({
          rowNumber: 10,
          field: 'address.line1'
        })
      )
    })

    it('should report error for row missing required town', async () => {
      const workbook = buildOrsWorkbook({
        dataRows: [
          {
            orsId: 1,
            country: 'India',
            name: 'Site',
            line1: 'Addr'
          }
        ]
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.sites).toHaveLength(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toEqual(
        expect.objectContaining({
          rowNumber: 10,
          field: 'address.townOrCity'
        })
      )
    })

    it('should report multiple errors for a single row', async () => {
      // A row with ONLY an ORS ID is a placeholder and gets skipped.
      // To get validation errors we need at least one non-key field populated.
      const workbook = buildOrsWorkbook({
        dataRows: [
          {
            orsId: 1,
            line2: 'Has optional but no required fields'
          }
        ]
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.sites).toHaveLength(0)
      expect(result.errors.length).toBeGreaterThanOrEqual(4)
    })

    it('should separate valid sites from rows with errors', async () => {
      const workbook = buildOrsWorkbook({
        dataRows: [
          {
            orsId: 1,
            country: 'India',
            name: 'Good Site',
            line1: 'Addr',
            townOrCity: 'Town'
          },
          {
            orsId: 2,
            country: 'China',
            line1: 'No name provided',
            townOrCity: 'Town'
          },
          {
            orsId: 3,
            country: 'Turkey',
            name: 'Another Good Site',
            line1: 'Addr',
            townOrCity: 'City'
          }
        ]
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.sites).toHaveLength(2)
      expect(result.sites[0].name).toBe('Good Site')
      expect(result.sites[1].name).toBe('Another Good Site')
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].rowNumber).toBe(11)
    })

    it('should report invalid ORS ID (not a number or zero-padded string)', async () => {
      const workbook = buildOrsWorkbook({
        dataRows: [
          {
            orsId: 'abc',
            country: 'India',
            name: 'Site',
            line1: 'Addr',
            townOrCity: 'Town'
          }
        ]
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.sites).toHaveLength(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toEqual(
        expect.objectContaining({
          rowNumber: 10,
          field: 'orsId'
        })
      )
    })

    it('should report ORS ID out of range (0 or > 999)', async () => {
      const workbook = buildOrsWorkbook({
        dataRows: [
          {
            orsId: 0,
            country: 'India',
            name: 'Site',
            line1: 'Addr',
            townOrCity: 'Town'
          },
          {
            orsId: 1000,
            country: 'India',
            name: 'Site 2',
            line1: 'Addr',
            townOrCity: 'Town'
          }
        ]
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.sites).toHaveLength(0)
      expect(result.errors).toHaveLength(2)
    })

    it('should report error for row with data but no ORS ID', async () => {
      const workbook = buildOrsWorkbook({
        dataRows: [
          {
            country: 'India',
            name: 'Site Without ID',
            line1: 'Addr',
            townOrCity: 'Town'
          }
        ]
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.sites).toHaveLength(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toEqual(
        expect.objectContaining({
          rowNumber: 10,
          field: 'orsId'
        })
      )
    })

    it('should report duplicate ORS IDs', async () => {
      const workbook = buildOrsWorkbook({
        dataRows: [
          {
            orsId: 1,
            country: 'India',
            name: 'Site A',
            line1: 'Addr 1',
            townOrCity: 'Town A'
          },
          {
            orsId: 1,
            country: 'China',
            name: 'Site B',
            line1: 'Addr 2',
            townOrCity: 'Town B'
          }
        ]
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toEqual(
        expect.objectContaining({
          rowNumber: 11,
          field: 'orsId',
          message: expect.stringContaining('001')
        })
      )
    })

    it('should report string ORS ID out of range', async () => {
      const workbook = buildOrsWorkbook({
        dataRows: [
          {
            orsId: '000',
            country: 'India',
            name: 'Site',
            line1: 'Addr',
            townOrCity: 'Town'
          }
        ]
      })
      const buffer = await writeBuffer(workbook)

      const result = await parse(buffer)

      expect(result.sites).toHaveLength(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toEqual(
        expect.objectContaining({
          rowNumber: 10,
          field: 'orsId'
        })
      )
    })
  })

  describe('real spreadsheet integration', () => {
    it('should parse the example ORS spreadsheet correctly', async () => {
      const buffer = readFileSync(join(FIXTURES_DIR, 'ors-id-log-example.xlsm'))

      const result = await parse(buffer)

      expect(result.metadata).toEqual({
        packagingWasteCategory: 'Steel',
        orgId: 100001,
        registrationNumber: 'R26EX1000010001ST',
        accreditationNumber: 'A26EX1000010001ST'
      })
      expect(result.sites).toHaveLength(9)
      expect(result.errors).toHaveLength(0)

      // Verify first site
      expect(result.sites[0]).toEqual(
        expect.objectContaining({
          orsId: '001',
          country: 'India',
          name: 'Acme Alloys Pvt. Ltd',
          validFrom: '2026-01-01'
        })
      )

      // Verify all ORS IDs are zero-padded
      const orsIds = result.sites.map((s) => s.orsId)
      expect(orsIds).toEqual([
        '001',
        '002',
        '003',
        '004',
        '005',
        '006',
        '007',
        '008',
        '009'
      ])
    })

    it('should skip the 990 placeholder rows in the real spreadsheet', async () => {
      const buffer = readFileSync(join(FIXTURES_DIR, 'ors-id-log-example.xlsm'))

      const result = await parse(buffer)

      // The real spreadsheet has 999 pre-populated rows but only 9 have data
      expect(result.sites).toHaveLength(9)
    })
  })
})
