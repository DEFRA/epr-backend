import { auditOrganisationsDiscovery } from './organisations-discovery.js'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { logger } from '#common/helpers/logging/logger.js'
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest'
import { randomBytes } from 'crypto'

const mockAudit = vi.fn()

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

describe('auditOrganisationsDiscovery', () => {
  const now = new Date('2026-01-06T15:47:00.000Z')

  let systemLogsRepository

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
    systemLogsRepository = createSystemLogsRepository()(logger)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  const createMockRequest = () =>
    /** @type {import('#common/hapi-types.js').HapiRequest & { systemLogsRepository: import('#repositories/system-logs/port.js').SystemLogsRepository }} */ ({
      systemLogsRepository,
      auth: {
        credentials: {
          id: 'contact-123',
          email: 'user@example.com',
          scope: ['some-scope']
        }
      }
    })

  const findStoredLog = async () => {
    const { systemLogs } = await systemLogsRepository.find({ limit: 10 })
    return systemLogs[0]
  }

  const expectedEvent = {
    category: 'identity',
    subCategory: 'defra-id-reconciliation',
    action: 'organisations-discovered'
  }

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

  it('records a linked org with full context in the system log', async () => {
    const request = createMockRequest()
    await auditOrganisationsDiscovery(request, baseParams)

    const storedLog = await findStoredLog()
    expect(storedLog.event).toEqual(expectedEvent)
    expect(storedLog.createdAt).toEqual(now)
    expect(storedLog.createdBy).toEqual({
      id: 'contact-123',
      email: 'user@example.com',
      scope: request.auth.credentials.scope
    })
    expect(storedLog.context).toEqual({
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
    })
  })

  it('records null linked and maps linkable orgs with status when no linked org exists', async () => {
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

    const storedLog = await findStoredLog()
    expect(storedLog.context).toEqual({
      organisationId: null,
      defraIdOrg: baseParams.defraIdOrg,
      defraIdRelationships,
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

  it('records null linked and empty unlinked when there are no EPR organisations', async () => {
    await auditOrganisationsDiscovery(createMockRequest(), {
      ...baseParams,
      linkedOrg: null,
      linkableOrgs: []
    })

    const storedLog = await findStoredLog()
    expect(storedLog.context).toEqual({
      organisationId: null,
      defraIdOrg: baseParams.defraIdOrg,
      defraIdRelationships,
      linked: null,
      unlinked: []
    })
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

    const request = createMockRequest()

    await auditOrganisationsDiscovery(request, oversizedParams)

    // CDP audit receives stripped payload (event + user only)
    expect(mockAudit).toHaveBeenCalledWith({
      event: expectedEvent,
      user: {
        id: 'contact-123',
        email: 'user@example.com',
        scope: request.auth.credentials.scope
      }
    })

    // System log always gets full context
    const storedLog = await findStoredLog()
    expect(storedLog.context).toEqual({
      organisationId: 'epr-org-1',
      defraIdOrg: baseParams.defraIdOrg,
      defraIdRelationships: oversizedParams.defraIdRelationships,
      linked: {
        id: 'epr-org-1',
        name: 'Linked Ltd',
        orgId: 1001,
        status: 'approved',
        linkedBy: { email: 'linker@example.com', id: 'linker-id' },
        linkedAt: '2026-01-01T00:00:00.000Z'
      },
      unlinked: []
    })
  })
})
