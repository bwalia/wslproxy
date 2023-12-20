// describe('Whitefalcon users test', () => {
//   let BASE_URL = Cypress.env('BASE_PUB_URL') || 'https://api.int2.whitefalcon.io'
//   let EMAIL = Cypress.env('LOGIN_EMAIL') 
//   let PASSWORD = Cypress.env('LOGIN_PASSWORD') 


//     it('Validating creating a new user', () => {
//       cy.visit(BASE_URL)
//       cy.get('#email').type(EMAIL)
//       cy.get('#password').type(PASSWORD)
//       cy.get('button[type="submit"]').click()

//       cy.get('.MuiDialogActions-root > .MuiButton-contained').click()
//       cy.get('a[href="#/users"]').click()
//       cy.get('a[href="#/users/create"]').click()
//       cy.get('#name').type('cypress user')
//       cy.get('#email').type('user@example.com')
//       cy.get('#phone').type('0123456789')
//       cy.get('#website').type('www.abc.com')
//       cy.get('button[type="submit"]').click()
//       cy.wait(2000)



//   })  
    
//   })