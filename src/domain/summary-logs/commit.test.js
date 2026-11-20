import { savedCommitOf } from './commit.js'

const commit = {
  rowStatesWritten: true,
  contextHash: 'a'.repeat(64),
  payload: { creditTotal: 0, decemberCreditTotal: 0 },
  counts: { created: 0, updated: 0, decemberWasteRowCount: 0 }
}

describe('savedCommitOf', () => {
  it('returns the commit validation saved', () => {
    expect(savedCommitOf({ commit })).toStrictEqual(commit)
  })

  it('returns null for a log validated before commits were saved', () => {
    expect(savedCommitOf({})).toBeNull()
  })

  it('returns null for a commit saved before validation wrote its row states', () => {
    const { rowStatesWritten: _, ...savedWithoutRowStates } = commit

    expect(savedCommitOf({ commit: savedWithoutRowStates })).toBeNull()
  })
})
