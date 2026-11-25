/**
 * GB GOBÊ · Leitura de notas fiscais e comprovantes com IA (Claude, da Anthropic)
 *
 * Roda no servidor da Netlify: a chave ANTHROPIC_API_KEY nunca vai para o navegador.
 * Só aceita pedidos de usuários logados e liberados na tabela `staff` do Supabase.
 *
 * Funciona com QUALQUER UMA destas IAs (basta configurar uma):
 *   GEMINI_API_KEY         Google Gemini — tem plano GRATUITO (aistudio.google.com)
 *   GEMINI_MODEL           opcional, padrão: gemini-2.5-flash
 *   ANTHROPIC_API_KEY      Claude (pago)
 *   ANTHROPIC_MODEL        opcional, padrão: claude-haiku-5-5
 * Se as duas chaves existirem, usa o Gemini.
 *
 * Variáveis de ambiente (Netlify > Project configuration > Environment variables):
 *   VITE_SUPABASE_URL      já usada pelo site
 *   VITE_SUPABASE_ANON_KEY já usada pelo site
 */

declare const process: { env: Record<string, string | undefined> };

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const MAX_BASE64 = 7_500_000; // ~5,5 MB de arquivo

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

interface IngredientRef {
  id: string;
  name: string;
  unit: string;
  category: string;
}

const SYSTEM = `Você lê notas fiscais e comprovantes de compra brasileiros (NFC-e, cupom fiscal, nota de supermercado, recibo, comprovante de Pix ou cartão) para uma confeitaria artesanal.
Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois e sem blocos de código.
Use ponto como separador decimal nos números. Nunca invente itens que não estão no documento; se algo estiver ilegível, use null.`;

const buildPrompt = (ingredients: IngredientRef[]) => `Extraia os dados deste documento no formato:
{
  "establishment": "nome do estabelecimento ou null",
  "cnpj": "CNPJ ou null",
  "date": "AAAA-MM-DD ou null",
  "items": [
    {
      "description": "descrição do produto como está na nota",
      "quantity": número (quantidade comprada, ex.: 2),
      "unit": "UN, KG, G, L, ML, PCT, CX ou null",
      "unit_price": número (valor unitário),
      "discount": número (desconto do item, 0 se não houver),
      "total": número (valor final do item, já com o desconto do item),
      "ingredient_id": "id do ingrediente correspondente da lista abaixo ou null",
      "stock_qty": número (quanto esse item representa NA UNIDADE do ingrediente escolhido; ex.: 2 pacotes de 'Açúcar 1kg' com ingrediente em kg = 2; 'Chocolate 2,1kg' com ingrediente em kg = 2.1; 1 bandeja de 30 ovos com ingrediente em un = 30) ou null,
      "category": "ingredientes" | "embalagens" | "adesivos" | "outras"
    }
  ],
  "discount": número (desconto geral da nota, 0 se não houver),
  "total": número (valor total pago) ou null,
  "payment_method": "pix" | "dinheiro" | "cartao_debito" | "cartao_credito" | "outro" | null,
  "confidence": "alta" | "media" | "baixa",
  "notes": "observações curtas sobre partes ilegíveis ou dúvidas, ou null"
}

Ingredientes e materiais cadastrados na confeitaria (use o "id" exato só quando o produto da nota for claramente esse item; produtos sem relação, como limpeza ou bebidas, ficam com null e categoria "outras"):
${JSON.stringify(ingredients.map((i) => ({ id: i.id, nome: i.name, unidade: i.unit, tipo: i.category })))}`;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  const n = typeof v === 'number' ? v : s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return Number.isFinite(n) ? n : null;
};

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://vdsdamcucnpzrknfsaxn.supabase.co';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_V5ThmjExYvuNF9JiW1iidA_3_lNuVsf';
  if (!geminiKey && !anthropicKey)
    return json({ error: 'A leitura automática ainda não foi configurada (falta GEMINI_API_KEY na Netlify).' }, 500);
  if (!supabaseUrl || !anonKey) return json({ error: 'Variáveis do Supabase ausentes no servidor.' }, 500);

  /* 1. Confere se quem chamou está logado e faz parte da equipe */
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Faça login novamente.' }, 401);
  const headers = { Authorization: `Bearer ${token}`, apikey: anonKey };
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers });
  if (!userRes.ok) return json({ error: 'Sessão expirada. Entre novamente.' }, 401);
  const user = (await userRes.json()) as { id?: string };
  const staffRes = await fetch(`${supabaseUrl}/rest/v1/staff?select=user_id&user_id=eq.${encodeURIComponent(user.id ?? '')}`, { headers });
  const staff = staffRes.ok ? ((await staffRes.json()) as unknown[]) : [];
  if (!Array.isArray(staff) || staff.length === 0) return json({ error: 'Usuário sem permissão.' }, 403);

  /* 2. Valida o arquivo */
  let body: { data?: string; mediaType?: string; ingredients?: IngredientRef[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Envio inválido.' }, 400);
  }
  const { data, mediaType } = body;
  const ingredients = Array.isArray(body.ingredients) ? body.ingredients.slice(0, 300) : [];
  if (!data || !mediaType || !ALLOWED.includes(mediaType)) return json({ error: 'Envie uma foto (JPG, PNG, WEBP) ou um PDF.' }, 400);
  if (data.length > MAX_BASE64) return json({ error: 'Arquivo muito grande. Envie uma foto menor ou um PDF de até 5 MB.' }, 413);

  /* 3. Envia para a IA */
  let text = '';
  if (geminiKey) {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': geminiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mediaType, data } }, { text: buildPrompt(ingredients) }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 8192 },
      }),
    });
    if (!aiRes.ok) {
      const detail = await aiRes.text();
      console.error('Gemini error', aiRes.status, detail);
      const msg =
        aiRes.status === 400 && /API key/i.test(detail)
          ? 'Chave do Gemini inválida.'
          : aiRes.status === 404
            ? `Modelo "${model}" não encontrado. Ajuste GEMINI_MODEL na Netlify.`
            : aiRes.status === 429
              ? 'Limite gratuito de leituras atingido por agora. Aguarde um pouco ou cadastre manualmente.'
              : 'Não foi possível ler a nota agora.';
      return json({ error: msg }, 502);
    }
    const out = (await aiRes.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    text = (out.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  } else {
    const block =
      mediaType === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
        : { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey as string, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
        max_tokens: 4096,
        temperature: 0,
        system: SYSTEM,
        messages: [{ role: 'user', content: [block, { type: 'text', text: buildPrompt(ingredients) }] }],
      }),
    });
    if (!aiRes.ok) {
      console.error('Anthropic error', aiRes.status, await aiRes.text());
      const msg =
        aiRes.status === 401
          ? 'Chave da API inválida.'
          : aiRes.status === 429
            ? 'Muitas leituras seguidas. Aguarde um minuto e tente de novo.'
            : 'Não foi possível ler a nota agora.';
      return json({ error: msg }, 502);
    }
    const out = (await aiRes.json()) as { content?: { type: string; text?: string }[] };
    text = (out.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  }

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return json({ error: 'A leitura não retornou dados. Tente uma foto mais nítida.' }, 422);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return json({ error: 'Não foi possível interpretar a leitura. Tente novamente.' }, 422);
  }

  /* 4. Higieniza o resultado */
  const validIds = new Set(ingredients.map((i) => i.id));
  const cats = ['ingredientes', 'embalagens', 'adesivos', 'outras'];
  const items = (Array.isArray(parsed.items) ? parsed.items : []).slice(0, 200).map((raw) => {
    const it = (raw ?? {}) as Record<string, unknown>;
    const quantity = num(it.quantity) ?? 1;
    const total = num(it.total);
    const unitPrice = num(it.unit_price) ?? (total !== null && quantity ? total / quantity : 0);
    const ingredientId = typeof it.ingredient_id === 'string' && validIds.has(it.ingredient_id) ? it.ingredient_id : null;
    return {
      description: String(it.description ?? 'Item').slice(0, 200),
      quantity,
      unit: typeof it.unit === 'string' ? it.unit.slice(0, 10) : null,
      unit_price: unitPrice,
      discount: num(it.discount) ?? 0,
      total: total ?? Math.round(quantity * unitPrice * 100) / 100,
      ingredient_id: ingredientId,
      stock_qty: ingredientId ? num(it.stock_qty) : null,
      category: typeof it.category === 'string' && cats.includes(it.category) ? it.category : 'outras',
    };
  });
  const date = typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null;
  const methods = ['pix', 'dinheiro', 'cartao_debito', 'cartao_credito', 'outro'];

  return json({
    establishment: typeof parsed.establishment === 'string' ? parsed.establishment.slice(0, 120) : null,
    cnpj: typeof parsed.cnpj === 'string' ? parsed.cnpj.slice(0, 20) : null,
    date,
    items,
    discount: num(parsed.discount) ?? 0,
    total: num(parsed.total),
    payment_method: typeof parsed.payment_method === 'string' && methods.includes(parsed.payment_method) ? parsed.payment_method : null,
    confidence: typeof parsed.confidence === 'string' ? parsed.confidence : null,
    notes: typeof parsed.notes === 'string' ? parsed.notes.slice(0, 300) : null,
  });
};
