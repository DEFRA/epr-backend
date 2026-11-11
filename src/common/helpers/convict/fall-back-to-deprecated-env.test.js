import { describe, expect, it } from 'vitest'

import { fallBackToDeprecatedEnv } from './fall-back-to-deprecated-env.js'

const renames = [{ deprecated: 'OLD_NAME', replacement: 'NEW_NAME' }]

describe('fallBackToDeprecatedEnv', () => {
  it('should copy the deprecated value to the replacement when only the deprecated name is set', () => {
    const { env } = fallBackToDeprecatedEnv({ OLD_NAME: 'old' }, renames)

    expect(env).toStrictEqual({ OLD_NAME: 'old', NEW_NAME: 'old' })
  })

  it('should prefer the replacement when both names are set', () => {
    const { env } = fallBackToDeprecatedEnv(
      { OLD_NAME: 'old', NEW_NAME: 'new' },
      renames
    )

    expect(env).toStrictEqual({ OLD_NAME: 'old', NEW_NAME: 'new' })
  })

  it('should leave the env untouched when neither name is set', () => {
    const { env } = fallBackToDeprecatedEnv({ OTHER: 'x' }, renames)

    expect(env).toStrictEqual({ OTHER: 'x' })
  })

  it('should not mutate the env it is given', () => {
    const source = { OLD_NAME: 'old' }

    fallBackToDeprecatedEnv(source, renames)

    expect(source).toStrictEqual({ OLD_NAME: 'old' })
  })

  it('should report the deprecated names it fell back on', () => {
    const { used } = fallBackToDeprecatedEnv({ OLD_NAME: 'old' }, renames)

    expect(used).toStrictEqual(renames)
  })

  it.each([
    ['both names are set', { OLD_NAME: 'old', NEW_NAME: 'new' }],
    ['neither name is set', {}]
  ])('should report nothing when %s', (_, source) => {
    const { used } = fallBackToDeprecatedEnv(source, renames)

    expect(used).toStrictEqual([])
  })
})
