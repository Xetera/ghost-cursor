module.exports = {
  verbose: true,
  preset: 'jest-puppeteer',
  modulePathIgnorePatterns: ['./lib'],
  transform: {
    '^.+\\.(t|j)sx?$': '@swc/jest'
  }
}
