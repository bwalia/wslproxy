const fs = require('fs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// JWT secret key
const secretKey = process.env.JWT_SECRET_KEY;

const generateToken = (email) => {
    const user = {
      id: 1,
      username: 'example_user',
      email: email
    };
    
    // Generate the JWT
    const token = jwt.sign(user, secretKey, { expiresIn: '1h' });
    
    // Save the token and email to a JSON file
    fs.writeFileSync('token.json', JSON.stringify({ email: user.email, token }));
    return token;
    
    console.log('Token and email have been generated and stored in token.json file.');
}
module.exports = generateToken;
