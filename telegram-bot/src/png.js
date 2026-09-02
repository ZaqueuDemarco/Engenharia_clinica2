// Encoder PNG mínimo, sem dependências externas — usa CompressionStream('deflate')
// (disponível nativamente no runtime do Cloudflare Workers e no Node moderno)
// para gerar o bloco IDAT no formato zlib exigido pelo PNG.

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

// buffer: Uint8Array RGBA (width*height*4), sem filtro de linha aplicado ainda.
export async function codificarPNG(buffer, largura, altura) {
    const ASSINATURA = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

    const ihdrDados = concatBytes(
        u32(largura),
        u32(altura),
        new Uint8Array([8, 6, 0, 0, 0]) // bitDepth=8, colorType=6 (RGBA), demais=0
    );
    const ihdr = construirChunk('IHDR', ihdrDados);

    const bytesPorLinha = largura * 4;
    const bruto = new Uint8Array((bytesPorLinha + 1) * altura);
    for (let y = 0; y < altura; y++) {
        const origem = y * bytesPorLinha;
        const destino = y * (bytesPorLinha + 1);
        bruto[destino] = 0; // filtro "None"
        bruto.set(buffer.subarray(origem, origem + bytesPorLinha), destino + 1);
    }

    const comprimido = await deflateZlib(bruto);
    const idat = construirChunk('IDAT', comprimido);
    const iend = construirChunk('IEND', new Uint8Array(0));

    return concatBytes(ASSINATURA, ihdr, idat, iend);
}
