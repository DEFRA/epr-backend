import { describe, it, expect } from 'vitest'
import { findDuplicates } from './find-duplicates.js'

describe('findDuplicates', () => {
  it('returns an empty array when every value is unique', () => {
    expect(findDuplicates(['a', 'b', 'c'])).toEqual([])
  })

  it('returns an empty array for no values', () => {
    expect(findDuplicates([])).toEqual([])
  })

  it('returns a value that appears more than once', () => {
    expect(findDuplicates(['a', 'b', 'a'])).toEqual(['a'])
  })

  it('returns each duplicated value only once regardless of repetitions', () => {
    expect(findDuplicates(['a', 'a', 'a'])).toEqual(['a'])
  })

  it('preserves first-seen order of the duplicated values', () => {
    expect(findDuplicates(['b', 'a', 'a', 'b'])).toEqual(['a', 'b'])
  })
})
