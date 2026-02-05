import { describe, it, expect } from 'vitest'

import { REGULATOR } from '#domain/organisations/model.js'
import {
  generatePrnNumber,
  AGENCY_CODE,
  OPERATOR_TYPE_CODE,
  ACCREDITATION_YEAR
} from './prn-number-generator.js'

describe('prn-number-generator', () => {
  describe('constants', () => {
    it('has correct agency codes', () => {
      expect(AGENCY_CODE[REGULATOR.EA]).toBe('E')
      expect(AGENCY_CODE[REGULATOR.NIEA]).toBe('N')
      expect(AGENCY_CODE[REGULATOR.SEPA]).toBe('S')
      expect(AGENCY_CODE[REGULATOR.NRW]).toBe('W')
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
          regulator: REGULATOR.EA,
          isExport: false
        })

        expect(prnNumber).toMatch(/^[ENSW][RX]\d{7}$/)
      })

      it('has exactly 9 characters', () => {
        const prnNumber = generatePrnNumber({
          regulator: REGULATOR.EA,
          isExport: false
        })

        expect(prnNumber).toHaveLength(9)
      })
    })

    describe('agency code (position 1)', () => {
      it('uses E for EA (England)', () => {
        const prnNumber = generatePrnNumber({
          regulator: REGULATOR.EA,
          isExport: false
        })

        expect(prnNumber[0]).toBe('E')
      })

      it('uses N for NIEA (Northern Ireland)', () => {
        const prnNumber = generatePrnNumber({
          regulator: REGULATOR.NIEA,
          isExport: false
        })

        expect(prnNumber[0]).toBe('N')
      })

      it('uses S for SEPA (Scotland)', () => {
        const prnNumber = generatePrnNumber({
          regulator: REGULATOR.SEPA,
          isExport: false
        })

        expect(prnNumber[0]).toBe('S')
      })

      it('uses W for NRW (Wales)', () => {
        const prnNumber = generatePrnNumber({
          regulator: REGULATOR.NRW,
          isExport: false
        })

        expect(prnNumber[0]).toBe('W')
      })

      it('throws for unknown regulator', () => {
        expect(() =>
          generatePrnNumber({ regulator: 'unknown', isExport: false })
        ).toThrow('Unknown regulator: unknown')
      })
    })

    describe('operator type code (position 2)', () => {
      it('uses R for reprocessor (isExport = false)', () => {
        const prnNumber = generatePrnNumber({
          regulator: REGULATOR.EA,
          isExport: false
        })

        expect(prnNumber[1]).toBe('R')
      })

      it('uses X for exporter (isExport = true)', () => {
        const prnNumber = generatePrnNumber({
          regulator: REGULATOR.EA,
          isExport: true
        })

        expect(prnNumber[1]).toBe('X')
      })
    })

    describe('accreditation year (positions 3-4)', () => {
      it('uses hardcoded year 26', () => {
        const prnNumber = generatePrnNumber({
          regulator: REGULATOR.EA,
          isExport: false
        })

        expect(prnNumber.slice(2, 4)).toBe('26')
      })
    })

    describe('sequential number (positions 5-9)', () => {
      it('generates 5-digit padded number', () => {
        const prnNumber = generatePrnNumber({
          regulator: REGULATOR.EA,
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
              regulator: REGULATOR.EA,
              isExport: false
            })
          )
        }

        expect(numbers.size).toBeGreaterThan(90)
      })
    })

    describe('example outputs', () => {
      it('generates EA reprocessor PRN like ER2612345', () => {
        const prnNumber = generatePrnNumber({
          regulator: REGULATOR.EA,
          isExport: false
        })

        expect(prnNumber).toMatch(/^ER26\d{5}$/)
      })

      it('generates EA exporter PRN like EX2612345', () => {
        const prnNumber = generatePrnNumber({
          regulator: REGULATOR.EA,
          isExport: true
        })

        expect(prnNumber).toMatch(/^EX26\d{5}$/)
      })

      it('generates NRW reprocessor PRN like WR2612345', () => {
        const prnNumber = generatePrnNumber({
          regulator: REGULATOR.NRW,
          isExport: false
        })

        expect(prnNumber).toMatch(/^WR26\d{5}$/)
      })
    })

    describe('suffix for collision avoidance', () => {
      it('appends suffix when provided', () => {
        const prnNumber = generatePrnNumber({
          regulator: REGULATOR.EA,
          isExport: false,
          suffix: 'A'
        })

        expect(prnNumber).toMatch(/^ER26\d{5}A$/)
        expect(prnNumber).toHaveLength(10)
      })

      it('does not append suffix when not provided', () => {
        const prnNumber = generatePrnNumber({
          regulator: REGULATOR.EA,
          isExport: false
        })

        expect(prnNumber).toMatch(/^ER26\d{5}$/)
        expect(prnNumber).toHaveLength(9)
      })

      it('accepts any single character suffix', () => {
        const prnNumber = generatePrnNumber({
          regulator: REGULATOR.EA,
          isExport: false,
          suffix: 'Z'
        })

        expect(prnNumber).toMatch(/^ER26\d{5}Z$/)
      })
    })
  })
})
