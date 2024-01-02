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
        let randomString = generateRandomString();
        cy.clearCookies()
        cy.visit(BASE_URL);
        cy.get('#email').type(EMAIL);
        cy.get('#password').type(PASSWORD);
        cy.get('button[type="submit"]').click();

        // Select Storage Type Redis
        cy.get('.MuiDialogActions-root > .MuiButton-contained').click();

        // Cleaning the rule server config from previous test if exist
        cy.get('a[href="#/servers"]').click();
          // Select the Profile
        cy.get('[aria-label="Select Environment Profile"]').click();
        cy.get("#demo-simple-select").click();
        cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="qa_test"]').click();
        cy.wait(6000)
 
        cy.get('div[id="main-content"]').then(($ele) => {
          if ($ele.find(`.MuiTableBody-root > .MuiTableRow-root:contains('${SERVER_NAME}')`).length > 0) {
              cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('${SERVER_NAME}') .PrivateSwitchBase-input`).click()
                cy.scrollTo('top');
                cy.get('button[aria-label="Delete"]').click();
                cy.wait(4000);
          } else {
                cy.log("No previous config found")
            }
      })


        // Open the rules Section
        cy.get('[href="#/rules"]').click();
        cy.get('.RaCreateButton-root').click();

        // Add Rule for access all
        cy.get('#name').type(`Test rule to access all by Cypress ${randomString}`);
        cy.get('#profile_id').click();
        cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="qa_test"]').click();
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
       cy.get('#name').type(`Test rule to access with /api by Cypress ${randomString}`);
       cy.get('#profile_id').click();
       cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="qa_test"]').click();
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
       cy.wait(2000)

        // Open the server section
        cy.get('a[href="#/servers"]').click();
        cy.wait(1000)
        cy.get('a[href="#/servers/create"]').click();
        cy.wait(1000)
        // Create a new Server
        cy.get('input[name="listens.0.listen"]').type(80);
        cy.get('input[id="server_name"]').type(SERVER_NAME);
        cy.wait(1000)
        cy.get('div[id="profile_id"]').click();
        cy.wait(1000)
        cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="qa_test"]').click();
        cy.get('a[id="tabheader-1"]').click();
        cy.wait(2000)
        // Attach the Rules
        cy.get("#rules").click();
        cy.get(`li:contains("Test rule to access all by Cypress ${randomString}")`).click();
        cy.get('button[class="MuiButtonBase-root MuiIconButton-root MuiIconButton-colorPrimary MuiIconButton-sizeSmall button-add button-add-match_cases css-941tgv"]').click();
        cy.get('input[id="match_cases.0.statement"]').click();
        cy.get(`li:contains("Test rule to access with /api by Cypress ${randomString}")`).click();

        cy.get('div[id="match_cases.0.condition"]').click();
        cy.get('li[data-value="and"]').click();
        cy.get('.RaToolbar-defaultToolbar > button.MuiButtonBase-root').click();

        // Select the Profile
        cy.get('[aria-label="Select Environment Profile"]').click();
        cy.get("#demo-simple-select").click();
        cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="qa_test"]').click();

        // Sync the data
        if (TARGET_PLATFORM == "kubernetes") {
        cy.get('button[aria-label="Sync API Storage"]').click()
        }

        cy.wait(2000)
        cy.visit(FRONT_URL)
        cy.get('.container').should("contain", "Login")

        // Verifying accessing API without login or Authorization token in cookies
        cy.visit(FRONT_URL+'/api/v2/sample-data.json', {failOnStatusCode: false})
        cy.get('.container').should("contain", "Configuration not match!")

        // Login into the sample App to get the Authorization token
        cy.visit(FRONT_URL)
        cy.get('#email').type(EMAIL);
        cy.get('#password').type(PASSWORD);
        cy.get('button[type="submit"]').click();

        // Verifying accessing API with Authorization token in cookies
        cy.request(FRONT_URL+'/api/v2/sample-data.json').then((response) => {
          expect(response.status).to.eq(200)
          expect(response.body).to.have.property('images')
        })


        // Getting the total numbers of the rules rows
        cy.visit(BASE_URL+"/#/rules")
        cy.get('table[class="MuiTable-root RaDatagrid-table css-1owb465"]')
        .find("tr")
        .then((row) => {
        //row.length will give you the row count
        const totalRuleRow = row.length
        cy.log(totalRuleRow);
  
        // Delete the rules
        cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains("Test rule to access all by Cypress ${randomString}") .PrivateSwitchBase-input`).click()
        cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains("Test rule to access with /api by Cypress ${randomString}") .PrivateSwitchBase-input`).click()
        cy.get('button[aria-label="Delete"]').click();
        cy.wait(5000);
        cy.reload()

        cy.get('div[id="main-content"]').then(($rowTable) => {
          if ($rowTable.find(`table[class="MuiTable-root RaDatagrid-table css-1owb465"]`).length > 0) {
              cy.get(`table[class="MuiTable-root RaDatagrid-table css-1owb465"]`).click()
              .find("tr")
              .then((newRow) => {
                const currentRuleRows = newRow.length;
  
                if (totalRuleRow === currentRuleRows) {
                  throw new Error('Rows count did not change after deletion');
                }
              });
          } else {
            cy.log('Not found the Rules, successfully deleted');
          }
        })

        // Delete the server
        cy.visit(BASE_URL+"/#/servers")
        cy.wait(2000)
        // Getting the total numbers of the server rows
        cy.get('table[class="MuiTable-root RaDatagrid-table css-1owb465"]')
          .find("tr")
          .then((row) => {
          //row.length will give you the row count
          const totalServerRow = row.length
          cy.log(totalServerRow);

          cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('${SERVER_NAME}') .PrivateSwitchBase-input`).click();
          cy.scrollTo('top');
          cy.get('button[aria-label="Delete"]').click();
          cy.wait(5000);
          cy.reload()

          cy.get('div[id="main-content"]').then(($rowTable) => {
            if ($rowTable.find(`table[class="MuiTable-root RaDatagrid-table css-1owb465"]`).length > 0) {
              cy.get('table[class="MuiTable-root RaDatagrid-table css-1owb465"]')
                .find("tr")
                .then((newRow) => {
                  const currentServerTotal = newRow.length;
                  cy.log(currentServerTotal);

                  if (totalServerRow === currentServerTotal) {
                    throw new Error('Rows count did not change after deletion');
                  }
                });
            }else{
              cy.log('Not found the Server, successfully deleted');
            }   
            })
          })
         });
     });

    function generateRandomString() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let randomString = '';
  
    for (let i = 0; i < 6; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      randomString += characters.charAt(randomIndex);
    }
  
    return randomString;
  }
})
    
