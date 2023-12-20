describe('Redirection based test rules', () => {
    let BASE_URL = Cypress.env('BASE_PUB_URL');
    let EMAIL = Cypress.env('LOGIN_EMAIL');
    let PASSWORD = Cypress.env('LOGIN_PASSWORD');
    let SERVER_NAME = Cypress.env('SERVER_NAME');
    let FRONT_URL = Cypress.env('FRONTEND_URL');
    let TARGET_PLATFORM = Cypress.env('TARGET_PLATFORM');

    it('Verifying redirections with 305, 302 and 301 status code', () => {
        let randomString = generateRandomString();
        cy.clearCookies()
        cy.clearAllSessionStorage()
        cy.visit(BASE_URL);
        cy.get('#email').type(EMAIL);
        cy.get('#password').type(PASSWORD);
        cy.get('button[type="submit"]').click();

        // Select Storage Type Redis
        cy.get('.MuiDialogActions-root > .MuiButton-contained').click();

        // Open the rules Section
        cy.get('[href="#/rules"]').click();
        cy.get('.RaCreateButton-root').click();

        // Add Rule for redirection with 305
        cy.get('#name').type(`Redirection Rule-305 by Cypress ${randomString}`);
        cy.get('#profile_id').click();
        cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="qa_test"]').click();
        cy.get('.matchRulePath div input').type("/");
        cy.get('input[name="match.response.code"]').clear();
        cy.get('input[name="match.response.code"]').type('{selectall}{backspace}');
        cy.get('input[name="match.response.code"]').type(305);
        cy.get('input[name="match.response.redirect_uri"]').type("httpbin.org");
        cy.get('.matchResponseMessage div textarea[aria-invalid="false"]').type("VGhpcyBpcyB0ZXN0aW5nIGJ5IHRoZSBDeXByZXNzCg==");
        cy.get('form > .MuiToolbar-root > button').click();

        // Add Rule for redirection with 302

        cy.get('a[aria-label="Create"]').click();
        cy.get('#name').type(`Redirection Rule-302 by Cypress ${randomString}`);
        cy.get('#profile_id').click();
        cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="qa_test"]').click();
        cy.get('input[id="match.rules.path"]').type("/google");
        cy.get('input[name="match.response.code"]').clear();
        cy.get('input[name="match.response.code"]').type('{selectall}{backspace}');
        cy.get('input[name="match.response.code"]').type(302);
        cy.get('input[name="match.response.redirect_uri"]').type("https://google.com");
        cy.get('.matchResponseMessage div textarea[aria-invalid="false"]').type("VGhpcyBpcyB0ZXN0aW5nIGJ5IHRoZSBDeXByZXNzCg==");
        cy.get('form > .MuiToolbar-root > button').click();

        // Add Rule for redirection with 301

        cy.get('a[aria-label="Create"]').click();
        cy.get('#name').type(`Redirection Rule-301 by Cypress ${randomString}`);
        cy.get('#profile_id').click();
        cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="qa_test"]').click();
        cy.get('input[id="match.rules.path"]').type("/dump");
        cy.get('input[name="match.response.code"]').clear();
        cy.get('input[name="match.response.code"]').type('{selectall}{backspace}');
        cy.get('input[name="match.response.code"]').type(301);
        cy.get('input[name="match.response.redirect_uri"]').type("https://httpdump.app/");
        cy.get('.matchResponseMessage div textarea[aria-invalid="false"]').type("VGhpcyBpcyB0ZXN0aW5nIGJ5IHRoZSBDeXByZXNzCg==");
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
        cy.get(`div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li:contains("Redirection Rule-305 by Cypress ${randomString}")`).click();
        cy.get('button[class="MuiButtonBase-root MuiIconButton-root MuiIconButton-colorPrimary MuiIconButton-sizeSmall button-add button-add-match_cases css-941tgv"]').click();
        cy.get('div[id="match_cases.0.statement"]').click();
        cy.get(`div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li:contains("Redirection Rule-302 by Cypress ${randomString}")`).click();

        cy.get('div[id="match_cases.0.condition"]').click();
        cy.get('li[data-value="and"]').click();
        cy.wait(1000)
        cy.get('button[class="MuiButtonBase-root MuiIconButton-root MuiIconButton-colorPrimary MuiIconButton-sizeSmall button-add button-add-match_cases css-941tgv"]').click();
        cy.get('div[id="match_cases.1.statement"]').click();
        cy.get(`div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li:contains("Redirection Rule-301 by Cypress ${randomString}")`).click();
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

        // Verifying Redirect rule-305
        cy.wait(2000)
        cy.visit(FRONT_URL)
        cy.reload()
        cy.get('h2[class="title"]').should("contain", "httpbin.org")

        // Verifying Redirect rule-302
        cy.visit(FRONT_URL+'/google')
        // cy.reload()
        cy.get('input[value="Google Search"]').should("be.visible")

        // Verifying Redirect rule-301
        cy.visit(FRONT_URL+'/dump')
       // cy.reload()
        cy.get('span[class="px-1 absolute top-0 left-0 z-10"]').should("contain", "HTTP Requests")
        

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
        cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains("Redirection Rule-305 by Cypress ${randomString}") .PrivateSwitchBase-input`).click()
        cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains("Redirection Rule-302 by Cypress ${randomString}") .PrivateSwitchBase-input`).click()
        cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains("Redirection Rule-301 by Cypress ${randomString}") .PrivateSwitchBase-input`).click()

        cy.get('button[aria-label="Delete"]').click();
        cy.reload()
        cy.wait(2000);

        const rowTable = cy.get('table[class="MuiTable-root RaDatagrid-table css-1owb465"]')
        if (rowTable){
          cy.get('table[class="MuiTable-root RaDatagrid-table css-1owb465"]')
            .find("tr")
            .then((newRow) => {
              const currentRuleRows = newRow.length;

              if (totalRuleRow === currentRuleRows) {
                throw new Error('Rows count did not change after deletion');
              }
              cy.wait(4000);
            });
        }else{
          cy.log('Not found any item, successfully deleted');
        }     
          

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
          cy.reload()
          cy.wait(4000);

          const rowTable = cy.get('table[class="MuiTable-root RaDatagrid-table css-1owb465"]')
          if (rowTable){
            cy.get('table[class="MuiTable-root RaDatagrid-table css-1owb465"]')
              .find("tr")
              .then((newRow) => {
                const currentServerTotal = newRow.length;
                cy.log(currentServerTotal);

                if (totalServerRow === currentServerTotal) {
                  throw new Error('Rows count did not change after deletion');
                }
                cy.wait(4000);
              });
          }else{
            cy.log('Not found any item, successfully deleted');
          }     
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
    
