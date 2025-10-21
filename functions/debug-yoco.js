// debug-yoco.js
const fetch = require('node-fetch');
require('dotenv').config();

const YOCO_SECRET_KEY = process.env.YOCO_SECRET_KEY || 'sk_test_960bfde0VBrLlpK098e4ffeb53e1';
const YOCO_API_URL = process.env.YOCO_API_URL || 'https://api.yocosandbox.com/v1/charges';

async function debugYocoKey() {
  try {
    const testPayload = {
      amount: 1000,
      currency: 'ZAR',
      token: 'tok_test_visa_4242',
      description: 'Test Charge',
    };

    console.log('=== DEBUGGING YOCO AUTH ===');
    console.log('Secret Key:', YOCO_SECRET_KEY);
    console.log('Key length:', YOCO_SECRET_KEY.length);
    console.log('Key starts with:', YOCO_SECRET_KEY.substring(0, 10));
    console.log('Key ends with:', YOCO_SECRET_KEY.substring(YOCO_SECRET_KEY.length - 6));
    
    // Check for hidden characters
    console.log('Key char codes:');
    for (let i = 0; i < YOCO_SECRET_KEY.length; i++) {
      console.log(`  [${i}]: '${YOCO_SECRET_KEY[i]}' (${YOCO_SECRET_KEY.charCodeAt(i)})`);
    }

    const headers = {
      'Authorization': `Bearer ${YOCO_SECRET_KEY}`,
      'Content-Type': 'application/json',
    };

    console.log('\n=== REQUEST HEADERS ===');
    console.log('Authorization:', headers.Authorization);
    console.log('Full headers:', JSON.stringify(headers, null, 2));

    console.log('\n=== MAKING REQUEST ===');
    const response = await fetch(YOCO_API_URL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(testPayload),
    });

    console.log('=== RESPONSE ===');
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    
    // Log response headers
    console.log('Response Headers:');
    response.headers.forEach((value, name) => {
      console.log(`  ${name}: ${value}`);
    });

    const result = await response.json();
    console.log('Response Body:', JSON.stringify(result, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugYocoKey();