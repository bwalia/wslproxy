describe('Whitefalcon login test', () => {
  let BASE_URL = Cypress.env('BASE_PUB_URL') 
  let EMAIL = Cypress.env('LOGIN_EMAIL') 
  let PASSWORD = Cypress.env('LOGIN_PASSWORD') 


  it('Login with invalid email and invalid password', () => {
    cy.visit(`${BASE_URL}/#/login`)
    cy.get('#email').type('test@example.com')
    cy.get('#password').type('fakepass')
    cy.get('button[type="submit"]').click()
    cy.get('.MuiSnackbarContent-message.css-1w0ym84').should("contain", "Invalid email or password")
})  

  it('Login with invalid email and valid password', () => {
    cy.visit(`${BASE_URL}/#/login`)
    cy.get('#email').clear()
    cy.get('#password').clear()  
    cy.get('#email').type('abc')
    cy.get('#password').type(PASSWORD)
    cy.get('button[type="submit"]').click()
    cy.get('.MuiSnackbarContent-message.css-1w0ym84').should("contain", "Invalid email or password")

  })

  it('Login with valid email and invalid password', () => {
    cy.visit(`${BASE_URL}/#/login`)
    cy.get('#email').clear()
    cy.get('#password').clear()  
    cy.get('#email').type(EMAIL)
    cy.get('#password').type('fakepass')
    cy.get('button[type="submit"]').click()
    cy.get('.MuiSnackbarContent-message.css-1w0ym84').should("contain", "Invalid email or password")
})

it('Login with valid email and empty password', () => {
  cy.visit(`${BASE_URL}/#/login`)
  cy.get('#email').clear()
  cy.get('#password').clear()  
  cy.get('#email').type(EMAIL)
  cy.get('button[type="submit"]').click()
  cy.get('.MuiSnackbarContent-message.css-1w0ym84').should("contain", "Invalid email or password")

})

it('Login with empty email and valid password', () => {
  cy.visit(`${BASE_URL}/#/login`)
  cy.get('#email').clear()
  cy.get('#password').clear()  
  cy.get('#password').type(PASSWORD)
  cy.get('button[type="submit"]').click()
  cy.get('.MuiSnackbarContent-message.css-1w0ym84').should("contain", "Invalid email or password")

})

it('Login with empty email and empty password', () => {
  cy.visit(`${BASE_URL}/#/login`)
  cy.get('#email').clear()
  cy.get('#password').clear()  
  cy.get('button[type="submit"]').click()
  cy.get('.MuiSnackbarContent-message.css-1w0ym84').should("contain", "Invalid email or password")

})

it('Login with valid email and valid password', () => {
  cy.visit(`${BASE_URL}/#/login`)
  cy.get('#email').clear()
  cy.get('#password').clear()  
  cy.get('#email').type(EMAIL)
  cy.get('#password').type(PASSWORD)
  cy.get('button[type="submit"]').click()
  cy.get('.MuiDialogActions-root > .MuiButton-contained').click()
  cy.get('a[href="#/"]').should('be.visible')

})


})
