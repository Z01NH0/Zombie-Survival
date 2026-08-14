(() => {
  'use strict';

  const PROTOCOL = 'zoinho-storage-v2';
  const BRIDGE_VERSION = 2;
  const READY_RETRY_MS = 900;
  const READY_RETRY_LIMIT = 120;
  const cfg = window.ZOINHO_STORAGE_CONFIG;

  if (!cfg || !cfg.gameId || !Array.isArray(cfg.portalOrigins) || !Array.isArray(cfg.saveKeys)) {
    console.warn('[ZOINHO Bridge] Configuração ausente ou inválida; bridge desativada.');
    return;
  }

  const params = new URLSearchParams(location.search);
  const enabled = params.get('zoinhoBridge') === '1';
  const META_KEY = `zoinhoBridgeMeta:${cfg.gameId}`;
  const APPROVED_ORIGINS_KEY = `zoinhoBridgeApprovedOrigins:${cfg.gameId}`;
  const staticTrustedOrigins = new Set(cfg.portalOrigins.map(normalizeOrigin).filter(Boolean));

  let portalWindow = null;
  let portalOrigin = null;
  let sessionNonce = null;
  let pushTimer = 0;
  let readyTimer = 0;
  let readyAttempts = 0;
  let state = enabled ? 'waiting' : 'disabled';
  let lastAckAt = null;
  let approvalOverlay = null;
  let pendingApproval = null;

  // Capturado antes de qualquer script do jogo rodar. Isso distingue um save real que já
  // existia ao abrir a página de um save-default criado por patches durante o bootstrap.
  // Sem isso, um navegador novo pode criar {cores:0}, ganhar timestamp atual e bloquear
  // indevidamente a restauração de um Cloud Save mais antigo porém legítimo.
  const bootLocalState = Object.freeze({
    hadSave: cfg.saveKeys.some(key => localStorage.getItem(key) !== null),
    metaUpdatedAt: readMeta().updatedAt || null
  });
  let initialSyncCompleted = false;
  let queuedPushReason = null;

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
    try {
      localStorage.setItem(APPROVED_ORIGINS_KEY, JSON.stringify([...approved]));
      return true;
    } catch (error) {
      console.warn('[ZOINHO Bridge] Não foi possível guardar a autorização do portal.', error);
      return false;
    }
  }

  function isTrustedOrigin(origin) {
    const normalized = normalizeOrigin(origin);
    return staticTrustedOrigins.has(normalized) || readApprovedOrigins().has(normalized);
  }

  function isExpectedOpener(event) {
    return enabled && Boolean(window.opener) && event.source === window.opener;
  }

  function readMeta() {
    const parsed = readJsonStorage(META_KEY, {});
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  }

  function markLocalSave() {
    const updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(META_KEY, JSON.stringify({ updatedAt }));
    } catch (error) {
      console.warn('[ZOINHO Bridge] Não foi possível atualizar metadata do save.', error);
    }
    return updatedAt;
  }

  function hasLocalSave() {
    return cfg.saveKeys.some(key => localStorage.getItem(key) !== null);
  }

  function collectSnapshot() {
    const storage = {};
    for (const key of cfg.saveKeys) {
      const value = localStorage.getItem(key);
      if (value !== null) storage[key] = value;
    }
    return {
      gameId: cfg.gameId,
      storage,
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

  function collectStorageValues() {
    const storage = {};
    for (const key of cfg.saveKeys) {
      const value = localStorage.getItem(key);
      if (value !== null) storage[key] = value;
    }
    return storage;
  }

  function comparePersistentProgress(remoteStorage) {
    if (typeof cfg.progressScore !== 'function') return 0;
    try {
      const localScore = Number(cfg.progressScore(collectStorageValues()));
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

    // Na primeira sincronização, se NÃO havia save quando a bridge carregou, qualquer
    // localStorage criado depois é bootstrap/migração do próprio jogo. Ele não pode vencer
    // um Cloud Save legítimo só porque recebeu um timestamp alguns milissegundos depois.
    if (!initialSyncCompleted && !bootLocalState.hadSave) return true;

    // Quando o jogo fornece um comparador de progresso persistente, ele tem precedência
    // sobre relógios. Para Dead Signal isso protege núcleos/upgrades contra saves-default.
    const progressComparison = comparePersistentProgress(payload.storage);
    if (progressComparison !== 0) return progressComparison > 0;

    const localTime = Date.parse(readMeta().updatedAt || '');
    const remoteTime = Date.parse(payload.clientUpdatedAt || payload.portalReceivedAt || '');
    if (!Number.isFinite(remoteTime)) return false;

    // Save local antigo, criado antes da bridge, ganha do remoto por segurança quando não
    // existe metadata comparável. Isso protege progresso pré-Cloud Save já existente.
    if (!Number.isFinite(localTime)) return false;
    return remoteTime > localTime;
  }

  function applySnapshot(payload) {
    if (!payload || payload.gameId !== cfg.gameId || !payload.storage || typeof payload.storage !== 'object') return false;
    if (snapshotsEqual(payload.storage)) return false;

    let wrote = false;
    for (const key of cfg.saveKeys) {
      if (!Object.prototype.hasOwnProperty.call(payload.storage, key)) continue;
      const value = payload.storage[key];
      if (typeof value !== 'string') continue;
      localStorage.setItem(key, value);
      wrote = true;
    }
    if (!wrote) return false;

    try {
      localStorage.setItem(META_KEY, JSON.stringify({
        updatedAt: payload.clientUpdatedAt || payload.portalReceivedAt || new Date().toISOString()
      }));
    } catch (error) {
      console.warn('[ZOINHO Bridge] Save remoto aplicado, mas metadata não pôde ser gravada.', error);
    }

    // O jogo carrega o save persistente no boot. Recarregar uma vez reconstrói o estado em memória
    // usando o save restaurado sem empilhar patches no código original.
    sessionStorage.setItem('zoinhoBridgeRestored', '1');
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

  function pushNow(reason = 'save') {
    // Nenhum snapshot sai antes de o portal mandar o primeiro SYNC. Isso impede defaults
    // e migrações de bootstrap de chegarem ao Supabase enquanto o Cloud Save legítimo
    // ainda está sendo buscado.
    if (!initialSyncCompleted) {
      queuedPushReason = reason;
      return false;
    }
    if (!portalWindow || !portalOrigin || !sessionNonce) return false;
    state = 'sending';
    queuedPushReason = null;
    return post('snapshot', { reason, snapshot: collectSnapshot() });
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
      // READY não carrega save. O portal ainda precisa concluir o handshake antes de receber dados.
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
    if (!enabled || !window.opener || readyTimer || sessionNonce) return;
    sendReady();
    readyTimer = setInterval(() => {
      if (sessionNonce || readyAttempts >= READY_RETRY_LIMIT) {
        stopReadyLoop();
        return;
      }
      sendReady();
    }, READY_RETRY_MS);
  }

  function removeApprovalOverlay() {
    if (approvalOverlay?.isConnected) approvalOverlay.remove();
    approvalOverlay = null;
  }

  function showOriginApproval(origin, approve, deny) {
    removeApprovalOverlay();
    const normalized = normalizeOrigin(origin);
    const shell = document.createElement('div');
    shell.id = 'zoinhoBridgeApproval';
    shell.setAttribute('role', 'dialog');
    shell.setAttribute('aria-modal', 'true');
    shell.innerHTML = `
      <div class="zoinho-bridge-approval-card">
        <div class="zoinho-bridge-kicker">ZOINHO CLOUD SAVE</div>
        <strong>Autorizar conexão do portal?</strong>
        <p>O portal abaixo quer sincronizar o progresso de ${cfg.displayName || cfg.gameId} neste navegador.</p>
        <code></code>
        <small>O save só será enviado depois da sua autorização.</small>
        <div class="zoinho-bridge-actions">
          <button type="button" data-action="deny">Recusar</button>
          <button type="button" data-action="approve">Autorizar</button>
        </div>
      </div>`;
    shell.querySelector('code').textContent = normalized;

    const style = document.createElement('style');
    style.textContent = `
      #zoinhoBridgeApproval{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:rgba(0,0,0,.82);backdrop-filter:blur(8px);font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#fff;cursor:default;user-select:text}
      #zoinhoBridgeApproval .zoinho-bridge-approval-card{width:min(520px,94vw);padding:24px;border:1px solid rgba(255,48,65,.42);border-radius:18px;background:#0c0b0f;box-shadow:0 28px 90px rgba(0,0,0,.72)}
      #zoinhoBridgeApproval .zoinho-bridge-kicker{margin-bottom:10px;color:#ff304d;font-size:11px;font-weight:900;letter-spacing:.18em}
      #zoinhoBridgeApproval strong{display:block;font-size:22px;line-height:1.2}
      #zoinhoBridgeApproval p{margin:12px 0;color:#c6c3cb;font-size:14px;line-height:1.55}
      #zoinhoBridgeApproval code{display:block;overflow-wrap:anywhere;margin:14px 0;padding:11px 13px;border-radius:10px;background:#17151c;color:#f4f2f6;font-size:12px}
      #zoinhoBridgeApproval small{display:block;color:#8f8a96;font-size:11px;line-height:1.45}
      #zoinhoBridgeApproval .zoinho-bridge-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}
      #zoinhoBridgeApproval button{min-width:112px;padding:11px 15px;border:1px solid #3b3841;border-radius:10px;background:#18161d;color:#fff;font:700 12px system-ui;cursor:pointer}
      #zoinhoBridgeApproval button[data-action="approve"]{border-color:#ff304d;background:#d20f2d}
    `;
    shell.appendChild(style);
    shell.querySelector('[data-action="approve"]').addEventListener('click', () => {
      removeApprovalOverlay();
      approve();
    }, { once: true });
    shell.querySelector('[data-action="deny"]').addEventListener('click', () => {
      removeApprovalOverlay();
      deny();
    }, { once: true });
    document.body.appendChild(shell);
    approvalOverlay = shell;
  }

  function acceptHello(event, message) {
    if (!isExpectedOpener(event)) return false;
    if (!message?.nonce || typeof message.nonce !== 'string') {
      postDiagnostic(event, 'invalid-handshake', { detail: 'Nonce ausente ou inválido.' });
      return false;
    }

    portalWindow = event.source;
    portalOrigin = normalizeOrigin(event.origin);
    sessionNonce = message.nonce;
    state = 'connected';
    pendingApproval = null;
    stopReadyLoop();

    post('hello-ack', {
      hasSave: hasLocalSave(),
      saveKeysPresent: cfg.saveKeys.filter(key => localStorage.getItem(key) !== null),
      clientUpdatedAt: readMeta().updatedAt || null
    });
    return true;
  }

  function requestOriginApproval(event, message) {
    const origin = normalizeOrigin(event.origin);
    state = 'authorization-required';
    pendingApproval = { event, message, origin };
    postDiagnostic(event, 'untrusted-portal-origin', { detail: 'Aguardando autorização do usuário no jogo.' });

    if (cfg.allowOriginApproval === false) return;
    if (approvalOverlay) return;

    showOriginApproval(origin, () => {
      const pending = pendingApproval;
      if (!pending || pending.origin !== origin) return;
      if (!rememberApprovedOrigin(origin)) {
        postDiagnostic(pending.event, 'authorization-store-failed');
        return;
      }
      postDiagnostic(pending.event, 'portal-origin-approved');
      acceptHello(pending.event, pending.message);
    }, () => {
      const pending = pendingApproval;
      pendingApproval = null;
      state = 'authorization-denied';
      if (pending) postDiagnostic(pending.event, 'portal-authorization-denied');
    });
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
      lastAckAt,
      readyAttempts,
      hasLocalSave: hasLocalSave(),
      approvedOrigins: [...readApprovedOrigins()],
      bootHadLocalSave: bootLocalState.hadSave,
      bootMetaUpdatedAt: bootLocalState.metaUpdatedAt,
      initialSyncCompleted,
      queuedPushReason
    })
  });

  if (!enabled || !window.opener) return;

  addEventListener('message', event => {
    const message = event.data;
    if (!message || message.protocol !== PROTOCOL || message.gameId !== cfg.gameId) return;
    if (!isExpectedOpener(event)) return;

    if (message.type === 'hello') {
      if (!isTrustedOrigin(event.origin)) {
        requestOriginApproval(event, message);
        return;
      }
      acceptHello(event, message);
      return;
    }

    // A partir daqui, mensagens só são aceitas da origem e sessão que concluíram o handshake.
    if (!portalWindow || event.source !== portalWindow || normalizeOrigin(event.origin) !== portalOrigin) return;
    if (!sessionNonce || message.nonce !== sessionNonce) return;

    if (message.type === 'sync') {
      const restoredThisLoad = sessionStorage.getItem('zoinhoBridgeRestored') === '1';
      if (restoredThisLoad) sessionStorage.removeItem('zoinhoBridgeRestored');

      if (!restoredThisLoad && message.snapshot && shouldApplyRemote(message.snapshot)) {
        if (applySnapshot(message.snapshot)) return;
      }
      initialSyncCompleted = true;
      pushNow(queuedPushReason || 'sync-response');
      return;
    }

    if (message.type === 'request-snapshot') {
      pushNow('requested');
      return;
    }

    if (message.type === 'ack') {
      lastAckAt = new Date().toISOString();
      state = message.cloudSaved === false ? 'acknowledged-local-only' : 'acknowledged';
      return;
    }

    if (message.type === 'disconnect') {
      portalWindow = null;
      portalOrigin = null;
      sessionNonce = null;
      state = 'waiting';
      startReadyLoop();
    }
  });

  addEventListener('pageshow', () => {
    if (!sessionNonce) startReadyLoop();
  });

  addEventListener('pagehide', () => {
    if (portalWindow && portalOrigin && sessionNonce) pushNow('pagehide');
  });

  startReadyLoop();
})();
