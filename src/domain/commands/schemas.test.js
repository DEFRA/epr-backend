import { describe, it, expect } from 'vitest'

import { validateCommandMessage } from './schemas.js'

describe('validateCommandMessage', () => {
  describe('valid commands', () => {
    it('accepts a valid validate command', () => {
      const { error, value } = validateCommandMessage({
        command: 'validate',
        summaryLogId: 'summary-log-123'
      })

      expect(error).toBeUndefined()
      expect(value).toEqual({
        command: 'validate',
        summaryLogId: 'summary-log-123'
      })
    })

    it('accepts a valid submit command with user', () => {
      const { error, value } = validateCommandMessage({
        command: 'submit',
        summaryLogId: 'summary-log-456',
        user: {
          id: 'user-1',
          email: 'test@example.com',
          scope: ['operator']
        }
      })

      expect(error).toBeUndefined()
      expect(value).toEqual({
        command: 'submit',
        summaryLogId: 'summary-log-456',
        user: {
          id: 'user-1',
          email: 'test@example.com',
          scope: ['operator']
        }
      })
    })

    it('accepts a valid submit command without user', () => {
      const { error, value } = validateCommandMessage({
        command: 'submit',
        summaryLogId: 'summary-log-789'
      })

      expect(error).toBeUndefined()
      expect(value).toEqual({
        command: 'submit',
        summaryLogId: 'summary-log-789'
      })
    })
  })

  describe('unknown command type', () => {
    it('rejects an unknown command type', () => {
      const { error } = validateCommandMessage({
        command: 'unknown',
        summaryLogId: 'summary-log-123'
      })

      expect(error).toBeDefined()
      expect(error.message).toContain('must be one of')
    })
  })

  describe('missing required fields', () => {
    it('rejects a validate command missing summaryLogId', () => {
      const { error } = validateCommandMessage({
        command: 'validate'
      })

      expect(error).toBeDefined()
      expect(error.message).toContain('summaryLogId')
    })

    it('rejects a submit command missing summaryLogId', () => {
      const { error } = validateCommandMessage({
        command: 'submit'
      })

      expect(error).toBeDefined()
      expect(error.message).toContain('summaryLogId')
    })

    it('rejects a message with no command field', () => {
      const { error } = validateCommandMessage({
        summaryLogId: 'summary-log-123'
      })

      expect(error).toBeDefined()
      expect(error.message).toContain('command')
    })
  })

  describe('invalid user object', () => {
    it('rejects a user object missing required fields', () => {
      const { error } = validateCommandMessage({
        command: 'submit',
        summaryLogId: 'summary-log-123',
        user: { id: 'user-1' }
      })

      expect(error).toBeDefined()
      expect(error.message).toContain('email')
    })
  })
})
