import { createServer } from '../server.js' // adjust if your Hapi server is in a different path
import * as notifyHelper from '../common/helpers/notify.js'

jest.mock('../common/helpers/notify.js')
let server

describe('/send-email route', () => {
  beforeAll(async () => {
    process.env.GOVUK_NOTIFY_TEMPLATE_ID_REGISTRATION = 'reg-template-id'
    process.env.GOVUK_NOTIFY_TEMPLATE_ID_ACCREDITATION = 'acc-template-id'

    server = await createServer()
  })

  afterAll(async () => {
    await server.stop()
  })

  it('returns 200 on successful email send (registration template)', async () => {
    notifyHelper.sendEmail.mockResolvedValue()

    const response = await server.inject({
      method: 'POST',
      url: '/send-email',
      payload: {
        email: 'test@example.com',
        template: 'registration',
        personalisation: { name: 'Test' }
      }
    })

    expect(notifyHelper.sendEmail).toHaveBeenCalledWith(
      'reg-template-id',
      'test@example.com',
      { name: 'Test' }
    )
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.payload)).toEqual({ success: true })
  })

  it('returns 200 on successful email send (accreditation template)', async () => {
    notifyHelper.sendEmail.mockResolvedValue()

    const response = await server.inject({
      method: 'POST',
      url: '/send-email',
      payload: {
        email: 'user@example.com',
        template: 'accreditation',
        personalisation: { name: 'User' }
      }
    })

    expect(notifyHelper.sendEmail).toHaveBeenCalledWith(
      'acc-template-id',
      'user@example.com',
      { name: 'User' }
    )
    expect(response.statusCode).toBe(200)
  })

  it('returns 500 if sendEmail throws', async () => {
    notifyHelper.sendEmail.mockRejectedValue(new Error('Notify API failed'))

    const response = await server.inject({
      method: 'POST',
      url: '/send-email',
      payload: {
        email: 'fail@example.com',
        template: 'registration',
        personalisation: { name: 'Fail' }
      }
    })

    expect(response.statusCode).toBe(500)
    expect(JSON.parse(response.payload)).toEqual({
      success: false,
      error: 'Notify API failed'
    })
  })

  it('returns 400 if payload is invalid', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/send-email',
      payload: {
        email: 'bad@example.com',
        template: 'registration'
        // personalisation is missing
      }
    })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.payload).message).toMatch(/Invalid payload/)
  })
})
