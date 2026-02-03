import {
  asStandardUser,
  buildGetUrl,
  buildPostUrl,
  buildSubmitUrl,
  createUploadPayload,
  pollForValidation,
  pollWhileStatus
} from './integration-test-helpers.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS,
  transitionStatus
} from '#domain/summary-logs/status.js'

export const createWasteBalanceMeta = (processingType) => ({
  REGISTRATION_NUMBER: {
    value: 'REG-12345',
    location: { sheet: 'Data', row: 1, column: 'B' }
  },
  PROCESSING_TYPE: {
    value: processingType,
    location: { sheet: 'Data', row: 2, column: 'B' }
  },
  MATERIAL: {
    value: 'Paper_and_board',
    location: { sheet: 'Data', row: 3, column: 'B' }
  },
  TEMPLATE_VERSION: {
    value: 5,
    location: { sheet: 'Data', row: 4, column: 'B' }
  },
  ACCREDITATION_NUMBER: {
    value: 'ACC-2025-001',
    location: { sheet: 'Data', row: 5, column: 'B' }
  }
})

export const createSummaryLogSubmitterWorker = ({
  validate,
  summaryLogsRepository,
  syncWasteRecords
}) => ({
  validate,
  submit: async (summaryLogId) => {
    await new Promise((resolve) => setImmediate(resolve))

    const existing = await summaryLogsRepository.findById(summaryLogId)
    const { version, summaryLog } = existing

    await syncWasteRecords(summaryLog)

    await summaryLogsRepository.update(
      summaryLogId,
      version,
      transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMITTED)
    )
  }
})

export const EXPORTER_HEADERS = [
  'ROW_ID',
  'DATE_RECEIVED_FOR_EXPORT',
  'EWC_CODE',
  'DESCRIPTION_WASTE',
  'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE',
  'GROSS_WEIGHT',
  'TARE_WEIGHT',
  'PALLET_WEIGHT',
  'NET_WEIGHT',
  'BAILING_WIRE_PROTOCOL',
  'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION',
  'WEIGHT_OF_NON_TARGET_MATERIALS',
  'RECYCLABLE_PROPORTION_PERCENTAGE',
  'TONNAGE_RECEIVED_FOR_EXPORT',
  'DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE',
  'INTERIM_SITE_ID',
  'TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR',
  'DATE_RECEIVED_BY_OSR',
  'OSR_ID',
  'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED',
  'DATE_OF_EXPORT',
  'EXPORT_CONTROLS',
  'BASEL_EXPORT_CODE',
  'CUSTOMS_CODES',
  'CONTAINER_NUMBER'
]

export const REPROCESSOR_INPUT_RECEIVED_HEADERS = [
  'ROW_ID',
  'DATE_RECEIVED_FOR_REPROCESSING',
  'EWC_CODE',
  'DESCRIPTION_WASTE',
  'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE',
  'GROSS_WEIGHT',
  'TARE_WEIGHT',
  'PALLET_WEIGHT',
  'NET_WEIGHT',
  'BAILING_WIRE_PROTOCOL',
  'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION',
  'WEIGHT_OF_NON_TARGET_MATERIALS',
  'RECYCLABLE_PROPORTION_PERCENTAGE',
  'TONNAGE_RECEIVED_FOR_RECYCLING',
  'SUPPLIER_NAME',
  'SUPPLIER_ADDRESS',
  'SUPPLIER_POSTCODE',
  'SUPPLIER_EMAIL',
  'SUPPLIER_PHONE_NUMBER',
  'ACTIVITIES_CARRIED_OUT_BY_SUPPLIER',
  'YOUR_REFERENCE',
  'WEIGHBRIDGE_TICKET',
  'CARRIER_NAME',
  'CBD_REG_NUMBER',
  'CARRIER_VEHICLE_REGISTRATION_NUMBER'
]

export const REPROCESSOR_INPUT_SENT_ON_HEADERS = [
  'ROW_ID',
  'DATE_LOAD_LEFT_SITE',
  'TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON',
  'FINAL_DESTINATION_FACILITY_TYPE',
  'FINAL_DESTINATION_NAME',
  'FINAL_DESTINATION_ADDRESS',
  'FINAL_DESTINATION_POSTCODE',
  'FINAL_DESTINATION_EMAIL',
  'FINAL_DESTINATION_PHONE',
  'YOUR_REFERENCE',
  'DESCRIPTION_WASTE',
  'EWC_CODE',
  'WEIGHBRIDGE_TICKET'
]

export const REPROCESSOR_OUTPUT_HEADERS = [
  'ROW_ID',
  'DATE_LOAD_LEFT_SITE',
  'PRODUCT_TONNAGE',
  'UK_PACKAGING_WEIGHT_PERCENTAGE',
  'PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION',
  'ADD_PRODUCT_WEIGHT'
]

export const createExporterRowValues = (overrides = {}) => {
  const defaults = {
    rowId: 1001,
    dateReceived: '2025-01-15T00:00:00.000Z',
    ewcCode: '03 03 08',
    wasteDescription: 'Glass - pre-sorted',
    prnIssued: 'No',
    grossWeight: 1000,
    tareWeight: 100,
    palletWeight: 50,
    netWeight: 850,
    bailingWire: 'No',
    recyclablePropMethod: 'Actual weight (100%)',
    nonTargetWeight: 0,
    recyclablePropPct: 1,
    tonnageReceived: 850,
    interimSite: 'No',
    interimSiteId: 100,
    interimTonnage: 0,
    dateReceivedByOsr: '2025-01-18T00:00:00.000Z',
    osrId: 100,
    exportTonnage: 100,
    exportDate: '2025-01-20T00:00:00.000Z',
    exportControls: 'Article 18 (Green list)',
    baselCode: 'B3020',
    customsCode: '123456',
    containerNumber: 'CONT123456'
  }
  const d = { ...defaults, ...overrides }
  return [
    d.rowId,
    d.dateReceived,
    d.ewcCode,
    d.wasteDescription,
    d.prnIssued,
    d.grossWeight,
    d.tareWeight,
    d.palletWeight,
    d.netWeight,
    d.bailingWire,
    d.recyclablePropMethod,
    d.nonTargetWeight,
    d.recyclablePropPct,
    d.tonnageReceived,
    d.interimSite,
    d.interimSiteId,
    d.interimTonnage,
    d.dateReceivedByOsr,
    d.osrId,
    d.exportTonnage,
    d.exportDate,
    d.exportControls,
    d.baselCode,
    d.customsCode,
    d.containerNumber
  ]
}

export const createReprocessorInputReceivedRowValues = (overrides = {}) => {
  const tonnage = overrides.tonnageReceived ?? 850
  const d = {
    rowId: 1001,
    dateReceived: '2025-01-15T00:00:00.000Z',
    ewcCode: '15 01 01',
    wasteDescription: 'Paper - other',
    prnIssued: 'No',
    grossWeight: tonnage + 150,
    tareWeight: 100,
    palletWeight: 50,
    netWeight: tonnage,
    bailingWire: 'No',
    recyclablePropMethod: 'Actual weight (100%)',
    nonTargetWeight: 0,
    recyclablePropPct: 1,
    tonnageReceived: tonnage,
    supplierName: 'Supplier A',
    supplierAddress: '123 Street',
    supplierPostcode: 'AB1 2CD',
    supplierEmail: 'supplier@example.com',
    supplierPhone: '0123456789',
    yourReference: 'REF123',
    weighbridgeTicket: 'WB123',
    carrierName: 'Carrier A',
    cbdRegNumber: 'CBD123',
    carrierVehicleReg: 'AB12 CDE',
    ...overrides
  }
  return [
    d.rowId,
    d.dateReceived,
    d.ewcCode,
    d.wasteDescription,
    d.prnIssued,
    d.grossWeight,
    d.tareWeight,
    d.palletWeight,
    d.netWeight,
    d.bailingWire,
    d.recyclablePropMethod,
    d.nonTargetWeight,
    d.recyclablePropPct,
    d.tonnageReceived,
    d.supplierName,
    d.supplierAddress,
    d.supplierPostcode,
    d.supplierEmail,
    d.supplierPhone,
    'Activities',
    d.yourReference,
    d.weighbridgeTicket,
    d.carrierName,
    d.cbdRegNumber,
    d.carrierVehicleReg
  ]
}

export const createReprocessorInputSentOnRowValues = (overrides = {}) => {
  const d = {
    rowId: 5001,
    dateLeft: '2025-01-20T00:00:00.000Z',
    tonnageSent: 100,
    destinationType: 'Reprocessor',
    destinationName: 'Dest A',
    destinationAddress: '456 Road',
    destinationPostcode: 'XY9 8ZW',
    destinationEmail: 'dest@example.com',
    destinationPhone: '0987654321',
    yourReference: 'REF456',
    wasteDescription: 'Paper',
    ewcCode: '15 01 01',
    weighbridgeTicket: 'WB456',
    ...overrides
  }
  return [
    d.rowId,
    d.dateLeft,
    d.tonnageSent,
    d.destinationType,
    d.destinationName,
    d.destinationAddress,
    d.destinationPostcode,
    d.destinationEmail,
    d.destinationPhone,
    d.yourReference,
    d.wasteDescription,
    d.ewcCode,
    d.weighbridgeTicket
  ]
}

export const createReprocessorOutputRowValues = (overrides = {}) => {
  const defaults = {
    rowId: 3001,
    dateLeft: '2025-01-15T00:00:00.000Z',
    productTonnage: 100,
    ukPackagingWeightPercentage: 1,
    productUkPackagingWeightProportion: 100,
    addProductWeight: 'Yes'
  }
  const d = { ...defaults, ...overrides }
  return [
    d.rowId,
    d.dateLeft,
    d.productTonnage,
    d.ukPackagingWeightPercentage,
    d.productUkPackagingWeightProportion,
    d.addProductWeight
  ]
}

export const uploadAndValidate = async (
  env,
  organisationId,
  registrationId,
  summaryLogId,
  fileId,
  filename,
  uploadData,
  sharedMeta
) => {
  const { server, fileDataMap } = env

  // Register the file data for this submission
  fileDataMap[fileId] = { meta: sharedMeta, data: uploadData }

  await server.inject({
    method: 'POST',
    url: buildPostUrl(organisationId, registrationId, summaryLogId),
    payload: createUploadPayload(
      organisationId,
      registrationId,
      UPLOAD_STATUS.COMPLETE,
      fileId,
      filename
    )
  })

  await pollForValidation(server, organisationId, registrationId, summaryLogId)

  return server.inject({
    method: 'GET',
    url: buildGetUrl(organisationId, registrationId, summaryLogId),
    ...asStandardUser({ linkedOrgId: organisationId })
  })
}

export const submitAndPoll = async (
  env,
  organisationId,
  registrationId,
  summaryLogId
) => {
  const { server } = env

  await server.inject({
    method: 'POST',
    url: buildSubmitUrl(organisationId, registrationId, summaryLogId),
    ...asStandardUser({ linkedOrgId: organisationId })
  })

  return pollWhileStatus(server, organisationId, registrationId, summaryLogId, {
    waitWhile: SUMMARY_LOG_STATUS.SUBMITTING,
    maxAttempts: 20
  })
}

export const performSubmission = async (
  env,
  organisationId,
  registrationId,
  summaryLogId,
  fileId,
  filename,
  uploadData,
  sharedMeta
) => {
  await uploadAndValidate(
    env,
    organisationId,
    registrationId,
    summaryLogId,
    fileId,
    filename,
    uploadData,
    sharedMeta
  )
  return submitAndPoll(env, organisationId, registrationId, summaryLogId)
}
