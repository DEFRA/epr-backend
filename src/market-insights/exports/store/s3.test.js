import { assertPresent } from '#test/type-helpers.js'
import { createS3MarketInsightsExportStore } from './s3.js'

/** @type {{ command: any }[]} */
const sent = []

const s3Client = /** @type {any} */ ({
  send: vi.fn(async (command) => {
    sent.push({ command })
    return {}
  })
})

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(
    async (_client, command, options) =>
      `https://bucket.s3.amazonaws.com/${command.input.Key}?expires=${options.expiresIn}&disposition=${encodeURIComponent(command.input.ResponseContentDisposition)}`
  )
}))

const storeFor = (preSignedUrlExpiry = 3600) =>
  createS3MarketInsightsExportStore({
    s3Client,
    s3Bucket: 'market-insights-exports',
    preSignedUrlExpiry
  })

const KEY =
  'market-insights/market-insights-2026-monthly-6-2026-09-18-141530.zip'
const NAME = 'market-insights-2026-monthly-6-2026-09-18-141530.zip'

describe('S3 market insights export store', () => {
  it('writes the zip at the key it was given', async () => {
    await storeFor().save({ key: KEY, body: Buffer.from('zip bytes') })

    const last = sent.at(-1)
    assertPresent(last)
    expect(last.command.input).toMatchObject({
      Bucket: 'market-insights-exports',
      Key: KEY,
      ContentType: 'application/zip'
    })
  })

  it('leaves an earlier build in place when a later one is written', async () => {
    const store = storeFor()
    const rebuild =
      'market-insights/market-insights-2026-monthly-6-2026-09-18-170209.zip'

    await store.save({ key: KEY, body: Buffer.from('first') })
    await store.save({ key: rebuild, body: Buffer.from('second') })

    expect(sent.slice(-2).map(({ command }) => command.input.Key)).toEqual([
      KEY,
      rebuild
    ])
  })

  it('signs a download of the prefixed object that saves under the name alone', async () => {
    const { url } = await storeFor().signDownload({ key: KEY, fileName: NAME })

    expect(url).toContain(KEY)
    expect(decodeURIComponent(url)).toContain(`attachment; filename="${NAME}"`)
  })

  it('expires the signed URL after the configured number of seconds', async () => {
    const { url, expiresAt } = await storeFor(900).signDownload({
      key: KEY,
      fileName: NAME
    })

    expect(url).toContain('expires=900')
    expect(new Date(expiresAt).getTime() - Date.now()).toBeGreaterThan(
      890 * 1000
    )
    expect(new Date(expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(
      900 * 1000
    )
  })
})
