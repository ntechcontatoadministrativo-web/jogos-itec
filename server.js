const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Regras = require('./public/js/regras');
const { estadoInicial, migrar } = require('./dados-iniciais');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'itec2026';
const ARQUIVO_LOCAL = path.join(__dirname, 'dados.json');

// ---------- persistência: Postgres se houver DATABASE_URL, senão arquivo local ----------
let pool = null;
if (process.env.DATABASE_URL) {
  const { Pool } = require('pg');
  let url = process.env.DATABASE_URL;
  // Dentro do Render, o banco grátis só aceita o endereço interno (dpg-xxx-a, sem domínio);
  // se colarem o "External Database URL", troca pelo interno.
  const interno = process.env.RENDER && url.match(/@(dpg-[a-z0-9-]+-a)\.[a-z-]+-postgres\.render\.com/);
  if (interno) url = url.replace(/@dpg-[a-z0-9-]+-a\.[a-z-]+-postgres\.render\.com/, '@' + interno[1]);
  const semSsl = url.includes('localhost') || url.includes('127.0.0.1') || process.env.PGSSL === 'off';
  try {
    const u = new URL(url);
    console.log(`Postgres: host=${u.hostname} porta=${u.port || 5432} banco=${u.pathname.slice(1)} usuario=${u.username} ssl=${!semSsl}`);
  } catch (e) { console.log('DATABASE_URL em formato inesperado:', e.message); }
  pool = new Pool({
    connectionString: url,
    max: +(process.env.PG_POOL_MAX || 3),
    connectionTimeoutMillis: 15000,
    ssl: semSsl ? false : { rejectUnauthorized: false },
  });
}

let estado;

async function carregar() {
  if (pool) {
    await pool.query(`CREATE TABLE IF NOT EXISTS jogos_itec_estado (
      id INTEGER PRIMARY KEY, dados JSONB NOT NULL, atualizado TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const r = await pool.query('SELECT dados FROM jogos_itec_estado WHERE id = 1');
    estado = r.rows.length ? r.rows[0].dados : null;
  } else if (fs.existsSync(ARQUIVO_LOCAL)) {
    estado = JSON.parse(fs.readFileSync(ARQUIVO_LOCAL, 'utf8'));
  }
  if (!estado) {
    estado = estadoInicial();
    await gravar();
  } else if (migrar(estado)) {
    estado.versao = (estado.versao || 0) + 1;
    await gravar();
  }
}

let gravando = Promise.resolve();
function gravar() {
  const copia = JSON.stringify(estado);
  gravando = gravando.then(async () => {
    if (pool) {
      await pool.query(
        `INSERT INTO jogos_itec_estado (id, dados, atualizado) VALUES (1, $1, now())
         ON CONFLICT (id) DO UPDATE SET dados = EXCLUDED.dados, atualizado = now()`, [copia]);
    } else {
      fs.writeFileSync(ARQUIVO_LOCAL, copia);
    }
  }).catch(e => console.error('Falha ao gravar:', e.message));
  return gravando;
}

// ---------- tempo real: long-polling (o cliente espera até a versão mudar) ----------
let esperando = [];
// Mata-mata: jogo que espera o vencedor de outro recebe o time assim que o anterior termina
function resolveChaves() {
  for (let volta = 0; volta < 5; volta++) {
    let alterou = false;
    for (const j of estado.jogos) {
      for (const lado of ['a', 'b']) {
        const de = j[lado + 'De'];
        if (!de) continue;
        const src = estado.jogos.find(x => x.id === de.jogo);
        let time = null;
        if (src && src.status === 'encerrado') {
          const p = Regras.placar(src, regrasDe(src));
          if (p.vencedor) time = src[de.lado === 'perdedor' ? (p.vencedor === 'a' ? 'b' : 'a') : p.vencedor] || null;
        }
        if (j[lado] !== time) { j[lado] = time; alterou = true; }
      }
    }
    if (!alterou) break;
  }
}

function mudou() {
  resolveChaves();
  estado.versao = (estado.versao || 0) + 1;
  gravar();
  const lista = esperando;
  esperando = [];
  lista.forEach(f => f());
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/api/estado', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const v = +req.query.v;
  if (!v || v !== estado.versao) return res.json({ ...estado, logos: undefined, agora: Date.now() });
  let feito = false;
  const responder = () => {
    if (feito) return;
    feito = true;
    clearTimeout(t);
    res.json({ ...estado, logos: undefined, agora: Date.now() });
  };
  const t = setTimeout(() => {
    esperando = esperando.filter(f => f !== responder);
    if (!feito) { feito = true; res.json({ versao: estado.versao, igual: true, agora: Date.now() }); }
  }, 25000);
  esperando.push(responder);
  req.on('close', () => { esperando = esperando.filter(f => f !== responder); feito = true; clearTimeout(t); });
});

// ---------- admin ----------
function chaveOk(k) {
  const a = Buffer.from(String(k || ''));
  const b = Buffer.from(ADMIN_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function admin(req, res, next) {
  if (!chaveOk(req.get('x-admin-key'))) return res.status(401).json({ erro: 'Chave de administrador inválida.' });
  next();
}

const texto = (s, max) => String(s ?? '').trim().slice(0, max);
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;

function achaJogo(req, res) {
  const j = estado.jogos.find(x => x.id === req.params.id);
  if (!j) res.status(404).json({ erro: 'Jogo não encontrado.' });
  return j;
}
function regrasDe(j) {
  return (estado.modalidades.find(m => m.id === j.modalidade) || {}).regras;
}
// Depois de mexer nos pontos, ajusta status/fim conforme o placar
function atualizaStatus(j) {
  const p = Regras.placar(j, regrasDe(j));
  if (p.vencedor && j.status !== 'encerrado') { j.status = 'encerrado'; j.fim = Date.now(); }
  if (!p.vencedor && j.status === 'encerrado' && !j.encerradoManual) { j.status = 'ao_vivo'; j.fim = null; }
}

function camposJogo(b, j) {
  const equipes = estado.equipes.map(e => e.id);
  if (b.modalidade !== undefined) {
    if (!estado.modalidades.some(m => m.id === b.modalidade)) throw new Error('Modalidade inválida.');
    j.modalidade = b.modalidade;
  }
  // lado pode ser um CA ("caec") ou o vencedor/perdedor de outro jogo ("v:<id>" / "p:<id>")
  for (const lado of ['a', 'b']) {
    const v = b[lado];
    if (v === undefined) continue;
    const m = /^([vp]):(.+)$/.exec(v || '');
    if (m) {
      if (!estado.jogos.some(x => x.id === m[2]) || m[2] === j.id) throw new Error('Jogo de origem inválido.');
      j[lado + 'De'] = { jogo: m[2], lado: m[1] === 'p' ? 'perdedor' : 'vencedor' };
      j[lado] = null;
    } else {
      if (!equipes.includes(v)) throw new Error(`Equipe ${lado.toUpperCase()} inválida.`);
      j[lado] = v;
      delete j[lado + 'De'];
    }
  }
  if (j.a && j.a === j.b) throw new Error('Escolha duas equipes diferentes.');
  if (b.data !== undefined) { if (!DATA.test(b.data)) throw new Error('Data inválida.'); j.data = b.data; }
  if (b.hora !== undefined) { if (!HORA.test(b.hora)) throw new Error('Horário inválido.'); j.hora = b.hora; }
  if (b.categoria !== undefined) j.categoria = texto(b.categoria, 30);
  if (b.fase !== undefined) j.fase = texto(b.fase, 40);
  if (b.quadra !== undefined) j.quadra = texto(b.quadra, 40);
  if (b.duracao !== undefined) {
    const d = parseInt(b.duracao, 10);
    j.duracao = Number.isFinite(d) && d > 0 && d <= 600 ? d : null;
  }
  if (b.setsManual !== undefined) {
    j.setsManual = Array.isArray(b.setsManual) && b.setsManual.length
      ? b.setsManual.slice(0, 9).map(s => ({ a: Math.max(0, parseInt(s.a, 10) || 0), b: Math.max(0, parseInt(s.b, 10) || 0) }))
      : null;
  }
}

function rota(fn) {
  return async (req, res) => {
    try { await fn(req, res); } catch (e) { res.status(400).json({ erro: e.message }); }
  };
}

app.post('/api/admin/login', admin, (req, res) => res.json({ ok: true }));

app.post('/api/admin/jogos', admin, rota((req, res) => {
  const j = {
    id: crypto.randomBytes(5).toString('hex'), criado: Date.now(),
    modalidade: 'volei', categoria: '', fase: '', quadra: '', duracao: null,
    status: 'agendado', pontos: '', setsManual: null, wo: null, inicio: null, fim: null,
  };
  camposJogo(req.body, j);
  if (!(j.a || j.aDe) || !(j.b || j.bDe) || !j.data || !j.hora) throw new Error('Preencha equipes, data e horário.');
  estado.jogos.push(j);
  mudou();
  res.json(j);
}));

app.put('/api/admin/jogos/:id', admin, rota((req, res) => {
  const j = achaJogo(req, res); if (!j) return;
  camposJogo(req.body, j);
  if (req.body.setsManual !== undefined) {
    const p = Regras.placar(j, regrasDe(j));
    if (j.setsManual && p.vencedor) { j.status = 'encerrado'; j.fim = j.fim || Date.now(); j.inicio = j.inicio || j.fim; }
  }
  mudou();
  res.json(j);
}));

app.delete('/api/admin/jogos/:id', admin, rota((req, res) => {
  const j = achaJogo(req, res); if (!j) return;
  if (estado.jogos.some(x => (x.aDe && x.aDe.jogo === j.id) || (x.bDe && x.bDe.jogo === j.id))) {
    throw new Error('Outro jogo espera o vencedor deste. Edite ou exclua aquele jogo primeiro.');
  }
  estado.jogos = estado.jogos.filter(x => x !== j);
  mudou();
  res.json({ ok: true });
}));

app.post('/api/admin/jogos/:id/:acao', admin, rota((req, res) => {
  const j = achaJogo(req, res); if (!j) return;
  const agora = Date.now();
  switch (req.params.acao) {
    case 'ponto': {
      const lado = req.body.lado === 'b' ? 'B' : 'A';
      if (j.setsManual) throw new Error('Este jogo está com placar manual. Limpe o placar manual para marcar ponto a ponto.');
      if (j.status === 'encerrado') throw new Error('Jogo encerrado. Reabra para marcar pontos.');
      if (!j.a || !j.b) throw new Error('Os dois times ainda não estão definidos.');
      if (j.status === 'agendado') { j.status = 'ao_vivo'; j.inicio = agora; }
      j.pontos = (j.pontos || '') + lado;
      atualizaStatus(j);
      break;
    }
    case 'desfazer':
      if (!j.pontos) throw new Error('Não há pontos para desfazer.');
      j.pontos = j.pontos.slice(0, -1);
      j.encerradoManual = false;
      if (j.status === 'encerrado') { j.status = 'ao_vivo'; j.fim = null; }
      atualizaStatus(j);
      break;
    case 'iniciar':
      j.status = 'ao_vivo'; j.inicio = agora; j.fim = null;
      break;
    case 'encerrar':
      j.status = 'encerrado'; j.fim = agora; j.inicio = j.inicio || agora; j.encerradoManual = true;
      break;
    case 'reabrir':
      j.status = j.inicio ? 'ao_vivo' : 'agendado'; j.fim = null; j.wo = null; j.encerradoManual = false;
      break;
    case 'reiniciar':
      Object.assign(j, { status: 'agendado', pontos: '', setsManual: null, wo: null, inicio: null, fim: null, encerradoManual: false });
      break;
    case 'wo': {
      if (req.body.vencedor !== 'a' && req.body.vencedor !== 'b') throw new Error('Indique o vencedor do W.O.');
      j.wo = req.body.vencedor; j.status = 'encerrado';
      j.inicio = j.inicio || Math.min(agora, Regras.paraMs(j.data, j.hora)); j.fim = j.inicio;
      break;
    }
    default:
      return res.status(404).json({ erro: 'Ação desconhecida.' });
  }
  mudou();
  res.json(j);
}));

app.put('/api/admin/ajuste', admin, rota((req, res) => {
  estado.ajuste = estado.ajuste || {};
  for (const e of estado.equipes) {
    if (req.body[e.id] !== undefined) {
      const n = Number(req.body[e.id] || 0);
      if (!Number.isFinite(n)) throw new Error(`Pontuação inválida para ${e.sigla}.`);
      estado.ajuste[e.id] = Math.round(n * 10) / 10;
    }
  }
  mudou();
  res.json(estado.ajuste);
}));

// Resultado final de uma modalidade/categoria: quem ficou em 1º, 2º, 3º e 4º
function camposResultado(b, r) {
  if (!estado.modalidades.some(m => m.id === b.modalidade)) throw new Error('Modalidade inválida.');
  const equipes = estado.equipes.map(e => e.id);
  const colocacao = (Array.isArray(b.colocacao) ? b.colocacao : []).slice(0, 4).map(x => x || '');
  while (colocacao.length && !colocacao[colocacao.length - 1]) colocacao.pop();
  if (!colocacao[0]) throw new Error('Informe ao menos o 1º lugar.');
  if (colocacao.some(x => x && !equipes.includes(x))) throw new Error('Centro acadêmico inválido.');
  const preenchidos = colocacao.filter(Boolean);
  if (new Set(preenchidos).size !== preenchidos.length) throw new Error('Um CA aparece em mais de uma colocação.');
  if (colocacao.some(x => !x)) throw new Error('Não deixe colocação vazia no meio (ex.: 3º sem 2º).');
  Object.assign(r, { modalidade: b.modalidade, categoria: texto(b.categoria, 30), coletiva: !!b.coletiva, colocacao });
}

app.post('/api/admin/resultados', admin, rota((req, res) => {
  const r = { id: crypto.randomBytes(5).toString('hex'), criado: Date.now() };
  camposResultado(req.body, r);
  estado.resultados = estado.resultados || [];
  estado.resultados.push(r);
  mudou();
  res.json(r);
}));

app.put('/api/admin/resultados/:id', admin, rota((req, res) => {
  const r = (estado.resultados || []).find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ erro: 'Resultado não encontrado.' });
  camposResultado(req.body, r);
  mudou();
  res.json(r);
}));

app.delete('/api/admin/resultados/:id', admin, rota((req, res) => {
  estado.resultados = (estado.resultados || []).filter(x => x.id !== req.params.id);
  mudou();
  res.json({ ok: true });
}));

app.put('/api/admin/modalidades/:id', admin, rota((req, res) => {
  const m = estado.modalidades.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ erro: 'Modalidade não encontrada.' });
  const b = req.body;
  if (b.ativa !== undefined) m.ativa = !!b.ativa;
  if (b.coletiva !== undefined) m.coletiva = !!b.coletiva;
  if (b.nome !== undefined && texto(b.nome, 40)) m.nome = texto(b.nome, 40);
  if (b.icone !== undefined) m.icone = texto(b.icone, 20);
  if (b.sets === true && !m.regras) m.regras = { setsParaVencer: 2, pontosSet: 25, pontosDesempate: 15 };
  if (b.sets === false) delete m.regras;
  if (Array.isArray(b.datas)) {
    m.datas = b.datas.slice(0, 10).map(d => {
      if (!DATA.test(d.data)) throw new Error('Data inválida no calendário.');
      return { data: d.data, obs: texto(d.obs, 40) };
    }).sort((x, y) => x.data.localeCompare(y.data));
  }
  const inteiro = (v, min, max) => { const n = parseInt(v, 10); if (!(n >= min && n <= max)) throw new Error('Valor fora do intervalo.'); return n; };
  if (b.duracao !== undefined) m.duracao = inteiro(b.duracao, 5, 600);
  if (b.intervalo !== undefined) m.intervalo = inteiro(b.intervalo, 0, 120);
  if (b.regras && m.regras) {
    if (b.regras.setsParaVencer !== undefined) m.regras.setsParaVencer = inteiro(b.regras.setsParaVencer, 1, 3);
    if (b.regras.pontosSet !== undefined) m.regras.pontosSet = inteiro(b.regras.pontosSet, 5, 50);
    if (b.regras.pontosDesempate !== undefined) m.regras.pontosDesempate = inteiro(b.regras.pontosDesempate, 5, 50);
  }
  mudou();
  res.json(m);
}));

// ---------- cadastros: evento, pontuação, equipes, modalidades ----------
app.put('/api/admin/evento', admin, rota((req, res) => {
  const b = req.body;
  estado.evento = {
    nome: texto(b.nome, 60) || estado.evento.nome,
    periodo: texto(b.periodo, 60),
    local: texto(b.local, 80),
  };
  mudou();
  res.json(estado.evento);
}));

app.put('/api/admin/pontuacao', admin, rota((req, res) => {
  const col = (Array.isArray(req.body.colocacao) ? req.body.colocacao : []).slice(0, 8)
    .map(n => Number(n)).filter(n => Number.isFinite(n) && n >= 0);
  if (!col.length) throw new Error('Informe os pontos de pelo menos o 1º lugar.');
  const mult = Number(req.body.multiplicadorColetiva);
  if (!(mult >= 1 && mult <= 10)) throw new Error('Multiplicador da coletiva deve ficar entre 1 e 10.');
  estado.pontuacao = { colocacao: col, multiplicadorColetiva: mult };
  mudou();
  res.json(estado.pontuacao);
}));

const slug = t => texto(t, 40).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

function aplicaLogo(e, logo) {
  if (!logo) return;
  if (!LOGO.test(logo) || logo.length > 600000) throw new Error('Logo inválida ou muito grande.');
  estado.logos = estado.logos || {};
  estado.logos[e.id] = logo;
  e.logo = `/logo/${e.id}?v=${Date.now().toString(36)}`;
}

app.get('/logo/:id', (req, res) => {
  const d = (estado.logos || {})[req.params.id];
  if (!d) return res.status(404).end();
  const [, tipo, b64] = d.match(/^data:(image\/[a-z]+);base64,(.*)$/);
  res.set('Cache-Control', 'public, max-age=31536000, immutable').type(tipo).send(Buffer.from(b64, 'base64'));
});

app.post('/api/admin/equipes', admin, rota((req, res) => {
  const sigla = texto(req.body.sigla, 16).toUpperCase();
  if (!sigla) throw new Error('Informe a sigla do centro acadêmico.');
  let id = slug(sigla) || 'ca';
  while (estado.equipes.some(e => e.id === id)) id += '-2';
  const e = { id, sigla, logo: '/img/logo.png' };
  // time conjunto (ex.: DAETEL/CAECOMP): pontos e medalhas vão para cada CA membro
  const membros = (Array.isArray(req.body.membros) ? req.body.membros : []).filter(m => estado.equipes.some(x => x.id === m && !x.membros));
  if (membros.length >= 2) e.membros = membros;
  aplicaLogo(e, req.body.logo);
  estado.equipes.push(e);
  estado.ajuste = estado.ajuste || {};
  estado.ajuste[id] = 0;
  mudou();
  res.json(e);
}));

app.put('/api/admin/equipes/:id', admin, rota((req, res) => {
  const e = estado.equipes.find(x => x.id === req.params.id);
  if (!e) return res.status(404).json({ erro: 'Centro acadêmico não encontrado.' });
  if (req.body.sigla !== undefined) {
    const sigla = texto(req.body.sigla, 16).toUpperCase();
    if (!sigla) throw new Error('A sigla não pode ficar vazia.');
    e.sigla = sigla;
  }
  aplicaLogo(e, req.body.logo);
  mudou();
  res.json(e);
}));

app.delete('/api/admin/equipes/:id', admin, rota((req, res) => {
  const id = req.params.id;
  const usado = estado.jogos.some(j => j.a === id || j.b === id) || (estado.resultados || []).some(r => r.colocacao.includes(id));
  if (usado) throw new Error('Esse CA tem jogos ou resultados. Exclua-os antes de remover o CA.');
  estado.equipes = estado.equipes.filter(e => e.id !== id);
  if (estado.ajuste) delete estado.ajuste[id];
  if (estado.logos) delete estado.logos[id];
  mudou();
  res.json({ ok: true });
}));

app.post('/api/admin/modalidades', admin, rota((req, res) => {
  const nome = texto(req.body.nome, 40);
  if (!nome) throw new Error('Informe o nome da modalidade.');
  let id = slug(nome) || 'modalidade';
  while (estado.modalidades.some(m => m.id === id)) id += '-2';
  const m = { id, nome, icone: texto(req.body.icone, 20) || '', coletiva: !!req.body.coletiva, ativa: false, duracao: 30, intervalo: 0, datas: [] };
  if (req.body.sets) m.regras = { setsParaVencer: 2, pontosSet: 25, pontosDesempate: 15 };
  estado.modalidades.push(m);
  mudou();
  res.json(m);
}));

app.delete('/api/admin/modalidades/:id', admin, rota((req, res) => {
  const id = req.params.id;
  if (estado.jogos.some(j => j.modalidade === id) || (estado.resultados || []).some(r => r.modalidade === id)) {
    throw new Error('Essa modalidade tem jogos ou resultados. Exclua-os antes.');
  }
  estado.modalidades = estado.modalidades.filter(m => m.id !== id);
  mudou();
  res.json({ ok: true });
}));

// Adia (ou adianta) de uma vez os jogos ainda não iniciados de um dia
app.post('/api/admin/adiar', admin, rota((req, res) => {
  const { modalidade, data } = req.body;
  const minutos = parseInt(req.body.minutos, 10);
  const aPartir = HORA.test(req.body.aPartir || '') ? req.body.aPartir : '00:00';
  if (!DATA.test(data || '')) throw new Error('Escolha o dia.');
  if (!minutos || Math.abs(minutos) > 720) throw new Error('Informe os minutos (ex.: 30 ou -15).');
  let n = 0;
  for (const j of estado.jogos) {
    if (j.data !== data || j.status !== 'agendado' || j.hora < aPartir) continue;
    if (modalidade && j.modalidade !== modalidade) continue;
    const novo = Regras.paraMs(j.data, j.hora) + minutos * 60000;
    j.data = Regras.dataLocal(novo);
    j.hora = Regras.hora(novo);
    n++;
  }
  if (!n) throw new Error('Nenhum jogo agendado encontrado com esses filtros.');
  mudou();
  res.json({ alterados: n });
}));

app.get('/saude', (req, res) => res.send('ok'));

carregar().then(() => {
  app.listen(PORT, () => console.log(`Jogos do ITEC em http://localhost:${PORT} (${pool ? 'Postgres' : 'arquivo local'})`));
}).catch(e => { console.error(e); process.exit(1); });
