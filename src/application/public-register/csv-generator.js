/** @import {PublicRegisterRow} from './types.js' */

import { writeToString } from '@fast-csv/format'
import { formatDateTimeDots } from '#common/helpers/date-formatter.js'

/**
 * Generates a CSV string from transformed data
 * @param {PublicRegisterRow[]} rows - Output from transform function
 * @returns {Promise<string>} - CSV string with BOM
 */
export async function generateCsv(rows) {
  const headerMapping = [
    ['type', 'Type'],
    ['businessName', 'Business name'],
    ['companiesHouseNumber', 'Companies House Number'],
    ['orgId', 'Org ID'],
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

  const generatedAtTimestamp = formatDateTimeDots(new Date())

  const generatedAtRow = [
    `Generated at ${generatedAtTimestamp}`,
    ...Array.from({ length: headerMapping.length - 1 }, () => '')
  ]

  const allRows = [
    generatedAtRow,
    headerMapping.map(([_, header]) => header),
    ...rows.map((row) => headerMapping.map(([key]) => row[key]))
  ]

  return writeToString(allRows, {
    writeBOM: true
  })
}
