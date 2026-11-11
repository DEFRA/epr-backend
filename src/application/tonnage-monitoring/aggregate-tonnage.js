import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { formatTonnageMonitoringResults } from '#application/common/material-aggregation.js'
import { getMonthNames } from '#common/helpers/date-formatter.js'
import { TEST_ORGANISATION_NUMBERS } from '#common/helpers/parse-test-organisations.js'
import { SUMMARY_LOG_ROW_STATES_COLLECTION_NAME } from '#waste-records/repository/mongodb.js'

/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/repository/port.js' */
/** @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js' */

/**
 * @typedef {{
 *   _id: {
 *     organisationNumber: string
 *     registrationNumber: string
 *     year: number
 *     monthNumber: number
 *     month: string
 *     type: string
 *   }
 *   totalTonnage: number
 * }} RegistrationTonnage
 */

const PROCESSING_TYPE_FIELD = '$processingType'
const WASTE_RECORD_TYPE_FIELD = '$wasteRecordType'
const DISPATCH_DATE_FIELD = '$dispatchDate'

const buildTonnageExpression = () => ({
  $switch: {
    branches: [
      {
        case: {
          $and: [
            { $eq: [PROCESSING_TYPE_FIELD, PROCESSING_TYPES.EXPORTER] },
            { $eq: [WASTE_RECORD_TYPE_FIELD, WASTE_RECORD_TYPE.EXPORTED] }
          ]
        },
        then: {
          $cond: {
            if: {
              $eq: ['$data.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE', 'Yes']
            },
            then: {
              $ifNull: ['$data.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR', 0]
            },
            else: {
              $ifNull: ['$data.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED', 0]
            }
          }
        }
      },
      {
        case: {
          $and: [
            {
              $eq: [PROCESSING_TYPE_FIELD, PROCESSING_TYPES.REPROCESSOR_INPUT]
            },
            { $eq: [WASTE_RECORD_TYPE_FIELD, WASTE_RECORD_TYPE.RECEIVED] }
          ]
        },
        then: { $ifNull: ['$data.TONNAGE_RECEIVED_FOR_RECYCLING', 0] }
      },
      {
        case: {
          $and: [
            {
              $eq: [PROCESSING_TYPE_FIELD, PROCESSING_TYPES.REPROCESSOR_OUTPUT]
            },
            { $eq: [WASTE_RECORD_TYPE_FIELD, WASTE_RECORD_TYPE.PROCESSED] },
            { $eq: ['$data.ADD_PRODUCT_WEIGHT', 'Yes'] }
          ]
        },
        then: { $ifNull: ['$data.PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION', 0] }
      }
    ],
    default: 0
  }
})

const buildDispatchDateExpression = () => ({
  $switch: {
    branches: [
      {
        case: { $eq: [PROCESSING_TYPE_FIELD, PROCESSING_TYPES.EXPORTER] },
        then: '$data.DATE_OF_EXPORT'
      },
      {
        case: {
          $eq: [PROCESSING_TYPE_FIELD, PROCESSING_TYPES.REPROCESSOR_INPUT]
        },
        then: '$data.DATE_RECEIVED_FOR_REPROCESSING'
      },
      {
        case: {
          $eq: [PROCESSING_TYPE_FIELD, PROCESSING_TYPES.REPROCESSOR_OUTPUT]
        },
        then: '$data.DATE_LOAD_LEFT_SITE'
      }
    ],
    default: null
  }
})

// Capitalize first letter: 'exporter' -> 'Exporter', 'reprocessor' -> 'Reprocessor'
const capitalizeType = (typeValue) => ({
  $concat: [
    { $toUpper: { $substrCP: [typeValue, 0, 1] } },
    { $substrCP: [typeValue, 1, { $strLenCP: typeValue }] }
  ]
})

const buildTypeExpression = () => ({
  $switch: {
    branches: [
      {
        case: { $eq: [PROCESSING_TYPE_FIELD, PROCESSING_TYPES.EXPORTER] },
        then: capitalizeType(WASTE_PROCESSING_TYPE.EXPORTER)
      },
      {
        case: {
          $eq: [PROCESSING_TYPE_FIELD, PROCESSING_TYPES.REPROCESSOR_INPUT]
        },
        then: capitalizeType(WASTE_PROCESSING_TYPE.REPROCESSOR)
      },
      {
        case: {
          $eq: [PROCESSING_TYPE_FIELD, PROCESSING_TYPES.REPROCESSOR_OUTPUT]
        },
        then: capitalizeType(WASTE_PROCESSING_TYPE.REPROCESSOR)
      }
    ],
    default: null
  }
})

// Use the same month names as getMonthRange for consistency
const monthNames = getMonthNames()

const buildYearExpression = () => ({
  $year: { $dateFromString: { dateString: DISPATCH_DATE_FIELD } }
})

const buildMonthNumberExpression = () => ({
  $month: { $dateFromString: { dateString: DISPATCH_DATE_FIELD } }
})

const buildMonthExpression = () => ({
  $let: {
    vars: {
      monthIndex: {
        $subtract: [
          { $month: { $dateFromString: { dateString: DISPATCH_DATE_FIELD } } },
          1
        ]
      }
    },
    in: { $arrayElemAt: [monthNames, '$$monthIndex'] }
  }
})

const buildLatestSubmittedRowStateMatchStage = (
  latestSubmittedSummaryLogIds
) => ({
  $match: {
    summaryLogIds: { $in: latestSubmittedSummaryLogIds },
    wasteRecordType: {
      $in: [
        WASTE_RECORD_TYPE.RECEIVED,
        WASTE_RECORD_TYPE.PROCESSED,
        WASTE_RECORD_TYPE.EXPORTED
      ]
    },
    processingType: {
      $in: [
        PROCESSING_TYPES.EXPORTER,
        PROCESSING_TYPES.REPROCESSOR_INPUT,
        PROCESSING_TYPES.REPROCESSOR_OUTPUT
      ]
    }
  }
})

const buildComputedFieldsStage = () => ({
  $addFields: {
    dispatchDate: buildDispatchDateExpression(),
    calculatedTonnage: buildTonnageExpression(),
    type: buildTypeExpression()
  }
})

const buildValidRecordMatchStage = () => ({
  $match: {
    calculatedTonnage: { $gt: 0 },
    $expr: {
      $ne: [
        { $dateFromString: { dateString: '$dispatchDate', onError: null } },
        null
      ]
    }
  }
})

const buildDateFieldsStage = () => ({
  $addFields: {
    year: buildYearExpression(),
    monthNumber: buildMonthNumberExpression(),
    month: buildMonthExpression()
  }
})

const buildTonnageGroupStage = () => ({
  $group: {
    _id: {
      organisationNumber: '$organisationNumber',
      registrationNumber: '$registrationNumber',
      year: '$year',
      monthNumber: '$monthNumber',
      month: '$month',
      type: '$type'
    },
    totalTonnage: { $sum: '$calculatedTonnage' }
  }
})

const buildAggregationPipeline = (latestSubmittedSummaryLogIds) => [
  buildLatestSubmittedRowStateMatchStage(latestSubmittedSummaryLogIds),
  buildComputedFieldsStage(),
  buildValidRecordMatchStage(),
  buildDateFieldsStage(),
  buildTonnageGroupStage()
]

/**
 * @param {string} organisationNumber
 * @param {string} registrationNumber
 */
const registrationKey = (organisationNumber, registrationNumber) =>
  `${organisationNumber}:${registrationNumber}`

/**
 * Test organisations are left out.
 *
 * @param {Organisation[]} organisations
 * @returns {Map<string, string>}
 */
const materialByRegistration = (organisations) =>
  new Map(
    organisations
      .filter(
        ({ organisationNumber }) =>
          !TEST_ORGANISATION_NUMBERS.has(organisationNumber)
      )
      .flatMap(({ organisationNumber, registrations }) =>
        Object.entries(registrations).map(
          ([registrationNumber, { material }]) => [
            registrationKey(organisationNumber, registrationNumber),
            material
          ]
        )
      )
  )

/**
 * Rows whose registration the read model doesn't serve are left out.
 *
 * @param {RegistrationTonnage[]} registrationTonnages
 * @param {Map<string, string>} materials
 */
const sumByMaterial = (registrationTonnages, materials) => {
  const totals = new Map()

  for (const { _id, totalTonnage } of registrationTonnages) {
    const material = materials.get(
      registrationKey(_id.organisationNumber, _id.registrationNumber)
    )
    if (material === undefined) {
      continue
    }
    const { year, monthNumber, month, type } = _id
    const key = `${material}-${year}-${monthNumber}-${type}`
    const existing = totals.get(key)
    if (existing) {
      existing.totalTonnage += totalTonnage
    } else {
      totals.set(key, {
        material,
        year,
        monthNumber,
        month,
        type,
        totalTonnage
      })
    }
  }

  return [...totals.values()]
}

/**
 * @param {import('mongodb').Db} db
 * @param {WasteBalanceLedgerRepository} ledgerRepository
 * @param {OrganisationReadRepository} organisationReadRepository
 */
export const aggregateTonnageByMaterial = async (
  db,
  ledgerRepository,
  organisationReadRepository
) => {
  const [latestSubmitted, organisations] = await Promise.all([
    ledgerRepository.findLatestSubmittedSummaryLogPerLedger(),
    organisationReadRepository.findAll()
  ])
  const latestSubmittedSummaryLogIds = latestSubmitted.map(
    (entry) => entry.summaryLogId
  )
  const pipeline = buildAggregationPipeline(latestSubmittedSummaryLogIds)

  const registrationTonnages = /** @type {RegistrationTonnage[]} */ (
    await db
      .collection(SUMMARY_LOG_ROW_STATES_COLLECTION_NAME)
      .aggregate(pipeline)
      .toArray()
  )

  const { materials, total } = formatTonnageMonitoringResults(
    sumByMaterial(registrationTonnages, materialByRegistration(organisations))
  )

  return {
    generatedAt: new Date().toISOString(),
    materials,
    total
  }
}
