import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { generateCsv } from './csv-generator.js'

/** @import {PublicRegisterRow} from './types.js' */
/** @import {CompliancePeriod} from '#reports/domain/compliance-reporting-periods.js' */

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
    const periods = /** @type {CompliancePeriod[]} */ ([
      { label: 'Jan Report', key: '2026:monthly:1' },
      { label: 'Q1 Report', key: '2026:quarterly:1' }
    ])
    const rows = /** @type {PublicRegisterRow[]} */ (
      /** @type {unknown} */ ([
        { ...mockInput[0], 'Jan Report': '05/01/2026', 'Q1 Report': 'N/A' },
        { ...mockInput[1], 'Jan Report': '', 'Q1 Report': '15/04/2026' }
      ])
    )

    const csv = await generateCsv(rows, periods)

    expect(csv).toBe(
      '﻿' +
        'Generated at 04.02.26 14:49,,,,,,,,,,,,,,,,,\n' +
        'Type,Business name,Companies House Number,Org ID,"Registered office\n' +
        'Head office\n' +
        'Main place of business in UK",Appropriate Agency,Registration number,Trading name,Registered Reprocessing site (UK),Packaging Waste Category,Annex II Process,Accreditation No,Active Date,Accreditation status,Date status last changed,Tonnage Band,Jan Report,Q1 Report\n' +
        'Reprocessor,Waste Ltd,12345678,500001,"1 Waste Road, London, N1 1AA",EA,R12345678PL,Waste Recovery,"2 Waste Site, London, EC1 1AA",Plastic,R3,A123456PL,22/01/2026,Approved,22/01/2026,"Up to 10,000 tonnes",05/01/2026,N/A\n' +
        'Exporter,Export Co,12345679,500002,"10 Export Street, Bristol, BS1 2AB",SEPA,R87654321AL,Export Trading,,Aluminium,R4,,,,,,,15/04/2026'
    )
  })
})
