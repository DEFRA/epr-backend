import {
  WASTE_PROCESSING_TYPE,
  NATION,
  BUSINESS_TYPE,
  REGULATOR,
  PARTNER_TYPE,
  PARTNERSHIP_TYPE
} from '#domain/organisations.js'

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
