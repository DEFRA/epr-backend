import { describe, it, expect, vi, beforeEach } from 'vitest'

import { processImportFile } from './process-import-file.js'
import { SpreadsheetValidationError } from '#adapters/parsers/summary-logs/exceljs-parser.js'

vi.mock('#adapters/parsers/overseas-sites/ors-spreadsheet-parser.js')

const { parse } =
  await import('#adapters/parsers/overseas-sites/ors-spreadsheet-parser.js')

describe('processImportFile', () => {
  let overseasSitesRepository
  let organisationsRepository
  let logger

  beforeEach(() => {
    vi.clearAllMocks()

    overseasSitesRepository = {
      create: vi.fn()
    }

    organisationsRepository = {
      findByOrgId: vi.fn(),
      mergeRegistrationOverseasSites: vi.fn()
    }

    logger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }
  })

  const deps = () => ({
    overseasSitesRepository,
    organisationsRepository,
    logger
  })

  it('creates overseas site records and merges into registration', async () => {
    const buffer = Buffer.from('fake-spreadsheet')

    parse.mockResolvedValue({
      metadata: {
        orgId: 500001,
        registrationNumber: 'EPR/AB1234CD/R1',
        packagingWasteCategory: 'Plastic',
        accreditationNumber: 'ACC-001'
      },
      sites: [
        {
          orsId: '001',
          country: 'Germany',
          name: 'Test Site A',
          address: {
            line1: '123 Berlin St',
            line2: null,
            townOrCity: 'Berlin',
            stateOrRegion: null,
            postcode: '10115'
          },
          coordinates: null,
          validFrom: null,
          rowNumber: 10
        },
        {
          orsId: '002',
          country: 'France',
          name: 'Test Site B',
          address: {
            line1: '456 Paris Ave',
            line2: 'Suite 2',
            townOrCity: 'Paris',
            stateOrRegion: 'Ile-de-France',
            postcode: '75001'
          },
          coordinates: '48.8566,2.3522',
          validFrom: '2025-01-01',
          rowNumber: 11
        }
      ],
      errors: []
    })

    const org = {
      id: 'org-mongo-id-123',
      orgId: 500001,
      version: 5,
      registrations: [
        {
          id: 'reg-id-abc',
          registrationNumber: 'EPR/AB1234CD/R1',
          wasteProcessingType: 'exporter',
          overseasSites: {}
        }
      ]
    }
    organisationsRepository.findByOrgId.mockResolvedValue(org)

    overseasSitesRepository.create
      .mockResolvedValueOnce({ id: 'site-id-aaa' })
      .mockResolvedValueOnce({ id: 'site-id-bbb' })

    organisationsRepository.mergeRegistrationOverseasSites.mockResolvedValue(
      true
    )

    const result = await processImportFile(buffer, deps())

    expect(result).toEqual({
      status: 'success',
      sitesCreated: 2,
      mappingsUpdated: 2,
      registrationNumber: 'EPR/AB1234CD/R1',
      errors: []
    })

    expect(overseasSitesRepository.create).toHaveBeenCalledTimes(2)

    // First site
    const firstCall = overseasSitesRepository.create.mock.calls[0][0]
    expect(firstCall.name).toBe('Test Site A')
    expect(firstCall.country).toBe('Germany')
    expect(firstCall.address.line1).toBe('123 Berlin St')

    // Second site
    const secondCall = overseasSitesRepository.create.mock.calls[1][0]
    expect(secondCall.name).toBe('Test Site B')
    expect(secondCall.country).toBe('France')

    expect(
      organisationsRepository.mergeRegistrationOverseasSites
    ).toHaveBeenCalledWith('org-mongo-id-123', 5, 'reg-id-abc', {
      '001': { overseasSiteId: 'site-id-aaa' },
      '002': { overseasSiteId: 'site-id-bbb' }
    })
  })

  it('returns failure when spreadsheet has parse errors', async () => {
    const buffer = Buffer.from('bad-spreadsheet')

    parse.mockResolvedValue({
      metadata: {
        orgId: 500001,
        registrationNumber: 'EPR/AB1234CD/R1',
        packagingWasteCategory: 'Plastic',
        accreditationNumber: null
      },
      sites: [],
      errors: [
        { rowNumber: 10, field: 'name', message: '"name" is required' },
        {
          rowNumber: 11,
          field: 'address.line1',
          message: '"address.line1" is required'
        }
      ]
    })

    const result = await processImportFile(buffer, deps())

    expect(result.status).toBe('failure')
    expect(result.sitesCreated).toBe(0)
    expect(result.mappingsUpdated).toBe(0)
    expect(result.errors).toHaveLength(2)
    expect(result.registrationNumber).toBe('EPR/AB1234CD/R1')

    expect(organisationsRepository.findByOrgId).not.toHaveBeenCalled()
    expect(overseasSitesRepository.create).not.toHaveBeenCalled()
  })

  it('rethrows non-SpreadsheetValidationError exceptions', async () => {
    const buffer = Buffer.from('corrupt')

    parse.mockRejectedValue(new Error('ExcelJS internal error'))

    await expect(processImportFile(buffer, deps())).rejects.toThrow(
      'ExcelJS internal error'
    )
  })

  it('returns failure when spreadsheet structure is invalid', async () => {
    const buffer = Buffer.from('no-worksheet')

    parse.mockRejectedValue(
      new SpreadsheetValidationError("Missing required 'ORS ID Log' worksheet")
    )

    const result = await processImportFile(buffer, deps())

    expect(result.status).toBe('failure')
    expect(result.sitesCreated).toBe(0)
    expect(result.errors).toEqual([
      {
        field: 'file',
        message: "Missing required 'ORS ID Log' worksheet"
      }
    ])
  })

  it('returns failure when organisation is not found', async () => {
    const buffer = Buffer.from('spreadsheet')

    parse.mockResolvedValue({
      metadata: {
        orgId: 999999,
        registrationNumber: 'EPR/XX0000XX/R1',
        packagingWasteCategory: null,
        accreditationNumber: null
      },
      sites: [
        {
          orsId: '001',
          country: 'Germany',
          name: 'Test Site',
          address: {
            line1: '1 Test St',
            line2: null,
            townOrCity: 'Berlin',
            stateOrRegion: null,
            postcode: null
          },
          coordinates: null,
          validFrom: null,
          rowNumber: 10
        }
      ],
      errors: []
    })

    organisationsRepository.findByOrgId.mockResolvedValue(null)

    const result = await processImportFile(buffer, deps())

    expect(result.status).toBe('failure')
    expect(result.errors).toEqual([
      {
        field: 'orgId',
        message: 'Organisation with orgId 999999 not found'
      }
    ])
    expect(overseasSitesRepository.create).not.toHaveBeenCalled()
  })

  it('returns failure when registration is not found in organisation', async () => {
    const buffer = Buffer.from('spreadsheet')

    parse.mockResolvedValue({
      metadata: {
        orgId: 500001,
        registrationNumber: 'EPR/NOMATCH/R1',
        packagingWasteCategory: null,
        accreditationNumber: null
      },
      sites: [
        {
          orsId: '001',
          country: 'Germany',
          name: 'Test Site',
          address: {
            line1: '1 Test St',
            line2: null,
            townOrCity: 'Berlin',
            stateOrRegion: null,
            postcode: null
          },
          coordinates: null,
          validFrom: null,
          rowNumber: 10
        }
      ],
      errors: []
    })

    organisationsRepository.findByOrgId.mockResolvedValue({
      id: 'org-mongo-id-123',
      orgId: 500001,
      version: 3,
      registrations: [
        {
          id: 'reg-id-abc',
          registrationNumber: 'EPR/AB1234CD/R1',
          wasteProcessingType: 'exporter'
        }
      ]
    })

    const result = await processImportFile(buffer, deps())

    expect(result.status).toBe('failure')
    expect(result.errors).toEqual([
      {
        field: 'registrationNumber',
        message: 'Registration EPR/NOMATCH/R1 not found in organisation 500001'
      }
    ])
    expect(overseasSitesRepository.create).not.toHaveBeenCalled()
  })

  it('parses validFrom dates when creating site records', async () => {
    const buffer = Buffer.from('spreadsheet')

    parse.mockResolvedValue({
      metadata: {
        orgId: 500001,
        registrationNumber: 'EPR/AB1234CD/R1',
        packagingWasteCategory: null,
        accreditationNumber: null
      },
      sites: [
        {
          orsId: '001',
          country: 'Germany',
          name: 'Test Site',
          address: {
            line1: '1 Test St',
            line2: null,
            townOrCity: 'Berlin',
            stateOrRegion: null,
            postcode: null
          },
          coordinates: null,
          validFrom: '2025-06-15',
          rowNumber: 10
        }
      ],
      errors: []
    })

    organisationsRepository.findByOrgId.mockResolvedValue({
      id: 'org-id',
      orgId: 500001,
      version: 1,
      registrations: [
        {
          id: 'reg-id',
          registrationNumber: 'EPR/AB1234CD/R1',
          wasteProcessingType: 'exporter'
        }
      ]
    })

    overseasSitesRepository.create.mockResolvedValue({ id: 'site-id' })
    organisationsRepository.mergeRegistrationOverseasSites.mockResolvedValue(
      true
    )

    await processImportFile(buffer, deps())

    const createArg = overseasSitesRepository.create.mock.calls[0][0]
    expect(createArg.validFrom).toBeInstanceOf(Date)
    expect(createArg.validFrom.toISOString()).toContain('2025-06-15')
  })

  it('returns failure when mergeRegistrationOverseasSites has version conflict', async () => {
    const buffer = Buffer.from('spreadsheet')

    parse.mockResolvedValue({
      metadata: {
        orgId: 500001,
        registrationNumber: 'EPR/AB1234CD/R1',
        packagingWasteCategory: null,
        accreditationNumber: null
      },
      sites: [
        {
          orsId: '001',
          country: 'Germany',
          name: 'Test Site',
          address: {
            line1: '1 Test St',
            line2: null,
            townOrCity: 'Berlin',
            stateOrRegion: null,
            postcode: null
          },
          coordinates: null,
          validFrom: null,
          rowNumber: 10
        }
      ],
      errors: []
    })

    organisationsRepository.findByOrgId.mockResolvedValue({
      id: 'org-id',
      orgId: 500001,
      version: 1,
      registrations: [
        {
          id: 'reg-id',
          registrationNumber: 'EPR/AB1234CD/R1',
          wasteProcessingType: 'exporter'
        }
      ]
    })

    overseasSitesRepository.create.mockResolvedValue({ id: 'site-id' })
    organisationsRepository.mergeRegistrationOverseasSites.mockResolvedValue(
      false
    )

    const result = await processImportFile(buffer, deps())

    expect(result.status).toBe('failure')
    expect(result.errors[0].message).toContain('version conflict')
  })

  it('sets null validFrom when not provided', async () => {
    const buffer = Buffer.from('spreadsheet')

    parse.mockResolvedValue({
      metadata: {
        orgId: 500001,
        registrationNumber: 'EPR/AB1234CD/R1',
        packagingWasteCategory: null,
        accreditationNumber: null
      },
      sites: [
        {
          orsId: '001',
          country: 'Germany',
          name: 'Test Site',
          address: {
            line1: '1 Test St',
            line2: null,
            townOrCity: 'Berlin',
            stateOrRegion: null,
            postcode: null
          },
          coordinates: null,
          validFrom: null,
          rowNumber: 10
        }
      ],
      errors: []
    })

    organisationsRepository.findByOrgId.mockResolvedValue({
      id: 'org-id',
      orgId: 500001,
      version: 1,
      registrations: [
        {
          id: 'reg-id',
          registrationNumber: 'EPR/AB1234CD/R1',
          wasteProcessingType: 'exporter'
        }
      ]
    })

    overseasSitesRepository.create.mockResolvedValue({ id: 'site-id' })
    organisationsRepository.mergeRegistrationOverseasSites.mockResolvedValue(
      true
    )

    await processImportFile(buffer, deps())

    const createArg = overseasSitesRepository.create.mock.calls[0][0]
    expect(createArg.validFrom).toBeNull()
  })
})
