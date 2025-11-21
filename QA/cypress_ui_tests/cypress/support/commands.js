// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })
Cypress.on('uncaught:exception', (err, runnable) => {
    // returning false here prevents Cypress from
    // failing the test
    return false
  })

// Helper function to generate random string for test data uniqueness
function generateRandomString(length = 8) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

// Make generateRandomString available globally
window.generateRandomString = generateRandomString;

// Custom command to cleanup existing test servers
Cypress.Commands.add('cleanupTestServer', (serverName, profileValue = 'qa_test') => {
    cy.get('a[href="#/servers"]').click();
    cy.get('[aria-label="Select Environment Profile"]').click();
    cy.get("#demo-simple-select").click();
    cy.get(`div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="${profileValue}"]`).click();
    cy.wait(3000);

    cy.get('div[id="main-content"]').then(($ele) => {
        if ($ele.find(`.MuiTableBody-root > .MuiTableRow-root:contains('${serverName}')`).length > 0) {
            cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('${serverName}') .PrivateSwitchBase-input`).click();
            cy.scrollTo('top');
            cy.get('button[aria-label="Delete"]').click();
            cy.wait(4000);
            cy.log(`Deleted existing server: ${serverName}`);
        } else {
            cy.log(`No existing server found: ${serverName}`);
        }
    });
});

// Custom command to cleanup existing test rules by pattern
Cypress.Commands.add('cleanupTestRules', (ruleNamePattern, profileValue = 'qa_test') => {
    cy.get('a[href="#/rules"]').click();
    cy.wait(2000);

    // Check if any rules match the pattern and delete them
    cy.get('div[id="main-content"]').then(($ele) => {
        const matchingRules = $ele.find(`.MuiTableBody-root > .MuiTableRow-root:contains('${ruleNamePattern}')`);
        if (matchingRules.length > 0) {
            // Select all matching rules
            matchingRules.each((index, row) => {
                cy.wrap(row).find('.PrivateSwitchBase-input').click();
            });
            cy.scrollTo('top');
            cy.get('button[aria-label="Delete"]').click();
            cy.wait(4000);
            cy.log(`Deleted ${matchingRules.length} existing rules matching: ${ruleNamePattern}`);
        } else {
            cy.log(`No existing rules found matching: ${ruleNamePattern}`);
        }
    });
});

// Custom command to login and select storage type
Cypress.Commands.add('loginAndSelectStorage', () => {
    const BASE_URL = Cypress.env('BASE_PUB_URL');
    const EMAIL = Cypress.env('LOGIN_EMAIL');
    const PASSWORD = Cypress.env('LOGIN_PASSWORD');

    cy.clearCookies();
    cy.clearAllSessionStorage();
    cy.visit(BASE_URL);
    cy.get('#email').type(EMAIL);
    cy.get('#password').type(PASSWORD);
    cy.get('button[type="submit"]').click();

    // Select Storage Type (Redis/Disk dialog)
    cy.get('.MuiDialogActions-root > .MuiButton-contained').click();
});

// Custom command to select profile
Cypress.Commands.add('selectProfile', (profileValue = 'qa_test') => {
    cy.get('[aria-label="Select Environment Profile"]').click();
    cy.get("#demo-simple-select").click();
    cy.get(`div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="${profileValue}"]`).click();
    cy.wait(2000);
});