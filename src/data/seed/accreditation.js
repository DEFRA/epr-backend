import deepmerge from 'deepmerge'
import { addressFactory } from './address.js'
import {
  ACTIVITY,
  MATERIAL,
  REGION,
  SCHEMA_VERSION,
  TONNAGE_BAND
} from '../../common/enums/index.js'

const accreditation = {
  schemaVersion: SCHEMA_VERSION,
  region: REGION.ENGLAND,
  site: addressFactory(),
  activity: ACTIVITY.REPROCESSOR,
  material: MATERIAL.ALUMINIUM,
  tonnageBand: TONNAGE_BAND.LTE500,
  rawSubmissionData: {}
}

export function accreditationFactory(
  orgId,
  referenceNumber,
  partialAccreditation = {}
) {
  return deepmerge(accreditation, {
    ...partialAccreditation,
    orgId,
    referenceNumber
  })
}
