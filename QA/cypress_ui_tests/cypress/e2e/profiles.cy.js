describe('Whitefalcon profile test', () => {
  let BASE_URL = Cypress.env('BASE_URL') || 'https://api.int2.whitefalcon.io'
  let EMAIL = Cypress.env('LOGIN_EMAIL') 
  let PASSWORD = Cypress.env('LOGIN_PASSWORD') 


    it('Validating creating a new profile', () => {
      cy.visit(BASE_URL)
      cy.get('#email').type(EMAIL)
      cy.get('#password').type(PASSWORD)
      cy.get('button[type="submit"]').click()
      cy.get('.MuiDialogActions-root > .MuiButton-contained').click()
      cy.get('a[href="#/profiles"]').click()
      cy.get('a[href="#/profiles/create"]').click()
      cy.get('#name').type('qa_test')
      cy.get('button[type="submit"]').click()


  })  
    
  })