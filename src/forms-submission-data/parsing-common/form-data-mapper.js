import {
  BUSINESS_TYPE,
  GLASS_RECYCLING_PROCESS,
  MATERIAL,
  NATION,
  PARTNER_TYPE,
  PARTNERSHIP_TYPE,
  REGULATOR,
  TIME_SCALE,
  VALUE_TYPE,
  WASTE_PERMIT_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { ObjectId } from 'mongodb'

const WASTE_PROCESSING_TYPES_MAPPING = {
  'Reprocessor and exporter': [
    WASTE_PROCESSING_TYPE.REPROCESSOR,
    WASTE_PROCESSING_TYPE.EXPORTER
  ],
  Reprocessor: [WASTE_PROCESSING_TYPE.REPROCESSOR],
  Exporter: [WASTE_PROCESSING_TYPE.EXPORTER]
}

const NATION_MAPPING = {
  England: NATION.ENGLAND,
  Scotland: NATION.SCOTLAND,
  Wales: NATION.WALES,
  'Northern Ireland': NATION.NORTHERN_IRELAND
}

const BUSINESS_TYPE_MAPPING = {
  'An individual': BUSINESS_TYPE.INDIVIDUAL,
  'Unincorporated association': BUSINESS_TYPE.UNINCORPORATED,
  'A partnership under the Partnership Act 1890': BUSINESS_TYPE.PARTNERSHIP
}

const REGULATOR_MAPPING = {
  EA: REGULATOR.EA,
  NRW: REGULATOR.NRW,
  SEPA: REGULATOR.SEPA,
  NIEA: REGULATOR.NIEA
}

const PARTNER_TYPE_MAPPING = {
  'Corporate partner': PARTNER_TYPE.CORPORATE,
  'Company partner': PARTNER_TYPE.COMPANY,
  'Individual partner': PARTNER_TYPE.INDIVIDUAL
}

const PARTNERSHIP_TYPE_MAPPING = {
  'A limited partnership': PARTNERSHIP_TYPE.LTD,
  'A limited liability partnership': PARTNERSHIP_TYPE.LTD_LIABILITY
}

export function mapWasteProcessingType(value) {
  const trimmedValue = value?.trim()
  const result = WASTE_PROCESSING_TYPES_MAPPING[trimmedValue]

  if (!result) {
    throw new Error(
      `Invalid waste processing type: "${value}". Expected "Reprocessor", "Exporter", or "Reprocessor and exporter"`
    )
  }

  return result
}

export function mapNation(value) {
  const trimmedValue = value?.trim()
  const result = NATION_MAPPING[trimmedValue]

  if (!result) {
    throw new Error(
      `Invalid nation: "${value}". Expected "England", "Scotland", "Wales", or "Northern Ireland"`
    )
  }

  return result
}

export function mapBusinessType(value) {
  const trimmedValue = value?.trim()

  if (!trimmedValue) {
    return undefined
  }

  const result = BUSINESS_TYPE_MAPPING[trimmedValue]

  if (!result) {
    throw new Error(
      `Invalid business type: "${value}". Expected "An individual", "Unincorporated association", or "A partnership under the Partnership Act 1890"`
    )
  }

  return result
}

export function mapRegulator(value) {
  const trimmedValue = value?.trim()

  if (!trimmedValue) {
    return undefined
  }

  const result = REGULATOR_MAPPING[trimmedValue]

  if (!result) {
    throw new Error(
      `Invalid regulator: "${value}". Expected "EA", "NRW", "SEPA", or "NIEA"`
    )
  }

  return result
}

export function mapPartnerType(value) {
  const trimmedValue = value?.trim()

  if (!trimmedValue) {
    return undefined
  }

  const result = PARTNER_TYPE_MAPPING[trimmedValue]

  if (!result) {
    throw new Error(
      `Invalid partner type: "${value}". Expected "Corporate partner", "Company partner", or "Individual partner"`
    )
  }

  return result
}

export function mapPartnershipType(value) {
  const trimmedValue = value?.trim()

  if (!trimmedValue || trimmedValue.toLowerCase() === 'no') {
    return undefined
  }

  const result = PARTNERSHIP_TYPE_MAPPING[trimmedValue]

  if (!result) {
    throw new Error(
      `Invalid partnership type: "${value}". Expected "A limited partnership", "A limited liability partnership"`
    )
  }

  return result
}

const MATERIAL_MAPPING = {
  'Glass (R5)': MATERIAL.GLASS,
  'Paper or board (R3)': MATERIAL.PAPER,
  'Plastic (R3)': MATERIAL.PLASTIC,
  'Steel (R4)': MATERIAL.STEEL,
  'Wood (R3)': MATERIAL.WOOD,
  'Fibre-based composite material (R3)': MATERIAL.FIBRE,
  'Aluminium (R4)': MATERIAL.ALUMINIUM
}

const GLASS_RECYCLING_PROCESS_MAPPING = {
  'Glass re-melt': [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT],
  'Glass other': [GLASS_RECYCLING_PROCESS.GLASS_OTHER]
}

const TIME_SCALE_MAPPING = {
  Yearly: TIME_SCALE.YEARLY,
  Monthly: TIME_SCALE.MONTHLY,
  Weekly: TIME_SCALE.WEEKLY
}

export function mapMaterial(value) {
  const trimmedValue = value?.trim()

  if (!trimmedValue) {
    return undefined
  }

  const result = MATERIAL_MAPPING[trimmedValue]

  if (!result) {
    throw new Error(`Invalid material: "${value}"`)
  }

  return result
}

export function mapGlassRecyclingProcess(value) {
  const trimmedValue = value?.trim()

  if (!trimmedValue) {
    return undefined
  }

  const result = GLASS_RECYCLING_PROCESS_MAPPING[trimmedValue]

  if (!result) {
    throw new Error(`Invalid recycling process: "${value}"`)
  }

  return result
}

export function mapTimeScale(value) {
  const trimmedValue = value?.trim()

  if (!trimmedValue) {
    return undefined
  }

  const result = TIME_SCALE_MAPPING[trimmedValue]

  if (!result) {
    throw new Error(
      `Invalid time scale: "${value}". Expected "Yearly", "Monthly", or "Weekly"`
    )
  }

  return result
}

const VALUE_TYPE_MAPPING = {
  'Actual figures': VALUE_TYPE.ACTUAL,
  'Estimated figures': VALUE_TYPE.ESTIMATED
}

const WASTE_PERMIT_TYPE_MAPPING = {
  'Waste management licence or environmental permit':
    WASTE_PERMIT_TYPE.ENVIRONMENTAL_PERMIT,
  'Installation permit or Pollution Prevention and Control (PPC) permit':
    WASTE_PERMIT_TYPE.INSTALLATION_PERMIT,
  'Waste exemption': WASTE_PERMIT_TYPE.WASTE_EXEMPTION
}

const TONNAGE_BAND_MAPPER = {
  'Up to 500 tonnes': 'up_to_500',
  'Up to 5,000 tonnes': 'up_to_5000',
  'Up to 5000 tonnes': 'up_to_5000',
  'Up to 10,000 tonnes': 'up_to_10000',
  'Up to 10000 tonnes': 'up_to_10000',
  'Over 10,000 tonnes': 'over_10000'
}

export function mapValueType(value) {
  const trimmedValue = value?.trim()

  if (!trimmedValue) {
    return undefined
  }

  const result = VALUE_TYPE_MAPPING[trimmedValue]

  if (!result) {
    throw new Error(
      `Invalid value type: "${value}". Expected "Actual figures" or "Estimated figures"`
    )
  }

  return result
}

export function mapWastePermitType(value) {
  const trimmedValue = value?.trim()

  if (!trimmedValue) {
    return undefined
  }

  const result = WASTE_PERMIT_TYPE_MAPPING[trimmedValue]

  if (!result) {
    throw new Error(
      `Invalid waste permit type: "${value}". Expected "Waste management licence or environmental permit", "Installation permit or Pollution Prevention and Control (PPC) permit", or "Waste exemption"`
    )
  }

  return result
}

export function convertToNumber(value, fieldName = 'value') {
  if (value == null) {
    return undefined
  }

  const num = Number(value)

  if (Number.isNaN(num)) {
    throw new TypeError(
      `Invalid ${fieldName}: "${value}". Expected a valid number`
    )
  }

  return num
}

export function mapTonnageBand(value) {
  const trimmedValue = value?.trim()

  if (!trimmedValue) {
    throw new Error('Tonnage band value is required')
  }

  const result = TONNAGE_BAND_MAPPER[trimmedValue]

  if (!result) {
    throw new Error(
      `Invalid tonnage band: "${value}". Expected one of: ${Object.keys(TONNAGE_BAND_MAPPER).join(', ')}`
    )
  }

  return result
}

export function normalizeObjectId(value) {
  if (!value) {
    return value
  }

  return new ObjectId(value).toString()
}
