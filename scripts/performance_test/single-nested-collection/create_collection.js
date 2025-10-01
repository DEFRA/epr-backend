import { MongoClient } from 'mongodb'

export async function createOrganisationCollection(
  uri,
  dbName,
  collectionName
) {
  const client = new MongoClient(uri)

  try {
    await client.connect()
    const db = client.db(dbName)

    // Drop collection if exists
    try {
      await db.collection(collectionName).drop()
      console.log('Dropped existing collection')
    } catch (error) {
      console.log('Collection does not exist, creating new')
    }

    await db.createCollection(collectionName, {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['_id', 'orgId', 'schemaVersion', 'version'],
          properties: {
            orgId: {
              bsonType: 'int',
              description: 'Unique identifier for organisation'
            },
            schemaVersion: {
              bsonType: 'int',
              minimum: 1,
              description: 'Schema version number'
            },
            version: {
              bsonType: 'int',
              minimum: 1,
              description: 'Document version for optimistic locking'
            },
            wasteProcessingTypes: {
              bsonType: 'array',
              items: {
                bsonType: 'string',
                enum: ['reprocessor', 'exporter']
              },
              minItems: 1,
              uniqueItems: true
            },
            reprocessingNations: {
              bsonType: 'array',
              items: {
                bsonType: 'string',
                enum: ['england', 'wales', 'scotland', 'northern_ireland']
              },
              minItems: 1,
              uniqueItems: true
            },
            businessType: {
              bsonType: 'string',
              enum: ['individual', 'unincorporated', 'partnership']
            },
            companyDetails: {
              bsonType: 'object',
              properties: {
                name: { bsonType: 'string', minLength: 1 },
                tradingName: { bsonType: 'string' },
                registrationNumber: { bsonType: 'string' },
                registeredAddress: {
                  bsonType: 'object',
                  required: ['line1', 'town', 'postcode'],
                  properties: {
                    line1: { bsonType: 'string', minLength: 1 },
                    line2: { bsonType: ['string', 'null'] },
                    town: { bsonType: 'string', minLength: 1 },
                    county: { bsonType: 'string' },
                    country: { bsonType: 'string' },
                    postcode: { bsonType: 'string', minLength: 1 },
                    region: { bsonType: 'string' }
                  }
                }
              }
            },
            partnership: {
              bsonType: 'object',
              properties: {
                type: {
                  bsonType: 'string',
                  enum: ['ltd', 'ltd_liability']
                },
                partners: {
                  bsonType: 'array',
                  items: {
                    bsonType: 'object',
                    required: ['name', 'type'],
                    properties: {
                      name: { bsonType: 'string', minLength: 1 },
                      type: {
                        bsonType: 'string',
                        enum: ['company', 'individual']
                      }
                    }
                  }
                }
              }
            },
            contactDetails: {
              bsonType: 'object',
              properties: {
                fullName: { bsonType: 'string' },
                email: { bsonType: 'string' },
                phone: { bsonType: 'string' },
                role: { bsonType: 'string' },
                title: { bsonType: 'string' }
              }
            },
            registrations: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                required: ['id', 'status', 'material', 'wasteProcessingType'],
                properties: {
                  id: { bsonType: 'objectId' },
                  formSubmissionTime: { bsonType: 'string' },
                  status: {
                    bsonType: 'string',
                    enum: ['created', 'approved', 'archived']
                  },
                  material: {
                    bsonType: 'string',
                    enum: [
                      'aluminium',
                      'fibre',
                      'glass',
                      'paper',
                      'plastic',
                      'steel',
                      'wood'
                    ]
                  },
                  wasteProcessingType: {
                    bsonType: 'string',
                    enum: ['reprocessor', 'exporter']
                  },
                  accreditationId: { bsonType: 'objectId' },
                  gridReference: { bsonType: ['string', 'null'] },
                  wasteRegistrationNumber: { bsonType: 'string' },
                  suppliers: { bsonType: 'string' },
                  plantEquipmentDetails: { bsonType: 'string' },
                  formSubmissionRawDataId: { bsonType: 'string' },
                  siteAddress: {
                    bsonType: 'object',
                    properties: {
                      line1: { bsonType: 'string' },
                      line2: { bsonType: ['string', 'null'] },
                      town: { bsonType: 'string' },
                      county: { bsonType: 'string' },
                      country: { bsonType: 'string' },
                      postcode: { bsonType: 'string' }
                    }
                  },
                  noticeAddress: {
                    bsonType: 'object',
                    properties: {
                      line1: { bsonType: 'string' },
                      line2: { bsonType: ['string', 'null'] },
                      town: { bsonType: 'string' },
                      postcode: { bsonType: 'string' }
                    }
                  },
                  recyclingProcess: {
                    bsonType: 'array',
                    items: {
                      bsonType: 'string',
                      enum: ['glass_re_melt', 'glass_other']
                    }
                  },
                  exportPorts: {
                    bsonType: 'array',
                    items: { bsonType: 'string' }
                  },
                  wasteManagementPermits: {
                    bsonType: 'array',
                    items: {
                      bsonType: 'object',
                      properties: {
                        type: {
                          bsonType: 'string',
                          enum: ['wml', 'ppc', 'waste_exemption']
                        },
                        permitNumber: { bsonType: 'string' },
                        authorisedWeight: { bsonType: 'string' },
                        permitWindow: {
                          bsonType: 'string',
                          enum: ['weekly', 'monthly', 'yearly']
                        },
                        exemptions: {
                          bsonType: 'array',
                          items: {
                            bsonType: 'object',
                            properties: {
                              reference: { bsonType: 'string' },
                              exemptionCode: { bsonType: 'string' }
                            }
                          }
                        }
                      }
                    }
                  },
                  approvedPersons: {
                    bsonType: 'array',
                    items: {
                      bsonType: 'object',
                      properties: {
                        fullName: { bsonType: 'string' },
                        email: { bsonType: 'string' },
                        phone: { bsonType: 'string' },
                        title: { bsonType: 'string' },
                        role: { bsonType: 'string' }
                      }
                    }
                  },
                  yearlyMetrics: {
                    bsonType: 'object',
                    properties: {
                      year: { bsonType: 'string' },
                      metric: { bsonType: 'string' },
                      input: {
                        bsonType: 'object',
                        properties: {
                          type: {
                            bsonType: 'string',
                            enum: ['actual', 'estimated']
                          },
                          ukPackagingWaste: { bsonType: 'int' },
                          nonUkPackagingWaste: { bsonType: 'int' },
                          nonPackagingWaste: { bsonType: 'int' }
                        }
                      },
                      output: {
                        bsonType: 'object',
                        properties: {
                          type: {
                            bsonType: 'string',
                            enum: ['actual', 'estimated']
                          },
                          sentToAnotherSite: { bsonType: 'int' },
                          contaminants: { bsonType: 'int' },
                          processLoss: { bsonType: 'int' }
                        }
                      }
                    }
                  },
                  contactDetails: { bsonType: 'object' },
                  submitterContactDetails: { bsonType: 'object' },
                  samplingInspectionPlan: {
                    bsonType: 'array',
                    items: { bsonType: 'string' }
                  },
                  overseasSites: {
                    bsonType: 'array',
                    items: { bsonType: 'string' }
                  }
                }
              }
            },
            accreditations: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                required: ['id', 'status', 'material', 'wasteProcessingType'],
                properties: {
                  id: { bsonType: 'objectId' },
                  formSubmissionTime: { bsonType: 'string' },
                  status: {
                    bsonType: 'string',
                    enum: ['created', 'approved', 'archived']
                  },
                  material: {
                    bsonType: 'string',
                    enum: [
                      'aluminium',
                      'fibre',
                      'glass',
                      'paper',
                      'plastic',
                      'steel',
                      'wood'
                    ]
                  },
                  wasteProcessingType: {
                    bsonType: 'string',
                    enum: ['reprocessor', 'exporter']
                  },
                  formSubmissionRawDataId: { bsonType: 'string' },
                  siteAddress: { bsonType: 'object' },
                  recyclingProcess: {
                    bsonType: 'array',
                    items: {
                      bsonType: 'string',
                      enum: ['glass_re_melt', 'glass_other']
                    }
                  },
                  prnIssuance: {
                    bsonType: 'object',
                    properties: {
                      plannedIssuance: { bsonType: 'string' },
                      signatories: { bsonType: 'array' },
                      prnIncomeBusinessPlan: {
                        bsonType: 'array',
                        items: {
                          bsonType: 'object',
                          properties: {
                            description: { bsonType: 'string' },
                            detailedDescription: { bsonType: 'string' },
                            percentSpent: { bsonType: 'int' },
                            percentIncomeSpent: { bsonType: 'int' },
                            usageDescription: { bsonType: 'string' },
                            detailedExplanation: { bsonType: 'string' }
                          }
                        }
                      }
                    }
                  },
                  businessPlan: {
                    bsonType: 'array',
                    items: {
                      bsonType: 'object',
                      properties: {
                        description: { bsonType: 'string' },
                        detailedDescription: { bsonType: 'string' },
                        percentSpent: { bsonType: 'int' }
                      }
                    }
                  },
                  contactDetails: { bsonType: 'object' },
                  submitterContactDetails: { bsonType: 'object' },
                  samplingInspectionPlan: {
                    bsonType: 'array',
                    items: { bsonType: 'string' }
                  },
                  overseasSites: {
                    bsonType: 'array',
                    items: { bsonType: 'string' }
                  }
                }
              }
            },
            formSubmissionRawDataId: { bsonType: 'string' }
          }
        }
      },
      validationLevel: 'strict',
      validationAction: 'error'
    })

    console.log('Collection created with strict validation')

    const collection = db.collection(collectionName)

    await Promise.all([
      collection.createIndex({ orgId: 1 }),
      collection.createIndex({ 'registrations.id': 1 }),
      collection.createIndex({ 'accreditations.id': 1 }),
      collection.createIndex({
        'registrations.material': 1,
        'registrations.wasteProcessingType': 1
      }),
      collection.createIndex({ 'registrations.status': 1 }),
      collection.createIndex({ 'accreditations.status': 1 }),
      collection.createIndex({
        'registrations.siteAddress.line1': 1,
        'registrations.siteAddress.postcode': 1,
        'registrations.material': 1,
        'registrations.wasteProcessingType': 1
      }),
      collection.createIndex({ 'registrations.approvedPersons.email': 1 })
    ])

    console.log('All indexes created successfully')
  } finally {
    await client.close()
  }
}
