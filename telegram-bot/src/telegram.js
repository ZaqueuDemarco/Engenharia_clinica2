// Chamadas simples à Bot API do Telegram via fetch (sem SDK externo).

function apiUrl(token, metodo) {
    return `https://api.telegram.org/bot${token}/${metodo}`;
}

export async function enviarMensagem(token, chatId, texto) {
    return fetch(apiUrl(token, 'sendMessage'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: texto })
    });
}

export async function enviarDocumento(token, chatId, nomeArquivo, conteudo, mimeType, caption) {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    if (caption) form.append('caption', caption);
    form.append('document', new Blob([conteudo], { type: mimeType }), nomeArquivo);
    return fetch(apiUrl(token, 'sendDocument'), { method: 'POST', body: form });
}

export async function enviarFoto(token, chatId, nomeArquivo, bytesPNG, caption) {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    if (caption) form.append('caption', caption.slice(0, 1024));
    form.append('photo', new Blob([bytesPNG], { type: 'image/png' }), nomeArquivo);
    return fetch(apiUrl(token, 'sendPhoto'), { method: 'POST', body: form });
}
