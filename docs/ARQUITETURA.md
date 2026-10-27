# Gamma — Arquitetura e Roadmap

> Documento vivo. Registra as decisões tomadas até agora e o caminho planejado.
> Última revisão: 26/10/2026.

## 1. Visão

O Gamma é um **HUB de aplicações para o trabalho do dia a dia**: automatiza processos repetitivos e concentra informações importantes num lugar só.

Funciona sempre com duas partes que trabalham juntas:

- **HUB (página):** informações e serviços mais complexos, como configuração, métricas e editores.
- **Extensão:** ajuda nas tarefas enquanto elas acontecem, com popup, painel lateral, notificações e automações dentro das páginas.

O primeiro módulo é o **Backlog**: controle de chamados e geração do relatório diário.

### Objetivo e público

- **Agora:** ferramenta pessoal, **100% offline**, instalada localmente. É usada e evoluída no dia a dia até ficar redonda.
- **Depois:** versão online para o time (~25 colaboradores), com login e dados compartilhados.
- **Talvez:** se der muito certo, virar SaaS. Não é objetivo atual e não guia decisões agora.

### Premissas

- **Custo zero.** O projeto é bancado pelo autor, então nada que exija pagamento recorrente nas fases atuais.
- **Complementar, não substituir.** A empresa já tem um Power BI com a visão gerencial (chamados em aberto, atrasados). O Gamma cobre o que ele não vê: o trabalho do agente (backlog pessoal, lembretes, relatório do turno, visão por colaborador).
- **Dados mínimos.** Guardar só o necessário (nº do chamado, categoria, status, datas). Nada que identifique o cliente final (nome, CPF, endereço, telefone), por causa da LGPD.

## 2. Decisões de arquitetura

### 2.1 Uma única extensão, com módulos

O Gamma é **uma extensão só**, e os módulos ficam dentro dela. Não são várias extensões interligadas.

Motivos:
- Cada extensão do Chrome tem armazenamento isolado. Com várias extensões, um módulo não enxergaria os dados do outro (ex.: o módulo de Scripts precisa ler o Backlog).
- Uma instalação, um backup e um conjunto de permissões.

### 2.2 Superfícies da extensão

```
                  ┌──────────────────────────────┐
                  │ NÚCLEO (core)                │
                  │ storage · tema · backup ·    │
                  │ registro de módulos          │
                  └──────────────┬───────────────┘
     ┌──────────────┬────────────┼──────────────┬──────────────────┐
  POPUP          HUB          PAINEL LATERAL   BACKGROUND        CONTENT SCRIPTS
  ações rápidas  página       (opcional)       lembretes,        dentro dos sites:
                 completa                      notificações,     expansor de texto,
                                               badge             futuras "tags"
```

| Superfície | Papel | Observações |
|---|---|---|
| **Popup** | Ações de segundos: cadastrar, buscar, atualizar, copiar | Pequeno (~800×600 no máximo) e fecha ao perder o foco. Cada módulo pode ter uma aba |
| **HUB** | Tudo o que é mais pesado: telas completas dos módulos, configurações, métricas, backup | **Uma página só** (evolução do `dashboard.html`), com menu lateral e troca de tela sem recarregar |
| **Painel lateral** | Fica aberto ao lado do sistema de chamados durante o atendimento | `chrome.sidePanel`. Opcional, previsto para a Fase 4 |
| **Background** | Roda sem tela aberta: lembretes, notificações, contador no ícone | Service worker do MV3, com `chrome.alarms` e `chrome.notifications` |
| **Content scripts** | Rodam dentro dos sites: expansor de texto e leitura de tags | Acesso a sites pedido via `optional_permissions`, só quando o módulo é ativado |

### 2.3 Núcleo e módulos

O **núcleo** oferece o que todos os módulos usam: acesso ao armazenamento, tema, backup geral e o registro de módulos.

Cada **módulo** é uma pasta autocontida e se apresenta ao núcleo com um contrato simples:

```js
export default {
  id: "scripts",
  nome: "Scripts",
  icone: "<svg ...>",                    // ícone do menu lateral (SVG inline)
  hub: () => import("./hub-view.js"),     // tela no HUB
  popup: () => import("./popup-view.js"), // aba no popup (opcional)
  backup: { padroes: { snippets: [] } }   // chaves que entram no backup geral (com o valor padrão)
};
```

Criar um módulo novo = criar a pasta e registrá-lo. O HUB, o popup e o backup se ajustam sozinhos.

**Regra:** um módulo pode **ler** dados de outro pelas funções públicas do storage dele, mas nunca altera o armazenamento do outro diretamente.

### 2.4 Estrutura de pastas planejada

```
gamma/
  manifest.json
  icons/
  core/               storage base, tema, backup geral, registro de módulos, UI comum
  background/         service-worker.js
  hub/                hub.html + roteador do menu
  popup/              popup.html (monta as abas dos módulos ativos)
  sidepanel/          (Fase 4)
  modules/
    backlog/          module.js, storage.js, hub-view.js, popup-view.js, report.js
    scripts/          module.js, storage.js, hub-view.js, popup-view.js, content.js
  docs/
```

### 2.5 Dados

- **Armazenamento:** `chrome.storage.local`. Todo acesso passa pela camada de storage (hoje `js/storage.js`), e a UI nunca chama `chrome.storage` diretamente. É isso que permite trocar por um backend no futuro mudando só essa camada.
- **Chave do chamado:** o **nº do chamado** é a chave única. Ele já é único no sistema da empresa, então não existe um id interno separado.
- **Histórico:** toda mudança de status ou etapa entra em `historico`. É a base das métricas futuras.
- **Datas:** `createdAt` e `updatedAt` em ISO 8601. Também ajudam na sincronização futura.
- **Migrações:** dados antigos (inclusive de backups importados) são convertidos na leitura. Conforme os módulos crescerem, avaliar um `schemaVersion` com migrações numeradas.
- **Espaço:** o `chrome.storage.local` tem limite de 10 MB sem a permissão `unlimitedStorage`. No volume atual, isso leva cerca de um ano para encher. Não é urgente, mas fica anotado.
- **Backup:** exportação e importação em `.json`. Na arquitetura modular, o backup geral junta as chaves declaradas por todos os módulos.

### 2.6 Tecnologia

- **JavaScript puro**, HTML e CSS, como hoje. Usar módulos ES (`import`/`export`), que o MV3 suporta nas páginas e no service worker.
- **Sem bundler por enquanto.** Avaliar Vite (ou similar) quando o número de módulos justificar.
- **Distribuição:** instalação local no modo desenvolvedor (custo zero). Publicar como "não listada" na Chrome Web Store, com taxa única de US$ 5, é opcional e fica para quando outras pessoas forem usar.

## 3. Módulos

### 3.1 Backlog (existente)

Cadastro e acompanhamento de chamados, chamados do dia, filas do turno, relatório diário, dashboard e backup.
Tem regras próprias, como a Portabilidade (status derivado da etapa) e a Suspensão (categorias restritas).

### 3.2 Scripts (planejado)

Expansor de texto: digitar um atalho (ex.: `/os`) num campo de texto gera o texto completo.

- **Presets padrão** já vêm com a extensão, e cada usuário pode criar os **seus próprios**.
- **Variáveis e campos:** `{data_hoje}`, campos de escolha, etc.
- **Integração com o Backlog**, que é o diferencial: preencher nº, categoria, datas de novo contato e janela de OS a partir do chamado.
- **Compartilhamento sem servidor:** pacotes de scripts exportados e importados em `.json`.
- **Plano B:** editores ricos e páginas em `iframe` são mais difíceis de automatizar. Nesses casos, o script é escolhido no popup ou no painel lateral e copiado com um clique.
- Nome e interface próprios, sem copiar produtos existentes.

### 3.3 Ideias para depois

- Lembretes de retorno e de janela de OS (Fase 2).
- Métricas pessoais (Fase 3).
- Mural de avisos e incidentes conhecidos.
- Calculadoras do dia a dia (prazos ANATEL e de portabilidade, desconto proporcional).
- Adaptador de **tags** para o sistema de chamados (Fase 5).

## 4. Roadmap

| Fase | Entregas | Pronto quando... |
|---|---|---|
| **0. Reorganizar** | Criar `core/` e `modules/backlog/`. Transformar o dashboard no HUB com menu de módulos. Backup geral | Tudo funciona **exatamente como hoje**, só que organizado em núcleo e módulos |
| **1. Scripts** | Editor de scripts no HUB, expansor por atalho (content script), variáveis e campos, dados do Backlog, pacotes `.json` | O TextBlaze deixa de ser necessário no trabalho |
| **2. Background** | Service worker com lembretes de novo contato e janela de OS, notificações, contador de pendências no ícone | O Gamma avisa sem precisar abrir nada |
| **3. Métricas pessoais** | Aba de métricas no HUB: tempo até finalizar, volume por categoria e canal, chamados parados | Dados do `historico` viram indicadores |
| **4. Painel lateral e novos módulos** | Side panel com Backlog e Scripts. Novos módulos conforme a necessidade | Uso sentido no dia a dia |
| **5. Tags** | Adaptador para a página do sistema de chamados (abertura, atualização, encerramento) | Depende de ter acesso à página e de aval da empresa |
| **6. Online** | Backend, login, sincronização, piloto com 2 ou 3 colegas e depois o time | Fases anteriores redondas |

### Fase 5: adaptador de tags

Automação baseada em IDs e classes do HTML quebra quando o sistema muda o layout. Por isso:
- Os seletores ficam isolados num arquivo de configuração do adaptador, e não espalhados pelo código.
- O adaptador expõe uma interface fixa (ex.: `lerChamadoDaPagina()`, `detectarEvento()`), e o resto do Gamma só fala com ela.
- **Antes de implementar:** confirmar com a gestão ou a TI que a automação sobre o sistema interno é permitida.

### Fase 6: plano para a versão online

- **Backend sugerido:** Supabase, com autenticação, Postgres, realtime e permissões por linha (RLS).
- **Estimativa de volume:** 25 pessoas × ~22 chamados por dia × 22 dias ≈ 12 mil chamados por mês, ou cerca de 30 a 60 MB por mês com o histórico.
- **Custo:** o plano gratuito (500 MB, na referência mais recente; conferir os preços atuais) aguenta de 8 a 12 meses. Arquivando chamados finalizados antigos, o uso se estabiliza e **continua gratuito**.
- **Cuidados do plano gratuito:** não tem backup automático (resolver com backup diário agendado, ex.: GitHub Actions) e o projeto pausa após cerca de 1 semana sem uso.
- **Alternativas** se o custo virar problema: PocketBase ou Appwrite num VPS próprio.
- **Modelo de dados:** organização → equipes → usuários com papéis (agente, supervisor, admin).
- **Em aberto:** o que fazer quando duas pessoas registram o mesmo nº de chamado (decidir na Fase 6).
- **Power BI:** em vez de competir, o Gamma pode exportar dados para ele (o Postgres conecta direto).

## 5. Riscos

| Risco | Mitigação |
|---|---|
| Política da empresa sobre extensões e automação no sistema interno | Validar com a gestão ou a TI antes da Fase 5 e antes de distribuir para o time |
| LGPD | Guardar só dados do chamado, nunca dados pessoais do cliente |
| Fragilidade dos seletores (tags) | Adaptador isolado com seletores configuráveis |
| Adoção pela equipe | O ganho tem que ser imediato (relatório pronto, scripts) e menor que o esforço de usar |
| Perda de dados local | Backup `.json`. Na fase online, backup diário do banco |
