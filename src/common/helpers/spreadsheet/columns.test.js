import {
  columnNumberToLetter,
  columnLetterToNumber,
  offsetColumn
} from './columns.js'

describe('Spreadsheet column helpers', () => {
  describe('columnNumberToLetter', () => {
    it('converts single-letter columns', () => {
      expect(columnNumberToLetter(1)).toBe('A')
      expect(columnNumberToLetter(2)).toBe('B')
      expect(columnNumberToLetter(26)).toBe('Z')
    })

    it('converts double-letter columns', () => {
      expect(columnNumberToLetter(27)).toBe('AA')
      expect(columnNumberToLetter(28)).toBe('AB')
      expect(columnNumberToLetter(52)).toBe('AZ')
      expect(columnNumberToLetter(53)).toBe('BA')
      expect(columnNumberToLetter(702)).toBe('ZZ')
    })

    it('converts triple-letter columns', () => {
      expect(columnNumberToLetter(703)).toBe('AAA')
      expect(columnNumberToLetter(704)).toBe('AAB')
      expect(columnNumberToLetter(18278)).toBe('ZZZ')
    })
  })

  describe('columnLetterToNumber', () => {
    it('converts single-letter columns', () => {
      expect(columnLetterToNumber('A')).toBe(1)
      expect(columnLetterToNumber('B')).toBe(2)
      expect(columnLetterToNumber('Z')).toBe(26)
    })

    it('converts double-letter columns', () => {
      expect(columnLetterToNumber('AA')).toBe(27)
      expect(columnLetterToNumber('AB')).toBe(28)
      expect(columnLetterToNumber('AZ')).toBe(52)
      expect(columnLetterToNumber('BA')).toBe(53)
      expect(columnLetterToNumber('ZZ')).toBe(702)
    })

    it('converts triple-letter columns', () => {
      expect(columnLetterToNumber('AAA')).toBe(703)
      expect(columnLetterToNumber('AAB')).toBe(704)
      expect(columnLetterToNumber('ZZZ')).toBe(18278)
    })
  })

  describe('round-trip conversions', () => {
    it('converts number to letter and back', () => {
      const testNumbers = [1, 26, 27, 52, 702, 703, 18278]
      testNumbers.forEach((num) => {
        const letter = columnNumberToLetter(num)
        const backToNumber = columnLetterToNumber(letter)
        expect(backToNumber).toBe(num)
      })
    })

    it('converts letter to number and back', () => {
      const testLetters = ['A', 'Z', 'AA', 'AZ', 'ZZ', 'AAA', 'ZZZ']
      testLetters.forEach((letter) => {
        const num = columnLetterToNumber(letter)
        const backToLetter = columnNumberToLetter(num)
        expect(backToLetter).toBe(letter)
      })
    })
  })

  describe('offsetColumn', () => {
    it('offsets single-letter columns', () => {
      expect(offsetColumn('A', 0)).toBe('A')
      expect(offsetColumn('A', 1)).toBe('B')
      expect(offsetColumn('A', 25)).toBe('Z')
      expect(offsetColumn('B', 3)).toBe('E')
    })

    it('offsets across letter boundaries', () => {
      expect(offsetColumn('Z', 1)).toBe('AA')
      expect(offsetColumn('Y', 3)).toBe('AB')
      expect(offsetColumn('AZ', 1)).toBe('BA')
    })

    it('offsets double-letter columns', () => {
      expect(offsetColumn('AA', 0)).toBe('AA')
      expect(offsetColumn('AA', 1)).toBe('AB')
      expect(offsetColumn('AA', 25)).toBe('AZ')
      expect(offsetColumn('AA', 26)).toBe('BA')
    })

    it('handles large offsets', () => {
      expect(offsetColumn('A', 701)).toBe('ZZ')
      expect(offsetColumn('B', 700)).toBe('ZZ')
    })
  })
})
