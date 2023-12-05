// module.exports = (on, config) => {
//   on('before:browser:launch', (browser = {}, launchOptions) => {
//     console.log(launchOptions.args)

//     if (browser.name == 'chrome') {
//       launchOptions.args.push('--disable-gpu')
//     }

//     if (browser.name == 'electron') {
//       launchOptions.args.push('--disable-gpu')
//     }

//     return launchOptions
//   }),
// }

describe('Whitefalcon login test Int environment', () => {

  let urlStr = 'https://api.int2.whitefalcon.io/'
  let targetEnv = Cypress.env("CYPRESS_TARGET_ENV")
  if (targetEnv === "test") 
      urlStr = 'https://api.test.whitefalcon.io/'
  else if (targetEnv === "int")
      urlStr = 'https://api.int2.whitefalcon.io/'

  it('passes', () => {
    cy.visit(urlStr)

    var login_username_str = Cypress.env('LOGIN_EMAIL')
    var login_password_str = Cypress.env('LOGIN_PASSWORD')

    cy.get('#email').type(login_username_str)
    cy.get('#password').type(login_password_str)
    cy.get('type[submit]').click()
  })


  function makeStringOfLength({ min, max }) {

    const length = Math.random() * (max - min + 1) + min
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; //abcdefghijklmnopqrstuvwxyz0123456789

    let result = '';

    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  }

  function makelcStringOfLength({ min, max }) {

    const length = Math.random() * (max - min + 1) + min
    const characters = 'abcdefghijklmnopqrstuvwxyz';

    let result = '';

    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  }

  function toLowerCaseStr(pString) {

    pString = pString.toLowerCase();

    return pString;
  }


})

