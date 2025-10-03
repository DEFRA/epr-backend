import { randomUUID } from 'crypto'
import { ObjectId } from 'mongodb'

export const MATERIALS = [
  'aluminium',
  'fibre',
  'glass',
  'paper',
  'plastic',
  'steel',
  'wood'
]
export const WASTE_PROCESSING_TYPES = ['reprocessor', 'exporter']
export const NATIONS = ['england', 'wales', 'scotland', 'northern_ireland']
export const BUSINESS_TYPES = ['individual', 'unincorporated', 'partnership']
export const STATUSES = ['created', 'approved', 'archived']
export const RECYCLING_PROCESSES = ['glass_re_melt', 'glass_other']
export const PERMIT_TYPES = ['wml', 'ppc', 'waste_exemption']
export const PERMIT_WINDOWS = ['weekly', 'monthly', 'yearly']

export function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)]
}

export function randomChoices(array, count) {
  const shuffled = [...array].sort(() => 0.5 - Math.random())
  return shuffled.slice(0, Math.min(count, array.length))
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function randomDate(start = new Date('2024-01-01'), end = new Date()) {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  )
}

function getRandomLetter(letters) {
  return letters[Math.floor(Math.random() * letters.length)]
}

function randomPostcode() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

  const area = getRandomLetter(letters)
  const district = Math.floor(Math.random() * 99) + 1
  const sector = Math.floor(Math.random() * 10)
  const unit = getRandomLetter(letters) + getRandomLetter(letters)
  return `${area}${district} ${sector}${unit}`
}

export function generateAddress() {
  const streetNames = [
    'High Street',
    'Main Road',
    'Church Lane',
    'King Street',
    'Mill Road',
    'Victoria Road',
    'Queen Street',
    'Station Road'
  ]
  const towns = [
    'London',
    'Manchester',
    'Birmingham',
    'Leeds',
    'Glasgow',
    'Liverpool',
    'Newcastle',
    'Sheffield',
    'Bristol',
    'Cardiff'
  ]
  const counties = [
    'Greater London',
    'Greater Manchester',
    'West Midlands',
    'West Yorkshire',
    'Strathclyde',
    'Merseyside',
    'Tyne and Wear'
  ]

  return {
    line1: `${randomInt(1, 999)} ${randomChoice(streetNames)}`,
    line2: Math.random() > 0.7 ? `Building ${randomInt(1, 20)}` : null,
    town: randomChoice(towns),
    county: randomChoice(counties),
    country: 'UK',
    postcode: randomPostcode()
  }
}

function generateCompanyNumber() {
  const number = Math.floor(Math.random() * 999999) + 100000
  return 'SC' + number.toString()
}

export function generateCompanyDetails() {
  const companyTypes = ['Ltd', 'Limited', 'plc', 'LLP']
  const names = [
    'Acme',
    'Globex',
    'Soylent',
    'Initech',
    'Umbrella',
    'Weyland',
    'Cyberdyne',
    'OsCorp'
  ]
  const adjectives = [
    'Advanced',
    'Innovative',
    'Global',
    'Premier',
    'Elite',
    'Dynamic',
    'Superior'
  ]

  const baseName = `${randomChoice(adjectives)} ${randomChoice(names)} ${randomChoice(companyTypes)}`

  return {
    name: baseName,
    tradingName:
      Math.random() > 0.3 ? baseName : `${randomChoice(names)} Trading`,
    registrationNumber: generateCompanyNumber(),
    registeredAddress: generateAddress()
  }
}

export function generatePartnership() {
  const partnerCount = randomInt(2, 5)
  const partners = []

  for (let i = 0; i < partnerCount; i++) {
    partners.push({
      name: `Partner ${i + 1} ${randomChoice(['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'])}`,
      type: randomChoice(['company', 'individual'])
    })
  }

  return {
    type: randomChoice(['ltd', 'ltd_liability']),
    partners
  }
}

export function generateUser() {
  const firstNames = [
    'Alice',
    'Bob',
    'Charlie',
    'Diana',
    'Eve',
    'Frank',
    'Grace',
    'Henry',
    'Ivy',
    'Jack'
  ]
  const lastNames = [
    'Smith',
    'Johnson',
    'Williams',
    'Brown',
    'Jones',
    'Garcia',
    'Miller',
    'Davis',
    'Rodriguez',
    'Martinez'
  ]
  const roles = ['Director', 'Manager', 'Secretary', 'Partner', 'Owner']
  const titles = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof']

  const firstName = randomChoice(firstNames)
  const lastName = randomChoice(lastNames)

  return {
    fullName: `${firstName} ${lastName}`,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${randomChoice(['company', 'business', 'corp'])}.com`,
    phone: `+44${randomInt(1000000000, 9999999999)}`,
    role: randomChoice(roles),
    title: randomChoice(titles)
  }
}

export function generateWasteManagementPermit() {
  const permit = {
    type: randomChoice(PERMIT_TYPES),
    permitNumber: `${randomChoice(['WML', 'PPC', 'WEX'])}${randomInt(100000, 999999)}`,
    authorisedWeight: String(randomInt(1, 1000)),
    permitWindow: randomChoice(PERMIT_WINDOWS)
  }

  if (permit.type === 'waste_exemption') {
    permit.exemptions = [
      {
        reference: `WEX${randomInt(100000, 999999)}`,
        exemptionCode: `${randomChoice(['U', 'T', 'S'])}${randomInt(1, 20)}`
      }
    ]
  }

  return permit
}

export function generateYearlyMetrics() {
  return {
    year: String(randomInt(2022, 2025)),
    input: {
      type: randomChoice(['actual', 'estimated']),
      ukPackagingWaste: randomInt(100, 10000),
      nonUkPackagingWaste: randomInt(50, 5000),
      nonPackagingWaste: randomInt(10, 1000)
    },
    rawMaterialInputs: MATERIALS.slice(0, randomInt(1, 3)).map((material) => ({
      material,
      tonnage: randomInt(10, 1000)
    })),
    output: {
      type: randomChoice(['actual', 'estimated']),
      sentToAnotherSite: randomInt(50, 5000),
      contaminants: randomInt(5, 500),
      processLoss: randomInt(1, 100)
    },
    metric: 'tonnage',
    productsMadeFromRecycling: [
      {
        name: `Recycled ${randomChoice(MATERIALS)} product`,
        weight: randomInt(100, 2000)
      }
    ]
  }
}

export function generatePrnIssuance() {
  return {
    plannedIssuance: `${randomInt(100, 10000)} tonnes`,
    signatories: [generateUser()],
    prnIncomeBusinessPlan: [
      {
        percentIncomeSpent: randomInt(5, 50),
        usageDescription: 'Infrastructure investment',
        detailedExplanation:
          'Investment in new processing equipment and facility upgrades'
      }
    ]
  }
}

export function generateRegistration(orgId, material, wasteProcessingType) {
  const formSubmissionTime = randomDate()

  const registration = {
    id: generateObjectId(),
    formSubmissionTime: formSubmissionTime.toISOString(),
    status: randomChoice(STATUSES),
    material,
    wasteProcessingType,
    gridReference:
      wasteProcessingType === 'reprocessor'
        ? String(randomInt(100000, 999999))
        : null,
    wasteRegistrationNumber: `CBDU${randomInt(100000, 999999)}`,
    wasteManagementPermits: [generateWasteManagementPermit()],
    approvedPersons: [generateUser()],
    contactDetails: generateUser(),
    submitterContactDetails: generateUser(),
    samplingInspectionPlan: [`doc-${randomUUID()}`],
    formSubmissionRawDataId: randomUUID()
  }

  if (wasteProcessingType === 'reprocessor') {
    registration.siteAddress = generateAddress()
    if (material === 'glass') {
      registration.recyclingProcess = getRecyclingProcess()
    }
    registration.yearlyMetrics = generateYearlyMetrics()
    registration.plantEquipmentDetails =
      'Advanced processing equipment with automated sorting and cleaning systems'
  }

  if (wasteProcessingType === 'exporter') {
    registration.suppliers =
      'Local councils, commercial waste collectors, material recovery facilities'
    registration.exportPorts = randomChoices(
      ['Southampton', 'Dover', 'Liverpool', 'Hull', 'Felixstowe'],
      randomInt(1, 3)
    )
    registration.overseasSites = [`doc-${randomUUID()}`]
  }

  registration.noticeAddress = generateAddress()

  return registration
}

function getRecyclingProcess() {
  return randomChoices(RECYCLING_PROCESSES, randomInt(1, 2))
}

export function generateAccreditation(orgId, material, wasteProcessingType) {
  const formSubmissionTime = randomDate()
  const accreditation = {
    id: generateObjectId(),
    formSubmissionTime: formSubmissionTime.toISOString(),
    status: randomChoice(STATUSES),
    material,
    wasteProcessingType,
    prnIssuance: generatePrnIssuance(),
    businessPlan: [
      {
        description: 'Infrastructure development and maintenance',
        detailedDescription:
          'Investment in new processing technology and facility improvements',
        percentSpent: randomInt(10, 40)
      }
    ],
    contactDetails: generateUser(),
    submitterContactDetails: generateUser(),
    samplingInspectionPlan: [`doc-${randomUUID()}`],
    formSubmissionRawDataId: randomUUID()
  }

  if (wasteProcessingType === 'reprocessor') {
    accreditation.siteAddress = generateAddress()
    if (material === 'glass') {
      accreditation.recyclingProcess = getRecyclingProcess()
    }
  }

  if (wasteProcessingType === 'exporter') {
    accreditation.overseasSites = [`doc-${randomUUID()}`]
  }

  return accreditation
}

function generateObjectId() {
  return new ObjectId()
}

export function generateOrganisation(orgId, registrationAccreditationCount) {
  const businessType = randomChoice(BUSINESS_TYPES)
  const wasteProcessingTypes = randomChoices(
    WASTE_PROCESSING_TYPES,
    randomInt(1, 2)
  )
  randomChoice(NATIONS)
  const registrationAccreditationPairs = Array.from(
    { length: registrationAccreditationCount },
    () => {
      const material = randomChoice(MATERIALS)
      const wasteProcessingType = randomChoice(wasteProcessingTypes)
      const accreditation = generateAccreditation(
        orgId,
        material,
        wasteProcessingType
      )
      const registration = {
        ...generateRegistration(orgId, material, wasteProcessingType),
        accreditationId: accreditation.id
      }
      return { registration, accreditation }
    }
  )

  const registrations = registrationAccreditationPairs.map(
    (pair) => pair.registration
  )
  const accreditations = registrationAccreditationPairs.map(
    (pair) => pair.accreditation
  )

  return {
    _id: generateObjectId(),
    orgId,
    systemReference: generateObjectId(),
    schemaVersion: 1,
    version: 1,
    wasteProcessingTypes,
    reprocessingNations: randomChoices(NATIONS, randomInt(1, 2)),
    businessType,
    registrations,
    accreditations,
    contactDetails: generateUser(),
    formSubmissionRawDataId: randomUUID(),
    createdAt: randomDate(),
    partnership: generatePartnership()
  }
}
