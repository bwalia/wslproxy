const { defineConfig } = require("cypress");

module.exports = {
  reporter: 'cypress-mochawesome-reporter',

  e2e: {
    downloadsFolder : 'cypress/download	',
    setupNodeEvents(on, config) {
      require('cypress-mochawesome-reporter/plugin')(on);
      // implement node event listeners here
    },
  },
};
