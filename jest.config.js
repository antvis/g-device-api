module.exports = {
  testTimeout: 100000,
  testMatch: ['<rootDir>/__tests__/*.spec.+(ts|tsx|js)'],
  preset: 'ts-jest',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  modulePathIgnorePatterns: ['dist'],
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        isolatedModules: true,
        tsconfig: {
          allowJs: true,
          target: 'esnext',
          esModuleInterop: true,
        },
      },
    ],
  },
  transformIgnorePatterns: [
    // @see https://stackoverflow.com/a/69179139
    '/node_modules/(?!d3|d3-array|internmap|delaunator|robust-predicates)',
  ],
};
