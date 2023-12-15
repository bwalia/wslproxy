describe('Token and authorization test rules', () => {
    let BASE_URL = Cypress.env('BASE_PUB_URL');
    let EMAIL = Cypress.env('LOGIN_EMAIL');
    let PASSWORD = Cypress.env('LOGIN_PASSWORD');
    let NODEAPP_IP = Cypress.env('NODEAPP_ORIGIN_HOST');
    let SERVER_NAME = Cypress.env('SERVER_NAME');
    let FRONT_URL = Cypress.env('FRONTEND_URL');
    let TARGET_PLATFORM = Cypress.env('TARGET_PLATFORM');
    let JWT_TOKEN_KEY = Cypress.env('JWT_TOKEN_KEY');


    it('Verifying authorization based test rule to access data with and without token', () => {
        cy.visit(BASE_URL);
        cy.get('#email').type(EMAIL);
        cy.get('#password').type(PASSWORD);
        cy.get('button[type="submit"]').click();

        // Select Storage Type Redis
        cy.get('.MuiDialogActions-root > .MuiButton-contained').click();

        // Open the rules Section
        cy.get('[href="#/rules"]').click();
        cy.get('.RaCreateButton-root').click();

        // Add Rule for access all
        cy.get('#name').type('Test rule to access all by Cypress');
        cy.get('#profile_id').click();
        cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="test"]').click();
        cy.get('.matchRulePath div input').type("/");
        cy.get('input[name="match.response.code"]').clear();
        cy.get('input[name="match.response.code"]').type('{selectall}{backspace}');
        cy.get('input[name="match.response.code"]').type(305);
        cy.get('input[name="match.response.redirect_uri"]').type(NODEAPP_IP);
        cy.get('.matchResponseMessage div textarea[aria-invalid="false"]').type("VGhpcyBpcyB0ZXN0aW5nIGJ5IHRoZSBDeXByZXNzCg==");
        cy.get('form > .MuiToolbar-root > button').click();

       // Add Rule for access with path api
       //  cy.get('[href="#/rules"]').click()
       cy.get('a[aria-label="Create"]').click();
       cy.get('#name').type('Test rule to access with /api by Cypress');
       cy.get('#profile_id').click();
       cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="test"]').click();
       cy.get('input[id="match.rules.path"]').type("/api");
       cy.get('input[name="match.response.code"]').clear();
       cy.get('input[name="match.response.code"]').type('{selectall}{backspace}');
       cy.get('input[name="match.response.code"]').type(305);
       cy.get('input[name="match.response.redirect_uri"]').type(NODEAPP_IP);
       cy.get('div[id="match.rules.jwt_token_validation"]').click();
       cy.get('li[data-value="cookie"]').click();
       cy.get('input[name="match.rules.jwt_token_validation_value"]').type('Authorization');
       cy.get('input[name="match.rules.jwt_token_validation_key"]').type(JWT_TOKEN_KEY);
       cy.get('.matchResponseMessage div textarea[aria-invalid="false"]').type("VGhpcyBpcyB0ZXN0aW5nIGJ5IHRoZSBDeXByZXNzCg==");
       cy.get('form > .MuiToolbar-root > button').click();

        // Open the server section
        cy.get('a[href="#/servers"]').click();
        cy.get('a[href="#/servers/create"]').click();

        // Create a new Server
        cy.get('input[name="listens.0.listen"]').type(80);
        cy.get('input[name="server_name"]').type(SERVER_NAME);
        cy.get('#profile_id').click();
        cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="test"]').click();
        cy.get('a[id="tabheader-1"]').click();

        // Attach the Rules
        cy.get("#rules").click();
        cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li:contains("Test rule to access all by Cypress")').click();
        cy.get('button[class="MuiButtonBase-root MuiIconButton-root MuiIconButton-colorPrimary MuiIconButton-sizeSmall button-add button-add-match_cases css-941tgv"]').click();
        cy.get('div[id="match_cases.0.statement"]').click();
        cy.contains('li[role="option"]', "Test rule to access with /api by Cypress").click();
        cy.contains('li[role="option"]', "Test rule to access with /api by Cypress").click();

        cy.get('div[id="match_cases.0.condition"]').click();
        cy.get('li[data-value="and"]').click();
        cy.get('.RaToolbar-defaultToolbar > button.MuiButtonBase-root').click();

        // Select the Profile
        cy.get('[aria-label="Select Environment Profile"]').click();
        cy.get("#demo-simple-select").click();
        cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="test"]').click();

        // Sync the data
        if (TARGET_PLATFORM == "kubernetes") {
        cy.get('button[aria-label="Sync API Storage"]').click()
        }
        cy.visit(FRONT_URL)
        cy.get('.container').should("contain", "Login")

        // Delete the rules
        cy.visit(BASE_URL+"/#/rules")
        cy.get('.MuiTableBody-root > .MuiTableRow-root:contains("Test rule to access all by Cypress") .PrivateSwitchBase-input').click()
        cy.get('.MuiTableBody-root > .MuiTableRow-root:contains("Test rule to access with /api by Cypress") .PrivateSwitchBase-input').click()
        cy.get('button[aria-label="Delete"]').click();

        // Delete the server
        cy.visit(BASE_URL+"/#/servers")

        // Getting the total numbers of the rows
        cy.get('table[class="MuiTable-root RaDatagrid-table css-1owb465"]')
          .find("tr")
          .then((row) => {
          //row.length will give you the row count
          const totalRow = row.length
          cy.log(totalRow);

          cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('${SERVER_NAME}') .PrivateSwitchBase-input`).click();
          cy.scrollTo('top');
          cy.get('button[aria-label="Delete"]').click();
          cy.wait(4000);

          const rowTable = cy.get('table[class="MuiTable-root RaDatagrid-table css-1owb465"]')
          if (rowTable){
            cy.get('table[class="MuiTable-root RaDatagrid-table css-1owb465"]')
              .find("tr")
              .then((newRow) => {
                const currentTotal = newRow.length;
  
                if (totalRow === currentTotal) {
                  throw new Error('Rows count did not change after deletion');
                }
                cy.wait(4000);
              });
          }else{
            cy.log('Not found any item, successfully deleted');
          }     
            
         });
     });
       
})
    
  