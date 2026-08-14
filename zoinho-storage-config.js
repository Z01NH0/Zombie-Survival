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
  ]
});
