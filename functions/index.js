const functions = require('firebase-functions');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

exports.createPayfastPayment = functions.https.onRequest(async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { applicationId, email, amount } = req.body;

    if (!applicationId || !email || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: applicationId, email, amount',
      });
    }

    // Validate email
    const merchantEmail = 'info@alusaniacademy.edu.za';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
      });
    }
    if (email.toLowerCase() === merchantEmail.toLowerCase()) {
      return res.status(400).json({
        success: false,
        error: 'Cannot use merchant email for payment',
      });
    }

    console.log('🔄 Creating PayFast payment for:', applicationId, 'with email:', email);

    // PayFast credentials from environment variables
    const merchant_id = process.env.PAYFAST_MERCHANT_ID;
    const merchant_key = process.env.PAYFAST_MERCHANT_KEY;
    const passphrase = process.env.PAYFAST_PASSPHRASE;

    if (!merchant_id || !merchant_key || !passphrase) {
      throw new Error('PayFast merchant credentials not configured');
    }

    // Determine environment (sandbox for testing, live for production)
    const testingMode = process.env.PAYFAST_TESTING_MODE === 'true';
    const pfHost = testingMode ? 'sandbox.payfast.co.za' : 'www.payfast.co.za';
    // Use /eng/process for sandbox testing since /onsite/process is not supported
    const endpoint = testingMode ? '/eng/process' : '/onsite/process';

    // PayFast data for payment
    const pfData = {
      merchant_id,
      merchant_key,
      return_url: `https://amsa-website-3b9d5.web.app/payment-success.html?application_id=${applicationId}`,
      cancel_url: `https://amsa-website-3b9d5.web.app/payment-cancel.html?application_id=${applicationId}`,
      notify_url: `https://us-central1-amsa-website-3b9d5.cloudfunctions.net/payfastIPN?application_id=${applicationId}`,
      email_address: email,
      name_first: 'Application',
      name_last: 'Payment',
      m_payment_id: applicationId,
      amount: (amount / 100).toFixed(2), // Convert cents to Rands (e.g., 15000 -> 150.00)
      item_name: 'Alusani Academy Application Fee',
      item_description: 'Application submission fee for Alusani Maths and Science Academy',
      email_confirmation: '1',
      confirmation_address: merchantEmail,
    };

    // Generate signature
    const signature = generateSignature(pfData, passphrase);
    pfData.signature = signature;

    // Log data for debugging
    console.log('PayFast data:', JSON.stringify(pfData, null, 2));
    console.log('Signature:', signature);

    // Convert data to URL-encoded string
    const pfParamString = dataToString(pfData);
    console.log('URL-encoded string:', pfParamString);

    // Request payment identifier from PayFast
    try {
      const response = await axios.post(`https://${pfHost}${endpoint}`, pfParamString, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const responseData = response.data;

      if (responseData.uuid) {
        console.log('✅ PayFast payment identifier received:', responseData.uuid);
        return res.status(200).json({
          success: true,
          uuid: responseData.uuid,
          testingMode,
        });
      } else {
        throw new Error('No UUID received from PayFast: ' + JSON.stringify(responseData));
      }
    } catch (error) {
      console.error('❌ PayFast API error:', error.response?.data || error.message);
      throw new Error(`PayFast API error: ${error.response?.data || error.message}`);
    }

  } catch (error) {
    console.error('❌ PayFast payment error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

// Handle PayFast ITN (Instant Transaction Notification)
exports.payfastIPN = functions.https.onRequest(async (req, res) => {
  try {
    console.log('📩 PayFast ITN received:', JSON.stringify(req.body, null, 2));

    // Always return 200 to PayFast immediately
    res.status(200).send('OK');

    const pfData = req.body;
    const applicationId = pfData.m_payment_id;

    if (!applicationId) {
      console.error('❌ No application ID in ITN');
      return;
    }

    // Verify signature for security
    const passphrase = process.env.PAYFAST_PASSPHRASE;
    if (!passphrase) {
      console.error('❌ PayFast passphrase not configured');
      return;
    }
    const signature = generateSignature(pfData, passphrase);
    if (signature !== pfData.signature) {
      console.error('❌ Invalid ITN signature:', {
        received: pfData.signature,
        generated: signature,
        inputData: pfData,
      });
      return;
    }

    if (pfData.payment_status === 'COMPLETE') {
      console.log('✅ Payment completed for application:', applicationId);
      await updateApplicationPaymentStatus(applicationId, 'paid', {
        amount_gross: pfData.amount_gross,
        amount_fee: pfData.amount_fee,
        amount_net: pfData.amount_net,
        pf_payment_id: pfData.pf_payment_id,
      });
    } else if (pfData.payment_status === 'CANCELLED') {
      console.log('❌ Payment cancelled for application:', applicationId);
      await updateApplicationPaymentStatus(applicationId, 'cancelled');
    }

  } catch (err) {
    console.error('❌ ITN handler error:', err);
    res.status(200).send('OK');
  }
});

// Helper function to generate signature
function generateSignature(data, passPhrase) {
  // Sort keys alphabetically
  const orderedKeys = Object.keys(data).sort();
  let pfOutput = '';

  // Build parameter string, excluding empty/undefined/null values
  for (const key of orderedKeys) {
    if (data[key] !== '' && data[key] !== undefined && data[key] !== null) {
      pfOutput += `${key}=${encodeURIComponent(data[key]).replace(/%20/g, '+')}&`;
    }
  }
  // Remove trailing ampersand
  pfOutput = pfOutput.slice(0, -1);

  // Append passphrase if provided
  if (passPhrase) {
    pfOutput += `&passphrase=${encodeURIComponent(passPhrase)}`;
  }

  console.log('Signature string:', pfOutput);
  return crypto.createHash('md5').update(pfOutput).digest('hex');
}

// Helper function to convert data to URL-encoded string
function dataToString(data) {
  let pfOutput = '';
  const orderedKeys = Object.keys(data).sort();
  for (const key of orderedKeys) {
    if (data[key] !== '' && data[key] !== undefined && data[key] !== null) {
      pfOutput += `${key}=${encodeURIComponent(data[key]).replace(/%20/g, '+')}&`;
    }
  }
  return pfOutput.slice(0, -1);
}