import { sendEmail } from './notify.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES,
  AUDIT_EVENT_CATEGORIES,
  AUDIT_EVENT_ACTIONS
} from '../enums/event.js'

const mockSendEmail = vi.fn()
const mockLoggerError = vi.fn()
const mockLoggerWarn = vi.fn()
const mockAudit = vi.fn()

vi.mock('notifications-node-client', () => ({
  NotifyClient: vi.fn(function () {
    return { sendEmail: mockSendEmail }
  })
}))

vi.mock('./logging/logger.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    logger: {
      info: vi.fn(),
      error: (...args) => mockLoggerError(...args),
      warn: (...args) => mockLoggerWarn(...args)
    }
  }
})

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

vi.mock('./get-local-secret.js')

vi.mock('#root/config.js', () => ({
  config: {
    get: vi.fn((key) => {
      const values = {
        isDevelopment: false,
        'govukNotify.apiKey': 'dummy-key',
        log: {
          isEnabled: true,
          level: 'info',
          format: 'pino-pretty',
          redact: []
        },
        serviceName: 'test-service',
        serviceVersion: '1.0.0',
        cdpEnvironment: 'test'
      }
      return values[key]
    })
  }
}))

describe('sendEmail', () => {
  const templateId = 'template-id'
  const emailAddress = 'testing@example.com'
  const personalisation = { name: 'Test' }

  beforeEach(() => {
    mockSendEmail.mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('calls notifyClient.sendEmail with correct arguments', async () => {
    await sendEmail(templateId, emailAddress, personalisation)
    expect(mockSendEmail).toHaveBeenCalledWith(templateId, emailAddress, {
      personalisation
    })
  })

  it('calls notifyClient.sendEmail with empty personalisation if not provided', async () => {
    await sendEmail(templateId, emailAddress)
    expect(mockSendEmail).toHaveBeenCalledWith(templateId, emailAddress, {
      personalisation: {}
    })
  })

  it('calls audit when notifyClient.sendEmail succeeds', async () => {
    const emailFirstFourChars = emailAddress.slice(0, 4)
    const emailLastFourChars = emailAddress.slice(-4)
    await sendEmail(templateId, emailAddress)

    expect(mockAudit).toHaveBeenCalledWith({
      event: {
        category: AUDIT_EVENT_CATEGORIES.EMAIL,
        action: AUDIT_EVENT_ACTIONS.EMAIL_SENT
      },
      context: {
        templateId,
        emailAddress: expect.stringMatching(
          new RegExp(`^${emailFirstFourChars}[*@]+${emailLastFourChars}$`)
        ),
        personalisation: expect.any(Object)
      }
    })
  })

  it('throws and logs error if notifyClient.sendEmail rejects', async () => {
    const error = new Error('fail')
    mockSendEmail.mockRejectedValueOnce(error)

    await expect(
      sendEmail(templateId, emailAddress, personalisation)
    ).rejects.toThrow('fail')
    expect(mockLoggerError).toHaveBeenCalledWith({
      error,
      message: expect.any(String),
      event: {
        category: LOGGING_EVENT_CATEGORIES.HTTP,
        action: LOGGING_EVENT_ACTIONS.SEND_EMAIL_FAILURE
      }
    })
  })
})

describe('sendEmail in development mode', () => {
  const templateId = 'template-id'
  const emailAddress = 'testing@example.com'
  const personalisation = { name: 'Test' }

  beforeEach(() => {
    vi.resetModules()
    mockSendEmail.mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.doUnmock('#root/config.js')
  })

  it('calls getLocalSecret with apiKeyPath config key', async () => {
    vi.doMock('#root/config.js', () => ({
      config: {
        get: vi.fn((key) => {
          const values = {
            isDevelopment: true,
            log: {
              isEnabled: true,
              level: 'info',
              format: 'pino-pretty',
              redact: []
            },
            serviceName: 'test-service',
            serviceVersion: '1.0.0',
            cdpEnvironment: 'test'
          }
          return values[key]
        })
      }
    }))

    const { sendEmail: sendEmailDev } = await import('./notify.js')
    const { getLocalSecret: getLocalSecretMock } =
      await import('./get-local-secret.js')

    await sendEmailDev(templateId, emailAddress, personalisation)
    expect(getLocalSecretMock).toHaveBeenCalledWith('govukNotify.apiKeyPath')
  })
})

describe('sendEmail with missing API key', () => {
  const templateId = 'template-id'
  const emailAddress = 'testing@example.com'

  beforeEach(() => {
    vi.resetModules()
    mockSendEmail.mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.doUnmock('#root/config.js')
  })

  it('calls logger.warn if apiKey is not set', async () => {
    vi.doMock('#root/config.js', () => ({
      config: {
        get: vi.fn((key) => {
          const values = {
            isDevelopment: false,
            'govukNotify.apiKey': null,
            log: {
              isEnabled: true,
              level: 'info',
              format: 'pino-pretty',
              redact: []
            },
            serviceName: 'test-service',
            serviceVersion: '1.0.0',
            cdpEnvironment: 'test'
          }
          return values[key]
        })
      }
    }))

    vi.doMock('./logging/logger.js', async (importOriginal) => {
      const actual = await importOriginal()
      return {
        ...actual,
        logger: {
          info: vi.fn(),
          error: vi.fn(),
          warn: (...args) => mockLoggerWarn(...args)
        }
      }
    })

    const { sendEmail: sendEmailNoKey } = await import('./notify.js')

    await sendEmailNoKey(templateId, emailAddress)
    expect(mockLoggerWarn).toHaveBeenCalledWith({
      message: expect.any(String),
      event: {
        category: LOGGING_EVENT_CATEGORIES.CONFIG,
        action: LOGGING_EVENT_ACTIONS.NOT_FOUND
      }
    })
  })
})
