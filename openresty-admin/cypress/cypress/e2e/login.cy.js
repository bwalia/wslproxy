describe('Whitefalcon login test Int environment', () => {

  let urlStr = 'https://api.int2.whitefalcon.io/'
  let targetEnv = Cypress.env("CYPRESS_TARGET_ENV")
  if (targetEnv === "test") 
      urlStr = 'https://api.test.whitefalcon.io/'
  else if (targetEnv === "int")
      urlStr = 'https://api.int2.whitefalcon.io/'

  it('passes', async () => {
    cy.visit(urlStr)

    var login_username_str = Cypress.env('LOGIN_EMAIL')
    var login_password_str = Cypress.env('LOGIN_PASSWORD')

    cy.get('#email').type(login_username_str)
    cy.get('#password').type(login_password_str)
    await cy.get('type[submit]').click()
  })

})

