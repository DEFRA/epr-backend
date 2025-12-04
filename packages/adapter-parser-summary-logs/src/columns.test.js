import { describe, it, expect } from 'vitest'
import {
  columnNumberToLetter,
  columnLetterToNumber,
  offsetColumn
} from './columns.js'

describe('columnNumberToLetter', () => {
  it('converts single digit columns', () => {
    expect(columnNumberToLetter(1)).toBe('A')
    expect(columnNumberToLetter(2)).toBe('B')
    expect(columnNumberToLetter(26)).toBe('Z')
  })

  it('converts double digit columns', () => {
    expect(columnNumberToLetter(27)).toBe('AA')
    expect(columnNumberToLetter(28)).toBe('AB')
    expect(columnNumberToLetter(52)).toBe('AZ')
    expect(columnNumberToLetter(53)).toBe('BA')
    expect(columnNumberToLetter(702)).toBe('ZZ')
  })

  it('converts triple digit columns', () => {
    expect(columnNumberToLetter(703)).toBe('AAA')
  })
})

describe('columnLetterToNumber', () => {
  it('converts single letter columns', () => {
    expect(columnLetterToNumber('A')).toBe(1)
    expect(columnLetterToNumber('B')).toBe(2)
    expect(columnLetterToNumber('Z')).toBe(26)
  })

  it('converts double letter columns', () => {
    expect(columnLetterToNumber('AA')).toBe(27)
    expect(columnLetterToNumber('AB')).toBe(28)
    expect(columnLetterToNumber('AZ')).toBe(52)
    expect(columnLetterToNumber('BA')).toBe(53)
    expect(columnLetterToNumber('ZZ')).toBe(702)
  })

  it('converts triple letter columns', () => {
    expect(columnLetterToNumber('AAA')).toBe(703)
  })
})

describe('offsetColumn', () => {
  it('returns same column with zero offset', () => {
    expect(offsetColumn('B', 0)).toBe('B')
  })

  it('adds offset to column', () => {
    expect(offsetColumn('B', 3)).toBe('E')
  })

  it('handles rollover to double letters', () => {
    expect(offsetColumn('Y', 3)).toBe('AB')
  })
})
