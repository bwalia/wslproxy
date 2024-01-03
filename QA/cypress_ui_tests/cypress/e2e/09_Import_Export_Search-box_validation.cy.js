describe('Import & Export validation and Search Box validation', () => {
  let BASE_URL = Cypress.env('BASE_PUB_URL'); 
  let EMAIL = Cypress.env('LOGIN_EMAIL'); 
  let PASSWORD = Cypress.env('LOGIN_PASSWORD'); 
  let SERVER_NAME = Cypress.env('SERVER_NAME');


    it('Verifying import & export feature and Rule Search box', () => {
      let randomString = generateRandomString();
      cy.visit(BASE_URL);
      cy.get('#email').type(EMAIL);
      cy.get('#password').type(PASSWORD);
      cy.get('button[type="submit"]').click();

      // Select Storage Type Redis
      cy.get('.MuiDialogActions-root > .MuiButton-contained').click(); 

      // Testing the Export feature
      cy.log('Testing Export feature..')
      // Checking if there is a server exist to do export; if not, create a server and export
      cy.get('a[href="#/servers"]').click();
      // Select the Profile
      cy.get('[aria-label="Select Environment Profile"]').click();
      cy.get("#demo-simple-select").click();
      cy.wait(1000)
      cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="qa_test"]').click();
      cy.wait(7000)  
      cy.get('div[id="main-content"]').then(($ele) => {
          if ($ele.find(`.MuiTableBody-root > .MuiTableRow-root:contains('${SERVER_NAME}')`).length > 0) {
            cy.get('button[aria-label="Export"]').click()
            cy.wait(5000)
          } else {
            // Create a new Server
            cy.get('a[href="#/servers/create"]').click();
            cy.get('input[name="listens.0.listen"]').type(80);
            cy.wait(1000)
            cy.get('input[id="server_name"]').type(SERVER_NAME);
            cy.wait(1000)
            cy.get('div[id="profile_id"]').click();
            cy.wait(1000)
            cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="qa_test"]').click(); 
            cy.get('.RaToolbar-defaultToolbar > button.MuiButtonBase-root').click();
            // Click on Export button
            cy.wait(2000)
            cy.get('button[aria-label="Export"]').click()
            cy.wait(5000)
        }
      })
      // Verifying the file is downloaded successfully
      cy.readFile('./cypress/downloads/servers.json').should('exist')
      

      // Testing the Import feature
      cy.log('Testing Import feature..')
        // Removing the server to avoid duplication
      cy.get('a[href="#/servers"]').click();
      cy.get('div[id="profile_id"]').click();
      cy.wait(1000)
      cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="qa_test"]').click();  
      cy.wait(1000)
      cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('${SERVER_NAME}') .PrivateSwitchBase-input`).click();
      cy.scrollTo('top');
      cy.get('button[aria-label="Delete"]').click();
      cy.wait(5000);
      cy.reload();
      cy.wait(2000);

      // Importing a server json file
      cy.get('input[type="file"]').selectFile('./cypress/downloads/servers.json', { force: true });
      cy.wait(2000);
    
      // Verifying if the import was successfull to create the server
      cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('${SERVER_NAME}')`).should('exist');
      // Verifying if the imported server is interactable
      cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('${SERVER_NAME}')`).click();
      cy.get(`a[id='tabheader-1']`).should('exist');
      cy.log('Successfully imported server');

      // Delete the imported server
      cy.get('a[href="#/servers"]').click();
      cy.get('div[id="profile_id"]').click();
      cy.wait(1000)
      cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="qa_test"]').click();  
      cy.wait(1000)
      cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('${SERVER_NAME}') .PrivateSwitchBase-input`).click();
      cy.scrollTo('top');
      cy.get('button[aria-label="Delete"]').click();
      cy.wait(5000);
      cy.reload();
      cy.wait(2000);      




    //  Verifying the search box results in Rules
      cy.log('Testing Search Box for rules..');
      cy.visit(BASE_URL+"/#/rules");
      // Creating two rules for the rules search result filter
      // Rule 1
      cy.get('.RaCreateButton-root').click();
      cy.get('#name').type(`Test rule API$%!123 by Cypress ${randomString}`);
      cy.get('#profile_id').click();
      cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="qa_test"]').click();
      cy.get('.matchRulePath div input').type("/");
      cy.get('form > .MuiToolbar-root > button').click();
      
      // Rule 2
      cy.get('.RaCreateButton-root').click();
      cy.get('#name').type(`Test rule abyz!@45 by Cypress ${randomString}`);
      cy.get('#profile_id').click();
      cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="qa_test"]').click();
      cy.get('.matchRulePath div input').type("/");
      cy.get('form > .MuiToolbar-root > button').click();
      cy.wait(3000)
      cy.reload()
      cy.wait(2000)

      // Checking if it's case-insensitive
      cy.get('input[id="q"]').type('api');
      cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('Test rule API$%!123 by Cypress ${randomString}')`).should('exist');
      cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('Test rule abyz!@45 by Cypress ${randomString}')`).should('not.exist');
      cy.wait(2000);

      cy.get('input[id="q"]').clear()
      cy.get('input[id="q"]').type('ABYZ');
      cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('Test rule API$%!123 by Cypress ${randomString}')`).should('not.exist');
      cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('Test rule abyz!@45 by Cypress ${randomString}')`).should('exist');
      cy.wait(2000);

      // Checking if getting relevant results with symbolic character
      cy.get('input[id="q"]').clear()
      cy.get('input[id="q"]').type('$');
      cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('Test rule API$%!123 by Cypress ${randomString}')`).should('exist');
      cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('Test rule abyz!@45 by Cypress ${randomString}')`).should('not.exist');
      cy.wait(2000);

      cy.get('input[id="q"]').clear()
      cy.get('input[id="q"]').type('@');
      cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('Test rule API$%!123 by Cypress ${randomString}')`).should('not.exist');
      cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('Test rule abyz!@45 by Cypress ${randomString}')`).should('exist');
      cy.wait(2000);

      // Checking if getting relevant results with numbers
      cy.get('input[id="q"]').clear()
      cy.get('input[id="q"]').type('123');
      cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('Test rule API$%!123 by Cypress ${randomString}')`).should('exist');
      cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('Test rule abyz!@45 by Cypress ${randomString}')`).should('not.exist');
      cy.wait(2000);

      cy.get('input[id="q"]').clear()
      cy.get('input[id="q"]').type('45');
      cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('Test rule API$%!123 by Cypress ${randomString}')`).should('not.exist');
      cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('Test rule abyz!@45 by Cypress ${randomString}')`).should('exist');
      cy.wait(2000);

   
      // Checking if getting relevant results with non-existing input
      cy.get('input[id="q"]').clear()
      cy.get('input[id="q"]').type('not here');
      cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('Test rule API$%!123 by Cypress ${randomString}')`).should('not.exist');
      cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains('Test rule abyz!@45 by Cypress ${randomString}')`).should('not.exist');
      cy.wait(2000);


      // Deleting rules created for search filter
      cy.get('input[id="q"]').clear()
      cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains("Test rule API$%!123 by Cypress ${randomString}") .PrivateSwitchBase-input`).click()
      cy.get(`.MuiTableBody-root > .MuiTableRow-root:contains("Test rule abyz!@45 by Cypress ${randomString}") .PrivateSwitchBase-input`).click()
      cy.get('button[aria-label="Delete"]').click();
      cy.wait(5000);
      cy.reload()

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
})      