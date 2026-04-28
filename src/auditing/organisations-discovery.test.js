import { auditOrganisationsDiscovery } from './organisations-discovery.js'
import { vi, describe, it, beforeEach, afterEach } from 'vitest'
import { randomBytes } from 'crypto'

const mockAudit = vi.fn()
const mockInsert = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

describe('auditOrganisationsDiscovery', () => {
  const now = new Date('2026-01-06T15:47:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  const createMockRequest = () => ({
    systemLogsRepository: { insert: mockInsert },
    auth: {
      credentials: {
        id: 'contact-123',
        email: 'user@example.com',
        scope: ['inquirer']
      }
    }
  })

  /** @type {import('#domain/organisations/model.js').Organisation} */
  const linkedOrg = /** @type {any} */ ({
    id: 'epr-org-1',
    orgId: 1001,
    status: 'approved',
    companyDetails: { name: 'Linked Ltd' },
    linkedDefraOrganisation: {
      orgId: 'defra-org-1',
      orgName: 'Linked Ltd',
      linkedBy: { email: 'linker@example.com', id: 'linker-id' },
      linkedAt: '2026-01-01T00:00:00.000Z'
    }
  })

  const defraIdRelationships = [
    {
      defraIdOrgId: 'defra-org-1',
      defraIdOrgName: 'Test Org',
      isCurrent: true
    }
  ]

  const baseParams = {
    defraIdOrg: { id: 'defra-org-1', name: 'Test Org' },
    defraIdRelationships,
    linkedOrg,
    linkableOrgs: /** @type {any[]} */ ([])
  }

  it('maps a linked org into the audit context', async () => {
    await auditOrganisationsDiscovery(createMockRequest(), baseParams)

    const expectedContext = {
      organisationId: 'epr-org-1',
      defraIdOrg: baseParams.defraIdOrg,
      defraIdRelationships,
      linked: {
        id: 'epr-org-1',
        name: 'Linked Ltd',
        orgId: 1001,
        status: 'approved',
        linkedBy: { email: 'linker@example.com', id: 'linker-id' },
        linkedAt: '2026-01-01T00:00:00.000Z'
      },
      unlinked: []
    }

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        event: {
          category: 'identity',
          subCategory: 'defra-id-reconciliation',
          action: 'organisations-discovered'
        },
        context: expectedContext,
        createdBy: {
          id: 'contact-123',
          email: 'user@example.com',
          scope: ['inquirer']
        }
      })
    )
  })

  it('sets linked to null and maps linkable orgs with status when no linked org exists', async () => {
    /** @type {any[]} */
    const linkableOrgs = [
      {
        id: 'epr-org-2',
        orgId: 2002,
        status: 'approved',
        companyDetails: { name: 'Unlinked Corp' }
      }
    ]

    await auditOrganisationsDiscovery(createMockRequest(), {
      ...baseParams,
      linkedOrg: null,
      linkableOrgs
    })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          organisationId: null,
          linked: null,
          unlinked: [
            {
              id: 'epr-org-2',
              name: 'Unlinked Corp',
              orgId: 2002,
              status: 'approved'
            }
          ]
        })
      })
    )
  })

  it('sets linked and unlinked to null/empty when there are no EPR organisations', async () => {
    await auditOrganisationsDiscovery(createMockRequest(), {
      ...baseParams,
      linkedOrg: null,
      linkableOrgs: []
    })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          organisationId: null,
          linked: null,
          unlinked: []
        })
      })
    )
  })

  it('sends full context to CDP audit for normal-sized payloads', async () => {
    await auditOrganisationsDiscovery(createMockRequest(), baseParams)

    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          organisationId: 'epr-org-1'
        })
      })
    )
  })

  it('strips context from CDP audit for oversized payloads but keeps full context in system log', async () => {
    const oversizedParams = {
      ...baseParams,
      defraIdRelationships: Array.from({ length: 500 }, (_, i) => ({
        defraIdOrgId: `org-${i}`,
        defraIdOrgName: randomBytes(5000).toString('hex'),
        isCurrent: i === 0
      }))
    }

    await auditOrganisationsDiscovery(createMockRequest(), oversizedParams)

    // CDP audit receives stripped payload (event + user only)
    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: 'identity',
        subCategory: 'defra-id-reconciliation',
        action: 'organisations-discovered'
      },
      user: {
        id: 'contact-123',
        email: 'user@example.com',
        scope: ['inquirer']
      }
    })

    // System log always gets full context
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          defraIdRelationships: oversizedParams.defraIdRelationships
        })
      })
    )
  })
})
