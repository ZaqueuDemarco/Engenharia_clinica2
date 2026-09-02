// Lógica de organização/análise de dados colados, portada de agente.js
// (sem nenhuma dependência de DOM/navegador, para rodar no Cloudflare Worker).

const PALAVRAS_DATA_ALERTA = /valid|vencim|calibra|manuten|revis|troca|expira/i;
const PALAVRAS_DATA_PASSADA = /última|ultima|anterior|passad|realizad/i;

export function detectarDelimitador(texto) {
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

export function parseTexto(texto, temCabecalho) {
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

export function parseData(str) {
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

export function analisarColunas(heads, linhas) {
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

export function gerarRelatorioTexto(heads, linhas) {
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

export function gerarCSV(heads, linhas) {
    const escapar = v => `"${String(v).replace(/"/g, '""')}"`;
    const linhasCSV = [heads.map(escapar).join(';')].concat(linhas.map(l => l.map(escapar).join(';')));
    return '﻿' + linhasCSV.join('\r\n');
}
