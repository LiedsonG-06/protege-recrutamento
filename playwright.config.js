import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/e2e', fullyParallel:false, workers:1, retries:0,
  timeout:30000, use:{baseURL:'http://127.0.0.1:4175',browserName:'chromium',launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {},trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'node tests/support/browser-server.mjs',url:'http://127.0.0.1:4175',reuseExistingServer:false,timeout:30000},
});
