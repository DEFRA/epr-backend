import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { COMMON_FIELD } from '#domain/summary-logs/constants.js'
import { EXPORTER_FIELD, REPROCESSOR_INPUT_FIELD } from './constants.js'

const EXPORTER_MAPPING = {
  [COMMON_FIELD.DISPATCH_DATE]: EXPORTER_FIELD.DATE_OF_EXPORT,
  [COMMON_FIELD.PRN_ISSUED]: EXPORTER_FIELD.PRN_ISSUED,
  [COMMON_FIELD.INTERIM_SITE]: EXPORTER_FIELD.INTERIM_SITE,
  [COMMON_FIELD.INTERIM_TONNAGE]: EXPORTER_FIELD.INTERIM_TONNAGE,
  [COMMON_FIELD.EXPORT_TONNAGE]: EXPORTER_FIELD.EXPORT_TONNAGE
}

const REPROCESSOR_INPUT_MAPPING = {
  [COMMON_FIELD.DISPATCH_DATE]: REPROCESSOR_INPUT_FIELD.DATE_RECEIVED,
  [COMMON_FIELD.PRN_ISSUED]: REPROCESSOR_INPUT_FIELD.PRN_ISSUED,
  [COMMON_FIELD.RECEIVED_TONNAGE]: REPROCESSOR_INPUT_FIELD.RECEIVED_TONNAGE,
  [COMMON_FIELD.SENT_ON_TONNAGE]: REPROCESSOR_INPUT_FIELD.SENT_ON_TONNAGE
}

const TEMPLATE_MAPPINGS = {
  [PROCESSING_TYPES.EXPORTER]: EXPORTER_MAPPING,
  [PROCESSING_TYPES.REPROCESSOR_INPUT]: REPROCESSOR_INPUT_MAPPING
}

export const getFieldValue = (record, commonField) => {
  const processingType = record.data?.processingType
  if (!processingType) {
    throw new Error('Waste record missing processingType')
  }

  const mapping = TEMPLATE_MAPPINGS[processingType]
  if (!mapping) {
    throw new Error(
      `No field mapping found for processingType: ${processingType}`
    )
  }
  const sourceField = mapping[commonField]
  if (!sourceField) {
    throw new Error(
      `No mapping found for field: ${commonField} in processingType: ${processingType}`
    )
  }
  return record.data[sourceField]
}
