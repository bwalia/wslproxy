describe('Client IP match verification', () => {
    let BASE_URL = Cypress.env('BASE_PUB_URL');
    let EMAIL = Cypress.env('LOGIN_EMAIL');
    let PASSWORD = Cypress.env('LOGIN_PASSWORD');
    let SERVER_NAME = Cypress.env('SERVER_NAME');
    let FRONT_URL = Cypress.env('FRONTEND_URL');
    let TARGET_PLATFORM = Cypress.env('TARGET_PLATFORM');

    it('Verifying Client IP match rule for valid, invalid and starts_with condition', () => {
        let randomString = generateRandomString();

        // Login and select storage type
        cy.loginAndSelectStorage();

        // Clean up any existing test server from previous runs
        cy.cleanupTestServer(SERVER_NAME, 'qa_test');

        // Clean up any leftover rules from previous test runs
        cy.cleanupTestRules('client IP match by Cypress', 'qa_test');

        // Open the rules Section
        cy.get('[href="#/rules"]').click();
        cy.get('.RaCreateButton-root').click();

        // Creating rule for allow request when the client IP is matched

        cy.get('#name').type(`Valid client IP match by Cypress ${randomString}`);
        cy.get('#profile_id').click();
        cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="qa_test"]').click();
        cy.get('.matchRulePath div input').type("/valid");
        cy.get('div[id="match.rules.country"]').click()
        cy.get(`li:contains('Belgium (BE)')`).scrollIntoView()
        cy.get(`li:contains('Belgium (BE)')`).click();
        cy.get('input[id="match.rules.client_ip"]').type("104.155.127.255")
        cy.get('input[name="match.response.code"]').clear();
        cy.get('input[name="match.response.code"]').type('{selectall}{backspace}');
        cy.get('input[name="match.response.code"]').type(200);
        cy.get('.matchResponseMessage div textarea[aria-invalid="false"]').type("Y2xpZW50LWlwLW1hdGNoZWQ=");
        cy.get('form > .MuiToolbar-root > button').click();

        // Creating rule with the invalid client IP 

        cy.get('a[aria-label="Create"]').click();
        cy.get('#name').type(`Invalid client IP match by Cypress ${randomString}`);
        cy.get('#profile_id').click();
        cy.wait(1000)
        cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="qa_test"]').click();
        cy.get('input[id="match.rules.path"]').type("/invalid");
        cy.get('div[id="match.rules.country"]').click()
        cy.get(`li:contains('India (IN)')`).scrollIntoView()
        cy.get(`li:contains('India (IN)')`).click();
        cy.get('input[id="match.rules.client_ip"]').type("104.155.127.255")
        cy.get('input[name="match.response.code"]').clear();
        cy.get('input[name="match.response.code"]').type('{selectall}{backspace}');
        cy.get('input[name="match.response.code"]').type(200);
        cy.get('.matchResponseMessage div textarea[aria-invalid="false"]').type("Y2xpZW50LWlwLW1hdGNoZWQ=");
        cy.get('form > .MuiToolbar-root > button').click();

        // Creating rule for allow request when the client IP is matched with the condition starts with

        cy.get('a[aria-label="Create"]').click();
        cy.get('#name').type(`Valid client IP match-starts_with by Cypress ${randomString}`);
        cy.get('#profile_id').click();
        cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="qa_test"]').click();
        cy.get('input[id="match.rules.path"]').type("/start");
        cy.get('div[id="match.rules.country"]').click()
        cy.get(`li:contains('Belgium (BE)')`).scrollIntoView()
        cy.get(`li:contains('Belgium (BE)')`).click();
        cy.get('div[id="match.rules.client_ip_key"]').click()
        cy.get(`li:contains('Starts With')`).click()
        cy.get('input[id="match.rules.client_ip"]').type("104.155")
        cy.get('input[name="match.response.code"]').clear();
        cy.get('input[name="match.response.code"]').type('{selectall}{backspace}');
        cy.get('input[name="match.response.code"]').type(200);
        cy.get('.matchResponseMessage div textarea[aria-invalid="false"]').type("Y2xpZW50LWlwLW1hdGNoZWQ=");
        cy.get('form > .MuiToolbar-root > button').click();
  
        // Open the server section
        cy.wait(2000)
        cy.get('a[href="#/servers"]').click();
        cy.wait(2000)
        cy.get('a[href="#/servers/create"]').click();
        cy.wait(2000)
        // Create a new Server
        cy.get('input[name="listens.0.listen"]').type(80);
        cy.wait(1000)
        cy.get('input[id="server_name"]').type(SERVER_NAME);
        cy.wait(1000)
        cy.get('div[id="profile_id"]').click();
        cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="qa_test"]').click();
        cy.get('a[id="tabheader-1"]').click();

        // Attach the Rules
        cy.get("#rules").click();
        cy.get(`li:contains('Valid client IP match by Cypress ${randomString}')`).click();
        cy.get('button[class="MuiButtonBase-root MuiIconButton-root MuiIconButton-colorPrimary MuiIconButton-sizeSmall button-add button-add-match_cases css-941tgv"]').click();
        cy.wait(2000)
        cy.get('input[id="match_cases.0.statement"]').click();
        cy.wait(2000)
        cy.get(`li:contains("Invalid client IP match by Cypress ${randomString}")`).click();

        cy.get('div[id="match_cases.0.condition"]').click();
        cy.get('li[data-value="and"]').click();
        cy.wait(1000)
        cy.get('button[class="MuiButtonBase-root MuiIconButton-root MuiIconButton-colorPrimary MuiIconButton-sizeSmall button-add button-add-match_cases css-941tgv"]').click();
        cy.get('input[id="match_cases.1.statement"]').click();
        cy.get(`li:contains("Valid client IP match-starts_with by Cypress ${randomString}")`).click();
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

        // Verifying client IP match with valid client IP
        cy.wait(2000)
        cy.visit(FRONT_URL+'/valid')
        cy.reload()
        cy.get('body').should("contain", "client-ip-matched")

        // Verifying client IP match with invalid client IP
        cy.wait(2000)
        cy.visit(FRONT_URL+'/invalid', {failOnStatusCode: false})
        cy.reload()
        cy.get('div[class="container"]').should("contain", "Configuration not match!")

        // Verifying client IP match with condition starts_with
        cy.wait(2000)
        cy.visit(FRONT_URL+'/start')
        cy.reload()
        cy.get('body').should("contain", "client-ip-matched")


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
        cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('Valid client IP match by Cypress ${randomString}') .PrivateSwitchBase-input`).click()
        cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('Invalid client IP match by Cypress ${randomString}') .PrivateSwitchBase-input`).click()
        cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('Valid client IP match-starts_with by Cypress ${randomString}') .PrivateSwitchBase-input`).click()

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

        // Reset the Profile back to the int
        cy.wait(2000);
        cy.get('[aria-label="Select Environment Profile"]').click();
        cy.get("#demo-simple-select").click();
        cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="int"]').click();

        // Sync the data
        cy.wait(3000);
        cy.get('button[aria-label="Sync API Storage"]').click({force: true})  
        cy.wait(2000);
      
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
    
