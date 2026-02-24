module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/orchestrator'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'orchestrator/**/*.ts',
    '!orchestrator/**/*.test.ts',
    '!orchestrator/**/*.d.ts',
  ],
};
