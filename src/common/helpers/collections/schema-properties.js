import { ORG_ID_START_NUMBER } from '../../enums/index.js'

export const answers = {
  bsonType: 'array',
  description: "'answers' must be an array and is required",
  items: {
    bsonType: 'object',
    required: ['shortDescription', 'title', 'type', 'value'],
    properties: {
      shortDescription: {
        bsonType: 'string',
        description: "'shortDescription' must be a string and is required"
      },
      type: {
        bsonType: 'string',
        description: "'type' must be a string and is required"
      },
      title: {
        bsonType: 'string',
        description: "'title' must be a string and is required"
      },
      value: {
        bsonType: 'string',
        description: "'value' must be a string and is required"
      }
    }
  }
}

export const createdAt = {
  bsonType: 'date',
  description: "'createdAt' must be a date and is required"
}

export const email = {
  bsonType: 'string',
  description: "'email' must be a string and is required"
}

export const orgId = {
  bsonType: 'int',
  minimum: ORG_ID_START_NUMBER,
  description: `'orgId' must be a positive integer above ${ORG_ID_START_NUMBER} and is required`
}

export const orgName = {
  bsonType: 'string',
  description: "'orgName' must be a string and is required"
}

export const rawSubmissionData = {
  bsonType: 'object',
  description: "'rawSubmissionData' must be an object and is required"
}

export const referenceNumber = {
  bsonType: 'string',
  pattern: '^[0-9a-fA-F]{24}$',
  description: "'referenceNumber' must be a string and is required"
}

export const schemaVersion = {
  bsonType: 'int',
  minimum: 1,
  description: "'schemaVersion' must be a positive integer and is required"
}

export const address = {
  bsonType: 'object',
  description: 'Registered address of the organization',
  properties: {
    line1: {
      bsonType: 'string',
      description: 'First line of address'
    },
    line2: {
      bsonType: 'string',
      description: 'Second line of address'
    },
    city: {
      bsonType: 'string',
      description: 'City'
    },
    county: {
      bsonType: 'string',
      description: 'County'
    },
    postcode: {
      bsonType: 'string',
      description: 'Postal/ZIP code'
    }
  },
  additionalProperties: true //TODO  want to allow additional unknown fields?
}

export const businessAddress = address

export const tradingName = {
  bsonType: 'string',
  description: 'Trading name of the organization'
}

export const companiesHouseNumber = {
  bsonType: 'string',
  description: 'Companies House registration number'
}

export const isOnCompaniesHouse = {
  bsonType: 'bool',
  description: 'Whether the organization is registered on Companies House'
}

export const organizationType = {
  bsonType: 'string',
  enum: ['individual', 'partnership', 'unincorporated association'],
  description: 'Type of organization'
}

export const partnershipType = {
  bsonType: 'string',
  enum: ['limited', 'liability', 'general'],
  description: 'Type of partnership'
}

export const partners = {
  bsonType: 'array',
  description: 'Array of partners (for partnerships)',
  items: {
    bsonType: 'object',
    properties: {
      name: {
        bsonType: 'string',
        description: 'Partner name'
      },
      type: {
        bsonType: 'string',
        enum: ['company', 'individual', 'corporate'],
        description: 'Partner type'
      }
    },
    required: ['name', 'type'],
    additionalProperties: false //TODO  want to allow additional unknown fields?
  }
}

export const originalSubmitter = {
  bsonType: 'object',
  description: 'Original submitter contact information',
  properties: {
    name: {
      bsonType: 'string',
      description: 'Submitter full name'
    },
    email: {
      bsonType: 'string',
      description: 'Submitter email address'
    },
    phone: {
      bsonType: 'string',
      description: 'Submitter phone number'
    },
    jobTitle: {
      bsonType: 'string',
      description: 'Submitter job title'
    }
  },
  additionalProperties: false //TODO  want to allow additional unknown fields?
}

export const reprocessingType = {
  bsonType: 'string',
  enum: ['reprocessor', 'exporter', 'both', 'none'],
  description: "'operationType' must be one of the allowed operation types"
}

export const reprocessingNations = {
  bsonType: 'array',
  items: {
    bsonType: 'string',
    enum: ['England', 'Scotland', 'Wales', 'Northern Ireland']
  },
  uniqueItems: true,
  description:
    'List of UK nations where organization have a reprocessing site based in'
}

export const registrationStatus = {
  bsonType: 'string',
  enum: ['pending', 'registered', 'rejected'],
  description:
    "'status' must be one of the allowed registration status values and is required"
}

export const wasteCarrierNumber = {
  bsonType: 'string',
  // TODO better to validate before insertion instead of failing at tail end
  pattern: '^[cC][bB][dD][uU][0-9]{4,6}$',
  description:
    "'wasteCarrierNumber' must be CBDU followed by 4-6 digits and is required"
}

export const permitType = {
  bsonType: 'string',
  enum: ['wml', 'installation_or_ppc', 'exemption', 'none'],
  description:
    "'permitType' must be one of the allowed permit types and is required"
}

export const permitNumber = {
  bsonType: ['string'],
  description: "'permitNumber' must be a string or null"
}

export const wasteCategory = {
  bsonType: 'string',
  enum: [
    'Aluminium',
    'Fibre-based composite material',
    'Glass',
    'Paper or board',
    'Plastic',
    'Steel',
    'Wood'
  ],
  description:
    "'wasteCategory' must be one of the allowed packaging waste categories and is required"
}

export const wasteExemptions = {
  bsonType: 'array',
  items: {
    bsonType: 'object',
    properties: {
      reference: {
        bsonType: 'string',
        description: "'reference' must be WEX followed by 6 digits"
      },
      exemption: {
        bsonType: 'string',
        description:
          "'exemption' must be a letter (S,T,U,D) followed by 1-2 digits"
      }
    }
  },
  description: "'wasteExemptions' must be an array of exemption objects"
}

export const exportPorts = {
  bsonType: 'array',
  items: {
    bsonType: 'string'
  },
  description: "'exportPorts' must be an array of UK port names"
}

export const noticeAddress = address

export const overseasSites = {
  bsonType: ['object'],
  properties: {
    fileId: {
      bsonType: 'string',
      description: "'fileId' must be a string"
    },
    downloadLink: {
      bsonType: 'string',
      description: "'downloadLink' must be a string URL"
    }
  },
  description:
    "'overseasSites' must be a file object with overseas sites information"
}

export const accreditationStatus = {
  bsonType: 'string',
  enum: ['pending', 'accredited', 'rejected', 'expired'],
  description:
    "'status' must be one of the allowed accreditation status values and is required"
}

export const accreditationYear = {
  bsonType: 'int',
  description: 'Year for which accreditation is being applied '
}

export const glassProcess = {
  bsonType: ['string', 'null'],
  enum: ['Glass re-melt', 'Glass other', 'Both'],
  description: "'glassProcess' must be one of the allowed glass process types"
}

export const tonnageBand = {
  bsonType: 'string',
  enum: [
    'Up to 500 tonnes',
    'Up to 5,000 tonnes',
    'Up to 10,000 tonnes',
    'Over 10,000 tonnes'
  ],
  description:
    "'tonnageBand' must be one of the allowed tonnage bands and is required"
}
