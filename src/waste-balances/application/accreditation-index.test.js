import { describe, it, expect, vi } from 'vitest'

vi.mock('#common/helpers/parse-test-organisations.js', () => ({
  TEST_ORGANISATION_IDS: new Set([999])
}))

const { accreditationKey, indexReadModelAccreditations } =
  await import('./accreditation-index.js')

const reprocessorAccreditation = {
  accreditationNumber: 'ACC-R-1',
  prnIssuance: { tonnageBand: 'up_to_500' },
  status: { current: 'approved', timeline: [] }
}
const exporterAccreditation = {
  accreditationNumber: 'ACC-E-1',
  prnIssuance: { tonnageBand: 'up_to_500' },
  overseasSites: {},
  status: { current: 'approved', timeline: [] }
}

const buildOrganisation = (organisationNumber, registrations) =>
  /** @type {any} */ ({ organisationNumber, registrations })

const reprocessorRegistration = (accreditations) => ({
  wasteProcessingType: 'reprocessor',
  accreditations
})
const exporterRegistration = (accreditations) => ({
  wasteProcessingType: 'exporter',
  accreditations
})

describe('indexReadModelAccreditations', () => {
  it('indexes a reprocessor accreditation by its three numbers', () => {
    const registration = reprocessorRegistration({
      2026: reprocessorAccreditation
    })
    const organisation = buildOrganisation(500, { 'REG-1': registration })

    const { index } = indexReadModelAccreditations([organisation])

    const key = accreditationKey({
      organisationNumber: /** @type {any} */ (500),
      registrationNumber: /** @type {any} */ ('REG-1'),
      accreditationNumber: /** @type {any} */ ('ACC-R-1')
    })
    expect(key).toBe('500/REG-1/ACC-R-1')
    expect(index.get(key)).toEqual({
      organisation,
      registrationNumber: 'REG-1',
      registration,
      accreditation: reprocessorAccreditation,
      year: '2026'
    })
  })

  it('indexes an exporter accreditation', () => {
    const registration = exporterRegistration({ 2025: exporterAccreditation })
    const organisation = buildOrganisation(501, { 'REG-2': registration })

    const { index } = indexReadModelAccreditations([organisation])

    expect(index.get('501/REG-2/ACC-E-1')).toMatchObject({
      registration,
      accreditation: exporterAccreditation,
      year: '2025'
    })
  })

  it('indexes each year of a registration separately', () => {
    const second = {
      ...reprocessorAccreditation,
      accreditationNumber: 'ACC-R-2'
    }
    const organisation = buildOrganisation(500, {
      'REG-1': reprocessorRegistration({
        2025: reprocessorAccreditation,
        2026: second
      })
    })

    const { index } = indexReadModelAccreditations([organisation])

    expect(index.get('500/REG-1/ACC-R-1')?.year).toBe('2025')
    expect(index.get('500/REG-1/ACC-R-2')?.year).toBe('2026')
  })

  it('contributes nothing for a registered-only registration', () => {
    const organisation = buildOrganisation(500, {
      'REG-1': reprocessorRegistration({})
    })

    expect(indexReadModelAccreditations([organisation]).index.size).toBe(0)
  })

  describe('test organisations', () => {
    const testOrganisation = buildOrganisation(999, {
      'REG-T1': reprocessorRegistration({ 2026: reprocessorAccreditation }),
      'REG-T2': exporterRegistration({ 2026: exporterAccreditation })
    })
    const otherTestOrganisation = buildOrganisation(999, {
      'REG-T3': reprocessorRegistration({
        2026: { ...reprocessorAccreditation, accreditationNumber: 'ACC-T3' }
      })
    })

    it('excludes them from the index', () => {
      const { index } = indexReadModelAccreditations([
        testOrganisation,
        otherTestOrganisation
      ])

      expect(index.size).toBe(0)
    })

    it('indexes them when includeTestOrganisations is set', () => {
      const { index } = indexReadModelAccreditations([testOrganisation], {
        includeTestOrganisations: true
      })

      expect([...index.keys()].sort()).toEqual([
        '999/REG-T1/ACC-R-1',
        '999/REG-T2/ACC-E-1'
      ])
    })
  })
})
