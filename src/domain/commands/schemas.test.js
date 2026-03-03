import { validateCommandMessage } from './schemas.js'

describe('validateCommandMessage', () => {
  describe('envelope validation', () => {
    it('rejects missing command field', () => {
      const { error } = validateCommandMessage({ summaryLogId: 'log-123' })

      expect(error).toBeDefined()
      expect(error.message).toContain('"command" is required')
    })

    it('rejects unknown command type', () => {
      const { error } = validateCommandMessage({
        command: 'unknown',
        summaryLogId: 'log-123'
      })

      expect(error).toBeDefined()
      expect(error.message).toContain('"command" must be one of')
    })
  })

  describe('validate command', () => {
    it('accepts a valid validate message', () => {
      const { error, value } = validateCommandMessage({
        command: 'validate',
        summaryLogId: 'log-123'
      })

      expect(error).toBeUndefined()
      expect(value).toEqual({
        command: 'validate',
        summaryLogId: 'log-123'
      })
    })

    it('rejects validate without summaryLogId', () => {
      const { error } = validateCommandMessage({ command: 'validate' })

      expect(error).toBeDefined()
      expect(error.message).toContain('"summaryLogId" is required')
    })

    it('accepts validate with optional user', () => {
      const { error, value } = validateCommandMessage({
        command: 'validate',
        summaryLogId: 'log-123',
        user: { id: 'u1', email: 'a@b.com', scope: ['admin'] }
      })

      expect(error).toBeUndefined()
      expect(value.user).toEqual({
        id: 'u1',
        email: 'a@b.com',
        scope: ['admin']
      })
    })
  })

  describe('submit command', () => {
    it('accepts a valid submit message', () => {
      const { error, value } = validateCommandMessage({
        command: 'submit',
        summaryLogId: 'log-456'
      })

      expect(error).toBeUndefined()
      expect(value).toEqual({
        command: 'submit',
        summaryLogId: 'log-456'
      })
    })

    it('rejects submit without summaryLogId', () => {
      const { error } = validateCommandMessage({ command: 'submit' })

      expect(error).toBeDefined()
      expect(error.message).toContain('"summaryLogId" is required')
    })

    it('accepts submit with user context', () => {
      const { error, value } = validateCommandMessage({
        command: 'submit',
        summaryLogId: 'log-456',
        user: { id: 'u2', email: 'b@c.com', scope: ['user'] }
      })

      expect(error).toBeUndefined()
      expect(value.user).toEqual({
        id: 'u2',
        email: 'b@c.com',
        scope: ['user']
      })
    })
  })

  describe('user schema validation', () => {
    it('rejects user missing id', () => {
      const { error } = validateCommandMessage({
        command: 'validate',
        summaryLogId: 'log-123',
        user: { email: 'a@b.com', scope: [] }
      })

      expect(error).toBeDefined()
      expect(error.message).toContain('"user.id" is required')
    })

    it('rejects user missing email', () => {
      const { error } = validateCommandMessage({
        command: 'validate',
        summaryLogId: 'log-123',
        user: { id: 'u1', scope: [] }
      })

      expect(error).toBeDefined()
      expect(error.message).toContain('"user.email" is required')
    })

    it('rejects user missing scope', () => {
      const { error } = validateCommandMessage({
        command: 'validate',
        summaryLogId: 'log-123',
        user: { id: 'u1', email: 'a@b.com' }
      })

      expect(error).toBeDefined()
      expect(error.message).toContain('"user.scope" is required')
    })
  })
})
