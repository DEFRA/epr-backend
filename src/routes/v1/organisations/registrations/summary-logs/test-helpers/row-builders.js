import {
  DEFAULT_DATE,
  DEFAULT_ROW_ID,
  DEFAULT_TONNAGE,
  EWC_PAPER_BOARD,
  GROSS_WEIGHT_OFFSET
} from './constants.js'

export const buildWasteHeader = (dateLabel, tonnageLabel, suffixes = []) => [
  'ROW_ID',
  dateLabel,
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
  tonnageLabel,
  ...suffixes
]

export const EXPORTER_HEADERS = buildWasteHeader(
  'DATE_RECEIVED_FOR_EXPORT',
  'TONNAGE_RECEIVED_FOR_EXPORT',
  [
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
)

export const REPROCESSOR_INPUT_RECEIVED_HEADERS = buildWasteHeader(
  'DATE_RECEIVED_FOR_REPROCESSING',
  'TONNAGE_RECEIVED_FOR_RECYCLING',
  [
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
)

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

const buildCommonWasteRowValues = (d) => [
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
  d.tonnageReceived
]

export const createExporterRowValues = (overrides = {}) => {
  const defaults = {
    rowId: DEFAULT_ROW_ID,
    dateReceived: DEFAULT_DATE,
    ewcCode: '03 03 08',
    wasteDescription: 'Glass - pre-sorted',
    prnIssued: 'No',
    grossWeight: 1000,
    tareWeight: 100,
    palletWeight: 50,
    netWeight: DEFAULT_TONNAGE,
    bailingWire: 'No',
    recyclablePropMethod: 'Actual weight (100%)',
    nonTargetWeight: 0,
    recyclablePropPct: 1,
    tonnageReceived: DEFAULT_TONNAGE,
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
    ...buildCommonWasteRowValues(d),
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
  const tonnage = overrides.tonnageReceived ?? DEFAULT_TONNAGE
  const d = {
    rowId: DEFAULT_ROW_ID,
    dateReceived: DEFAULT_DATE,
    ewcCode: EWC_PAPER_BOARD,
    wasteDescription: 'Paper - other',
    prnIssued: 'No',
    grossWeight: tonnage + GROSS_WEIGHT_OFFSET,
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
    ...buildCommonWasteRowValues(d),
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
    ewcCode: EWC_PAPER_BOARD,
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
    dateLeft: DEFAULT_DATE,
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
