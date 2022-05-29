module.exports = {
  verbose: true,
  preset: 'jest-puppeteer',
  transform: {
    '^.+\\.(t|j)sx?$': '@swc/jest'
  }
}
