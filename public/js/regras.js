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

  return { paraMs, hora, dataLocal, placar, estimar, MIN };
});
