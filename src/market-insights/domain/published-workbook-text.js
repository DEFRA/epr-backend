/**
 * The fixed wording of the published market insights workbook, "UK Accredited
 * Packaging Waste Monthly Aggregated Data".
 *
 * External stakeholders ingest the published file with their own tools, so its
 * wording is copied here exactly as published, trailing spaces included. The
 * glass labels differ between tabs in the published file, and so they differ
 * here.
 */

import {
  GLASS_RECYCLING_PROCESS,
  MATERIAL
} from '#domain/organisations/model.js'

/** @import { Material } from '#domain/organisations/model.js' */

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
export const WASTE_BALANCE_NOTE = Object.freeze({
  lead: 'Note',
  body:
    ': This data shows tonnage credited to accredited operators’ waste balances during the reporting month, which is made up of issued PRNs and tonnage eligible for PRN/PERN issuance. Further details are available on this GOV.UK page.\n' +
    '\n' +
    'Data for ‘glass-other’ has not been split by accreditation type to protect commercial data for identifiable operators.'
})

/** The "GOV.UK page" the waste balance note links to. */
export const WASTE_BALANCE_GUIDANCE =
  'https://www.gov.uk/government/publications/packaging-waste-data-reported-by-reprocessors-and-exporters'

/** @type {Note} */
export const OUTSTANDING_RETURNS_NOTE = Object.freeze({
  lead: 'Note',
  body:
    ': The tonnage bands below refer to the volume of packaging waste, by material category, that a reprocessor or exporter is accredited to issue PRNs or PERNs against.\n' +
    'For reprocessors, this is the tonnage band of packaging waste which the operator is accredited to issue PRNs against at the specified reprocessing site. \n' +
    'For exporters, this is the tonnage band of packaging waste which the operator is accredited to issue PERNs against for the specified waste exports.'
})

/** @type {Note} */
export const NATION_FIGURES_NOTE = Object.freeze({
  lead: 'Notes',
  body:
    ': Figures are provisional and based on submissions received to date, some data is still expected and will be included in future updates.\n' +
    '\n' +
    'Reported PRN/PERN revenue submissions currently include some anomalies and remain subject to correction by re-submissions from operators.'
})

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

const GLASS_REMELT = 'Glass re-melt'
const PAPER_AND_BOARD = 'Paper and board'

/** Material and accreditation type, one pair per row of the waste balance. */
export const WASTE_BALANCE_ROWS = Object.freeze([
  ['Aluminium', 'Exporter'],
  ['Aluminium', 'Reprocessor'],
  ['Glass-other', 'Exp & Rep'],
  [GLASS_REMELT, 'Exporter'],
  [GLASS_REMELT, 'Reprocessor'],
  [PAPER_AND_BOARD, 'Exporter'],
  [PAPER_AND_BOARD, 'Reprocessor'],
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
  GLASS_REMELT,
  PAPER_AND_BOARD,
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

/**
 * The rows of the UK and England tables, in published order, by the material
 * each row is.
 *
 * @type {readonly (readonly [Material, string])[]}
 */
export const NATION_FIGURES_MATERIALS = Object.freeze([
  [MATERIAL.ALUMINIUM, 'Aluminium'],
  [MATERIAL.FIBRE, 'Fibre based composite'],
  [GLASS_RECYCLING_PROCESS.GLASS_OTHER, 'Glass-other'],
  [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT, GLASS_REMELT],
  [MATERIAL.PAPER, PAPER_AND_BOARD],
  [MATERIAL.PLASTIC, 'Plastic'],
  [MATERIAL.STEEL, 'Steel'],
  [MATERIAL.WOOD, 'Wood']
])

export const GRAND_TOTAL = 'Grand Total'

/** What the published file prints where a row has no figure. */
export const NO_FIGURE = '-'

/** The column headings of the UK and England tables, which the Key describes. */
const COLUMN = Object.freeze({
  MATERIAL: 'Material',
  RECEIVED_FOR_RECYCLING: 'Tonnage received for recycling',
  RECYCLED: 'Tonnage recycled',
  RECEIVED_BUT_UNRECYCLED: 'Tonnage received but unrecycled',
  SENT_ON_TOTAL: 'Tonnage sent on, total',
  SENT_ON_TO_REPROCESSOR: 'Tonnage sent on to a reprocessor',
  SENT_ON_TO_EXPORTER: 'Tonnage sent on to an exporter',
  SENT_ON_TO_OTHER_FACILITIES: 'Tonnage sent on to other facilities',
  RECEIVED_FOR_EXPORTING: 'Tonnage received for exporting',
  EXPORTED_FOR_RECYCLING: 'Tonnage exported for recycling',
  RECEIVED_BUT_UNEXPORTED: 'Tonnage received but unexported',
  EXPORTED_STOPPED: 'Tonnage exported that was stopped',
  EXPORTED_REFUSED: 'Tonnage exported that was refused',
  REPATRIATED: 'Tonnage repatriated',
  NOTES_ISSUED: 'Tonnage of PRNs/PERNs issued',
  NOTES_REVENUE: 'Total revenue from PRNs/PERNs\n(£)',
  NOTES_AVERAGE_PRICE: 'Average PRN/PERN price per tonne \n(£)'
})

const TONNAGE_SENT_ON = Object.freeze([
  COLUMN.SENT_ON_TOTAL,
  COLUMN.SENT_ON_TO_REPROCESSOR,
  COLUMN.SENT_ON_TO_EXPORTER,
  COLUMN.SENT_ON_TO_OTHER_FACILITIES
])

const PRN_COLUMNS = Object.freeze([
  COLUMN.MATERIAL,
  COLUMN.NOTES_ISSUED,
  COLUMN.NOTES_REVENUE,
  COLUMN.NOTES_AVERAGE_PRICE
])

const REPROCESSOR_DATA = 'Reprocessor Data '

/**
 * @typedef {{ title: string, columns: readonly string[] }} FiguresTable
 */

/**
 * The four tables each month gets on the UK and England tabs, in the order
 * they appear down the tab.
 *
 * @type {Readonly<Record<'reprocessor' | 'exporter' | 'reprocessorPrn' | 'exporterPern', FiguresTable>>}
 */
export const NATION_FIGURES_TABLES = Object.freeze({
  reprocessor: {
    title: REPROCESSOR_DATA,
    columns: [
      COLUMN.MATERIAL,
      COLUMN.RECEIVED_FOR_RECYCLING,
      COLUMN.RECYCLED,
      COLUMN.RECEIVED_BUT_UNRECYCLED,
      ...TONNAGE_SENT_ON
    ]
  },
  exporter: {
    title: 'Exporter Data ',
    columns: [
      COLUMN.MATERIAL,
      COLUMN.RECEIVED_FOR_EXPORTING,
      COLUMN.EXPORTED_FOR_RECYCLING,
      COLUMN.RECEIVED_BUT_UNEXPORTED,
      ...TONNAGE_SENT_ON,
      COLUMN.EXPORTED_STOPPED,
      COLUMN.EXPORTED_REFUSED,
      COLUMN.REPATRIATED
    ]
  },
  reprocessorPrn: { title: 'Reprocessor PRN Data ', columns: PRN_COLUMNS },
  exporterPern: { title: 'Exporter PERN Data ', columns: PRN_COLUMNS }
})

/**
 * A row of a Key table, in columns A, B, D and E: the reprocessor's field and
 * its description, then the exporter's. A half with no field is null.
 *
 * @typedef {readonly [string | null, string | null, string, string]} KeyRow
 */

/** @type {readonly KeyRow[]} */
const KEY_TONNAGE_ROWS = [
  [
    COLUMN.MATERIAL,
    'Category of packaging waste.',
    COLUMN.MATERIAL,
    'Category of packaging waste.'
  ],
  [
    COLUMN.RECEIVED_FOR_RECYCLING,
    'Eligible packaging waste received for recycling at a reprocessing site. Note, this tonnage does not include operators issuing PRNs on the weight of recycled packaging waste content which is the output of the recycling at a reprocessing site.',
    COLUMN.RECEIVED_FOR_RECYCLING,
    'The weight of eligible packaging waste in that category received by the exporter for exporting in each reporting period.'
  ],
  [
    COLUMN.RECYCLED,
    'Refers to the weight of eligible packaging waste in that category recycled in the reporting period by the reprocessor at the reprocessing site.',
    COLUMN.EXPORTED_FOR_RECYCLING,
    'The weight of eligible packaging waste in that category exported for recycling in the reporting period. ‘Tonnage exported’ is not included in waste balances until the ‘date received by approved overseas reprocessor’ field has been completed within the export summary log.'
  ],
  [
    COLUMN.RECEIVED_BUT_UNRECYCLED,
    'The weight of packaging waste in that category received at the reprocessing site in the reporting period which was not recycled by the reprocessor at the site ("unrecycled packaging waste"). ',
    COLUMN.RECEIVED_BUT_UNEXPORTED,
    'The weight of packaging waste in that category received by the exporter in the reporting period which has not been exported by the exporter ("unexported packaging waste").'
  ],
  [
    COLUMN.SENT_ON_TOTAL,
    'The total weight of unrecycled packaging waste in that category which, in the reporting period, was sent to another reprocessor; exported; or sent to any other facility or site.  ',
    COLUMN.SENT_ON_TOTAL,
    'The total weight of unexported packaging waste in that category which, in the reporting period, was sent to a reprocessor in the United Kingdom; sent to another exporter in the United Kingdom; or sent to any other facility or site in the United Kingdom.'
  ],
  [
    COLUMN.SENT_ON_TO_REPROCESSOR,
    'A subset of ‘Tonnage sent on, total’, indicating the total weight of unrecycled packaging waste in that category which, in the reporting period, was sent to another reprocessor.',
    COLUMN.SENT_ON_TO_REPROCESSOR,
    'A subset of ‘Tonnage sent on, total’, indicating the total weight of unexported packaging waste in that category which, in the reporting period, was sent to a reprocessor in the United Kingdom. '
  ],
  [
    COLUMN.SENT_ON_TO_EXPORTER,
    'A subset of ‘Tonnage sent on, total’, indicating the total weight of unrecycled packaging waste in that category which, in the reporting period, was sent to an exporter.   ',
    COLUMN.SENT_ON_TO_EXPORTER,
    'A subset of ‘Tonnage sent on, total’, indicating the total weight of unexported packaging waste in that category which, in the reporting period, was sent to another exporter in the United Kingdom.'
  ],
  [
    COLUMN.SENT_ON_TO_OTHER_FACILITIES,
    'A subset of ‘Tonnage sent on, total’, indicating the total weight of unrecycled packaging waste in that category which, in the reporting period, was sent to any other facility or site.  ',
    COLUMN.SENT_ON_TO_OTHER_FACILITIES,
    'A subset of ‘Tonnage sent on, total’, indicating the total weight of unexported packaging waste in that category which, in the reporting period, was sent to any other facility or site in the United Kingdom.'
  ],
  [
    null,
    null,
    COLUMN.EXPORTED_STOPPED,
    'The weight of packaging waste in that category exported for recycling in the reporting period which was stopped during the course of export.'
  ],
  [
    null,
    null,
    COLUMN.EXPORTED_REFUSED,
    'The weight of packaging waste in that category exported for recycling in the reporting period which was refused by the recipient destination.'
  ],
  [
    null,
    null,
    COLUMN.REPATRIATED,
    'The weight of packaging waste in that category exported for recycling, which was either stopped or refused by the recipient and has been repatriated in the reporting period.'
  ]
]

/** @type {readonly KeyRow[]} */
const KEY_NOTES_ROWS = [
  [
    COLUMN.NOTES_ISSUED,
    'The tonnage of packaging waste for which PRNs were issued by the reprocessor in that month.',
    COLUMN.NOTES_ISSUED,
    'The tonnage of packaging waste for which PERNs were issued by the exporter in that month.'
  ],
  [
    COLUMN.NOTES_REVENUE,
    'The total revenue generated by the reprocessor from the sale of PRNs in that month.',
    COLUMN.NOTES_REVENUE,
    'The total revenue generated by the exporter from the sale of PERNs in that month.'
  ],
  [
    COLUMN.NOTES_AVERAGE_PRICE,
    "The average price per tonne of packaging waste received by the reprocessor for the sale of PRNs in that month. Calculated by dividing the sum of 'Total revenue from PRNs/PERNs' / 'Tonnage of PRNs/PERNs issued'",
    COLUMN.NOTES_AVERAGE_PRICE,
    "The average price per tonne of packaging waste received by the exporter for the sale of PERNs in that month. Calculated by dividing the sum of 'Total revenue from PRNs/PERNs' / 'Tonnage of PRNs/PERNs issued'"
  ]
]

/**
 * The Key tab: an introduction, then two tables, each under the same title
 * and headings. The exporter half of the first table names "Tonnage received
 * for recycling" where its column is "Tonnage received for exporting", as
 * published.
 *
 * @type {Readonly<{ introduction: string, title: readonly (string | null)[], headings: readonly string[], tables: readonly (readonly KeyRow[])[] }>}
 */
export const KEY = Object.freeze({
  introduction:
    'The following information is provided to help users understand the data fields included in this report:',
  title: [REPROCESSOR_DATA, null, 'Exporter Data', null],
  headings: ['Data Field ', 'Description ', 'Data Field ', 'Description '],
  tables: [KEY_TONNAGE_ROWS, KEY_NOTES_ROWS]
})
