import { describe, it, expect, vi } from 'vitest'

import { REG_ACC_STATUS } from '#domain/organisations/model.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createInMemorySummaryLogRowStateRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { buildSummaryLogRowStateEntry } from '#waste-records/repository/test-data.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'

import { runReconciliation } from './run-reconciliation.js'

const orgsRepository = (orgs) => ({ findAll: async () => orgs })
const sitesRepository = (sites) => ({ findAll: async () => sites })

const committedRecord = (organisationId, registrationId, rowId, head) => ({
  organisationId,
  registrationId,
  rowId,
  type: WASTE_RECORD_TYPE.RECEIVED,
  data: { ROW_ID: rowId },
  excludedFromWasteBalance: true,
  versions: [{ summaryLog: { id: head } }]
})

describe('runReconciliation', () => {
  it('walks every registration of every organisation and summarises the estate', async () => {
    const org = {
      id: 'org-1',
      registrations: [
        { id: 'reg-acc', accreditationId: 'acc-1', overseasSites: {} },
        { id: 'reg-only', overseasSites: {} }
      ],
      accreditations: [{ id: 'acc-1', status: REG_ACC_STATUS.APPROVED }]
    }

    const orgWithoutRegistrations = { id: 'org-empty' }

    const summaryLogRowStateRepository =
      createInMemorySummaryLogRowStateRepository()()
    await summaryLogRowStateRepository.upsertSummaryLogRowStates(
      {
        organisationId: 'org-1',
        registrationId: 'reg-acc',
        accreditationId: 'acc-1'
      },
      [buildSummaryLogRowStateEntry({ rowId: 'row-1' })],
      'log-acc'
    )

    const ledgerRepository = createInMemoryLedgerRepository([
      buildLedgerEvent({
        registrationId: 'reg-acc',
        accreditationId: 'acc-1',
        payload: { summaryLogId: 'log-acc', creditTotal: 10 }
      }),
      buildLedgerEvent({
        registrationId: 'reg-only',
        accreditationId: null,
        payload: { summaryLogId: 'log-only', creditTotal: 0 }
      })
    ])()

    const wasteRecordsRepository = createInMemoryWasteRecordsRepository([
      committedRecord('org-1', 'reg-acc', 'row-1', 'log-acc')
    ])()

    const { reconciliations, census } = await runReconciliation({
      organisationsRepository: orgsRepository([org, orgWithoutRegistrations]),
      ledgerRepository,
      summaryLogRowStateSource: async () => summaryLogRowStateRepository,
      wasteRecordsRepository,
      overseasSitesRepository: sitesRepository([
        { id: 'site-1', validFrom: new Date('2026-01-01') }
      ])
    })

    expect(reconciliations).toHaveLength(2)
    expect(census).toMatchObject({
      totalLedgers: 2,
      ledgersWithCommittedSubmission: 2,
      ledgersCovered: 1,
      ledgersMissingSummaryLogRowStateData: 1,
      isEstateClean: false
    })
  })

  it('resolves the summary-log row state source once per registration ledger, in walk order', async () => {
    const org = {
      id: 'org-1',
      registrations: [
        { id: 'reg-a', accreditationId: 'acc-1', overseasSites: {} },
        { id: 'reg-b', overseasSites: {} }
      ],
      accreditations: [{ id: 'acc-1', status: REG_ACC_STATUS.APPROVED }]
    }

    const registrationsSeen = []
    const summaryLogRowStateSource = vi.fn(async ({ registration }) => {
      registrationsSeen.push(registration.id)
      return createInMemorySummaryLogRowStateRepository()()
    })

    await runReconciliation({
      organisationsRepository: orgsRepository([org]),
      ledgerRepository: createInMemoryLedgerRepository()(),
      summaryLogRowStateSource,
      wasteRecordsRepository: createInMemoryWasteRecordsRepository()(),
      overseasSitesRepository: sitesRepository([])
    })

    expect(summaryLogRowStateSource).toHaveBeenCalledTimes(2)
    expect(registrationsSeen).toEqual(['reg-a', 'reg-b'])
  })
})
