// Estado ao vivo, ícones e utilitários usados pelo site público e pelo painel admin.
const Itec = (() => {
  let estado = null;
  let difRelogio = 0; // diferença entre o relógio do servidor e o do aparelho
  const ouvintes = [];

  const agora = () => Date.now() + difRelogio;

  async function sincronizar() {
    let falhas = 0;
    for (;;) {
      try {
        const r = await fetch('/api/estado' + (estado ? `?v=${estado.versao}` : ''), { cache: 'no-store' });
        if (!r.ok) throw new Error(r.status);
        const d = await r.json();
        difRelogio = d.agora - Date.now();
        if (!d.igual) { estado = d; ouvintes.forEach(f => f(estado)); }
        falhas = 0;
        mostraAviso(false);
      } catch (e) {
        falhas++;
        if (falhas > 1) mostraAviso(true);
        await new Promise(ok => setTimeout(ok, Math.min(10000, 1000 * falhas)));
      }
    }
  }

  let aviso;
  function mostraAviso(sim) {
    if (!aviso) {
      aviso = document.createElement('div');
      aviso.className = 'aviso-con oculto';
      aviso.textContent = 'Reconectando…';
      document.body.appendChild(aviso);
    }
    aviso.classList.toggle('oculto', !sim);
  }

  function aoMudar(f) { ouvintes.push(f); if (estado) f(estado); }
  function definir(novo) { estado = novo; ouvintes.forEach(f => f(estado)); }

  const equipe = id => (estado && estado.equipes.find(e => e.id === id)) || { id, sigla: '?', logo: '' };
  const modalidade = id => (estado && estado.modalidades.find(m => m.id === id)) || null;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function rotuloDia(data) {
    const d = new Date(data + 'T12:00:00Z');
    return { semana: SEMANA[d.getUTCDay()], dia: `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}` };
  }

  const ICONES = {
    volei: '<circle cx="24" cy="24" r="19"/><path d="M24 5c-3 8-2 16 4 22M43 24c-8 0-15 3-19 10M10 37c6-4 11-11 12-19M24 5c6 3 11 9 13 16M5.5 21c7-2 14 0 19 5M14 41c2-7 8-12 14-14"/>',
    'volei-areia': '<circle cx="20" cy="20" r="13"/><path d="M20 7c-2 5-1 10 3 14M33 20c-5 0-10 2-13 6M11 30c4-3 7-7 8-12"/><path d="M4 41c5-3 10-3 15 0s10 3 15 0 7-2 10-1"/>',
    futsal: '<circle cx="24" cy="24" r="19"/><path d="M24 15l8 6-3 10H19l-3-10z"/><path d="M24 15V6M32 21l9-3M29 31l5 8M19 31l-5 8M16 21l-9-3"/>',
    basquete: '<circle cx="24" cy="24" r="19"/><path d="M5 24h38M24 5v38M10.5 10.5c5 5 5 22 0 27M37.5 10.5c-5 5-5 22 0 27"/>',
    handebol: '<circle cx="31" cy="15" r="9"/><path d="M27 8c3 3 4 8 3 13M39 13c-4 0-8 2-10 6"/><path d="M6 42l8-12 6 3 4-9M14 30l-4-7 8-4"/>',
    'tenis-mesa': '<circle cx="19" cy="19" r="12"/><path d="M27.5 27.5L38 38a3 3 0 0 1-4 4L23.5 31.5"/><circle cx="38" cy="11" r="4"/>',
    xadrez: '<path d="M15 42h18M17 37h14l-2-8h-10z"/><path d="M19 29c-2-5 0-9 3-12-3-1-4-4-2-7 4-3 10-2 12 4 2 5 0 10-3 15"/><circle cx="25" cy="13" r="1" fill="currentColor"/>',
    fifa: '<path d="M14 15h20a9 9 0 0 1 9 9v5a6 6 0 0 1-11 3l-2-3H18l-2 3a6 6 0 0 1-11-3v-5a9 9 0 0 1 9-9z"/><path d="M14 21v6M11 24h6"/><circle cx="32" cy="22" r="1.5" fill="currentColor"/><circle cx="36" cy="26" r="1.5" fill="currentColor"/>',
    taca: '<path d="M15 6h18v10a9 9 0 0 1-18 0z"/><path d="M15 9H8c0 6 3 9 7 9M33 9h7c0 6-3 9-7 9M24 25v8M17 42h14M19 33h10l2 9H17z"/>',
  };
  function icone(nome, extra = '') {
    return `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" ${extra}>${ICONES[nome] || ICONES.taca}</svg>`;
  }

  function descricaoRegras(m) {
    if (!m || !m.regras) return '';
    const r = m.regras;
    const total = r.setsParaVencer * 2 - 1;
    return `Melhor de ${total} sets · ${r.pontosSet} pontos${total > 1 ? ` · desempate a ${r.pontosDesempate}` : ''}`;
  }

  return { sincronizar, aoMudar, definir, get estado() { return estado; }, agora, equipe, modalidade, esc, rotuloDia, icone, descricaoRegras };
})();
