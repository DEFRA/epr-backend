import deepmerge from 'deepmerge'
import { addressFactory } from './address.js'
import {
  ACTIVITY,
  MATERIAL,
  REGION,
  SCHEMA_VERSION
} from '../../common/enums/index.js'

const registration = {
  schemaVersion: SCHEMA_VERSION,
  region: REGION.ENGLAND,
  site: addressFactory(),
  activity: ACTIVITY.REPROCESSOR,
  material: MATERIAL.ALUMINIUM,
  rawSubmissionData: {}
}

export function registrationFactory(
  orgId,
  referenceNumber,
  partialRegistration = {}
) {
  return deepmerge(registration, {
    ...partialRegistration,
    orgId,
    referenceNumber
  })
}
