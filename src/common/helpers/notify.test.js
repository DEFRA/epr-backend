import { sendEmail } from './notify.js'
import { getLocalSecret } from './get-local-secret.js'
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
  NotifyClient: vi.fn(() => ({ sendEmail: mockSendEmail }))
}))

vi.mock('./logging/logger.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    logger: {
      info: (...args) => mockLoggerInfo(...args),
      error: (...args) => mockLoggerError(...args),
      warn: (...args) => mockLoggerWarn(...args)
    }
  }
})

vi.mock('@defra/cdp-auditing', () => ({
  audit: (...args) => mockAudit(...args)
}))

vi.mock('./get-local-secret.js')

describe('sendEmail', () => {
  const templateId = 'template-id'
  const emailAddress = 'testing@example.com'
  const personalisation = { name: 'Test' }

  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('GOVUK_NOTIFY_API_KEY', 'dummy-key')
    mockSendEmail.mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  it('calls notifyClient with apiKey from getLocalSecret in NODE_ENV=development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    await sendEmail(templateId, emailAddress, personalisation)
    expect(getLocalSecret).toHaveBeenCalledWith('GOVUK_NOTIFY_API_KEY')
  })

  it('calls logger.warn if apiKey is not set', async () => {
    vi.stubEnv('GOVUK_NOTIFY_API_KEY', undefined)
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
      error: {
        message: error.message,
        stack_trace: error.stack,
        type: error.name
      },
      message: expect.any(String),
      event: {
        category: LOGGING_EVENT_CATEGORIES.HTTP,
        action: LOGGING_EVENT_ACTIONS.SEND_EMAIL_FAILURE
      }
    })
  })
})
