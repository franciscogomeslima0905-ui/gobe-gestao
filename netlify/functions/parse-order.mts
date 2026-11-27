/**
 * GB GOBÊ · Lê a mensagem de pedido do WhatsApp com IA e devolve o pedido estruturado.
 * Usa GEMINI_API_KEY (grátis em aistudio.google.com) ou ANTHROPIC_API_KEY.
 * A chave fica só no servidor. Só atende usuários da equipe (tabela staff).
 */

declare const process: { env: Record<string, string | undefined> };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

interface ProductRef {
  id: string;
  name: string;
  flavor: string | null;
}

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

const buildPrompt = (text: string, products: ProductRef[], today: string) => {
  const d = new Date(`${today}T12:00:00`);
  const next14 = Array.from({ length: 14 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return `${x.toISOString().slice(0, 10)} (${WEEKDAYS[x.getDay()]})`;
  }).join(', ');
  return `Você recebe a mensagem de um cliente pedindo brownies para a confeitaria GB GOBÊ e devolve SOMENTE um objeto JSON, sem texto extra:
{
  "customer_name": "nome do cliente se aparecer, senão null",
  "phone": "telefone se aparecer, senão null",
  "delivery_date": "AAAA-MM-DD ou null",
  "delivery_time": "HH:MM ou null",
  "fulfillment": "entrega" | "retirada" | null,
  "address": "endereço de entrega se aparecer, senão null",
  "items": [ { "product_id": "id exato da lista", "quantity": número de fatias } ],
  "unknown_items": [ "trechos de produtos que não existem no cardápio" ],
  "notes": "observações importantes (presente, cartão, sem algo…) ou null"
}

Regras:
- Hoje é ${today} (${WEEKDAYS[d.getDay()]}). Próximos dias: ${next14}.
- "amanhã", "sexta", "sábado que vem" etc. viram a data correspondente. A confeitaria NÃO entrega às terças e quintas.
- Use apenas product_id da lista abaixo. "brownie de nutella" = produto Nutella; "recheadíssimo ao leite" = Recheadíssimo sabor Ao leite. Se o sabor não estiver claro, escolha o mais provável e cite a dúvida em notes.
- Quantidade é em fatias/unidades. Se não disser, use 1.

Cardápio (id, produto, sabor):
${products.map((p) => `${p.id} | ${p.name} | ${p.flavor ?? '-'}`).join('\n')}

Mensagem do cliente:
"""
${text.slice(0, 4000)}
"""`;
};

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://vdsdamcucnpzrknfsaxn.supabase.co';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_V5ThmjExYvuNF9JiW1iidA_3_lNuVsf';
  if (!geminiKey && !anthropicKey) return json({ error: 'A leitura automática ainda não foi configurada (falta GEMINI_API_KEY na Netlify).' }, 500);

  // Só a equipe
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Faça login novamente.' }, 401);
  const headers = { Authorization: `Bearer ${token}`, apikey: anonKey };
  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers });
  if (!userRes.ok) return json({ error: 'Sessão expirada. Entre novamente.' }, 401);
  const user = (await userRes.json()) as { id?: string };
  const staffRes = await fetch(`${supabaseUrl}/rest/v1/staff?select=user_id&user_id=eq.${encodeURIComponent(user.id ?? '')}`, { headers });
  const staff = staffRes.ok ? ((await staffRes.json()) as unknown[]) : [];
  if (!Array.isArray(staff) || staff.length === 0) return json({ error: 'Usuário sem permissão.' }, 403);

  let body: { text?: string; products?: ProductRef[]; today?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Envio inválido.' }, 400);
  }
  const text = (body.text ?? '').trim();
  const products = Array.isArray(body.products) ? body.products.slice(0, 200) : [];
  const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today ?? '') ? (body.today as string) : new Date().toISOString().slice(0, 10);
  if (!text) return json({ error: 'Cole a mensagem do cliente.' }, 400);

  const prompt = buildPrompt(text, products, today);
  let out = '';
  if (geminiKey) {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': geminiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 2048 },
      }),
    });
    if (!r.ok) {
      console.error('Gemini error', r.status, await r.text());
      return json({ error: r.status === 429 ? 'Limite gratuito atingido por agora. Tente em alguns minutos.' : 'Não foi possível ler a mensagem agora.' }, 502);
    }
    const d = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    out = (d.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  } else {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey as string, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: 1500, temperature: 0, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) {
      console.error('Anthropic error', r.status, await r.text());
      return json({ error: 'Não foi possível ler a mensagem agora.' }, 502);
    }
    const d = (await r.json()) as { content?: { type: string; text?: string }[] };
    out = (d.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  }

  const m = out.match(/\{[\s\S]*\}/);
  if (!m) return json({ error: 'Não entendi a mensagem. Tente colar só o texto do pedido.' }, 422);
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(m[0]);
  } catch {
    return json({ error: 'Não entendi a mensagem. Tente de novo.' }, 422);
  }

  const ids = new Set(products.map((x) => x.id));
  const str = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const items = (Array.isArray(p.items) ? p.items : [])
    .map((raw) => raw as { product_id?: unknown; quantity?: unknown })
    .filter((i) => typeof i.product_id === 'string' && ids.has(i.product_id))
    .map((i) => ({ product_id: i.product_id as string, quantity: Math.max(1, Math.round(Number(i.quantity) || 1)) }));

  return json({
    customer_name: str(p.customer_name, 80),
    phone: str(p.phone, 30),
    delivery_date: typeof p.delivery_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.delivery_date) ? p.delivery_date : null,
    delivery_time: typeof p.delivery_time === 'string' && /^\d{2}:\d{2}$/.test(p.delivery_time) ? p.delivery_time : null,
    fulfillment: p.fulfillment === 'retirada' ? 'retirada' : p.fulfillment === 'entrega' ? 'entrega' : null,
    address: str(p.address, 200),
    items,
    unknown_items: (Array.isArray(p.unknown_items) ? p.unknown_items : []).filter((x) => typeof x === 'string').slice(0, 10),
    notes: str(p.notes, 300),
  });
};
