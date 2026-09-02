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

## 3. Instalar e configurar

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
