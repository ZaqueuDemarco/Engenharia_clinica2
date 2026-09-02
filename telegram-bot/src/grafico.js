// Desenho de gráficos de barras/pizza direto em um buffer de pixels RGBA,
// sem canvas nem biblioteca de imagem — usado para gerar o PNG enviado ao Telegram.

import { codificarPNG } from './png.js';

export const PALETA_GRAFICO = ['#0066cc', '#2e9e5b', '#e0a800', '#cc3333', '#7a3fbf', '#00a3a3', '#c2559b', '#5b6b7a'];

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

export async function gerarGraficoBarrasPNG(valores) {
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

export async function gerarGraficoPizzaPNG(valores) {
    const largura = 360, altura = 360;
    const buffer = criarBuffer(largura, altura, [255, 255, 255]);
    const total = valores.reduce((a, b) => a + b, 0) || 1;
    const cx = largura / 2, cy = altura / 2, raio = Math.min(largura, altura) / 2 - 16;

    let anguloAtual = -Math.PI / 2;
    valores.forEach((valor, i) => {
        const fatia = (valor / total) * Math.PI * 2;
        preencherFatiaPizza(buffer, largura, altura, cx, cy, raio, anguloAtual, anguloAtual + fatia, hexParaRGB(PALETA_GRAFICO[i % PALETA_GRAFICO.length]));
        anguloAtual += fatia;
    });

    return codificarPNG(buffer, largura, altura);
}

// Legenda em texto (usada como caption da foto no Telegram, já que o PNG não tem texto desenhado).
export function construirLegenda(entradas) {
    const emojisCor = ['🟦', '🟩', '🟨', '🟥', '🟪', '🟦', '🟪', '⬛'];
    const total = entradas.reduce((a, [, qtd]) => a + qtd, 0) || 1;
    return entradas.map(([chave, qtd], i) => {
        const pct = Math.round((qtd / total) * 100);
        return `${emojisCor[i % emojisCor.length]} ${chave}: ${qtd} (${pct}%)`;
    }).join('\n');
}
