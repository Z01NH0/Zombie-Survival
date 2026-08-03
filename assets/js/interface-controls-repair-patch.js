(() => {
  'use strict';

  if (typeof game === 'undefined' || typeof Player === 'undefined' || !window.__arsenalDebug) return;
  const DBG = window.__arsenalDebug;
  const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

  /* ------------------------------------------------------------------
     ÁUDIO: clique sem munição e loop estável para armas automáticas
  ------------------------------------------------------------------ */
  const audioManager = window.gameAudio;
  if (audioManager) {
    const emptyDef = {
      src: 'assets/audio/efeitos/sem-municao.mp3',
      gain: .82,
      cooldown: 85,
      maxVoices: 2,
      stopAfter: .078
    };
    audioManager.effectDefs.emptyAmmo = emptyDef;
    const emptyTemplate = new Audio(emptyDef.src);
    emptyTemplate.preload = 'auto';
    audioManager.effects.emptyAmmo = emptyTemplate;
    audioManager.activeVoices.set('emptyAmmo', new Set());

    const machineDef = audioManager.effectDefs.machineGun;
    if (machineDef) machineDef.src = 'assets/audio/efeitos/metralha-loop.wav';
    const machineTemplate = new Audio('assets/audio/efeitos/metralha-loop.wav');
    machineTemplate.preload = 'auto';
    audioManager.effects.machineGun = machineTemplate;
    audioManager.__loopStops = audioManager.__loopStops || new Map();
    audioManager.__loopRamps = audioManager.__loopRamps || new Map();

    const originalStartLoop = audioManager.startLoop.bind(audioManager);
    const originalStopLoop = audioManager.stopLoop.bind(audioManager);

    function rampLoop(manager, name, voice, target, duration = 28) {
      const token = Symbol(name);
      manager.__loopRamps.set(name, token);
      const from = voice.volume;
      const started = performance.now();
      const tick = now => {
        if (manager.__loopRamps.get(name) !== token || voice.paused) return;
        const t = Math.min(1, (now - started) / duration);
        voice.volume = clamp01(from + (target - from) * t);
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    audioManager.startLoop = function (name, options = {}) {
      if (name !== 'machineGun') return originalStartLoop(name, options);
      if (!this.unlocked || !save?.settings?.sfx) return null;
      const stopTimer = this.__loopStops.get(name);
      if (stopTimer) {
        clearTimeout(stopTimer);
        this.__loopStops.delete(name);
      }
      const target = clamp01(this.sfxVolume() * (this.effectDefs[name]?.gain || .58) * clamp01(options.gain ?? 1));
      let voice = this.loopVoices.get(name);
      if (voice) {
        if (voice.paused) {
          try { voice.currentTime = 0; } catch (_) {}
          voice.play().catch(() => {});
        }
        rampLoop(this, name, voice, target, 18);
        return voice;
      }
      voice = new Audio(this.effectDefs[name].src);
      voice.preload = 'auto';
      voice.loop = true;
      voice.volume = 0;
      voice.playbackRate = options.playbackRate || 1;
      this.loopVoices.set(name, voice);
      voice.play().then(() => rampLoop(this, name, voice, target, 24)).catch(() => {
        if (this.loopVoices.get(name) === voice) this.loopVoices.delete(name);
      });
      return voice;
    };

    audioManager.stopLoop = function (name) {
      if (name !== 'machineGun') return originalStopLoop(name);
      const voice = this.loopVoices.get(name);
      if (!voice || this.__loopStops.has(name)) return;
      rampLoop(this, name, voice, 0, 18);
      const timer = setTimeout(() => {
        voice.pause();
        try { voice.currentTime = 0; } catch (_) {}
        if (this.loopVoices.get(name) === voice) this.loopVoices.delete(name);
        this.__loopStops.delete(name);
        this.__loopRamps.delete(name);
      }, 22);
      this.__loopStops.set(name, timer);
    };
  }

  const shootBeforeEmptyAudio = Player.prototype.shoot;
  Player.prototype.shoot = function () {
    const weapon = DBG.currentWeapon?.();
    const isRanged = weapon && weapon.def?.kind !== 'melee';
    const canClick = Boolean(
      isRanged && this.fireCd <= 0 && !game.paused && this.reloadTimer <= 0 &&
      !weapon.broken && weapon.durability > 0 && weapon.mag < (weapon.def.ammoCost || 1)
    );
    const result = shootBeforeEmptyAudio.apply(this, arguments);
    if (canClick) window.gameAudio?.play('emptyAmmo', { cooldown: 70 });
    return result;
  };

  /* ------------------------------------------------------------------
     KEYBINDS COMPLETAMENTE REMAPEÁVEIS
  ------------------------------------------------------------------ */
  const DEFAULT_BINDS = Object.freeze({
    moveUp: 'w', moveDown: 's', moveLeft: 'a', moveRight: 'd',
    dash: 'shift', ability: 'q', ultimate: 'e', reload: 'r', interact: 'f',
    inventory: 'tab', weapon1: '1', weapon2: '2', weapon3: '3', pause: 'escape'
  });
  const ACTIONS = [
    ['moveUp', 'Mover para cima'], ['moveDown', 'Mover para baixo'],
    ['moveLeft', 'Mover para esquerda'], ['moveRight', 'Mover para direita'],
    ['dash', 'Dash'], ['ability', 'Habilidade'], ['ultimate', 'Ultimate'],
    ['reload', 'Recarregar'], ['interact', 'Interagir'], ['inventory', 'Inventário'],
    ['weapon1', 'Arma 1'], ['weapon2', 'Arma 2'], ['weapon3', 'Arma 3'], ['pause', 'Pausar']
  ];
  save.settings.keybinds = Object.assign({}, DEFAULT_BINDS, save.settings.keybinds || {});
  persist();

  const normalizedKey = event => {
    const key = String(event.key || '').toLowerCase();
    if (key === ' ') return 'space';
    if (key === 'control') return 'ctrl';
    if (key === 'altgraph') return 'alt';
    return key;
  };
  const keyLabel = key => ({
    space: 'ESPAÇO', shift: 'SHIFT', ctrl: 'CTRL', alt: 'ALT', tab: 'TAB',
    escape: 'ESC', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→'
  }[key] || String(key).toUpperCase());
  const bindFor = action => save.settings.keybinds[action] || DEFAULT_BINDS[action];
  const movementVirtual = { moveUp: 'w', moveDown: 's', moveLeft: 'a', moveRight: 'd' };
  let bindingAction = null;

  function actionForKey(key) {
    return ACTIONS.find(([action]) => bindFor(action) === key)?.[0] || null;
  }
  function clearMovement() {
    game.keys.w = game.keys.a = game.keys.s = game.keys.d = false;
    game.keys.arrowup = game.keys.arrowdown = game.keys.arrowleft = game.keys.arrowright = false;
  }
  function updateControlLabels() {
    const qKey = document.querySelector('#skillQ .key');
    const ultKey = document.querySelector('#skillR .key');
    const dashKey = document.querySelector('#skillDash .key');
    const interactKey = document.querySelector('#interactPrompt kbd');
    if (qKey) qKey.textContent = keyLabel(bindFor('ability'));
    if (ultKey) ultKey.textContent = keyLabel(bindFor('ultimate'));
    if (dashKey) dashKey.textContent = keyLabel(bindFor('dash'));
    if (interactKey) interactKey.textContent = keyLabel(bindFor('interact'));
    document.querySelectorAll('[data-bind-action]').forEach(button => {
      const action = button.dataset.bindAction;
      button.textContent = bindingAction === action ? 'PRESSIONE…' : keyLabel(bindFor(action));
      button.classList.toggle('listening', bindingAction === action);
    });
    const note = document.querySelector('.controls-note');
    if (note) note.textContent = `${keyLabel(bindFor('ability'))} habilidade • ${keyLabel(bindFor('ultimate'))} ultimate • ${keyLabel(bindFor('reload'))} recarregar • ${keyLabel(bindFor('interact'))} interagir • scroll troca armas`;
  }

  function showBindToast(message, ok = false) {
    const toast = document.querySelector('#keybindToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle('ok', ok);
    clearTimeout(showBindToast.timer);
    showBindToast.timer = setTimeout(() => { toast.textContent = ''; toast.classList.remove('ok'); }, 2600);
  }

  function buildKeybindSettings() {
    const settingsPanel = document.querySelector('#settingsScreen .panel');
    const grid = settingsPanel?.querySelector('.settings-grid');
    if (!settingsPanel || !grid || document.querySelector('#controlsSettings')) return;
    const musicLabel = document.querySelector('#musicToggle')?.closest('.setting')?.querySelector('span');
    if (musicLabel) musicLabel.textContent = 'Música';
    settingsPanel.insertAdjacentHTML('beforeend', `
      <section id="controlsSettings" class="controls-settings">
        <div class="controls-settings-head">
          <div><div class="kicker">Controles</div><h3>TECLAS PERSONALIZÁVEIS</h3><p>Clique em uma tecla e pressione o novo comando.</p></div>
          <button id="resetKeybinds" class="btn reset-keybinds">Restaurar padrão</button>
        </div>
        <div class="keybind-grid">${ACTIONS.map(([action, label]) => `
          <div class="keybind-row"><span>${label}</span><button class="keybind-button" data-bind-action="${action}">${keyLabel(bindFor(action))}</button></div>
        `).join('')}</div>
        <div id="keybindToast" class="keybind-toast"></div>
      </section>
    `);
    document.querySelectorAll('[data-bind-action]').forEach(button => {
      button.addEventListener('click', () => {
        bindingAction = button.dataset.bindAction;
        updateControlLabels();
        showBindToast('Pressione a nova tecla. ESC cancela.', true);
      });
    });
    document.querySelector('#resetKeybinds')?.addEventListener('click', () => {
      save.settings.keybinds = { ...DEFAULT_BINDS };
      bindingAction = null;
      clearMovement();
      persist();
      updateControlLabels();
      showBindToast('Controles restaurados.', true);
    });
  }

  function captureRebind(event) {
    if (!bindingAction) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    const key = normalizedKey(event);
    if (key === 'escape') {
      bindingAction = null;
      updateControlLabels();
      showBindToast('Alteração cancelada.');
      return true;
    }
    const previous = bindFor(bindingAction);
    const conflict = actionForKey(key);
    if (conflict && conflict !== bindingAction) save.settings.keybinds[conflict] = previous;
    save.settings.keybinds[bindingAction] = key;
    const changed = bindingAction;
    bindingAction = null;
    clearMovement();
    persist();
    updateControlLabels();
    showBindToast(`${ACTIONS.find(([a]) => a === changed)?.[1] || 'Comando'} atualizado.`, true);
    return true;
  }

  window.addEventListener('keydown', event => {
    if (captureRebind(event)) return;
    const target = event.target;
    if (target && /INPUT|SELECT|TEXTAREA/.test(target.tagName)) return;
    const key = normalizedKey(event);
    const action = actionForKey(key);
    if (!action) return;

    if (movementVirtual[action]) {
      game.keys[movementVirtual[action]] = true;
      event.preventDefault();
      return;
    }
    if (event.repeat && !['reload'].includes(action)) return;
    if (['tab', 'space', 'arrowup', 'arrowdown'].includes(key)) event.preventDefault();

    if (game.running) event.preventDefault();
    if (action === 'pause') {
      const settings = document.querySelector('#settingsScreen');
      if (settings && !settings.classList.contains('hidden')) {
        hide('settingsScreen'); overlay('pauseScreen'); game.paused = true; return;
      }
      const ammoModal = document.querySelector('#ammoAllocationModal.show');
      if (ammoModal) { ammoModal.classList.remove('show'); return; }
      if (game.inventoryOpen) { DBG.closeInventory?.(); return; }
      if (game.shopOpen && game.modal) { DBG.closeModal?.(`${game.modal}Screen`); return; }
      if (game.running && !game.shopOpen && !game.inventoryOpen) togglePause();
      return;
    }
    if (!game.running) return;
    if (action === 'inventory') {
      if (game.shopOpen) return;
      if (game.inventoryOpen) DBG.closeInventory?.(); else DBG.openInventory?.();
      return;
    }
    if (game.paused || game.shopOpen || game.inventoryOpen) return;
    if (action === 'dash') game.player?.dash();
    else if (action === 'ability') game.player?.abilityQ();
    else if (action === 'ultimate') game.player?.ultimate();
    else if (action === 'reload') DBG.reloadCurrent?.();
    else if (action === 'interact') DBG.interact?.();
    else if (action.startsWith('weapon')) DBG.switchWeapon?.(+action.slice(-1) - 1);
  }, true);

  window.addEventListener('keyup', event => {
    const key = normalizedKey(event);
    const action = actionForKey(key);
    if (movementVirtual[action]) game.keys[movementVirtual[action]] = false;
  }, true);
  function releaseActiveInput() {
    clearMovement();
    if (game.mouse) game.mouse.down = false;
    if (typeof touch !== 'undefined' && touch?.aim) touch.aim.active = false;
    window.gameAudio?.stopAllLoops?.();
  }
  window.addEventListener('blur', releaseActiveInput);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseActiveInput(); });

  let lastWheelAt = 0;
  window.addEventListener('wheel', event => {
    if (!game.running || game.paused || game.shopOpen || game.inventoryOpen || !game.player) return;
    if (Math.abs(event.deltaY) < 2 || performance.now() - lastWheelAt < 115) return;
    event.preventDefault();
    lastWheelAt = performance.now();
    const slots = game.player.weaponSlots || [];
    const occupied = slots.map((item, index) => item ? index : -1).filter(index => index >= 0);
    if (occupied.length < 2) return;
    let position = occupied.indexOf(game.player.activeWeapon);
    if (position < 0) position = 0;
    const direction = event.deltaY > 0 ? 1 : -1;
    const next = occupied[(position + direction + occupied.length) % occupied.length];
    DBG.switchWeapon?.(next);
  }, { capture: true, passive: false });

  /* ------------------------------------------------------------------
     INVENTÁRIO E LIMPEZA DAS INTERFACES
  ------------------------------------------------------------------ */
  function ensureInventoryResources() {
    const top = document.querySelector('#inventoryScreen .topline');
    const close = document.querySelector('#closeInventoryBtn');
    if (!top || !close || document.querySelector('#inventoryTopResources')) return;
    const actions = document.createElement('div');
    actions.className = 'inventory-top-actions';
    actions.id = 'inventoryTopResources';
    actions.innerHTML = `
      <div class="inventory-resource-chip scrap">⚙ <span>Sucata</span> <b id="inventoryScrapValue">0</b></div>
      <div class="inventory-resource-chip blood">🩸 <span>Sangue</span> <b id="inventoryBloodValue">0</b></div>
    `;
    close.parentNode.insertBefore(actions, close);
    actions.appendChild(close);
  }
  function updateInventoryResources() {
    const scrap = document.querySelector('#inventoryScrapValue');
    const blood = document.querySelector('#inventoryBloodValue');
    if (scrap) scrap.textContent = Math.floor(game.scrap || 0);
    if (blood) blood.textContent = Math.floor(game.blood || 0);
  }
  ensureInventoryResources();
  setInterval(updateInventoryResources, 160);

  const menuLead = document.querySelector('#mainMenu .lead');
  if (menuLead) menuLead.textContent = 'Sobreviva ao sinal, monte seu arsenal e aguente a noite.';
  const heroCopy = document.querySelector('#mainMenu .hero-copy b');
  if (heroCopy) heroCopy.textContent = 'A cidade morreu. O sinal não.';
  const mainFeatures = document.querySelectorAll('#mainMenu .feature b');
  ['Escuridão dinâmica', 'Arsenal profundo', 'Hordas e chefes'].forEach((text, index) => { if (mainFeatures[index]) mainFeatures[index].textContent = text; });
  const specialistLead = document.querySelector('#specialistScreen .lead');
  if (specialistLead) specialistLead.textContent = 'Comprar, reparar e aprimorar.';
  const howCards = document.querySelectorAll('#howScreen .card');
  if (howCards[0]) howCards[0].querySelector('p').textContent = 'Use a lanterna para revelar ameaças na escuridão.';
  if (howCards[1]) howCards[1].querySelector('p').textContent = 'No amanhecer, negocie e prepare a próxima noite.';
  if (howCards[2]) howCards[2].querySelector('p').textContent = 'Gerencie armas, munição e equipamentos pelo inventário.';
  document.querySelector('.mobile-btn[data-action="e"]')?.classList.add('hidden');
  const mobileUlt = document.querySelector('.mobile-btn[data-action="r"]');
  if (mobileUlt) mobileUlt.textContent = 'ULT';

  /* ------------------------------------------------------------------
     REPAROS: efeitos detalhados sem invadir o escopo privado da oficina
  ------------------------------------------------------------------ */
  const repairClasses=['repair-pistol','repair-sniper','repair-smg','repair-launcher','repair-shotgun','repair-melee','repair-armor'];
  const repairableItems=()=> (DBG.getAllOwned?.(false)||[]).filter(({item})=>item&&(item.type==='weapon'||item.type==='armor')&&isFinite(item.maxDurability));
  const integrity=item=>Number(DBG.durabilityPct?.(item)??100);
  function selectedRepairItem(){const list=repairableItems(),row=document.querySelector('#specialistContent [data-repair-select].selected'),i=Number(row?.dataset.repairSelect);return list[Number.isInteger(i)&&i>=0?i:0]?.item||null}
  function repairClass(item){const k=item?.def?.kind;if(item?.type==='armor')return'repair-armor';if(k==='launcher')return'repair-launcher';if(k==='sniper')return'repair-sniper';if(k==='shotgun')return'repair-shotgun';if(k==='smg'||k==='rifle')return'repair-smg';if(k==='melee')return'repair-melee';return'repair-pistol'}
  function hashSeed(text){let h=2166136261;for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return()=>((h=Math.imul(h^h>>>15,1|h))>>>0)/4294967296}
  function drawWear(item,progress=0,impact=0){DBG.drawBenchItem?.(item);const c=document.querySelector('#benchItemCanvas');if(!c||!item)return;const g=c.getContext('2d'),base=integrity(item)/100,wear=1-clamp01(base+progress*(1-base));if(wear<.03)return;const cx=c.width/2,cy=c.height/2,k=item.def?.kind||item.type,rng=hashSeed(item.uid||item.name);g.save();g.globalAlpha=.25+wear*.7;const stain=g.createRadialGradient(cx,cy,5,cx,cy,135);stain.addColorStop(0,`rgba(139,49,22,${.16+wear*.3})`);stain.addColorStop(1,'rgba(20,5,3,0)');g.fillStyle=stain;g.beginPath();g.arc(cx,cy,135,0,TAU);g.fill();const n=3+Math.round(wear*10);for(let i=0;i<n;i++){const x=cx+(rng()-.5)*(k==='sniper'?245:180),y=cy+(rng()-.5)*70,len=14+rng()*35;g.strokeStyle='rgba(255,232,195,.68)';g.lineWidth=1+wear*2;g.beginPath();g.moveTo(x,y);g.lineTo(x+len,y+(rng()-.5)*18);g.stroke();g.strokeStyle='rgba(10,3,2,.65)';g.lineWidth=1;g.stroke()}if(k==='launcher'){g.strokeStyle='#ff6539';g.lineWidth=3+wear*4;g.beginPath();g.arc(cx+62,cy,22,-.8,.9);g.stroke()}else if(k==='sniper'){g.strokeStyle='rgba(255,90,55,.72)';g.lineWidth=3;g.beginPath();g.moveTo(cx-122,cy-5);g.lineTo(cx+122,cy+11);g.stroke()}else if(k==='shotgun'){for(let i=0;i<3;i++){g.strokeStyle='rgba(255,205,145,.72)';g.lineWidth=2;g.beginPath();g.moveTo(cx-72+i*27,cy-28);g.lineTo(cx-35+i*27,cy+25);g.stroke()}}else if(k==='smg'||k==='rifle'){for(let i=0;i<4;i++){const a=game.time*4+i*1.7;g.fillStyle=i%2?'#ffd166':'#ff6845';g.beginPath();g.arc(cx+Math.cos(a)*(45+i*8),cy+Math.sin(a)*22,2+wear*2,0,TAU);g.fill()}}else if(k==='melee'){g.setLineDash([8,5]);g.strokeStyle='rgba(255,238,190,.82)';g.lineWidth=3;g.beginPath();g.moveTo(cx-85,cy+34);g.lineTo(cx+95,cy-39);g.stroke();g.setLineDash([])}if(wear>.62){const smoke=g.createRadialGradient(cx+20,cy-20,0,cx+20,cy-20,80);smoke.addColorStop(0,'rgba(140,150,160,.22)');smoke.addColorStop(1,'rgba(30,40,50,0)');g.fillStyle=smoke;g.beginPath();g.arc(cx+20,cy-20,80,0,TAU);g.fill()}if(impact>0){g.globalAlpha=impact;g.fillStyle='#fff4bc';g.shadowBlur=24;g.shadowColor='#ff9737';g.beginPath();g.arc(cx+55,cy-12,6+impact*6,0,TAU);g.fill()}g.restore()}
  function decorateRepair(){const bench=document.querySelector('#repairBench'),item=selectedRepairItem();if(!bench||!item)return;const pct=Math.round(integrity(item)),key=`${item.uid||item.name}:${pct}`;if(bench.dataset.reviewDecoration===key&&bench.querySelector('.bench-status')&&bench.querySelector('.repair-fx-layer'))return;bench.dataset.reviewDecoration=key;repairClasses.forEach(x=>bench.classList.remove(x));bench.classList.add(repairClass(item));bench.querySelectorAll('.bench-status').forEach(x=>x.remove());if(!bench.querySelector('.repair-fx-layer'))bench.insertAdjacentHTML('beforeend','<div class="repair-fx-layer"></div>');const state=pct<20?['CRÍTICO','bad']:pct<55?['DESGASTADO','warn']:['ESTÁVEL','good'];bench.insertAdjacentHTML('afterbegin',`<div class="bench-status"><span class="${state[1]}">${state[0]}</span><span>${pct}% integridade</span><span>${item.def?.kind||item.type}</span></div>`);drawWear(item)}
  function repairBurst(bench,item,hit){const layer=bench.querySelector('.repair-fx-layer');if(!layer)return;const k=item.def?.kind,x=k==='launcher'?64:k==='sniper'?58:k==='melee'?50:55,y=k==='melee'?49:45;for(let i=0;i<8;i++){const e=document.createElement('i'),a=i/8*TAU+hit*.37;e.className='repair-spark';e.style.left=`${x+(Math.random()-.5)*16}%`;e.style.top=`${y+(Math.random()-.5)*12}%`;e.style.setProperty('--dx',`${Math.cos(a)*(35+Math.random()*55)}px`);e.style.setProperty('--dy',`${Math.sin(a)*(25+Math.random()*45)}px`);e.style.setProperty('--r',`${a}rad`);layer.appendChild(e);setTimeout(()=>e.remove(),700)}if(hit%2===0){const e=document.createElement('i');e.className='repair-smoke';e.style.left=`${x-3}%`;e.style.top=`${y-5}%`;layer.appendChild(e);setTimeout(()=>e.remove(),1000)}}
  function animateRepair(item){const bench=document.querySelector('#repairBench');if(!bench||!item)return;bench.classList.add('repairing');const duration=1950,start=performance.now();let last=0;const frame=now=>{if(!bench.isConnected)return;const progress=clamp01((now-start)/duration),hit=Math.floor(progress*7);if(hit>last&&hit<=6){last=hit;repairBurst(bench,item,hit)}drawWear(item,progress,Math.max(0,1-Math.abs((progress*7%1)-.15)*5));if(progress<1)requestAnimationFrame(frame);else setTimeout(decorateRepair,130)};requestAnimationFrame(frame)}
  document.addEventListener('click',event=>{const b=event.target?.closest?.('#repairBtn');if(!b||b.disabled)return;const item=selectedRepairItem(),cost=item?DBG.repairCost?.(item):null;if(!item||!cost||game.scrap<cost.scrap||game.blood<cost.blood)return;setTimeout(()=>animateRepair(item),0)},true);
  const specialist=document.querySelector('#specialistContent');if(specialist)new MutationObserver(()=>requestAnimationFrame(decorateRepair)).observe(specialist,{childList:true,subtree:true});
  /* ------------------------------------------------------------------
     REAPER: ultimate com ritual, foices, sombras e almas mais temáticas
  ------------------------------------------------------------------ */
  if (!document.querySelector('#reaperUltVignette')) {
    document.body.insertAdjacentHTML('beforeend', '<div id="reaperUltVignette" class="reaper-ult-vignette"></div>');
  }
  function drawReaperEnhancement(field) {
    const owner = field.owner;
    if (!owner) return;
    ctx.save();
    ctx.translate(field.x, field.y);
    const pulse = .5 + Math.sin(game.time * 4.2) * .5;
    const rotation = game.time * .42;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .22 + pulse * .12;
    const mist = ctx.createRadialGradient(0, 0, field.r * .12, 0, 0, field.r * 1.05);
    mist.addColorStop(0, 'rgba(255,45,95,.2)'); mist.addColorStop(.48, 'rgba(90,10,80,.16)'); mist.addColorStop(1, 'rgba(4,0,8,0)');
    ctx.fillStyle = mist; ctx.beginPath(); ctx.arc(0, 0, field.r * 1.05, 0, TAU); ctx.fill();
    ctx.rotate(rotation);
    ctx.strokeStyle = 'rgba(255,83,137,.38)'; ctx.lineWidth = 2.3;
    for (let i = 0; i < 6; i++) {
      ctx.rotate(TAU / 6);
      ctx.beginPath(); ctx.moveTo(field.r * .36, 0); ctx.lineTo(field.r * .78, 0); ctx.lineTo(field.r * .62, field.r * .13); ctx.stroke();
      ctx.beginPath(); ctx.arc(field.r * .7, 0, field.r * .15, -1.3, 1.1); ctx.stroke();
    }
    ctx.rotate(-rotation * 2.4);
    ctx.strokeStyle = 'rgba(10,0,14,.78)'; ctx.lineWidth = 9; ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + Math.sin(game.time * 1.7 + i) * .1;
      const inner = field.r * (.2 + .05 * Math.sin(game.time * 2 + i));
      const outer = field.r * (.74 + .08 * Math.sin(game.time * 2.6 + i));
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.quadraticCurveTo(Math.cos(a + .3) * field.r * .5, Math.sin(a + .3) * field.r * .5, Math.cos(a) * outer, Math.sin(a) * outer); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = .5;
    for (let i = 0; i < 5; i++) {
      const a = rotation * -1.6 + i / 5 * TAU;
      const r = field.r * (.45 + .08 * Math.sin(game.time * 3 + i));
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 2); ctx.scale(.75, .75);
      ctx.fillStyle = 'rgba(210,205,220,.62)';
      ctx.beginPath(); ctx.moveTo(0, -12); ctx.quadraticCurveTo(-12, -8, -9, 5); ctx.lineTo(-4, 15); ctx.lineTo(0, 9); ctx.lineTo(4, 15); ctx.lineTo(9, 5); ctx.quadraticCurveTo(12, -8, 0, -12); ctx.fill();
      ctx.fillStyle = '#ff315d'; ctx.fillRect(-5, -3, 3, 3); ctx.fillRect(2, -3, 3, 3); ctx.restore();
    }
    ctx.restore();
  }
  function instrumentSoulFields() {
    for (const field of game.fields || []) {
      if (field?.type !== 'soulHarvest' || field.__reaperEnhanced) continue;
      field.__reaperEnhanced = true;
      const oldDraw = field.draw.bind(field);
      field.draw = function () { oldDraw(); drawReaperEnhancement(this); };
      const oldUpdate = field.update.bind(field);
      field.update = function (dt) {
        oldUpdate(dt);
        if (Math.random() < dt * 18) {
          const a = Math.random() * TAU, r = Math.random() * this.r;
          trail(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r, Math.random() < .65 ? '#7f164d' : '#d6b4d8', 2);
        }
      };
    }
  }
  setInterval(() => {
    instrumentSoulFields();
    const active = Boolean(game.running && selectedClass === 'reaper' && game.player?.ultTime > 0);
    document.querySelector('#reaperUltVignette')?.classList.toggle('show', active);
  }, 45);

  /* Finalização */
  buildKeybindSettings();
  ensureInventoryResources();
  updateControlLabels();
  updateInventoryResources();
  const version = document.querySelector('#mainMenu .version');
  if (version) version.textContent = 'Full Review & Stability 6.0';
  console.info('[Dead Signal] Revisão completa e estabilidade 6.0 carregadas.');
})();
