// Only used by capture_ui.spec.ts (run through extension/node_modules/.bin/playwright).
module.exports = { testDir: '.', testMatch: 'capture_ui.spec.ts', timeout: 180000, workers: 1, retries: 0, reporter: [['list']] };
