import { parseTexto, gerarRelatorioTexto, gerarCSV } from './logica.js';
import { gerarGraficoBarrasPNG, gerarGraficoPizzaPNG, construirLegenda } from './grafico.js';
import { enviarMensagem, enviarDocumento, enviarFoto } from './telegram.js';

const TEXTO_AJUDA = `🤖 Agente Virtual de Gestão

Cole aqui os dados copiados da sua planilha (Excel/Google Sheets) ou uma lista separada por ; , ou tabulação. Por padrão eu considero a primeira linha como título das colunas.

Se seus dados NÃO tiverem uma linha de título, comece a mensagem com a palavra:
SEMCABECALHO
(sozinha na primeira linha, seguida dos seus dados)

Eu respondo com:
📋 um resumo (contagens, prazos de manutenção/calibração vencidos ou próximos, qualidade dos dados)
📊 gráficos das colunas categóricas
📄 um arquivo CSV com os dados organizados`;

const MAX_GRAFICOS = 5;

async function processarMensagem(env, chatId, textoOriginal) {
    let texto = textoOriginal;
    let temCabecalho = true;

    if (/^SEMCABECALHO\s*\n/i.test(texto)) {
        temCabecalho = false;
        texto = texto.replace(/^SEMCABECALHO\s*\n/i, '');
    }

    const { cabecalhos, linhas } = parseTexto(texto, temCabecalho);
    if (linhas.length === 0 || cabecalhos.length === 0) {
        await enviarMensagem(env.TELEGRAM_BOT_TOKEN, chatId, 'Não consegui identificar dados na sua mensagem. Cole uma lista de linhas separadas por ; , ou tabulação.');
        return;
    }

    const { texto: relatorio, distribuicoes } = gerarRelatorioTexto(cabecalhos, linhas);
    await enviarMensagem(env.TELEGRAM_BOT_TOKEN, chatId, relatorio);

    const csv = gerarCSV(cabecalhos, linhas);
    await enviarDocumento(env.TELEGRAM_BOT_TOKEN, chatId, 'planilha-agente.csv', csv, 'text/csv;charset=utf-8', 'Seus dados organizados em CSV.');

    for (const dist of distribuicoes.slice(0, MAX_GRAFICOS)) {
        const valores = dist.entradas.map(e => e[1]);
        const png = await gerarGraficoBarrasPNG(valores);
        const legenda = `📊 Distribuição por "${dist.nome}"\n${construirLegenda(dist.entradas)}`;
        await enviarFoto(env.TELEGRAM_BOT_TOKEN, chatId, `grafico-${dist.idx}.png`, png, legenda);
    }
}

export default {
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return new Response('Agente Virtual de Gestão — bot do Telegram ativo.', { status: 200 });
        }

        const segredoEsperado = env.TELEGRAM_WEBHOOK_SECRET;
        if (segredoEsperado) {
            const segredoRecebido = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
            if (segredoRecebido !== segredoEsperado) {
                return new Response('Não autorizado', { status: 401 });
            }
        }

        let update;
        try {
            update = await request.json();
        } catch {
            return new Response('OK');
        }

        const mensagem = update.message;
        if (!mensagem || typeof mensagem.text !== 'string') {
            return new Response('OK');
        }

        const chatId = mensagem.chat.id;
        const texto = mensagem.text.trim();

        if (texto === '/start' || texto === '/ajuda' || texto === '/help') {
            ctx.waitUntil(enviarMensagem(env.TELEGRAM_BOT_TOKEN, chatId, TEXTO_AJUDA));
            return new Response('OK');
        }

        ctx.waitUntil(
            processarMensagem(env, chatId, texto).catch(erro =>
                enviarMensagem(env.TELEGRAM_BOT_TOKEN, chatId, `Ocorreu um erro ao processar seus dados: ${erro.message}`)
            )
        );
        return new Response('OK');
    }
};
