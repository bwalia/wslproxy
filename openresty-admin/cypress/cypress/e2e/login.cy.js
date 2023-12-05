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

  var urlStr = 'http://172.177.0.8:8080/#/login'

  it('passes', () => {
    cy.visit(urlStr)

    var login_username_str = Cypress.env('login_username')
    var login_password_str = Cypress.env('login_password')

    cy.get('#email').type(login_username_str)
    cy.get('#password').type(login_password_str)
    cy.get('type[submit]').click()
  })


  function makeStringOfLength({min, max}) {

    const length = Math.random() * (max - min + 1) + min
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; //abcdefghijklmnopqrstuvwxyz0123456789
  
    let result = '';
  
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  }
  
  function makelcStringOfLength({min, max}) {

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

