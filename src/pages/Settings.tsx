import { CakeSlice, Database, DownloadCloud, FileSpreadsheet, Info, Palette, Pencil, Plus, QrCode, ShieldCheck, UploadCloud } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { Button, Card, Checkbox, Field, Input, Modal, MoneyInput, PageHeader, SectionTitle, Select, StatusBadge, cx } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useData, type BackupFile } from '../context/DataContext';
import { exportStockAsync, useStock, type StockBackup } from '../context/StockContext';
import { errorMessage, useUI } from '../context/UIContext';
import { productLabel } from '../lib/calc';
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, STATUS_META } from '../lib/constants';
import { exportExcel, exportJSON } from '../lib/export';
import { brl, fmtDate, fmtDateTime, fmtPhone, todayISO } from '../lib/format';
import type { DisplayStatus, PixKeyType, Product } from '../lib/types';

export default function SettingsPage() {
  const { products, orders, payments, setProductActive, exportBackup, restoreBackup, getOrder } = useData();
  const { session } = useAuth();
  const stock = useStock();
  const { toast, confirm } = useUI();
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [restoring, setRestoring] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const usage = (p: Product) => orders.reduce((s, o) => s + o.items.filter((i) => i.product_id === p.id).reduce((a, i) => a + i.quantity, 0), 0);

  const toggle = async (p: Product) => {
    try {
      await setProductActive(p.id, !p.active);
      toast(p.active ? `${productLabel(p.name, p.flavor)} desativado.` : `${productLabel(p.name, p.flavor)} reativado.`);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const downloadBackup = async () => {
    try {
      const extra = await exportStockAsync(stock);
      exportJSON({ ...exportBackup(), version: 2, stock: extra }, `backup-gobe-${todayISO()}`);
      toast('Backup baixado. Guarde o arquivo em um local seguro.');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const exportAll = () =>
    exportExcel(
      [
        {
          name: 'Pedidos',
          rows: orders.map((o) => ({
            'Data de entrega': fmtDate(o.delivery_date),
            'Data do pedido': fmtDate(o.order_date),
            Cliente: o.customer_name,
            Telefone: fmtPhone(o.phone),
            Fatias: o.slices,
            Subtotal: o.subtotal,
            Desconto: o.discount,
            'Taxa de entrega': o.delivery_fee,
            Total: o.total,
            Recebido: o.netPaid,
            'A receber': o.balance,
            'Forma de pagamento': PAYMENT_METHOD_LABEL[o.payment_method],
            Pagamento: PAYMENT_STATUS_LABEL[o.paymentStatusLive],
            'Situação': STATUS_META[o.status].label,
            'Observações': o.notes ?? '',
          })),
        },
        {
          name: 'Itens',
          rows: orders.flatMap((o) =>
            o.items.map((i) => ({
              'Data de entrega': fmtDate(o.delivery_date),
              Cliente: o.customer_name,
              Produto: i.product_name,
              Sabor: i.flavor ?? '',
              Fatias: i.quantity,
              'Valor unitário': i.unit_price,
              Subtotal: i.quantity * i.unit_price,
              Cancelado: o.cancelled ? 'Sim' : 'Não',
            })),
          ),
        },
        {
          name: 'Pagamentos',
          rows: payments.map((p) => ({
            Data: fmtDate(p.paid_at),
            Cliente: getOrder(p.order_id)?.customer_name ?? '',
            Tipo: p.kind === 'estorno' ? 'Estorno' : 'Recebimento',
            Forma: PAYMENT_METHOD_LABEL[p.method],
            Valor: p.kind === 'estorno' ? -p.amount : p.amount,
          })),
        },
        {
          name: 'Produtos',
          rows: products.map((p) => ({ Produto: p.name, Sabor: p.flavor ?? '', 'Preço': p.price, Ativo: p.active ? 'Sim' : 'Não' })),
        },
      ],
      `gobe-dados-completos-${todayISO()}`,
    );

  const onRestoreFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as BackupFile & { stock?: Partial<StockBackup> };
      if (data.app !== 'gb-gobe') throw new Error('Este arquivo não é um backup do sistema GB GOBÊ.');
      const r = await confirm({
        title: 'Restaurar backup?',
        danger: true,
        confirmLabel: 'Restaurar',
        message: (
          <>
            Backup de <b>{fmtDateTime(data.exported_at)}</b> com {data.orders.length} pedido(s), {data.order_items.length} item(ns) e {data.payments.length}{' '}
            pagamento(s){data.stock ? `, ${data.stock.ingredients?.length ?? 0} ingrediente(s) e ${data.stock.expenses?.length ?? 0} despesa(s)` : ''}. Registros com o mesmo identificador serão sobrescritos pela versão do backup; registros novos criados depois dele serão mantidos.
          </>
        ),
      });
      if (!r.ok) return;
      setRestoring(true);
      await restoreBackup(data);
      if (data.stock) await stock.restoreStock(data.stock);
      toast('Backup restaurado com sucesso!');
    } catch (e) {
      toast(e instanceof SyntaxError ? 'Arquivo inválido.' : errorMessage(e), 'error');
    } finally {
      setRestoring(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Produtos e configurações" subtitle="Cardápio, preços, backup e acesso da equipe." />

      <Card>
        <SectionTitle
          icon={CakeSlice}
          title="Produtos e preços"
          subtitle={`${products.filter((p) => p.active).length} ativo(s) de ${products.length}`}
          action={
            <Button icon={Plus} onClick={() => setEditing('new')}>
              Novo produto ou sabor
            </Button>
          }
        />
        <div className="mb-4 flex gap-2 rounded-xl bg-creme-50 p-3 text-xs text-bordo/70">
          <Info className="h-4 w-4 shrink-0 text-cereja" />
          Alterar um preço vale apenas para os próximos pedidos — os pedidos já cadastrados mantêm o valor da época. Produtos desativados somem do formulário,
          mas continuam no histórico.
        </div>
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-bordo/10 text-left text-[11px] font-bold uppercase tracking-wider text-bordo/50">
                <th className="py-2 pr-3">Produto</th>
                <th className="py-2 pr-3">Sabor</th>
                <th className="py-2 pr-3 text-right">Preço unitário</th>
                <th className="py-2 pr-3 text-right">Fatias vendidas</th>
                <th className="py-2 pr-3">Disponível</th>
                <th className="py-2 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-bordo/5">
              {products.map((p) => (
                <tr key={p.id} className={cx(!p.active && 'opacity-55')}>
                  <td className="py-3 pr-3 font-semibold text-bordo">{p.name}</td>
                  <td className="py-3 pr-3 text-bordo/70">{p.flavor ?? '—'}</td>
                  <td className="py-3 pr-3 text-right font-bold text-bordo">{brl(p.price)}</td>
                  <td className="py-3 pr-3 text-right text-bordo/70">{usage(p)}</td>
                  <td className="py-3 pr-3">
                    <Checkbox checked={p.active} onChange={() => toggle(p)} label={<span className="text-xs">{p.active ? 'Ativo' : 'Inativo'}</span>} />
                  </td>
                  <td className="py-3 text-right">
                    <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(p)}>
                      Editar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle icon={Database} title="Backup e exportação" subtitle="Seus dados ficam salvos na nuvem; o backup é uma cópia extra" />
          <div className="space-y-3">
            <Button variant="secondary" icon={DownloadCloud} className="w-full justify-start" onClick={downloadBackup}>
              Baixar backup completo (.json)
            </Button>
            <Button variant="secondary" icon={FileSpreadsheet} className="w-full justify-start" onClick={exportAll}>
              Exportar todos os dados para Excel
            </Button>
            <Button variant="secondary" icon={UploadCloud} className="w-full justify-start" loading={restoring} onClick={() => fileRef.current?.click()}>
              Restaurar a partir de um backup
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onRestoreFile(f);
              }}
            />
            <p className="text-xs text-bordo/50">Dica: baixe um backup toda semana e guarde no Google Drive ou no computador.</p>
          </div>
        </Card>

        <Card>
          <SectionTitle icon={ShieldCheck} title="Acesso da equipe" />
          <p className="text-sm text-bordo/70">
            Conectado como <b>{session?.user.email}</b>.
          </p>
          <p className="mt-3 text-sm text-bordo/70">
            Somente pessoas cadastradas no Supabase <b>e</b> liberadas na tabela <code className="rounded bg-creme px-1">staff</code> conseguem ver e alterar os pedidos.
            Para incluir alguém, siga o passo “Adicionar pessoas da equipe” do arquivo de instruções (README).
          </p>
        </Card>
      </div>

      <PixCapacityCard />

      <Card>
        <SectionTitle icon={Palette} title="Legenda de cores" />
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STATUS_META) as DisplayStatus[]).map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
      </Card>

      {editing && <ProductModal product={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ProductModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { products, saveProduct } = useData();
  const { toast } = useUI();
  const [name, setName] = useState(product?.name ?? '');
  const [flavor, setFlavor] = useState(product?.flavor ?? '');
  const [price, setPrice] = useState(product?.price ?? 0);
  const [activeP, setActiveP] = useState(product?.active ?? true);
  const [saving, setSaving] = useState(false);
  const names = Array.from(new Set(products.map((p) => p.name)));

  const save = async () => {
    if (!name.trim()) return toast('Informe o nome do produto.', 'error');
    if (price <= 0) return toast('Informe um preço maior que zero.', 'error');
    const dup = products.find(
      (p) => p.id !== product?.id && p.name.trim().toLowerCase() === name.trim().toLowerCase() && (p.flavor ?? '').trim().toLowerCase() === flavor.trim().toLowerCase(),
    );
    if (dup) return toast('Já existe um produto com esse nome e sabor.', 'error');
    setSaving(true);
    try {
      await saveProduct({ name, flavor: flavor || null, price, active: activeP }, product?.id);
      toast(product ? 'Produto atualizado!' : 'Produto cadastrado!');
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={product ? 'Editar produto' : 'Novo produto ou sabor'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Produto" required hint="Para um novo sabor de um produto existente, escolha o mesmo nome (ex.: Recheadíssimo).">
          <Input list="gobe-produtos" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Recheadíssimo" autoFocus />
          <datalist id="gobe-produtos">
            {names.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>
        <Field label="Sabor" hint="Opcional">
          <Input value={flavor} onChange={(e) => setFlavor(e.target.value)} placeholder="Ex.: Pistache" />
        </Field>
        <Field label="Preço unitário (por fatia)" required>
          <MoneyInput value={price} onChange={setPrice} />
        </Field>
        <Checkbox checked={activeP} onChange={setActiveP} label="Disponível para novos pedidos" />
        {product && product.price !== price && (
          <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-100">
            O novo preço valerá só para pedidos cadastrados a partir de agora.
          </p>
        )}
      </div>
    </Modal>
  );
}

function PixCapacityCard() {
  const { settings, save, available } = useSettings();
  const { toast } = useUI();
  const [pix, setPix] = useState(settings.pix);
  const [capacity, setCapacity] = useState(settings.capacity);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPix(settings.pix);
    setCapacity(settings.capacity);
  }, [settings]);

  const submit = async () => {
    setSaving(true);
    try {
      await save({ pix: { ...pix, key: pix.key.trim() }, capacity: Math.max(0, Math.round(capacity)) });
      toast('Configurações salvas!');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <SectionTitle icon={QrCode} title="Pix e limite de produção" subtitle="Usados nas mensagens, no QR Code e nos avisos de dia lotado" />
      {!available ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Rode o arquivo supabase/03_melhorias.sql no Supabase para ativar esta parte.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo da chave Pix">
            <Select value={pix.type} onChange={(e) => setPix({ ...pix, type: e.target.value as PixKeyType })}>
              <option value="telefone">Telefone</option>
              <option value="cpf">CPF</option>
              <option value="cnpj">CNPJ</option>
              <option value="email">E-mail</option>
              <option value="aleatoria">Chave aleatória</option>
            </Select>
          </Field>
          <Field label="Chave Pix">
            <Input value={pix.key} onChange={(e) => setPix({ ...pix, key: e.target.value })} placeholder="Ex.: (51) 99999-9999" />
          </Field>
          <Field label="Nome que aparece no Pix" hint="Sem acentos, até 25 letras">
            <Input value={pix.name} onChange={(e) => setPix({ ...pix, name: e.target.value })} maxLength={25} />
          </Field>
          <Field label="Cidade">
            <Input value={pix.city} onChange={(e) => setPix({ ...pix, city: e.target.value })} maxLength={15} />
          </Field>
          <Field label="Limite de fatias por dia" hint="0 = sem limite. Avisa quando o dia lotar.">
            <Input type="number" min={0} value={capacity || ''} onChange={(e) => setCapacity(Number(e.target.value) || 0)} placeholder="0" />
          </Field>
          <div className="flex items-end">
            <Button onClick={submit} loading={saving} className="w-full sm:w-auto">
              Salvar
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
