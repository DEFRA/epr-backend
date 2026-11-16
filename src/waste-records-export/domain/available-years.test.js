import { config } from '#root/config.js'
import { availableWasteRecordYears } from './available-years.js'

describe('availableWasteRecordYears', () => {
  afterEach(() => {
    config.reset('openNextYear')
  })

  it('lists the template years up to this year', () => {
    expect(availableWasteRecordYears(new Date('2026-11-16'))).toEqual([2026])
  })

  it('lists the next year while it is open, newest first', () => {
    config.set('openNextYear', true)

    expect(availableWasteRecordYears(new Date('2026-11-16'))).toEqual([
      2027, 2026
    ])
  })

  it('leaves out an open year with no template', () => {
    expect(availableWasteRecordYears(new Date('2099-03-15'))).toEqual([
      2027, 2026
    ])
  })
})
