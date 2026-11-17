// Estado com que o site nasce: equipes, modalidades e a classificação geral publicada pela organização.
const EQUIPES = [
  ['caecomp', 'CAECOMP', 19],
  ['caefel', 'CAEFEL', 19],
  ['caeeb', 'CAEEB', 17],
  ['caec', 'CAEC', 15],
  ['caau', 'CAAU', 14],
  ['caesa', 'CAESA', 11],
  ['caeq', 'CAEQ', 5],
  ['caebp', 'CAEBP', 4],
  ['daetel', 'DAETEL', 0],
  ['came', 'CAME', 0],
  ['caenav', 'CAENAV', 0],
  ['caena', 'CAENA', 0],
];

const MODALIDADES = [
  { id: 'volei', nome: 'Vôlei', ativa: true, duracao: 60, intervalo: 0, regras: { setsParaVencer: 2, pontosSet: 25, pontosDesempate: 15 } },
  { id: 'volei-areia', nome: 'Vôlei de Areia', ativa: false, duracao: 45, intervalo: 0, regras: { setsParaVencer: 2, pontosSet: 21, pontosDesempate: 15 } },
  { id: 'futsal', nome: 'Futsal', ativa: false, duracao: 50, intervalo: 0 },
  { id: 'basquete', nome: 'Basquete', ativa: false, duracao: 50, intervalo: 0 },
  { id: 'handebol', nome: 'Handebol', ativa: false, duracao: 50, intervalo: 0 },
  { id: 'tenis-mesa', nome: 'Tênis de Mesa', ativa: false, duracao: 30, intervalo: 0 },
  { id: 'xadrez', nome: 'Xadrez', ativa: false, duracao: 40, intervalo: 0 },
  { id: 'fifa', nome: 'FIFA', ativa: false, duracao: 20, intervalo: 0 },
];

function estadoInicial() {
  return {
    versao: 1,
    evento: { nome: 'V Jogos do ITEC', periodo: '14/11 a 05/12/2026', local: 'UFPA · Belém-PA' },
    equipes: EQUIPES.map(([id, sigla]) => ({ id, sigla, logo: `/img/ca/${id}.png` })),
    geral: Object.fromEntries(EQUIPES.map(([id, , pts]) => [id, pts])),
    modalidades: MODALIDADES,
    jogos: [],
  };
}

module.exports = { estadoInicial };
