// Regras compartilhadas entre servidor (Node) e navegador: placar por sets e estimativa de horários.
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Regras = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  const FUSO = -3 * 60; // Belém, UTC-3 sem horário de verão
  const MIN = 60000;

  // "2026-11-20" + "09:30" -> timestamp (ms), sempre no horário de Belém
  function paraMs(data, hora) {
    return Date.parse(`${data}T${hora || '00:00'}:00-03:00`);
  }
  function hora(ms) {
    return new Date(ms + FUSO * MIN).toISOString().slice(11, 16);
  }
  function dataLocal(ms) {
    return new Date(ms + FUSO * MIN).toISOString().slice(0, 10);
  }

  // Reconstrói os sets a partir da sequência de pontos ("ABBA...")
  function placar(jogo, regras) {
    // modalidade sem sets (futsal, queimada...): placar corrido, vencedor só quando o admin encerra
    if (!regras) {
      const m = Array.isArray(jogo.setsManual) && jogo.setsManual[0];
      const pts = String(jogo.pontos || '');
      const atual = m ? { a: +m.a || 0, b: +m.b || 0 } : { a: pts.split('A').length - 1, b: pts.split('B').length - 1 };
      let vencedor = jogo.status === 'encerrado' && atual.a !== atual.b ? (atual.a > atual.b ? 'a' : 'b') : null;
      if (jogo.wo === 'a' || jogo.wo === 'b') vencedor = jogo.wo;
      return { simples: true, sets: [atual], setsA: atual.a, setsB: atual.b, vencedor, atual, numeroSet: 1, alvoAtual: Infinity, maxSets: 1, regras: null };
    }
    const r = Object.assign({ setsParaVencer: 2, pontosSet: 25, pontosDesempate: 15 }, regras || {});
    const maxSets = r.setsParaVencer * 2 - 1;
    let sets, setsA = 0, setsB = 0, vencedor = null;

    if (Array.isArray(jogo.setsManual) && jogo.setsManual.length) {
      sets = jogo.setsManual.map(s => ({ a: +s.a || 0, b: +s.b || 0 }));
      sets.forEach(s => { if (s.a > s.b) setsA++; else if (s.b > s.a) setsB++; });
      if (setsA >= r.setsParaVencer) vencedor = 'a';
      else if (setsB >= r.setsParaVencer) vencedor = 'b';
    } else {
      sets = [{ a: 0, b: 0 }];
      for (const p of String(jogo.pontos || '')) {
        if (vencedor) break;
        const s = sets[sets.length - 1];
        if (p === 'A') s.a++; else if (p === 'B') s.b++; else continue;
        const alvo = sets.length === maxSets ? r.pontosDesempate : r.pontosSet;
        if (Math.max(s.a, s.b) >= alvo && Math.abs(s.a - s.b) >= 2) {
          if (s.a > s.b) setsA++; else setsB++;
          s.fechado = true;
          if (setsA >= r.setsParaVencer) vencedor = 'a';
          else if (setsB >= r.setsParaVencer) vencedor = 'b';
          else sets.push({ a: 0, b: 0 });
        }
      }
    }
    if (jogo.wo === 'a' || jogo.wo === 'b') vencedor = jogo.wo;
    const atual = sets[sets.length - 1];
    const alvoAtual = sets.length === maxSets ? r.pontosDesempate : r.pontosSet;
    return { sets, setsA, setsB, vencedor, atual, numeroSet: sets.length, alvoAtual, maxSets, regras: r };
  }

  // Calcula início/término estimados de cada jogo, empurrando os seguintes quando um atrasa.
  // Jogos são encadeados por modalidade + dia + quadra.
  function estimar(jogos, modalidades, agora) {
    const porId = {};
    const filas = {};
    for (const j of jogos) {
      const chave = `${j.modalidade}|${j.data}|${(j.quadra || '').trim().toLowerCase()}`;
      (filas[chave] = filas[chave] || []).push(j);
    }
    for (const fila of Object.values(filas)) {
      fila.sort((x, y) => (x.hora || '').localeCompare(y.hora || '') || (x.criado || 0) - (y.criado || 0));
      let cursor = -Infinity;
      for (const j of fila) {
        const mod = modalidades.find(m => m.id === j.modalidade) || {};
        const dur = (+j.duracao || +mod.duracao || 60) * MIN;
        const intervalo = (+mod.intervalo || 0) * MIN;
        const previsto = paraMs(j.data, j.hora);
        let inicio, fim, fimEstimado = false;

        if (j.status === 'encerrado') {
          inicio = j.inicio || Math.max(previsto, cursor);
          fim = j.fim || inicio + dur;
        } else if (j.status === 'ao_vivo') {
          inicio = j.inicio || agora;
          const p = placar(j, mod.regras);
          const r = p.regras;
          if (p.simples) {
            fim = Math.max(inicio + dur, agora + 5 * MIN);
            fimEstimado = true;
            cursor = fim + intervalo;
            porId[j.id] = { previsto, inicio, fim, fimEstimado, atraso: Math.round((inicio - previsto) / MIN) };
            continue;
          }
          const frac = Math.min(0.95, Math.max(p.atual.a, p.atual.b) / p.alvoAtual);
          const feitos = p.setsA + p.setsB + frac;
          const decorrido = agora - inicio;
          if (feitos >= 0.5 && decorrido > 0) {
            const porSet = decorrido / feitos;
            const faltam = Math.max(0.2, r.setsParaVencer - Math.max(p.setsA, p.setsB) - frac + (p.setsA === p.setsB ? 0.5 : 0.3));
            fim = Math.max(agora + 3 * MIN, agora + faltam * porSet);
          } else {
            fim = Math.max(inicio + dur, agora + 5 * MIN);
          }
          fimEstimado = true;
        } else {
          inicio = Math.max(previsto, cursor);
          if (inicio < agora) inicio = agora; // horário passou e o jogo não começou: atrasa
          fim = inicio + dur;
          fimEstimado = true;
        }
        cursor = fim + intervalo;
        porId[j.id] = {
          previsto, inicio, fim, fimEstimado,
          atraso: Math.round((inicio - previsto) / MIN),
        };
      }
    }
    return porId;
  }

  const PONTOS_PADRAO = { colocacao: [10, 7, 5, 4], multiplicadorColetiva: 2 };

  function pontosDaColocacao(pontuacao, posicao, coletiva) {
    const p = pontuacao || PONTOS_PADRAO;
    const base = p.colocacao[posicao] || 0;
    return coletiva ? base * (p.multiplicadorColetiva || 1) : base;
  }

  // Soma pontos e medalhas de todos os resultados lançados + ajuste manual de cada CA.
  // Desempate: pontos, ouros, pratas, bronzes.
  function classificacaoGeral(estado) {
    const linhas = {};
    const conjuntos = {};
    estado.equipes.forEach((e, ordem) => {
      if (e.membros) { conjuntos[e.id] = e.membros; return; }
      linhas[e.id] = { ...e, ordem, ajuste: +((estado.ajuste || {})[e.id]) || 0, pontosResultados: 0, ouro: 0, prata: 0, bronze: 0, quarto: 0 };
    });
    for (const r of estado.resultados || []) {
      (r.colocacao || []).forEach((id, i) => {
        // time conjunto: os pontos são divididos entre os CAs membros (como na tabela oficial); a medalha conta para cada um
        const membros = conjuntos[id] || [id];
        for (const membro of membros) {
          const l = linhas[membro];
          if (!l) continue;
          l.pontosResultados += pontosDaColocacao(estado.pontuacao, i, r.coletiva) / membros.length;
          l[['ouro', 'prata', 'bronze', 'quarto'][i]]++;
        }
      });
    }
    return Object.values(linhas)
      .map(l => ({ ...l, pts: Math.round((l.pontosResultados + l.ajuste) * 10) / 10 }))
      .sort((a, b) => b.pts - a.pts || b.ouro - a.ouro || b.prata - a.prata || b.bronze - a.bronze || a.ordem - b.ordem);
  }

  return { paraMs, hora, dataLocal, placar, estimar, MIN, PONTOS_PADRAO, pontosDaColocacao, classificacaoGeral };
});
