import { describe, expect, it } from 'vitest'

import { recordOf } from './record-of.js'

describe('record-of', () => {
  it('holds a value for every key and no other', () => {
    expect(recordOf(['a', 'b'], (key) => key.toUpperCase())).toStrictEqual({
      a: 'A',
      b: 'B'
    })
  })

  it('is empty for no keys', () => {
    expect(recordOf([], () => 0)).toStrictEqual({})
  })
})
