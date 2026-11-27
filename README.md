# GB GOBÊ – Sistema de Gestão de Pedidos

Painel interno da **GB GOBÊ – Confeitaria Artesanal** para organizar pedidos, produção, entregas, pagamentos e vendas.

Feito com **React + TypeScript + Tailwind CSS + Lucide + Recharts + Supabase**, pronto para publicar na **Netlify**.

---

## O que o sistema faz

| Aba | O que tem |
|---|---|
| **Visão geral** | Faturamento do dia, semana, mês e total; recebidos × pendentes; fatias; pedidos por situação; ticket médio; 6 gráficos; filtro por dia/semana/mês/ano/período personalizado; alertas; calendário de entregas; rankings de produtos e clientes |
| **Novo pedido** | Vários produtos no mesmo pedido, total automático, desconto, taxa de entrega, pagamento (inclusive parcial, com saldo automático), situação da produção e observações. Bloqueia entregas às terças e quintas |
| **Entregas (seg, qua, sex, sáb, dom)** | Resumo do dia, tabela com caixas de seleção por produto, situação automática quando tudo fica pronto, cores por situação, filtro por situação, pesquisa por cliente, marcar como entregue, editar/duplicar/cancelar |
| **Controle de produção** | Agrupa tudo por produto e sabor para cada dia, com encomendado, produzido, pendente, barra de progresso e %. Marca fatia por fatia (+/−) sem perder de qual pedido é. Imprimir, CSV e Excel |
| **Controle financeiro** | Vendas × dinheiro efetivamente recebido, a receber, Pix, dinheiro, pedidos pagos/pendentes, clientes devendo (com botão de cobrança no WhatsApp), histórico de recebimentos, estornos de pedidos cancelados, relatórios em CSV e Excel |
| **Histórico de pedidos** | Todos os pedidos para sempre, com filtros por cliente, telefone, produto, datas, situação e forma de pagamento; ficha de cada cliente com histórico de compras e produtos preferidos |
| **Produtos e configurações** | Cadastrar produtos e sabores, alterar preços (sem mudar pedidos antigos), desativar produtos, backup/restauração e exportação completa para Excel |
| **Compras e estoque** | Ingredientes, embalagens e materiais com quantidade, unidade, estoque mínimo, custo por unidade/grama/kg, última compra e fornecedor; cores de suficiente/baixo/esgotado; ajuste por contagem; histórico de movimentações; compras registradas com comprovante |
| **Lista de compras** | Calculada sozinha a partir dos pedidos ainda não produzidos × fichas técnicas × estoque, por dia/semana/mês/período; itens manuais; caixa “comprado”; ao finalizar, lança a compra uma única vez e atualiza o estoque |
| **Escanear notinha** | Foto pelo celular, imagem ou PDF lidos por IA (Claude); tela de conferência; vínculo de cada produto com o estoque; registra despesa, estoque, custo e guarda a imagem; bloqueia nota repetida; cadastro manual se a leitura falhar |
| **Receitas e custos** | Ficha técnica de cada brownie: ingredientes, rendimento, fatias por forma, embalagem por fatia, custo total, custo e lucro por fatia, margem — recalculados sempre que um ingrediente muda de preço |
| **Despesas** | Lançamento manual ou pela notinha, 10 categorias, comprovante, filtros, edição e exportação |
| **Rentabilidade** | Vendidas, preço, custo/fatia, lucro/fatia, margem, faturamento e lucro total de cada brownie, com ordenação |

Recursos gerais: login exclusivo da equipe, sincronização em tempo real entre celulares e computadores, botão rápido de novo pedido, busca global de clientes, alertas (sininho), confirmação antes de cancelar/excluir e mensagens de confirmação ao salvar.

---

## Passo a passo para colocar no ar

Você vai precisar de três contas gratuitas: **GitHub**, **Supabase** e **Netlify**. E do **Node.js 20 ou superior** instalado no computador (https://nodejs.org) — escolha a versão “LTS”.

### 1. Coloque a logo

Salve a logo oficial da GB GOBÊ como **`public/logo.png`** (de preferência quadrada, com fundo transparente, 512×512 px).
Enquanto ela não estiver lá, o sistema mostra um monograma “GB” provisório.

### 2. Crie o projeto no Supabase

1. Acesse https://supabase.com, entre e clique em **New project**.
2. Nome: `gobe-gestao`. Crie uma senha forte para o banco e guarde-a. Região: **South America (São Paulo)**.
3. Aguarde o projeto ficar pronto (1–2 minutos).

### 3. Crie as tabelas e a segurança

1. No menu lateral do Supabase, abra **SQL Editor** › **New query**.
2. Abra o arquivo **`supabase/schema.sql`** deste projeto, copie **todo** o conteúdo e cole no editor.
3. Clique em **Run**. Deve aparecer “Success. No rows returned”.

Isso cria as tabelas (produtos, pedidos, itens, pagamentos e equipe), as regras de segurança (ninguém fora da equipe acessa nada), a sincronização em tempo real e os 8 produtos iniciais do cardápio.

### 4. Bloqueie cadastros públicos

1. Vá em **Authentication** › **Sign In / Providers** (ou **Providers**) › **Email**.
2. Deixe o login por e-mail **ativado**.
3. Desative **Allow new users to sign up** (permitir novos cadastros). Assim, só quem você criar consegue entrar.

### 4.1. Ative estoque, receitas, compras e despesas

Ainda no **SQL Editor**, abra **New query**, cole **todo** o conteúdo de **`supabase/02_estoque_custos.sql`** e clique em **Run**.

Isso cria ingredientes (com uma lista inicial zerada para você completar), movimentações de estoque, fichas técnicas, compras, despesas, a lista de compras, a baixa automática dos ingredientes na produção e a pasta privada **comprovantes** (Storage) onde ficam as fotos das notas.

> Já usa o sistema? Pode rodar sem medo: o script não apaga nada e pode ser executado mais de uma vez.

### 4.2. Ative entrega/retirada, Pix e limite diário

No **SQL Editor**, rode também o **`supabase/03_melhorias.sql`**. Depois, em **Produtos e configurações › Pix e limite de produção**, cadastre a chave Pix e, se quiser, o limite de fatias por dia.

### 4.3. Ative a página de pedidos para clientes

Rode também o **`supabase/04_pedidos_site.sql`**. A página **`/pedir`** (ex.: `https://gobegestao.netlify.app/pedir`) fica aberta para os clientes, sem login: eles escolhem os brownies, o dia, entrega ou retirada e enviam. O pedido entra no sistema com o selo **SITE**. Os visitantes só conseguem ver o cardápio e enviar pedidos; preços, datas e limite diário são conferidos no banco.

### 5. Crie os usuários da equipe

1. Vá em **Authentication** › **Users** › **Add user** › **Create new user**.
2. Informe o e-mail e uma senha, e marque **Auto Confirm User**.
3. Repita para cada pessoa (por exemplo, você e a Lívia).

### 6. Libere o acesso de cada usuário

Criar o usuário não basta: ele também precisa estar na tabela `staff`. No **SQL Editor**, rode (trocando e-mail e nome):

```sql
insert into public.staff (user_id, email, name)
select id, email, 'Francisco' from auth.users where email = 'francisco@exemplo.com';

insert into public.staff (user_id, email, name)
select id, email, 'Lívia' from auth.users where email = 'livia@exemplo.com';
```

> Para **remover** o acesso de alguém: `delete from public.staff where email = 'email@exemplo.com';`

### 7. Configure a recuperação de senha

Em **Authentication** › **URL Configuration**:

- **Site URL**: o endereço do site na Netlify (ex.: `https://gobe-gestao.netlify.app`). Volte aqui depois do passo 10, se ainda não tiver o endereço.
- **Redirect URLs**: adicione `https://SEU-SITE.netlify.app/redefinir-senha` e `http://localhost:5173/redefinir-senha`.

### 8. Pegue as chaves do Supabase

Em **Project Settings** › **API** (ou **API Keys**), copie:

- **Project URL** → algo como `https://abcdefgh.supabase.co`
- **anon public key** (ou **Publishable key**) → um texto longo

> A chave *anon/publishable* pode ficar no site: quem protege os dados são as regras de segurança do passo 3. **Nunca** use a chave `service_role`/`secret` no site.

### 9. Rode no computador (opcional, mas recomendado)

No VS Code, abra a pasta do projeto e, no terminal (**Terminal › New Terminal**):

```bash
cp .env.example .env      # no Windows: copy .env.example .env
```

Abra o arquivo `.env` e cole a URL e a chave do passo 8. Depois:

```bash
npm install
npm run dev
```

Abra http://localhost:5173 e entre com um dos usuários criados.

### 10. Publique na Netlify

**Opção A – pelo GitHub (recomendado, atualiza sozinho a cada alteração):**

1. Crie um repositório **privado** no GitHub e envie o projeto (o arquivo `.env` não vai junto — isso é proposital).
2. Na Netlify: **Add new site** › **Import an existing project** › **GitHub** › escolha o repositório.
3. A Netlify lê o `netlify.toml` sozinha (comando `npm run build`, pasta `dist`).
4. Antes de publicar, em **Environment variables**, adicione:
   - `VITE_SUPABASE_URL` = sua Project URL
   - `VITE_SUPABASE_ANON_KEY` = sua chave anon/publishable
5. Clique em **Deploy**. Em **Site configuration › Change site name** você pode escolher algo como `gobe-gestao`.

**Opção B – arrastar e soltar:** rode `npm run build` no computador (com o `.env` preenchido) e arraste a pasta `dist` para https://app.netlify.com/drop.

Depois de publicar, volte ao passo 7 e confirme a **Site URL**.

### 10.1. Ative a leitura automática das notinhas (IA) — opção gratuita

A leitura roda numa **função da Netlify** (`netlify/functions/scan-receipt.mts`). A chave da IA fica só no servidor, nunca no navegador. Ela funciona com o **Google Gemini, que tem plano gratuito**, ou com o Claude (pago).

**Gemini (grátis):**
1. Acesse https://aistudio.google.com com sua conta Google e clique em **Get API key › Create API key**. Não precisa de cartão.
2. Na Netlify, em **Project configuration › Environment variables**, adicione `GEMINI_API_KEY` com a chave criada.
3. Faça um novo deploy.

No plano gratuito o Google limita a quantidade de leituras por dia (sobra para o uso de uma confeitaria) e pode usar o conteúdo enviado para melhorar os produtos dele. Se aparecer “modelo não encontrado”, crie a variável `GEMINI_MODEL` com o nome de um modelo **Flash** que o AI Studio mostre como gratuito.

**Claude (pago, opcional):** use `ANTHROPIC_API_KEY` (e, se quiser, `ANTHROPIC_MODEL`). Se as duas chaves existirem, o sistema usa o Gemini.

> **Publicar arrastando a pasta `dist` não envia a função.** Para a leitura automática, publique pelo GitHub (grátis) ou com o comando `netlify deploy --prod` da Netlify CLI. Sem isso, todo o resto funciona, inclusive cadastrar compras e despesas à mão.

## Como o sistema calcula as coisas

- **Total do pedido** = soma de (fatias × valor unitário) − desconto + taxa de entrega.
- **Preços congelados**: cada item guarda o nome, o sabor e o preço do momento do pedido. Alterar o preço de um produto só vale para pedidos novos.
- **Vendas/faturamento** contam pela **data de entrega** e ignoram pedidos cancelados.
- **Recebido** conta pela **data do pagamento** (dinheiro que realmente entrou, já descontados os estornos).
- **Pagamento parcial**: informe o valor recebido; o saldo é calculado sozinho. Cada recebimento vira um lançamento no histórico, com data e forma.
- **Produção automática**: ao marcar todas as fatias de um pedido, ele vira **Pronto**; com algumas marcadas, **Em produção**.
- **Cancelar** mantém o pedido no histórico (vermelho) e o tira de vendas e produção. Se houver valor recebido, aparece o aviso para registrar o **estorno**. **Excluir definitivamente** só existe no Histórico.
- **Cores**: amarelo = produção pendente · azul = em produção · verde = pronto · roxo = entregue · vermelho = cancelado.

## Atalhos do dia a dia

- **Colar pedido do WhatsApp** (no topo do formulário de novo pedido): cole a mensagem do cliente e o pedido é preenchido pela IA. Usa a mesma `GEMINI_API_KEY` da notinha.
- **Botão verde do WhatsApp** em cada pedido: mensagens prontas (confirmado, pronto, saiu para entrega, cobrança com Pix), QR Code Pix com o valor certo e comprovante em imagem.
- **Entregas**: um só item no menu, com os dias em botões no topo e abas por situação (a produzir, prontos, entregues sem pagamento, concluídos, cancelados).
- **Menu de baixo no celular**: Início, Entregas, + Novo pedido, Produção e Mais.
- **Aviso de pedido novo** quando outra pessoa da equipe cadastra um pedido.

## Como estoque, custos e lucro funcionam juntos

- **Pedido cadastrado** → entra nas vendas, na produção e na lista de compras (necessidade de ingredientes). O custo atual da fatia (pela ficha técnica) fica **congelado** no item do pedido.
- **Fatias marcadas como prontas** → o banco baixa do estoque, na hora, os ingredientes e embalagens da ficha técnica. Desmarcar devolve. Cada fatia só é baixada uma vez, mesmo com várias pessoas usando ao mesmo tempo.
- **Compra registrada** (notinha, lista de compras ou manual) → numa única operação: entrada no estoque, novo custo de cada ingrediente (com o desconto rateado), despesas por categoria, comprovante guardado. A mesma nota (mesmo arquivo) não entra duas vezes, e um duplo clique não duplica nada.
- **Preço de ingrediente mudou** → o custo das receitas é recalculado na hora. Pedidos antigos mantêm o custo da época.
- **Excluir uma compra** → desfaz a entrada no estoque e as despesas dela.
- **Resultado de caixa** = dinheiro recebido − todas as despesas pagas no período.
- **Lucro estimado** = vendas − custo das fatias vendidas (ficha técnica) − despesas que não viram estoque (luz, água, gás, transporte, marketing, equipamentos, outras). Ingredientes, embalagens e adesivos entram pelo consumo, não pela compra, para não contar duas vezes.
- **Unidades**: o estoque usa a unidade do item (kg, g, L, ml, un). Na receita você pode usar g para um item em kg, e o sistema converte.

## Backup

Os dados ficam salvos no Supabase. Para ter uma cópia extra, use **Produtos e configurações › Baixar backup completo** (arquivo `.json`) — ele pode ser restaurado pelo mesmo menu. O plano gratuito do Supabase pausa projetos sem uso por 7 dias seguidos; com o uso diário isso não acontece, e se acontecer basta clicar em **Restore** no painel do Supabase.

## Estrutura do projeto

```
gobe-gestao/
├── public/            logo.svg (provisória) e logo.png (a oficial, você adiciona)
├── netlify/functions/
│   └── scan-receipt.mts  leitura de notas com IA (roda no servidor)
├── supabase/
│   ├── schema.sql           pedidos, pagamentos, segurança (RLS), tempo real, produtos
│   └── 02_estoque_custos.sql estoque, receitas, compras, despesas, baixa automática
├── src/
│   ├── components/    layout, formulário de pedido, modais, gráficos, peças visuais
│   ├── context/       autenticação, dados (Supabase + tempo real) e interface
│   ├── lib/           tipos, cálculos, datas/moeda, períodos, alertas, exportação
│   └── pages/         uma página para cada aba do menu
├── netlify.toml       configuração de publicação
└── .env.example       modelo das variáveis de ambiente
```

## Comandos

| Comando | Para quê |
|---|---|
| `npm install` | Instala as dependências (só na primeira vez) |
| `npm run dev` | Abre o sistema no computador em modo de desenvolvimento |
| `npm run build` | Gera a versão de produção na pasta `dist` |
| `npm run typecheck` | Verifica erros de tipagem do TypeScript |

## Problemas comuns

- **“Configuração pendente”** → faltam as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (no `.env` ou na Netlify). Depois de adicioná-las na Netlify, faça um novo deploy.
- **“Acesso não liberado”** → o login funcionou, mas o usuário não está na tabela `staff` (passo 6).
- **“E-mail ou senha incorretos”** → confira o usuário em Authentication › Users; marque “Auto Confirm User” ao criar.
- **Página em branco ao recarregar na Netlify** → confirme que o `netlify.toml` foi enviado junto.
- **Aviso amarelo “módulos de estoque… não foram ativados”** → rode o `supabase/02_estoque_custos.sql` (passo 4.1).
- **“A função de leitura não está publicada”** → o site foi publicado sem a pasta `netlify/functions` (use a opção A) ou o deploy é antigo.
- **“Leitura automática ainda não foi configurada”** → falta `GEMINI_API_KEY` na Netlify (passo 10.1) ou faltou novo deploy depois de adicioná-la.
- **Leitura demorando e falhando** → funções da Netlify têm limite de tempo; use um modelo Flash/Haiku, que são os mais rápidos, e envie fotos nítidas.
- **Ingrediente não sai do estoque ao produzir** → o produto precisa de ficha técnica em Receitas e custos.
- **Mudanças não aparecem no outro aparelho** → confirme que a parte 8 do `schema.sql` rodou (Database › Publications › `supabase_realtime` deve listar as 4 tabelas).
