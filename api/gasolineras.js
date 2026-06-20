module.exports = async (req, res) => {
  const MINETUR_URL = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    const response = await fetch(MINETUR_URL, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error('MINETUR responded ' + response.status);
    }

    const data = await response.json();

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({
      error: 'Proxy error',
      message: error.message
    });
  }
};
