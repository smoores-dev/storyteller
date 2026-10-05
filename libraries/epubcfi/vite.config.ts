import {playwright} from '@vitest/browser-playwright';
import {defineConfig} from 'vitest/config';

export default defineConfig({
    test: {
        browser: {
            enabled: true,
            headless: true,
            screenshotFailures: false,

            instances: [
                {
                    browser: 'chromium',
                    provider: playwright(
                        {
                            launchOptions: {
                                channel: 'chrome',
                            },
                        }
                    ),
                },
            ],
        },
        coverage: {
            include: ['src/**/*.ts'],
            exclude: ['**/*.spec.*'],
        },
        reporters: ['default', 'junit'],
        outputFile: 'test-reports/vitest-report.xml',
    },
});