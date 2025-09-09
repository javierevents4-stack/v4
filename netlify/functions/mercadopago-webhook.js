const { Handler } = require('@netlify/functions');

const handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const notification = JSON.parse(event.body);
    console.log('Mercado Pago Webhook received:', notification);

    // Handle different notification types
    if (notification.type === 'payment') {
      const paymentId = notification.data.id;
      const accessToken = process.env.MP_ACCESS_TOKEN;

      if (!accessToken) {
        console.error('MP_ACCESS_TOKEN not configured');
        return { statusCode: 500, headers };
      }

      // Get payment details from Mercado Pago
      const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (paymentResponse.ok) {
        const payment = await paymentResponse.json();
        console.log('Payment details:', payment);

        // Here you would update your database with payment status
        // For example, mark the contract as paid, send confirmation emails, etc.
        
        if (payment.status === 'approved') {
          console.log('Payment approved for external_reference:', payment.external_reference);
          // Update contract status in your database
          // Send confirmation email to client
          // Trigger any other business logic
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ received: true }),
    };

  } catch (error) {
    console.error('Webhook error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

module.exports = { handler };