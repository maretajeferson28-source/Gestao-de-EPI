const SUPABASE_URL = 'https://aqnrjjllfzirrtwvjjbl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxbnJqamxsZnppcnJ0d3ZqamJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNTc4MzcsImV4cCI6MjEwNTgzMzgzN30.-v6uZT7C5bznB9j-HKQm_XWxDmqM8_p9ozTwwQsZBP8';

async function rest(path) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase HTTP ${response.status}: ${detail}`);
  }

  return response.json();
}

export async function queryCaepi(caInput) {
  const ca = String(caInput || '').replace(/\D+/g, '');

  if (!ca) {
    return {
      found: false,
      ca: '',
      current: null,
      history: [],
      source: null
    };
  }

  const datasets = await rest(
    '/rest/v1/caepi_datasets?select=id,source_type,source_url,total_rows,distinct_cas,ignored_rows,started_at,completed_at&status=eq.active&limit=1'
  );

  const dataset = datasets[0] || null;

  if (!dataset) {
    return {
      found: false,
      ca,
      current: null,
      history: [],
      source: null
    };
  }

  const params = new URLSearchParams({
    select: 'id,ca,data_validade,situacao,fabricante,cnpj,equipamento,descricao,marca,referencia,norma,laudos',
    dataset_id: `eq.${dataset.id}`,
    ca: `eq.${ca}`,
    order: 'data_validade.desc.nullslast,id.desc'
  });

  const history = await rest(`/rest/v1/caepi_records?${params.toString()}`);

  return {
    found: history.length > 0,
    ca,
    current: history[0] || null,
    history,
    source: {
      total_cas: dataset.distinct_cas,
      total_linhas: dataset.total_rows,
      registros_ignorados: dataset.ignored_rows,
      importado_em: dataset.completed_at || dataset.started_at,
      tipo_fonte: dataset.source_type,
      url_origem: dataset.source_url
    }
  };
}


export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const ca = Array.isArray(req.query?.ca) ? req.query.ca[0] : req.query?.ca;
    const result = await queryCaepi(ca);
    return res.status(200).json(result);
  } catch (error) {
    console.error('[CAEPI API]', error);
    return res.status(500).json({
      error: 'Não foi possível consultar a base CAEPI.',
      detail: error?.message || String(error)
    });
  }
}
