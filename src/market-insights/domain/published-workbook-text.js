/**
 * The fixed wording of the published market insights workbook, "UK Accredited
 * Packaging Waste Monthly Aggregated Data".
 *
 * External stakeholders ingest the published file with their own tools, so its
 * wording is copied here exactly as published, trailing spaces included. The
 * glass labels differ between tabs in the published file, and so they differ
 * here.
 */

export const WORKSHEET_NAME = Object.freeze({
  WASTE_BALANCE: 'UK Waste Balance ',
  KEY: 'Key',
  OUTSTANDING_RETURNS: 'No. UK Outstanding Returns ',
  UK: 'UK',
  ENGLAND: 'England'
})

/**
 * A note's text, as the bold lead-in and the italic remainder.
 *
 * @typedef {{ lead: string, body: string }} Note
 */

/** @type {Note} */
export const WASTE_BALANCE_NOTE = {
  lead: 'Note',
  body:
    ': This data shows tonnage credited to accredited operators’ waste balances during the reporting month, which is made up of issued PRNs and tonnage eligible for PRN/PERN issuance. Further details are available on this GOV.UK page.\n' +
    '\n' +
    'Data for ‘glass-other’ has not been split by accreditation type to protect commercial data for identifiable operators.'
}

/** @type {Note} */
export const OUTSTANDING_RETURNS_NOTE = {
  lead: 'Note',
  body:
    ': The tonnage bands below refer to the volume of packaging waste, by material category, that a reprocessor or exporter is accredited to issue PRNs or PERNs against.\n' +
    'For reprocessors, this is the tonnage band of packaging waste which the operator is accredited to issue PRNs against at the specified reprocessing site. \n' +
    'For exporters, this is the tonnage band of packaging waste which the operator is accredited to issue PERNs against for the specified waste exports.'
}

/** @type {Note} */
export const NATION_FIGURES_NOTE = {
  lead: 'Notes',
  body:
    ': Figures are provisional and based on submissions received to date, some data is still expected and will be included in future updates.\n' +
    '\n' +
    'Reported PRN/PERN revenue submissions currently include some anomalies and remain subject to correction by re-submissions from operators.'
}

/**
 * @param {string} extractionDate - e.g. '10 August 2026'
 * @returns {string}
 */
export const dataAsOf = (extractionDate) => `Data as of ${extractionDate}  `

/**
 * @param {string} period - e.g. 'January to June 2026'
 * @returns {string}
 */
export const wasteBalanceIntroduction = (period) =>
  `The table below shows the UK credited waste balance for ${period}`

/**
 * @param {string} period - e.g. 'January to June 2026'
 * @returns {string}
 */
export const outstandingReturnsIntroduction = (period) =>
  `The tables below show the number of unsubmitted UK monthly returns for ${period}`

export const OUTSTANDING_RETURNS_INTRODUCTION_SUFFIX =
  ' (Accredited Reprocessors & Exporters combined)'

export const WASTE_BALANCE_COLUMNS = Object.freeze({
  before: ['Material', 'Accreditation Type'],
  after: ['Total']
})

export const UNSUBMITTED_COUNT = 'Unsubmitted count'

/** Material and accreditation type, one pair per row of the waste balance. */
export const WASTE_BALANCE_ROWS = Object.freeze([
  ['Aluminium', 'Exporter'],
  ['Aluminium', 'Reprocessor'],
  ['Glass-other', 'Exp & Rep'],
  ['Glass re-melt', 'Exporter'],
  ['Glass re-melt', 'Reprocessor'],
  ['Paper and board', 'Exporter'],
  ['Paper and board', 'Reprocessor'],
  ['Plastic', 'Exporter'],
  ['Plastic', 'Reprocessor'],
  ['Steel', 'Exporter'],
  ['Steel', 'Reprocessor'],
  ['Wood', 'Exporter'],
  ['Wood', 'Reprocessor']
])

export const OUTSTANDING_RETURNS_MATERIALS = Object.freeze([
  'Aluminium',
  'Glass other',
  'Glass re-melt',
  'Paper and board',
  'Plastic',
  'Steel',
  'Wood'
])

export const TONNAGE_BANDS = Object.freeze([
  'Up to 500 tonnes',
  'Up to 5,000 tonnes',
  'Up to 10,000 tonnes',
  'Over 10,000 tonnes'
])

export const NATION_FIGURES_MATERIALS = Object.freeze([
  'Aluminium',
  'Glass-other',
  'Glass re-melt',
  'Paper and board',
  'Plastic',
  'Steel',
  'Wood'
])

export const GRAND_TOTAL = 'Grand Total'

const TONNAGE_SENT_ON = Object.freeze([
  'Tonnage sent on, total',
  'Tonnage sent on to a reprocessor',
  'Tonnage sent on to an exporter',
  'Tonnage sent on to other facilities'
])

const PRN_COLUMNS = Object.freeze([
  'Material',
  'Tonnage of PRNs/PERNs issued',
  'Total revenue from PRNs/PERNs\n(£)',
  'Average PRN/PERN price per tonne \n(£)'
])

/**
 * The four tables each month gets on the UK and England tabs, in the order
 * they appear down the tab.
 */
export const NATION_FIGURES_TABLES = Object.freeze({
  reprocessor: {
    title: 'Reprocessor Data ',
    columns: [
      'Material',
      'Tonnage received for recycling',
      'Tonnage recycled',
      'Tonnage received but unrecycled',
      ...TONNAGE_SENT_ON
    ]
  },
  exporter: {
    title: 'Exporter Data ',
    columns: [
      'Material',
      'Tonnage received for exporting',
      'Tonnage exported for recycling',
      'Tonnage received but unexported',
      ...TONNAGE_SENT_ON,
      'Tonnage exported that was stopped',
      'Tonnage exported that was refused',
      'Tonnage repatriated'
    ]
  },
  reprocessorPrn: { title: 'Reprocessor PRN Data ', columns: PRN_COLUMNS },
  exporterPern: { title: 'Exporter PERN Data ', columns: PRN_COLUMNS }
})

/**
 * The Key tab, row by row: each row's cells in columns A, B, D and E.
 *
 * @type {readonly [number, (string | null)[]][]}
 */
export const KEY_ROWS = Object.freeze([
  [
    2,
    [
      'The following information is provided to help users understand the data fields included in this report:'
    ]
  ],
  [4, ['Reprocessor Data ', null, 'Exporter Data']],
  [5, ['Data Field ', 'Description ', 'Data Field ', 'Description ']],
  [
    6,
    [
      'Material',
      'Category of packaging waste.',
      'Material',
      'Category of packaging waste.'
    ]
  ],
  [
    7,
    [
      'Tonnage received for recycling',
      'Eligible packaging waste received for recycling at a reprocessing site. Note, this tonnage does not include operators issuing PRNs on the weight of recycled packaging waste content which is the output of the recycling at a reprocessing site.',
      'Tonnage received for recycling',
      'The weight of eligible packaging waste in that category received by the exporter for exporting in each reporting period.'
    ]
  ],
  [
    8,
    [
      'Tonnage recycled',
      'Refers to the weight of eligible packaging waste in that category recycled in the reporting period by the reprocessor at the reprocessing site.',
      'Tonnage exported for recycling',
      'The weight of eligible packaging waste in that category exported for recycling in the reporting period. ‘Tonnage exported’ is not included in waste balances until the ‘date received by approved overseas reprocessor’ field has been completed within the export summary log.'
    ]
  ],
  [
    9,
    [
      'Tonnage received but unrecycled',
      'The weight of packaging waste in that category received at the reprocessing site in the reporting period which was not recycled by the reprocessor at the site ("unrecycled packaging waste"). ',
      'Tonnage received but unexported',
      'The weight of packaging waste in that category received by the exporter in the reporting period which has not been exported by the exporter ("unexported packaging waste").'
    ]
  ],
  [
    10,
    [
      'Tonnage sent on, total',
      'The total weight of unrecycled packaging waste in that category which, in the reporting period, was sent to another reprocessor; exported; or sent to any other facility or site.  ',
      'Tonnage sent on, total',
      'The total weight of unexported packaging waste in that category which, in the reporting period, was sent to a reprocessor in the United Kingdom; sent to another exporter in the United Kingdom; or sent to any other facility or site in the United Kingdom.'
    ]
  ],
  [
    11,
    [
      'Tonnage sent on to a reprocessor',
      'A subset of ‘Tonnage sent on, total’, indicating the total weight of unrecycled packaging waste in that category which, in the reporting period, was sent to another reprocessor.',
      'Tonnage sent on to a reprocessor',
      'A subset of ‘Tonnage sent on, total’, indicating the total weight of unexported packaging waste in that category which, in the reporting period, was sent to a reprocessor in the United Kingdom. '
    ]
  ],
  [
    12,
    [
      'Tonnage sent on to an exporter',
      'A subset of ‘Tonnage sent on, total’, indicating the total weight of unrecycled packaging waste in that category which, in the reporting period, was sent to an exporter.   ',
      'Tonnage sent on to an exporter',
      'A subset of ‘Tonnage sent on, total’, indicating the total weight of unexported packaging waste in that category which, in the reporting period, was sent to another exporter in the United Kingdom.'
    ]
  ],
  [
    13,
    [
      'Tonnage sent on to other facilities',
      'A subset of ‘Tonnage sent on, total’, indicating the total weight of unrecycled packaging waste in that category which, in the reporting period, was sent to any other facility or site.  ',
      'Tonnage sent on to other facilities',
      'A subset of ‘Tonnage sent on, total’, indicating the total weight of unexported packaging waste in that category which, in the reporting period, was sent to any other facility or site in the United Kingdom.'
    ]
  ],
  [
    14,
    [
      null,
      null,
      'Tonnage exported that was stopped',
      'The weight of packaging waste in that category exported for recycling in the reporting period which was stopped during the course of export.'
    ]
  ],
  [
    15,
    [
      null,
      null,
      'Tonnage exported that was refused',
      'The weight of packaging waste in that category exported for recycling in the reporting period which was refused by the recipient destination.'
    ]
  ],
  [
    16,
    [
      null,
      null,
      'Tonnage repatriated',
      'The weight of packaging waste in that category exported for recycling, which was either stopped or refused by the recipient and has been repatriated in the reporting period.'
    ]
  ],
  [18, ['Reprocessor Data ', null, 'Exporter Data']],
  [19, ['Data Field ', 'Description ', 'Data Field ', 'Description ']],
  [
    20,
    [
      'Tonnage of PRNs/PERNs issued',
      'The tonnage of packaging waste for which PRNs were issued by the reprocessor in that month.',
      'Tonnage of PRNs/PERNs issued',
      'The tonnage of packaging waste for which PERNs were issued by the exporter in that month.'
    ]
  ],
  [
    21,
    [
      'Total revenue from PRNs/PERNs\n(£)',
      'The total revenue generated by the reprocessor from the sale of PRNs in that month.',
      'Total revenue from PRNs/PERNs\n(£)',
      'The total revenue generated by the exporter from the sale of PERNs in that month.'
    ]
  ],
  [
    22,
    [
      'Average PRN/PERN price per tonne \n(£)',
      "The average price per tonne of packaging waste received by the reprocessor for the sale of PRNs in that month. Calculated by dividing the sum of 'Total revenue from PRNs/PERNs' / 'Tonnage of PRNs/PERNs issued'",
      'Average PRN/PERN price per tonne \n(£)',
      "The average price per tonne of packaging waste received by the exporter for the sale of PERNs in that month. Calculated by dividing the sum of 'Total revenue from PRNs/PERNs' / 'Tonnage of PRNs/PERNs issued'"
    ]
  ]
])
