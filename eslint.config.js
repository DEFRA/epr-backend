import neostandard from 'neostandard'
import pluginImport from 'eslint-plugin-import'

export default neostandard({
  env: ['node', 'jest'],
  ignores: [...neostandard.resolveIgnoresFromGitignore()],
  noJsx: true,
  noStyle: true,
  extends: [
    {
      plugins: {
        import: pluginImport
      },
      rules: {
        'import/no-duplicates': 'error'
        // you can add more import-related rules here if needed
      },
      settings: {
        'import/resolver': {
          node: {
            extensions: ['.js', '.json']
          }
        }
      }
    }
  ]
})
