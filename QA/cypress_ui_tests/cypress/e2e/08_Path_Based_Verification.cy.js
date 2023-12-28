describe('Path match verification', () => {
    let BASE_URL = Cypress.env('BASE_PUB_URL');
    let EMAIL = Cypress.env('LOGIN_EMAIL');
    let PASSWORD = Cypress.env('LOGIN_PASSWORD');
    let SERVER_NAME = Cypress.env('SERVER_NAME');
    let FRONT_URL = Cypress.env('FRONTEND_URL');
    let TARGET_PLATFORM = Cypress.env('TARGET_PLATFORM');

    it('Verifying Path match rule for Starts_with, Ends_with and Equal condition', () => {
        let randomString = generateRandomString();
        cy.clearCookies()
        cy.clearAllSessionStorage()
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

        // Creating rule to verify the path match using start_with condition

        cy.get('#name').type(`Path rule starts_with by Cypress ${randomString}`);
        cy.get('#profile_id').click();
        cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="qa_test"]').click();
        cy.get('.matchRulePath div input').type("/rou");
        cy.get('input[name="match.response.code"]').clear();
        cy.get('input[name="match.response.code"]').type('{selectall}{backspace}');
        cy.get('input[name="match.response.code"]').type(200);
        cy.get('.matchResponseMessage div textarea[aria-invalid="false"]').type("c3RhcnRzIHdpdGggcGF0aCBydWxl");
        cy.get('form > .MuiToolbar-root > button').click();

        // Creating rule to verify the path match using ends_with condition

        cy.get('a[aria-label="Create"]').click();
        cy.get('#name').type(`Path rule ends_with by Cypress ${randomString}`);
        cy.get('#profile_id').click();
        cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="qa_test"]').click();
        cy.get('div[id="match.rules.path_key"]').click();
        cy.get(`li:contains('Ends With')`).click()
        cy.get('input[id="match.rules.path"]').type("ter");
        cy.get('input[name="match.response.code"]').clear();
        cy.get('input[name="match.response.code"]').type('{selectall}{backspace}');
        cy.get('input[name="match.response.code"]').type(200);
        cy.get('.matchResponseMessage div textarea[aria-invalid="false"]').type("ZW5kcyB3aXRoIHBhdGggcnVsZQ==");
        cy.get('form > .MuiToolbar-root > button').click();

        // Creating rule to verify the path match using equal condition

        cy.get('a[aria-label="Create"]').click();
        cy.get('#name').type(`Path rule equals by Cypress ${randomString}`);
        cy.get('#profile_id').click();
        cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="qa_test"]').click();
        cy.get('div[id="match.rules.path_key"]').click();
        cy.get(`li:contains('Equals')`).click()
        cy.get('input[id="match.rules.path"]').type("/path");
        cy.get('input[name="match.response.code"]').clear();
        cy.get('input[name="match.response.code"]').type('{selectall}{backspace}');
        cy.get('input[name="match.response.code"]').type(200);
        cy.get('.matchResponseMessage div textarea[aria-invalid="false"]').type("RXF1YWwgcGF0aCBwYXNzCg==");
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

        // Attach the Rules
        cy.get("#rules").click();
        cy.get(`li:contains('Path rule starts_with by Cypress ${randomString}')`).click();
        cy.get('button[class="MuiButtonBase-root MuiIconButton-root MuiIconButton-colorPrimary MuiIconButton-sizeSmall button-add button-add-match_cases css-941tgv"]').click();
        cy.wait(1000)
        cy.get('input[id="match_cases.0.statement"]').click();
        cy.wait(1000)
        cy.get(`li:contains('Path rule ends_with by Cypress ${randomString}')`).click();

        cy.get('div[id="match_cases.0.condition"]').click();
        cy.get('li[data-value="and"]').click();
        cy.wait(1000)
        cy.get('button[class="MuiButtonBase-root MuiIconButton-root MuiIconButton-colorPrimary MuiIconButton-sizeSmall button-add button-add-match_cases css-941tgv"]').click();
        cy.get('input[id="match_cases.1.statement"]').click();
        cy.get(`li:contains('Path rule equals by Cypress ${randomString}')`).click();
        cy.get('div[id="match_cases.1.condition"]').click();
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

        // Verifying path rule if matches with condition starts_with
        cy.wait(2000)
        cy.visit(FRONT_URL+'/route')
        cy.reload()
        cy.get('body').should("contain", "starts with")

        // Verifying path rule if matches with condition ends_with
        cy.wait(2000)
        cy.visit(FRONT_URL+'/outer', {failOnStatusCode: false})
        cy.reload()
        cy.get('body').should("contain", "ends with")

        // Verifying path rule if matches with condition equals
        cy.wait(2000)
        cy.visit(FRONT_URL+'/path')
        cy.reload()
        cy.get('body').should("contain", "Equal")


        // Getting the total numbers of the rules rows
        cy.visit(BASE_URL+"/#/rules")
        cy.wait(2000)
        cy.get('table[class="MuiTable-root RaDatagrid-table css-1owb465"]')
        .find("tr")
        .then((row) => {
        //row.length will give you the row count
        const totalRuleRow = row.length
        cy.log(totalRuleRow);
  
        // Delete the rules
        cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('Path rule starts_with by Cypress ${randomString}') .PrivateSwitchBase-input`).click()
        cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('Path rule ends_with by Cypress ${randomString}') .PrivateSwitchBase-input`).click()
        cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('Path rule equals by Cypress ${randomString}') .PrivateSwitchBase-input`).click()

        cy.get('button[aria-label="Delete"]').click();
        cy.wait(5000);
        cy.reload()

        cy.get('div[id="main-content"]').then(($rowTable) => {
          if ($rowTable.find(`table[class="MuiTable-root RaDatagrid-table css-1owb465"]`).length > 0) {
              cy.get(`table[class="MuiTable-root RaDatagrid-table css-1owb465"] .PrivateSwitchBase-input`).click()
              .find("tr")
              .then((newRow) => {
                const currentRuleRows = newRow.length;
  
                if (totalRuleRow === currentRuleRows) {
                  throw new Error('Rows count did not change after deletion');
                }
                cy.wait(4000);
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
    
