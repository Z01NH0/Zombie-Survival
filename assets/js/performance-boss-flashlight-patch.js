(() => {
  'use strict';
  if (typeof game === 'undefined' || typeof Player === 'undefined' || typeof Enemy === 'undefined' || typeof Boss === 'undefined') return;

  const DBG = window.__arsenalDebug || {};
  const TOP = window.__topDownDebug || {};
  const MAX_HOSTILES = 30;
  const aliveEnemies = () => (game.enemies || []).filter(enemy => enemy && !enemy.dead);
  const isBossWave = () => Number(game.night || 0) > 0 && game.night % 4 === 0;
  const isBossLocked = () => isBossWave() && Boolean(game.boss || game.__bossDeathPending || game.bossNight === game.night);

  /* ------------------------------------------------------------------
     Spawn budget: every enemy creation route respects the same ceiling.
  ------------------------------------------------------------------ */
  const spawnEnemyBeforeBudget = spawnEnemy;
  spawnEnemy = function () {
    const reserveForBoss = isBossWave() && game.bossNight !== game.night ? 1 : 0;
    if (aliveEnemies().length >= MAX_HOSTILES - reserveForBoss) return;
    return spawnEnemyBeforeBudget.apply(this, arguments);
  };

  const spawnEnemyNearBeforeBudget = spawnEnemyNear;
  spawnEnemyNear = function () {
    const reserveForBoss = isBossWave() && game.bossNight !== game.night ? 1 : 0;
    if (aliveEnemies().length >= MAX_HOSTILES - reserveForBoss) return;
    return spawnEnemyNearBeforeBudget.apply(this, arguments);
  };

  const spawnBossBeforeBudget = spawnBoss;
  spawnBoss = function () {
    if (game.boss && !game.boss.dead) return;
    let alive = aliveEnemies();
    while (alive.length >= MAX_HOSTILES) {
      let index = -1;
      let farthest = -1;
      for (let i = 0; i < game.enemies.length; i++) {
        const enemy = game.enemies[i];
        if (!enemy || enemy.dead || enemy instanceof Boss) continue;
        const distance = game.player ? Math.hypot(enemy.x - game.player.x, enemy.y - game.player.y) : 0;
        if (distance > farthest) { farthest = distance; index = i; }
      }
      if (index < 0) break;
      game.enemies.splice(index, 1);
      alive = aliveEnemies();
    }
    const result = spawnBossBeforeBudget.apply(this, arguments);
    if (game.boss) {
      game.nightTime = Math.max(1, game.nightTime || 0);
      game.__bossNightActive = true;
    }
    return result;
  };

  function enforceRuntimeBudgets() {
    const keepTail = (array, limit) => {
      if (!Array.isArray(array) || array.length <= limit) return;
      array.splice(0, array.length - limit);
    };
    const particleLimit = save?.settings?.quality === 'low' ? 420 : save?.settings?.quality === 'medium' ? 600 : 760;
    keepTail(game.particles, particleLimit);
    keepTail(game.enemyBullets, 220);
    keepTail(game.bullets, 280);
    keepTail(game.fields, 125);
    keepTail(game.texts, 110);
    keepTail(game.pickups, 90);

    let alive = aliveEnemies();
    while (alive.length > MAX_HOSTILES) {
      let index = -1;
      let farthest = -1;
      for (let i = 0; i < game.enemies.length; i++) {
        const enemy = game.enemies[i];
        if (!enemy || enemy.dead || enemy instanceof Boss) continue;
        const d = game.player ? Math.hypot(enemy.x - game.player.x, enemy.y - game.player.y) : 0;
        if (d > farthest) { farthest = d; index = i; }
      }
      if (index < 0) break;
      game.enemies.splice(index, 1);
      alive = aliveEnemies();
    }
  }

  /* ------------------------------------------------------------------
     Flashlight battery and visibility.
  ------------------------------------------------------------------ */
  document.querySelector('#hud')?.insertAdjacentHTML('beforeend', `
    <div id="flashlightBatteryHud" aria-label="Carga da lanterna">
      <span class="battery-icon">🔋</span>
      <div class="battery-track"><div class="battery-fill"></div></div>
      <span class="battery-value">100%</span>
    </div>
  `);
  const batteryHud = document.querySelector('#flashlightBatteryHud');
  const batteryFill = batteryHud?.querySelector('.battery-fill');
  const batteryValue = batteryHud?.querySelector('.battery-value');

  function ensureBattery() {
    if (!game.flashlight) game.flashlight = { range: 460, arc: .56, near: 92 };
    game.flashlight.maxBattery = Number(game.flashlight.maxBattery) || 100;
    if (!Number.isFinite(game.flashlight.battery)) game.flashlight.battery = game.flashlight.maxBattery;
    game.flashlight.battery = Math.max(0, Math.min(game.flashlight.maxBattery, game.flashlight.battery));
  }

  function batteryPercent() {
    ensureBattery();
    return Math.max(0, Math.min(100, game.flashlight.battery / game.flashlight.maxBattery * 100));
  }

  function renderBatteryHud() {
    if (!batteryHud) return;
    const percent = batteryPercent();
    batteryFill.style.width = `${percent}%`;
    batteryValue.textContent = `${Math.ceil(percent)}%`;
    batteryHud.classList.toggle('low', percent > 0 && percent <= 25);
    batteryHud.classList.toggle('depleted', percent <= 0);
    batteryHud.style.display = game.running ? 'flex' : 'none';
  }

  window.__flashlightBatteryFeedback = amount => {
    ensureBattery();
    game.__batteryWarningShown = false;
    game.__batteryEmptyShown = false;
    renderBatteryHud();
    DBG.transactionFeedback?.(`Lanterna: +${Math.round(amount)}% de carga`, 'success', '🔋');
    notice(`BATERIA DA LANTERNA +${Math.round(amount)}%`);
  };

  const startGameBeforeBattery = startGame;
  startGame = function () {
    const result = startGameBeforeBattery.apply(this, arguments);
    ensureBattery();
    game.flashlight.battery = game.flashlight.maxBattery;
    game.__batteryWarningShown = false;
    game.__batteryEmptyShown = false;
    game.__bossDeathPending = false;
    game.__bossNightActive = false;
    renderBatteryHud();
    return result;
  };
  const startNightBeforeBattery = startNight;
  startNight = function () {
    const result = startNightBeforeBattery.apply(this, arguments);
    ensureBattery();
    game.__batteryWarningShown = false;
    game.__batteryEmptyShown = game.flashlight.battery <= 0;
    renderBatteryHud();
    return result;
  };

  const eyeVisibilityBeforeBattery = eyeVisibility;
  eyeVisibility = function (enemy) {
    const base = eyeVisibilityBeforeBattery.call(this, enemy);
    const factor = enemy instanceof Boss ? .68 : .52;
    return Math.max(.018, base * factor);
  };

  const bodyVisibilityBeforeBattery = bodyVisibility;
  bodyVisibility = function (enemy) {
    ensureBattery();
    if (game.phase !== 'night' || game.flashlight.battery > 0) return bodyVisibilityBeforeBattery.call(this, enemy);
    const near = Math.max(50, (game.flashlight.near || 92) * .68);
    const d = Math.hypot(enemy.x - game.player.x, enemy.y - game.player.y);
    return Math.max(0, Math.min(.22, (1 - d / near) * .22));
  };

  const drawLightingBeforeBattery = drawLighting;
  drawLighting = function () {
    ensureBattery();
    if (game.phase !== 'night' || game.flashlight.battery > 0) return drawLightingBeforeBattery.apply(this, arguments);
    if (!game.player) return;
    const px = game.player.x - game.camera.x;
    const py = game.player.y - game.camera.y;
    const near = Math.max(48, (game.flashlight.near || 92) * .68);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.moveTo(px + near, py);
    ctx.arc(px, py, near, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,.91)';
    ctx.fill('evenodd');
    const vignette = ctx.createRadialGradient(px, py, near * .32, px, py, near * 1.4);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,.54)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  };

  /* ------------------------------------------------------------------
     Boss death sequence and exclusive rewards.
  ------------------------------------------------------------------ */
  document.body.insertAdjacentHTML('beforeend', '<div id="bossDeathBanner" class="boss-death-banner"><span>Ameaça neutralizada</span><strong>O SINAL CAIU</strong></div>');
  const bossDeathBanner = document.querySelector('#bossDeathBanner');

  class BossRewardDrop {
    constructor(x, y, item, label, color = '#ffd166') {
      this.x = x; this.y = y; this.item = item; this.label = label; this.color = color;
      this.r = 15; this.life = 99999; this.phase = Math.random() * TAU;
    }
    collect() {
      if (this.item?.resource) {
        game.scrap += this.item.scrap || 0;
        game.blood = (game.blood || 0) + (this.item.blood || 0);
        DBG.transactionFeedback?.(`${this.label}: +${this.item.scrap || 0} sucata, +${this.item.blood || 0} sangue`, 'legendary', '☠');
        return;
      }
      const ok = DBG.addToInventory?.(this.item, true);
      if (!ok) {
        setTimeout(() => {
          if (game.running && !game.pickups.includes(this)) game.pickups.push(this);
        }, 0);
        return;
      }
      DBG.transactionFeedback?.(`${this.label} coletado`, 'legendary', this.item?.def?.icon || '✦');
    }
    draw() {
      const bob = Math.sin(game.time * 4 + this.phase) * 5;
      ctx.save(); ctx.translate(this.x, this.y + bob); ctx.rotate(game.time * .8 + this.phase);
      ctx.shadowBlur = 28; ctx.shadowColor = this.color;
      ctx.fillStyle = 'rgba(7,10,16,.94)'; ctx.strokeStyle = this.color; ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU - Math.PI / 2;
        const r = i % 2 ? 12 : 18;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.rotate(-(game.time * .8 + this.phase));
      ctx.fillStyle = '#fff'; ctx.font = '900 13px ui-monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.item?.def?.icon || '✦', 0, 1); ctx.restore();
    }
  }

  function weaponAmmoType(weapon) {
    return TOP.ammoCategoryForWeapon?.(weapon) || (
      weapon?.baseId === 'crossbow' ? 'arrows' : weapon?.baseId === 'nailgun' ? 'nails' :
      weapon?.def?.kind === 'launcher' ? 'rockets' : weapon?.def?.kind === 'shotgun' ? 'shells' :
      weapon?.def?.kind === 'sniper' ? 'precision' : ['smg', 'rifle'].includes(weapon?.def?.kind) ? 'light' : 'handgun'
    );
  }

  function createOmegaWeapon() {
    const ids = ['pawp', 'thompson', 'killerbee', 'ashmaker', 'widow', 'nailgun', 'crossbow', 'boomstick', 'harvester'];
    const rarity = game.night >= 12 ? 'platinum' : game.night >= 8 ? 'diamond' : 'gold';
    const item = DBG.makeWeapon?.(ids[(Math.random() * ids.length) | 0], rarity);
    if (!item) return null;
    item.name = `Relíquia Ômega • ${item.def.name}`;
    item.damage *= 1.12;
    if (Number.isFinite(item.maxDurability)) {
      item.maxDurability = Math.round(item.maxDurability * 1.2);
      item.durability = item.maxDurability;
    }
    item.omegaDrop = true;
    return item;
  }

  function spawnBossRewards(x, y) {
    const gear = createOmegaWeapon();
    const battery = DBG.makeConsumable?.('battery', 2);
    const current = DBG.currentWeapon?.();
    const ammo = TOP.makeAmmoPack?.(weaponAmmoType(current), 1);
    if (gear) game.pickups.push(new BossRewardDrop(x - 54, y, gear, 'Relíquia Ômega', '#ff5e7d'));
    if (battery) game.pickups.push(new BossRewardDrop(x, y - 20, battery, 'Células de lanterna', '#58f2a2'));
    if (ammo) game.pickups.push(new BossRewardDrop(x + 54, y, ammo, 'Suprimento Ômega', '#65e8ff'));
    game.pickups.push(new BossRewardDrop(x, y + 48, { resource: true, scrap: 28 + game.night * 3, blood: 4 + Math.floor(game.night / 4) }, 'Fragmento do chefe', '#ffd166'));
  }

  class BossDeathCinematic {
    constructor(x, y, radius, name) {
      this.x = x; this.y = y; this.r = radius; this.name = name;
      this.life = 2.8; this.maxLife = 2.8; this.tick = 0; this.done = false;
    }
    update(dt) {
      this.life -= dt; this.tick -= dt;
      if (this.tick <= 0) {
        this.tick = .075;
        const a = Math.random() * TAU, rr = Math.random() * this.r * 1.15;
        burst(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr, Math.random() < .55 ? '#ff3558' : '#ffd166', 5, 170, 5);
        if (Math.random() < .3) sparks(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr, '#fff3c4', 3);
      }
      if (this.life <= 0 && !this.done) {
        this.done = true;
        spawnBossRewards(this.x, this.y);
        game.__bossDeathPending = false;
        game.__bossNightActive = false;
        bossDeathBanner?.classList.remove('show');
        if (game.running) startDawn();
      }
    }
    draw() {
      const p = Math.max(0, Math.min(1, 1 - this.life / this.maxLife));
      ctx.save(); ctx.translate(this.x, this.y);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const rr = this.r * (.42 + p * 1.4 + i * .12);
        ctx.globalAlpha = Math.max(0, (1 - p) * (.65 - i * .08));
        ctx.strokeStyle = i % 2 ? '#ffd166' : '#ff3558'; ctx.lineWidth = 8 - i;
        ctx.beginPath(); ctx.arc(0, 0, Math.max(.1, rr), game.time * (i % 2 ? -1.5 : 1.2) + i, game.time * (i % 2 ? -1.5 : 1.2) + i + Math.PI * 1.3); ctx.stroke();
      }
      ctx.globalAlpha = Math.max(0, 1 - p);
      ctx.fillStyle = '#fff'; ctx.shadowBlur = 45; ctx.shadowColor = '#ff3558';
      ctx.beginPath(); ctx.arc(0, 0, Math.max(3, this.r * (1 - p * .72)), 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  const enemyUpdateBeforeDeathFreeze = Enemy.prototype.update;
  Enemy.prototype.update = function (dt) {
    if (game.__bossDeathPending && !(this instanceof Boss)) return;
    return enemyUpdateBeforeDeathFreeze.call(this, dt);
  };

  const bossDieBeforeCinematic = Boss.prototype.die;
  Boss.prototype.die = function () {
    if (this.dead || this.__deathCinematicStarted) return;
    this.__deathCinematicStarted = true;
    const data = { x: this.x, y: this.y, r: this.r, name: this.name };
    const result = bossDieBeforeCinematic.apply(this, arguments);
    if (isBossWave() && game.phase === 'night') {
      game.__bossDeathPending = true;
      game.__bossNightActive = true;
      game.nightTime = Math.max(1, game.nightTime || 0);
      game.enemyBullets.length = 0;
      game.fields.push(new BossDeathCinematic(data.x, data.y, data.r, data.name));
      bossDeathBanner?.classList.add('show');
      notice('O CHEFE ESTÁ COLAPSANDO');
      game.flash = Math.max(game.flash || 0, .9);
      screenShake(18);
    }
    return result;
  };

  const startDawnBeforeBossReset = startDawn;
  startDawn = function () {
    game.__bossDeathPending = false;
    game.__bossNightActive = false;
    bossDeathBanner?.classList.remove('show');
    const result = startDawnBeforeBossReset.apply(this, arguments);
    renderBatteryHud();
    return result;
  };

  /* ------------------------------------------------------------------
     Main update wrapper: infinite boss night, battery drain and budgets.
  ------------------------------------------------------------------ */
  const updateBeforePerformance = update;
  update = function (dt) {
    if (game.phase === 'night' && isBossWave()) {
      if (game.boss || game.__bossDeathPending || game.bossNight === game.night) {
        game.nightTime = Math.max(1, game.nightTime || 0);
      } else if ((game.nightTime || 0) < .55) {
        // Gives the boss-spawn condition one safe frame before dawn can trigger.
        game.nightTime = .55;
      }
    }

    const result = updateBeforePerformance.call(this, dt);

    if (game.running && !game.paused && game.phase === 'night') {
      ensureBattery();
      const drain = selectedDifficulty === 'nightmare' ? .82 : selectedDifficulty === 'survivor' ? .58 : .70;
      game.flashlight.battery = Math.max(0, game.flashlight.battery - drain * dt);
      const percent = batteryPercent();
      if (percent <= 20 && percent > 0 && !game.__batteryWarningShown) {
        game.__batteryWarningShown = true;
        notice('BATERIA DA LANTERNA QUASE VAZIA');
      }
      if (percent <= 0 && !game.__batteryEmptyShown) {
        game.__batteryEmptyShown = true;
        notice('LANTERNA SEM CARGA • USE UMA BATERIA');
      }
    }
    enforceRuntimeBudgets();
    renderBatteryHud();
    return result;
  };

  const updateHUDBeforeBossTimer = updateHUD;
  updateHUD = function () {
    const result = updateHUDBeforeBossTimer.apply(this, arguments);
    if (game.phase === 'night' && isBossLocked()) {
      const timer = document.querySelector('#phaseTimer');
      const phase = document.querySelector('#phaseText');
      if (timer) timer.textContent = '∞ CHEFE';
      if (phase) phase.textContent = '☠';
    }
    renderBatteryHud();
    return result;
  };

  const version = document.querySelector('#mainMenu .version');
  if (version) version.textContent = 'Nightfall Endurance 8.0';
  console.info('[Dead Signal] Performance, boss wave, ammo economy and flashlight battery patch 8.0 loaded.');
})();
