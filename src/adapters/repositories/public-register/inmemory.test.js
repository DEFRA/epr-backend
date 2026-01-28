import Hapi from '@hapi/hapi'
import { describe, it as base, expect } from 'vitest'
import { createInMemoryPublicRegisterRepository } from './inmemory.js'
import { testPublicRegisterRepositoryContract } from './port.contract.js'
import { createInMemoryPublicRegisterRepositoryPlugin } from '#plugins/repositories/inmemory-public-register-repository-plugin.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  publicRegisterRepository: async ({}, use) => {
    await use(
      createInMemoryPublicRegisterRepository({
        s3Bucket: 'test-bucket'
      })
    )
  }
})

describe('In-memory public register repository', () => {
  it('creates a repository instance', ({ publicRegisterRepository }) => {
    expect(publicRegisterRepository).toBeDefined()
  })

  testPublicRegisterRepositoryContract(it)

  describe('plugin wiring', () => {
    it('makes repository available on request via plugin', async () => {
      const server = Hapi.server()
      const plugin = createInMemoryPublicRegisterRepositoryPlugin({
        s3Bucket: 'test-bucket'
      })
      await server.register(plugin)

      server.route({
        method: 'POST',
        path: '/test',
        options: { auth: false },
        handler: async (request) => {
          const fileName = 'test-register.csv'
          const content = 'header1,header2\nvalue1,value2'

          await request.publicRegisterRepository.save(fileName, content)
          const result =
            await request.publicRegisterRepository.generatePresignedUrl(
              fileName
            )

          return { hasUrl: !!result.url }
        }
      })

      await server.initialize()
      const response = await server.inject({ method: 'POST', url: '/test' })
      const result = JSON.parse(response.payload)

      expect(result.hasUrl).toBe(true)
    })
  })
})
