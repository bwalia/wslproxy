describe('Whitefalcon profile test', () => {

    it('Validating creating a new profile', () => {
      cy.visit('http://localhost:8081')
      cy.get('#email').type('ejeyd@example.com')
      cy.get('#password').type('admin')
      cy.get('button[type="submit"]').click()
      cy.get('.MuiDialogActions-root > .MuiButton-contained').click()
      cy.get('a[href="#/profiles"]').click()
      cy.get('a[href="#/profiles/create"]').click()
      cy.get('#name').type('qa_test')
      cy.get('button[type="submit"]').click()


  })  
    
  })