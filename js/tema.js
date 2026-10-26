// tema.js
// Tema claro/escuro compartilhado entre popup e dashboard.
// Carregado no <head> (antes do CSS pintar) para não piscar o tema errado.
// Sem escolha salva, segue o tema do sistema. A escolha fica no localStorage,
// que é o mesmo para todas as páginas da extensão.
(function () {
  const CHAVE = "gamma-tema";
  const sistemaEscuro = window.matchMedia("(prefers-color-scheme: dark)");

  function temaSalvo() {
    try {
      return localStorage.getItem(CHAVE);
    } catch (e) {
      return null;
    }
  }

  function temaAtual() {
    const salvo = temaSalvo();
    if (salvo === "claro" || salvo === "escuro") return salvo;
    return sistemaEscuro.matches ? "escuro" : "claro";
  }

  function atualizarBotoes() {
    const escuro = document.documentElement.dataset.tema === "escuro";
    document.querySelectorAll("[data-alternar-tema]").forEach((btn) => {
      const texto = escuro ? "Usar tema claro" : "Usar tema escuro";
      btn.title = texto;
      btn.setAttribute("aria-label", texto);
    });
  }

  function aplicar() {
    document.documentElement.dataset.tema = temaAtual();
    atualizarBotoes();
  }

  function alternar() {
    const novo = temaAtual() === "escuro" ? "claro" : "escuro";
    try {
      localStorage.setItem(CHAVE, novo);
    } catch (e) {
      // sem localStorage o tema muda só nesta página
      document.documentElement.dataset.tema = novo;
      atualizarBotoes();
      return;
    }
    aplicar();
  }

  aplicar();
  sistemaEscuro.addEventListener("change", aplicar);
  // Mudou no popup com o dashboard aberto (ou o contrário): atualiza na hora.
  window.addEventListener("storage", (e) => {
    if (e.key === CHAVE) aplicar();
  });

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-alternar-tema]").forEach((btn) => btn.addEventListener("click", alternar));
    atualizarBotoes();
  });
})();
