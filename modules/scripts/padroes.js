// padroes.js
// Scripts e pastas que já vêm com a extensão. Cada usuário pode editar um script padrão
// (vira "modificado" e pode voltar ao original) ou ocultá-lo; os ajustes ficam guardados à
// parte (ver dados.js), então uma versão nova da extensão pode trazer textos novos aqui
// sem apagar o que a pessoa mudou.
//
// Regras para manter este arquivo:
// - O `id` de um script padrão nunca muda (é a ligação com os ajustes do usuário).
// - Nada de dados de cliente nos textos: o que for do atendimento entra por variável.

export const PASTAS_PADRAO = [
  { id: "chamado", nome: "Chamado" },
  { id: "os", nome: "Ordem de Serviço" },
  { id: "finalizacao", nome: "Finalização" },
  { id: "processos", nome: "Processos" }
];

export const SCRIPTS_PADRAO = [
  {
    id: "padrao-bd",
    atalho: "bd",
    titulo: "Saudação inicial",
    pastaId: "chamado",
    texto: "{saudacao}! Meu nome é {agente}, do suporte técnico. Como posso ajudar?"
  },
  {
    id: "padrao-aguarde",
    atalho: "aguarde",
    titulo: "Pedir um momento",
    pastaId: "chamado",
    texto: "Só um momento, por favor, enquanto verifico as informações."
  },
  {
    id: "padrao-protocolo",
    atalho: "protocolo",
    titulo: "Informar o protocolo",
    pastaId: "chamado",
    texto: "O número do seu protocolo é {numero}, registrado em {data} às {hora}."
  },
  {
    id: "padrao-os",
    atalho: "os",
    titulo: "Agendamento de visita",
    pastaId: "os",
    texto:
      "Agendamos a visita técnica para {campo:Data da visita}, no período da {opcao:Período=manhã|tarde}. " +
      "É necessário ter um responsável maior de idade no local."
  },
  {
    id: "padrao-fim",
    atalho: "fim",
    titulo: "Encerramento do atendimento",
    pastaId: "finalizacao",
    texto: "Posso ajudar em algo mais? Agradeço o contato e tenha {opcao:um ótimo dia|uma ótima tarde|uma ótima noite}!"
  },
  {
    id: "padrao-sem-retorno",
    atalho: "semretorno",
    titulo: "Encerramento por falta de retorno",
    pastaId: "finalizacao",
    texto:
      "Como não tivemos retorno, este atendimento será encerrado. Se precisar, é só entrar em contato novamente " +
      "informando o protocolo {numero}."
  },
  {
    id: "padrao-n2",
    atalho: "n2",
    titulo: "Encaminhamento para o N2",
    pastaId: "processos",
    texto:
      "Seu atendimento foi encaminhado para a equipe técnica especializada, que vai analisar o caso. " +
      "O prazo de retorno é de até {campo:Prazo de retorno}."
  }
];
