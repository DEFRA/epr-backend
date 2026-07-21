import { describe, it, expect } from 'vitest'

import { liveClassifiedRowStatesForRegistration } from './live-classified-row-states.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import {
  REG_ACC_STATUS,
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { createInMemorySummaryLogRowStateRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { partialMock } from '#test/type-helpers.js'

const SUMMARY_LOG_ID = 'log-1'

const receivedRowData = {
  DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01',
  EWC_CODE: '15 01 02',
  DESCRIPTION_WASTE: 'Plastic packaging',
  WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
  GROSS_WEIGHT: 10,
  TARE_WEIGHT: 1,
  PALLET_WEIGHT: 0,
  NET_WEIGHT: 9,
  BAILING_WIRE_PROTOCOL: 'No',
  HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Sampling',
  WEIGHT_OF_NON_TARGET_MATERIALS: 0,
  RECYCLABLE_PROPORTION_PERCENTAGE: 100,
  TONNAGE_RECEIVED_FOR_RECYCLING: 9
}

const ORGANISATION_ID = '6a5e271fe01bc18f22a9941e'
const REGISTRATION_ID = '6a5e271fe01bc18f22a9941c'
const ACCREDITATION_ID = '6a5e271fe01bc18f22a99419'

const approvedHistory = [
  { status: REG_ACC_STATUS.CREATED, updatedAt: '2024-01-01' },
  { status: REG_ACC_STATUS.APPROVED, updatedAt: '2024-02-01' }
]

/** @type {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId} */
const ACCREDITED_LEDGER_ID = {
  organisationId: ORGANISATION_ID,
  registrationId: REGISTRATION_ID,
  accreditationId: ACCREDITATION_ID
}

const reprocessorAccreditedFrom = (validFrom) => ({
  ledgerId: { ...ACCREDITED_LEDGER_ID },
  organisation: partialMock({
    id: ORGANISATION_ID,
    orgId: 500001,
    version: 1,
    statusHistory: approvedHistory,
    accreditations: [
      {
        id: ACCREDITATION_ID,
        accreditationNumber: 'ACC-1',
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        validFrom,
        validTo: '2027-01-01',
        statusHistory: approvedHistory
      }
    ],
    registrations: [
      {
        id: REGISTRATION_ID,
        accreditationId: ACCREDITATION_ID,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        reprocessingType: REPROCESSING_TYPE.INPUT,
        statusHistory: approvedHistory
      }
    ]
  })
})

const OVERSEAS_SITE_ID = '6a5e271fe01bc18f22a99420'
const OSR_KEY = '099'

const exportedRowData = {
  DATE_RECEIVED_FOR_EXPORT: '2026-02-01',
  EWC_CODE: '15 01 02',
  DESCRIPTION_WASTE: 'Plastic packaging',
  WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
  GROSS_WEIGHT: 10,
  TARE_WEIGHT: 1,
  PALLET_WEIGHT: 0,
  NET_WEIGHT: 9,
  BAILING_WIRE_PROTOCOL: 'No',
  HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Sampling',
  WEIGHT_OF_NON_TARGET_MATERIALS: 0,
  RECYCLABLE_PROPORTION_PERCENTAGE: 100,
  TONNAGE_RECEIVED_FOR_EXPORT: 9,
  TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 9,
  DATE_OF_EXPORT: '2026-03-01',
  BASEL_EXPORT_CODE: 'B3010',
  CUSTOMS_CODES: '391510',
  CONTAINER_NUMBER: 'CN-001',
  DATE_RECEIVED_BY_OSR: '2026-04-01',
  OSR_ID: OSR_KEY,
  DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'No'
}

const exporterWithOverseasSite = () => ({
  ledgerId: {
    organisationId: ORGANISATION_ID,
    registrationId: REGISTRATION_ID,
    accreditationId: ACCREDITATION_ID
  },
  organisation: partialMock({
    id: ORGANISATION_ID,
    orgId: 500001,
    version: 1,
    statusHistory: approvedHistory,
    accreditations: [
      {
        id: ACCREDITATION_ID,
        accreditationNumber: 'ACC-1',
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
        validFrom: '2026-01-01',
        validTo: '2027-01-01',
        statusHistory: approvedHistory
      }
    ],
    registrations: [
      {
        id: REGISTRATION_ID,
        accreditationId: ACCREDITATION_ID,
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
        overseasSites: { [OSR_KEY]: { overseasSiteId: OVERSEAS_SITE_ID } },
        statusHistory: approvedHistory
      }
    ]
  })
})

const overseasSiteApprovedFrom = (validFrom) =>
  partialMock({
    id: OVERSEAS_SITE_ID,
    name: 'Test Overseas Site',
    country: 'Netherlands',
    validFrom
  })

const rowStateEntry = (overrides = {}) => ({
  rowId: '1001',
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
  data: receivedRowData,
  classification: {
    outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
    reasons: [],
    transactionAmount: 9
  },
  ...overrides
})

const readLiveStates = async ({
  organisation,
  ledgerId,
  entries = [rowStateEntry()],
  submitted = true,
  overseasSites = /** @type {import('#overseas-sites/repository/port.js').OverseasSite[]} */ ([])
}) => {
  const summaryLogRowStateRepository =
    createInMemorySummaryLogRowStateRepository()()
  if (submitted) {
    await summaryLogRowStateRepository.upsertSummaryLogRowStates(
      ledgerId,
      entries,
      SUMMARY_LOG_ID
    )
  }

  return liveClassifiedRowStatesForRegistration({
    ledgerRepository: createInMemoryLedgerRepository(
      submitted
        ? [
            partialMock(
              buildLedgerEvent({
                ...ledgerId,
                number: 1,
                payload: { summaryLogId: SUMMARY_LOG_ID, creditTotal: 9 }
              })
            )
          ]
        : []
    )(),
    summaryLogRowStateRepository,
    organisationsRepository: createInMemoryOrganisationsRepository([
      organisation
    ])(),
    overseasSitesRepository:
      createInMemoryOverseasSitesRepository(overseasSites)(),
    ...ledgerId
  })
}

describe('liveClassifiedRowStatesForRegistration', () => {
  it('returns nothing when the ledger has no submission', async () => {
    const states = await readLiveStates({
      ...reprocessorAccreditedFrom('2026-01-01'),
      submitted: false
    })

    expect(states).toEqual([])
  })

  it('classifies a row the accreditation covers as included', async () => {
    const [state] = await readLiveStates({
      ...reprocessorAccreditedFrom('2026-01-01')
    })

    expect(state.classification).toEqual({
      outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
      reasons: [],
      transactionAmount: 9
    })
  })

  it('replaces the stamped reading when the accreditation period no longer covers the row', async () => {
    const [state] = await readLiveStates({
      ...reprocessorAccreditedFrom('2026-06-01')
    })

    expect(state.classification).toEqual({
      outcome: WASTE_BALANCE_OUTCOME.IGNORED,
      reasons: [{ code: 'OUTSIDE_ACCREDITATION_PERIOD' }],
      transactionAmount: 0
    })
  })

  it('projects to domain content, dropping storage id, membership and ledger identity', async () => {
    const [state] = await readLiveStates({
      ...reprocessorAccreditedFrom('2026-01-01')
    })

    expect(Object.keys(state).sort()).toEqual([
      'classification',
      'data',
      'processingType',
      'rowId',
      'wasteRecordType'
    ])
  })

  it('excludes an exported row whose overseas site is not yet approved for the export date', async () => {
    const [state] = await readLiveStates({
      ...exporterWithOverseasSite(),
      entries: [
        rowStateEntry({
          wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
          processingType: PROCESSING_TYPES.EXPORTER,
          data: exportedRowData
        })
      ],
      overseasSites: [overseasSiteApprovedFrom(null)]
    })

    expect(state.classification).toEqual({
      outcome: WASTE_BALANCE_OUTCOME.EXCLUDED,
      reasons: [{ code: 'ORS_NOT_APPROVED' }],
      transactionAmount: 0
    })
  })

  it('includes that same row once the overseas site approval covers the export date', async () => {
    const [state] = await readLiveStates({
      ...exporterWithOverseasSite(),
      entries: [
        rowStateEntry({
          wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
          processingType: PROCESSING_TYPES.EXPORTER,
          data: exportedRowData
        })
      ],
      overseasSites: [overseasSiteApprovedFrom(new Date('2026-01-01'))]
    })

    expect(state.classification).toEqual({
      outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
      reasons: [],
      transactionAmount: 9
    })
  })

  it('reads rows submitted under a since-cancelled accreditation as not applicable, rather than renaming their template', async () => {
    const scenario = reprocessorAccreditedFrom('2026-01-01')
    scenario.organisation.accreditations[0].statusHistory = [
      ...approvedHistory,
      { status: REG_ACC_STATUS.CANCELLED, updatedAt: '2026-05-01' }
    ]

    const [state] = await readLiveStates(scenario)

    expect(state.classification).toEqual({
      outcome: WASTE_BALANCE_OUTCOME.NOT_APPLICABLE,
      reasons: [],
      transactionAmount: 0
    })
  })

  it('reads a registered-only partition under the registered-only template', async () => {
    const scenario = reprocessorAccreditedFrom('2026-01-01')
    scenario.ledgerId = { ...scenario.ledgerId, accreditationId: null }
    scenario.organisation.registrations[0].accreditationId = undefined

    const [state] = await readLiveStates({
      ...scenario,
      entries: [
        rowStateEntry({
          processingType: PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY
        })
      ]
    })

    expect(state.classification.outcome).toBe(
      WASTE_BALANCE_OUTCOME.NOT_APPLICABLE
    )
  })

  it('returns nothing when the submission committed no rows', async () => {
    const states = await readLiveStates({
      ...reprocessorAccreditedFrom('2026-01-01'),
      entries: []
    })

    expect(states).toEqual([])
  })

  it('returns nothing for a submission with no rows even when the organisation no longer holds the registration', async () => {
    const scenario = reprocessorAccreditedFrom('2026-01-01')
    scenario.organisation.registrations = []

    // A partition with nothing committed answers with nothing; it does not
    // reach the registration lookup and turn into a 404.
    await expect(readLiveStates({ ...scenario, entries: [] })).resolves.toEqual(
      []
    )
  })

  it('fails when the ledger names a registration the organisation does not hold', async () => {
    const scenario = reprocessorAccreditedFrom('2026-01-01')
    scenario.organisation.registrations = []

    await expect(readLiveStates(scenario)).rejects.toThrow(
      `Registration with id ${REGISTRATION_ID} not found`
    )
  })

  it('reads rows under the template they were submitted under, not one the registration would name', async () => {
    const [state] = await readLiveStates({
      ...reprocessorAccreditedFrom('2026-01-01'),
      entries: [
        rowStateEntry({
          processingType: PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY
        })
      ]
    })

    expect(state.classification.outcome).toBe(
      WASTE_BALANCE_OUTCOME.NOT_APPLICABLE
    )
  })
})
