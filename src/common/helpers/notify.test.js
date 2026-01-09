import { sendEmail } from './notify.js'
import { getLocalSecret } from './get-local-secret.js'
import { config } from '#root/config.js'
import { NotifyClient } from 'notifications-node-client'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES,
  AUDIT_EVENT_CATEGORIES,
  AUDIT_EVENT_ACTIONS
} from '../enums/event.js'

const mockSendEmail = vi.fn()

const mockLoggerInfo = vi.fn()
const mockLoggerError = vi.fn()
const mockLoggerWarn = vi.fn()
const mockAudit = vi.fn()

vi.mock('notifications-node-client', () => ({
  NotifyClient: vi.fn(function () {
    return { sendEmail: mockSendEmail }
  })
}))

vi.mock('./logging/logger.js', () => ({
  logger: {
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args),
    warn: (...args) => mockLoggerWarn(...args)
  }
}))

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

vi.mock('./get-local-secret.js')

vi.mock('#root/config.js', () => ({
  config: {
    get: vi.fn((key) => {
      if (key === 'govukNotifyApiKeyPath') {
        return 'dummy-key'
      }
      if (key === 'isDevelopment') {
        return false
      }
      return null
    })
  }
}))

describe('sendEmail', () => {
  const templateId = 'template-id'
  const emailAddress = 'testing@example.com'
  const personalisation = { name: 'Test' }

  beforeEach(() => {
    mockSendEmail.mockResolvedValue({})
    config.get.mockImplementation((key) => {
      if (key === 'govukNotifyApiKeyPath') return 'dummy-key'
      if (key === 'isDevelopment') return false
      return null
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('initialises NotifyClient with key from getLocalSecret in development', async () => {
    getLocalSecret.mockReturnValue('dev-secret-key')
    config.get.mockImplementation((key) => {
      if (key === 'isDevelopment') return true
      return null
    })
    await sendEmail(templateId, emailAddress, personalisation)
    expect(NotifyClient).toHaveBeenCalledWith('dev-secret-key')
  })

  it('initialises NotifyClient with key from config in production', async () => {
    config.get.mockImplementation((key) => {
      if (key === 'isDevelopment') return false
      if (key === 'govukNotifyApiKeyPath') return 'prod-config-key'
      return null
    })
    await sendEmail(templateId, emailAddress, personalisation)
    expect(NotifyClient).toHaveBeenCalledWith('prod-config-key')
  })

  it('calls logger.warn if apiKey is not set', async () => {
    config.get.mockImplementation((key) => {
      if (key === 'isDevelopment') return false
      return null
    })
    await sendEmail(templateId, emailAddress, personalisation)
    expect(mockLoggerWarn).toHaveBeenCalledWith({
      message: expect.any(String),
      event: {
        category: LOGGING_EVENT_CATEGORIES.CONFIG,
        action: LOGGING_EVENT_ACTIONS.NOT_FOUND
      }
    })
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
