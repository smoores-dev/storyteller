import {configDefaults, defineConfig} from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        exclude: [...configDefaults.exclude, '**/.tsbuild/**'],
        coverage: {
            include: ['src/**/*.ts'],
            exclude: ['**/*.spec.*'],
        },
        reporters: ['default', 'junit'],
        outputFile: 'test-reports/vitest-report.xml',
    },
});
