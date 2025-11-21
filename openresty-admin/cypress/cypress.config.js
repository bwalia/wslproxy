import { defineConfig } from "cypress";

export default defineConfig({
  video: true,
  e2e: {
    setupNodeEvents(on, config) {
      chromeWebSecurity: false;
      // implement node event listeners here
      // pageLoadTimeout: 100000;
    },
    supportFile: false
  },
});