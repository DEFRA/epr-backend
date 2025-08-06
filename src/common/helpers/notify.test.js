const mockSendEmail = jest.fn()

const mockLoggerInfo = jest.fn()
const mockLoggerError = jest.fn()
const mockLoggerWarn = jest.fn()

jest.mock('notifications-node-client', () => {
  return {
    NotifyClient: jest
      .fn()
      .mockImplementation(() => ({ sendEmail: mockSendEmail }))
  }
})
jest.mock('mongodb', () => ({
  connect: jest.fn().mockResolvedValue(),
  disconnect: jest.fn().mockResolvedValue(),
  connection: { on: jest.fn() }
}))

jest.mock('./logging/logger.js', () => ({
  createLogger: () => ({
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args),
    warn: (...args) => mockLoggerWarn(...args)
  })
}))

describe('sendEmail', () => {
  const templateId = 'template-id'
  const emailAddress = 'test@example.com'
  const personalisation = { name: 'Test' }

  let sendEmail

  beforeEach(() => {
    jest.resetModules()
    process.env.GOVUK_NOTIFY_API_KEY = 'dummy-key'
    mockSendEmail.mockReset()
    sendEmail = require('./notify').sendEmail
  })

  afterEach(() => {
    jest.clearAllMocks()
    delete process.env.GOVUK_NOTIFY_API_KEY
    jest.resetModules()
  })

  it('calls notifyClient.sendEmail with correct arguments', async () => {
    mockSendEmail.mockResolvedValueOnce({})
    await sendEmail(templateId, emailAddress, personalisation)
    expect(mockSendEmail).toHaveBeenCalledWith(templateId, emailAddress, {
      personalisation
    })
  })

  it('calls notifyClient.sendEmail with empty personalisation if not provided', async () => {
    mockSendEmail.mockResolvedValueOnce({})
    await sendEmail(templateId, emailAddress)
    expect(mockSendEmail).toHaveBeenCalledWith(templateId, emailAddress, {
      personalisation: {}
    })
  })

  it('throws and logs error if notifyClient.sendEmail rejects', async () => {
    const error = new Error('fail')
    mockSendEmail.mockRejectedValueOnce(error)

    process.env.GOVUK_NOTIFY_API_KEY = 'dummy-key'
    const { sendEmail } = require('./notify')

    await expect(
      sendEmail(templateId, emailAddress, personalisation)
    ).rejects.toThrow('fail')
    expect(mockLoggerError).toHaveBeenCalledWith(error)
  })
})
