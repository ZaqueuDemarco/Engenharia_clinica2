// Agente Virtual de Gestão — assistente local (sem API) para organizar dados colados
// em planilhas editáveis e gerar relatórios/resumos automáticos.

const DADOS_EXEMPLO =
`Equipamento;Fabricante;Setor;Status;Última Manutenção;Próxima Manutenção
Monitor Prolife C12;Prolife;UTI;Ativo;10/03/2026;10/09/2026
Ventilador Oxymag;Magnamed;UTI;Ativo;01/02/2026;01/08/2026
Bomba de Infusão Ícatu;Samtronic;Centro Cirúrgico;Manutenção;15/01/2026;15/07/2026
Cardioversor DFM100;Philips;Emergência;Ativo;20/12/2025;20/06/2026
Monitor Vita 600;Alfamed;Enfermaria;Inativo;05/11/2025;05/05/2026`;

let cabecalhos = [];

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

function parseTexto(texto) {
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

    const temCabecalho = document.getElementById('tem-cabecalho').checked;
    let heads, dados;

    if (temCabecalho) {
        heads = matriz[0];
        dados = matriz.slice(1);
    } else {
        heads = Array.from({ length: maxColunas }, (_, i) => `Coluna ${i + 1}`);
        dados = matriz;
    }

    heads = heads.map((h, i) => h && h.trim() !== '' ? h.trim() : `Coluna ${i + 1}`);

    return { cabecalhos: heads, linhas: dados };
}

function renderizarTabela(cabecalhosNovos, linhas) {
    cabecalhos = cabecalhosNovos.slice();
    const tabela = document.getElementById('tabela-dados');
    tabela.innerHTML = '';

    const thead = document.createElement('thead');
    thead.appendChild(construirLinhaCabecalho());
    tabela.appendChild(thead);

    const tbody = document.createElement('tbody');
    linhas.forEach(linha => tbody.appendChild(construirLinhaDados(linha)));
    tabela.appendChild(tbody);

    document.getElementById('painel-planilha').hidden = false;
    atualizarSelectOrdenar();
}

function construirLinhaCabecalho() {
    const tr = document.createElement('tr');
    cabecalhos.forEach((h, idx) => {
        const th = document.createElement('th');
        th.contentEditable = 'true';
        th.textContent = h;
        th.dataset.col = idx;
        th.addEventListener('input', () => {
            cabecalhos[idx] = th.textContent.trim() || `Coluna ${idx + 1}`;
            atualizarSelectOrdenar();
        });
        tr.appendChild(th);
    });
    const thAcoes = document.createElement('th');
    thAcoes.className = 'col-acoes';
    thAcoes.textContent = '';
    tr.appendChild(thAcoes);
    return tr;
}

function construirLinhaDados(valores) {
    const tr = document.createElement('tr');
    cabecalhos.forEach((_, idx) => {
        const td = document.createElement('td');
        td.contentEditable = 'true';
        td.textContent = valores[idx] || '';
        tr.appendChild(td);
    });
    const tdAcoes = document.createElement('td');
    tdAcoes.className = 'col-acoes';
    const btn = document.createElement('button');
    btn.className = 'btn-remover';
    btn.textContent = '✕';
    btn.title = 'Remover linha';
    btn.addEventListener('click', () => tr.remove());
    tdAcoes.appendChild(btn);
    tr.appendChild(tdAcoes);
    return tr;
}

function lerTabelaAtual() {
    const tabela = document.getElementById('tabela-dados');
    const ths = Array.from(tabela.querySelectorAll('thead th')).slice(0, -1);
    const heads = ths.map(th => th.textContent.trim());
    const linhas = Array.from(tabela.querySelectorAll('tbody tr')).map(tr => {
        return Array.from(tr.querySelectorAll('td')).slice(0, -1).map(td => td.textContent.trim());
    });
    return { cabecalhos: heads, linhas };
}

function atualizarSelectOrdenar() {
    const select = document.getElementById('select-ordenar');
    const atual = select.value;
    select.innerHTML = '';
    cabecalhos.forEach((h, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = h;
        select.appendChild(opt);
    });
    if (atual !== '' && Number(atual) < cabecalhos.length) select.value = atual;
}

function ordenarTabela(direcao) {
    const idx = Number(document.getElementById('select-ordenar').value);
    const tbody = document.querySelector('#tabela-dados tbody');
    const linhas = Array.from(tbody.querySelectorAll('tr'));

    linhas.sort((a, b) => {
        const va = a.querySelectorAll('td')[idx].textContent.trim();
        const vb = b.querySelectorAll('td')[idx].textContent.trim();

        const na = parseFloat(va.replace(',', '.'));
        const nb = parseFloat(vb.replace(',', '.'));
        let cmp;
        if (!isNaN(na) && !isNaN(nb) && va !== '' && vb !== '') {
            cmp = na - nb;
        } else {
            const da = parseData(va), db = parseData(vb);
            if (da && db) cmp = da - db;
            else cmp = va.localeCompare(vb, 'pt-BR', { sensitivity: 'base' });
        }
        return direcao === 'asc' ? cmp : -cmp;
    });

    linhas.forEach(l => tbody.appendChild(l));
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

function adicionarLinha() {
    const tbody = document.querySelector('#tabela-dados tbody');
    tbody.appendChild(construirLinhaDados(cabecalhos.map(() => '')));
}

function adicionarColuna() {
    const nomeColuna = `Coluna ${cabecalhos.length + 1}`;
    cabecalhos.push(nomeColuna);

    const linhaCabecalho = document.querySelector('#tabela-dados thead tr');
    const thAcoes = linhaCabecalho.lastElementChild;
    const th = document.createElement('th');
    const idx = cabecalhos.length - 1;
    th.contentEditable = 'true';
    th.textContent = nomeColuna;
    th.addEventListener('input', () => {
        cabecalhos[idx] = th.textContent.trim() || `Coluna ${idx + 1}`;
        atualizarSelectOrdenar();
    });
    linhaCabecalho.insertBefore(th, thAcoes);

    document.querySelectorAll('#tabela-dados tbody tr').forEach(tr => {
        const tdAcoes = tr.lastElementChild;
        const td = document.createElement('td');
        td.contentEditable = 'true';
        td.textContent = '';
        tr.insertBefore(td, tdAcoes);
    });

    atualizarSelectOrdenar();
}

function restaurarCabecalhoComoLinha() {
    const tabela = document.getElementById('tabela-dados');
    const theadRow = tabela.querySelector('thead tr');
    const tbody = tabela.querySelector('tbody');
    if (!theadRow || !tbody) return;

    const valoresCabecalho = cabecalhos.slice();
    cabecalhos = cabecalhos.map((_, idx) => `Coluna ${idx + 1}`);

    const ths = theadRow.querySelectorAll('th[contenteditable="true"]');
    ths.forEach((th, idx) => { th.textContent = cabecalhos[idx]; });

    const novaLinha = construirLinhaDados(valoresCabecalho);
    tbody.insertBefore(novaLinha, tbody.firstChild);

    atualizarSelectOrdenar();
}

function filtrarTabela(termo) {
    const filtro = termo.toLowerCase();
    document.querySelectorAll('#tabela-dados tbody tr').forEach(tr => {
        const texto = tr.textContent.toLowerCase();
        tr.style.display = texto.includes(filtro) ? '' : 'none';
    });
}

// ---------- Relatório ----------

const PALAVRAS_DATA_ALERTA = /valid|vencim|calibra|manuten|revis|troca|expira/i;
const PALAVRAS_DATA_PASSADA = /última|ultima|anterior|passad|realizad/i;

function gerarRelatorio() {
    const { cabecalhos: heads, linhas } = lerTabelaAtual();
    const totalLinhas = linhas.length;
    const totalColunas = heads.length;

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

    const html = [];

    html.push(`
        <div class="cards-resumo">
            <div class="card"><div class="valor">${totalLinhas}</div><div class="rotulo">Registros</div></div>
            <div class="card"><div class="valor">${totalColunas}</div><div class="rotulo">Colunas</div></div>
            <div class="card"><div class="valor">${totalVazios}</div><div class="rotulo">Campos vazios</div></div>
        </div>
    `);

    // Alertas de datas (validade / manutenção / calibração)
    const colunasAlerta = analiseColunas.filter(c => c.ehData && PALAVRAS_DATA_ALERTA.test(c.nome) && !PALAVRAS_DATA_PASSADA.test(c.nome));
    if (colunasAlerta.length > 0) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        let blocoAlertas = '<div class="bloco-relatorio"><h3>⏰ Prazos e vencimentos</h3>';
        let algumAlerta = false;

        colunasAlerta.forEach(col => {
            linhas.forEach((linha, linhaIdx) => {
                const valorBruto = linha[col.idx];
                const data = parseData(valorBruto);
                if (!data) return;
                const diffDias = Math.round((data - hoje) / 86400000);
                const identificador = linha[0] || `Linha ${linhaIdx + 2}`;

                let classe, texto;
                if (diffDias < 0) {
                    classe = 'vencido';
                    texto = `<strong>${identificador}</strong> — "${col.nome}" venceu há ${Math.abs(diffDias)} dia(s) (${valorBruto})`;
                } else if (diffDias <= 30) {
                    classe = 'atencao';
                    texto = `<strong>${identificador}</strong> — "${col.nome}" vence em ${diffDias} dia(s) (${valorBruto})`;
                } else {
                    return;
                }
                algumAlerta = true;
                blocoAlertas += `<div class="alerta ${classe}">${texto}</div>`;
            });
        });

        if (!algumAlerta) {
            blocoAlertas += `<div class="alerta ok">Nenhum prazo vencido ou próximo do vencimento (30 dias) nas colunas de data analisadas.</div>`;
        }
        blocoAlertas += '</div>';
        html.push(blocoAlertas);
    }

    // Distribuição de colunas categóricas (ex: status, fabricante, setor)
    const colunasCategoricas = analiseColunas.filter(c => c.ehCategorico);
    const dadosGraficos = [];
    colunasCategoricas.forEach(col => {
        const contagem = {};
        col.valores.forEach(v => {
            const chave = v.trim() === '' ? '(vazio)' : v.trim();
            contagem[chave] = (contagem[chave] || 0) + 1;
        });
        const entradas = Object.entries(contagem).sort((a, b) => b[1] - a[1]);
        dadosGraficos.push({ idx: col.idx, nome: col.nome, entradas });

        let bloco = `
            <div class="bloco-relatorio bloco-grafico">
                <div class="cabecalho-grafico">
                    <h3>Distribuição por "${col.nome}"</h3>
                    <div class="controles-grafico">
                        <select class="tipo-grafico" data-col="${col.idx}">
                            <option value="bar">Barras</option>
                            <option value="pie">Pizza</option>
                        </select>
                        <button class="btn-baixar-grafico" data-col="${col.idx}" type="button">⬇️ PNG</button>
                    </div>
                </div>
                <div class="canvas-wrap"><canvas id="grafico-${col.idx}"></canvas></div>
            </div>`;
        html.push(bloco);
    });

    // Qualidade dos dados (campos vazios por coluna)
    const colunasComVazios = analiseColunas.filter(c => c.vazios > 0);
    if (colunasComVazios.length > 0) {
        let bloco = '<div class="bloco-relatorio"><h3>🧹 Qualidade dos dados</h3>';
        colunasComVazios.forEach(col => {
            bloco += `<div class="alerta atencao">A coluna "<strong>${col.nome}</strong>" tem ${col.vazios} campo(s) vazio(s) de ${totalLinhas}.</div>`;
        });
        bloco += '</div>';
        html.push(bloco);
    }

    document.getElementById('conteudo-relatorio').innerHTML = html.join('');
    document.getElementById('painel-relatorio').hidden = false;
    document.getElementById('painel-relatorio').scrollIntoView({ behavior: 'smooth' });

    renderizarGraficos(dadosGraficos);
}

// ---------- Gráficos ----------

const PALETA_GRAFICO = ['#0066cc', '#2e9e5b', '#e0a800', '#cc3333', '#7a3fbf', '#00a3a3', '#c2559b', '#5b6b7a'];
let graficosPorColuna = new Map();

function construirConfigGrafico(tipo, nome, entradas) {
    const labels = entradas.map(e => e[0]);
    const valores = entradas.map(e => e[1]);
    const cores = labels.map((_, i) => PALETA_GRAFICO[i % PALETA_GRAFICO.length]);

    if (tipo === 'pie') {
        return {
            type: 'pie',
            data: { labels, datasets: [{ data: valores, backgroundColor: cores }] },
            options: { responsive: true, plugins: { legend: { position: 'right' } } }
        };
    }
    return {
        type: 'bar',
        data: { labels, datasets: [{ label: nome, data: valores, backgroundColor: '#0066cc' }] },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    };
}

function renderizarGraficos(dadosGraficos) {
    graficosPorColuna.forEach(info => info.chart.destroy());
    graficosPorColuna = new Map();

    if (typeof Chart === 'undefined') return;

    dadosGraficos.forEach(({ idx, nome, entradas }) => {
        const canvas = document.getElementById(`grafico-${idx}`);
        if (!canvas) return;
        const chart = new Chart(canvas, construirConfigGrafico('bar', nome, entradas));
        graficosPorColuna.set(idx, { chart, nome, entradas });
    });
}

document.getElementById('conteudo-relatorio').addEventListener('change', e => {
    const select = e.target.closest('.tipo-grafico');
    if (!select) return;
    const idx = Number(select.dataset.col);
    const info = graficosPorColuna.get(idx);
    if (!info) return;
    info.chart.destroy();
    const canvas = document.getElementById(`grafico-${idx}`);
    info.chart = new Chart(canvas, construirConfigGrafico(select.value, info.nome, info.entradas));
});

document.getElementById('conteudo-relatorio').addEventListener('click', e => {
    const btn = e.target.closest('.btn-baixar-grafico');
    if (!btn) return;
    const idx = Number(btn.dataset.col);
    const canvas = document.getElementById(`grafico-${idx}`);
    const info = graficosPorColuna.get(idx);
    if (!canvas || !info) return;

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `grafico-${info.nome.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
});

// ---------- Exportação ----------

function exportarCSV() {
    const { cabecalhos: heads, linhas } = lerTabelaAtual();
    const escapar = v => `"${String(v).replace(/"/g, '""')}"`;
    const linhasCSV = [heads.map(escapar).join(';')]
        .concat(linhas.map(l => l.map(escapar).join(';')));
    const csv = '﻿' + linhasCSV.join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    baixarBlob(blob, 'planilha-agente.csv');
}

function exportarXLSX() {
    if (typeof XLSX === 'undefined') {
        alert('Não foi possível carregar o módulo de exportação para Excel. Use a exportação em CSV.');
        return;
    }
    const { cabecalhos: heads, linhas } = lerTabelaAtual();
    const dados = [heads, ...linhas];
    const planilha = XLSX.utils.aoa_to_sheet(dados);
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, 'Dados');
    XLSX.writeFile(livro, 'planilha-agente.xlsx');
}

function baixarBlob(blob, nomeArquivo) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// ---------- Eventos ----------

document.getElementById('btn-processar').addEventListener('click', () => {
    const texto = document.getElementById('entrada-dados').value;
    if (!texto.trim()) {
        alert('Cole algum dado na caixa de texto antes de processar.');
        return;
    }
    const { cabecalhos: heads, linhas } = parseTexto(texto);
    renderizarTabela(heads, linhas);
    document.getElementById('painel-relatorio').hidden = true;
    document.getElementById('painel-planilha').scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('btn-exemplo').addEventListener('click', () => {
    document.getElementById('entrada-dados').value = DADOS_EXEMPLO;
});

document.getElementById('btn-limpar').addEventListener('click', () => {
    document.getElementById('entrada-dados').value = '';
    document.getElementById('painel-planilha').hidden = true;
    document.getElementById('painel-relatorio').hidden = true;
});

document.getElementById('btn-add-linha').addEventListener('click', adicionarLinha);
document.getElementById('btn-add-coluna').addEventListener('click', adicionarColuna);
document.getElementById('btn-restaurar-cabecalho').addEventListener('click', restaurarCabecalhoComoLinha);
document.getElementById('btn-ordenar-asc').addEventListener('click', () => ordenarTabela('asc'));
document.getElementById('btn-ordenar-desc').addEventListener('click', () => ordenarTabela('desc'));
document.getElementById('pesquisa-tabela').addEventListener('keyup', e => filtrarTabela(e.target.value));

document.getElementById('btn-relatorio').addEventListener('click', gerarRelatorio);
document.getElementById('btn-csv').addEventListener('click', exportarCSV);
document.getElementById('btn-xlsx').addEventListener('click', exportarXLSX);
document.getElementById('btn-imprimir').addEventListener('click', () => window.print());
