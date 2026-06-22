/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],

  // Phase 1: measure the transport-free game core. Later phases (socket/http/db) widen
  // this glob as those layers gain integration/API coverage.
  collectCoverageFrom: ['src/game/**/*.ts'],

  // Quality gate: `npm run test:coverage` fails the build if the core slips below these.
  coverageThreshold: {
    './src/game/': { statements: 90, branches: 85, functions: 90, lines: 90 },
    global: { statements: 80, branches: 70, functions: 80, lines: 80 },
  },
};
