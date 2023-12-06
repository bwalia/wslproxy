describe('Whitefalcon login test Int environment', () => {

  let urlStr = 'http://localhost:8081'
  let targetEnv = Cypress.env("CYPRESS_TARGET_ENV")
  if (targetEnv === "test") 
      urlStr = 'https://api.test.whitefalcon.io'
  else if (targetEnv === "int")
      urlStr = 'https://api.int2.whitefalcon.io'

  it('Login to Whitefalcon', () => {
    cy.visit(`${urlStr}/#/login`)

    var login_username_str = Cypress.env('LOGIN_EMAIL')
    var login_password_str = Cypress.env('LOGIN_PASSWORD')
    let randomString = generateRandomString();
    // Login to Whitefalcon
    cy.get('#email').type(login_username_str)
    cy.get('#password').type(login_password_str)
    cy.get('.MuiButtonBase-root').click()
    cy.wait(1000)
    // Select Storage Type Redis
    cy.get('.MuiDialogActions-root > .MuiButton-contained').click()
    cy.wait(2000)
    // Open the rules Section
    cy.get('[href="#/rules"]').click()
    cy.wait(800)
    cy.get('.RaCreateButton-root').click()
    cy.wait(500)
    // Add new Rule
    cy.get('#name').type(`Test Rule added by Cypress ${randomString}`)
    cy.get('#profile_id').click()
    cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="test"]').click()
    cy.get('.matchRulePath div input').type("/")
    cy.get('input[name="match.response.code"]').clear()
    cy.get('input[name="match.response.code"]').type('{selectall}{backspace}')
    cy.get('input[name="match.response.code"]').type(305)
    cy.get('input[name="match.response.redirect_uri"]').type('172.177.0.10:3009')
    cy.get('.matchResponseMessage div textarea[aria-invalid="false"]').type("VGhpcyBpcyB0ZXN0aW5nIGJ5IHRoZSBDeXByZXNzCg==")
    cy.get('form > .MuiToolbar-root > button').click()
    cy.wait(2000)
    // Open the server section
    cy.get('[href="#/servers"]').click()
    cy.wait(2000)
    cy.get('.RaCreateButton-root').click()
    cy.wait(1000)
    // Create a new Server
    cy.get('input[name="listens.0.listen"]').type(80)
    cy.get("#server_name").type("localhost")
    cy.get('#profile_id').click()
    cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="test"]').click()
    cy.get("#tabheader-1").click()
    // Attach the Rule
    cy.get("#rules").click()
    cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li:contains("' + randomString + '")').click()
    cy.wait(1000)
    cy.get('.RaToolbar-defaultToolbar > button.MuiButtonBase-root').click()
    cy.wait(2000)
    
    // Select the Profile
    cy.get('[aria-label="Select Environment Profile"]').click()
    cy.wait(800)
    cy.get("#demo-simple-select").click()
    cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="test"]').click()
    cy.wait(2000)
    // Sync the data
    // cy.get('button[aria-label="Sync API Storage"]').click()
    cy.wait(2000)

    cy.visit(`http://localhost:8000`)
  })

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

