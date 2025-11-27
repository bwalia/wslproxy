const { defineConfig } = require("cypress");

module.exports = defineConfig({
  video: true,
  e2e: {
    setupNodeEvents(on, config) {
      // chromeWebSecurity: false;
      // implement node event listeners here
      // pageLoadTimeout: 100000;
    },
    chromeWebSecurity: false,
    supportFile: false
  },
});
