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
    ui.jogo = null; ui.editando = null; ui.manual = false;
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
      return `<button class="lado ${l}" data-ponto="${l}" ${encerrado || j.setsManual || !temSets ? 'disabled' : ''}>
        <span class="mais">+1</span>
        <img src="${esc(eq.logo)}" alt="">
        <span class="sig">${esc(eq.sigla)}</span>
        <span class="num">${p.atual[l]}</span>
        <span class="sets">Sets ${l === 'a' ? p.setsA : p.setsB}</span>
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
        : `Set <b>${p.numeroSet}</b> de até ${p.maxSets} · vai a <b>${p.alvoAtual}</b> · começou ${Regras.hora(e.inicio)}`}</div>
      ${fechados.length ? `<div class="hist">${fechados.map((x, i) => `<span>${i + 1}º set: ${x.a}–${x.b}</span>`).join('')}</div>` : ''}
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
      linhas += `<div class="set-l"><span>${i + 1}º set</span>
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
    painel.innerHTML = `<h2 class="tit" id="tit-form"></h2><form class="cartao" id="form-jogo"></form>
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
    const lista = s.equipes.map((e, i) => ({ ...e, pts: +s.geral[e.id] || 0, i })).sort((x, y) => y.pts - x.pts || x.i - y.i);
    painel.innerHTML = `<h2 class="tit">Classificação geral</h2>
      <form class="cartao" id="form-geral">
        ${lista.map(e => `<div class="geral-l"><img src="${esc(e.logo)}" alt=""><b>${esc(e.sigla)}</b>
          <input type="number" step="0.5" inputmode="decimal" name="${e.id}" value="${e.pts}"></div>`).join('')}
        <div class="acoes" style="justify-content:flex-start"><button class="btn">Salvar classificação</button></div>
        <p class="dica">A ordem no site é recalculada pela pontuação.</p>
      </form>`;
  }

  /* ---------- AJUSTES ---------- */
  function renderAjustes() {
    const s = Itec.estado;
    painel.innerHTML = `<h2 class="tit">Modalidades</h2>
      <div class="lista">${s.modalidades.map(m => `
        <form class="cartao" data-mod="${m.id}">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <b style="font-size:18px">${esc(m.nome)}</b>
            <label style="display:flex;align-items:center;gap:6px;margin-left:auto"><input type="checkbox" name="ativa" ${m.ativa ? 'checked' : ''} style="width:auto"> Visível no site</label>
          </div>
          <div class="linha-form">
            <label style="grid-column:1/-1">Datas (separe por vírgula; texto depois da data vira observação)<input name="datas" value="${esc((m.datas || []).map(d => Itec.dataCurta(d.data) + (d.obs ? ' ' + d.obs : '')).join(', '))}" placeholder="28/11 Masculino, 05/12"></label>
            <label>Duração média do jogo (min)<input type="number" name="duracao" min="5" value="${m.duracao}"></label>
            <label>Intervalo entre jogos (min)<input type="number" name="intervalo" min="0" value="${m.intervalo || 0}"></label>
            ${m.regras ? `
            <label>Sets para vencer<input type="number" name="setsParaVencer" min="1" max="3" value="${m.regras.setsParaVencer}"></label>
            <label>Pontos por set<input type="number" name="pontosSet" min="5" value="${m.regras.pontosSet}"></label>
            <label>Pontos do tie-break<input type="number" name="pontosDesempate" min="5" value="${m.regras.pontosDesempate}"></label>` : ''}
          </div>
          <div class="acoes" style="justify-content:flex-start"><button class="btn peq">Salvar</button></div>
        </form>`).join('')}
      </div>
      <p class="dica" style="margin-top:16px">Placar ponto a ponto (sets) está disponível para vôlei e vôlei de areia. <button class="btn sec peq" data-sair>Sair do painel</button></p>`;
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
    if (d.sair !== undefined) sair();
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
      } else if (f.id === 'form-geral') {
        const s = Itec.estado;
        s.geral = await api('PUT', '/api/admin/geral', dados);
        toast('Classificação salva.');
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
          ativa: f.ativa.checked, duracao: dados.duracao, intervalo: dados.intervalo,
          datas: (dados.datas || '').split(',').map(x => x.trim()).filter(Boolean).map(x => {
            const m = x.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*(.*)$/);
            if (!m) throw new Error(`Data não entendida: "${x}". Use dd/mm.`);
            return { data: `${m[3] || 2026}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, obs: m[4] };
          }),
        };
        if (dados.setsParaVencer !== undefined) corpo.regras = { setsParaVencer: dados.setsParaVencer, pontosSet: dados.pontosSet, pontosDesempate: dados.pontosDesempate };
        const m = await api('PUT', `/api/admin/modalidades/${f.dataset.mod}`, corpo);
        const s = Itec.estado;
        s.modalidades = s.modalidades.map(x => x.id === m.id ? m : x);
        toast(`${m.nome} salvo.`);
      }
    } catch (err) { toast(err.message, true); }
  });

  // horário estimado anda com o relógio
  setInterval(() => { if (ui.tab === 'placar' && !ui.manual) renderPlacar(); }, 30000);
})();
