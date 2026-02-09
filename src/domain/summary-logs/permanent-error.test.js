import { PermanentError } from './permanent-error.js'

describe('PermanentError', () => {
  it('extends Error', () => {
    const error = new PermanentError('test message')

    expect(error).toBeInstanceOf(Error)
  })

  it('has name PermanentError', () => {
    const error = new PermanentError('test message')

    expect(error.name).toBe('PermanentError')
  })

  it('stores the message', () => {
    const error = new PermanentError('summary log not found')

    expect(error.message).toBe('summary log not found')
  })
})
