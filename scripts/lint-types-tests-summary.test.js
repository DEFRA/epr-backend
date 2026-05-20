import { describe, expect, it } from 'vitest'

import {
  buildPrComment,
  buildSummary,
  filterTestFiles
} from './lint-types-tests-summary.js'

describe('lint-types-tests-summary', () => {
  describe('filterTestFiles', () => {
    it('should include .test.js files', () => {
      const result = filterTestFiles([
        'src/server/foo/foo.test.js',
        'src/server/foo/foo.js'
      ])

      expect(result).toStrictEqual(['src/server/foo/foo.test.js'])
    })

    it('should include files under any test-helpers directory', () => {
      const result = filterTestFiles([
        'src/server/common/test-helpers/auth.js',
        'src/server/common/helpers/auth.js'
      ])

      expect(result).toStrictEqual(['src/server/common/test-helpers/auth.js'])
    })

    it('should include test-fixtures.js files', () => {
      const result = filterTestFiles([
        'src/server/foo/test-fixtures.js',
        'src/server/foo/fixtures.js'
      ])

      expect(result).toStrictEqual(['src/server/foo/test-fixtures.js'])
    })

    it('should include .d.ts files', () => {
      const result = filterTestFiles([
        'src/server/types/hapi.d.ts',
        'src/server/types/hapi.js'
      ])

      expect(result).toStrictEqual(['src/server/types/hapi.d.ts'])
    })
  })

  describe('buildSummary', () => {
    const noopLookup = () => ''

    describe('exit code', () => {
      it('should be 0 when no test files changed', () => {
        const result = buildSummary({
          tscOutput: '',
          changedFiles: [],
          tsCodeLookup: noopLookup
        })

        expect(result.exitCode).toBe(0)
      })

      it('should be 0 when changed files have no errors', () => {
        const result = buildSummary({
          tscOutput:
            "src/server/x/x.test.js(1,1): error TS2304: Cannot find name 'a'.",
          changedFiles: ['src/server/foo/foo.test.js'],
          tsCodeLookup: noopLookup
        })

        expect(result.exitCode).toBe(0)
      })

      it('should be 1 when any changed file has errors', () => {
        const result = buildSummary({
          tscOutput:
            "src/server/foo/foo.test.js(1,1): error TS2304: Cannot find name 'a'.",
          changedFiles: ['src/server/foo/foo.test.js'],
          tsCodeLookup: noopLookup
        })

        expect(result.exitCode).toBe(1)
      })
    })

    describe('section 1 - errors in this PR', () => {
      it('should show the clean message exactly once when no test files changed', () => {
        const { markdown } = buildSummary({
          tscOutput: '',
          changedFiles: [],
          tsCodeLookup: noopLookup
        })
        const occurrences =
          markdown.split('No type errors in test files changed in this PR')
            .length - 1

        expect(markdown).toContain('### Errors in this PR')
        expect(occurrences).toBe(1)
      })

      it('should show the clean message exactly once when changed files have no errors', () => {
        const { markdown } = buildSummary({
          tscOutput: '',
          changedFiles: ['src/server/foo/foo.test.js'],
          tsCodeLookup: noopLookup
        })
        const occurrences =
          markdown.split('No type errors in test files changed in this PR')
            .length - 1

        expect(occurrences).toBe(1)
      })

      it('should omit clean files from the section', () => {
        const tscOutput =
          "src/server/foo/foo.test.js(1,1): error TS2304: Cannot find name 'a'."

        const { markdown } = buildSummary({
          tscOutput,
          changedFiles: [
            'src/server/foo/foo.test.js',
            'src/server/clean/clean.test.js'
          ],
          tsCodeLookup: noopLookup
        })

        expect(markdown).toContain(
          '<details><summary><code>src/server/foo/foo.test.js</code>'
        )
        expect(markdown).not.toContain('src/server/clean/clean.test.js')
      })

      it('should emit collapsible details for files with errors', () => {
        const tscOutput = [
          "src/server/foo/foo.test.js(10,3): error TS2322: Type 'string' is not assignable to type 'number'.",
          "src/server/foo/foo.test.js(15,5): error TS2304: Cannot find name 'bar'."
        ].join('\n')

        const { markdown } = buildSummary({
          tscOutput,
          changedFiles: ['src/server/foo/foo.test.js'],
          tsCodeLookup: noopLookup
        })

        expect(markdown).toContain(
          '<details><summary><code>src/server/foo/foo.test.js</code> (2 errors)</summary>'
        )
        expect(markdown).toContain(
          "error TS2322: Type 'string' is not assignable to type 'number'."
        )
      })

      it('should include total error count in the pr-scope header', () => {
        const tscOutput = [
          'src/server/foo/foo.test.js(10,3): error TS2322: a.',
          'src/server/foo/foo.test.js(15,5): error TS2304: b.',
          'src/server/bar/bar.test.js(1,1): error TS2304: c.'
        ].join('\n')

        const { markdown } = buildSummary({
          tscOutput,
          changedFiles: [
            'src/server/foo/foo.test.js',
            'src/server/bar/bar.test.js'
          ],
          tsCodeLookup: noopLookup
        })

        expect(markdown).toContain(
          '**3 type error(s) in test files changed in this PR**'
        )
        expect(markdown).not.toContain('advisory')
      })
    })

    describe('section 2 - all errors', () => {
      it('should show passed when tsc had no errors', () => {
        const { markdown } = buildSummary({
          tscOutput: '',
          changedFiles: [],
          tsCodeLookup: noopLookup
        })

        expect(markdown).toContain('### All errors')
        expect(markdown).toContain(':white_check_mark: Test type check passed')
      })

      it('should report total errors found', () => {
        const tscOutput = [
          'src/a.test.js(1,1): error TS2304: foo.',
          'src/b.test.js(1,1): error TS2304: bar.',
          'src/c.test.js(1,1): error TS2304: baz.'
        ].join('\n')

        const { markdown } = buildSummary({
          tscOutput,
          changedFiles: [],
          tsCodeLookup: noopLookup
        })

        expect(markdown).toContain('**3 type errors found in tests**')
        expect(markdown).not.toContain('advisory')
      })

      it('should include top error codes with description and typescript.tv link', () => {
        const tscOutput =
          "src/a.test.js(1,1): error TS2304: Cannot find name 'foo'."
        const tsCodeLookup = (code) =>
          code === 2304 ? "Cannot find name '{0}'." : ''

        const { markdown } = buildSummary({
          tscOutput,
          changedFiles: [],
          tsCodeLookup
        })

        expect(markdown).toContain(
          "| 1 | [TS2304](https://typescript.tv/errors/ts2304/) | Cannot find name '{0}'. |"
        )
      })

      it('should fall back to in-output message when lookup yields nothing', () => {
        const tscOutput =
          'src/a.test.js(1,1): error TS9999: Some weird internal error.'

        const { markdown } = buildSummary({
          tscOutput,
          changedFiles: [],
          tsCodeLookup: noopLookup
        })

        expect(markdown).toContain('Some weird internal error.')
      })

      it('should include errors by file count, sorted descending', () => {
        const tscOutput = [
          'src/a.test.js(1,1): error TS2304: x.',
          'src/a.test.js(2,2): error TS2304: y.',
          'src/b.test.js(1,1): error TS2304: z.'
        ].join('\n')

        const { markdown } = buildSummary({
          tscOutput,
          changedFiles: [],
          tsCodeLookup: noopLookup
        })

        expect(markdown).toContain('Errors by file (count)')
        expect(markdown).toContain('2 src/a.test.js\n')
        expect(markdown).toContain('1 src/b.test.js\n')
        expect(markdown).not.toMatch(/src\/[ab]\.test\.js:/)
        expect(markdown.indexOf('src/a.test.js')).toBeLessThan(
          markdown.indexOf('src/b.test.js')
        )
      })

      it('should include the full error list verbatim', () => {
        const tscOutput =
          "src/a.test.js(1,1): error TS2304: Cannot find name 'foo'."

        const { markdown } = buildSummary({
          tscOutput,
          changedFiles: [],
          tsCodeLookup: noopLookup
        })

        expect(markdown).toContain('Full error list')
        expect(markdown).toContain(tscOutput)
      })
    })
  })

  describe('buildPrComment', () => {
    it('should include the pr-scope section', () => {
      const { markdown } = buildPrComment({
        tscOutput:
          "src/server/foo/foo.test.js(1,1): error TS2304: Cannot find name 'a'.",
        changedFiles: ['src/server/foo/foo.test.js']
      })

      expect(markdown).toContain('Lint Types - Tests')
      expect(markdown).toContain(
        '<details><summary><code>src/server/foo/foo.test.js</code> (1 errors)</summary>'
      )
    })

    it('should omit the all-errors section', () => {
      const { markdown } = buildPrComment({
        tscOutput: 'src/a.test.js(1,1): error TS2304: x.',
        changedFiles: []
      })

      expect(markdown).not.toContain('All errors')
      expect(markdown).not.toContain('Top error codes')
      expect(markdown).not.toContain('Errors by file (count)')
      expect(markdown).not.toContain('Full error list')
    })

    it('should include a link to the run when runUrl is given', () => {
      const { markdown } = buildPrComment({
        tscOutput: 'src/a.test.js(1,1): error TS2304: x.',
        changedFiles: [],
        runUrl: 'https://github.com/o/r/actions/runs/123'
      })

      expect(markdown).toContain(
        '[View full summary](https://github.com/o/r/actions/runs/123)'
      )
    })

    it('should not duplicate the clean message when changed files have no errors', () => {
      const { markdown } = buildPrComment({
        tscOutput: '',
        changedFiles: ['src/server/foo/foo.test.js'],
        runUrl: 'https://github.com/o/r/actions/runs/123'
      })
      const occurrences =
        markdown.split('No type errors in test files changed in this PR')
          .length - 1

      expect(occurrences).toBe(1)
    })

    it('should not include a run-url link when runUrl is omitted', () => {
      const { markdown } = buildPrComment({
        tscOutput: 'src/a.test.js(1,1): error TS2304: x.',
        changedFiles: []
      })

      expect(markdown).not.toContain('View full summary')
    })

    it('should propagate exit code when changed files have errors', () => {
      const result = buildPrComment({
        tscOutput:
          "src/server/foo/foo.test.js(1,1): error TS2304: Cannot find name 'a'.",
        changedFiles: ['src/server/foo/foo.test.js']
      })

      expect(result.exitCode).toBe(1)
    })
  })
})
