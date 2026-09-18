import {
  abandonedBuildCutoff,
  marketInsightsExportFileName,
  marketInsightsExportObjectKey,
  marketInsightsExportPeriodKey
} from './export.js'

const JUNE_2026 = { year: 2026, cadence: 'monthly', period: 6 }

describe('identifying a period export', () => {
  it('identifies the record by the reporting period, so a rebuild reuses it', () => {
    expect(marketInsightsExportPeriodKey(JUNE_2026)).toBe('2026-monthly-06')
  })

  it('gives the same period the same record however often it is asked for', () => {
    expect(marketInsightsExportPeriodKey(JUNE_2026)).toBe(
      marketInsightsExportPeriodKey({ ...JUNE_2026 })
    )
  })

  it('keeps each period to its own record', () => {
    const keys = new Set(
      [
        JUNE_2026,
        { ...JUNE_2026, period: 12 },
        { ...JUNE_2026, year: 2025 },
        { ...JUNE_2026, cadence: 'quarterly' }
      ].map(marketInsightsExportPeriodKey)
    )

    expect(keys.size).toBe(4)
  })
})

describe('naming what a build writes', () => {
  it('saves under a name saying which period it holds and when it was taken', () => {
    expect(
      marketInsightsExportFileName({
        ...JUNE_2026,
        generatedAt: '2026-09-18T14:15:30.000Z'
      })
    ).toBe('market-insights-2026-monthly-6-2026-09-18-141530.zip')
  })

  it('stores that name under a prefix, so it cannot collide with the public register at the bucket root', () => {
    const key = marketInsightsExportObjectKey({
      ...JUNE_2026,
      generatedAt: '2026-09-18T14:15:30.000Z'
    })

    expect(key).toBe(
      'market-insights/market-insights-2026-monthly-6-2026-09-18-141530.zip'
    )
    expect(key).not.toMatch(/^public-register-/)
  })

  it('gives a rebuild its own object, leaving the last one where it was', () => {
    const first = marketInsightsExportObjectKey({
      ...JUNE_2026,
      generatedAt: '2026-09-18T14:15:30.000Z'
    })
    const rebuild = marketInsightsExportObjectKey({
      ...JUNE_2026,
      generatedAt: '2026-09-18T17:02:09.000Z'
    })

    expect(rebuild).not.toBe(first)
  })

  it('separates builds a second apart, and is safe to save on any filesystem', () => {
    const key = marketInsightsExportObjectKey({
      ...JUNE_2026,
      generatedAt: '2026-09-18T14:15:31.000Z'
    })

    expect(key).not.toBe(
      marketInsightsExportObjectKey({
        ...JUNE_2026,
        generatedAt: '2026-09-18T14:15:30.000Z'
      })
    )
    // The name is what a regulator saves, so it must hold no colon.
    expect(key.slice(key.lastIndexOf('/') + 1)).not.toContain(':')
  })
})

describe('deciding a build has been abandoned', () => {
  it('counts a build as under way until the queue would have given up on it', () => {
    // The only question a request asks about an existing record: is work still
    // happening on it? Nothing here judges whether an export is fresh enough
    // to serve, because a finished one is never served again.
    expect(
      abandonedBuildCutoff(5 * 60_000, new Date('2026-09-18T14:15:30.000Z'))
    ).toBe('2026-09-18T14:10:30.000Z')
  })
})
