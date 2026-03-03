// api/analyze.js — Serverless function Vercel
// Fa da proxy sicuro: la API key non è mai esposta al browser

export default async function handler(req, res) {
  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS — permette chiamate dal frontend Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key non configurata sul server' });
  }

  try {
    const { imageBase64, mimeType } = req.body;

    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: 'Parametri mancanti: imageBase64 e mimeType richiesti' });
    }

    const prompt = `Sei un esperto forense specializzato nel rilevamento di immagini generate da AI e immagini manipolate digitalmente. Analizza questa immagine con estrema attenzione.

Devi fornire una risposta SOLO in formato JSON valido, senza testo aggiuntivo, markdown o backtick. Il JSON deve avere esattamente questa struttura:
{
  "fakeScore": <numero intero 0-100, dove 0=sicuramente reale, 100=sicuramente AI/manipolata>,
  "verdict": "<AUTENTICA|ARTIFICIALE|INCERTA>",
  "confidence": "<alta|media|bassa>",
  "summary": "<frase breve max 80 caratteri>",
  "findings": [
    "<osservazione forense 1>",
    "<osservazione forense 2>",
    "<osservazione forense 3>",
    "<osservazione forense 4>"
  ],
  "aiGenerator": "<nome del generatore AI sospetto o 'nessuno' o 'sconosciuto'>",
  "manipulationType": "<tipo di manipolazione o 'nessuna'>",
  "keyIndicators": {
    "texture": "<naturale|sintetica|ibrida>",
    "lighting": "<coerente|incoerente|artificiale>",
    "edges": "<naturali|artificiali|sovra-nitidi>",
    "noise": "<assente|naturale|artificiale>",
    "anatomy": "<corretta|anomalie rilevate|non applicabile>"
  }
}

Analizza: texture della pelle, capelli, occhi, simmetria facciale, sfondo, coerenza dell'illuminazione, artefatti tipici di Midjourney/DALL-E/Stable Diffusion/Flux, bordi innaturali, pattern ripetuti, assenza di imperfezioni naturali, rumore del sensore, profondità di campo, aberrazioni cromatiche, e qualsiasi altro indicatore forense rilevante.

Sii rigoroso: le immagini AI moderne sono molto convincenti ma presentano sempre sottili anomalie. Rispondi SOLO con il JSON.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: `Anthropic API error: ${err}` });
    }

    const data = await response.json();
    const text = data.content.map(b => b.text || '').join('');

    // Parse JSON dalla risposta
    let parsed;
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch (e) {
      const m = text.match(/"fakeScore"\s*:\s*(\d+)/);
      parsed = {
        fakeScore: m ? parseInt(m[1]) : 50,
        verdict: 'INCERTA',
        confidence: 'bassa',
        summary: 'Risposta non standard dal modello',
        findings: ['Analisi completata ma formato risposta anomalo'],
        aiGenerator: 'sconosciuto',
        manipulationType: 'sconosciuta',
        keyIndicators: {}
      };
    }

    return res.status(200).json(parsed);

  } catch (error) {
    return res.status(500).json({ error: `Errore interno: ${error.message}` });
  }
}
