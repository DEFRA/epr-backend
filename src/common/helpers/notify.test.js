const mockSendEmail = jest.fn()

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

    // Mock the logger
    const infoSpy = jest.fn()
    const errorSpy = jest.fn()
    jest.doMock('./logging/logger.js', () => ({
      createLogger: () => ({
        info: infoSpy,
        error: errorSpy
      })
    }))

    // Re-import sendEmail to use the mocked logger
    jest.resetModules()
    process.env.GOVUK_NOTIFY_API_KEY = 'dummy-key'
    const { sendEmail } = require('./notify')

    await expect(
      sendEmail(templateId, emailAddress, personalisation)
    ).rejects.toThrow('fail')
    expect(errorSpy).toHaveBeenCalledWith(error)
  })
})
