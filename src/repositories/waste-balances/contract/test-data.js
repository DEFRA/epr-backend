import { randomUUID } from 'node:crypto'
import {
  WASTE_BALANCE_TRANSACTION_TYPE,
  WASTE_BALANCE_TRANSACTION_ENTITY_TYPE
} from '#domain/waste-balances/model.js'
import { RECEIVED_LOADS_FIELDS } from '#domain/summary-logs/table-schemas/exporter/fields.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

/**
 * Build a minimal waste balance for testing
 * @param {Partial<import('#domain/waste-balances/model.js').WasteBalance>} [overrides] - Optional overrides for the waste balance
 * @returns {import('#domain/waste-balances/model.js').WasteBalance}
 */
export const buildWasteBalance = (overrides = {}) => {
  const id = overrides.id ?? randomUUID()
  const organisationId = overrides.organisationId ?? 'org-1'
  const accreditationId = overrides.accreditationId ?? 'acc-1'
  const schemaVersion = overrides.schemaVersion ?? 1
  const version = overrides.version ?? 1
  const amount = overrides.amount ?? 100
  const availableAmount = overrides.availableAmount ?? 100

  const transaction = {
    id: randomUUID(),
    type: WASTE_BALANCE_TRANSACTION_TYPE.CREDIT,
    createdAt: new Date('2025-01-15T10:00:00.000Z').toISOString(),
    createdBy: {
      id: 'user-1',
      name: 'Test User'
    },
    amount: 100,
    openingAmount: 0,
    closingAmount: 100,
    openingAvailableAmount: 0,
    closingAvailableAmount: 100,
    entities: [
      {
        id: 'waste-record-1',
        currentVersionId: 'version-1',
        previousVersionIds: [],
        type: WASTE_BALANCE_TRANSACTION_ENTITY_TYPE.WASTE_RECORD_RECEIVED
      }
    ]
  }

  return {
    ...overrides,
    id,
    organisationId,
    accreditationId,
    schemaVersion,
    version,
    amount,
    availableAmount,
    transactions: overrides.transactions || [transaction]
  }
}

/**
 * Build a waste record for testing
 * @param {Partial<import('#domain/waste-records/model.js').WasteRecord>} [overrides]
 * @returns {import('#domain/waste-records/model.js').WasteRecord}
 */
export const buildWasteRecord = (overrides = {}) => {
  const { data, versions, ...restOverrides } = overrides
  const defaultData = {
    processingType: PROCESSING_TYPES.EXPORTER,
    [RECEIVED_LOADS_FIELDS.WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE]: 'No',
    [RECEIVED_LOADS_FIELDS.DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE]: 'No',
    [RECEIVED_LOADS_FIELDS.TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED]: 10,
    [RECEIVED_LOADS_FIELDS.TONNAGE_PASSED_INTERIM_SITE_RECEIVED_BY_OSR]: 0,
    'Date Received': '2025-01-20'
  }

  return {
    organisationId: 'org-1',
    registrationId: 'reg-1',
    accreditationId: 'acc-1',
    rowId: randomUUID(),
    type: 'received',
    data: {
      ...defaultData,
      ...data
    },
    versions: versions || [
      {
        id: randomUUID(),
        createdAt: '2025-01-20T10:00:00.000Z',
        status: 'created',
        summaryLog: { id: 'log-1', uri: 's3://...' },
        data: {}
      }
    ],
    ...restOverrides
  }
}
