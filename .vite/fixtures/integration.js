import { test as baseTest } from 'vitest'
import { dbFixture } from './mongo.js'
import { s3Fixture } from './s3.js'

export const integrationTest = baseTest.extend(
  {
    ...dbFixture,
    ...s3Fixture
  },
  { scope: 'file' }
)

export {
  expect,
  describe,
  it,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  vi
} from 'vitest'
