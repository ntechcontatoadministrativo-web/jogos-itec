// Site público: intro, início, página da modalidade e classificação geral.
(() => {
  const { esc, equipe, modalidade, icone, rotuloDia } = Itec;
  const app = document.getElementById('app');
  const ui = { dia: null, categoria: 'todas', aba: 'jogos' };

  /* ---------------- intro NTECH (prancha técnica) ---------------- */
  function intro() {
    const el = document.getElementById('intro');
    let visto = false;
    try { visto = sessionStorage.getItem('introVista') === '1'; } catch (e) {}
    if (visto) return;
    el.classList.remove('oculto');
    document.body.style.overflow = 'hidden';

    const caminho = document.getElementById('traj');
    const bola = document.getElementById('bola');
    const total = caminho.getTotalLength();
    const t0 = performance.now();
    let acabou = false;
    function quadro(t) {
      const p = Math.min(1, Math.max(0, (t - t0 - 1600) / 1400));
      const e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const pt = caminho.getPointAtLength(e * total);
      bola.setAttribute('transform', `translate(${pt.x} ${pt.y}) rotate(${e * 540})`);
      if (p < 1 && !acabou) requestAnimationFrame(quadro);
    }
    requestAnimationFrame(quadro);

    const timers = [
      setTimeout(() => el.classList.add('fase2'), 3300),
      setTimeout(fechar, 5600),
    ];
    function fechar() {
      if (acabou) return;
      acabou = true;
      timers.forEach(clearTimeout);
      el.classList.add('sai');
      document.body.style.overflow = '';
      try { sessionStorage.setItem('introVista', '1'); } catch (e) {}
      setTimeout(() => el.remove(), 700);
    }
    document.getElementById('pular').onclick = fechar;
    el.addEventListener('click', e => { if (el.classList.contains('fase2')) fechar(); });
  }

  /* ---------------- cartão de jogo ---------------- */
  function cartaoJogo(j, est, mostrarModalidade) {
    const mod = modalidade(j.modalidade) || {};
    const p = Regras.placar(j, mod.regras);
    const e = est[j.id] || {};
    const A = Itec.lado(j, 'a'), B = Itec.lado(j, 'b');
    const vivo = j.status === 'ao_vivo', fim = j.status === 'encerrado';
    const classe = vivo ? 'vivo' : fim ? 'fim' : 'ag';

    let hora;
    if (vivo) {
      hora = `<span class="rot">Ao vivo</span><span class="h">${p.simples ? 'Agora' : `Set ${p.numeroSet}`}</span><span class="rot">desde ${Regras.hora(e.inicio)}</span>`;
    } else if (fim) {
      hora = `<span class="rot">Final</span><span class="h">${Regras.hora(e.inicio)}</span>`;
    } else {
      const mudou = Math.abs(e.atraso) >= 1;
      hora = `<span class="rot">${mudou ? 'Estimado' : 'Horário'}</span><span class="h">${Regras.hora(e.inicio)}</span>` +
        (mudou ? `<span class="de">${j.hora}</span><span class="atraso">${e.atraso > 0 ? '+' : ''}${e.atraso} min</span>` : '');
    }

    const linha = (lado, eq) => {
      const sets = lado === 'a' ? p.setsA : p.setsB;
      const res = p.vencedor ? (p.vencedor === lado ? 'ganhou' : 'perdeu') : '';
      const parciais = p.simples ? (j.wo === lado ? '<span>W.O.</span>' : p.penaltis ? `<span class="${p.vencedor === lado ? 'v' : ''}" title="Pênaltis">(${p.penaltis[lado]})</span>` : '') : j.wo ? `<span>${j.wo === lado ? 'W.O.' : ''}</span>` :
        (vivo || fim) ? p.sets.map((s, i) => {
          const meu = s[lado], outro = s[lado === 'a' ? 'b' : 'a'];
          const atual = vivo && i === p.sets.length - 1;
          return `<span class="${atual ? 'atual' : meu > outro ? 'v' : ''}">${meu}</span>`;
        }).join('') : '';
      return `<div class="time ${res} ${eq.indefinido ? 'indef' : ''}">
        <img src="${esc(eq.logo)}" alt="" loading="lazy">
        <span class="nome">${esc(eq.sigla)}</span>
        <span class="parciais">${parciais}</span>
        <span class="sets-p">${vivo || fim ? sets : '–'}</span>
      </div>`;
    };

    const meta = [
      `<span class="status ${classe}">${vivo ? 'AO VIVO' : fim ? 'ENCERRADO' : 'AGENDADO'}</span>`,
      mostrarModalidade ? esc(mod.nome) : '',
      esc(j.categoria), esc(j.fase),
    ].filter(Boolean).join(' <span>·</span> ');

    const rodape = [];
    if (j.quadra) rodape.push(`📍 <b>${esc(j.quadra)}</b>`);
    if (p.penaltis) rodape.push(`Pênaltis <b>${p.penaltis.a}–${p.penaltis.b}</b>`);
    if (vivo) rodape.push(`Término previsto <b>~${Regras.hora(e.fim)}</b>`);
    else if (fim && !j.wo) rodape.push(`Duração <b>${Math.max(1, Math.round((e.fim - e.inicio) / 60000))} min</b>`);
    else if (!fim) rodape.push(`Término estimado <b>~${Regras.hora(e.fim)}</b>`);

    return `<article class="jogo ${classe}">
      <div class="jogo-hora">${hora}</div>
      <div class="jogo-corpo">
        <div class="jogo-meta">${meta}</div>
        <div class="times">${linha('a', A)}${linha('b', B)}</div>
        <div class="jogo-rodape">${rodape.join('')}</div>
      </div>
    </article>`;
  }

  /* ---------------- páginas ---------------- */
  function inicio(s, est) {
    const agora = Itec.agora();
    const hoje = Regras.dataLocal(agora);
    const ativas = new Set(s.modalidades.filter(m => m.ativa).map(m => m.id));
    const jogos = s.jogos.filter(j => ativas.has(j.modalidade));
    const vivos = jogos.filter(j => j.status === 'ao_vivo');
    const proximos = jogos.filter(j => j.status === 'agendado')
      .sort((x, y) => est[x.id].inicio - est[y.id].inicio).slice(0, 4);
    const ultimos = jogos.filter(j => j.status === 'encerrado')
      .sort((x, y) => (est[y.id].fim || 0) - (est[x.id].fim || 0)).slice(0, 3);
    const jogosHoje = jogos.filter(j => j.data === hoje).length;
    const ranking = rankingGeral(s);

    return `
      <section class="heroi">
        <img class="heroi-logo" src="/img/logo.png" alt="V Jogos do ITEC 2026">
        <div>
          <h1>V Jogos <span>do ITEC</span></h1>
          <p>${esc(s.evento.local)} · ${esc(s.evento.periodo)}<br>Placar ao vivo, horários atualizados e classificação dos centros acadêmicos.</p>
          <div class="chips">
            <span class="chip"><b>${s.equipes.length}</b> centros acadêmicos</span>
            <span class="chip"><b>${s.modalidades.length}</b> modalidades</span>
            <span class="chip"><b>${jogosHoje}</b> jogos hoje</span>
          </div>
        </div>
      </section>

      ${vivos.length ? `<section class="secao"><div class="secao-tit"><h2>Ao vivo agora</h2></div>
        <div class="jogos">${vivos.map(j => cartaoJogo(j, est, true)).join('')}</div></section>` : ''}

      ${(s.resultados || []).length ? `<section class="secao"><div class="secao-tit"><h2>Pódios</h2><a href="#/geral">Ver geral →</a></div>
        ${listaPodios(s, s.resultados.slice().sort((a, b) => (b.criado || 0) - (a.criado || 0)).slice(0, 4))}</section>` : ''}

      ${calendario(s, hoje)}

      <section class="secao">
        <div class="secao-tit"><h2>Modalidades</h2></div>
        <div class="mods">${s.modalidades.map(m => {
          const n = s.jogos.filter(j => j.modalidade === m.id).length;
          const datas = (m.datas || []).map(d => d.data);
          const passou = datas.length && datas.every(d => d < hoje);
          const quando = datas.length ? `📅 ${esc(Itec.datasModalidade(m, false))}` : '';
          const sub = m.ativa ? [quando, n ? `${n} jogos · acompanhar →` : 'Acompanhar →'].filter(Boolean).join('<br>')
            : [quando, passou ? '' : 'Placar em breve'].filter(Boolean).join('<br>');
          const inner = `${icone(m.icone || m.id)}<h3>${esc(m.nome)}</h3><small>${sub}</small>`;
          return m.ativa ? `<a class="mod ativa" href="#/m/${m.id}">${inner}</a>`
            : `<div class="mod breve" data-selo="${passou ? 'Realizado' : datas.includes(hoje) ? 'Hoje' : 'Em breve'}">${inner}</div>`;
        }).join('')}</div>
      </section>

      ${proximos.length ? `<section class="secao"><div class="secao-tit"><h2>Próximos jogos</h2></div>
        <div class="jogos">${proximos.map(j => cartaoJogo(j, est, true)).join('')}</div></section>` : ''}

      ${ultimos.length ? `<section class="secao"><div class="secao-tit"><h2>Últimos resultados</h2></div>
        <div class="jogos">${ultimos.map(j => cartaoJogo(j, est, true)).join('')}</div></section>` : ''}

      ${geralVisivel(s) ? `<section class="secao">
        <div class="secao-tit"><h2>Classificação geral</h2><a href="#/geral">Ver completa →</a></div>
        ${podio(ranking)}
      </section>` : ''}`;
  }

  // linha do tempo com o dia de cada modalidade
  function calendario(s, hoje) {
    const dias = {};
    for (const m of s.modalidades) {
      for (const d of m.datas || []) (dias[d.data] = dias[d.data] || []).push({ m, obs: d.obs });
    }
    const datas = Object.keys(dias).sort();
    if (!datas.length) return '';
    const proximo = datas.find(d => d >= hoje);
    return `<section class="secao">
      <div class="secao-tit"><h2>Calendário</h2></div>
      <div class="calendario">${datas.map(d => {
        const r = rotuloDia(d);
        const estado = d < hoje ? 'passou' : d === hoje ? 'hoje' : d === proximo ? 'proximo' : '';
        const selo = d < hoje ? 'Realizado' : d === hoje ? 'Hoje' : d === proximo ? 'Próximo' : '';
        return `<div class="dia-cal ${estado}">
          <div class="dc-data"><b>${d.slice(8, 10)}</b><span>${r.dia.split(' ')[1]}</span><small>${r.semana}</small></div>
          <div class="dc-mods">${selo ? `<span class="dc-selo">${selo}</span>` : ''}${dias[d].map(({ m, obs }) => {
            const conteudo = `${icone(m.icone || m.id)}<span>${esc(m.nome)}${obs ? `<small>${esc(obs)}</small>` : ''}</span>`;
            return m.ativa ? `<a class="dc-mod" href="#/m/${m.id}">${conteudo}</a>` : `<span class="dc-mod">${conteudo}</span>`;
          }).join('')}</div>
        </div>`;
      }).join('')}</div>
    </section>`;
  }

  const rankingGeral = s => Regras.classificacaoGeral(s);
  const MEDALHA = ['🥇', '🥈', '🥉', '4º'];

  // pódio de um resultado: degraus 2º-1º-3º com logos e pontos, 4º embaixo
  function cartaoPodio(s, res) {
    const pont = s.pontuacao || Regras.PONTOS_PADRAO;
    const m = modalidade(res.modalidade) || { id: '', nome: res.modalidade };
    const comPontos = geralVisivel(s);
    const pts = i => Regras.pontosDaColocacao(pont, i, res.coletiva);
    const membros = e => e.membros ? `<small>${e.membros.map(x => esc(equipe(x).sigla)).join(' + ')}</small>` : '';
    const degrau = i => {
      const id = res.colocacao[i];
      if (!id) return '<div class="pd-deg vazio-deg"></div>';
      const e = equipe(id);
      return `<div class="pd-deg pd-${i + 1}">
        <img src="${esc(e.logo)}" alt="">
        <b>${esc(e.sigla)}</b>${membros(e)}
        <div class="pd-bloco"><span>${i + 1}º</span>${comPontos ? `<em>${e.membros ? `+${Math.round(pts(i) / e.membros.length * 10) / 10} pts cada` : `+${pts(i)} pts`}</em>` : ''}</div>
      </div>`;
    };
    const quarto = res.colocacao[3] && equipe(res.colocacao[3]);
    return `<article class="pd-card">
      <header>${icone(m.icone || m.id)}<div><b>${esc(m.nome)}${res.categoria ? ' · ' + esc(res.categoria) : ''}</b>
        <span class="tag ${res.coletiva ? 'col' : ''}">${res.coletiva ? (comPontos ? `Coletiva · pontos ×${pont.multiplicadorColetiva || 2}` : 'Coletiva') : 'Individual'}</span></div></header>
      <div class="pd-podio">${degrau(1)}${degrau(0)}${degrau(2)}</div>
      ${quarto ? `<div class="pd-quarto"><span>4º</span><img src="${esc(quarto.logo)}" alt=""><b>${esc(quarto.sigla)}</b>${comPontos ? `<em>+${pts(3)} pts</em>` : '<em></em>'}</div>` : ''}
    </article>`;
  }

  const geralVisivel = s => !s.evento || s.evento.mostrarGeral !== false;

  const listaPodios = (s, lista) => `<div class="pd-lista">${lista.map(r => cartaoPodio(s, r)).join('')}</div>`;

  function podio(r) {
    const d = (e, n) => e ? `<div class="degrau p${n}">
      <img src="${esc(e.logo)}" alt="">
      <div class="bloco"><div class="n">${n}º</div><div class="s">${esc(e.sigla)}</div><div class="p">${e.pts} pts</div></div>
    </div>` : '<div></div>';
    return `<div class="podio">${d(r[1], 2)}${d(r[0], 1)}${d(r[2], 3)}</div>`;
  }

  // quem lidera em ouro/prata/bronze (pode haver empate)
  function lider(r, campo) {
    const max = Math.max(...r.map(e => e[campo]));
    return { max, quem: max > 0 ? r.filter(e => e[campo] === max) : [] };
  }

  // enquanto a geral não é divulgada, a página mostra só os pódios
  function soPodios(s) {
    const lista = (s.resultados || []).slice().sort((a, b) => (b.criado || 0) - (a.criado || 0));
    return `<section class="geral-cab">
        ${icone('taca', 'class="taca" style="color:var(--ouro)"')}
        <h1>Pódios</h1>
        <p>Resultado final de cada modalidade</p>
      </section>
      ${lista.length ? listaPodios(s, lista) : '<div class="vazio"><b>Nenhum pódio ainda</b>Os pódios aparecem aqui conforme cada modalidade termina.</div>'}`;
  }

  function geral(s) {
    if (!geralVisivel(s)) return soPodios(s);
    const r = rankingGeral(s);
    const pont = s.pontuacao || Regras.PONTOS_PADRAO;
    const mult = pont.multiplicadorColetiva || 2;
    const ordemMod = id => s.modalidades.findIndex(m => m.id === id);
    const resultados = (s.resultados || []).slice()
      .sort((a, b) => ordemMod(a.modalidade) - ordemMod(b.modalidade) || (a.categoria || '').localeCompare(b.categoria || ''));
    const temAjuste = r.some(e => e.ajuste);
    const medalhas = r.slice().sort((a, b) => b.ouro - a.ouro || b.prata - a.prata || b.bronze - a.bronze || b.pts - a.pts);

    const destaque = (campo, titulo, cls) => {
      const l = lider(r, campo);
      const icone = MEDALHA[['ouro', 'prata', 'bronze'].indexOf(campo)];
      const quem = l.quem.length
        ? `<span class="d-quem">${l.quem.map(e => `<span><img src="${esc(e.logo)}" alt="">${esc(e.sigla)}</span>`).join('')}</span>
           <span class="d-n">${l.max} ${l.max === 1 ? 'medalha' : 'medalhas'}</span>`
        : '<span class="d-quem d-vazio">Aguardando resultados</span>';
      return `<div class="destaque ${cls}"><span class="d-med">${icone}</span><span class="d-tit">${titulo}</span>${quem}</div>`;
    };

    const medalhasDaLinha = e => e.ouro + e.prata + e.bronze
      ? `<small>${e.ouro ? `🥇${e.ouro} ` : ''}${e.prata ? `🥈${e.prata} ` : ''}${e.bronze ? `🥉${e.bronze}` : ''}</small>` : '';

    const coletivas = s.modalidades.filter(m => m.coletiva).map(m => m.nome).join(', ');
    const individuais = s.modalidades.filter(m => !m.coletiva).map(m => m.nome).join(', ');

    return `
      <section class="geral-cab">
        ${icone('taca', 'class="taca" style="color:var(--ouro)"')}
        <h1>Classificação Geral</h1>
        <p>Soma de pontos de todas as modalidades</p>
        <a class="btn-tabela" href="/classificacao">Ver tabela oficial ›</a>
      </section>
      ${podio(r)}
      <div class="ranking">${r.map((e, i) => `
        <div class="linha-r ${i < 3 ? 'top' + (i + 1) : ''}">
          <span class="pos">${i + 1}</span>
          <img src="${esc(e.logo)}" alt="">
          <span class="sig">${esc(e.sigla)}${medalhasDaLinha(e)}</span>
          <span class="pt">${e.pts}</span>
        </div>`).join('')}
      </div>

      <section class="secao">
        <div class="secao-tit"><h2>Quadro de medalhas</h2></div>
        <div class="destaques">
          ${destaque('ouro', 'Mais ouros', 'd-ouro')}
          ${destaque('prata', 'Mais pratas', 'd-prata')}
          ${destaque('bronze', 'Mais bronzes', 'd-bronze')}
        </div>
        <div class="tabela-wrap" style="margin-top:12px"><table class="tabela">
          <thead><tr><th>#</th><th style="text-align:left">Centro acadêmico</th><th>🥇</th><th>🥈</th><th>🥉</th><th>4º</th><th>Medalhas</th></tr></thead>
          <tbody>${medalhas.map((e, i) => `<tr>
            <td>${i + 1}</td><td><div class="eq"><img class="escudo" src="${esc(e.logo)}" alt="">${esc(e.sigla)}</div></td>
            <td class="pts">${e.ouro}</td><td>${e.prata}</td><td>${e.bronze}</td><td>${e.quarto}</td><td><b>${e.ouro + e.prata + e.bronze}</b></td>
          </tr>`).join('')}</tbody>
        </table></div>
        <p class="nota">Ordenado por ouros; no empate, por pratas e depois bronzes.</p>
      </section>

      <section class="secao">
        <div class="secao-tit"><h2>Pódios</h2></div>
        ${resultados.length ? listaPodios(s, resultados)
          : '<div class="vazio"><b>Nenhum resultado lançado</b>Os pódios aparecem aqui conforme cada modalidade termina.</div>'}
      </section>

      <section class="secao">
        <div class="secao-tit"><h2>Como funciona a pontuação</h2></div>
        <div class="tabela-wrap"><table class="tabela pontuacao">
          <thead><tr><th>Colocação</th><th>Medalha</th><th>Individual</th><th>Coletiva (×${mult})</th></tr></thead>
          <tbody>${pont.colocacao.map((p, i) => `<tr>
            <td><b>${i + 1}º lugar</b></td><td>${['🥇 Ouro', '🥈 Prata', '🥉 Bronze'][i] || '—'}</td>
            <td class="pts">${p} pts</td><td class="pts">${p * mult} pts</td>
          </tr>`).join('')}</tbody>
        </table></div>
        <div class="regras-txt">
          <p><b>Modalidades coletivas valem o dobro.</b> Coletivas: ${esc(coletivas)}. Individuais: ${esc(individuais)}.</p>
          <p><b>Cada categoria pontua separado.</b> Se a modalidade tem masculino e feminino, os dois pódios somam pontos.</p>
          <p><b>Desempate na geral:</b> mais pontos → mais ouros → mais pratas → mais bronzes.</p>
          ${temAjuste ? '<p><b>Pontos anteriores:</b> a geral inclui os pontos já divulgados pela organização antes do site.</p>' : ''}
        </div>
      </section>`;
  }

  const chavesDe = (s, id) => (s.chaves || []).filter(c => !id || c.modalidade === id)
    .sort((a, b) => (a.categoria || '').localeCompare(b.categoria || ''));

  function blocoChaves(lista, comModalidade) {
    return lista.map(c => {
      const m = modalidade(c.modalidade) || { nome: c.modalidade };
      const tit = [comModalidade ? m.nome : '', c.categoria].filter(Boolean).join(' · ') || 'Chave';
      return `<section class="ch-bloco"><h3 class="tabela-tit">${esc(tit)}</h3>${Itec.chaveHtml(c)}</section>`;
    }).join('');
  }

  // sem modalidade escolhida mostra só os cartões; a chave abre ao clicar na modalidade
  function paginaChaves(s, id) {
    const m = id && modalidade(id);
    if (m) {
      const lista = chavesDe(s, id);
      return `<section class="cab-mod">
          ${icone(m.icone || m.id)}
          <div><h1>Chaves · ${esc(m.nome)}</h1><p><a href="#/chaves">‹ Todas as modalidades</a></p></div>
        </section>
        ${lista.length ? blocoChaves(lista, false) : '<div class="vazio"><b>Chave ainda não divulgada</b>Assim que a organização divulgar, a chave aparece aqui sozinha — não precisa recarregar a página.</div>'}`;
    }
    return `<section class="geral-cab">
        ${icone('taca', 'class="taca" style="color:var(--ouro)"')}
        <h1>Chaves</h1>
        <p>Escolha a modalidade para ver a chave</p>
      </section>
      <div class="mods" style="margin-top:18px">${s.modalidades.map(x => {
        const n = chavesDe(s, x.id).length;
        const inner = `${icone(x.icone || x.id)}<h3>${esc(x.nome)}</h3><small>${n ? (n > 1 ? n + ' chaves' : 'Ver chave') : 'Aguardando chave ›'}</small>`;
        // todas clicáveis: quem já estiver na página vê a chave aparecer assim que o admin divulgar
        return `<a class="mod ${n ? 'ativa' : ''}" href="#/chaves/${esc(x.id)}">${inner}</a>`;
      }).join('')}</div>`;
  }

  function tabelaModalidade(jogos, mod) {
    const grupos = {};
    for (const j of jogos) {
      if (j.status !== 'encerrado') continue;
      const p = Regras.placar(j, mod.regras);
      if (!p.vencedor) continue;
      const nomeGrupo = [j.categoria, /grupo|chave/i.test(j.fase || '') ? j.fase : ''].filter(Boolean).join(' · ') || 'Geral';
      const g = grupos[nomeGrupo] = grupos[nomeGrupo] || {};
      const linha = id => g[id] = g[id] || { id, j: 0, v: 0, d: 0, sp: 0, sc: 0, pp: 0, pc: 0, pts: 0 };
      const a = linha(j.a), b = linha(j.b);
      a.j++; b.j++;
      const tieBreak = p.setsA + p.setsB === p.maxSets;
      const [venc, perd] = p.vencedor === 'a' ? [a, b] : [b, a];
      venc.v++; perd.d++;
      venc.pts += tieBreak ? 2 : 3;
      perd.pts += tieBreak ? 1 : 0;
      a.sp += p.setsA; a.sc += p.setsB; b.sp += p.setsB; b.sc += p.setsA;
      p.sets.forEach(s => { a.pp += s.a; a.pc += s.b; b.pp += s.b; b.pc += s.a; });
    }
    const nomes = Object.keys(grupos).sort();
    if (!nomes.length) return `<div class="vazio"><b>Sem resultados ainda</b>A tabela aparece assim que o primeiro jogo terminar.</div>`;
    const razao = (x, y) => y ? x / y : x ? 99 : 0;
    return nomes.map(n => {
      const linhas = Object.values(grupos[n]).sort((x, y) =>
        y.pts - x.pts || y.v - x.v || razao(y.sp, y.sc) - razao(x.sp, x.sc) || razao(y.pp, y.pc) - razao(x.pp, x.pc));
      return `<h3 class="tabela-tit">${esc(n)}</h3>
      <div class="tabela-wrap"><table class="tabela">
        <thead><tr><th>#</th><th style="text-align:left">Equipe</th><th>Pts</th><th>J</th><th>V</th><th>D</th><th>Sets</th><th>Pontos</th></tr></thead>
        <tbody>${linhas.map((l, i) => {
          const e = equipe(l.id);
          return `<tr><td>${i + 1}</td><td><div class="eq"><img class="escudo" src="${esc(e.logo)}" alt="">${esc(e.sigla)}</div></td>
            <td class="pts">${l.pts}</td><td>${l.j}</td><td>${l.v}</td><td>${l.d}</td><td>${l.sp}:${l.sc}</td><td>${l.pp}:${l.pc}</td></tr>`;
        }).join('')}</tbody>
      </table></div>`;
    }).join('') + `<p style="color:var(--suave);font-size:13px;margin-top:10px">Vitória 2×0 = 3 pts · vitória no tie-break = 2 pts · derrota no tie-break = 1 pt.</p>`;
  }

  function paginaModalidade(s, est, id) {
    const mod = modalidade(id);
    if (!mod) return `<div class="vazio" style="margin-top:24px"><b>Modalidade não encontrada</b><a href="#/">Voltar ao início</a></div>`;
    const jogos = s.jogos.filter(j => j.modalidade === id);
    const datas = [...new Set(jogos.map(j => j.data))].sort();
    const hoje = Regras.dataLocal(Itec.agora());
    if (!ui.dia || !datas.includes(ui.dia)) {
      ui.dia = datas.includes(hoje) ? hoje : (datas.find(d => d > hoje) || datas[datas.length - 1] || null);
    }
    const categorias = [...new Set(jogos.map(j => j.categoria).filter(Boolean))].sort();
    if (ui.categoria !== 'todas' && !categorias.includes(ui.categoria)) ui.categoria = 'todas';

    const doDia = jogos.filter(j => j.data === ui.dia && (ui.categoria === 'todas' || j.categoria === ui.categoria))
      .sort((x, y) => {
        const ordem = { ao_vivo: 0, agendado: 1, encerrado: 2 };
        return ordem[x.status] - ordem[y.status] || est[x.id].inicio - est[y.id].inicio;
      });
    const vivos = jogos.filter(j => j.status === 'ao_vivo').length;

    const filtroCat = categorias.length > 1 ? `<div class="abas">${['todas', ...categorias].map(c =>
      `<button class="aba ${ui.categoria === c ? 'ativa' : ''}" data-cat="${esc(c)}">${c === 'todas' ? 'Todas' : esc(c)}</button>`).join('')}</div>` : '';

    let corpo;
    if (ui.aba === 'chaves') {
      const lista = chavesDe(s, id);
      corpo = lista.length ? blocoChaves(lista, false) : `<div class="vazio"><b>Chave ainda não divulgada</b>Aparece aqui assim que a organização montar a chave.</div>`;
    } else if (ui.aba === 'podio') {
      const res = (s.resultados || []).filter(r => r.modalidade === id);
      corpo = res.length ? listaPodios(s, res) : `<div class="vazio"><b>Pódio ainda não definido</b>Aparece aqui assim que a organização lançar o resultado final.</div>`;
    } else if (ui.aba === 'tabela') {
      corpo = filtroCat + tabelaModalidade(jogos.filter(j => ui.categoria === 'todas' || j.categoria === ui.categoria), mod);
    } else if (!jogos.length) {
      corpo = `<div class="vazio"><b>Tabela em montagem</b>Os jogos aparecem aqui assim que a organização divulgar os horários.</div>`;
    } else {
      corpo = `<div class="abas dias">${datas.map(d => {
          const r = rotuloDia(d);
          return `<button class="aba ${d === ui.dia ? 'ativa' : ''}" data-dia="${d}">${d === hoje ? 'Hoje' : r.semana}<small>${r.dia}</small></button>`;
        }).join('')}</div>
        <div class="barra">${filtroCat}</div>
        ${doDia.length ? `<div class="jogos">${doDia.map(j => cartaoJogo(j, est, false)).join('')}</div>`
          : `<div class="vazio"><b>Nenhum jogo</b>Sem jogos nesse filtro.</div>`}
        <p style="color:var(--suave);font-size:13px;margin-top:14px">⏱ Os horários são recalculados automaticamente: se um jogo atrasa, os seguintes da mesma quadra são empurrados.</p>`;
    }

    return `
      <section class="cab-mod">
        ${icone(mod.icone || mod.id)}
        <div>
          <h1>${esc(mod.nome)}</h1>
          <p>${[(mod.datas || []).length ? `📅 ${esc(Itec.datasModalidade(mod))}` : '', esc(Itec.descricaoRegras(mod))].filter(Boolean).join(' · ')}${vivos ? ` · <span class="status vivo">${vivos} AO VIVO</span>` : ''}</p>
        </div>
      </section>
      <div class="barra">
        <div class="abas">
          <button class="aba ${ui.aba === 'jogos' ? 'ativa' : ''}" data-aba="jogos">Jogos</button>
          <button class="aba ${ui.aba === 'chaves' ? 'ativa' : ''}" data-aba="chaves">Chaves</button>
          <button class="aba ${ui.aba === 'tabela' ? 'ativa' : ''}" data-aba="tabela">Tabela</button>
          <button class="aba ${ui.aba === 'podio' ? 'ativa' : ''}" data-aba="podio">Pódio</button>
        </div>
      </div>
      ${corpo}`;
  }

  /* ---------------- roteamento ---------------- */
  function rotaAtual() {
    const partes = location.hash.replace(/^#\/?/, '').split('/');
    return { nome: partes[0] || '', arg: partes[1] };
  }

  function render() {
    const s = Itec.estado;
    if (!s) return;
    const r = rotaAtual();
    const est = Regras.estimar(s.jogos, s.modalidades, Itec.agora());
    const linkGeral = document.querySelector('.nav a[data-r="geral"]');
    if (linkGeral) linkGeral.innerHTML = geralVisivel(s) ? '<span class="so-largo">Classificação&nbsp;</span>Geral' : 'Pódios';
    document.querySelectorAll('.nav a').forEach(a => {
      a.classList.toggle('ativo', a.dataset.r === r.nome);
    });
    if (r.nome === 'geral') app.innerHTML = geral(s);
    else if (r.nome === 'chaves') app.innerHTML = paginaChaves(s, r.arg);
    else if (r.nome === 'm') app.innerHTML = paginaModalidade(s, est, r.arg);
    else app.innerHTML = inicio(s, est);
  }

  app.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.dia) ui.dia = b.dataset.dia;
    else if (b.dataset.cat) ui.categoria = b.dataset.cat;
    else if (b.dataset.aba) ui.aba = b.dataset.aba;
    else return;
    render();
  });

  window.addEventListener('hashchange', () => { ui.aba = 'jogos'; render(); window.scrollTo(0, 0); });
  setInterval(render, 30000); // estimativas andam com o relógio
  intro();
  Itec.aoMudar(render);
  Itec.sincronizar();
})();
