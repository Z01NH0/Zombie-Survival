(() => {
  'use strict';

  const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
  const nowMs = () => performance.now();
  const DBG = window.__arsenalDebug || {};

  class ExternalAudioManager {
    constructor() {
      this.unlocked = false;
      this.currentMusic = '';
      this.lastPlay = new Map();
      this.activeVoices = new Map();
      this.lastHurt = '';
      this.loopVoices = new Map();

      this.musicDefs = {
        menu: { src: 'assets/audio/musicas/menu.mp3', gain: 0.78 },
        day: { src: 'assets/audio/musicas/dia.mp3', gain: 0.64 },
        night: { src: 'assets/audio/musicas/noite.mp3', gain: 0.68 }
      };
      this.effectDefs = {
        menuButton: { src: 'assets/audio/efeitos/menu-botao.mp3', gain: 0.62, cooldown: 70, maxVoices: 3, stopAfter: 0.55 },
        heal: { src: 'assets/audio/efeitos/cura.mp3', gain: 0.72, cooldown: 650, maxVoices: 2, stopAfter: 0.7 },
        trade: { src: 'assets/audio/efeitos/compra-venda.mp3', gain: 0.72, cooldown: 120, maxVoices: 2, stopAfter: 0.9 },
        crate: { src: 'assets/audio/efeitos/caixa.mp3', gain: 0.78, cooldown: 180, maxVoices: 3, startAt: 0.12, stopAfter: 2.1 },
        hurt1: { src: 'assets/audio/efeitos/machucado-1.mp3', gain: 0.72, cooldown: 0, maxVoices: 1, stopAfter: 0.75 },
        hurt2: { src: 'assets/audio/efeitos/machucado-2.mp3', gain: 0.68, cooldown: 0, maxVoices: 1, startAt: 0.35, stopAfter: 4.45 },
        hurt3: { src: 'assets/audio/efeitos/machucado-3.mp3', gain: 0.72, cooldown: 0, maxVoices: 1, startAt: 0.36, stopAfter: 1.35 },
        meleeHit: { src: 'assets/audio/efeitos/faca-acertar.mp3', gain: 0.78, cooldown: 80, maxVoices: 3, stopAfter: 0.55 },
        meleeMiss: { src: 'assets/audio/efeitos/faca-errar.mp3', gain: 0.58, cooldown: 80, maxVoices: 2, startAt: 0.47, stopAfter: 0.82 },
        alarm: { src: 'assets/audio/efeitos/alarme.mp3', gain: 0.72, cooldown: 5000, maxVoices: 1, stopAfter: 9.05 },
        boss: { src: 'assets/audio/efeitos/boss.mp3', gain: 0.82, cooldown: 4200, maxVoices: 1, stopAfter: 4.1 },
        zombie: { src: 'assets/audio/efeitos/zumbi.mp3', gain: 0.64, cooldown: 1700, maxVoices: 2, startAt: 0.32, stopAfter: 5.0 },
        explosion: { src: 'assets/audio/efeitos/explosao.mp3', gain: 0.88, cooldown: 140, maxVoices: 4, startAt: 0.08, stopAfter: 4.05 },
        bazooka: { src: 'assets/audio/efeitos/bazuka.mp3', gain: 0.8, cooldown: 520, maxVoices: 2, stopAfter: 6.6 },
        machineGun: { src: 'assets/audio/efeitos/metralha-loop.wav', gain: 0.58, cooldown: 0, maxVoices: 1, loop: true },
        reload: { src: 'assets/audio/efeitos/recarga.mp3', gain: 0.66, cooldown: 180, maxVoices: 2, stopAfter: 1.3 },
        gunshot: { src: 'assets/audio/efeitos/tiro.mp3', gain: 0.62, cooldown: 170, maxVoices: 2, stopAfter: 4.25 },
        crossbow: { src: 'assets/audio/efeitos/crossbow.mp3', gain: 0.52, cooldown: 170, maxVoices: 3, stopAfter: 0.64 },
        shotgun: { src: 'assets/audio/efeitos/shotgun.mp3', gain: 0.92, cooldown: 180, maxVoices: 3, stopAfter: 1.58 },
        sniper: { src: 'assets/audio/efeitos/sniper.mp3', gain: 0.5, cooldown: 260, maxVoices: 2, stopAfter: 1.44 },
        abilityVanguard: { src: 'assets/audio/efeitos/poder-vanguard.mp3', gain: 0.56, cooldown: 650, maxVoices: 1, stopAfter: 3.19 },
        abilityReaper: { src: 'assets/audio/efeitos/poder-reaper.mp3', gain: 0.64, cooldown: 650, maxVoices: 1, stopAfter: 1.69 },
        abilityTempest: { src: 'assets/audio/efeitos/poder-tempest.mp3', gain: 0.68, cooldown: 650, maxVoices: 1, stopAfter: 1.1 },
        repair: { src: 'assets/audio/efeitos/reparo.mp3', gain: 0.38, cooldown: 750, maxVoices: 1, stopAfter: 2.04 },
        ultimateVanguard: { src: 'assets/audio/efeitos/ultimate-vanguard.mp3', gain: 0.3, cooldown: 80, maxVoices: 4, stopAfter: 2.03 },
        ultimateReaper: { src: 'assets/audio/efeitos/ultimate-reaper.mp3', gain: 0.66, cooldown: 1500, maxVoices: 1, stopAfter: 9.45 },
        ultimateTempest: { src: 'assets/audio/efeitos/ultimate-tempest.mp3', gain: 0.58, cooldown: 1500, maxVoices: 1, stopAfter: 12.5 }
      };

      this.music = {};
      this.effects = {};
      Object.entries(this.musicDefs).forEach(([key, def]) => {
        const element = new Audio(def.src);
        element.loop = true;
        element.preload = 'auto';
        element.volume = 0;
        this.music[key] = element;
      });
      Object.entries(this.effectDefs).forEach(([key, def]) => {
        const element = new Audio(def.src);
        element.preload = 'auto';
        this.effects[key] = element;
        this.activeVoices.set(key, new Set());
      });

      this.musicTimer = setInterval(() => this.syncMusic(), 100);
    }

    unlock() {
      if (this.unlocked) return;
      this.unlocked = true;
      Object.values(this.music).forEach(track => {
        track.load();
      });
      Object.values(this.effects).forEach(effect => effect.load());
      this.syncMusic(true);
    }

    overallVolume() {
      return clamp01(save?.settings?.volume ?? 0.62);
    }

    musicVolume() {
      return this.overallVolume() * clamp01(save?.settings?.musicVolume ?? 0.36);
    }

    sfxVolume() {
      return this.overallVolume() * clamp01(save?.settings?.sfxVolume ?? 0.72);
    }

    desiredMusic() {
      if (typeof game === 'undefined' || !game.running) return 'menu';
      return game.phase === 'day' ? 'day' : 'night';
    }

    syncMusic(force = false) {
      if (!this.unlocked) return;
      const enabled = Boolean(save?.settings?.music);
      const target = this.desiredMusic();
      this.currentMusic = target;
      Object.entries(this.music).forEach(([key, track]) => {
        const def = this.musicDefs[key];
        const desired = enabled && key === target ? this.musicVolume() * def.gain : 0;
        if (desired > 0 && track.paused) {
          track.play().catch(() => {});
        }
        const factor = force ? 1 : 0.22;
        const next = track.volume + (desired - track.volume) * factor;
        track.volume = clamp01(Math.abs(next - desired) < 0.002 ? desired : next);
        if (desired === 0 && track.volume < 0.004 && !track.paused) track.pause();
      });
    }

    applySettings() {
      this.syncMusic(true);
      if (!save?.settings?.sfx) {
        this.stopAllLoops();
        for (const voices of this.activeVoices.values()) {
          for (const voice of voices) voice.pause();
          voices.clear();
        }
        return;
      }
      this.syncLoopVolumes();
    }

    syncLoopVolumes() {
      for (const [name, voice] of this.loopVoices) {
        const def = this.effectDefs[name];
        if (!def || !voice) continue;
        voice.volume = clamp01(this.sfxVolume() * def.gain);
        if (!save?.settings?.sfx) this.stopLoop(name);
      }
    }

    startLoop(name, options = {}) {
      if (!this.unlocked || !save?.settings?.sfx) return null;
      const def = this.effectDefs[name];
      if (!def) return null;
      const current = this.loopVoices.get(name);
      if (current && !current.paused) {
        current.volume = clamp01(this.sfxVolume() * def.gain * clamp01(options.gain ?? 1));
        return current;
      }
      const voice = new Audio(def.src);
      voice.preload = 'auto';
      voice.loop = true;
      voice.volume = clamp01(this.sfxVolume() * def.gain * clamp01(options.gain ?? 1));
      voice.playbackRate = options.playbackRate ?? 1;
      voice.play().catch(() => this.loopVoices.delete(name));
      this.loopVoices.set(name, voice);
      return voice;
    }

    stopLoop(name) {
      const voice = this.loopVoices.get(name);
      if (!voice) return;
      voice.pause();
      try { voice.currentTime = 0; } catch (_) {}
      this.loopVoices.delete(name);
    }

    stopAllLoops() {
      for (const name of [...this.loopVoices.keys()]) this.stopLoop(name);
    }

    play(name, options = {}) {
      if (!this.unlocked || !save?.settings?.sfx) return null;
      const def = this.effectDefs[name];
      const template = this.effects[name];
      if (!def || !template) return null;
      const time = nowMs();
      const cooldown = options.cooldown ?? def.cooldown ?? 0;
      if (time - (this.lastPlay.get(name) || -Infinity) < cooldown) return null;
      const voices = this.activeVoices.get(name);
      if (voices.size >= (options.maxVoices ?? def.maxVoices ?? 3)) {
        const oldest = voices.values().next().value;
        if (oldest) {
          oldest.pause();
          voices.delete(oldest);
        }
      }
      this.lastPlay.set(name, time);
      const voice = template.cloneNode(true);
      voice.preload = 'auto';
      const requestedGain = clamp01(options.gain ?? 1);
      voice.volume = clamp01(this.sfxVolume() * def.gain * requestedGain);
      voice.playbackRate = options.playbackRate ?? 1;
      const startAt = Math.max(0, options.startAt ?? def.startAt ?? 0);
      try { voice.currentTime = startAt; } catch (_) {}
      voices.add(voice);
      const cleanup = () => voices.delete(voice);
      voice.addEventListener('ended', cleanup, { once: true });
      voice.addEventListener('error', cleanup, { once: true });
      voice.play().catch(cleanup);
      const stopAfter = options.stopAfter ?? def.stopAfter;
      if (stopAfter) {
        setTimeout(() => {
          if (!voice.paused) voice.pause();
          cleanup();
        }, Math.max(20, (stopAfter - startAt) * 1000));
      }
      return voice;
    }

    playSpatial(name, source, maxDistance = 1100, gain = 1) {
      if (!source || !game?.player) return null;
      const dx = source.x - game.player.x;
      const dy = source.y - game.player.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= maxDistance) return null;
      const normalized = 1 - distance / maxDistance;
      const attenuation = Math.max(0.05, Math.pow(normalized, 1.55));
      return this.play(name, { gain: gain * attenuation });
    }

    playHurt() {
      const time = nowMs();
      if (time - (this.lastHurtAt || 0) < 620) return null;
      this.lastHurtAt = time;
      const choices = ['hurt1', 'hurt2', 'hurt3'].filter(name => name !== this.lastHurt);
      const selected = choices[(Math.random() * choices.length) | 0] || 'hurt1';
      this.lastHurt = selected;
      return this.play(selected, { cooldown: 560, maxVoices: 1 });
    }
  }

  save.settings.musicVolume ??= 0.36;
  save.settings.sfxVolume ??= 0.72;
  persist();

  const gameAudio = new ExternalAudioManager();
  window.gameAudio = gameAudio;

  // Substitui de fato o motor procedural. O pequeno contexto compatível existe
  // apenas porque o código-base chama audio.ctx.resume() ao abrir ou iniciar.
  const silence = () => {};
  audio.ensure = function () {
    if (!this.ctx) this.ctx = { resume: () => Promise.resolve() };
    gameAudio.unlock();
  };
  audio.apply = function () {
    gameAudio.applySettings();
  };
  audio.tone = silence;
  audio.noise = silence;
  audio.shot = silence;
  audio.hit = silence;
  audio.kill = silence;
  audio.ui = silence;
  audio.ability = silence;
  audio.ultimate = silence;
  audio.tick = silence;
  audio.hurt = () => gameAudio.playHurt();

  const unlockAudio = () => gameAudio.unlock();
  addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
  addEventListener('keydown', unlockAudio, { capture: true, passive: true });

  function installAudioSettings() {
    const musicLabel = document.querySelector('#settingsScreen .setting span');
    if (musicLabel && musicLabel.textContent.includes('Música procedural')) {
      musicLabel.textContent = 'Música de ambientação';
    }
    const grid = document.querySelector('#settingsScreen .settings-grid');
    const overall = document.querySelector('#volumeRange')?.closest('.setting');
    if (!grid || !overall || document.querySelector('#musicVolumeRange')) return;
    overall.insertAdjacentHTML('afterend', `
      <div class="setting audio-setting"><span>Volume da música</span><input id="musicVolumeRange" class="range" type="range" min="0" max="1" step=".05" value="${save.settings.musicVolume}"></div>
      <div class="setting audio-setting"><span>Volume dos efeitos</span><input id="sfxVolumeRange" class="range" type="range" min="0" max="1" step=".05" value="${save.settings.sfxVolume}"></div>
    `);
    document.querySelector('#musicVolumeRange').oninput = event => {
      save.settings.musicVolume = +event.target.value;
      persist();
      gameAudio.applySettings();
    };
    document.querySelector('#sfxVolumeRange').oninput = event => {
      save.settings.sfxVolume = +event.target.value;
      persist();
      gameAudio.applySettings();
    };
  }

  installAudioSettings();
  const originalSyncSettings = syncSettings;
  syncSettings = function () {
    originalSyncSettings();
    const musicRange = document.querySelector('#musicVolumeRange');
    const sfxRange = document.querySelector('#sfxVolumeRange');
    if (musicRange) musicRange.value = save.settings.musicVolume;
    if (sfxRange) sfxRange.value = save.settings.sfxVolume;
  };

  document.body.insertAdjacentHTML('beforeend', `
    <div id="healFlash" aria-hidden="true"><div class="heal-cross">✚</div></div>
    <div id="bossAlert" aria-live="assertive"><span class="boss-alert-kicker">AMEAÇA ÔMEGA DETECTADA</span><strong id="bossAlertName">CHEFE</strong><small>Prepare-se para o contato</small></div>
    <div id="reloadIndicator" aria-hidden="true"><div class="reload-spinner"></div><span>RECARREGANDO</span></div>
  `);

  function triggerHealFeedback(amount = 0, force = false) {
    const player = game?.player;
    if (!player || amount <= 0) return;
    const threshold = Math.max(3, player.maxHp * 0.05);
    if (!force && amount < threshold) return;
    const time = nowMs();
    if (time - (triggerHealFeedback.last || 0) < 650) return;
    triggerHealFeedback.last = time;
    gameAudio.play('heal');
    const flash = document.querySelector('#healFlash');
    flash?.classList.remove('show');
    void flash?.offsetWidth;
    flash?.classList.add('show');
    clearTimeout(triggerHealFeedback.timer);
    triggerHealFeedback.timer = setTimeout(() => flash?.classList.remove('show'), 560);
  }

  const originalHeal = Player.prototype.heal;
  Player.prototype.heal = function (value) {
    const before = this.hp;
    const result = originalHeal.call(this, value);
    triggerHealFeedback(this.hp - before);
    return result;
  };

  const originalStartNightAudio = startNight;
  startNight = function () {
    const before = game.player?.hp ?? 0;
    const result = originalStartNightAudio.apply(this, arguments);
    triggerHealFeedback((game.player?.hp ?? before) - before);
    return result;
  };
  const originalStartDawnAudio = startDawn;
  startDawn = function () {
    const before = game.player?.hp ?? 0;
    const result = originalStartDawnAudio.apply(this, arguments);
    triggerHealFeedback((game.player?.hp ?? before) - before);
    return result;
  };

  const transactionButtons = [
    '[data-buy]', '[data-merchant-buy]', '[data-sell]', '[data-special-buy]',
    '[data-ammo-buy]'
  ].join(',');
  const reservedFutureAudioButtons = '#repairBtn, #fusionBtn';

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const button = target?.closest('button');
    if (!button || button.disabled || !button.closest('.screen')) return;
    if (button.matches(transactionButtons) || button.matches(reservedFutureAudioButtons) || button.closest('#mobileControls')) return;
    gameAudio.play('menuButton');
  });

  // As rotinas comerciais vivem dentro de um módulo fechado. O snapshot no
  // pointerdown e a conferência após o click detectam somente transações reais,
  // sem tocar em reparo ou fusão (sons reservados para arquivos futuros).
  document.addEventListener('pointerdown', event => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const button = target?.closest(transactionButtons);
    if (!button) return;
    button.__audioTransactionSnapshot = {
      scrap: Number(game.scrap) || 0,
      blood: Number(game.blood) || 0,
      hp: Number(game.player?.hp) || 0
    };
  }, true);
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const button = target?.closest(transactionButtons);
    if (!button) return;
    const before = button.__audioTransactionSnapshot;
    delete button.__audioTransactionSnapshot;
    if (!before) return;
    queueMicrotask(() => {
      const changed = (Number(game.scrap) || 0) !== before.scrap || (Number(game.blood) || 0) !== before.blood;
      if (changed) gameAudio.play('trade');
      const healed = (Number(game.player?.hp) || before.hp) - before.hp;
      if (healed > 0) triggerHealFeedback(healed, true);
    });
  });

  // Caixas também pertencem ao módulo fechado. Cada instância é instrumentada
  // uma única vez assim que aparece no mundo.
  function instrumentLootCrates() {
    for (const crate of game.lootCrates || []) {
      if (!crate || crate.__externalAudioWrapped || typeof crate.breakOpen !== 'function') continue;
      crate.__externalAudioWrapped = true;
      const originalBreakOpen = crate.breakOpen;
      crate.breakOpen = function () {
        const wasDead = this.dead;
        const result = originalBreakOpen.apply(this, arguments);
        if (!wasDead && this.dead) gameAudio.playSpatial('crate', this, 950, 1);
        return result;
      };
    }
  }
  setInterval(instrumentLootCrates, 900);

  // Detecta o início da recarga independentemente de qual atalho, botão ou
  // rotina automática do módulo interno a iniciou.
  let previousReloadTimer = 0;
  setInterval(() => {
    const timer = Number(game.player?.reloadTimer) || 0;
    if (timer > 0 && previousReloadTimer <= 0) gameAudio.play('reload');
    previousReloadTimer = timer;
  }, 90);

  function meleeWouldHit(player, weapon) {
    const def = weapon.def;
    const rarity = DBG.rarityById?.(weapon.rarity) || { mult: 1 };
    const range = (def.range || 90) * (1 + (rarity.mult - 1) * 0.1);
    const angleLimit = weapon.baseId === 'axe' ? 1 : 0.78;
    for (const enemy of game.enemies) {
      if (enemy.dead) continue;
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const distance = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const difference = Math.abs(Math.atan2(Math.sin(angle - player.angle), Math.cos(angle - player.angle)));
      if (distance < range + enemy.r && difference < angleLimit) return true;
    }
    return (game.lootCrates || []).some(crate => !crate.dead && dist(player, crate) < range + crate.r);
  }

  // Mapeamento explícito por arma. Algumas armas compartilham categoria de
  // munição, mas precisam de uma identidade sonora diferente. A Widowmaker,
  // por exemplo, continua sendo um revólver para a munição, porém usa o
  // disparo pesado de precisão.
  const weaponAudioProfiles = Object.freeze({
    starter: 'gunshot',
    pawp: 'sniper',
    twin: 'gunshot',
    thompson: 'machineGun',
    killerbee: 'bazooka',
    kitchen: 'melee',
    axe: 'melee',
    crowbar: 'melee',
    pumper: 'shotgun',
    chainsaw: 'shotgun',
    ashmaker: 'machineGun',
    widow: 'sniper',
    nailgun: 'machineGun',
    crossbow: 'crossbow',
    boomstick: 'shotgun',
    harvester: 'melee'
  });
  function audioProfileForWeapon(weapon) {
    if (!weapon) return null;
    const explicit = weaponAudioProfiles[weapon.baseId];
    if (explicit) return explicit;
    if (weapon.def?.kind === 'melee') return 'melee';
    if (weapon.def?.kind === 'launcher') return 'bazooka';
    if (weapon.def?.kind === 'shotgun') return 'shotgun';
    if (weapon.def?.kind === 'sniper') return 'sniper';
    if (weapon.def?.auto && (weapon.def?.kind === 'smg' || weapon.def?.kind === 'rifle')) return 'machineGun';
    return 'gunshot';
  }
  window.__deadSignalWeaponAudioProfile = audioProfileForWeapon;

  const originalShootAudio = Player.prototype.shoot;
  Player.prototype.shoot = function () {
    const weapon = DBG.currentWeapon?.();
    const canAttempt = Boolean(
      weapon && this.fireCd <= 0 && !game.paused && this.reloadTimer <= 0 &&
      !weapon.broken && weapon.durability > 0
    );
    const profile = audioProfileForWeapon(weapon);
    const melee = profile === 'melee';
    const enoughAmmo = melee || (weapon && weapon.mag >= (weapon.def.ammoCost || 1));
    const meleeHit = canAttempt && melee ? meleeWouldHit(this, weapon) : false;
    const result = originalShootAudio.apply(this, arguments);
    if (!canAttempt || !enoughAmmo) return result;
    if (profile === 'melee') gameAudio.play(meleeHit ? 'meleeHit' : 'meleeMiss');
    else if (profile === 'machineGun') gameAudio.startLoop('machineGun');
    else gameAudio.play(profile || 'gunshot');
    return result;
  };

  setInterval(() => {
    const player = game?.player;
    const weapon = DBG.currentWeapon?.();
    const mobileFiring = Boolean(touch?.aim?.active && Math.hypot(touch.aim.x || 0, touch.aim.y || 0) > 0.24);
    const holdingFire = Boolean(game?.mouse?.down || mobileFiring);
    const shouldLoop = Boolean(
      game?.running && !game.paused && player && player.quickSlotMode !== 'support' && holdingFire &&
      weapon && !weapon.broken && player.reloadTimer <= 0 &&
      weapon.mag >= (weapon.def.ammoCost || 1) &&
      audioProfileForWeapon(weapon) === 'machineGun'
    );
    if (shouldLoop) gameAudio.startLoop('machineGun');
    else gameAudio.stopLoop('machineGun');
  }, 70);

  const originalBulletUpdateAudio = Bullet.prototype.update;
  Bullet.prototype.update = function (dt) {
    const isRocket = Boolean(this.explosive);
    const wasAlive = this.life > 0;
    const result = originalBulletUpdateAudio.call(this, dt);
    if (isRocket && wasAlive && this.life <= 0 && !this.__externalExplosionSound) {
      this.__externalExplosionSound = true;
      gameAudio.playSpatial('explosion', this, 1250, 1);
    }
    return result;
  };

  function showBossAlert(name) {
    const alert = document.querySelector('#bossAlert');
    const label = document.querySelector('#bossAlertName');
    if (!alert || !label) return;
    label.textContent = name || 'AMEAÇA ÔMEGA';
    alert.classList.remove('show');
    void alert.offsetWidth;
    alert.classList.add('show');
    clearTimeout(showBossAlert.timer);
    showBossAlert.timer = setTimeout(() => alert.classList.remove('show'), 6000);
  }

  const originalSpawnBossAudio = spawnBoss;
  spawnBoss = function () {
    const before = game.boss;
    const result = originalSpawnBossAudio.apply(this, arguments);
    if (!before && game.boss) {
      showBossAlert(game.boss.name);
      gameAudio.play('alarm');
      game.boss.__nextVoiceAt = nowMs() + 9200;
    }
    return result;
  };

  let nextZombieVoice = 0;
  setInterval(() => {
    if (!game.running || game.paused || game.phase !== 'night' || !game.player) return;
    const time = nowMs();
    const boss = game.boss;
    if (boss && !boss.dead && time >= (boss.__nextVoiceAt || 0)) {
      gameAudio.playSpatial('boss', boss, 1650, 1);
      boss.__nextVoiceAt = time + rand(9000, 16000);
    }
    if (time < nextZombieVoice) return;
    const candidates = game.enemies.filter(enemy => {
      if (enemy.dead || enemy === boss) return false;
      if (time < (enemy.__nextVoiceAt || 0)) return false;
      return dist(enemy, game.player) < 1050;
    });
    if (!candidates.length) {
      nextZombieVoice = time + 1100;
      return;
    }
    candidates.sort((a, b) => dist(a, game.player) - dist(b, game.player));
    const pool = candidates.slice(0, Math.min(8, candidates.length));
    const enemy = pool[(Math.random() * pool.length) | 0];
    if (Math.random() < 0.58) {
      gameAudio.playSpatial('zombie', enemy, 1050, 0.9);
      enemy.__nextVoiceAt = time + rand(12000, 24000);
      nextZombieVoice = time + rand(5200, 8500);
    } else {
      nextZombieVoice = time + 900;
    }
  }, 650);

  function updateReloadIndicator() {
    const indicator = document.querySelector('#reloadIndicator');
    const player = game?.player;
    if (!indicator || !game.running || !player || player.reloadTimer <= 0 || game.paused) {
      indicator?.classList.remove('show');
      requestAnimationFrame(updateReloadIndicator);
      return;
    }
    const x = player.x - game.camera.x;
    const y = player.y - game.camera.y - 46;
    const progress = clamp01(1 - player.reloadTimer / (player.reloadTotal || 1));
    indicator.style.left = `${x}px`;
    indicator.style.top = `${y}px`;
    indicator.style.setProperty('--reload-progress', `${progress * 360}deg`);
    indicator.classList.add('show');
    requestAnimationFrame(updateReloadIndicator);
  }
  requestAnimationFrame(updateReloadIndicator);

  const version = document.querySelector('#mainMenu .version');
  if (version) version.textContent = 'Combat & Arsenal Reforged 4.0';
  const menuLead = document.querySelector('#mainMenu .lead');
  if (menuLead) menuLead.textContent = 'Survival horror com áudio dinâmico, arsenal detalhado, lojas integradas, interface compacta e ameaças que ganham presença conforme se aproximam.';

  const visibleWeaponDefs = typeof WEAPON_DEFS === 'object' ? WEAPON_DEFS : null;
  const audioAudit = Object.keys(visibleWeaponDefs || weaponAudioProfiles).map(baseId => ({
    baseId,
    arma: visibleWeaponDefs?.[baseId]?.name || baseId,
    perfil: audioProfileForWeapon({ baseId, def: visibleWeaponDefs?.[baseId] || {} })
  }));
  window.__deadSignalAudioAudit={
    profiles:weaponAudioProfiles,
    profileForWeapon:audioProfileForWeapon,
    effects:gameAudio.effectDefs,
    music:gameAudio.musicDefs,
    weapons:audioAudit
  };
  console.info('[Dead Signal] Áudio externo revisado: sons por arma, recarga, vazio, impactos, lojas, habilidades e ambiente.', audioAudit);
})();
