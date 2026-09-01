// Alternância de tema claro/escuro, com preferência salva no navegador (padrão: escuro).
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-tema');
    if (!btn) return;

    function estaEscuro() {
        return document.documentElement.getAttribute('data-tema') === 'escuro';
    }

    function atualizarBotao() {
        const escuro = estaEscuro();
        btn.textContent = escuro ? '☀️' : '🌙';
        btn.title = escuro ? 'Mudar para tema claro' : 'Mudar para tema escuro';
    }

    btn.addEventListener('click', () => {
        if (estaEscuro()) {
            document.documentElement.removeAttribute('data-tema');
            localStorage.setItem('agente-tema', 'claro');
        } else {
            document.documentElement.setAttribute('data-tema', 'escuro');
            localStorage.setItem('agente-tema', 'escuro');
        }
        atualizarBotao();
        document.dispatchEvent(new CustomEvent('tema-alterado'));
    });

    atualizarBotao();
});
