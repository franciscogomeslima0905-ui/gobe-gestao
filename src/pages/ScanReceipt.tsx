import { Camera, FileText, Loader2, PencilLine, RefreshCcw, ScanLine, Sparkles, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PurchaseForm, { emptyPurchaseDraft, guessStockQty, newLine } from '../components/PurchaseForm';
import { Button, Card, PageHeader } from '../components/ui';
import { useStock } from '../context/StockContext';
import { useUI } from '../context/UIContext';
import { blobToBase64, compressImage, sha256Hex } from '../lib/files';
import { brl, fmtDate, round2 } from '../lib/format';
import { supabase } from '../lib/supabase';
import type { ExpenseCategory, ExpenseMethod, PurchaseDraft } from '../lib/types';

interface ScanResult {
  establishment: string | null;
  date: string | null;
  items: {
    description: string;
    quantity: number;
    unit: string | null;
    unit_price: number;
    discount: number;
    total: number;
    ingredient_id: string | null;
    stock_qty: number | null;
    category: ExpenseCategory;
  }[];
  discount: number;
  total: number | null;
  payment_method: ExpenseMethod | null;
  confidence: string | null;
  notes: string | null;
}

type Step = 'select' | 'reading' | 'review';

export default function ScanReceipt() {
  const { ingredients, ingMap, purchases } = useStock();
  const { toast } = useUI();
  const navigate = useNavigate();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('select');
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<Blob | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [draft, setDraft] = useState<PurchaseDraft>(emptyPurchaseDraft());
  const [info, setInfo] = useState<{ confidence: string | null; notes: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const reset = () => {
    setStep('select');
    setFile(null);
    setUpload(null);
    setHash(null);
    setPreview(null);
    setInfo(null);
    setError(null);
    setDraft(emptyPurchaseDraft());
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/') && f.type !== 'application/pdf') return toast('Envie uma foto ou um PDF.', 'error');
    if (f.size > 15 * 1024 * 1024) return toast('Arquivo muito grande (máx. 15 MB).', 'error');
    setError(null);
    const h = await sha256Hex(f);
    const dup = purchases.find((p) => p.file_hash === h);
    if (dup) {
      setError(`Esta nota já foi registrada em ${fmtDate(dup.purchase_date)} (${dup.supplier ?? 'sem fornecedor'}, ${brl(dup.total)}). Nada será lançado em dobro.`);
      return;
    }
    setFile(f);
    setHash(h);
    setPreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
    const blob = f.type.startsWith('image/') ? await compressImage(f) : f;
    if (f.type === 'application/pdf' && f.size > 5 * 1024 * 1024) {
      setUpload(f);
      setError('PDF acima de 5 MB não pode ser lido automaticamente. Preencha os dados manualmente.');
      setDraft(emptyPurchaseDraft());
      setStep('review');
      return;
    }
    setUpload(blob);
    await read(blob);
  };

  const read = async (blob: Blob) => {
    setStep('reading');
    setError(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s.session?.access_token;
      const res = await fetch('/.netlify/functions/scan-receipt', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({
          data: await blobToBase64(blob),
          mediaType: blob.type || 'image/jpeg',
          ingredients: ingredients.filter((i) => i.active).map((i) => ({ id: i.id, name: i.name, unit: i.unit, category: i.category })),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<ScanResult> & { error?: string };
      if (!res.ok) throw new Error(body.error || (res.status === 404 ? 'A função de leitura não está publicada (veja o README).' : `Erro ${res.status}`));
      const r = body as ScanResult;
      setDraft({
        ...emptyPurchaseDraft(),
        supplier: r.establishment ?? '',
        purchase_date: r.date ?? emptyPurchaseDraft().purchase_date,
        payment_method: r.payment_method ?? 'pix',
        discount: r.discount || 0,
        total: r.total ?? 0,
        lines: r.items.map((it) => {
          const ing = it.ingredient_id ? ingMap.get(it.ingredient_id) : undefined;
          return newLine({
            description: it.description,
            quantity: it.quantity,
            unit: (it.unit ?? 'UN').toUpperCase(),
            unit_price: it.unit_price,
            total: round2(it.total),
            ingredient_id: ing ? ing.id : null,
            stock_qty: ing ? it.stock_qty ?? guessStockQty(it.quantity, it.unit ?? 'un', ing.unit) : 0,
            category: it.category,
          });
        }),
      });
      setInfo({ confidence: r.confidence, notes: r.notes });
      setFormKey((k) => k + 1);
      setStep('review');
      toast('Nota lida! Confira os dados antes de confirmar.', 'info');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ler a nota.');
      setStep('select');
    }
  };

  const manual = () => {
    setDraft(emptyPurchaseDraft());
    setFormKey((k) => k + 1);
    setStep('review');
  };

  return (
    <div>
      <PageHeader
        title="Escanear notinha"
        subtitle="Fotografe a nota ou o comprovante: a leitura automática preenche tudo e você só confere."
        actions={step !== 'select' && <Button variant="secondary" icon={RefreshCcw} onClick={reset}>Recomeçar</Button>}
      />

      {step === 'select' && (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Card className="flex flex-col items-center justify-center gap-5 py-10 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-cereja to-bordo text-white shadow-lift">
              <ScanLine className="h-10 w-10" />
            </span>
            <div>
              <p className="font-display text-2xl font-semibold text-bordo">Envie a nota fiscal ou comprovante</p>
              <p className="mt-1 text-sm text-bordo/60">Foto pelo celular, imagem ou PDF.</p>
            </div>
            <div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row">
              <Button icon={Camera} className="flex-1 py-3" onClick={() => cameraRef.current?.click()}>
                Tirar foto
              </Button>
              <Button variant="secondary" icon={Upload} className="flex-1 py-3" onClick={() => fileRef.current?.click()}>
                Enviar arquivo
              </Button>
            </div>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            {error && <p className="max-w-md rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-100">{error}</p>}
            <button onClick={manual} className="inline-flex items-center gap-1.5 text-sm font-semibold text-cereja hover:underline">
              <PencilLine className="h-4 w-4" /> Cadastrar compra ou despesa manualmente
            </button>
          </Card>
          <Card>
            <p className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-bordo">
              <Sparkles className="h-5 w-5 text-cereja" /> Dicas para uma boa leitura
            </p>
            <ul className="space-y-2 text-sm text-bordo/70">
              <li>• Apoie a nota numa superfície plana e com boa luz.</li>
              <li>• Enquadre a nota inteira, do nome da loja até o total.</li>
              <li>• Evite sombras, dobras e reflexos.</li>
              <li>• Nota muito comprida? Envie o PDF ou tire duas fotos e registre em duas partes.</li>
              <li>• Você sempre confere e corrige tudo antes de salvar.</li>
            </ul>
          </Card>
        </div>
      )}

      {step === 'reading' && (
        <Card className="flex flex-col items-center gap-4 py-16 text-center">
          {preview && <img src={preview} alt="Nota enviada" className="max-h-56 rounded-xl object-contain opacity-80 shadow-soft" />}
          <Loader2 className="h-10 w-10 animate-spin text-cereja" />
          <p className="font-display text-xl font-semibold text-bordo">Lendo a notinha…</p>
          <p className="text-sm text-bordo/55">Identificando loja, data, produtos e valores. Leva alguns segundos.</p>
        </Card>
      )}

      {step === 'review' && (
        <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            <Card className="p-3">
              {preview ? (
                <a href={preview} target="_blank" rel="noreferrer">
                  <img src={preview} alt="Nota enviada" className="max-h-[70vh] w-full rounded-xl object-contain" />
                </a>
              ) : file ? (
                <div className="flex items-center gap-3 p-3 text-sm text-bordo">
                  <FileText className="h-8 w-8 text-cereja" />
                  <span className="truncate">{file.name}</span>
                </div>
              ) : (
                <p className="p-3 text-sm text-bordo/55">Cadastro manual, sem comprovante anexado.</p>
              )}
            </Card>
            {info && (
              <div className="rounded-2xl bg-rosa-50 p-3 text-xs text-bordo ring-1 ring-rosa-100">
                <p>
                  Confiança da leitura: <b>{info.confidence ?? '—'}</b>
                </p>
                {info.notes && <p className="mt-1">{info.notes}</p>}
              </div>
            )}
            {error && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-100">{error}</p>}
            {file && upload && !info && !error && (
              <Button variant="secondary" icon={Sparkles} className="w-full" onClick={() => read(upload)}>
                Tentar leitura automática
              </Button>
            )}
          </div>
          <PurchaseForm
            key={formKey}
            initial={draft}
            source={file ? 'nota' : 'manual'}
            file={upload}
            fileName={file?.name}
            fileHash={hash}
            onDone={() => navigate('/estoque?aba=compras')}
            onCancel={reset}
          />
        </div>
      )}
    </div>
  );
}
