describe('Whitefalcon login test', () => {

  it('Login with invalid email and invalid password', () => {
    cy.visit('https://api.int2.whitefalcon.io')
    cy.get('#email').type('ejeyd@example.com')
    cy.get('#password').type('fakepass')
    cy.get('button[type="submit"]').click()
    cy.get('.MuiSnackbarContent-message.css-1w0ym84').should("contain", "Invalid email or password")
})  

  it('Login with invalid email and valid password', () => {
    cy.visit('https://api.int2.whitefalcon.io')
    cy.get('#email').clear()
    cy.get('#password').clear()  
    cy.get('#email').type('abc')
    cy.get('#password').type('admin')
    cy.get('button[type="submit"]').click()
    cy.get('.MuiSnackbarContent-message.css-1w0ym84').should("contain", "Invalid email or password")

  })

  it('Login with valid email and invalid password', () => {
    cy.visit('https://api.int2.whitefalcon.io')
    cy.get('#email').clear()
    cy.get('#password').clear()  
    cy.get('#email').type('ejeyd@example.com')
    cy.get('#password').type('fakepass')
    cy.get('button[type="submit"]').click()
    cy.get('.MuiSnackbarContent-message.css-1w0ym84').should("contain", "Invalid email or password")
})

it('Login with valid email and empty password', () => {
  cy.visit('https://api.int2.whitefalcon.io')
  cy.get('#email').clear()
  cy.get('#password').clear()  
  cy.get('#email').type('ejeyd@example.com')
  cy.get('button[type="submit"]').click()
  cy.get('.MuiSnackbarContent-message.css-1w0ym84').should("contain", "Invalid email or password")

})

it('Login with empty email and valid password', () => {
  cy.visit('https://api.int2.whitefalcon.io')
  cy.get('#email').clear()
  cy.get('#password').clear()  
  cy.get('#password').type('admin')
  cy.get('button[type="submit"]').click()
  cy.get('.MuiSnackbarContent-message.css-1w0ym84').should("contain", "Invalid email or password")

})

it('Login with empty email and empty password', () => {
  cy.visit('https://api.int2.whitefalcon.io')
  cy.get('#email').clear()
  cy.get('#password').clear()  
  cy.get('button[type="submit"]').click()
  cy.get('.MuiSnackbarContent-message.css-1w0ym84').should("contain", "Invalid email or password")

})

it('Login with valid email and valid password', () => {
  cy.visit('https://api.int2.whitefalcon.io')
  cy.get('#email').clear()
  cy.get('#password').clear()  
  cy.get('#email').type('ejeyd@example.com')
  cy.get('#password').type('admin')
  cy.get('button[type="submit"]').click()
  cy.get('.MuiDialogActions-root > .MuiButton-contained').click()
  cy.get('a[href="#/"]').should('be.visible')

})


})