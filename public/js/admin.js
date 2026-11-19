// Painel do organizador: marcar pontos, cadastrar jogos, classificação geral e regras.
(() => {
  const { esc, equipe, modalidade, rotuloDia } = Itec;
  const painel = document.getElementById('painel');
  let chave = '';
  try { chave = localStorage.getItem('itecAdmin') || ''; } catch (e) {}
  const ui = { tab: 'placar', jogo: null, dia: null, editando: null, invertido: false, manual: false };

  /* ---------- API ---------- */
  async function api(metodo, url, corpo) {
    const r = await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'x-admin-key': chave },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { sair(); throw new Error('Sessão expirada, entre de novo.'); }
    if (!r.ok) throw new Error(d.erro || 'Erro ao salvar.');
    return d;
  }
  // aplica o jogo devolvido pelo servidor sem esperar o próximo ciclo de sincronização
  function aplicaJogo(j) {
    const s = Itec.estado;
    const i = s.jogos.findIndex(x => x.id === j.id);
    if (i >= 0) s.jogos[i] = j; else s.jogos.push(j);
    Itec.definir(s);
  }

  let toastT;
  function toast(msg, erro) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast' + (erro ? ' erro-t' : '');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.add('oculto'), 2600);
  }

  /* ---------- login ---------- */
  function sair() {
    chave = '';
    try { localStorage.removeItem('itecAdmin'); } catch (e) {}
    location.reload();
  }
  async function entrar(k) {
    chave = k;
    await api('POST', '/api/admin/login');
    try { localStorage.setItem('itecAdmin', k); } catch (e) {}
    document.getElementById('abas').classList.remove('oculto');
    ui.tab = (location.hash.slice(1) || 'placar');
    Itec.aoMudar(aoMudarEstado);
    Itec.sincronizar();
  }
  document.getElementById('login').addEventListener('submit', async e => {
    e.preventDefault();
    try { await entrar(document.getElementById('chave').value.trim()); }
    catch (err) { chave = ''; document.getElementById('erro-login').textContent = 'Chave incorreta.'; }
  });
  if (chave) entrar(chave).catch(() => { chave = ''; });

  window.addEventListener('hashchange', () => {
    ui.tab = location.hash.slice(1) || 'placar';
    ui.jogo = null; ui.editando = null; ui.editandoRes = null; ui.manual = false;
    renderTab();
  });

  let primeiro = true;
  function aoMudarEstado() {
    if (primeiro) { primeiro = false; renderTab(); return; }
    // só redesenha o que não tem formulário aberto, para não apagar o que o admin está digitando
    if (ui.tab === 'placar' && !ui.manual) renderPlacar();
    else if (ui.tab === 'jogos') renderListaJogos();
  }

  function renderTab() {
    if (!Itec.estado) return;
    document.querySelectorAll('#abas a').forEach(a => a.classList.toggle('ativo', a.dataset.t === ui.tab));
    if (ui.tab === 'jogos') renderJogos();
    else if (ui.tab === 'geral') renderGeral();
    else if (ui.tab === 'ajustes') renderAjustes();
    else { ui.tab = 'placar'; renderPlacar(); }
  }

  /* ---------- PLACAR ---------- */
  function itemJogo(j, est) {
    const e = est[j.id];
    const p = Regras.placar(j, (modalidade(j.modalidade) || {}).regras);
    const A = equipe(j.a), B = equipe(j.b);
    const mudou = j.status === 'agendado' && Math.abs(e.atraso) >= 1;
    const pl = j.status === 'agendado' ? '' : `${p.setsA}×${p.setsB}`;
    const st = j.status === 'ao_vivo' ? '<span class="status vivo">AO VIVO</span>' : j.status === 'encerrado' ? '<span class="status fim">FIM</span>' : '';
    return `<button class="item ${j.status === 'ao_vivo' ? 'vivo' : ''}" data-abrir="${j.id}">
      <span class="hr">${Regras.hora(e.inicio)}${mudou ? `<small>${j.hora}</small>` : ''}</span>
      <span>
        <span class="vs"><img src="${esc(A.logo)}" alt="">${esc(A.sigla)} <span style="color:var(--suave)">×</span> <img src="${esc(B.logo)}" alt="">${esc(B.sigla)}</span>
        <span class="sub">${[st, esc((modalidade(j.modalidade) || {}).nome), esc(j.categoria), esc(j.fase), esc(j.quadra)].filter(Boolean).join(' · ')}</span>
      </span>
      <span class="pl">${pl}</span>
    </button>`;
  }

  function seletorDias(datas) {
    const hoje = Regras.dataLocal(Itec.agora());
    if (!ui.dia || !datas.includes(ui.dia)) ui.dia = datas.includes(hoje) ? hoje : (datas.find(d => d > hoje) || datas[datas.length - 1]);
    return `<div class="abas dias" style="margin-bottom:12px">${datas.map(d => {
      const r = rotuloDia(d);
      return `<button class="aba ${d === ui.dia ? 'ativa' : ''}" data-dia="${d}">${d === hoje ? 'Hoje' : r.semana}<small>${r.dia}</small></button>`;
    }).join('')}</div>`;
  }

  function renderPlacar() {
    const s = Itec.estado;
    const est = Regras.estimar(s.jogos, s.modalidades, Itec.agora());
    const j = ui.jogo && s.jogos.find(x => x.id === ui.jogo);
    if (!j) {
      ui.jogo = null;
      const datas = [...new Set(s.jogos.map(x => x.data))].sort();
      if (!datas.length) {
        painel.innerHTML = `<h2 class="tit">Placar</h2><div class="vazio"><b>Nenhum jogo cadastrado</b><a class="btn" href="#jogos" style="margin-top:12px">Cadastrar jogos</a></div>`;
        return;
      }
      const vivos = s.jogos.filter(x => x.status === 'ao_vivo');
      const dias = seletorDias(datas);
      const doDia = s.jogos.filter(x => x.data === ui.dia)
        .sort((x, y) => est[x.id].inicio - est[y.id].inicio);
      painel.innerHTML = `<h2 class="tit">Escolha o jogo</h2>
        ${vivos.length ? `<div class="lista" style="margin-bottom:16px">${vivos.map(x => itemJogo(x, est)).join('')}</div>` : ''}
        ${dias}
        <div class="lista">${doDia.map(x => itemJogo(x, est)).join('')}</div>
        <p class="dica">Toque num jogo para abrir o placar. Ao marcar o primeiro ponto o jogo começa sozinho; ao fechar o último set ele encerra sozinho.</p>`;
      return;
    }

    const mod = modalidade(j.modalidade) || {};
    const p = Regras.placar(j, mod.regras);
    const temSets = !!mod.regras;
    const A = equipe(j.a), B = equipe(j.b);
    const e = est[j.id];
    const encerrado = j.status === 'encerrado';
    const lados = ui.invertido ? ['b', 'a'] : ['a', 'b'];

    const lado = l => {
      const eq = l === 'a' ? A : B;
      return `<button class="lado ${l}" data-ponto="${l}" ${encerrado || j.setsManual ? 'disabled' : ''}>
        <span class="mais">+1</span>
        <img src="${esc(eq.logo)}" alt="">
        <span class="sig">${esc(eq.sigla)}</span>
        <span class="num">${p.atual[l]}</span>
        ${temSets ? `<span class="sets">Sets ${l === 'a' ? p.setsA : p.setsB}</span>` : ''}
      </button>`;
    };

    const fechados = p.sets.filter(x => x.fechado || j.setsManual);
    const venc = p.vencedor && equipe(j[p.vencedor]);

    painel.innerHTML = `
      <div class="placar-top">
        <button class="btn sec peq" data-voltar>‹ Jogos</button>
        <span class="info">${[esc(mod.nome), esc(j.categoria), esc(j.fase), esc(j.quadra)].filter(Boolean).join(' · ')}</span>
      </div>
      ${encerrado ? `<div class="banner-fim">Jogo encerrado${venc ? `<b>Vitória ${esc(venc.sigla)}${j.wo ? ' (W.O.)' : ''}</b>` : ''}</div>` : ''}
      <div class="set-info">${j.status === 'agendado'
        ? `Agendado para <b>${j.hora}</b> · estimado <b>${Regras.hora(e.inicio)}</b> — o jogo começa no primeiro ponto`
        : temSets ? `Set <b>${p.numeroSet}</b> de até ${p.maxSets} · vai a <b>${p.alvoAtual}</b> · começou ${Regras.hora(e.inicio)}`
          : `Placar corrido · começou ${Regras.hora(e.inicio)} · <b>encerre pelo botão quando acabar</b>`}</div>
      ${fechados.length && !p.simples ? `<div class="hist">${fechados.map((x, i) => `<span>${i + 1}º set: ${x.a}–${x.b}</span>`).join('')}</div>` : ''}
      <div class="quadra">${lado(lados[0])}${lado(lados[1])}</div>
      <div class="acoes">
        <button class="btn ouro" data-acao="desfazer" ${j.pontos ? '' : 'disabled'}>↶ Desfazer ponto</button>
        <button class="btn sec" data-inverter>⇄ Inverter lados</button>
      </div>
      <div class="acoes">
        ${j.status === 'agendado' ? '<button class="btn" data-acao="iniciar">▶ Iniciar agora</button>' : ''}
        ${j.status === 'ao_vivo' ? '<button class="btn sec" data-acao="encerrar">■ Encerrar jogo</button>' : ''}
        ${encerrado ? '<button class="btn sec" data-acao="reabrir">Reabrir jogo</button>' : ''}
        <button class="btn sec" data-manual>✎ Placar manual</button>
        <button class="btn sec" data-wo>W.O.</button>
        <button class="btn perigo" data-acao="reiniciar">Zerar jogo</button>
      </div>
      <div id="area-extra"></div>`;
  }

  // pontos são enviados em fila para manter a ordem mesmo com toques rápidos
  let fila = Promise.resolve();
  function acao(nome, corpo) {
    const id = ui.jogo;
    fila = fila.then(() => api('POST', `/api/admin/jogos/${id}/${nome}`, corpo))
      .then(j => {
        const antes = Itec.estado.jogos.find(x => x.id === j.id);
        aplicaJogo(j);
        if (antes && antes.status !== 'encerrado' && j.status === 'encerrado') toast('Jogo encerrado!');
      })
      .catch(e => toast(e.message, true));
    return fila;
  }

  function formManual(j) {
    const mod = modalidade(j.modalidade) || {};
    const p = Regras.placar(j, mod.regras);
    const n = p.maxSets;
    const A = equipe(j.a), B = equipe(j.b);
    const atual = j.setsManual || p.sets;
    let linhas = '';
    for (let i = 0; i < n; i++) {
      const s = atual[i] || { a: '', b: '' };
      linhas += `<div class="set-l"><span>${p.simples ? 'Placar' : `${i + 1}º set`}</span>
        <input type="number" min="0" inputmode="numeric" name="a${i}" value="${s.a === '' || (s.a === 0 && s.b === 0 && !j.setsManual) ? '' : s.a}" placeholder="${esc(A.sigla)}">
        <input type="number" min="0" inputmode="numeric" name="b${i}" value="${s.b === '' || (s.a === 0 && s.b === 0 && !j.setsManual) ? '' : s.b}" placeholder="${esc(B.sigla)}"></div>`;
    }
    return `<form class="cartao manual" id="form-manual">
      <b>Placar manual</b>
      <p class="dica" style="margin:0">Use para lançar um resultado já terminado ou corrigir o placar. Deixe em branco os sets que não houve.</p>
      <div class="set-l"><span></span><b>${esc(A.sigla)}</b><b>${esc(B.sigla)}</b></div>
      ${linhas}
      <div class="acoes"><button class="btn">Salvar resultado</button>
      ${j.setsManual ? '<button type="button" class="btn sec" data-limpar-manual>Voltar ao ponto a ponto</button>' : ''}
      <button type="button" class="btn sec" data-fechar-extra>Cancelar</button></div>
    </form>`;
  }

  function formWO(j) {
    const A = equipe(j.a), B = equipe(j.b);
    return `<div class="cartao manual"><b>W.O. — quem venceu?</b>
      <div class="acoes"><button class="btn" data-wo-v="a">${esc(A.sigla)}</button><button class="btn" data-wo-v="b">${esc(B.sigla)}</button>
      <button class="btn sec" data-fechar-extra>Cancelar</button></div></div>`;
  }

  /* ---------- JOGOS (cadastro) ---------- */
  function renderJogos() {
    const s = Itec.estado;
    const datas = [...new Set(s.jogos.map(j => j.data))].sort();
    const hoje = Regras.dataLocal(Itec.agora());
    const diaPadrao = datas.includes(hoje) ? hoje : (datas.find(d => d > hoje) || datas[datas.length - 1] || hoje);
    painel.innerHTML = `<h2 class="tit" id="tit-form"></h2><form class="cartao" id="form-jogo"></form>
      <h2 class="tit">Mudar horário de vários jogos</h2>
      <form class="cartao" id="form-adiar">
        <div class="linha-form">
          <label>Dia<input type="date" name="data" value="${diaPadrao}" required></label>
          <label>Modalidade<select name="modalidade"><option value="">Todas</option>${s.modalidades.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('')}</select></label>
          <label>Jogos a partir de<input type="time" name="aPartir" value="00:00"></label>
          <label>Minutos<input type="number" name="minutos" min="1" max="720" value="30" required></label>
          <label>Sentido<select name="sentido"><option value="depois">Atrasar (mais tarde)</option><option value="antes">Adiantar (mais cedo)</option></select></label>
        </div>
        <p class="dica">Muda o horário marcado de todos os jogos ainda não iniciados que batem com o filtro. Para um jogo só, use "Editar" na lista abaixo.</p>
        <div class="acoes" style="justify-content:flex-start"><button class="btn peq">Aplicar</button></div>
      </form>
      <h2 class="tit">Jogos cadastrados</h2><div id="lista-jogos"></div>`;
    renderFormJogo();
    renderListaJogos();
  }

  function renderFormJogo() {
    const s = Itec.estado;
    const j = ui.editando ? s.jogos.find(x => x.id === ui.editando) : null;
    const ult = s.jogos[s.jogos.length - 1];
    const v = j || {
      modalidade: 'volei', data: (ult && ult.data) || Regras.dataLocal(Itec.agora()),
      hora: '', categoria: (ult && ult.categoria) || 'Masculino', fase: (ult && ult.fase) || '', quadra: (ult && ult.quadra) || '', a: '', b: '', duracao: '',
    };
    const opEq = sel => `<option value="">Escolha…</option>` + s.equipes.map(e => `<option value="${e.id}" ${e.id === sel ? 'selected' : ''}>${esc(e.sigla)}</option>`).join('');
    document.getElementById('tit-form').textContent = j ? 'Editar jogo' : 'Novo jogo';
    document.getElementById('form-jogo').innerHTML = `
      <div class="linha-form">
        <label>Modalidade<select name="modalidade">${s.modalidades.map(m => `<option value="${m.id}" ${m.id === v.modalidade ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></label>
        <label>Categoria<input name="categoria" list="cats" value="${esc(v.categoria)}" placeholder="Masculino / Feminino"></label>
        <label>Fase<input name="fase" list="fases" value="${esc(v.fase)}" placeholder="Grupo A, Semifinal…"></label>
        <label>Quadra / local<input name="quadra" value="${esc(v.quadra)}" placeholder="Ginásio da UFPA"></label>
      </div>
      <div class="linha-form" style="margin-top:10px">
        <label>Equipe A<select name="a" required>${opEq(v.a)}</select></label>
        <label>Equipe B<select name="b" required>${opEq(v.b)}</select></label>
        <label>Data<input type="date" name="data" value="${esc(v.data)}" required></label>
        <label>Horário<input type="time" name="hora" value="${esc(v.hora)}" required></label>
        <label>Duração (min)<input type="number" name="duracao" min="5" value="${esc(v.duracao || '')}" placeholder="padrão ${(modalidade(v.modalidade) || {}).duracao || 60}"></label>
      </div>
      <datalist id="cats"><option>Masculino</option><option>Feminino</option><option>Misto</option></datalist>
      <datalist id="fases"><option>Grupo A</option><option>Grupo B</option><option>Grupo C</option><option>Grupo D</option><option>Quartas de final</option><option>Semifinal</option><option>Disputa de 3º lugar</option><option>Final</option></datalist>
      <div class="acoes" style="justify-content:flex-start">
        <button class="btn">${j ? 'Salvar alterações' : '+ Adicionar jogo'}</button>
        ${j ? '<button type="button" class="btn sec" data-cancelar-edicao>Cancelar</button>' : ''}
      </div>
      <p class="dica">Jogos da mesma modalidade, dia e quadra formam uma fila: se um atrasa, os horários estimados dos seguintes são recalculados.</p>`;
  }

  function renderListaJogos() {
    const el = document.getElementById('lista-jogos');
    if (!el) return;
    const s = Itec.estado;
    const est = Regras.estimar(s.jogos, s.modalidades, Itec.agora());
    const datas = [...new Set(s.jogos.map(x => x.data))].sort();
    if (!datas.length) { el.innerHTML = '<div class="vazio"><b>Nenhum jogo ainda</b>Use o formulário acima.</div>'; return; }
    el.innerHTML = datas.map(d => {
      const r = rotuloDia(d);
      const js = s.jogos.filter(x => x.data === d).sort((x, y) => x.hora.localeCompare(y.hora));
      return `<h3 class="tabela-tit">${r.semana}, ${r.dia}</h3><div class="lista">${js.map(j => `
        <div style="display:grid;grid-template-columns:1fr auto;gap:6px;align-items:center">
          ${itemJogo(j, est)}
          <span style="display:grid;gap:4px"><button class="btn sec peq" data-editar="${j.id}">Editar</button><button class="btn perigo peq" data-excluir="${j.id}">Excluir</button></span>
        </div>`).join('')}</div>`;
    }).join('');
  }

  /* ---------- CLASSIFICAÇÃO GERAL ---------- */
  function renderGeral() {
    const s = Itec.estado;
    const r = Regras.classificacaoGeral(s);
    const res = ui.editandoRes ? (s.resultados || []).find(x => x.id === ui.editandoRes) : null;
    const v = res || { modalidade: (s.modalidades.find(m => m.ativa) || s.modalidades[0]).id, categoria: '', colocacao: [] };
    const coletiva = res ? res.coletiva : !!(modalidade(v.modalidade) || {}).coletiva;
    const opEq = sel => `<option value="">—</option>` + s.equipes.map(e => `<option value="${e.id}" ${e.id === sel ? 'selected' : ''}>${esc(e.sigla)}</option>`).join('');
    const MED = ['🥇 1º lugar', '🥈 2º lugar', '🥉 3º lugar', '4º lugar'];
    const pont = s.pontuacao || Regras.PONTOS_PADRAO;

    painel.innerHTML = `<h2 class="tit">${res ? 'Editar resultado' : 'Lançar resultado'}</h2>
      <form class="cartao" id="form-resultado">
        <div class="linha-form">
          <label>Modalidade<select name="modalidade">${s.modalidades.map(m => `<option value="${m.id}" ${m.id === v.modalidade ? 'selected' : ''}>${esc(m.nome)}</option>`).join('')}</select></label>
          <label>Categoria<input name="categoria" list="cats-r" value="${esc(v.categoria)}" placeholder="Masculino / Feminino / Misto"></label>
          <label style="flex-direction:row;display:flex;align-items:center;gap:8px;align-self:end;padding-bottom:10px">
            <input type="checkbox" name="coletiva" ${coletiva ? 'checked' : ''} style="width:auto"> Coletiva (pontos ×${pont.multiplicadorColetiva || 2})</label>
        </div>
        <div class="linha-form" style="margin-top:10px">
          ${MED.map((rot, i) => `<label>${rot}<select name="c${i}">${opEq(v.colocacao[i])}</select></label>`).join('')}
        </div>
        <datalist id="cats-r"><option>Masculino</option><option>Feminino</option><option>Misto</option></datalist>
        <p class="dica" id="previa-pts"></p>
        <div class="acoes" style="justify-content:flex-start">
          <button class="btn">${res ? 'Salvar resultado' : '+ Lançar resultado'}</button>
          ${res ? '<button type="button" class="btn sec" data-cancelar-res>Cancelar</button>' : ''}
        </div>
      </form>

      <h2 class="tit">Resultados lançados</h2>
      ${(s.resultados || []).length ? `<div class="lista">${s.resultados.map(x => {
        const m = modalidade(x.modalidade) || { nome: x.modalidade };
        return `<div class="cartao" style="padding:12px 14px;display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center">
          <div><b>${esc(m.nome)}${x.categoria ? ' · ' + esc(x.categoria) : ''}</b> <span class="dica">${x.coletiva ? 'coletiva' : 'individual'}</span>
            <div style="display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:6px;font-weight:700">${x.colocacao.map((id, i) =>
              `<span style="display:inline-flex;align-items:center;gap:5px">${['🥇', '🥈', '🥉', '4º'][i]}<img src="${esc(equipe(id).logo)}" alt="" style="width:22px;height:22px;border-radius:50%">${esc(equipe(id).sigla)} <span class="dica" style="margin:0">+${Regras.pontosDaColocacao(pont, i, x.coletiva)}</span></span>`).join('')}</div></div>
          <span style="display:grid;gap:4px"><button class="btn sec peq" data-editar-res="${x.id}">Editar</button><button class="btn perigo peq" data-excluir-res="${x.id}">Excluir</button></span>
        </div>`;
      }).join('')}</div>` : '<div class="vazio"><b>Nenhum resultado ainda</b>Lance o pódio de cada modalidade quando ela terminar.</div>'}

      <h2 class="tit">Pontos anteriores / ajuste manual</h2>
      <form class="cartao" id="form-ajuste">
        <p class="dica" style="margin:0 0 8px">Somados aos pontos dos resultados. Hoje guardam a classificação divulgada antes do site. <b>Se você lançar aqui os resultados que geraram esses pontos, zere o ajuste</b> para não contar duas vezes.</p>
        ${r.map(e => `<div class="geral-l"><img src="${esc(e.logo)}" alt=""><b>${esc(e.sigla)} <span class="dica">total ${e.pts} · resultados ${e.pontosResultados}</span></b>
          <input type="number" step="0.5" inputmode="decimal" name="${e.id}" value="${e.ajuste}"></div>`).join('')}
        <div class="acoes" style="justify-content:flex-start"><button class="btn">Salvar ajustes</button>
          <button type="button" class="btn sec" data-zerar-ajuste>Zerar todos</button></div>
      </form>`;
    previaPontos();
  }

  function previaPontos() {
    const f = document.getElementById('form-resultado');
    const el = document.getElementById('previa-pts');
    if (!f || !el) return;
    const pont = Itec.estado.pontuacao || Regras.PONTOS_PADRAO;
    const col = f.coletiva.checked;
    el.textContent = 'Vale: ' + pont.colocacao.map((_, i) => `${i + 1}º = ${Regras.pontosDaColocacao(pont, i, col)} pts`).join(' · ');
  }

  /* ---------- AJUSTES ---------- */
  const NOMES_ICONES = {
    volei: 'Vôlei', 'volei-areia': 'Vôlei de areia', futsal: 'Futebol', basquete: 'Basquete', handebol: 'Handebol',
    'tenis-mesa': 'Tênis de mesa', xadrez: 'Xadrez', fifa: 'Videogame', 'free-fire': 'Free Fire', queimada: 'Queimada', taca: 'Troféu',
  };

  function renderAjustes() {
    const s = Itec.estado;
    const ev = s.evento || {};
    const pont = s.pontuacao || Regras.PONTOS_PADRAO;
    const opIcone = sel => Itec.icones.map(i => `<option value="${i}" ${i === sel ? 'selected' : ''}>${NOMES_ICONES[i] || i}</option>`).join('');
    const colocacoes = [0, 1, 2, 3, 4, 5].map(i => `<label>${i + 1}º lugar<input type="number" name="p${i}" min="0" step="0.5" value="${pont.colocacao[i] ?? ''}" placeholder="—"></label>`).join('');

    painel.innerHTML = `
      <h2 class="tit">Evento</h2>
      <form class="cartao" id="form-evento">
        <div class="linha-form">
          <label>Nome<input name="nome" value="${esc(ev.nome)}" required></label>
          <label>Período<input name="periodo" value="${esc(ev.periodo)}" placeholder="14/11 a 05/12/2026"></label>
          <label>Local<input name="local" value="${esc(ev.local)}" placeholder="UFPA · Belém-PA"></label>
        </div>
        <div class="acoes" style="justify-content:flex-start"><button class="btn peq">Salvar evento</button></div>
      </form>

      <h2 class="tit">Pontuação da geral</h2>
      <form class="cartao" id="form-pontuacao">
        <div class="linha-form">${colocacoes}</div>
        <div class="linha-form" style="margin-top:10px">
          <label>Coletivas valem (×)<input type="number" name="mult" min="1" max="10" step="0.5" value="${pont.multiplicadorColetiva}"></label>
        </div>
        <p class="dica">Deixe em branco as colocações que não pontuam. A tabela "Como funciona a pontuação" do site se atualiza sozinha.</p>
        <div class="acoes" style="justify-content:flex-start"><button class="btn peq">Salvar pontuação</button></div>
      </form>

      <h2 class="tit">Centros acadêmicos</h2>
      <div class="lista">${s.equipes.map(e => `
        <form class="cartao eq-form" data-eq="${e.id}">
          <img src="${esc(e.logo)}" alt="" class="eq-logo">
          <label>Sigla<input name="sigla" value="${esc(e.sigla)}" required></label>
          <label>Trocar logo<input type="file" name="logo" accept="image/*"></label>
          <span class="eq-bts"><button class="btn peq">Salvar</button><button type="button" class="btn perigo peq" data-excluir-eq="${e.id}">Excluir</button></span>
        </form>`).join('')}
        <form class="cartao eq-form" id="form-nova-eq">
          <img src="/img/logo.png" alt="" class="eq-logo" style="opacity:.4">
          <label>Novo CA — sigla<input name="sigla" placeholder="Ex.: CAEMAT" required></label>
          <label>Logo<input type="file" name="logo" accept="image/*"></label>
          <span class="eq-bts"><button class="btn peq">+ Adicionar CA</button></span>
        </form>
      </div>

      <h2 class="tit">Modalidades</h2>
      <div class="lista">${s.modalidades.map(m => `
        <form class="cartao" data-mod="${m.id}">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
            <span style="width:34px;height:34px;color:var(--verde)">${Itec.icone(m.icone || m.id, 'style="width:34px;height:34px"')}</span>
            <b style="font-size:18px">${esc(m.nome)}</b>
            <label style="display:flex;align-items:center;gap:6px;margin-left:auto"><input type="checkbox" name="coletiva" ${m.coletiva ? 'checked' : ''} style="width:auto"> Coletiva</label>
            <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" name="ativa" ${m.ativa ? 'checked' : ''} style="width:auto"> Placar no site</label>
            <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" name="sets" ${m.regras ? 'checked' : ''} style="width:auto"> Placar por sets</label>
          </div>
          <div class="linha-form">
            <label>Nome<input name="nome" value="${esc(m.nome)}" required></label>
            <label>Ícone<select name="icone">${opIcone(m.icone || m.id)}</select></label>
            <label style="grid-column:1/-1">Datas (separe por vírgula; texto depois da data vira observação)<input name="datas" value="${esc((m.datas || []).map(d => Itec.dataCurta(d.data) + (d.obs ? ' ' + d.obs : '')).join(', '))}" placeholder="28/11 Masculino, 05/12"></label>
            <label>Duração média do jogo (min)<input type="number" name="duracao" min="5" value="${m.duracao}"></label>
            <label>Intervalo entre jogos (min)<input type="number" name="intervalo" min="0" value="${m.intervalo || 0}"></label>
            ${m.regras ? `
            <label>Sets para vencer<input type="number" name="setsParaVencer" min="1" max="3" value="${m.regras.setsParaVencer}"></label>
            <label>Pontos por set<input type="number" name="pontosSet" min="5" value="${m.regras.pontosSet}"></label>
            <label>Pontos do tie-break<input type="number" name="pontosDesempate" min="5" value="${m.regras.pontosDesempate}"></label>` : ''}
          </div>
          <div class="acoes" style="justify-content:flex-start"><button class="btn peq">Salvar</button>
            <button type="button" class="btn perigo peq" data-excluir-mod="${m.id}">Excluir modalidade</button></div>
        </form>`).join('')}
        <form class="cartao" id="form-nova-mod">
          <b>Nova modalidade</b>
          <div class="linha-form" style="margin-top:8px">
            <label>Nome<input name="nome" placeholder="Ex.: Vôlei Misto" required></label>
            <label>Ícone<select name="icone">${opIcone('taca')}</select></label>
          </div>
          <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px">
            <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" name="coletiva" style="width:auto"> Coletiva</label>
            <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" name="sets" style="width:auto"> Placar por sets (tipo vôlei)</label>
          </div>
          <div class="acoes" style="justify-content:flex-start"><button class="btn peq">+ Criar modalidade</button></div>
        </form>
      </div>
      <p class="dica" style="margin-top:16px">"Placar no site" libera a página de jogos ao vivo da modalidade. Sem "placar por sets", o admin lança o resultado do jogo pelo placar manual.
        <button class="btn sec peq" data-sair>Sair do painel</button></p>`;
  }

  // reduz a imagem para 256×256 (fundo branco) antes de enviar
  function lerLogo(arquivo) {
    return new Promise((ok, falha) => {
      if (!arquivo) return ok(null);
      const img = new Image();
      img.onload = () => {
        const N = 256, c = document.createElement('canvas');
        c.width = c.height = N;
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, N, N);
        const k = Math.min(N / img.width, N / img.height) * 0.86;
        const w = img.width * k, h = img.height * k;
        g.drawImage(img, (N - w) / 2, (N - h) / 2, w, h);
        URL.revokeObjectURL(img.src);
        ok(c.toDataURL('image/png'));
      };
      img.onerror = () => falha(new Error('Não consegui ler essa imagem.'));
      img.src = URL.createObjectURL(arquivo);
    });
  }

  // busca o estado atualizado do servidor e redesenha a aba atual
  async function recarregar() {
    const d = await (await fetch('/api/estado', { cache: 'no-store' })).json();
    Itec.definir(d);
    renderTab();
  }

  /* ---------- eventos ---------- */
  painel.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.abrir) { ui.jogo = d.abrir; ui.manual = false; ui.tab = 'placar'; if (location.hash !== '#placar') { history.replaceState(null, '', '#placar'); document.querySelectorAll('#abas a').forEach(a => a.classList.toggle('ativo', a.dataset.t === 'placar')); } renderPlacar(); window.scrollTo(0, 0); return; }
    if (d.dia) { ui.dia = d.dia; renderPlacar(); return; }
    if (d.voltar !== undefined) { ui.jogo = null; ui.manual = false; renderPlacar(); return; }
    if (d.ponto) {
      b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
      if (navigator.vibrate) navigator.vibrate(25);
      // atualização otimista: mostra o ponto na hora
      const j = Itec.estado.jogos.find(x => x.id === ui.jogo);
      if (j && j.status !== 'encerrado') {
        j.pontos = (j.pontos || '') + d.ponto.toUpperCase();
        if (j.status === 'agendado') { j.status = 'ao_vivo'; j.inicio = Itec.agora(); }
        renderPlacar();
      }
      acao('ponto', { lado: d.ponto });
      return;
    }
    if (d.inverter !== undefined) { ui.invertido = !ui.invertido; renderPlacar(); return; }
    if (d.acao) {
      const avisos = { encerrar: 'Encerrar o jogo agora com o placar atual?', reiniciar: 'Zerar todo o placar deste jogo?' };
      if (avisos[d.acao] && !confirm(avisos[d.acao])) return;
      await acao(d.acao);
      return;
    }
    if (d.manual !== undefined) {
      ui.manual = true;
      document.getElementById('area-extra').innerHTML = formManual(Itec.estado.jogos.find(x => x.id === ui.jogo));
      return;
    }
    if (d.wo !== undefined) {
      ui.manual = true;
      document.getElementById('area-extra').innerHTML = formWO(Itec.estado.jogos.find(x => x.id === ui.jogo));
      return;
    }
    if (d.woV) { ui.manual = false; await acao('wo', { vencedor: d.woV }); return; }
    if (d.fecharExtra !== undefined) { ui.manual = false; renderPlacar(); return; }
    if (d.limparManual !== undefined) {
      try { aplicaJogo(await api('PUT', `/api/admin/jogos/${ui.jogo}`, { setsManual: null })); ui.manual = false; renderPlacar(); }
      catch (err) { toast(err.message, true); }
      return;
    }
    if (d.editar) { ui.editando = d.editar; renderFormJogo(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (d.cancelarEdicao !== undefined) { ui.editando = null; renderFormJogo(); return; }
    if (d.excluir) {
      const j = Itec.estado.jogos.find(x => x.id === d.excluir);
      if (!confirm(`Excluir ${equipe(j.a).sigla} × ${equipe(j.b).sigla} (${j.hora})?`)) return;
      try {
        await api('DELETE', `/api/admin/jogos/${d.excluir}`);
        Itec.estado.jogos = Itec.estado.jogos.filter(x => x.id !== d.excluir);
        if (ui.editando === d.excluir) { ui.editando = null; renderFormJogo(); }
        renderListaJogos();
        toast('Jogo excluído.');
      } catch (err) { toast(err.message, true); }
      return;
    }
    if (d.editarRes) { ui.editandoRes = d.editarRes; renderGeral(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (d.cancelarRes !== undefined) { ui.editandoRes = null; renderGeral(); return; }
    if (d.excluirRes) {
      const x = Itec.estado.resultados.find(r => r.id === d.excluirRes);
      if (!confirm(`Excluir o resultado de ${(modalidade(x.modalidade) || {}).nome}${x.categoria ? ' ' + x.categoria : ''}?`)) return;
      try {
        await api('DELETE', `/api/admin/resultados/${d.excluirRes}`);
        Itec.estado.resultados = Itec.estado.resultados.filter(r => r.id !== d.excluirRes);
        if (ui.editandoRes === d.excluirRes) ui.editandoRes = null;
        renderGeral();
        toast('Resultado excluído.');
      } catch (err) { toast(err.message, true); }
      return;
    }
    if (d.zerarAjuste !== undefined) {
      document.querySelectorAll('#form-ajuste input[type=number]').forEach(i => { i.value = 0; });
      toast('Valores zerados — clique em "Salvar ajustes" para confirmar.');
      return;
    }
    if (d.excluirEq || d.excluirMod) {
      const nome = d.excluirEq ? equipe(d.excluirEq).sigla : (modalidade(d.excluirMod) || {}).nome;
      if (!confirm(`Excluir ${nome}? Isso não pode ser desfeito.`)) return;
      try {
        await api('DELETE', d.excluirEq ? `/api/admin/equipes/${d.excluirEq}` : `/api/admin/modalidades/${d.excluirMod}`);
        toast(`${nome} excluído.`);
        await recarregar();
      } catch (err) { toast(err.message, true); }
      return;
    }
    if (d.sair !== undefined) sair();
  });

  painel.addEventListener('change', e => {
    const f = e.target.form;
    if (!f || f.id !== 'form-resultado') return;
    if (e.target.name === 'modalidade') f.coletiva.checked = !!(modalidade(e.target.value) || {}).coletiva;
    previaPontos();
  });

  painel.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const dados = Object.fromEntries(new FormData(f));
    try {
      if (f.id === 'form-jogo') {
        const corpo = { ...dados, duracao: dados.duracao || null };
        const j = ui.editando ? await api('PUT', `/api/admin/jogos/${ui.editando}`, corpo) : await api('POST', '/api/admin/jogos', corpo);
        aplicaJogo(j);
        toast(ui.editando ? 'Jogo atualizado.' : `Jogo adicionado: ${equipe(j.a).sigla} × ${equipe(j.b).sigla}`);
        const manter = !ui.editando;
        ui.editando = null;
        renderFormJogo();
        if (manter) {
          // mantém data/quadra para cadastrar o próximo jogo rápido; sugere o horário seguinte
          const mod = modalidade(j.modalidade) || {};
          const prox = Regras.hora(Regras.paraMs(j.data, j.hora) + ((+j.duracao || mod.duracao || 60) + (mod.intervalo || 0)) * 60000);
          f.querySelector('[name=hora]').value = prox;
        }
        renderListaJogos();
      } else if (f.id === 'form-ajuste') {
        Itec.estado.ajuste = await api('PUT', '/api/admin/ajuste', dados);
        toast('Ajustes salvos.');
        renderGeral();
      } else if (f.id === 'form-resultado') {
        const corpo = {
          modalidade: dados.modalidade, categoria: dados.categoria, coletiva: f.coletiva.checked,
          colocacao: [dados.c0, dados.c1, dados.c2, dados.c3],
        };
        const s = Itec.estado;
        const r = ui.editandoRes ? await api('PUT', `/api/admin/resultados/${ui.editandoRes}`, corpo) : await api('POST', '/api/admin/resultados', corpo);
        s.resultados = (s.resultados || []).filter(x => x.id !== r.id).concat(r);
        toast(ui.editandoRes ? 'Resultado atualizado.' : 'Resultado lançado! Pontos e medalhas já contam na geral.');
        ui.editandoRes = null;
        renderGeral();
      } else if (f.id === 'form-manual') {
        const sets = [];
        for (let i = 0; i < 9; i++) {
          if (dados['a' + i] === undefined) break;
          if (dados['a' + i] === '' && dados['b' + i] === '') continue;
          sets.push({ a: dados['a' + i] || 0, b: dados['b' + i] || 0 });
        }
        if (!sets.length) throw new Error('Preencha ao menos um set.');
        aplicaJogo(await api('PUT', `/api/admin/jogos/${ui.jogo}`, { setsManual: sets }));
        ui.manual = false;
        renderPlacar();
        toast('Placar salvo.');
      } else if (f.dataset.mod) {
        const corpo = {
          ativa: f.ativa.checked, coletiva: f.coletiva.checked, sets: f.sets.checked, nome: dados.nome, icone: dados.icone,
          duracao: dados.duracao, intervalo: dados.intervalo,
          datas: (dados.datas || '').split(',').map(x => x.trim()).filter(Boolean).map(x => {
            const m = x.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*(.*)$/);
            if (!m) throw new Error(`Data não entendida: "${x}". Use dd/mm.`);
            return { data: `${m[3] || 2026}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, obs: m[4] };
          }),
        };
        if (dados.setsParaVencer !== undefined) corpo.regras = { setsParaVencer: dados.setsParaVencer, pontosSet: dados.pontosSet, pontosDesempate: dados.pontosDesempate };
        // ao desligar "placar por sets" as regras não vão junto
        if (!f.sets.checked) delete corpo.regras;
        const m = await api('PUT', `/api/admin/modalidades/${f.dataset.mod}`, corpo);
        toast(`${m.nome} salvo.`);
        await recarregar();
      } else if (f.id === 'form-nova-mod') {
        const m = await api('POST', '/api/admin/modalidades', { nome: dados.nome, icone: dados.icone, coletiva: f.coletiva.checked, sets: f.sets.checked });
        toast(`Modalidade ${m.nome} criada. Configure datas e marque "Placar no site" quando quiser.`);
        await recarregar();
      } else if (f.id === 'form-evento') {
        await api('PUT', '/api/admin/evento', dados);
        toast('Evento salvo.');
        await recarregar();
      } else if (f.id === 'form-pontuacao') {
        const colocacao = [0, 1, 2, 3, 4, 5].map(i => dados['p' + i]).filter(v => v !== '' && v !== undefined);
        await api('PUT', '/api/admin/pontuacao', { colocacao, multiplicadorColetiva: dados.mult });
        toast('Pontuação salva. A geral já foi recalculada.');
        await recarregar();
      } else if (f.dataset.eq || f.id === 'form-nova-eq') {
        const logo = await lerLogo(f.logo.files[0]);
        const corpo = { sigla: dados.sigla, logo };
        const e = f.dataset.eq ? await api('PUT', `/api/admin/equipes/${f.dataset.eq}`, corpo) : await api('POST', '/api/admin/equipes', corpo);
        toast(f.dataset.eq ? `${e.sigla} salvo.` : `${e.sigla} adicionado.`);
        await recarregar();
      } else if (f.id === 'form-adiar') {
        const r = await api('POST', '/api/admin/adiar', {
          modalidade: dados.modalidade, data: dados.data, aPartir: dados.aPartir,
          minutos: (parseInt(dados.minutos, 10) || 0) * (dados.sentido === 'antes' ? -1 : 1),
        });
        toast(`${r.alterados} jogo(s) com horário alterado.`);
        await recarregar();
      }
    } catch (err) { toast(err.message, true); }
  });

  // horário estimado anda com o relógio
  setInterval(() => { if (ui.tab === 'placar' && !ui.manual) renderPlacar(); }, 30000);
})();
