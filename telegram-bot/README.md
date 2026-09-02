# Bot do Telegram — Agente Virtual de Gestão

Versão do Agente Virtual que roda dentro do Telegram: você cola os dados numa
conversa com o bot e ele responde com o resumo, alertas de vencimento,
gráficos e um arquivo CSV. Roda como um Cloudflare Worker (plano gratuito),
sem servidor próprio pra manter.

## 1. Criar o bot no Telegram

1. Abra uma conversa com **@BotFather** no Telegram.
2. Envie `/newbot` e siga as instruções (nome e um `username` terminado em `bot`).
3. O BotFather te dá um **token** (algo como `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxx`).
   Guarde esse token — é ele que dá acesso ao seu bot, não compartilhe.

## 2. Criar conta no Cloudflare (gratuita)

1. Crie uma conta em https://dash.cloudflare.com/sign-up (não precisa cartão para o plano gratuito de Workers).

## Publicando pelo navegador, sem terminal (celular/iPad)

Se você não tem acesso a um computador com terminal, dá pra fazer tudo pelo
site da Cloudflare, usando o arquivo **`worker-standalone.js`** (é o mesmo
bot, só que em um único arquivo, pronto pra colar):

1. Em https://dash.cloudflare.com, no menu à esquerda vá em **Workers & Pages**
   → **Create** (ou o botão "Create an app" que você já encontrou).
2. Escolha **"Start with Hello World!"**, dê um nome ao Worker (ex.:
   `agente-virtual-bot`) e clique em **Deploy** — isso cria um worker de
   exemplo, que vamos substituir a seguir.
3. Depois de criado, clique em **"Edit code"** (ou o ícone de lápis/editor).
4. Apague todo o conteúdo do arquivo que abrir e cole no lugar todo o
   conteúdo de `telegram-bot/worker-standalone.js` (abra esse arquivo no
   GitHub, use o botão de copiar o conteúdo bruto/"Raw", e cole no editor
   da Cloudflare).
5. Clique em **Save and deploy** (ou "Deploy").
6. Vá em **Settings** → **Variables and Secrets** (dentro do seu Worker) →
   **Add** duas variáveis, marcando o tipo como **Secret** (não "Text",
   pra não ficar visível):
   - `TELEGRAM_BOT_TOKEN` → cole o token que o @BotFather te deu
   - `TELEGRAM_WEBHOOK_SECRET` → invente uma senha aleatória qualquer
   Salve.
7. Na aba principal do Worker, copie a URL dele (algo como
   `https://agente-virtual-bot.SEU-USUARIO.workers.dev`).
8. Abra uma nova aba no Safari e visite esta URL, trocando `<TOKEN>`,
   `<URL_DO_WORKER>` e `<SEGREDO>` pelos seus valores reais (a URL toda vai
   na barra de endereço, sem espaços):

   ```
   https://api.telegram.org/bot<TOKEN>/setWebhook?url=<URL_DO_WORKER>&secret_token=<SEGREDO>
   ```

   Deve aparecer `{"ok":true,"result":true,...}` na tela.
9. Pronto — pule para o passo **6. Testar** mais abaixo.

## 3. Instalar e configurar (alternativa, se você tiver um computador com terminal)

Dentro da pasta `telegram-bot/`:

```bash
npm install
npx wrangler login       # abre o navegador para autorizar sua conta Cloudflare
```

Configure os segredos (o Wrangler vai perguntar o valor de cada um, sem exibir na tela):

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
# cole o token do BotFather quando pedido

npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
# invente uma string aleatória qualquer (ex: gere uma em https://www.uuidgenerator.net/)
# isso impede que outras pessoas mandem requisições falsas pro seu bot
```

## 4. Publicar

```bash
npx wrangler deploy
```

Isso imprime uma URL do tipo:
`https://agente-virtual-telegram-bot.SEU-USUARIO.workers.dev`

## 5. Conectar o Telegram ao Worker

Troque `<TOKEN>`, `<URL_DO_WORKER>` e `<SEGREDO>` pelos seus valores reais e
rode este comando (no terminal, ou cole a URL no navegador):

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<URL_DO_WORKER>&secret_token=<SEGREDO>"
```

Deve responder `{"ok":true,"result":true,...}`.

## 6. Testar

Abra o Telegram, procure o bot pelo `username` que você escolheu, envie
`/start` (deve responder com as instruções) e depois cole um exemplo de
dados, por exemplo:

```
Equipamento;Fabricante;Setor;Status;Última Manutenção;Próxima Manutenção
Monitor Prolife C12;Prolife;UTI;Ativo;10/03/2026;10/09/2026
Ventilador Oxymag;Magnamed;UTI;Ativo;01/02/2026;01/08/2026
```

## Limitações (vs. o site)

- Não há planilha editável/ordenável dentro do Telegram — cada mensagem é
  processada isoladamente (sem estado entre mensagens).
- Os gráficos são estáticos (PNG), sem alternância barra/pizza; a legenda
  com os números vem como legenda da foto, não desenhada na imagem.
- Assim como o site, nenhum dado é enviado a serviços de terceiros — tudo é
  processado dentro do próprio Worker e devolvido só para o seu chat do
  Telegram.
