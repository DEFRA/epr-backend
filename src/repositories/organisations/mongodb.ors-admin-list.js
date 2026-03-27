const COLLECTION_NAME = 'epr-organisations'
const OVERSEAS_SITES_COLLECTION_NAME = 'overseas-sites'

const ORS_ADMIN_LIST_PROJECTION = {
  orgId: 1,
  'registrations.material': 1,
  'registrations.registrationNumber': 1,
  'registrations.accreditationId': 1,
  'registrations.accreditationNumber': 1,
  'registrations.accreditation.accreditationNumber': 1,
  'registrations.overseasSites': 1,
  'accreditations.id': 1,
  'accreditations.accreditationNumber': 1
}

const escapeRegex = (string) =>
  string.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)

const buildOrsAdminListBasePipeline = ({ registrationNumber }) => [
  {
    $project: {
      orgId: 1,
      registrations: 1,
      accreditations: 1
    }
  },
  { $unwind: '$registrations' },
  {
    $project: {
      orgId: 1,
      registration: '$registrations',
      accreditations: 1,
      overseasSiteMappings: {
        $objectToArray: {
          $ifNull: ['$registrations.overseasSites', {}]
        }
      }
    }
  },
  ...(registrationNumber
    ? [
        {
          $match: {
            'registration.registrationNumber': {
              $regex: escapeRegex(registrationNumber),
              $options: 'i'
            }
          }
        }
      ]
    : []),
  { $unwind: '$overseasSiteMappings' },
  {
    $project: {
      orgId: 1,
      registration: 1,
      accreditations: 1,
      orsId: '$overseasSiteMappings.k',
      overseasSiteId: '$overseasSiteMappings.v.overseasSiteId'
    }
  },
  {
    $lookup: {
      from: OVERSEAS_SITES_COLLECTION_NAME,
      let: { overseasSiteId: '$overseasSiteId' },
      pipeline: [
        {
          $match: {
            $expr: {
              $eq: [{ $toString: '$_id' }, '$$overseasSiteId']
            }
          }
        }
      ],
      as: 'site'
    }
  },
  { $unwind: '$site' },
  { $sort: { orsId: 1 } }
]

const ORS_ADMIN_LIST_ROW_PROJECTION = {
  $project: {
    _id: 0,
    orgId: { $ifNull: ['$orgId', null] },
    registrationNumber: { $ifNull: ['$registration.registrationNumber', null] },
    accreditationNumber: {
      $let: {
        vars: {
          matchedAccreditation: {
            $arrayElemAt: [
              {
                $filter: {
                  input: '$accreditations',
                  as: 'accreditation',
                  cond: {
                    $eq: ['$$accreditation.id', '$registration.accreditationId']
                  }
                }
              },
              0
            ]
          }
        },
        in: {
          $ifNull: [
            '$registration.accreditation.accreditationNumber',
            {
              $ifNull: [
                '$registration.accreditationNumber',
                {
                  $ifNull: ['$$matchedAccreditation.accreditationNumber', null]
                }
              ]
            }
          ]
        }
      }
    },
    orsId: '$orsId',
    packagingWasteCategory: { $ifNull: ['$registration.material', null] },
    destinationCountry: '$site.country',
    overseasReprocessorName: '$site.name',
    addressLine1: '$site.address.line1',
    addressLine2: { $ifNull: ['$site.address.line2', null] },
    cityOrTown: '$site.address.townOrCity',
    stateProvinceOrRegion: { $ifNull: ['$site.address.stateOrRegion', null] },
    postcode: { $ifNull: ['$site.address.postcode', null] },
    coordinates: { $ifNull: ['$site.coordinates', null] },
    validFrom: { $ifNull: ['$site.validFrom', null] }
  }
}

export const performFindAllForOverseasSitesAdminList = (db) => async () => {
  const docs = await db
    .collection(COLLECTION_NAME)
    .find({}, { projection: ORS_ADMIN_LIST_PROJECTION })
    .toArray()

  return docs.map(({ orgId, registrations, accreditations }) => ({
    orgId,
    registrations,
    accreditations
  }))
}

export const performFindPageForOrsAdminList =
  (db) =>
  async ({ page, pageSize, registrationNumber }) => {
    const skip = (page - 1) * pageSize

    const [result] = await db
      .collection(COLLECTION_NAME)
      .aggregate([
        ...buildOrsAdminListBasePipeline({ registrationNumber }),
        {
          $facet: {
            rows: [
              { $skip: skip },
              { $limit: pageSize },
              ORS_ADMIN_LIST_ROW_PROJECTION
            ],
            totalCount: [{ $count: 'totalItems' }]
          }
        }
      ])
      .toArray()

    return {
      rows: result.rows,
      totalItems: result.totalCount[0]?.totalItems ?? 0
    }
  }
