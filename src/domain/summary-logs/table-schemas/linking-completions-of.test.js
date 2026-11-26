import { RECEIVED_LOADS_FOR_EXPORT_2027 } from './exporter/received-loads-for-export.js'
import { LOADS_EXPORTED_2027 } from './exporter-registered-only/loads-exported.js'
import { PREVIOUS_YEAR_ROW_COMPLETION } from '../previous-year-link.js'
import { toYear } from '#common/helpers/dates/year.js'

const { RECEIVED_BY_OSR, REPATRIATED } = PREVIOUS_YEAR_ROW_COMPLETION

describe('linking.completionsOf', () => {
  describe('accredited RECEIVED_LOADS_FOR_EXPORT', () => {
    const { completionsOf } = RECEIVED_LOADS_FOR_EXPORT_2027.linking

    it.each([
      ['nothing after export', {}, []],
      [
        'a date received by the overseas reprocessor',
        { DATE_RECEIVED_BY_OSR: '2026-12-14' },
        [{ completion: RECEIVED_BY_OSR, field: 'DATE_RECEIVED_BY_OSR' }]
      ],
      [
        'a received date in a later year',
        { DATE_RECEIVED_BY_OSR: '2027-01-05' },
        []
      ],
      [
        'a received date on the last day of the year',
        { DATE_RECEIVED_BY_OSR: '2026-12-31' },
        [{ completion: RECEIVED_BY_OSR, field: 'DATE_RECEIVED_BY_OSR' }]
      ],
      ['a received date that is text', { DATE_RECEIVED_BY_OSR: 'Pending' }, []],
      [
        'a received date left as an Excel serial',
        { DATE_RECEIVED_BY_OSR: 46005 },
        []
      ],
      [
        'a repatriation date in a later year',
        {
          WAS_THE_WASTE_REFUSED: 'Yes',
          DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: '2027-01-05'
        },
        []
      ],
      [
        'a repatriation date for refused waste',
        {
          WAS_THE_WASTE_REFUSED: 'Yes',
          DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: '2026-12-20'
        },
        [
          {
            completion: REPATRIATED,
            field: 'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED'
          }
        ]
      ],
      [
        'a repatriation date with stopped answered No',
        {
          WAS_THE_WASTE_STOPPED: 'No',
          DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: '2026-12-20'
        },
        [
          {
            completion: REPATRIATED,
            field: 'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED'
          }
        ]
      ],
      [
        'a repatriation date with neither refused nor stopped answered',
        {
          WAS_THE_WASTE_REFUSED: 'Choose option',
          DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: '2026-12-20'
        },
        []
      ],
      [
        'both a received date and a repatriation date',
        {
          DATE_RECEIVED_BY_OSR: '2026-12-14',
          WAS_THE_WASTE_REFUSED: 'Yes',
          DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: '2026-12-20'
        },
        [
          { completion: RECEIVED_BY_OSR, field: 'DATE_RECEIVED_BY_OSR' },
          {
            completion: REPATRIATED,
            field: 'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED'
          }
        ]
      ]
    ])('with %s', (_, row, expected) => {
      expect(completionsOf(row, toYear(2026))).toStrictEqual(expected)
    })
  })

  describe('registered-only LOADS_EXPORTED', () => {
    const { completionsOf } = LOADS_EXPORTED_2027.linking

    it.each([
      ['nothing after export', {}, []],
      [
        'neither refused nor stopped',
        { WAS_THE_WASTE_REFUSED: 'No', WAS_THE_WASTE_STOPPED: 'No' },
        [{ completion: RECEIVED_BY_OSR, field: 'PREVIOUS_YEAR_ROW_ID' }]
      ],
      [
        'only refused answered No',
        { WAS_THE_WASTE_REFUSED: 'No', WAS_THE_WASTE_STOPPED: 'Choose option' },
        []
      ],
      [
        'refused waste with a repatriation date',
        {
          WAS_THE_WASTE_REFUSED: 'Yes',
          WAS_THE_WASTE_STOPPED: 'No',
          DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: '2026-12-20'
        },
        [
          {
            completion: REPATRIATED,
            field: 'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED'
          }
        ]
      ],
      [
        'stopped waste with a repatriation date',
        {
          WAS_THE_WASTE_STOPPED: 'Yes',
          DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: '2026-12-20'
        },
        [
          {
            completion: REPATRIATED,
            field: 'DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED'
          }
        ]
      ],
      [
        'stopped waste with a repatriation date in a later year',
        {
          WAS_THE_WASTE_STOPPED: 'Yes',
          DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: '2027-01-05'
        },
        []
      ],
      [
        'stopped waste with a repatriation date that is text',
        {
          WAS_THE_WASTE_STOPPED: 'Yes',
          DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: 'Pending'
        },
        []
      ],
      [
        'refused waste not yet repatriated',
        { WAS_THE_WASTE_REFUSED: 'Yes', WAS_THE_WASTE_STOPPED: 'No' },
        []
      ]
    ])('with %s', (_, row, expected) => {
      expect(completionsOf(row, toYear(2026))).toStrictEqual(expected)
    })
  })
})
