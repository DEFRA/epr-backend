import { describe, it, expect, beforeEach } from 'vitest'

import { commitSummaryLogSubmission } from './commit-summary-log-submission.js'
import { createInMemorySummaryLogRowStateRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { partialMock } from '#test/type-helpers.js'

const ORGANISATION_ID = 'org-1'
const REGISTRATION_ID = 'reg-1'
const ACCREDITATION_ID = 'acc-1'
const SUMMARY_LOG_ID = 'log-A'

/** @type {import('#waste-balances/repository/ledger-schema.js').AccreditedLedgerId} */
const accreditedLedgerId = {
  organisationId: ORGANISATION_ID,
  registrationId: REGISTRATION_ID,
  accreditationId: ACCREDITATION_ID
}

/** @type {import('#waste-records/repository/schema.js').WasteBalanceLedgerId} */
const registeredOnlyLedgerId = {
  organisationId: ORGANISATION_ID,
  registrationId: REGISTRATION_ID,
  accreditationId: null
}

/** @type {import('#domain/organisations/accreditation.js').Accreditation} */
const accreditation = partialMock({
  id: ACCREDITATION_ID,
  validFrom: '2026-01-01',
  validTo: '2026-12-31',
  statusHistory: []
})

const user = {
  id: 'user-1',
  name: 'Test User',
  email: 'user@example.test',
  scope: ['some-scope'],
  role: 'standard_user'
}

// These submissions are reprocessor-input, which the orchestrator resolves to
// the disabled sentinel rather than a sites lookup.
/** @type {import('#domain/summary-logs/table-schemas/validation-pipeline.js').OverseasSitesContext} */
const overseasSites = ORS_VALIDATION_DISABLED

/**
 * A reprocessor-input row carrying every field the balance classifier needs, so
 * it is included and contributes `tonnage`. A PRN issued on the waste excludes
 * it while leaving the tonnage on the row.
 *
 * @param {{ rowId: number, tonnage: number, prnIssued?: string }} row
 * @returns {import('#domain/waste-records/model.js').WasteRecord}
 */
const includableRecord = ({ rowId, tonnage, prnIssued = 'No' }) => ({
  organisationId: ORGANISATION_ID,
  registrationId: REGISTRATION_ID,
  accreditationId: ACCREDITATION_ID,
  rowId: String(rowId),
  type: WASTE_RECORD_TYPE.RECEIVED,
  versions: [],
  data: {
    processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
    ROW_ID: String(rowId),
    DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01',
    EWC_CODE: '15 01 02',
    DESCRIPTION_WASTE: 'Plastic packaging',
    WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: prnIssued,
    GROSS_WEIGHT: 10,
    TARE_WEIGHT: 1,
    PALLET_WEIGHT: 0,
    NET_WEIGHT: 9,
    BAILING_WIRE_PROTOCOL: 'No',
    HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Sampling',
    WEIGHT_OF_NON_TARGET_MATERIALS: 0,
    RECYCLABLE_PROPORTION_PERCENTAGE: 100,
    TONNAGE_RECEIVED_FOR_RECYCLING: tonnage
  }
})

describe('commitSummaryLogSubmission', () => {
  let summaryLogRowStateRepository
  let ledgerRepository
  let wasteBalanceService

  beforeEach(() => {
    summaryLogRowStateRepository =
      createInMemorySummaryLogRowStateRepository()()
    ledgerRepository = createInMemoryLedgerRepository()()
    wasteBalanceService = createWasteBalanceService(ledgerRepository)
  })

  const commit = (overrides = {}) =>
    commitSummaryLogSubmission({
      summaryLogRowStateRepository,
      wasteBalanceService,
      wasteRecords: [],
      accreditation,
      ledgerId: accreditedLedgerId,
      processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
      overseasSites,
      summaryLogId: SUMMARY_LOG_ID,
      user,
      ...overrides
    })

  /** @param {import('#waste-records/repository/schema.js').WasteBalanceLedgerId} ledgerId */
  const committedStates = (ledgerId = accreditedLedgerId) =>
    summaryLogRowStateRepository.findRowStatesForSummaryLog(
      ledgerId,
      SUMMARY_LOG_ID
    )

  it('credits the ledger with the total the committed states carry', async () => {
    await commit({
      wasteRecords: [
        includableRecord({ rowId: 1, tonnage: 1.005 }),
        includableRecord({ rowId: 2, tonnage: 2.5 }),
        includableRecord({ rowId: 3, tonnage: 4, prnIssued: 'Yes' })
      ]
    })

    const states = await committedStates()
    const includedTotal = states
      .filter(
        (state) =>
          state.classification.outcome === WASTE_BALANCE_OUTCOME.INCLUDED
      )
      .reduce(
        (total, state) => total + state.classification.transactionAmount,
        0
      )

    const [event] = await ledgerRepository.findAllInLedger(accreditedLedgerId)
    expect(event.payload).toEqual({
      summaryLogId: SUMMARY_LOG_ID,
      creditTotal: 3.51
    })
    expect(includedTotal).toBeCloseTo(3.51, 10)
  })

  it('commits the row states before crediting the ledger', async () => {
    await commit({
      wasteRecords: [includableRecord({ rowId: 1, tonnage: 12 })]
    })

    const states = await committedStates()
    expect(states.map((state) => state.rowId)).toEqual(['1'])
    expect(states[0].classification.outcome).toBe(
      WASTE_BALANCE_OUTCOME.INCLUDED
    )
  })

  it('records a zero-delta event under the registered-only ledger with no accreditation', async () => {
    await commit({
      accreditation: null,
      ledgerId: registeredOnlyLedgerId,
      wasteRecords: [includableRecord({ rowId: 1, tonnage: 12 })]
    })

    const [event] = await ledgerRepository.findAllInLedger(
      registeredOnlyLedgerId
    )
    expect(event.payload).toEqual({
      summaryLogId: SUMMARY_LOG_ID,
      creditTotal: 0
    })
    expect(event.createdBy).toEqual({
      id: user.id,
      name: user.name,
      email: user.email
    })
    expect(await committedStates(registeredOnlyLedgerId)).toHaveLength(1)
  })

  it('omits the submitter name from the zero-delta event when they have none', async () => {
    await commit({
      accreditation: null,
      ledgerId: registeredOnlyLedgerId,
      user: { id: 'user-2', email: 'noname@example.test', scope: [] }
    })

    const [event] = await ledgerRepository.findAllInLedger(
      registeredOnlyLedgerId
    )
    expect(event.createdBy).toEqual({
      id: 'user-2',
      email: 'noname@example.test'
    })
  })

  it('appends no event for an accredited registered-only template', async () => {
    await commit({
      processingType: PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY,
      wasteRecords: [includableRecord({ rowId: 1, tonnage: 12 })]
    })

    expect(await ledgerRepository.findAllInLedger(accreditedLedgerId)).toEqual(
      []
    )
    expect(await committedStates()).toHaveLength(1)
  })

  it('appends no event for an accredited submission with no rows', async () => {
    await commit({ wasteRecords: [] })

    expect(await ledgerRepository.findAllInLedger(accreditedLedgerId)).toEqual(
      []
    )
  })

  it('credits an exporter submission too — every balance-bearing template appends', async () => {
    await commit({
      processingType: PROCESSING_TYPES.EXPORTER,
      wasteRecords: [includableRecord({ rowId: 1, tonnage: 7 })]
    })

    const [event] = await ledgerRepository.findAllInLedger(accreditedLedgerId)
    expect(event.payload.creditTotal).toBe(7)
  })
})
