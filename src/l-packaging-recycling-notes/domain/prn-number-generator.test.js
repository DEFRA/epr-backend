import { describe, it, expect } from 'vitest'

import { NATION } from '#domain/organisations/model.js'
import {
  generatePrnNumber,
  AGENCY_CODE,
  OPERATOR_TYPE_CODE,
  ACCREDITATION_YEAR
} from './prn-number-generator.js'

describe('prn-number-generator', () => {
  describe('constants', () => {
    it('has correct agency codes', () => {
      expect(AGENCY_CODE[NATION.ENGLAND]).toBe('E')
      expect(AGENCY_CODE[NATION.NORTHERN_IRELAND]).toBe('N')
      expect(AGENCY_CODE[NATION.SCOTLAND]).toBe('S')
      expect(AGENCY_CODE[NATION.WALES]).toBe('W')
    })

    it('has correct operator type codes', () => {
      expect(OPERATOR_TYPE_CODE.REPROCESSOR).toBe('R')
      expect(OPERATOR_TYPE_CODE.EXPORTER).toBe('X')
    })

    it('has hardcoded accreditation year', () => {
      expect(ACCREDITATION_YEAR).toBe('26')
    })
  })

  describe('generatePrnNumber', () => {
    describe('format validation', () => {
      it('generates a PRN number in the correct format XXNNnnnnn', () => {
        const prnNumber = generatePrnNumber({
          nation: NATION.ENGLAND,
          isExport: false
        })

        expect(prnNumber).toMatch(/^[ENSW][RX]\d{7}$/)
      })

      it('has exactly 9 characters', () => {
        const prnNumber = generatePrnNumber({
          nation: NATION.ENGLAND,
          isExport: false
        })

        expect(prnNumber).toHaveLength(9)
      })
    })

    describe('agency code (position 1)', () => {
      it('uses E for England', () => {
        const prnNumber = generatePrnNumber({
          nation: NATION.ENGLAND,
          isExport: false
        })

        expect(prnNumber[0]).toBe('E')
      })

      it('uses N for Northern Ireland', () => {
        const prnNumber = generatePrnNumber({
          nation: NATION.NORTHERN_IRELAND,
          isExport: false
        })

        expect(prnNumber[0]).toBe('N')
      })

      it('uses S for Scotland', () => {
        const prnNumber = generatePrnNumber({
          nation: NATION.SCOTLAND,
          isExport: false
        })

        expect(prnNumber[0]).toBe('S')
      })

      it('uses W for Wales', () => {
        const prnNumber = generatePrnNumber({
          nation: NATION.WALES,
          isExport: false
        })

        expect(prnNumber[0]).toBe('W')
      })

      it('throws for unknown nation', () => {
        expect(() =>
          generatePrnNumber({ nation: 'unknown', isExport: false })
        ).toThrow('Unknown nation: unknown')
      })
    })

    describe('operator type code (position 2)', () => {
      it('uses R for reprocessor (isExport = false)', () => {
        const prnNumber = generatePrnNumber({
          nation: NATION.ENGLAND,
          isExport: false
        })

        expect(prnNumber[1]).toBe('R')
      })

      it('uses X for exporter (isExport = true)', () => {
        const prnNumber = generatePrnNumber({
          nation: NATION.ENGLAND,
          isExport: true
        })

        expect(prnNumber[1]).toBe('X')
      })
    })

    describe('accreditation year (positions 3-4)', () => {
      it('uses hardcoded year 26', () => {
        const prnNumber = generatePrnNumber({
          nation: NATION.ENGLAND,
          isExport: false
        })

        expect(prnNumber.slice(2, 4)).toBe('26')
      })
    })

    describe('sequential number (positions 5-9)', () => {
      it('generates 5-digit padded number', () => {
        const prnNumber = generatePrnNumber({
          nation: NATION.ENGLAND,
          isExport: false
        })

        const sequentialPart = prnNumber.slice(4)
        expect(sequentialPart).toMatch(/^\d{5}$/)
      })

      it('generates different numbers on subsequent calls', () => {
        const numbers = new Set()

        for (let i = 0; i < 100; i++) {
          numbers.add(
            generatePrnNumber({
              nation: NATION.ENGLAND,
              isExport: false
            })
          )
        }

        expect(numbers.size).toBeGreaterThan(90)
      })
    })

    describe('example outputs', () => {
      it('generates England reprocessor PRN like ER2612345', () => {
        const prnNumber = generatePrnNumber({
          nation: NATION.ENGLAND,
          isExport: false
        })

        expect(prnNumber).toMatch(/^ER26\d{5}$/)
      })

      it('generates England exporter PRN like EX2612345', () => {
        const prnNumber = generatePrnNumber({
          nation: NATION.ENGLAND,
          isExport: true
        })

        expect(prnNumber).toMatch(/^EX26\d{5}$/)
      })

      it('generates Wales reprocessor PRN like WR2612345', () => {
        const prnNumber = generatePrnNumber({
          nation: NATION.WALES,
          isExport: false
        })

        expect(prnNumber).toMatch(/^WR26\d{5}$/)
      })
    })

    describe('suffix for collision avoidance', () => {
      it('appends suffix when provided', () => {
        const prnNumber = generatePrnNumber({
          nation: NATION.ENGLAND,
          isExport: false,
          suffix: 'A'
        })

        expect(prnNumber).toMatch(/^ER26\d{5}A$/)
        expect(prnNumber).toHaveLength(10)
      })

      it('does not append suffix when not provided', () => {
        const prnNumber = generatePrnNumber({
          nation: NATION.ENGLAND,
          isExport: false
        })

        expect(prnNumber).toMatch(/^ER26\d{5}$/)
        expect(prnNumber).toHaveLength(9)
      })

      it('accepts any single character suffix', () => {
        const prnNumber = generatePrnNumber({
          nation: NATION.ENGLAND,
          isExport: false,
          suffix: 'Z'
        })

        expect(prnNumber).toMatch(/^ER26\d{5}Z$/)
      })
    })
  })
})
