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

// datas: dia de cada modalidade, com observação opcional (horário, categoria)
const MODALIDADES = [
  { id: 'volei-areia', coletiva: true, nome: 'Vôlei de Areia', ativa: false, duracao: 45, intervalo: 0, regras: { setsParaVencer: 2, pontosSet: 21, pontosDesempate: 15 }, datas: [{ data: '2026-11-14', obs: '' }] },
  { id: 'fifa', coletiva: false, nome: 'FIFA', ativa: false, duracao: 20, intervalo: 0, datas: [{ data: '2026-11-15', obs: '09h às 15h' }] },
  { id: 'volei', coletiva: true, nome: 'Vôlei', ativa: true, duracao: 60, intervalo: 0, regras: { setsParaVencer: 2, pontosSet: 25, pontosDesempate: 15 }, datas: [{ data: '2026-11-21', obs: '' }] },
  { id: 'tenis-mesa', coletiva: false, nome: 'Tênis de Mesa', ativa: false, duracao: 30, intervalo: 0, datas: [{ data: '2026-11-26', obs: '' }] },
  { id: 'xadrez', coletiva: false, nome: 'Xadrez', ativa: false, duracao: 40, intervalo: 0, datas: [{ data: '2026-11-26', obs: '' }] },
  { id: 'futsal', coletiva: true, nome: 'Futsal', ativa: false, duracao: 50, intervalo: 0, datas: [{ data: '2026-11-28', obs: 'Masculino' }, { data: '2026-12-05', obs: '' }] },
  { id: 'free-fire', coletiva: true, nome: 'Free Fire', ativa: false, duracao: 30, intervalo: 0, datas: [{ data: '2026-11-29', obs: '09h às 15h' }] },
  { id: 'queimada', coletiva: true, nome: 'Queimada', ativa: false, duracao: 30, intervalo: 0, datas: [{ data: '2026-12-05', obs: '' }] },
];
// modalidades que existiam na primeira versão e não fazem parte do calendário oficial
const REMOVIDAS = ['basquete', 'handebol'];

function estadoInicial() {
  return {
    versao: 1,
    evento: { nome: 'V Jogos do ITEC', periodo: '14/11 a 05/12/2026', local: 'UFPA · Belém-PA' },
    equipes: EQUIPES.map(([id, sigla]) => ({ id, sigla, logo: `/img/ca/${id}.png` })),
    // pontos que já existiam antes dos resultados serem lançados no site (print da organização)
    ajuste: Object.fromEntries(EQUIPES.map(([id, , pts]) => [id, pts])),
    pontuacao: { colocacao: [10, 7, 5, 4], multiplicadorColetiva: 2 },
    resultados: [],
    modalidades: MODALIDADES,
    jogos: [],
    calendarioV: 1,
    pontuacaoV: 1,
  };
}

// Atualiza um estado já gravado no banco sem perder jogos, pontos nem ajustes feitos pelo admin.
function migrar(estado) {
  let mudou = false;
  if (!estado.calendarioV) {
    const comJogos = new Set(estado.jogos.map(j => j.modalidade));
    estado.modalidades = estado.modalidades.filter(m => !REMOVIDAS.includes(m.id) || comJogos.has(m.id));
    for (const padrao of MODALIDADES) {
      const m = estado.modalidades.find(x => x.id === padrao.id);
      if (!m) estado.modalidades.push(JSON.parse(JSON.stringify(padrao)));
      else m.datas = padrao.datas;
    }
    const ordem = id => { const i = MODALIDADES.findIndex(m => m.id === id); return i < 0 ? 99 : i; };
    estado.modalidades.sort((a, b) => ordem(a.id) - ordem(b.id));
    estado.calendarioV = 1;
    mudou = true;
  }
  if (!estado.pontuacaoV) {
    estado.ajuste = estado.geral || {};
    delete estado.geral;
    estado.pontuacao = { colocacao: [10, 7, 5, 4], multiplicadorColetiva: 2 };
    estado.resultados = estado.resultados || [];
    for (const m of estado.modalidades) {
      const padrao = MODALIDADES.find(x => x.id === m.id);
      if (m.coletiva === undefined) m.coletiva = padrao ? padrao.coletiva : false;
    }
    estado.pontuacaoV = 1;
    mudou = true;
  }
  return mudou;
}

module.exports = { estadoInicial, migrar };
