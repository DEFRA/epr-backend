import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { MATERIAL } from '#domain/organisations/model.js'

const ORGANISATIONS_COLLECTION = 'epr-organisations'
const WASTE_RECORDS_COLLECTION = 'waste-records'

const buildTonnageExpression = () => ({
  $switch: {
    branches: [
      {
        case: {
          $and: [
            { $eq: ['$data.processingType', PROCESSING_TYPES.EXPORTER] },
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
              $eq: ['$data.processingType', PROCESSING_TYPES.REPROCESSOR_INPUT]
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
              $eq: ['$data.processingType', PROCESSING_TYPES.REPROCESSOR_OUTPUT]
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
        case: { $eq: ['$data.processingType', PROCESSING_TYPES.EXPORTER] },
        then: '$data.DATE_OF_EXPORT'
      },
      {
        case: {
          $eq: ['$data.processingType', PROCESSING_TYPES.REPROCESSOR_INPUT]
        },
        then: '$data.DATE_RECEIVED_FOR_REPROCESSING'
      },
      {
        case: {
          $eq: ['$data.processingType', PROCESSING_TYPES.REPROCESSOR_OUTPUT]
        },
        then: '$data.DATE_LOAD_LEFT_SITE'
      }
    ],
    default: null
  }
})

export const aggregateTonnageByMaterial = async (db) => {
  const pipeline = [
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
    {
      $match: {
        dispatchDate: { $ne: null },
        calculatedTonnage: { $gt: 0 }
      }
    },
    {
      $group: {
        _id: {
          organisationId: '$organisationId',
          registrationId: '$registrationId'
        },
        totalTonnage: { $sum: '$calculatedTonnage' }
      }
    },
    {
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
          { $project: { material: '$registrations.material' } }
        ],
        as: 'orgData'
      }
    },
    {
      $addFields: {
        material: { $arrayElemAt: ['$orgData.material', 0] }
      }
    },
    {
      $match: {
        material: { $ne: null }
      }
    },
    {
      $group: {
        _id: '$material',
        totalTonnage: { $sum: '$totalTonnage' }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]

  const results = await db
    .collection(WASTE_RECORDS_COLLECTION)
    .aggregate(pipeline)
    .toArray()

  const allMaterials = Object.values(MATERIAL)
  const materialTonnageMap = new Map(
    results.map((r) => [r._id, r.totalTonnage])
  )

  const materials = allMaterials.map((material) => ({
    material,
    totalTonnage: materialTonnageMap.get(material) || 0
  }))

  const total = materials.reduce((sum, item) => sum + item.totalTonnage, 0)

  return {
    generatedAt: new Date().toISOString(),
    materials,
    total
  }
}
