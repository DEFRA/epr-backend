import { generateWasteBalanceReport } from './waste-balance-report.js'
import { createInMemoryLedgerRepository } from '../repository/ledger-inmemory.js'
import { buildLedgerEvent } from '../repository/ledger-test-data.js'

const CUTOFF = new Date('2026-07-01T00:00:00.000Z')
const BEFORE_CUTOFF = new Date('2026-06-15T10:00:00.000Z')

/**
 * An organisation with one registration linked to one accreditation,
 * carrying only the fields the report reads. The accreditation link is
 * resolved through `registration.accreditationId` against
 * `org.accreditations`, as it is on repository `findAll` output.
 */
const orgWithAccreditation = ({
  id,
  orgId,
  registrationId,
  accreditationId,
  registrationNumber,
  accreditationNumber,
  material,
  wasteProcessingType,
  accreditationStatus = 'approved'
}) => ({
  id,
  orgId,
  registrations: [
    {
      id: registrationId,
      accreditationId,
      registrationNumber,
      material,
      wasteProcessingType
    }
  ],
  accreditations: [
    {
      id: accreditationId,
      status: accreditationStatus,
      accreditationNumber,
      material,
      wasteProcessingType
    }
  ]
})

const organisationsRepository = (orgs) => ({
  findAll: vi.fn().mockResolvedValue(orgs)
})

const seededLedger = async (events) => {
  const ledgerRepository = createInMemoryLedgerRepository()()
  for (const event of events) {
    await ledgerRepository.appendEvents([buildLedgerEvent(event)])
  }
  return ledgerRepository
}

describe('generateWasteBalanceReport', () => {
  it('sums balance and available balance per material and processing type', async () => {
    const orgs = [
      orgWithAccreditation({
        id: 'org-a',
        orgId: 500001,
        registrationId: 'reg-a',
        accreditationId: 'acc-a',
        registrationNumber: 'REG-A',
        accreditationNumber: 'ACC-A',
        material: 'plastic',
        wasteProcessingType: 'reprocessor'
      }),
      orgWithAccreditation({
        id: 'org-b',
        orgId: 500002,
        registrationId: 'reg-b',
        accreditationId: 'acc-b',
        registrationNumber: 'REG-B',
        accreditationNumber: 'ACC-B',
        material: 'plastic',
        wasteProcessingType: 'reprocessor'
      }),
      orgWithAccreditation({
        id: 'org-c',
        orgId: 500003,
        registrationId: 'reg-c',
        accreditationId: 'acc-c',
        registrationNumber: 'REG-C',
        accreditationNumber: 'ACC-C',
        material: 'plastic',
        wasteProcessingType: 'exporter'
      }),
      orgWithAccreditation({
        id: 'org-d',
        orgId: 500004,
        registrationId: 'reg-d',
        accreditationId: 'acc-d',
        registrationNumber: 'REG-D',
        accreditationNumber: 'ACC-D',
        material: 'glass',
        wasteProcessingType: 'reprocessor'
      })
    ]
    const ledgerRepository = await seededLedger([
      {
        organisationId: 'org-a',
        registrationId: 'reg-a',
        accreditationId: 'acc-a',
        number: 1,
        closingBalance: { amount: 700, availableAmount: 500 },
        createdAt: BEFORE_CUTOFF
      },
      {
        organisationId: 'org-b',
        registrationId: 'reg-b',
        accreditationId: 'acc-b',
        number: 1,
        closingBalance: { amount: 500, availableAmount: 400 },
        createdAt: BEFORE_CUTOFF
      },
      {
        organisationId: 'org-c',
        registrationId: 'reg-c',
        accreditationId: 'acc-c',
        number: 1,
        closingBalance: { amount: 400, availableAmount: 350 },
        createdAt: BEFORE_CUTOFF
      },
      {
        organisationId: 'org-d',
        registrationId: 'reg-d',
        accreditationId: 'acc-d',
        number: 1,
        closingBalance: { amount: 800, availableAmount: 700 },
        createdAt: BEFORE_CUTOFF
      }
    ])

    const report = await generateWasteBalanceReport(
      {
        organisationsRepository: organisationsRepository(orgs),
        ledgerRepository
      },
      CUTOFF
    )

    expect(report.totals).toHaveLength(3)
    expect(report.totals).toEqual(
      expect.arrayContaining([
        {
          material: 'plastic',
          wasteProcessingType: 'reprocessor',
          amount: 1200,
          availableAmount: 900
        },
        {
          material: 'plastic',
          wasteProcessingType: 'exporter',
          amount: 400,
          availableAmount: 350
        },
        {
          material: 'glass',
          wasteProcessingType: 'reprocessor',
          amount: 800,
          availableAmount: 700
        }
      ])
    )
    expect(report.accreditations).toHaveLength(4)
    expect(report.accreditations).toEqual(
      expect.arrayContaining([
        {
          orgId: '500001',
          registrationNumber: 'REG-A',
          accreditationNumber: 'ACC-A',
          material: 'plastic',
          wasteProcessingType: 'reprocessor',
          amount: 700,
          availableAmount: 500
        }
      ])
    )
  })

  it('sums fractional tonnages with exact decimal arithmetic', async () => {
    const orgs = [
      orgWithAccreditation({
        id: 'org-a',
        orgId: 500001,
        registrationId: 'reg-a',
        accreditationId: 'acc-a',
        registrationNumber: 'REG-A',
        accreditationNumber: 'ACC-A',
        material: 'steel',
        wasteProcessingType: 'reprocessor'
      }),
      orgWithAccreditation({
        id: 'org-b',
        orgId: 500002,
        registrationId: 'reg-b',
        accreditationId: 'acc-b',
        registrationNumber: 'REG-B',
        accreditationNumber: 'ACC-B',
        material: 'steel',
        wasteProcessingType: 'reprocessor'
      })
    ]
    const ledgerRepository = await seededLedger([
      {
        organisationId: 'org-a',
        registrationId: 'reg-a',
        accreditationId: 'acc-a',
        number: 1,
        closingBalance: { amount: 0.1, availableAmount: 0.1 },
        createdAt: BEFORE_CUTOFF
      },
      {
        organisationId: 'org-b',
        registrationId: 'reg-b',
        accreditationId: 'acc-b',
        number: 1,
        closingBalance: { amount: 0.2, availableAmount: 0.2 },
        createdAt: BEFORE_CUTOFF
      }
    ])

    const report = await generateWasteBalanceReport(
      {
        organisationsRepository: organisationsRepository(orgs),
        ledgerRepository
      },
      CUTOFF
    )

    expect(report.totals).toHaveLength(1)
    expect(report.totals[0].amount).toBe(0.3)
    expect(report.totals[0].availableAmount).toBe(0.3)
  })

  it('includes an accreditation with no ledger history before the cutoff at a zero balance', async () => {
    const orgs = [
      orgWithAccreditation({
        id: 'org-a',
        orgId: 500001,
        registrationId: 'reg-a',
        accreditationId: 'acc-a',
        registrationNumber: 'REG-A',
        accreditationNumber: 'ACC-A',
        material: 'wood',
        wasteProcessingType: 'exporter'
      })
    ]
    const ledgerRepository = await seededLedger([])

    const report = await generateWasteBalanceReport(
      {
        organisationsRepository: organisationsRepository(orgs),
        ledgerRepository
      },
      CUTOFF
    )

    expect(report.accreditations).toEqual([
      {
        orgId: '500001',
        registrationNumber: 'REG-A',
        accreditationNumber: 'ACC-A',
        material: 'wood',
        wasteProcessingType: 'exporter',
        amount: 0,
        availableAmount: 0
      }
    ])
    expect(report.totals).toEqual([
      {
        material: 'wood',
        wasteProcessingType: 'exporter',
        amount: 0,
        availableAmount: 0
      }
    ])
  })

  it('takes the balance from the last event before the cutoff, however old, ignoring later events', async () => {
    const orgs = [
      orgWithAccreditation({
        id: 'org-a',
        orgId: 500001,
        registrationId: 'reg-a',
        accreditationId: 'acc-a',
        registrationNumber: 'REG-A',
        accreditationNumber: 'ACC-A',
        material: 'paper',
        wasteProcessingType: 'reprocessor'
      })
    ]
    const ledgerRepository = await seededLedger([
      {
        organisationId: 'org-a',
        registrationId: 'reg-a',
        accreditationId: 'acc-a',
        number: 1,
        closingBalance: { amount: 75, availableAmount: 60 },
        createdAt: new Date('2026-02-14T10:00:00.000Z')
      },
      {
        organisationId: 'org-a',
        registrationId: 'reg-a',
        accreditationId: 'acc-a',
        number: 2,
        closingBalance: { amount: 999, availableAmount: 999 },
        createdAt: new Date('2026-07-08T10:00:00.000Z')
      }
    ])

    const report = await generateWasteBalanceReport(
      {
        organisationsRepository: organisationsRepository(orgs),
        ledgerRepository
      },
      CUTOFF
    )

    expect(report.accreditations).toHaveLength(1)
    expect(report.accreditations[0].amount).toBe(75)
    expect(report.accreditations[0].availableAmount).toBe(60)
  })

  it('includes suspended accreditations and excludes created, rejected and cancelled ones', async () => {
    const orgs = [
      orgWithAccreditation({
        id: 'org-suspended',
        orgId: 500001,
        registrationId: 'reg-s',
        accreditationId: 'acc-s',
        registrationNumber: 'REG-S',
        accreditationNumber: 'ACC-S',
        material: 'aluminium',
        wasteProcessingType: 'reprocessor',
        accreditationStatus: 'suspended'
      }),
      orgWithAccreditation({
        id: 'org-created',
        orgId: 500002,
        registrationId: 'reg-cr',
        accreditationId: 'acc-cr',
        registrationNumber: 'REG-CR',
        accreditationNumber: 'ACC-CR',
        material: 'fibre',
        wasteProcessingType: 'reprocessor',
        accreditationStatus: 'created'
      }),
      orgWithAccreditation({
        id: 'org-rejected',
        orgId: 500003,
        registrationId: 'reg-rj',
        accreditationId: 'acc-rj',
        registrationNumber: 'REG-RJ',
        accreditationNumber: 'ACC-RJ',
        material: 'fibre',
        wasteProcessingType: 'exporter',
        accreditationStatus: 'rejected'
      }),
      orgWithAccreditation({
        id: 'org-cancelled',
        orgId: 500004,
        registrationId: 'reg-cn',
        accreditationId: 'acc-cn',
        registrationNumber: 'REG-CN',
        accreditationNumber: 'ACC-CN',
        material: 'steel',
        wasteProcessingType: 'exporter',
        accreditationStatus: 'cancelled'
      })
    ]
    const ledgerRepository = await seededLedger([
      {
        organisationId: 'org-suspended',
        registrationId: 'reg-s',
        accreditationId: 'acc-s',
        number: 1,
        closingBalance: { amount: 50, availableAmount: 40 },
        createdAt: BEFORE_CUTOFF
      }
    ])

    const report = await generateWasteBalanceReport(
      {
        organisationsRepository: organisationsRepository(orgs),
        ledgerRepository
      },
      CUTOFF
    )

    expect(report.accreditations).toEqual([
      {
        orgId: '500001',
        registrationNumber: 'REG-S',
        accreditationNumber: 'ACC-S',
        material: 'aluminium',
        wasteProcessingType: 'reprocessor',
        amount: 50,
        availableAmount: 40
      }
    ])
    expect(report.totals).toHaveLength(1)
  })

  it('excludes registered-only registrations with no linked accreditation', async () => {
    const orgs = [
      {
        id: 'org-a',
        orgId: 500001,
        registrations: [
          {
            id: 'reg-a',
            registrationNumber: 'REG-A',
            material: 'glass',
            wasteProcessingType: 'reprocessor'
          }
        ],
        accreditations: []
      }
    ]
    const ledgerRepository = await seededLedger([
      {
        organisationId: 'org-a',
        registrationId: 'reg-a',
        accreditationId: null,
        number: 1,
        closingBalance: { amount: 123, availableAmount: 123 },
        createdAt: BEFORE_CUTOFF
      }
    ])

    const report = await generateWasteBalanceReport(
      {
        organisationsRepository: organisationsRepository(orgs),
        ledgerRepository
      },
      CUTOFF
    )

    expect(report.accreditations).toEqual([])
    expect(report.totals).toEqual([])
  })

  it('excludes test organisations', async () => {
    // 999999 is set as a test organisation via process.env.TEST_ORGANISATIONS
    const orgs = [
      orgWithAccreditation({
        id: 'org-test',
        orgId: 999999,
        registrationId: 'reg-t',
        accreditationId: 'acc-t',
        registrationNumber: 'REG-T',
        accreditationNumber: 'ACC-T',
        material: 'plastic',
        wasteProcessingType: 'reprocessor'
      })
    ]
    const ledgerRepository = await seededLedger([
      {
        organisationId: 'org-test',
        registrationId: 'reg-t',
        accreditationId: 'acc-t',
        number: 1,
        closingBalance: { amount: 1000, availableAmount: 1000 },
        createdAt: BEFORE_CUTOFF
      }
    ])

    const report = await generateWasteBalanceReport(
      {
        organisationsRepository: organisationsRepository(orgs),
        ledgerRepository
      },
      CUTOFF
    )

    expect(report.accreditations).toEqual([])
    expect(report.totals).toEqual([])
  })
})
