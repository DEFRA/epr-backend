import { WASTE_RECORD_TEMPLATE } from '#domain/waste-records/model.js'
import { EXPORTER_FIELD } from './constants.js'

export const COMMON_FIELD = Object.freeze({
  DISPATCH_DATE: 'dispatchDate',
  PRN_ISSUED: 'prnIssued',
  INTERIM_SITE: 'interimSite',
  INTERIM_TONNAGE: 'interimTonnage',
  EXPORT_TONNAGE: 'exportTonnage'
})

const EXPORTER_MAPPING = {
  [COMMON_FIELD.DISPATCH_DATE]: EXPORTER_FIELD.DATE_OF_DISPATCH,
  [COMMON_FIELD.PRN_ISSUED]: EXPORTER_FIELD.PRN_ISSUED,
  [COMMON_FIELD.INTERIM_SITE]: EXPORTER_FIELD.INTERIM_SITE,
  [COMMON_FIELD.INTERIM_TONNAGE]: EXPORTER_FIELD.INTERIM_TONNAGE,
  [COMMON_FIELD.EXPORT_TONNAGE]: EXPORTER_FIELD.EXPORT_TONNAGE
}

const TEMPLATE_MAPPINGS = {
  [WASTE_RECORD_TEMPLATE.EXPORTER]: EXPORTER_MAPPING
}

export const getFieldValue = (record, commonField) => {
  const mapping = TEMPLATE_MAPPINGS[record.template]
  if (!mapping) {
    throw new Error(`No field mapping found for template: ${record.template}`)
  }
  const sourceField = mapping[commonField]
  if (!sourceField) {
    throw new Error(
      `No mapping found for field: ${commonField} in template: ${record.template}`
    )
  }
  return record.data[sourceField]
}
