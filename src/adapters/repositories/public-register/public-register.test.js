import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll
} from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { S3Client } from '@aws-sdk/client-s3'
import { createPublicRegisterRepository } from './public-register.js'

const mockStorage = new Map()

const server = setupServer(
  http.get('https://test-bucket.s3.amazonaws.com/:fileName', ({ params }) => {
    const { fileName } = params
    const data = mockStorage.get(fileName)
    return HttpResponse.text(data || '')
  })
)

beforeAll(() => server.listen())
afterAll(() => server.close())

beforeEach(() => {
  mockStorage.clear()
  vi.clearAllMocks()
})

// Mock S3Client
vi.mock('@aws-sdk/client-s3', async () => {
  const actual = await vi.importActual('@aws-sdk/client-s3')

  class MockS3Client {
    constructor() {
      this.send = vi.fn().mockImplementation(async (command) => {
        const commandName = command.constructor.name

        if (commandName === 'PutObjectCommand') {
          mockStorage.set(command.input.Key, command.input.Body)
          return {}
        }
      })
    }
  }

  return {
    ...actual,
    S3Client: MockS3Client
  }
})

// Mock getSignedUrl
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockImplementation(async (_client, command) => {
    const fileName = command.input.Key
    return `https://test-bucket.s3.amazonaws.com/${fileName}`
  })
}))

describe('S3 public register repository', () => {
  it('saves CSV data to S3', async () => {
    const s3Client = new S3Client({ region: 'eu-west-2' })
    const repository = createPublicRegisterRepository({
      s3Client,
      s3Bucket: 'test-bucket',
      preSignedUrlExpiry: 3600
    })

    const fileName = 'test.csv'
    const csvData = 'col1,col2\nval1,val2'

    await repository.save(fileName, csvData)

    expect(mockStorage.has(fileName)).toBe(true)
    expect(mockStorage.get(fileName)).toBe(csvData)
  })

  it('generates presigned URL and fetches data', async () => {
    const s3Client = new S3Client({ region: 'eu-west-2' })
    const repository = createPublicRegisterRepository({
      s3Client,
      s3Bucket: 'test-bucket',
      preSignedUrlExpiry: 3600
    })

    const fileName = 'test.csv'
    const csvData = 'name,age\nAlice,30'

    // Save
    await repository.save(fileName, csvData)

    // Generate URL
    const result = await repository.generatePresignedUrl(fileName)
    expect(result.url).toContain(fileName)
    expect(result.expiresAt).toBeTruthy()
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now())

    const retrieved = await repository.fetchFromPresignedUrl(result.url)
    expect(retrieved).toBe(csvData)
  })
})
