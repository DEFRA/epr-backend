import { sendEmail } from './notify.js'
import { getLocalSecret } from './get-local-secret.js'

const mockSendEmail = jest.fn()

const mockLoggerInfo = jest.fn()
const mockLoggerError = jest.fn()
const mockLoggerWarn = jest.fn()

jest.mock('notifications-node-client', () => ({
  NotifyClient: jest.fn(() => ({ sendEmail: mockSendEmail }))
}))

jest.mock('./logging/logger.js', () => ({
  createLogger: () => ({
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args),
    warn: (...args) => mockLoggerWarn(...args)
  })
}))

jest.mock('./get-local-secret.js')

describe('sendEmail', () => {
  const templateId = 'template-id'
  const emailAddress = 'test@example.com'
  const personalisation = { name: 'Test' }
  const originalProcessEnv = { ...process.env }

  beforeEach(() => {
    jest.resetModules()
    process.env.GOVUK_NOTIFY_API_KEY = 'dummy-key'
    mockSendEmail.mockResolvedValue({})
  })

  afterEach(() => {
    jest.clearAllMocks()
    process.env = originalProcessEnv
  })

  it('calls notifyClient with apiKey from getLocalSecret in NODE_ENV=development', async () => {
    process.env.NODE_ENV = 'development'
    await sendEmail(templateId, emailAddress, personalisation)
    expect(getLocalSecret).toHaveBeenCalledWith('GOVUK_NOTIFY_API_KEY')
  })

  it('calls logger.warn if apiKey is not set', async () => {
    process.env.GOVUK_NOTIFY_API_KEY = undefined
    await sendEmail(templateId, emailAddress, personalisation)
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Missing GOVUK_NOTIFY_API_KEY in environment, notifyClient will not be available'
    )
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

  it('throws and logs error if notifyClient.sendEmail rejects', async () => {
    const error = new Error('fail')
    mockSendEmail.mockRejectedValueOnce(error)

    await expect(
      sendEmail(templateId, emailAddress, personalisation)
    ).rejects.toThrow('fail')
    expect(mockLoggerError).toHaveBeenCalledWith(error)
  })
})
