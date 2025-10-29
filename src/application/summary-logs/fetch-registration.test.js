import { fetchRegistration } from './fetch-registration.js'

const mockLoggerInfo = vi.fn()

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: (...args) => mockLoggerInfo(...args)
  }
}))

describe('fetchRegistration', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns registration when found', async () => {
    const mockOrganisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue({
        id: 'reg-123',
        wasteRegistrationNumber: 'WRN12345'
      })
    }

    const result = await fetchRegistration({
      organisationsRepository: mockOrganisationsRepository,
      organisationId: 'org-123',
      registrationId: 'reg-123',
      loggingContext: 'test-context'
    })

    expect(result).toBeDefined()
    expect(result.id).toBe('reg-123')
    expect(result.wasteRegistrationNumber).toBe('WRN12345')
  })

  it('throws error when registration not found', async () => {
    const mockOrganisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue(null)
    }

    await expect(
      fetchRegistration({
        organisationsRepository: mockOrganisationsRepository,
        organisationId: 'org-123',
        registrationId: 'reg-123',
        loggingContext: 'test-context'
      })
    ).rejects.toThrow(
      'Registration not found: organisationId=org-123, registrationId=reg-123'
    )
  })
})
