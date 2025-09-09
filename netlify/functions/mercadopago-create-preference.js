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
    const { preference, bookingData, accessToken: bodyAccessToken } = JSON.parse(event.body);
    const accessToken = bodyAccessToken || process.env.MP_ACCESS_TOKEN;

    if (!accessToken) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Mercado Pago não configurado. Configure MP_ACCESS_TOKEN nas variáveis de ambiente.' 
        }),
      };
    }

    // Create preference in Mercado Pago
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preference),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Mercado Pago API Error:', error);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ 
          error: `Erro do Mercado Pago: ${error.message || 'Erro desconhecido'}` 
        }),
      };
    }

    const mpResponse = await response.json();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        id: mpResponse.id,
        init_point: mpResponse.init_point,
        sandbox_init_point: mpResponse.sandbox_init_point
      }),
    };

  } catch (error) {
    console.error('Error creating Mercado Pago preference:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Erro interno do servidor' 
      }),
    };
  }
};

module.exports = { handler };
