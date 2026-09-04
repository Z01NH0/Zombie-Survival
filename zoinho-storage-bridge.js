(() => {
  'use strict';

  const PROTOCOL = 'zoinho-storage-v2';
  const BRIDGE_VERSION = 2;
  const READY_RETRY_MS = 900;
  const READY_RETRY_LIMIT = 120;
  const BOOT_TIMEOUT_MS = 18000;
  const ACCOUNT_BACKUP_LIMIT = 3;
  const cfg = window.ZOINHO_STORAGE_CONFIG;

  if (!cfg || !cfg.gameId || !Array.isArray(cfg.portalOrigins) || !Array.isArray(cfg.saveKeys)) {
    console.warn('[ZOINHO Bridge] Configuração ausente ou inválida; bridge desativada.');
    releaseBootGate();
    return;
  }

  const params = new URLSearchParams(location.search);
  const enabled = params.get('zoinhoBridge') === '1';
  const autoSyncRequested = params.get('zoinhoAutoSync') === '1';
  const launchPortalOrigin = normalizeOrigin(params.get('zoinhoPortalOrigin') || '');
  const referrerOrigin = normalizeOrigin(document.referrer || '');
  const META_KEY = `zoinhoBridgeMeta:${cfg.gameId}`;
  const APPROVED_ORIGINS_KEY = `zoinhoBridgeApprovedOrigins:${cfg.gameId}`;
  const ACCOUNT_BACKUPS_KEY = `zoinhoBridgeAccountBackups:${cfg.gameId}`;
  const RESTORED_KEY = `zoinhoBridgeRestored:${cfg.gameId}`;
  const ACCOUNT_SWITCH_KEY = `zoinhoBridgeAccountSwitch:${cfg.gameId}`;
  const staticTrustedOrigins = new Set(cfg.portalOrigins.map(normalizeOrigin).filter(Boolean));

  let portalWindow = null;
  let portalOrigin = null;
  let portalUserId = null;
  let sessionNonce = null;
  let pushTimer = 0;
  let readyTimer = 0;
  let bootTimer = 0;
  let readyAttempts = 0;
  let state = enabled ? 'waiting' : 'disabled';
  let lastAckAt = null;
  let initialSyncResolved = false;
  let initialSyncCompleted = false;
  let initialSnapshotInFlight = false;
  let queuedPushReason = null;
  let offlineMode = false;
  let portalSupportsBootAck = false;

  const bootLocalState = Object.freeze({
    hadSave: cfg.saveKeys.some(key => localStorage.getItem(key) !== null),
    metaUpdatedAt: readMeta().updatedAt || null,
    ownerUserId: readMeta().ownerUserId || null,
    storage: Object.freeze(collectStorageValues())
  });

  function normalizeOrigin(value) {
    try {
      return new URL(String(value)).origin;
    } catch {
      return String(value || '').replace(/\/$/, '');
    }
  }

  function readJsonStorage(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed == null ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function writeJsonStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn('[ZOINHO Bridge] Não foi possível gravar metadata local.', error);
      return false;
    }
  }

  function readMeta() {
    const parsed = readJsonStorage(META_KEY, {});
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  }

  function writeMeta(patch = {}) {
    const current = readMeta();
    const next = { ...current, ...patch };
    for (const key of Object.keys(next)) {
      if (next[key] == null || next[key] === '') delete next[key];
    }
    return writeJsonStorage(META_KEY, next);
  }

  function collectStorageValues() {
    const storage = {};
    for (const key of cfg.saveKeys) {
      const value = localStorage.getItem(key);
      if (value !== null) storage[key] = value;
    }
    return storage;
  }

  function hasLocalSave() {
    return cfg.saveKeys.some(key => localStorage.getItem(key) !== null);
  }

  function markLocalSave() {
    const updatedAt = new Date().toISOString();
    const ownerUserId = portalUserId || readMeta().ownerUserId || null;
    writeMeta({ updatedAt, ownerUserId });
    return updatedAt;
  }

  function collectSnapshot() {
    return {
      gameId: cfg.gameId,
      storage: collectStorageValues(),
      clientUpdatedAt: readMeta().updatedAt || null
    };
  }

  function snapshotsEqual(remoteStorage) {
    if (!remoteStorage || typeof remoteStorage !== 'object') return false;
    for (const key of cfg.saveKeys) {
      const remote = Object.prototype.hasOwnProperty.call(remoteStorage, key) ? remoteStorage[key] : null;
      const local = localStorage.getItem(key);
      if (remote !== local) return false;
    }
    return true;
  }

  function comparePersistentProgress(remoteStorage) {
    if (typeof cfg.progressScore !== 'function') return 0;
    try {
      const localStorageForComparison = !initialSyncResolved ? bootLocalState.storage : collectStorageValues();
      const localScore = Number(cfg.progressScore(localStorageForComparison));
      const remoteScore = Number(cfg.progressScore(remoteStorage));
      if (!Number.isFinite(localScore) || !Number.isFinite(remoteScore) || localScore === remoteScore) return 0;
      return remoteScore > localScore ? 1 : -1;
    } catch (error) {
      console.warn('[ZOINHO Bridge] Falha ao comparar progresso semântico; usando timestamps.', error);
      return 0;
    }
  }

  function shouldApplyRemote(payload) {
    if (!payload || !payload.storage || typeof payload.storage !== 'object') return false;
    if (!hasLocalSave()) return true;

    // Se a aba abriu sem save e o jogo criou defaults durante o bootstrap, o Cloud Save
    // legítimo deve ganhar. A captura bootLocalState acontece antes do script principal.
    if (!initialSyncResolved && !bootLocalState.hadSave) return true;

    const progressComparison = comparePersistentProgress(payload.storage);
    if (progressComparison !== 0) return progressComparison > 0;

    const localTime = Date.parse((!initialSyncResolved ? bootLocalState.metaUpdatedAt : readMeta().updatedAt) || '');
    const remoteTime = Date.parse(payload.clientUpdatedAt || payload.portalReceivedAt || '');
    if (!Number.isFinite(remoteTime)) return false;

    // Save legado sem metadata é preservado na primeira adoção do Cloud Save.
    if (!Number.isFinite(localTime)) return false;
    return remoteTime > localTime;
  }

  function applySnapshot(payload) {
    if (!payload || payload.gameId !== cfg.gameId || !payload.storage || typeof payload.storage !== 'object') return false;
    if (snapshotsEqual(payload.storage)) return false;

    setBootStage('applying', 'Aplicando progresso...', 'Preparando seu save neste dispositivo.');
    let wrote = false;
    for (const key of cfg.saveKeys) {
      if (!Object.prototype.hasOwnProperty.call(payload.storage, key)) continue;
      const value = payload.storage[key];
      if (typeof value !== 'string') continue;
      localStorage.setItem(key, value);
      wrote = true;
    }
    if (!wrote) return false;

    writeMeta({
      updatedAt: payload.clientUpdatedAt || payload.portalReceivedAt || new Date().toISOString(),
      ownerUserId: portalUserId || readMeta().ownerUserId || null
    });

    // Os jogos carregam progresso persistente no boot. Um único reload reconstrói o estado
    // em memória usando o save remoto sem reescrever o código interno de cada jogo.
    sessionStorage.setItem(RESTORED_KEY, '1');
    location.reload();
    return true;
  }

  function readApprovedOrigins() {
    const raw = readJsonStorage(APPROVED_ORIGINS_KEY, []);
    if (!Array.isArray(raw)) return new Set();
    return new Set(raw.map(normalizeOrigin).filter(Boolean));
  }

  function rememberApprovedOrigin(origin) {
    const normalized = normalizeOrigin(origin);
    if (!normalized) return false;
    const approved = readApprovedOrigins();
    approved.add(normalized);
    return writeJsonStorage(APPROVED_ORIGINS_KEY, [...approved]);
  }

  function isExpectedOpener(event) {
    return enabled && Boolean(window.opener) && event.source === window.opener;
  }

  function isSafeAutomaticPortalOrigin(event, message) {
    if (!autoSyncRequested || !isExpectedOpener(event)) return false;
    const origin = normalizeOrigin(event.origin);
    if (!origin || !launchPortalOrigin || origin !== launchPortalOrigin) return false;
    if (normalizeOrigin(message?.portalOrigin || '') !== origin) return false;
    if (message?.bootSyncProtocol !== 1) return false;

    // Quando o navegador fornece Referer, ele também precisa apontar para a mesma origem
    // que abriu o jogo. Em navegadores que omitem Referer por privacidade, opener + origem
    // de lançamento + HELLO ainda precisam coincidir.
    if (referrerOrigin && referrerOrigin !== origin) return false;

    try {
      const parsed = new URL(origin);
      const localDev = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (parsed.protocol !== 'https:' && !(localDev && parsed.protocol === 'http:')) return false;
    } catch {
      return false;
    }
    return true;
  }

  function isTrustedOrigin(event, message) {
    const normalized = normalizeOrigin(event.origin);
    return staticTrustedOrigins.has(normalized)
      || readApprovedOrigins().has(normalized)
      || isSafeAutomaticPortalOrigin(event, message);
  }

  function emptyBackups() {
    return { version: 1, order: [], users: {} };
  }

  function readAccountBackups() {
    const raw = readJsonStorage(ACCOUNT_BACKUPS_KEY, null);
    if (!raw || raw.version !== 1 || !Array.isArray(raw.order) || !raw.users || typeof raw.users !== 'object') return emptyBackups();
    return raw;
  }

  function saveAccountBackup(userId) {
    if (!userId || !hasLocalSave()) return false;
    const store = readAccountBackups();
    store.users[userId] = {
      storage: collectStorageValues(),
      updatedAt: readMeta().updatedAt || null,
      savedAt: new Date().toISOString()
    };
    store.order = store.order.filter(id => id !== userId);
    store.order.push(userId);
    while (store.order.length > ACCOUNT_BACKUP_LIMIT) {
      const removed = store.order.shift();
      if (removed) delete store.users[removed];
    }
    return writeJsonStorage(ACCOUNT_BACKUPS_KEY, store);
  }

  function restoreAccountBackup(userId) {
    const store = readAccountBackups();
    const backup = store.users[userId];
    for (const key of cfg.saveKeys) localStorage.removeItem(key);
    if (!backup?.storage || typeof backup.storage !== 'object') {
      writeMeta({ ownerUserId: userId, updatedAt: null });
      return false;
    }
    for (const key of cfg.saveKeys) {
      const value = backup.storage[key];
      if (typeof value === 'string') localStorage.setItem(key, value);
    }
    writeMeta({ ownerUserId: userId, updatedAt: backup.updatedAt || null });
    return true;
  }

  function prepareAccountStorage(userId) {
    if (!userId) return false;
    const meta = readMeta();
    const owner = meta.ownerUserId || null;
    if (!owner || owner === userId) return false;

    // localStorage pertence ao domínio do jogo, não à conta ZOINHO. Antes de trocar de
    // conta, arquivamos o save atual e restauramos o bucket da nova conta (ou limpamos as
    // chaves sincronizadas). Isso impede progresso da conta A de ser enviado para a B.
    if (hasLocalSave() && !saveAccountBackup(owner)) {
      state = 'error';
      showBootError('Não foi possível separar o save da conta anterior neste navegador. O progresso não foi alterado.');
      return true;
    }
    restoreAccountBackup(userId);
    if (readMeta().ownerUserId !== userId) {
      state = 'error';
      showBootError('Não foi possível preparar o armazenamento desta conta. O save anterior continua protegido.');
      return true;
    }
    sessionStorage.setItem(ACCOUNT_SWITCH_KEY, userId);
    setBootStage('account', 'Trocando de conta...', 'Separando o progresso local da conta anterior.');
    location.reload();
    return true;
  }

  function post(type, payload = {}) {
    if (!portalWindow || !portalOrigin || !sessionNonce) return false;
    try {
      portalWindow.postMessage({
        protocol: PROTOCOL,
        bridgeVersion: BRIDGE_VERSION,
        type,
        gameId: cfg.gameId,
        nonce: sessionNonce,
        ...payload
      }, portalOrigin);
      return true;
    } catch (error) {
      console.warn('[ZOINHO Bridge] Falha no postMessage para o portal.', error);
      state = 'error';
      return false;
    }
  }

  function postDiagnostic(event, code, extra = {}) {
    if (!event?.source || !event.origin) return false;
    try {
      event.source.postMessage({
        protocol: PROTOCOL,
        bridgeVersion: BRIDGE_VERSION,
        type: 'diagnostic',
        gameId: cfg.gameId,
        code,
        observedPortalOrigin: normalizeOrigin(event.origin),
        ...extra
      }, event.origin);
      return true;
    } catch (error) {
      console.warn('[ZOINHO Bridge] Falha ao enviar diagnóstico ao portal.', error);
      return false;
    }
  }

  function pushNow(reason = 'save', options = {}) {
    const bootSync = options.bootSync === true;
    if (offlineMode) return false;
    if ((!initialSyncResolved || !initialSyncCompleted) && !bootSync) {
      queuedPushReason = reason;
      return false;
    }
    if (!portalWindow || !portalOrigin || !sessionNonce) return false;
    state = 'sending';
    if (!bootSync) queuedPushReason = null;
    return post('snapshot', { reason, bootSync, snapshot: collectSnapshot() });
  }

  function schedulePush(reason = 'save') {
    markLocalSave();
    queuedPushReason = reason;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => pushNow(reason), 120);
  }

  function stopReadyLoop() {
    if (readyTimer) clearInterval(readyTimer);
    readyTimer = 0;
  }

  function sendReady() {
    if (!enabled || !window.opener) return false;
    readyAttempts += 1;
    try {
      window.opener.postMessage({
        protocol: PROTOCOL,
        bridgeVersion: BRIDGE_VERSION,
        type: 'ready',
        gameId: cfg.gameId
      }, '*');
      return true;
    } catch (error) {
      console.warn('[ZOINHO Bridge] Não foi possível anunciar READY.', error);
      return false;
    }
  }

  function startReadyLoop() {
    if (!enabled || !window.opener || readyTimer || sessionNonce || offlineMode) return;
    sendReady();
    readyTimer = setInterval(() => {
      if (sessionNonce || readyAttempts >= READY_RETRY_LIMIT || offlineMode) {
        stopReadyLoop();
        return;
      }
      sendReady();
    }, READY_RETRY_MS);
  }

  function getBootUi() {
    return {
      root: document.getElementById('zoinhoCloudBoot'),
      title: document.getElementById('zoinhoCloudBootTitle'),
      detail: document.getElementById('zoinhoCloudBootDetail'),
      status: document.getElementById('zoinhoCloudBootStatus'),
      retry: document.getElementById('zoinhoCloudRetry'),
      offline: document.getElementById('zoinhoCloudOffline')
    };
  }

  function setBootStage(stage, title, detail = '') {
    if (!enabled || initialSyncCompleted) return;
    const ui = getBootUi();
    if (!ui.root) return;
    ui.root.dataset.stage = stage || 'loading';
    if (ui.title && title) ui.title.textContent = title;
    if (ui.detail) ui.detail.textContent = detail || '';
    if (ui.status) ui.status.textContent = stage === 'error' ? '!' : stage === 'done' ? '✓' : '●';
    if (ui.retry) ui.retry.hidden = stage !== 'error';
    if (ui.offline) ui.offline.hidden = stage !== 'error';
    if (stage !== 'error') resetBootTimeout();
  }

  function resetBootTimeout() {
    if (!enabled || initialSyncCompleted || offlineMode) return;
    clearTimeout(bootTimer);
    bootTimer = setTimeout(() => {
      if (initialSyncCompleted || offlineMode) return;
      state = 'error';
      showBootError('A sincronização está demorando mais que o esperado.');
    }, BOOT_TIMEOUT_MS);
  }

  function showBootError(detail = 'Não foi possível acessar seu progresso na nuvem agora.') {
    clearTimeout(bootTimer);
    setBootStage('error', 'Não foi possível sincronizar', detail);
  }

  function releaseBootGate(mode = 'synced') {
    clearTimeout(bootTimer);
    const ui = getBootUi();
    if (!ui.root) {
      document.documentElement.classList.remove('zoinho-cloud-booting');
      return;
    }
    ui.root.dataset.stage = mode === 'offline' ? 'offline' : 'done';
    ui.root.setAttribute?.('aria-busy', 'false');
    if (ui.title) ui.title.textContent = mode === 'offline' ? 'Modo local' : 'Progresso sincronizado';
    if (ui.detail) ui.detail.textContent = mode === 'offline' ? 'A nuvem ficará pausada nesta sessão.' : 'Tudo pronto.';
    if (ui.status) ui.status.textContent = mode === 'offline' ? '○' : '✓';
    setTimeout(() => {
      ui.root.classList.add('zoinho-cloud-boot-leaving');
      setTimeout(() => {
        document.documentElement.classList.remove('zoinho-cloud-booting');
        ui.root.remove();
      }, 240);
    }, mode === 'offline' ? 180 : 300);
  }

  function installBootInputGuard() {
    const guarded = ['keydown', 'keyup', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'wheel'];
    const block = event => {
      if (!document.documentElement.classList.contains('zoinho-cloud-booting')) return;
      const target = event.target;
      if (target?.closest?.('#zoinhoCloudBoot')) return;
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      event.stopPropagation?.();
    };
    for (const type of guarded) addEventListener(type, block, { capture: true, passive: false });
  }

  function bindBootActions() {
    const ui = getBootUi();
    if (ui.retry && !ui.retry.dataset.bound) {
      ui.retry.dataset.bound = '1';
      ui.retry.addEventListener('click', () => {
        offlineMode = false;
        initialSyncResolved = false;
        initialSyncCompleted = false;
        initialSnapshotInFlight = false;
        setBootStage('retry', 'Tentando novamente...', 'Reconectando ao seu progresso.');
        if (portalWindow && portalOrigin && sessionNonce) post('retry-sync');
        else {
          sessionNonce = null;
          readyAttempts = 0;
          startReadyLoop();
        }
      });
    }
    if (ui.offline && !ui.offline.dataset.bound) {
      ui.offline.dataset.bound = '1';
      ui.offline.addEventListener('click', () => {
        offlineMode = true;
        state = 'offline';
        stopReadyLoop();
        clearTimeout(pushTimer);
        queuedPushReason = null;
        initialSyncResolved = true;
        initialSyncCompleted = true;
        releaseBootGate('offline');
        post('offline-continue');
      });
    }
  }

  function acceptHello(event, message) {
    if (!isExpectedOpener(event)) return false;
    if (!message?.nonce || typeof message.nonce !== 'string') {
      postDiagnostic(event, 'invalid-handshake', { detail: 'Nonce ausente ou inválido.' });
      return false;
    }
    if (!message.userId || typeof message.userId !== 'string') {
      postDiagnostic(event, 'invalid-handshake', { detail: 'Conta autenticada ausente.' });
      showBootError('A sessão da sua conta não pôde ser confirmada. Reabra o jogo pelo portal.');
      return false;
    }

    portalWindow = event.source;
    portalOrigin = normalizeOrigin(event.origin);
    portalUserId = message.userId;
    portalSupportsBootAck = message.bootSyncProtocol === 1;
    sessionNonce = message.nonce;
    state = 'connected';
    stopReadyLoop();

    if (prepareAccountStorage(portalUserId)) return true;

    setBootStage('handshake', 'Conta conectada', 'Verificando o progresso salvo...');
    post('hello-ack', {
      hasSave: hasLocalSave(),
      saveKeysPresent: cfg.saveKeys.filter(key => localStorage.getItem(key) !== null),
      clientUpdatedAt: readMeta().updatedAt || null,
      ownerUserId: readMeta().ownerUserId || null,
      bootHadLocalSave: bootLocalState.hadSave
    });
    return true;
  }

  function rejectUntrustedOrigin(event) {
    const origin = normalizeOrigin(event.origin);
    state = 'untrusted-origin';
    postDiagnostic(event, 'untrusted-portal-origin', {
      detail: 'A origem que abriu o jogo não corresponde ao lançamento automático da ZOINHO.',
      observedPortalOrigin: origin
    });
    showBootError('A conexão automática com o portal não pôde ser validada. Feche esta aba e abra o jogo novamente pela ZOINHO.');
  }

  function completeInitialSync(message) {
    lastAckAt = new Date().toISOString();
    initialSyncResolved = true;
    initialSyncCompleted = true;
    initialSnapshotInFlight = false;
    state = message.cloudSaved === false ? 'acknowledged-local-only' : 'acknowledged';
    if (portalUserId) writeMeta({ ownerUserId: portalUserId });
    const followUp = queuedPushReason;
    queuedPushReason = null;
    releaseBootGate(message.cloudSaved === false && !hasLocalSave() ? 'synced' : 'synced');
    if (followUp && hasLocalSave()) setTimeout(() => pushNow(followUp), 80);
  }

  window.ZoinhoStorageBridge = Object.freeze({
    enabled,
    bridgeVersion: BRIDGE_VERSION,
    collectSnapshot,
    notifySave: schedulePush,
    pushNow,
    status: () => ({
      state,
      portalOrigin,
      portalUserId,
      lastAckAt,
      readyAttempts,
      hasLocalSave: hasLocalSave(),
      approvedOrigins: [...readApprovedOrigins()],
      launchPortalOrigin: launchPortalOrigin || null,
      referrerOrigin: referrerOrigin || null,
      automaticPortalTrust: Boolean(autoSyncRequested && launchPortalOrigin),
      bootHadLocalSave: bootLocalState.hadSave,
      bootMetaUpdatedAt: bootLocalState.metaUpdatedAt,
      ownerUserId: readMeta().ownerUserId || null,
      initialSyncResolved,
      initialSyncCompleted,
      queuedPushReason,
      offlineMode,
      portalSupportsBootAck
    })
  });

  if (!enabled || !window.opener) {
    releaseBootGate();
    return;
  }

  installBootInputGuard();
  bindBootActions();
  setBootStage('connecting', 'Sincronizando progresso...', 'Conectando à sua conta ZOINHO.');

  addEventListener('message', event => {
    const message = event.data;
    if (!message || message.protocol !== PROTOCOL || message.gameId !== cfg.gameId) return;
    if (!isExpectedOpener(event)) return;

    if (message.type === 'hello') {
      if (!isTrustedOrigin(event, message)) {
        rejectUntrustedOrigin(event);
        return;
      }
      acceptHello(event, message);
      return;
    }

    if (!portalWindow || event.source !== portalWindow || normalizeOrigin(event.origin) !== portalOrigin) return;
    if (!sessionNonce || message.nonce !== sessionNonce) return;

    if (message.type === 'boot-status') {
      const stages = {
        'checking-cloud': ['Verificando progresso...', 'Buscando o save mais recente na nuvem.'],
        'cloud-found': ['Save encontrado', 'Comparando com o progresso deste dispositivo.'],
        'cloud-empty': ['Primeira sincronização', 'Preparando seu progresso para a nuvem.'],
        'saving-cloud': ['Enviando progresso...', 'Salvando a versão mais recente na sua conta.'],
        'finishing': ['Finalizando...', 'Só mais um instante.']
      };
      const copy = stages[message.stage] || ['Sincronizando progresso...', 'Aguarde um instante.'];
      setBootStage(message.stage || 'loading', copy[0], copy[1]);
      return;
    }

    if (message.type === 'sync') {
      const restoredThisLoad = sessionStorage.getItem(RESTORED_KEY) === '1';
      if (restoredThisLoad) sessionStorage.removeItem(RESTORED_KEY);
      initialSyncResolved = false;
      initialSnapshotInFlight = false;

      if (!restoredThisLoad && message.snapshot && shouldApplyRemote(message.snapshot)) {
        if (applySnapshot(message.snapshot)) return;
      }

      initialSyncResolved = true;
      initialSnapshotInFlight = true;
      // O snapshot de boot já inclui qualquer save/default criado até este instante.
      // Só mantemos na fila alterações que ocorrerem DEPOIS deste envio.
      queuedPushReason = null;
      setBootStage(message.snapshot ? 'finishing' : 'cloud-empty', message.snapshot ? 'Finalizando sincronização...' : 'Preparando seu progresso...', message.snapshot ? 'Confirmando a versão mais recente.' : 'Nenhum save foi encontrado na nuvem.');

      // Em navegador realmente novo, alguns jogos criam um objeto default no localStorage
      // durante o bootstrap. Ele não deve virar um Cloud Save falso antes de o jogador fazer
      // qualquer progresso. Enviamos snapshot vazio se não havia save ao carregar a bridge.
      if (!message.snapshot && !bootLocalState.hadSave) {
        post('snapshot', {
          reason: 'initial-empty',
          bootSync: true,
          snapshot: { gameId: cfg.gameId, storage: {}, clientUpdatedAt: null }
        });
      } else {
        pushNow('initial-sync', { bootSync: true });
      }
      return;
    }

    if (message.type === 'sync-error') {
      initialSnapshotInFlight = false;
      initialSyncResolved = false;
      state = 'error';
      showBootError(message.message || 'Não foi possível acessar seu progresso na nuvem agora.');
      return;
    }

    if (message.type === 'request-snapshot') {
      pushNow('requested');
      return;
    }

    if (message.type === 'ack') {
      lastAckAt = new Date().toISOString();
      if (message.bootComplete || (initialSnapshotInFlight && !portalSupportsBootAck)) {
        // Compatibilidade de implantação: se o jogo novo for publicado antes do portal
        // v1.9.0, o ACK legado ainda libera o boot em vez de prender o usuário no loading.
        completeInitialSync({ ...message, bootComplete: true });
      } else {
        state = message.cloudSaved === false ? 'acknowledged-local-only' : 'acknowledged';
      }
      return;
    }

    if (message.type === 'account-changed') {
      state = 'account-changed';
      offlineMode = true;
      showBootError('A conta do portal mudou. Feche esta aba e abra o jogo novamente pela ZOINHO.');
      return;
    }

    if (message.type === 'disconnect') {
      portalWindow = null;
      portalOrigin = null;
      portalUserId = null;
      sessionNonce = null;
      state = 'waiting';
      if (!initialSyncCompleted) {
        setBootStage('connecting', 'Reconectando...', 'A conexão com o portal foi interrompida.');
        startReadyLoop();
      }
    }
  });

  addEventListener('pageshow', () => {
    bindBootActions();
    if (!sessionNonce && !offlineMode) startReadyLoop();
  });

  addEventListener('pagehide', () => {
    if (portalWindow && portalOrigin && sessionNonce && initialSyncCompleted && !offlineMode) pushNow('pagehide');
  });

  if (sessionStorage.getItem(ACCOUNT_SWITCH_KEY)) sessionStorage.removeItem(ACCOUNT_SWITCH_KEY);
  resetBootTimeout();
  startReadyLoop();
})();
