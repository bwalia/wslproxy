describe('Brahmstra login test Int environment', () => {

  let BASE_PUB_URL = Cypress.env('BASE_PUB_URL') || 'http://localhost:8081'
  let ALLOWED_IP = Cypress.env('ALLOWED_IP') || '103.217.123.221'
  let REDIRECT_ORIGIN = Cypress.env('NODEAPP_ORIGIN_HOST') || '172.177.0.10:3009'
  let ERROR_HTML = Cypress.env('ERROR_HTML')|| "ERROR 403"
  let FRONTEND_URL = Cypress.env('FRONTEND_URL')|| 'http://localhost:8000'
  let TARGET_PLATFORM = Cypress.env('TARGET_PLATFORM') || 'docker'
  let SERVER_NAME = Cypress.env('SERVER_NAME') || 'localhost'


  it('Login to Whitefalcon', () => {
      cy.visit(`${BASE_PUB_URL}/#/login`)
      let username_login = "ejeyd@example.com"
      let username_password = "admin"
      let nameString = generateRandomString();
      cy.get("#email").type(username_login)
      cy.get("#password").type(username_password)
      cy.get('.MuiButtonBase-root').click()
      cy.wait(1000)
      // Select Storage Type disk
  cy.get('.MuiDialogActions-root > .MuiButton-outlined').click()
  cy.wait(2000)

   // click on rules
   cy.get('[href="#/rules"]').click()
   cy.wait(800)
   cy.get('.RaCreateButton-root').click()
   cy.wait(500)

    // Adding new Rule
  cy.get('#name').type(`Test Rule added by Cypress ${nameString}`)
  cy.get('#profile_id').click()
  cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="dev"]').click()
  cy.get('.matchRulePath div input').type("/api")
  // cy.get('input[name="match.rules.client_ip"]').type(allowed_ip)
  cy.get('input[name="match.response.code"]').clear()
  cy.get('input[name="match.response.code"]').type('{selectall}{backspace}')
  cy.get('input[name="match.response.code"]').type(305)
  cy.get('input[name="match.response.redirect_uri"]').type(REDIRECT_ORIGIN)
  cy.get('.matchResponseMessage div textarea[aria-invalid="false"]').type(ERROR_HTML)
  cy.get('form > .MuiToolbar-root > button').click()
  cy.wait(2000)
  // opening servers
  cy.get('[href="#/servers"]').click()
  cy.wait(2000)
  cy.get('.RaCreateButton-root').click()
  cy.wait(1000)

   // Create a new Server
   cy.get('input[name="listens.0.listen"]').type(80)
   cy.get("#server_name").type(SERVER_NAME)
   cy.get('#profile_id').click()
   cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="dev"]').click()
   cy.get("#tabheader-1").click()
   // Attach the Rule
   cy.get("#rules").click()
   cy.get('div[role="presentation"] div.MuiPaper-root ul.MuiAutocomplete-listbox li:contains("' + nameString + '")').click()
   cy.wait(1000)
   cy.get('.RaToolbar-defaultToolbar > button.MuiButtonBase-root').click()
   cy.wait(2000)

     // Select the Profile
  cy.get('[aria-label="Select Environment Profile"]').click()
  cy.wait(800)
  cy.get("#demo-simple-select").click()
  cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="dev"]').click()
  cy.wait(2000)
  // Sync the data
  
  if (TARGET_PLATFORM == "kubernetes") {
    cy.get('button[aria-label="Sync API Storage"]').click()
  }
  
  cy.wait(2000)
  cy.visit(FRONTEND_URL)

  cy.wait(4000)
  cy.visit(BASE_PUB_URL)
  cy.get('[href="#/rules"]').click()
  cy.wait(800)

  cy.get('input[name="q"]').type(nameString)
  cy.wait(2000)
  cy.get('div.RaDatagrid-tableWrapper table tr td span:contains("' + nameString + '")').parent().prev().click()
  cy.get('button[aria-label="Delete"]').click()
  cy.get('[href="#/servers"]').click()
  cy.wait(2000)
  cy.get('div.RaDatagrid-tableWrapper table tr td span:contains("' + SERVER_NAME + '")').parent().prev().click()
  cy.get('button[aria-label="Delete"]').click()



})

function generateRandomString() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let nameString = '';

  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    nameString += characters.charAt(randomIndex);
  }

  return nameString;
}

})





