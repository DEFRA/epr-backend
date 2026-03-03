import { COMMAND_TYPE } from './types.js'

describe('COMMAND_TYPE', () => {
  it('has validate command', () => {
    expect(COMMAND_TYPE.VALIDATE).toBe('validate')
  })

  it('has submit command', () => {
    expect(COMMAND_TYPE.SUBMIT).toBe('submit')
  })

  it('has recalculate_balance command', () => {
    expect(COMMAND_TYPE.RECALCULATE_BALANCE).toBe('recalculate_balance')
  })

  it('is frozen', () => {
    expect(Object.isFrozen(COMMAND_TYPE)).toBe(true)
  })
})
