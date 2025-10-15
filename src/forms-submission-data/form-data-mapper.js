import { WASTE_PROCESSING_TYPES, NATION } from '#domain/organisation.js'

const wasteProcessingTypesMapping = {
  'Reprocessor and exporter': [
    WASTE_PROCESSING_TYPES.REPROCESSOR,
    WASTE_PROCESSING_TYPES.EXPORTER
  ],
  Reprocessor: [WASTE_PROCESSING_TYPES.REPROCESSOR],
  Exporter: [WASTE_PROCESSING_TYPES.EXPORTER]
}

const nationMapping = {
  England: NATION.ENGLAND,
  Scotland: NATION.SCOTLAND,
  Wales: NATION.WALES,
  'Northern Ireland': NATION.NORTHERN_IRELAND
}

export function mapWasteProcessingType(value) {
  const trimmedValue = value?.trim()
  const result = wasteProcessingTypesMapping[trimmedValue]

  if (!result) {
    throw new Error(
      `Invalid waste processing type: "${value}". Expected "Reprocessor", "Exporter", or "Reprocessor and exporter"`
    )
  }

  return result
}

export function mapNation(value) {
  const trimmedValue = value?.trim()
  const result = nationMapping[trimmedValue]

  if (!result) {
    throw new Error(
      `Invalid nation: "${value}". Expected "England", "Scotland", "Wales", or "Northern Ireland"`
    )
  }

  return result
}
