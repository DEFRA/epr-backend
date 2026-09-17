import { materialFromSpreadsheet, metaText } from './stored-meta.js'

describe('materialFromSpreadsheet', () => {
  it.each([
    ['Aluminium', 'aluminium'],
    ['Fibre_based_composite', 'fibre'],
    ['Paper_and_board', 'paper'],
    ['Plastic', 'plastic'],
    ['Steel', 'steel'],
    ['Wood', 'wood']
  ])('maps %s to %s', (spreadsheetMaterial, material) => {
    expect(materialFromSpreadsheet(spreadsheetMaterial)).toBe(material)
  })

  it.each([
    ['Glass_remelt', 'glass_re_melt'],
    ['Glass_other', 'glass_other']
  ])(
    'maps %s to its glass recycling process %s',
    (spreadsheetMaterial, material) => {
      expect(materialFromSpreadsheet(spreadsheetMaterial)).toBe(material)
    }
  )

  it.each([['Unknown'], ['toString'], [undefined], [null]])(
    'finds no material for %s',
    (spreadsheetMaterial) => {
      expect(materialFromSpreadsheet(spreadsheetMaterial)).toBeUndefined()
    }
  )
})

describe('metaText', () => {
  it.each([[undefined], [null]])('reads %s as blank', (value) => {
    expect(metaText(value)).toBe('')
  })

  it('trims the stored text', () => {
    expect(metaText('  R1 ')).toBe('R1')
  })

  it('reads a number stored as parsed as its text', () => {
    expect(metaText(12345)).toBe('12345')
  })
})
