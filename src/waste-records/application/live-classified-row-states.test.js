import { describe, it, expect } from 'vitest'

import { liveClassifiedRowStatesForRegistration } from './live-classified-row-states.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { partialMock } from '#test/type-helpers.js'
import { withNumbers } from '#waste-records/repository/test-data.js'

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

const YEAR = '2026'

const timelineApprovedOn = (approvedOn) => [
  { status: 'created', at: '2025-11-01T00:00:00.000Z' },
  { status: 'approved', at: new Date(approvedOn).toISOString() }
]

/** @type {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId} */
const ACCREDITED_LEDGER_ID = {
  organisationId: ORGANISATION_ID,
  registrationId: REGISTRATION_ID,
  accreditationId: ACCREDITATION_ID
}

const reprocessorAccreditedFrom = (approvedOn) => ({
  ledgerId: { ...ACCREDITED_LEDGER_ID },
  registration: {
    wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR
  },
  accreditation: {
    status: { current: 'approved', timeline: timelineApprovedOn(approvedOn) }
  }
})

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

const exporterWithOverseasSite = ({ siteApprovedOn } = {}) => ({
  ledgerId: { ...ACCREDITED_LEDGER_ID },
  registration: {
    wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
    overseasSites: {
      [OSR_KEY]: {
        name: 'Test Overseas Site',
        address: { country: 'Netherlands' }
      }
    }
  },
  accreditation: {
    status: { current: 'approved', timeline: timelineApprovedOn('2026-01-01') },
    overseasSites: {
      [OSR_KEY]: siteApprovedOn
        ? { status: 'approved', approvedOn: siteApprovedOn }
        : { status: 'pending' }
    }
  }
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
  registration,
  accreditation,
  ledgerId,
  entries = [rowStateEntry()],
  submitted = true,
  readModelHolds = true
}) => {
  const summaryLogRowStatesRepository =
    createInMemorySummaryLogRowStatesRepository()()
  const numbers = withNumbers(ledgerId)
  if (submitted) {
    await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
      numbers,
      entries,
      SUMMARY_LOG_ID
    )
  }

  const readModelRegistration = {
    ...registration,
    accreditations:
      ledgerId.accreditationId === null
        ? {}
        : {
            [YEAR]: {
              accreditationNumber: numbers.accreditationNumber,
              ...accreditation
            }
          }
  }
  const organisation = {
    organisationNumber: numbers.organisationNumber,
    registrations: { [numbers.registrationNumber]: readModelRegistration }
  }
  const organisationReadRepository = {
    findRegistrationByNumber: async () =>
      readModelHolds
        ? { organisation, registration: readModelRegistration }
        : null,
    findAccreditationByNumber: async () =>
      readModelHolds
        ? {
            organisation,
            registration: readModelRegistration,
            accreditation: readModelRegistration.accreditations[YEAR],
            year: YEAR
          }
        : null
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
    summaryLogRowStatesRepository,
    organisationReadRepository: /** @type {any} */ (organisationReadRepository),
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
      ]
    })

    expect(state.classification).toEqual({
      outcome: WASTE_BALANCE_OUTCOME.EXCLUDED,
      reasons: [{ code: 'ORS_NOT_APPROVED' }],
      transactionAmount: 0
    })
  })

  it('includes that same row once the overseas site approval covers the export date', async () => {
    const [state] = await readLiveStates({
      ...exporterWithOverseasSite({ siteApprovedOn: '2026-01-01' }),
      entries: [
        rowStateEntry({
          wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
          processingType: PROCESSING_TYPES.EXPORTER,
          data: exportedRowData
        })
      ]
    })

    expect(state.classification).toEqual({
      outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
      reasons: [],
      transactionAmount: 9
    })
  })

  it('reads a row dated after the accreditation was cancelled as outside the accreditation period', async () => {
    const scenario = reprocessorAccreditedFrom('2026-01-01')
    scenario.accreditation.status.timeline.push({
      status: 'cancelled',
      at: '2026-01-15T00:00:00.000Z'
    })

    const [state] = await readLiveStates(scenario)

    expect(state.classification).toEqual({
      outcome: WASTE_BALANCE_OUTCOME.IGNORED,
      reasons: [{ code: 'OUTSIDE_ACCREDITATION_PERIOD' }],
      transactionAmount: 0
    })
  })

  it('reads a registered-only partition under the registered-only template', async () => {
    const scenario = reprocessorAccreditedFrom('2026-01-01')
    scenario.ledgerId = { ...scenario.ledgerId, accreditationId: null }

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

    // A partition with nothing committed answers with nothing; it does not
    // reach the registration lookup and turn into a 404.
    await expect(
      readLiveStates({ ...scenario, readModelHolds: false, entries: [] })
    ).resolves.toEqual([])
  })

  it('fails when the read model does not hold the accreditation the rows name', async () => {
    await expect(
      readLiveStates({
        ...reprocessorAccreditedFrom('2026-01-01'),
        readModelHolds: false
      })
    ).rejects.toThrow('Accreditation ACC-')
  })

  it('fails when the read model does not hold a registered-only registration', async () => {
    const scenario = reprocessorAccreditedFrom('2026-01-01')

    await expect(
      readLiveStates({
        ...scenario,
        ledgerId: { ...scenario.ledgerId, accreditationId: null },
        readModelHolds: false
      })
    ).rejects.toThrow('Registration REG-')
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
