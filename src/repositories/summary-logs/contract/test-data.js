import { randomUUID } from 'node:crypto'

export const TEST_S3_BUCKET = 'test-bucket'

export const generateFileId = () => `file-${randomUUID()}`

export const buildFile = (overrides = {}) => ({
  id: generateFileId(),
  name: 'test.xlsx',
  status: 'complete',
  s3: {
    bucket: TEST_S3_BUCKET,
    key: 'test-key'
  },
  ...overrides
})

export const buildPendingFile = (overrides = {}) => {
  const { s3, status, ...rest } = overrides
  return {
    id: generateFileId(),
    name: 'test.xlsx',
    status: 'pending',
    ...rest
  }
}

export const buildRejectedFile = (overrides = {}) => {
  const { s3, status, ...rest } = overrides
  return {
    id: generateFileId(),
    name: 'test.xlsx',
    status: 'rejected',
    ...rest
  }
}

export const buildSummaryLog = (overrides = {}) => {
  const { file, ...logOverrides } = overrides
  return {
    status: 'validating',
    file: file === undefined ? buildFile() : file,
    ...logOverrides
  }
}
