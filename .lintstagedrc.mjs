export default {
  '*.{js,json,md}': 'prettier --write',
  'src/**/*.js': ['npm run lint:fix'],
  '*': () => {
    const bin = process.platform === 'win32' ? '.bin\\gitleaks.exe' : '.bin/gitleaks'
    return `${bin} protect --staged --no-banner --verbose`
  },
}
