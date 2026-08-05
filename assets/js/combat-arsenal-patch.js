(() => {
  'use strict';

  if (typeof game === 'undefined' || typeof Player === 'undefined' || !window.__arsenalDebug) return;

  const DBG = window.__arsenalDebug;
  const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
  const currentWeapon = () => DBG.currentWeapon?.();
  const itemColor = item => DBG.itemColor?.(item) || '#65e8ff';
  const rarityById = id => DBG.rarityById?.(id) || { mult: 1 };
  const withUltimateDamage = callback => {
    window.__deadSignalUltimateDamageDepth = (window.__deadSignalUltimateDamageDepth || 0) + 1;
    try { return callback(); }
    finally { window.__deadSignalUltimateDamageDepth = Math.max(0, (window.__deadSignalUltimateDamageDepth || 1) - 1); }
  };

  const ammoCategories = {
    handgun: { name: 'Munição de Pistola', icon: '▰', kinds: ['pistol', 'dual', 'revolver'], ratio: .357, flat: 20 },
    light: { name: 'Munição Leve', icon: '▥', kinds: ['smg', 'rifle'], excludeBaseIds: ['nailgun'], ratio: .323, flat: 47 },
    shells: { name: 'Cartuchos de Escopeta', icon: '▤', kinds: ['shotgun'], ratio: .306, flat: 20 },
    precision: { name: 'Munição de Precisão', icon: '◆', kinds: ['sniper'], excludeBaseIds: ['crossbow'], ratio: .289, flat: 9 },
    rockets: { name: 'Mísseis Compactos', icon: '▲', kinds: ['launcher'], ratio: .425, flat: 2 },
    arrows: { name: 'Flechas Reforçadas', icon: '➶', baseIds: ['crossbow'], ratio: .30, flat: 8 },
    nails: { name: 'Pregos Industriais', icon: '⌁', baseIds: ['nailgun'], ratio: .25, flat: 40 }
  };

  const ammoTypeAliases = Object.freeze({
    handgun: 'handgun', pistol: 'handgun', pistola: 'handgun', revolver: 'handgun',
    light: 'light', leve: 'light', smg: 'light', sub: 'light', submetralhadora: 'light', rifle: 'light',
    shells: 'shells', shell: 'shells', shotgun: 'shells', escopeta: 'shells', cartucho: 'shells', cartuchos: 'shells',
    precision: 'precision', precisao: 'precision', sniper: 'precision', fuzilprecisao: 'precision',
    rockets: 'rockets', rocket: 'rockets', foguete: 'rockets', foguetes: 'rockets', missil: 'rockets', misseis: 'rockets',
    arrows: 'arrows', arrow: 'arrows', flecha: 'arrows', flechas: 'arrows', crossbow: 'arrows', silentfang: 'arrows', silverfang: 'arrows',
    nails: 'nails', nail: 'nails', prego: 'nails', pregos: 'nails', nailgun: 'nails', nailstorm: 'nails'
  });

  function normalizedToken(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/^ammo[_\s-]*/, '').replace(/[^a-z0-9]/g, '');
  }

  function normalizeAmmoType(value) {
    const token = normalizedToken(value);
    return ammoTypeAliases[token] || (ammoCategories[token] ? token : null);
  }

  function weaponTokens(weapon) {
    return [weapon?.baseId, weapon?.ammoType, weapon?.def?.ammoType, weapon?.name, weapon?.def?.name]
      .map(normalizedToken).filter(Boolean);
  }

  function categoryMatchesWeapon(category, weapon) {
    if (!category || !weapon?.def) return false;
    const tokens = weaponTokens(weapon);
    const baseIds = (category.baseIds || []).map(normalizedToken);
    const excluded = (category.excludeBaseIds || []).map(normalizedToken);
    if (tokens.some(token => baseIds.includes(token))) return true;
    if (tokens.some(token => excluded.includes(token))) return false;
    if (category === ammoCategories.arrows && tokens.some(token => /crossbow|silentfang|silverfang/.test(token))) return true;
    if (category === ammoCategories.nails && tokens.some(token => /nailgun|nailstorm|pregadora/.test(token))) return true;
    return category.kinds?.includes(weapon.def.kind) || false;
  }

  function ammoTypeForWeapon(weapon) {
    if (!weapon?.def) return null;
    const explicit = normalizeAmmoType(weapon.ammoType || weapon.def.ammoType);
    if (explicit) return explicit;
    return Object.keys(ammoCategories).find(type => categoryMatchesWeapon(ammoCategories[type], weapon)) || null;
  }

  function resolveAmmoType(item) {
    if (!item) return null;
    const candidates = [item.ammoType, item.baseId, item.id, item.name, item.def?.name, item.def?.ammoType];
    for (const candidate of candidates) {
      const type = normalizeAmmoType(candidate);
      if (type) return type;
    }
    return null;
  }

  function allOwnedWeaponRefs() {
    const player = game.player;
    if (!player) return [];
    const refs = [];
    (player.weaponSlots || []).forEach((item, index) => {
      if (item?.type === 'weapon') refs.push({ source: 'weapon', index, item });
    });
    (player.inventory || []).forEach((item, index) => {
      if (item?.type === 'weapon') refs.push({ source: 'inventory', index, item });
    });
    const seen = new Set();
    return refs.filter(ref => {
      const key = ref.item.uid || `${ref.source}:${ref.index}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function removeOneConsumable(item, ref) {
    const player = game.player;
    item.count = (item.count || 1) - 1;
    if (item.count > 0) return true;
    if (ref?.source === 'inventory' && player.inventory?.[ref.index] === item) player.inventory[ref.index] = null;
    return false;
  }

  function closeAmmoModal() {
    document.querySelector('#ammoAllocationModal')?.classList.remove('show');
  }

  function refreshInventorySelection(item, ref) {
    DBG.renderInventory?.();
    if (item?.count > 0 && ref?.source === 'inventory' && game.player?.inventory?.[ref.index] === item) {
      DBG.selectItem?.({ source: 'inventory', index: ref.index, item });
    } else {
      const content = document.querySelector('#scanContent');
      const actions = document.querySelector('#itemActionArea');
      if (content) content.innerHTML = '<h3 class="scan-title">Item utilizado</h3><p class="scan-desc">Selecione outro item para continuar.</p>';
      if (actions) actions.innerHTML = '';
    }
    updateHUD?.();
  }

  function openAmmoModal(item, ref) {
    const modal = document.querySelector('#ammoAllocationModal');
    const list = document.querySelector('#ammoWeaponList');
    const title = document.querySelector('#ammoAllocationTitle');
    const subtitle = document.querySelector('#ammoAllocationSubtitle');
    if (!modal || !list) return false;

    let type = resolveAmmoType(item);
    const genericPack = normalizedToken(item.baseId) === 'ammopack';
    if (!type && genericPack) type = ammoTypeForWeapon(currentWeapon());
    const category = ammoCategories[type] || null;
    const candidates = category ? allOwnedWeaponRefs().filter(refItem => {
      const weapon = refItem.item;
      if (!weapon?.def || weapon.def.kind === 'melee') return false;
      return categoryMatchesWeapon(category, weapon);
    }) : [];

    if (title) title.textContent = category?.name || item.name || 'Caixa de Munição';
    if (subtitle) subtitle.textContent = candidates.length
      ? 'Escolha somente uma arma para receber a munição.'
      : 'Você não possui nenhuma arma compatível com este pacote.';

    list.innerHTML = candidates.length ? candidates.map((weaponRef, index) => {
      const weapon = weaponRef.item;
      const amount = genericPack
        ? Math.ceil(weapon.maxReserve * .18)
        : Math.max(category.flat, Math.round(weapon.maxReserve * category.ratio));
      const actual = Math.max(0, Math.min(amount, weapon.maxReserve - weapon.reserve));
      const location = weaponRef.source === 'weapon' ? `Equipada no slot ${weaponRef.index + 1}` : 'Guardada no inventário';
      return `<button class="ammo-weapon-option ${actual <= 0 ? 'full' : ''}" data-ammo-weapon="${index}" ${actual <= 0 ? 'disabled' : ''}>
        <span class="ammo-weapon-icon">${weapon.def.icon || '▰'}</span>
        <span class="ammo-weapon-copy"><b style="color:${itemColor(weapon)}">${weapon.name}</b><small>${location} • ${weapon.mag}/${weapon.reserve} de ${weapon.maxReserve}</small></span>
        <span class="ammo-weapon-gain">${actual > 0 ? `+${actual}` : 'CHEIA'}</span>
      </button>`;
    }).join('') : '<div class="ammo-empty-state">Nenhuma arma compatível encontrada.</div>';

    list.querySelectorAll('[data-ammo-weapon]').forEach(button => {
      button.onclick = () => {
        const weaponRef = candidates[+button.dataset.ammoWeapon];
        if (!weaponRef) return;
        const weapon = weaponRef.item;
        const amount = genericPack
          ? Math.ceil(weapon.maxReserve * .18)
          : Math.max(category.flat, Math.round(weapon.maxReserve * category.ratio));
        const before = weapon.reserve;
        weapon.reserve = Math.min(weapon.maxReserve, weapon.reserve + amount);
        const gained = weapon.reserve - before;
        if (gained <= 0) return;
        removeOneConsumable(item, ref);
        closeAmmoModal();
        window.gameAudio?.play('menuButton', { gain: .72 });
        DBG.transactionFeedback?.(`${weapon.name}: +${gained} munições`, 'success', category?.icon || '▰');
        notice(`${weapon.name.toUpperCase()} RECEBEU +${gained} DE MUNIÇÃO`);
        refreshInventorySelection(item, ref);
      };
    });

    modal.dataset.ammoType = type || 'unknown';
    modal.classList.add('show');
    return true;
  }

  window.__requestAmmoAllocation = function (item, ref) {
    if (!item || item.type !== 'consumable') return false;
    const genericPack = normalizedToken(item.baseId) === 'ammopack';
    if (!genericPack && !resolveAmmoType(item)) return false;
    return openAmmoModal(item, ref);
  };

  window.__deadSignalAmmo = Object.freeze({
    categories: ammoCategories,
    normalizeAmmoType,
    resolveAmmoType,
    ammoTypeForWeapon,
    categoryMatchesWeapon,
    openAmmoModal
  });

  document.body.insertAdjacentHTML('beforeend', `
    <div id="ammoAllocationModal" class="ammo-allocation-modal" role="dialog" aria-modal="true" aria-labelledby="ammoAllocationTitle">
      <div class="ammo-allocation-panel">
        <div class="ammo-allocation-head">
          <div><span>Distribuição manual</span><h3 id="ammoAllocationTitle">Munição</h3><p id="ammoAllocationSubtitle">Escolha uma arma.</p></div>
          <button id="closeAmmoAllocation" class="ammo-modal-close" aria-label="Fechar">×</button>
        </div>
        <div id="ammoWeaponList" class="ammo-weapon-list"></div>
        <div class="ammo-allocation-note">O pacote será consumido apenas depois que uma arma for escolhida.</div>
      </div>
    </div>
  `);
  document.querySelector('#closeAmmoAllocation')?.addEventListener('click', closeAmmoModal);
  document.querySelector('#ammoAllocationModal')?.addEventListener('click', event => {
    if (event.target.id === 'ammoAllocationModal') closeAmmoModal();
  });

  class ScytheWave {
    constructor(owner, angle, damage, range) {
      this.owner = owner;
      this.x = owner.x + Math.cos(angle) * 30;
      this.y = owner.y + Math.sin(angle) * 30;
      this.a = angle;
      this.damage = damage;
      this.range = range;
      this.speed = 510;
      this.life = range / this.speed;
      this.maxLife = this.life;
      this.r = 58;
      this.hit = new Set();
      this.type = 'reaperScytheWave';
      this.healed = 0;
    }
    update(dt) {
      this.life -= dt;
      this.x += Math.cos(this.a) * this.speed * dt;
      this.y += Math.sin(this.a) * this.speed * dt;
      for (const enemy of game.enemies) {
        if (enemy.dead || this.hit.has(enemy)) continue;
        if (Math.hypot(enemy.x - this.x, enemy.y - this.y) > this.r + enemy.r) continue;
        this.hit.add(enemy);
        enemy.damage(this.damage, Math.random() < this.owner.crit);
        if (this.healed < 30) {
          const amount = Math.min(5, 30 - this.healed);
          this.owner.heal(amount);
          this.healed += amount;
        }
        burst(enemy.x, enemy.y, '#ff315d', 8, 130, 4);
      }
      if (typeof projectileHitsWorld === 'function' && projectileHitsWorld(this.x, this.y, this.x + Math.cos(this.a) * 7, this.y + Math.sin(this.a) * 7, 7)) this.life = 0;
    }
    draw() {
      const progress = 1 - this.life / this.maxLife;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.a);
      ctx.globalAlpha = clamp01(this.life / .16);
      ctx.shadowBlur = 28;
      ctx.shadowColor = '#ff315d';
      const gradient = ctx.createLinearGradient(-72, 0, 72, 0);
      gradient.addColorStop(0, 'rgba(255,49,93,0)');
      gradient.addColorStop(.48, '#ff315d');
      gradient.addColorStop(1, '#fff0f4');
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(0, 0, 64, -1.22 + progress * .12, 1.22 + progress * .12);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 72, -1.15, 1.15);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,49,93,.28)';
      ctx.beginPath();
      ctx.moveTo(-38, -12);
      ctx.quadraticCurveTo(18, 0, 66, 0);
      ctx.quadraticCurveTo(10, 18, -38, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  class GrenadeStrike {
    constructor(x, y, delay, damage, radius) {
      this.x = x;
      this.y = y;
      this.delay = delay;
      this.damage = damage;
      this.r = radius;
      this.life = delay + .72;
      this.maxLife = this.life;
      this.exploded = false;
      this.type = 'grenadeStrike';
    }
    update(dt) {
      this.life -= dt;
      this.delay -= dt;
      if (!this.exploded && this.delay <= 0) {
        this.exploded = true;
        withUltimateDamage(() => {
          for (const enemy of game.enemies) {
            const distance = Math.hypot(enemy.x - this.x, enemy.y - this.y);
            if (distance < this.r + enemy.r) enemy.damage(this.damage * (1 - Math.min(.72, distance / (this.r * 1.5))), false);
          }
        });
        window.gameAudio?.play('ultimateVanguard');
        if (typeof explosionFX === 'function') explosionFX(this.x, this.y, '#ff9b3d', this.r);
        burst(this.x, this.y, '#ffb34d', 34, 420, 7);
        shockwave(this.x, this.y, '#ff7a30', this.r * 1.08, .42, 8);
        screenShake(11);
      }
    }
    draw() {
      const beforeImpact = !this.exploded;
      ctx.save();
      ctx.translate(this.x, this.y);
      if (beforeImpact) {
        const pulse = .82 + Math.sin(game.time * 12) * .08;
        ctx.strokeStyle = 'rgba(255,167,74,.9)';
        ctx.fillStyle = 'rgba(255,92,38,.12)';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, this.r * pulse, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        const altitude = Math.max(0, this.delay) * 155;
        ctx.translate(0, -altitude - 28);
        ctx.rotate(game.time * 7);
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff9b3d';
        ctx.fillStyle = '#28313a';
        ctx.strokeStyle = '#ffb34d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-9, -13, 18, 26, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ff9b3d';
        ctx.fillRect(-4, -18, 8, 6);
      } else {
        const p = clamp01((.72 - Math.max(0, this.life)) / .72);
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = '#fff4d2';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, this.r * (.35 + p), 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  class TempestStormField {
    constructor(owner, duration, damage, radius) {
      this.owner = owner;
      this.x = owner.x;
      this.y = owner.y;
      this.r = radius;
      this.life = duration;
      this.maxLife = duration;
      this.damage = damage;
      this.tick = 0;
      this.type = 'tempestOverdrive';
      this.isUltimate = true;
    }
    update(dt) {
      this.life -= dt;
      this.x = this.owner.x;
      this.y = this.owner.y;
      this.tick -= dt;
      if (this.tick <= 0) {
        this.tick = .28;
        withUltimateDamage(() => {
          for (const enemy of game.enemies) {
            const distance = Math.hypot(enemy.x - this.x, enemy.y - this.y);
            if (distance < this.r + enemy.r) {
              enemy.damage(this.damage, false);
              if (Math.random() < .45) lineEffect(this.x + rand(-18, 18), this.y + rand(-18, 18), enemy.x, enemy.y, '#ffe26b', .13, 3.5);
            }
          }
        });
      }
    }
    draw() {
      const fade = clamp01(this.life / .55);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.globalAlpha = fade;
      ctx.shadowBlur = 25;
      ctx.shadowColor = '#ffd84a';
      for (let ring = 0; ring < 3; ring++) {
        const radius = this.r * (.45 + ring * .22) + Math.sin(game.time * (5 + ring) + ring) * 8;
        ctx.strokeStyle = ring === 1 ? 'rgba(255,255,255,.72)' : 'rgba(255,216,74,.58)';
        ctx.lineWidth = ring === 1 ? 2 : 4;
        ctx.setLineDash([18 - ring * 3, 12 + ring * 2]);
        ctx.lineDashOffset = game.time * (ring % 2 ? 90 : -70);
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, TAU);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      for (let i = 0; i < 9; i++) {
        const a = game.time * (1.9 + (i % 3) * .22) + i / 9 * TAU;
        const rr = this.r * (.25 + (i % 4) * .16);
        ctx.fillStyle = i % 2 ? '#fff8b8' : '#ffd84a';
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, 2.5 + (i % 3), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  class SoulHarvestField {
    constructor(owner, duration, damage, radius) {
      this.owner = owner;
      this.x = owner.x;
      this.y = owner.y;
      this.r = radius;
      this.life = duration;
      this.maxLife = duration;
      this.damage = damage;
      this.tick = 0;
      this.wisps = [];
      this.type = 'soulHarvest';
      this.isUltimate = true;
    }
    update(dt) {
      this.life -= dt;
      this.x = this.owner.x;
      this.y = this.owner.y;
      this.tick -= dt;
      for (const wisp of this.wisps) wisp.t += dt * wisp.speed;
      this.wisps = this.wisps.filter(wisp => wisp.t < 1);
      if (this.tick <= 0) {
        this.tick = .34;
        const nearby = game.enemies.filter(enemy => !enemy.dead && Math.hypot(enemy.x - this.x, enemy.y - this.y) < this.r + enemy.r);
        withUltimateDamage(() => {
          for (const enemy of nearby) {
            enemy.damage(this.damage, false);
            if (Math.random() < .7) this.wisps.push({ x: enemy.x, y: enemy.y, t: 0, speed: rand(1.4, 2.2), phase: rand(0, TAU) });
          }
        });
        if (nearby.length) this.owner.heal(Math.min(4.5, nearby.length * .45));
      }
    }
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      const fade = clamp01(this.life / .6);
      ctx.globalAlpha = fade;
      const gradient = ctx.createRadialGradient(0, 0, 20, 0, 0, this.r);
      gradient.addColorStop(0, 'rgba(255,49,93,.2)');
      gradient.addColorStop(.55, 'rgba(122,31,110,.12)');
      gradient.addColorStop(1, 'rgba(31,6,37,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, this.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,62,117,.65)';
      ctx.lineWidth = 4;
      ctx.setLineDash([14, 11]);
      ctx.lineDashOffset = game.time * 75;
      ctx.beginPath();
      ctx.arc(0, 0, this.r * (.92 + Math.sin(game.time * 3) * .025), 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      for (const wisp of this.wisps) {
        const t = clamp01(wisp.t);
        const ease = t * t * (3 - 2 * t);
        const sx = wisp.x;
        const sy = wisp.y;
        const ex = this.owner.x;
        const ey = this.owner.y;
        const bend = Math.sin(t * Math.PI) * 38;
        const px = sx + (ex - sx) * ease + Math.cos(wisp.phase) * bend;
        const py = sy + (ey - sy) * ease + Math.sin(wisp.phase) * bend;
        ctx.save();
        ctx.globalAlpha = 1 - t;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#ff5d9d';
        ctx.fillStyle = '#ffc1dc';
        ctx.beginPath();
        ctx.arc(px, py, 4 + (1 - t) * 3, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,93,157,.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo((sx + ex) / 2 + Math.cos(wisp.phase) * 40, (sy + ey) / 2 + Math.sin(wisp.phase) * 40, px, py);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function pushOutsideBarrier(enemy, barrier, burstEffect = false) {
    if (!enemy || enemy.dead || !barrier?.hardWall) return;
    const dx = enemy.x - barrier.x;
    const dy = enemy.y - barrier.y;
    const distance = Math.hypot(dx, dy);
    const minDistance = barrier.r + (enemy.r || 16) + 4;
    if (distance >= minDistance) return;
    const angle = distance > .001 ? Math.atan2(dy, dx) : rand(0, TAU);
    enemy.x = barrier.x + Math.cos(angle) * minDistance;
    enemy.y = barrier.y + Math.sin(angle) * minDistance;
    enemy.vx = Math.cos(angle) * 340;
    enemy.vy = Math.sin(angle) * 340;
    if (burstEffect) {
      burst(enemy.x, enemy.y, '#5cecff', 7, 125, 3);
      lineEffect(barrier.x, barrier.y, enemy.x, enemy.y, '#5cecff', .16, 2);
    }
  }

  function enforceAllBarriers(enemy) {
    for (const field of game.fields || []) if (field?.type === 'barrier' && field.hardWall) pushOutsideBarrier(enemy, field, false);
  }

  function tickBleed(target, dt) {
    if (!(target.__bleedTime > 0) || target.dead) return;
    target.__bleedTime -= dt;
    target.__bleedTick = (target.__bleedTick || 0) - dt;
    if (target.__bleedTick <= 0) {
      target.__bleedTick = .62;
      target.damage(target.__bleedDamage || 1.5, false);
      burst(target.x, target.y, '#b91439', 4, 75, 3);
    }
  }

  const originalEnemyUpdate = Enemy.prototype.update;
  Enemy.prototype.update = function (dt) {
    tickBleed(this, dt);
    const result = originalEnemyUpdate.call(this, dt);
    enforceAllBarriers(this);
    return result;
  };

  const originalBossUpdate = Boss.prototype.update;
  Boss.prototype.update = function (dt) {
    tickBleed(this, dt);
    const result = originalBossUpdate.call(this, dt);
    enforceAllBarriers(this);
    return result;
  };

  const originalFieldDraw = Field.prototype.draw;
  Field.prototype.draw = function () {
    if (this.type !== 'barrier' || !this.hardWall) return originalFieldDraw.call(this);
    ctx.save();
    ctx.translate(this.x, this.y);
    const fade = clamp01(this.life / .45);
    ctx.globalAlpha = fade;
    const fill = ctx.createRadialGradient(0, 0, this.r * .18, 0, 0, this.r);
    fill.addColorStop(0, 'rgba(92,236,255,.05)');
    fill.addColorStop(.72, 'rgba(92,236,255,.12)');
    fill.addColorStop(1, 'rgba(92,236,255,.02)');
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#5cecff';
    for (let ring = 0; ring < 3; ring++) {
      ctx.strokeStyle = ring === 1 ? '#dffcff' : 'rgba(92,236,255,.72)';
      ctx.lineWidth = ring === 1 ? 2.5 : 5;
      ctx.setLineDash(ring === 1 ? [6, 12] : [28, 10]);
      ctx.lineDashOffset = game.time * (ring === 1 ? 90 : -55) + ring * 18;
      ctx.beginPath();
      ctx.arc(0, 0, this.r - ring * 7, 0, TAU);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.rotate(game.time * .32);
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(this.r - 24, -7);
      ctx.lineTo(this.r - 7, 0);
      ctx.lineTo(this.r - 24, 7);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  };

  const originalGainUlt = Player.prototype.gainUlt;
  Player.prototype.gainUlt = function (value) {
    if ((window.__deadSignalUltimateDamageDepth || 0) > 0) return;
    return originalGainUlt.call(this, value);
  };

  const originalBulletUpdate = Bullet.prototype.update;
  Bullet.prototype.update = function (dt) {
    const beforeHits = new Set(this.hit || []);
    const result = originalBulletUpdate.call(this, dt);
    if (this.weaponId === 'chainsaw' && this.hit) {
      for (const enemy of this.hit) {
        if (beforeHits.has(enemy) || enemy.dead) continue;
        enemy.__bleedTime = Math.max(enemy.__bleedTime || 0, 3.2);
        enemy.__bleedTick = Math.min(enemy.__bleedTick ?? .05, .05);
        enemy.__bleedDamage = Math.max(enemy.__bleedDamage || 0, Math.max(1.2, this.d * .055));
      }
    }
    return result;
  };

  const originalBulletDraw = Bullet.prototype.draw;
  Bullet.prototype.draw = function () {
    const id = this.weaponId;
    if (!id || id === 'starter') return originalBulletDraw.call(this);
    const color = this.color || '#ffffff';
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.a);
    ctx.shadowBlur = 16;
    ctx.shadowColor = color;

    if (id === 'crossbow') {
      ctx.strokeStyle = '#d9f7ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-25, 0);
      ctx.lineTo(19, 0);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(26, 0);
      ctx.lineTo(13, -6);
      ctx.lineTo(15, 0);
      ctx.lineTo(13, 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ff6b75';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-18, 0);
      ctx.lineTo(-27, -7);
      ctx.moveTo(-18, 0);
      ctx.lineTo(-27, 7);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (id === 'killerbee') {
      ctx.fillStyle = '#353d49';
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(25, 0);
      ctx.lineTo(10, -8);
      ctx.lineTo(-18, -8);
      ctx.lineTo(-25, -4);
      ctx.lineTo(-25, 4);
      ctx.lineTo(-18, 8);
      ctx.lineTo(10, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ff4a2d';
      ctx.beginPath();
      ctx.moveTo(-22, -5);
      ctx.lineTo(-39, 0);
      ctx.lineTo(-22, 5);
      ctx.fill();
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath();
      ctx.moveTo(-26, -2);
      ctx.lineTo(-48, 0);
      ctx.lineTo(-26, 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    if (id === 'pawp') {
      ctx.fillStyle = '#f4fbff';
      ctx.beginPath();
      ctx.roundRect(-19, -2.2, 38, 4.4, 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(27, 0);
      ctx.lineTo(13, -3.5);
      ctx.lineTo(13, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = .35;
      ctx.fillRect(-50, -1.2, 35, 2.4);
      ctx.restore();
      return;
    }

    if (id === 'nailgun') {
      ctx.fillStyle = '#d7e0e8';
      ctx.fillRect(-18, -1.7, 32, 3.4);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(23, 0);
      ctx.lineTo(11, -4.5);
      ctx.lineTo(11, 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#67717d';
      ctx.fillRect(-21, -5, 5, 10);
      ctx.restore();
      return;
    }

    if (id === 'widow') {
      ctx.fillStyle = '#fff1ca';
      ctx.beginPath();
      ctx.ellipse(2, 0, 13, 5.4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(8, -5);
      ctx.lineTo(8, 5);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = .28;
      ctx.fillRect(-31, -2, 28, 4);
      ctx.restore();
      return;
    }

    if (id === 'pumper' || id === 'chainsaw' || id === 'boomstick') {
      const scale = id === 'chainsaw' ? 1.18 : id === 'boomstick' ? .82 : 1;
      ctx.scale(scale, scale);
      ctx.fillStyle = id === 'chainsaw' ? '#ff6047' : '#ffd98a';
      ctx.beginPath();
      ctx.ellipse(3, 0, 7, 5, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#fff6d5';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-15, -5);
      ctx.lineTo(0, 0);
      ctx.lineTo(-15, 5);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (id === 'thompson' || id === 'ashmaker' || id === 'twin') {
      const length = id === 'ashmaker' ? 19 : id === 'thompson' ? 14 : 12;
      ctx.fillStyle = id === 'ashmaker' ? '#bfeeff' : '#ffe1a1';
      ctx.beginPath();
      ctx.roundRect(-length * .55, -2.8, length, 5.6, 2.8);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(length * .72, 0);
      ctx.lineTo(length * .25, -3.8);
      ctx.lineTo(length * .25, 3.8);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = .25;
      ctx.fillRect(-32, -1.5, 23, 3);
      ctx.restore();
      return;
    }

    originalBulletDraw.call(this);
    ctx.restore();
  };

  Player.prototype.abilityQ = function () {
    if (this.qCd > 0 || game.paused || game.phase !== 'night') return;

    if (selectedClass === 'vanguard') {
      this.qCd = 9 * this.cooldown;
      this.shieldPoints = Math.min(this.maxShieldPoints || 3, (this.shieldPoints || 0) + 1);
      this.shield = this.shieldPoints;
      const barrier = new Field(this.x, this.y, 150 * this.area, 5.1, 'barrier', { color: '#5cecff', owner: this, hardWall: true });
      game.fields.push(barrier);
      for (const enemy of game.enemies) pushOutsideBarrier(enemy, barrier, true);
      for (let i = 0; i < 4; i++) setTimeout(() => {
        if (!game.running || barrier.life <= 0) return;
        shockwave(barrier.x, barrier.y, i % 2 ? '#dffcff' : '#5cecff', barrier.r - i * 7, .42, 3 + i);
      }, i * 95);
      burst(this.x, this.y, '#5cecff', 28, 280, 5);
      window.gameAudio?.play('abilityVanguard');
      notice('BASTIÃO CINÉTICO • BARREIRA IMPENETRÁVEL');
      updateHUD();
      return;
    }

    if (selectedClass === 'tempest') {
      this.qCd = 7 * this.cooldown;
      const ox = this.x;
      const oy = this.y;
      const distance = 360;
      let tx = clamp(this.x + Math.cos(this.angle) * distance, 45, WORLD.w - 45);
      let ty = clamp(this.y + Math.sin(this.angle) * distance, 45, WORLD.h - 45);
      if (DBG.blockedAt?.(tx, ty, this.r)) {
        for (let step = distance; step > 60; step -= 20) {
          const nx = clamp(this.x + Math.cos(this.angle) * step, 45, WORLD.w - 45);
          const ny = clamp(this.y + Math.sin(this.angle) * step, 45, WORLD.h - 45);
          if (!DBG.blockedAt?.(nx, ny, this.r)) { tx = nx; ty = ny; break; }
        }
      }
      this.x = tx;
      this.y = ty;
      this.invuln = .7;
      this.speedFx = .75;
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const px = ox + (this.x - ox) * t;
        const py = oy + (this.y - oy) * t;
        game.fields.push(new Field(px, py, 92 * this.area, .52 + i * .025, 'shock', { damage: this.damage * 1.2375, color: '#ffd84a' }));
        lineEffect(px + rand(-28, 28), py + rand(-28, 28), px + rand(-55, 55), py + rand(-55, 55), i % 2 ? '#fff6ae' : '#ffd84a', .22, 2.5);
      }
      lineEffect(ox, oy, this.x, this.y, '#fff8c8', .42, 15);
      lineEffect(ox, oy, this.x, this.y, '#ffd84a', .55, 7);
      burst(this.x, this.y, '#ffd84a', 36, 390, 6);
      shockwave(this.x, this.y, '#fff6ae', 145, .36, 6);
      window.gameAudio?.play('abilityTempest');
      notice('RASGO DE TEMPESTADE');
      return;
    }

    if (selectedClass === 'reaper') {
      this.qCd = 8 * this.cooldown;
      const range = 315 * this.area;
      game.fields.push(new ScytheWave(this, this.angle, this.damage * 4.9, range));
      game.fields.push(new ScytheWave(this, this.angle + .11, this.damage * 2.2, range * .86));
      shockwave(this.x, this.y, '#ff315d', 125, .34, 5);
      burst(this.x + Math.cos(this.angle) * 45, this.y + Math.sin(this.angle) * 45, '#ff315d', 22, 250, 5);
      window.gameAudio?.play('abilityReaper');
      notice('CEIFA CARMESIM');
    }
  };

  const originalEndUltimate = Player.prototype.endUltimate;
  Player.prototype.endUltimate = function () {
    const result = originalEndUltimate.call(this);
    this.__tempestReloadBoost = false;
    this.__ultimateCasting = false;
    if (this.__ultimateVoice && !this.__ultimateVoice.paused) this.__ultimateVoice.pause();
    this.__ultimateVoice = null;
    return result;
  };

  Player.prototype.ultimate = function () {
    if (this.ult < 100 || game.paused || game.phase !== 'night' || this.ultActive || this.__ultimateCasting) return;
    this.ult = 0;
    this.invuln = 2;
    this.__ultimateCasting = true;
    game.flash = .72;

    if (selectedClass === 'vanguard') {
      notice('PROTOCOLO: CHUVA DE GRANADAS');
      const baseX = this.x;
      const baseY = this.y;
      for (let i = 0; i < 12; i++) {
        const angle = i / 12 * TAU + rand(-.18, .18);
        const radius = rand(55, 355);
        const x = clamp(baseX + Math.cos(angle) * radius, 55, WORLD.w - 55);
        const y = clamp(baseY + Math.sin(angle) * radius, 55, WORLD.h - 55);
        game.fields.push(new GrenadeStrike(x, y, .22 + i * .14, this.damage * 8.1, 132 * this.area));
      }
      setTimeout(() => { this.__ultimateCasting = false; }, 2600);
      return;
    }

    if (selectedClass === 'tempest') {
      notice('SOBRECARGA ABSOLUTA');
      this.ultTime = 12;
      this.ultActive = true;
      this.speedMult = 1.55;
      this.fireRate *= .62;
      this.__tempestReloadBoost = true;
      game.fields.push(new TempestStormField(this, 12, this.damage * 1.28, 310 * this.area));
      this.__ultimateVoice = window.gameAudio?.play('ultimateTempest');
      shockwave(this.x, this.y, '#ffd84a', 330 * this.area, .68, 8);
      burst(this.x, this.y, '#fff6ae', 48, 470, 7);
      this.__ultimateCasting = false;
      return;
    }

    if (selectedClass === 'reaper') {
      notice('COLHEITA DO ABISMO');
      this.ultTime = 9.4;
      this.ultActive = true;
      this.ultLifeBonus = .16;
      this.ultAreaBonus = 1.28;
      this.lifeSteal += this.ultLifeBonus;
      this.area *= this.ultAreaBonus;
      game.fields.push(new SoulHarvestField(this, 9.4, this.damage * .86, 270 * this.area));
      this.__ultimateVoice = window.gameAudio?.play('ultimateReaper');
      shockwave(this.x, this.y, '#ff315d', 290 * this.area, .72, 8);
      burst(this.x, this.y, '#ff6f9d', 42, 390, 6);
      this.__ultimateCasting = false;
    }
  };

  const originalPlayerUpdate = Player.prototype.update;
  Player.prototype.update = function (dt) {
    const result = originalPlayerUpdate.call(this, dt);
    if (this.speedFx > 0) {
      this.speedFx -= dt;
      if (Math.random() < .72) trail(this.x - Math.cos(this.angle) * rand(8, 30), this.y - Math.sin(this.angle) * rand(8, 30), '#ffd84a', 2);
    }
    if (selectedClass === 'tempest' && this.ultTime > 0) {
      this.__tempestReloadBoost = true;
      if (this.reloadTimer > 0) {
        this.reloadTimer -= dt * 1.35;
        if (this.reloadTimer <= 0 && this.reloadWeapon) {
          const weapon = this.reloadWeapon;
          const need = weapon.magSize - weapon.mag;
          const take = Math.min(need, weapon.reserve);
          weapon.mag += take;
          weapon.reserve -= take;
          this.reloadWeapon = null;
          this.reloadTimer = 0;
          DBG.renderWeaponHUD?.();
          DBG.transactionFeedback?.('Recarga acelerada concluída', 'success', '⚡');
        }
      }
      if (Math.random() < .8) {
        const back = rand(18, 58);
        trail(this.x - Math.cos(this.angle) * back, this.y - Math.sin(this.angle) * back, Math.random() < .5 ? '#ffd84a' : '#fff6ae', 2);
      }
    }
    return result;
  };

  const originalPlayerDraw = Player.prototype.draw;
  Player.prototype.draw = function () {
    if ((selectedClass === 'tempest' && this.ultTime > 0) || this.speedFx > 0) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.globalAlpha = selectedClass === 'tempest' && this.ultTime > 0 ? .65 : .35;
      ctx.strokeStyle = '#ffd84a';
      ctx.shadowBlur = 24;
      ctx.shadowColor = '#ffd84a';
      ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-25 - i * 10, -12 + i * 8);
        ctx.lineTo(-70 - i * 18 - Math.sin(game.time * 11 + i) * 12, -12 + i * 8);
        ctx.stroke();
      }
      ctx.restore();
    }
    return originalPlayerDraw.call(this);
  };

  const version = document.querySelector('#mainMenu .version');
  if (version) version.textContent = 'Combat & Arsenal Reforged 4.0';
  const lead = document.querySelector('#mainMenu .lead');
  if (lead) lead.textContent = 'Sobreviva com projéteis exclusivos, munição distribuída manualmente, habilidades reconstruídas e um sistema de áudio responsivo para cada arma e operador.';

  console.info('[Dead Signal] Expansão de combate, inventário, munição e ultimates 4.0 carregada.');
})();
