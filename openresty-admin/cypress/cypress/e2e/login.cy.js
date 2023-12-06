describe('Whitefalcon login test Int environment', () => {

  let urlStr = 'https://api.int2.whitefalcon.io/#/login'
  let targetEnv = Cypress.env("CYPRESS_TARGET_ENV")
  if (targetEnv === "test") 
      urlStr = 'https://api.test.whitefalcon.io/#/login'
  else if (targetEnv === "int")
      urlStr = 'https://api.int2.whitefalcon.io/#/login'

  it('Login to Whitefalcon', () => {
    cy.visit(urlStr)

    var login_username_str = Cypress.env('LOGIN_EMAIL')
    var login_password_str = Cypress.env('LOGIN_PASSWORD')
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
    cy.get('#name').type("Test Rule")
    cy.get('#profile_id').click()
    cy.get('div.MuiPaper-root.MuiMenu-paper ul.MuiMenu-list li[data-value="test"]').click()
    cy.get('.matchRulePath div input').type("/")
    cy.get('.matchResponseCode div input').type(200)
    cy.get('.matchResponseMessage div input').type("VGhpcyBpcyB0ZXN0aW5nIGJ5IHRoZSBDeXByZXNzCg==")
    cy.get('form > .MuiToolbar-root > button').click()

    // Open the server section
  })

})

