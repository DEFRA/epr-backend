import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { generateCsv } from './csv-generator.js'

describe('generateCsv', () => {
  const mockInput = [
    {
      type: 'Reprocessor',
      businessName: 'Waste Ltd',
      companiesHouseNumber: '12345678',
      orgId: '500001',
      registeredOffice: '1 Waste Road, London, N1 1AA',
      appropriateAgency: 'EA',
      registrationNumber: 'R12345678PL',
      tradingName: 'Waste Recovery',
      reprocessingSite: '2 Waste Site, London, EC1 1AA',
      packagingWasteCategory: 'Plastic',
      annexIIProcess: 'R3',
      accreditationStatus: 'Approved',
      accreditationNo: 'A123456PL',
      tonnageBand: 'Up to 10,000 tonnes',
      activeDate: '22/01/2026',
      dateLastChanged: '22/01/2026'
    },
    {
      type: 'Exporter',
      businessName: 'Export Co',
      companiesHouseNumber: '12345679',
      orgId: '500002',
      registeredOffice: '10 Export Street, Bristol, BS1 2AB',
      appropriateAgency: 'SEPA',
      registrationNumber: 'R87654321AL',
      tradingName: 'Export Trading',
      reprocessingSite: '',
      packagingWasteCategory: 'Aluminium',
      annexIIProcess: 'R4',
      accreditationStatus: '',
      accreditationNo: '',
      tonnageBand: '',
      activeDate: '',
      dateLastChanged: ''
    }
  ]

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-04T14:49:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should generate a CSV string with correct headers and data rows', async () => {
    const csvOutput = await generateCsv(mockInput)

    const expectedCsv =
      '\uFEFF' + // ← Add BOM to expected string
      'Type,Business name,Companies House Number,Org ID,"Registered office\n' +
      'Head office\n' +
      'Main place of business in UK",Appropriate Agency,Registration number,Trading name,Registered Reprocessing site (UK),Packaging Waste Category,Annex II Process,Accreditation No,Active Date,Accreditation status,Date status last changed,Tonnage Band\n' +
      '04.02.26 14:49,,,,,,,,,,,,,,,\n' +
      'Reprocessor,Waste Ltd,12345678,500001,"1 Waste Road, London, N1 1AA",EA,R12345678PL,Waste Recovery,"2 Waste Site, London, EC1 1AA",Plastic,R3,A123456PL,22/01/2026,Approved,22/01/2026,"Up to 10,000 tonnes"\n' +
      'Exporter,Export Co,12345679,500002,"10 Export Street, Bristol, BS1 2AB",SEPA,R87654321AL,Export Trading,,Aluminium,R4,,,,,'

    expect(csvOutput).toBe(expectedCsv)
  })
})
