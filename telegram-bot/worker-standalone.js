// Versão em arquivo único do bot do Telegram (Agente Virtual de Gestão),
// para colar direto no editor do painel da Cloudflare (dash.cloudflare.com),
// sem precisar de terminal, npm ou wrangler.
//
// Configuração necessária no painel, em Settings -> Variables and Secrets:
//   TELEGRAM_BOT_TOKEN      (tipo Secret) — token dado pelo @BotFather
//   TELEGRAM_WEBHOOK_SECRET (tipo Secret) — uma string aleatória escolhida por você
//
// Depois de publicar, conecte o Telegram ao Worker visitando esta URL
// (trocando os valores entre < >) no navegador:
//   https://api.telegram.org/bot<TOKEN>/setWebhook?url=<URL_DO_WORKER>&secret_token=<SEGREDO>

// ---------- Lógica de organização/análise de dados ----------

const PALAVRAS_DATA_ALERTA = /valid|vencim|calibra|manuten|revis|troca|expira/i;
const PALAVRAS_DATA_PASSADA = /última|ultima|anterior|passad|realizad/i;

function detectarDelimitador(texto) {
    const linhas = texto.split(/\r?\n/).filter(l => l.trim() !== '');
    const candidatos = ['\t', ';', ',', '|'];
    let melhor = ',';
    let melhorPontuacao = -1;

    candidatos.forEach(delim => {
        const contagens = linhas.slice(0, 10).map(l => l.split(delim).length);
        const media = contagens.reduce((a, b) => a + b, 0) / contagens.length;
        const consistente = contagens.every(c => c === contagens[0]);
        const pontuacao = (consistente ? 100 : 0) + media;
        if (media > 1 && pontuacao > melhorPontuacao) {
            melhorPontuacao = pontuacao;
            melhor = delim;
        }
    });

    return melhorPontuacao > -1 ? melhor : null;
}

function parseTexto(texto, temCabecalho) {
    const linhas = texto.split(/\r?\n/).filter(l => l.trim() !== '');
    if (linhas.length === 0) return { cabecalhos: [], linhas: [] };

    const delimitador = detectarDelimitador(texto);
    let matriz;

    if (delimitador) {
        matriz = linhas.map(l => l.split(delimitador).map(c => c.trim()));
    } else {
        matriz = linhas.map(l => [l.trim()]);
    }

    const maxColunas = Math.max(...matriz.map(l => l.length));
    matriz.forEach(l => { while (l.length < maxColunas) l.push(''); });

    let heads, dados;
    if (temCabecalho) {
        heads = matriz[0];
        dados = matriz.slice(1);
    } else {
        heads = Array.from({ length: maxColunas }, (_, i) => `Coluna ${i + 1}`);
        dados = matriz;
    }

    heads = heads.map((h, i) => (h && h.trim() !== '' ? h.trim() : `Coluna ${i + 1}`));

    return { cabecalhos: heads, linhas: dados };
}

function parseData(str) {
    if (!str) return null;
    let m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) {
        let [, d, mo, a] = m;
        if (a.length === 2) a = '20' + a;
        const dt = new Date(Number(a), Number(mo) - 1, Number(d));
        return isNaN(dt) ? null : dt;
    }
    m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
        const [, a, mo, d] = m;
        const dt = new Date(Number(a), Number(mo) - 1, Number(d));
        return isNaN(dt) ? null : dt;
    }
    return null;
}

function analisarColunas(heads, linhas) {
    let totalVazios = 0;
    const analiseColunas = heads.map((nome, idx) => {
        const valores = linhas.map(l => l[idx] || '');
        const vazios = valores.filter(v => v.trim() === '').length;
        totalVazios += vazios;

        const preenchidos = valores.filter(v => v.trim() !== '');
        const numericos = preenchidos.filter(v => !isNaN(parseFloat(v.replace(',', '.'))) && v.trim() !== '');
        const datas = preenchidos.filter(v => parseData(v) !== null);

        const distintos = new Set(preenchidos.map(v => v.trim()));
        const ehData = preenchidos.length > 0 && datas.length / preenchidos.length > 0.7;
        const ehNumerico = !ehData && preenchidos.length > 0 && numericos.length / preenchidos.length > 0.7;
        const ehCategorico = !ehData && !ehNumerico && distintos.size > 0 && distintos.size <= 15 && distintos.size < preenchidos.length * 0.7;

        return { nome, idx, valores, vazios, distintos, ehData, ehNumerico, ehCategorico };
    });
    return { totalVazios, analiseColunas };
}

function gerarRelatorioTexto(heads, linhas) {
    const totalLinhas = linhas.length;
    const totalColunas = heads.length;
    const { totalVazios, analiseColunas } = analisarColunas(heads, linhas);

    const partes = [];
    partes.push(`📋 Resumo\nRegistros: ${totalLinhas}\nColunas: ${totalColunas}\nCampos vazios: ${totalVazios}`);

    const colunasAlerta = analiseColunas.filter(c => c.ehData && PALAVRAS_DATA_ALERTA.test(c.nome) && !PALAVRAS_DATA_PASSADA.test(c.nome));
    if (colunasAlerta.length > 0) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const linhasAlerta = [];

        colunasAlerta.forEach(col => {
            linhas.forEach((linha, linhaIdx) => {
                const valorBruto = linha[col.idx];
                const data = parseData(valorBruto);
                if (!data) return;
                const diffDias = Math.round((data - hoje) / 86400000);
                const identificador = linha[0] || `Linha ${linhaIdx + 2}`;

                if (diffDias < 0) {
                    linhasAlerta.push(`🔴 ${identificador} — "${col.nome}" venceu há ${Math.abs(diffDias)} dia(s) (${valorBruto})`);
                } else if (diffDias <= 30) {
                    linhasAlerta.push(`🟡 ${identificador} — "${col.nome}" vence em ${diffDias} dia(s) (${valorBruto})`);
                }
            });
        });

        if (linhasAlerta.length > 0) {
            partes.push(`⏰ Prazos e vencimentos\n${linhasAlerta.join('\n')}`);
        } else {
            partes.push('⏰ Prazos e vencimentos\n🟢 Nenhum prazo vencido ou próximo (30 dias).');
        }
    }

    const colunasCategoricas = analiseColunas.filter(c => c.ehCategorico);
    const distribuicoes = colunasCategoricas.map(col => {
        const contagem = {};
        col.valores.forEach(v => {
            const chave = v.trim() === '' ? '(vazio)' : v.trim();
            contagem[chave] = (contagem[chave] || 0) + 1;
        });
        const entradas = Object.entries(contagem).sort((a, b) => b[1] - a[1]);
        const linhasTexto = entradas.map(([chave, qtd]) => `  • ${chave}: ${qtd}`).join('\n');
        return { idx: col.idx, nome: col.nome, entradas, texto: `📊 Distribuição por "${col.nome}"\n${linhasTexto}` };
    });
    distribuicoes.forEach(d => partes.push(d.texto));

    const colunasComVazios = analiseColunas.filter(c => c.vazios > 0);
    if (colunasComVazios.length > 0) {
        const linhasTexto = colunasComVazios.map(c => `  • "${c.nome}": ${c.vazios} de ${totalLinhas}`).join('\n');
        partes.push(`🧹 Qualidade dos dados (campos vazios)\n${linhasTexto}`);
    }

    return { texto: partes.join('\n\n'), distribuicoes };
}

function gerarCSV(heads, linhas) {
    const escapar = v => `"${String(v).replace(/"/g, '""')}"`;
    const linhasCSV = [heads.map(escapar).join(';')].concat(linhas.map(l => l.map(escapar).join(';')));
    return '﻿' + linhasCSV.join('\r\n');
}

// ---------- Encoder PNG mínimo (sem dependências externas) ----------

const TABELA_CRC = (() => {
    const tabela = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        tabela[n] = c >>> 0;
    }
    return tabela;
})();

function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function concatBytes(...partes) {
    const total = partes.reduce((soma, p) => soma + p.length, 0);
    const saida = new Uint8Array(total);
    let offset = 0;
    partes.forEach(p => { saida.set(p, offset); offset += p.length; });
    return saida;
}

function u32(n) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, false);
    return b;
}

function construirChunk(tipo, dados) {
    const tipoBytes = new TextEncoder().encode(tipo);
    const corpo = concatBytes(tipoBytes, dados);
    return concatBytes(u32(dados.length), corpo, u32(crc32(corpo)));
}

async function deflateZlib(bytes) {
    const cs = new CompressionStream('deflate');
    const writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const resposta = new Response(cs.readable);
    const buffer = await resposta.arrayBuffer();
    return new Uint8Array(buffer);
}

async function codificarPNG(buffer, largura, altura) {
    const ASSINATURA = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

    const ihdrDados = concatBytes(
        u32(largura),
        u32(altura),
        new Uint8Array([8, 6, 0, 0, 0])
    );
    const ihdr = construirChunk('IHDR', ihdrDados);

    const bytesPorLinha = largura * 4;
    const bruto = new Uint8Array((bytesPorLinha + 1) * altura);
    for (let y = 0; y < altura; y++) {
        const origem = y * bytesPorLinha;
        const destino = y * (bytesPorLinha + 1);
        bruto[destino] = 0;
        bruto.set(buffer.subarray(origem, origem + bytesPorLinha), destino + 1);
    }

    const comprimido = await deflateZlib(bruto);
    const idat = construirChunk('IDAT', comprimido);
    const iend = construirChunk('IEND', new Uint8Array(0));

    return concatBytes(ASSINATURA, ihdr, idat, iend);
}

// ---------- Gráficos (barras/pizza), desenhados em pixels puros ----------

const PALETA_GRAFICO = ['#0066cc', '#2e9e5b', '#e0a800', '#cc3333', '#7a3fbf', '#00a3a3', '#c2559b', '#5b6b7a'];

function hexParaRGB(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function criarBuffer(largura, altura, corFundo) {
    const buffer = new Uint8Array(largura * altura * 4);
    const [r, g, b] = corFundo;
    for (let i = 0; i < buffer.length; i += 4) {
        buffer[i] = r; buffer[i + 1] = g; buffer[i + 2] = b; buffer[i + 3] = 255;
    }
    return buffer;
}

function pintarPixel(buffer, largura, altura, x, y, rgb) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= largura || y >= altura) return;
    const i = (y * largura + x) * 4;
    buffer[i] = rgb[0]; buffer[i + 1] = rgb[1]; buffer[i + 2] = rgb[2]; buffer[i + 3] = 255;
}

function preencherRetangulo(buffer, largura, altura, x0, y0, x1, y1, rgb) {
    const xi = Math.max(0, Math.round(Math.min(x0, x1)));
    const xf = Math.min(largura - 1, Math.round(Math.max(x0, x1)));
    const yi = Math.max(0, Math.round(Math.min(y0, y1)));
    const yf = Math.min(altura - 1, Math.round(Math.max(y0, y1)));
    for (let y = yi; y <= yf; y++) {
        for (let x = xi; x <= xf; x++) pintarPixel(buffer, largura, altura, x, y, rgb);
    }
}

function preencherFatiaPizza(buffer, largura, altura, cx, cy, raio, anguloIni, anguloFim, rgb) {
    const xi = Math.max(0, Math.floor(cx - raio));
    const xf = Math.min(largura - 1, Math.ceil(cx + raio));
    const yi = Math.max(0, Math.floor(cy - raio));
    const yf = Math.min(altura - 1, Math.ceil(cy + raio));

    for (let y = yi; y <= yf; y++) {
        for (let x = xi; x <= xf; x++) {
            const dx = x - cx, dy = y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > raio) continue;
            let ang = Math.atan2(dy, dx);
            if (ang < anguloIni) ang += Math.PI * 2;
            if (ang >= anguloIni && ang <= anguloFim) {
                pintarPixel(buffer, largura, altura, x, y, rgb);
            }
        }
    }
}

async function gerarGraficoBarrasPNG(valores) {
    const largura = 600, altura = 360;
    const margemEsq = 20, margemInf = 20, margemSup = 20, margemDir = 20;
    const buffer = criarBuffer(largura, altura, [255, 255, 255]);

    const areaLargura = largura - margemEsq - margemDir;
    const areaAltura = altura - margemSup - margemInf;
    const max = Math.max(...valores, 1);
    const slot = areaLargura / valores.length;

    valores.forEach((valor, i) => {
        const alturaBarra = (valor / max) * areaAltura;
        const larguraBarra = Math.min(70, slot * 0.6);
        const x0 = margemEsq + i * slot + (slot - larguraBarra) / 2;
        const y0 = altura - margemInf - alturaBarra;
        preencherRetangulo(buffer, largura, altura, x0, y0, x0 + larguraBarra, altura - margemInf, hexParaRGB(PALETA_GRAFICO[0]));
    });

    return codificarPNG(buffer, largura, altura);
}

function construirLegenda(entradas) {
    const emojisCor = ['🟦', '🟩', '🟨', '🟥', '🟪', '🟦', '🟪', '⬛'];
    const total = entradas.reduce((a, [, qtd]) => a + qtd, 0) || 1;
    return entradas.map(([chave, qtd], i) => {
        const pct = Math.round((qtd / total) * 100);
        return `${emojisCor[i % emojisCor.length]} ${chave}: ${qtd} (${pct}%)`;
    }).join('\n');
}

// ---------- Chamadas à Bot API do Telegram ----------

function apiUrl(token, metodo) {
    return `https://api.telegram.org/bot${token}/${metodo}`;
}

async function enviarMensagem(token, chatId, texto) {
    return fetch(apiUrl(token, 'sendMessage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: texto })
    });
}

async function enviarDocumento(token, chatId, nomeArquivo, conteudo, mimeType, caption) {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    if (caption) form.append('caption', caption);
    form.append('document', new Blob([conteudo], { type: mimeType }), nomeArquivo);
    return fetch(apiUrl(token, 'sendDocument'), { method: 'POST', body: form });
}

async function enviarFoto(token, chatId, nomeArquivo, bytesPNG, caption) {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    if (caption) form.append('caption', caption.slice(0, 1024));
    form.append('photo', new Blob([bytesPNG], { type: 'image/png' }), nomeArquivo);
    return fetch(apiUrl(token, 'sendPhoto'), { method: 'POST', body: form });
}

// ---------- Worker ----------

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
