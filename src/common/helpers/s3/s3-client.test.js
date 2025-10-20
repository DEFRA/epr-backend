import { S3Client } from '@aws-sdk/client-s3'

import { createS3Client } from './s3-client.js'

vi.mock('@aws-sdk/client-s3')

const region = 'eu-west-2'
const endpoint = 'http://localhost:4566'
const forcePathStyle = true

describe('createS3Client', () => {
  let s3Client

  beforeEach(() => {
    s3Client = { config: { region } }

    vi.mocked(S3Client).mockReturnValue(s3Client)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('should create client with expected configuration', () => {
    createS3Client({ region, endpoint, forcePathStyle })

    expect(S3Client).toHaveBeenCalledWith({
      region,
      endpoint,
      forcePathStyle
    })
  })

  it('should return expected S3Client instance', () => {
    const result = createS3Client({ region, endpoint, forcePathStyle })

    expect(result).toBe(s3Client)
  })
})
