module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    rootDir: './src',
    testMatch: ['**/*.spec.ts'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    transform: {
        '^.+\\.ts$': [
            'ts-jest',
            {
                tsconfig: {
                    // tsconfig.json의 설정을 상속
                    module: 'commonjs',
                    target: 'ES2022',
                    lib: ['ES2022'],
                    types: ['node'],
                    strict: true,
                    esModuleInterop: true,
                    allowSyntheticDefaultImports: true,
                    skipLibCheck: true,
                },
            },
        ],
    },
    collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!**/*.d.ts'],
    coverageDirectory: '../coverage',
}
