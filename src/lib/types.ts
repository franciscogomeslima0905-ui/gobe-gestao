export type PaymentMethod = 'pix' | 'dinheiro' | 'a_definir';
export type PaymentStatus = 'pago' | 'pendente' | 'parcial';
export type ProductionStatus = 'pendente' | 'em_producao' | 'pronto';
export type DeliveryStatus = 'pendente' | 'entregue';
export type DisplayStatus = ProductionStatus | 'entregue' | 'cancelado';
export type PaymentKind = 'recebimento' | 'estorno';

export interface Product {
  id: string;
  name: string;
  flavor: string | null;
  price: number;
  active: boolean;
  sort_order: number;
  created_at: string;
}

export interface Order {
  id: string;
  customer_name: string;
  phone: string | null;
  order_date: string;
  delivery_date: string;
  delivery_time: string | null;
  subtotal: number;
  discount: number;
  delivery_fee: number;
  total: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  production_status: ProductionStatus;
  delivery_status: DeliveryStatus;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  flavor: string | null;
  unit_price: number;
  quantity: number;
  produced_qty: number;
  /** custo da fatia congelado no pedido (null = sem ficha técnica na época) */
  unit_cost: number | null;
  consumed_qty: number;
  created_at: string;
}

export interface Payment {
  id: string;
  order_id: string;
  amount: number;
  method: PaymentMethod;
  kind: PaymentKind;
  paid_at: string;
  notes: string | null;
  created_at: string;
}

/** Pedido com itens, pagamentos e valores calculados */
export interface OrderFull extends Order {
  items: OrderItem[];
  payments: Payment[];
  cancelled: boolean;
  status: DisplayStatus;
  slices: number;
  producedSlices: number;
  received: number;
  refunded: number;
  netPaid: number;
  balance: number;
  paymentStatusLive: PaymentStatus;
}

export interface ItemDraft {
  key: string;
  id?: string;
  product_id: string | null;
  product_name: string;
  flavor: string | null;
  unit_price: number;
  quantity: number;
  produced_qty: number;
}

export interface OrderDraft {
  customer_name: string;
  phone: string;
  order_date: string;
  delivery_date: string;
  delivery_time: string;
  items: ItemDraft[];
  discount: number;
  delivery_fee: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  amount_received: number;
  paid_at: string;
  production_status: ProductionStatus;
  delivery_status: DeliveryStatus;
  notes: string;
}

/* ======================= Estoque, receitas e custos ======================= */
export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'un';
export type IngredientCategory = 'ingrediente' | 'embalagem' | 'adesivo' | 'outro';
export type ExpenseCategory =
  | 'ingredientes'
  | 'embalagens'
  | 'adesivos'
  | 'transporte'
  | 'energia'
  | 'agua'
  | 'gas'
  | 'marketing'
  | 'equipamentos'
  | 'outras';
export type ExpenseMethod = 'pix' | 'dinheiro' | 'cartao_debito' | 'cartao_credito' | 'boleto' | 'transferencia' | 'outro';
export type MovementType = 'compra' | 'consumo' | 'estorno_consumo' | 'ajuste';

export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  unit: Unit;
  stock_qty: number;
  min_stock: number;
  unit_cost: number;
  last_purchase_price: number | null;
  last_purchase_date: string | null;
  supplier: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
}

export interface StockMovement {
  id: string;
  ingredient_id: string;
  type: MovementType;
  quantity: number;
  unit_cost: number | null;
  total_cost: number | null;
  ref_type: string | null;
  ref_id: string | null;
  occurred_at: string;
  notes: string | null;
  created_at: string;
}

export interface Recipe {
  id: string;
  product_id: string;
  yield_pans: number;
  slices_per_pan: number;
  notes: string | null;
  created_at: string;
}

export interface RecipeItem {
  id: string;
  recipe_id: string;
  ingredient_id: string;
  quantity: number;
  unit: Unit;
  scope: 'receita' | 'fatia';
  created_at: string;
}

export interface Purchase {
  id: string;
  purchase_date: string;
  supplier: string | null;
  description: string | null;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: string;
  receipt_path: string | null;
  file_hash: string | null;
  source: 'manual' | 'nota' | 'lista';
  notes: string | null;
  created_at: string;
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  ingredient_id: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  total: number;
  stock_qty: number;
  category: ExpenseCategory;
  created_at: string;
}

export interface Expense {
  id: string;
  expense_date: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  supplier: string | null;
  payment_method: ExpenseMethod;
  receipt_path: string | null;
  purchase_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface ShoppingItem {
  id: string;
  ingredient_id: string | null;
  description: string | null;
  quantity: number;
  unit: string | null;
  estimated: number | null;
  created_at: string;
}

/** Linha da tela de conferência de compra */
export interface PurchaseLineDraft {
  key: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  ingredient_id: string | null;
  stock_qty: number;
  category: ExpenseCategory;
}

export interface PurchaseDraft {
  supplier: string;
  purchase_date: string;
  payment_method: ExpenseMethod;
  discount: number;
  total: number;
  notes: string;
  lines: PurchaseLineDraft[];
  /** categoria usada quando a compra não tem itens */
  category: ExpenseCategory;
}
