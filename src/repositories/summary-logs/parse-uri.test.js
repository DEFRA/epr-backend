import { describe, expect, it } from 'vitest'

import { parseSummaryLogUri } from './parse-uri.js'

describe('parseSummaryLogUri', () => {
  it('throws cdp-boom internal with type-only classifier when underlying error has no cause and no code', () => {
    let thrown
    try {
      parseSummaryLogUri('https://bucket/key', 'log-1')
    } catch (err) {
      thrown = err
    }

    expect(thrown).toMatchObject({
      isBoom: true,
      output: { statusCode: 500 },
      code: 'summary_log_uri_corrupt',
      event: {
        action: 'get_download_url',
        reason: 'summaryLogId=log-1 type=Error code=unknown'
      }
    })
  })
})
