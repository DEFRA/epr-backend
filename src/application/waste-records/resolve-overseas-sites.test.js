import { describe, it, expect, vi } from 'vitest'

import { resolveOverseasSites } from './resolve-overseas-sites.js'
import {
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import {
  createMockOrganisationsRepository,
  createMockOverseasSitesRepository
} from '#test/mock-repositories.js'

const ORGANISATION_NUMBER = toOrganisationNumber('500001')
const REGISTRATION_NUMBER = toRegistrationNumber('R25SR500010001')

/**
 * @param {unknown} overseasSites
 */
const organisationsRepositoryHolding = (overseasSites) =>
  createMockOrganisationsRepository({
    findByOrganisationNumber: vi.fn().mockResolvedValue({
      registrations: [
        { registrationNumber: 'R25SR500010002', overseasSites: {} },
        { registrationNumber: REGISTRATION_NUMBER, overseasSites }
      ]
    })
  })

describe('resolveOverseasSites', () => {
  it('returns resolved map keyed by zero-padded string OSR ID', async () => {
    const validFrom = new Date('2024-01-01')
    const organisationsRepository = organisationsRepositoryHolding({
      '001': { overseasSiteId: 'site-aaa' },
      '099': { overseasSiteId: 'site-bbb' }
    })
    const overseasSitesRepository = createMockOverseasSitesRepository({
      findByIds: vi.fn().mockResolvedValue([
        { id: 'site-aaa', validFrom },
        { id: 'site-bbb', validFrom: new Date('2024-06-01') }
      ])
    })

    const result = await resolveOverseasSites(
      organisationsRepository,
      overseasSitesRepository,
      ORGANISATION_NUMBER,
      REGISTRATION_NUMBER
    )

    expect(result).toEqual({
      '001': { validFrom },
      '099': { validFrom: new Date('2024-06-01') }
    })
    expect(
      organisationsRepository.findByOrganisationNumber
    ).toHaveBeenCalledWith(ORGANISATION_NUMBER)
    expect(overseasSitesRepository.findByIds).toHaveBeenCalledWith([
      'site-aaa',
      'site-bbb'
    ])
  })

  it('returns empty map when registration has no overseasSites', async () => {
    const organisationsRepository = organisationsRepositoryHolding(undefined)
    const overseasSitesRepository = createMockOverseasSitesRepository({
      findByIds: vi.fn()
    })

    const result = await resolveOverseasSites(
      organisationsRepository,
      overseasSitesRepository,
      ORGANISATION_NUMBER,
      REGISTRATION_NUMBER
    )

    expect(result).toEqual({})
    expect(overseasSitesRepository.findByIds).not.toHaveBeenCalled()
  })

  it('returns empty map when overseasSites map is empty', async () => {
    const organisationsRepository = organisationsRepositoryHolding({})
    const overseasSitesRepository = createMockOverseasSitesRepository({
      findByIds: vi.fn()
    })

    const result = await resolveOverseasSites(
      organisationsRepository,
      overseasSitesRepository,
      ORGANISATION_NUMBER,
      REGISTRATION_NUMBER
    )

    expect(result).toEqual({})
    expect(overseasSitesRepository.findByIds).not.toHaveBeenCalled()
  })

  it('throws when the organisation is not found', async () => {
    const organisationsRepository = createMockOrganisationsRepository({
      findByOrganisationNumber: vi.fn().mockResolvedValue(null)
    })
    const overseasSitesRepository = createMockOverseasSitesRepository({
      findByIds: vi.fn()
    })

    await expect(
      resolveOverseasSites(
        organisationsRepository,
        overseasSitesRepository,
        ORGANISATION_NUMBER,
        REGISTRATION_NUMBER
      )
    ).rejects.toThrow(
      `Registration not found: ${REGISTRATION_NUMBER} for organisation ${ORGANISATION_NUMBER}`
    )
  })

  it('throws when the organisation holds no registration with the number', async () => {
    const organisationsRepository = createMockOrganisationsRepository({
      findByOrganisationNumber: vi.fn().mockResolvedValue({
        registrations: [{ registrationNumber: 'R25SR500010002' }]
      })
    })
    const overseasSitesRepository = createMockOverseasSitesRepository({
      findByIds: vi.fn()
    })

    await expect(
      resolveOverseasSites(
        organisationsRepository,
        overseasSitesRepository,
        ORGANISATION_NUMBER,
        REGISTRATION_NUMBER
      )
    ).rejects.toThrow(
      `Registration not found: ${REGISTRATION_NUMBER} for organisation ${ORGANISATION_NUMBER}`
    )
  })

  it('omits the key when the referenced overseas site does not resolve', async () => {
    const organisationsRepository = organisationsRepositoryHolding({
      '001': { overseasSiteId: 'missing-site' }
    })
    const overseasSitesRepository = createMockOverseasSitesRepository({
      findByIds: vi.fn().mockResolvedValue([])
    })

    const result = await resolveOverseasSites(
      organisationsRepository,
      overseasSitesRepository,
      ORGANISATION_NUMBER,
      REGISTRATION_NUMBER
    )

    expect(result).toEqual({})
  })

  it('keeps the keys that do resolve when another does not', async () => {
    const organisationsRepository = organisationsRepositoryHolding({
      '001': { overseasSiteId: 'missing-site' },
      '002': { overseasSiteId: 'site-b' }
    })
    const validFrom = new Date('2026-01-01')
    const overseasSitesRepository = createMockOverseasSitesRepository({
      findByIds: vi.fn().mockResolvedValue([{ id: 'site-b', validFrom }])
    })

    const result = await resolveOverseasSites(
      organisationsRepository,
      overseasSitesRepository,
      ORGANISATION_NUMBER,
      REGISTRATION_NUMBER
    )

    expect(result).toEqual({ '002': { validFrom } })
  })

  it('sets validFrom to null when overseas site has no validFrom', async () => {
    const organisationsRepository = organisationsRepositoryHolding({
      '001': { overseasSiteId: 'site-no-date' }
    })
    const overseasSitesRepository = createMockOverseasSitesRepository({
      findByIds: vi
        .fn()
        .mockResolvedValue([{ id: 'site-no-date', validFrom: undefined }])
    })

    const result = await resolveOverseasSites(
      organisationsRepository,
      overseasSitesRepository,
      ORGANISATION_NUMBER,
      REGISTRATION_NUMBER
    )

    expect(result).toEqual({
      '001': { validFrom: null }
    })
  })
})
