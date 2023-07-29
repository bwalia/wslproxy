const fs = require('fs');
const jwt = require('jsonwebtoken');

// JWT secret key
const secretKey = 'your_secret_key';

// Read the token from the JSON file
const tokenData = JSON.parse(fs.readFileSync('token.json'));
const { email, token } = tokenData;

// Verify the token
jwt.verify(token, secretKey, (err, decoded) => {
  if (err) {
    console.error('Invalid token:', err.message);
  } else {
    // Match the email address
    if (email === decoded.email) {
      console.log('Email address matched!');
    } else {
      console.log('Email address did not match.');
    }
  }
});
