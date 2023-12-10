describe('Whitefalcon users test', () => {

    it('Validating creating a new user', () => {
      cy.visit('http://localhost:8081')
      cy.get('#email').type('ejeyd@example.com')
      cy.get('#password').type('admin')
      cy.get('button[type="submit"]').click()

      cy.get('.MuiDialogActions-root > .MuiButton-contained').click()
      cy.get('a[href="#/users"]').click()
      cy.get('a[href="#/users/create"]').click()
      cy.get('#name').type('cypress user')
      cy.get('#email').type('user@example.com')
      cy.get('#phone').type('0123456789')
      cy.get('#website').type('www.abc.com')
      cy.get('button[type="submit"]').click()
      cy.wait(2000)



  })  
    
  })