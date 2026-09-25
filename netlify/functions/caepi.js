import { queryCaepi } from '../../api/caepi.js';

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { Allow: 'GET' },
      body: JSON.stringify({ error: 'method_not_allowed' })
    };
  }

  try {
    const data = await queryCaepi(event.queryStringParameters?.ca || '');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('[CAEPI API]', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({
        found: false,
        current: null,
        history: [],
        source: null,
        error: 'caepi_query_failed'
      })
    };
  }
};
