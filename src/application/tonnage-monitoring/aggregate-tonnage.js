import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import {
  MATERIAL,
  TONNAGE_MONITORING_MATERIALS
} from '#domain/organisations/model.js'

const ORGANISATIONS_COLLECTION = 'epr-organisations'
const WASTE_RECORDS_COLLECTION = 'waste-records'
const DATA_PROCESSING_TYPE = '$data.processingType'

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
          material: '$registrations.material',
          glassRecyclingProcess: '$registrations.glassRecyclingProcess'
        }
      }
    ],
    as: 'orgData'
  }
})

const buildAggregationPipeline = () => [
  {
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
  },
  {
    $addFields: {
      dispatchDate: buildDispatchDateExpression(),
      calculatedTonnage: buildTonnageExpression()
    }
  },
  { $match: { dispatchDate: { $ne: null }, calculatedTonnage: { $gt: 0 } } },
  {
    $group: {
      _id: {
        organisationId: '$organisationId',
        registrationId: '$registrationId'
      },
      totalTonnage: { $sum: '$calculatedTonnage' }
    }
  },
  buildMaterialLookupStage(),
  {
    $addFields: {
      material: { $arrayElemAt: ['$orgData.material', 0] },
      glassRecyclingProcess: {
        $arrayElemAt: ['$orgData.glassRecyclingProcess', 0]
      }
    }
  },
  { $match: { material: { $ne: null } } },
  {
    $addFields: {
      effectiveMaterial: {
        $cond: {
          if: { $eq: ['$material', MATERIAL.GLASS] },
          then: { $arrayElemAt: ['$glassRecyclingProcess', 0] },
          else: '$material'
        }
      }
    }
  },
  {
    $group: {
      _id: '$effectiveMaterial',
      totalTonnage: { $sum: '$totalTonnage' }
    }
  },
  { $sort: { _id: 1 } }
]

const formatTonnageResults = (results) => {
  const allMaterials = TONNAGE_MONITORING_MATERIALS
  const materialTonnageMap = new Map(
    results.map((r) => [r._id, r.totalTonnage])
  )

  const materials = allMaterials.map((material) => ({
    material,
    totalTonnage: materialTonnageMap.get(material) || 0
  }))

  const total = materials.reduce((sum, item) => sum + item.totalTonnage, 0)

  return { materials, total }
}

export const aggregateTonnageByMaterial = async (db) => {
  const pipeline = buildAggregationPipeline()

  const results = await db
    .collection(WASTE_RECORDS_COLLECTION)
    .aggregate(pipeline)
    .toArray()

  const { materials, total } = formatTonnageResults(results)

  return {
    generatedAt: new Date().toISOString(),
    materials,
    total
  }
}
