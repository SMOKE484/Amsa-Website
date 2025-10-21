// test-yoco.js
const fetch = require('node-fetch');
require('dotenv').config();

const YOCO_SECRET_KEY = process.env.YOCO_SECRET_KEY || 'sk_test_960bfde0VBrLlpK098e4ffeb53e1';
const YOCO_API_URL = process.env.YOCO_API_URL || 'https://api.yocosandbox.com/v1/charges';

async function testYocoKey() {
  try {
    const testPayload = {
      amount: 1000, // 10.00 ZAR
      currency: 'ZAR',
      token: 'tok_test_visa_4242', // Yoco test token
      description: 'Test Charge',
    };

    console.log('Testing Yoco key...');
    console.log('Key:', YOCO_SECRET_KEY.substring(0, 20) + '...');
    console.log('Key length:', YOCO_SECRET_KEY.length);
    console.log('API URL:', YOCO_API_URL);

    const response = await fetch(YOCO_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${YOCO_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    const result = await response.json();
    
    console.log('\n=== Yoco API Response ===');
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    console.log('Response:', JSON.stringify(result, null, 2));

    if (response.status === 401) {
      console.log('\n❌ AUTHENTICATION FAILED');
      console.log('The secret key is invalid or expired.');
      console.log('Please regenerate your key at: https://sandbox.yoco.com/');
    } else if (response.status === 201 || response.status === 200) {
      console.log('\n✅ PAYMENT SUCCESSFUL!');
    }

  } catch (error) {
    console.error('Test error:', error.message);
  }
}

testYocoKey();