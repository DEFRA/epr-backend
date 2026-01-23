/** @import {PublicRegisterRow} from './types.js' */

import { writeToString } from '@fast-csv/format'

/**
 * Generates a CSV string from transformed data
 * @param {PublicRegisterRow[]} rows - Output from transform function
 * @returns {Promise<string>} - CSV string with BOM
 */
export async function generateCsv(rows) {
  const headerMapping = [
    ['type', 'Type'],
    ['businessName', 'Business name'],
    [
      'registeredOffice',
      'Registered office\nHead office\nMain place of business in UK'
    ],
    ['appropriateAgency', 'Appropriate Agency'],
    ['registrationNumber', 'Registration number'],
    ['tradingName', 'Trading name'],
    ['reprocessingSite', 'Registered Reprocessing site (UK)'],
    ['packagingWasteCategory', 'Packaging Waste Category'],
    ['annexIIProcess', 'Annex II Process'],
    ['accreditationNo', 'Accreditation No'],
    ['activeDate', 'Active Date'],
    ['accreditationStatus', 'Accreditation status'],
    ['dateLastChanged', 'Date status last changed'],
    ['tonnageBand', 'Tonnage Band']
  ]

  return writeToString(rows, {
    headers: headerMapping.map(([_, header]) => header),
    transform: (row) => headerMapping.map(([key]) => row[key]),
    writeBOM: true
  })
}
