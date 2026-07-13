import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import {
  buildEffectiveMaterialStages,
  formatTonnageMonitoringResults
} from '#application/common/material-aggregation.js'
import { getMonthNames } from '#common/helpers/date-formatter.js'

const ORGANISATIONS_COLLECTION = 'epr-organisations'
const WASTE_RECORDS_COLLECTION = 'waste-records'
const DATA_PROCESSING_TYPE = '$data.processingType'
const DISPATCH_DATE_FIELD = '$dispatchDate'

const buildTonnageExpression = () => ({
  $switch: {
    branches: [
      {
        case: {
          $and: [
            { $eq: [DATA_PROCESSING_TYPE, PROCESSING_TYPES.EXPORTER] },
            { $eq: ['$type', WASTE_RECORD_TYPE.EXPORTED] }
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
              $eq: [DATA_PROCESSING_TYPE, PROCESSING_TYPES.REPROCESSOR_INPUT]
            },
            { $eq: ['$type', WASTE_RECORD_TYPE.RECEIVED] }
          ]
        },
        then: { $ifNull: ['$data.TONNAGE_RECEIVED_FOR_RECYCLING', 0] }
      },
      {
        case: {
          $and: [
            {
              $eq: [DATA_PROCESSING_TYPE, PROCESSING_TYPES.REPROCESSOR_OUTPUT]
            },
            { $eq: ['$type', WASTE_RECORD_TYPE.PROCESSED] },
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
        case: { $eq: [DATA_PROCESSING_TYPE, PROCESSING_TYPES.EXPORTER] },
        then: '$data.DATE_OF_EXPORT'
      },
      {
        case: {
          $eq: [DATA_PROCESSING_TYPE, PROCESSING_TYPES.REPROCESSOR_INPUT]
        },
        then: '$data.DATE_RECEIVED_FOR_REPROCESSING'
      },
      {
        case: {
          $eq: [DATA_PROCESSING_TYPE, PROCESSING_TYPES.REPROCESSOR_OUTPUT]
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
        case: { $eq: [DATA_PROCESSING_TYPE, PROCESSING_TYPES.EXPORTER] },
        then: capitalizeType(WASTE_PROCESSING_TYPE.EXPORTER)
      },
      {
        case: {
          $eq: [DATA_PROCESSING_TYPE, PROCESSING_TYPES.REPROCESSOR_INPUT]
        },
        then: capitalizeType(WASTE_PROCESSING_TYPE.REPROCESSOR)
      },
      {
        case: {
          $eq: [DATA_PROCESSING_TYPE, PROCESSING_TYPES.REPROCESSOR_OUTPUT]
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

const buildMaterialLookupStage = () => ({
  $lookup: {
    from: ORGANISATIONS_COLLECTION,
    let: {
      orgId: { $toObjectId: '$_id.organisationId' },
      regId: '$_id.registrationId'
    },
    pipeline: [
      { $match: { $expr: { $eq: ['$_id', '$$orgId'] } } },
      { $unwind: '$registrations' },
      { $match: { $expr: { $eq: ['$registrations.id', '$$regId'] } } },
      {
        $project: {
          orgId: '$orgId',
          material: '$registrations.material',
          glassRecyclingProcess: '$registrations.glassRecyclingProcess'
        }
      }
    ],
    as: 'orgData'
  }
})

const buildWasteRecordMatchStage = () => ({
  $match: {
    type: {
      $in: [
        WASTE_RECORD_TYPE.RECEIVED,
        WASTE_RECORD_TYPE.PROCESSED,
        WASTE_RECORD_TYPE.EXPORTED
      ]
    },
    'data.processingType': {
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
      organisationId: '$organisationId',
      registrationId: '$registrationId',
      year: '$year',
      monthNumber: '$monthNumber',
      month: '$month',
      type: '$type'
    },
    totalTonnage: { $sum: '$calculatedTonnage' }
  }
})

const buildMaterialGroupStage = () => ({
  $group: {
    _id: {
      material: '$effectiveMaterial',
      year: '$_id.year',
      monthNumber: '$_id.monthNumber',
      month: '$_id.month',
      type: '$_id.type'
    },
    totalTonnage: { $sum: '$totalTonnage' }
  }
})

const buildProjectionStage = () => ({
  $project: {
    _id: 0,
    material: '$_id.material',
    year: '$_id.year',
    monthNumber: '$_id.monthNumber',
    month: '$_id.month',
    type: '$_id.type',
    totalTonnage: 1
  }
})

const buildAggregationPipeline = () => [
  buildWasteRecordMatchStage(),
  buildComputedFieldsStage(),
  buildValidRecordMatchStage(),
  buildDateFieldsStage(),
  buildTonnageGroupStage(),
  buildMaterialLookupStage(),
  ...buildEffectiveMaterialStages(),
  buildMaterialGroupStage(),
  buildProjectionStage()
]

export const aggregateTonnageByMaterial = async (db) => {
  const pipeline = buildAggregationPipeline()

  const results = await db
    .collection(WASTE_RECORDS_COLLECTION)
    .aggregate(pipeline)
    .toArray()

  const { materials, total } = formatTonnageMonitoringResults(results)

  return {
    generatedAt: new Date().toISOString(),
    materials,
    total
  }
}
