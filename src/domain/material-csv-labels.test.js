import { describe, expect, it } from 'vitest'

import { GLASS_RECYCLING_PROCESS, MATERIAL } from '#domain/materials.js'
import {
  materialCsvLabels,
  formatMaterialCsvLabel
} from '#domain/material-csv-labels.js'

describe('material-csv-labels', () => {
  describe('formatMaterialCsvLabel', () => {
    it.each([
      [MATERIAL.ALUMINIUM, 'Aluminium'],
      [MATERIAL.FIBRE, 'Fibre based composite'],
      [MATERIAL.PAPER, 'Paper and board'],
      [MATERIAL.PLASTIC, 'Plastic'],
      [MATERIAL.STEEL, 'Steel'],
      [MATERIAL.WOOD, 'Wood']
    ])('should label %s as %s', (material, expected) => {
      expect(formatMaterialCsvLabel(material)).toBe(expected)
    })

    it.each([
      [[GLASS_RECYCLING_PROCESS.GLASS_RE_MELT], 'Glass-remelt'],
      [[GLASS_RECYCLING_PROCESS.GLASS_OTHER], 'Glass-other'],
      [
        [
          GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
          GLASS_RECYCLING_PROCESS.GLASS_OTHER
        ],
        'Glass-remelt-other'
      ]
    ])('should join glass processes %j into %s', (processes, expected) => {
      expect(formatMaterialCsvLabel(MATERIAL.GLASS, processes)).toBe(expected)
    })

    it('should fall back to a bare Glass label when no process is recorded', () => {
      expect(formatMaterialCsvLabel(MATERIAL.GLASS)).toBe('Glass')
    })
  })

  describe('materialCsvLabels', () => {
    it('should pin every label the formatter can emit for a registration with a process', () => {
      expect([...materialCsvLabels]).toStrictEqual([
        'Aluminium',
        'Fibre based composite',
        'Paper and board',
        'Plastic',
        'Steel',
        'Wood',
        'Glass-remelt',
        'Glass-other',
        'Glass-remelt-other'
      ])
    })
  })
})
