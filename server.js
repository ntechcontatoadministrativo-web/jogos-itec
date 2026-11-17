const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Regras = require('./public/js/regras');
const { estadoInicial } = require('./dados-iniciais');

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
function mudou() {
  estado.versao = (estado.versao || 0) + 1;
  gravar();
  const lista = esperando;
  esperando = [];
  lista.forEach(f => f());
}

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/api/estado', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const v = +req.query.v;
  if (!v || v !== estado.versao) return res.json({ ...estado, agora: Date.now() });
  let feito = false;
  const responder = () => {
    if (feito) return;
    feito = true;
    clearTimeout(t);
    res.json({ ...estado, agora: Date.now() });
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
  if (b.a !== undefined) { if (!equipes.includes(b.a)) throw new Error('Equipe A inválida.'); j.a = b.a; }
  if (b.b !== undefined) { if (!equipes.includes(b.b)) throw new Error('Equipe B inválida.'); j.b = b.b; }
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
  if (!j.a || !j.b || !j.data || !j.hora) throw new Error('Preencha equipes, data e horário.');
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

app.put('/api/admin/geral', admin, rota((req, res) => {
  for (const e of estado.equipes) {
    if (req.body[e.id] !== undefined) {
      const n = Number(req.body[e.id]);
      if (!Number.isFinite(n)) throw new Error(`Pontuação inválida para ${e.sigla}.`);
      estado.geral[e.id] = Math.round(n * 10) / 10;
    }
  }
  mudou();
  res.json(estado.geral);
}));

app.put('/api/admin/modalidades/:id', admin, rota((req, res) => {
  const m = estado.modalidades.find(x => x.id === req.params.id);
  if (!m) return res.status(404).json({ erro: 'Modalidade não encontrada.' });
  const b = req.body;
  if (b.ativa !== undefined) m.ativa = !!b.ativa;
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

app.get('/saude', (req, res) => res.send('ok'));

carregar().then(() => {
  app.listen(PORT, () => console.log(`Jogos do ITEC em http://localhost:${PORT} (${pool ? 'Postgres' : 'arquivo local'})`));
}).catch(e => { console.error(e); process.exit(1); });
