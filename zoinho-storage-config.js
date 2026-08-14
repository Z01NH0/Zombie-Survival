/*
 * ZOINHO Storage Bridge v2 - Dead Signal / Zombie Survival
 *
 * O save persistente atual do jogo fica em uma única chave: dead_signal_nightfall_v1.
 * Como progresso e preferências vivem no mesmo objeto, a chave inteira é sincronizada
 * para preservar compatibilidade com o carregamento original do jogo.
 */
window.ZOINHO_STORAGE_CONFIG = Object.freeze({
  gameId: 'dead-signal',
  displayName: 'Dead Signal',
  bridgeVersion: 2,
  portalOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ],
  allowOriginApproval: true,
  saveKeys: [
    'dead_signal_nightfall_v1'
  ],

  // Critério semântico de conflito. Núcleos podem diminuir quando o jogador compra
  // upgrades, então usamos núcleos atuais + custo acumulado dos níveis permanentes.
  // Esse total é monotônico no fluxo normal do jogo e impede um save-default cores=0
  // de vencer progresso real apenas por ter timestamp mais novo.
  progressScore(storage) {
    try {
      const raw = storage?.dead_signal_nightfall_v1;
      if (typeof raw !== 'string') return null;
      const data = JSON.parse(raw);
      let score = Math.max(0, Number(data?.cores) || 0);
      const meta = data?.meta && typeof data.meta === 'object' ? data.meta : {};
      for (const key of ['vitality', 'power', 'mobility', 'armor', 'focus', 'fortune']) {
        const level = Math.max(0, Math.min(10, Math.floor(Number(meta[key]) || 0)));
        // Custos: 3, 6, 9... => soma até o nível L = 3*L*(L+1)/2.
        score += 3 * level * (level + 1) / 2;
      }
      return Number.isFinite(score) ? score : null;
    } catch {
      return null;
    }
  }
});
