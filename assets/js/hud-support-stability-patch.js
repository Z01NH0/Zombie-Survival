(()=>{
  'use strict';
  if(window.__deadSignalHudSupport129)return;
  window.__deadSignalHudSupport129=true;
  if(typeof game==='undefined'||typeof Player==='undefined')return;

  const DBG=window.__arsenalDebug||{};
  const state={weaponKeys:['','',''],supportKeys:['',''],built:false,renders:0,modelDraws:0};
  const q=s=>document.querySelector(s);
  const safeColor=w=>DBG.itemColor?.(w)||'#62e9ff';
  const safeRarity=w=>DBG.rarityLabel?.(w)||String(w?.rarity||'');
  const safeDurability=w=>Math.max(0,Math.min(100,Math.round(DBG.durabilityPct?.(w)??100)));
  const supportKey=(item,index,p)=>`${index}:${p.quickSlotMode}:${p.activeSupport}:${item?.uid||item?.baseId||'-'}:${item?.count||0}`;
  const weaponKey=(w,index)=>`${index}:${w?.uid||w?.baseId||'-'}:${w?.baseId||'-'}:${w?.rarity||'-'}`;

  function ensureSupportSlots(p){
    if(!Array.isArray(p.supportSlots))p.supportSlots=[null,null];
    p.supportSlots.length=2;
    p.activeSupport=Math.max(0,Math.min(1,Number(p.activeSupport)||0));
    if(p.quickSlotMode!=='support')p.quickSlotMode='weapon';
    return p.supportSlots;
  }

  function weaponCardTemplate(index){
    const card=document.createElement('div');
    card.className='weapon-slot-hud stable-weapon-slot';
    card.dataset.stableWeaponSlot=String(index);
    card.innerHTML=`<span class="slotkey">${index+1}</span><canvas class="weapon-mini" width="92" height="62"></canvas><div class="weapon-copy"><div class="wname"></div><div class="wmeta"></div><div class="ammo"></div><div class="durbar"><i></i></div><div class="reload-progress"><i></i></div></div>`;
    return card;
  }

  function ensureWeaponCards(box){
    const support=box.querySelector('#supportQuickSlots');
    const legacy=[...box.querySelectorAll('.weapon-slot-hud:not([data-stable-weapon-slot])')];
    legacy.forEach(el=>el.remove());
    for(let i=0;i<3;i++){
      let card=box.querySelector(`[data-stable-weapon-slot="${i}"]`);
      if(!card){card=weaponCardTemplate(i);box.insertBefore(card,support||null)}
    }
    const extras=[...box.querySelectorAll('[data-stable-weapon-slot]')].filter(el=>Number(el.dataset.stableWeaponSlot)>2);
    extras.forEach(el=>el.remove());
  }

  function drawWeaponModel(card,w,index){
    const canvas=card.querySelector('canvas.weapon-mini');
    if(!canvas)return;
    const g=canvas.getContext('2d');
    g.clearRect(0,0,canvas.width,canvas.height);
    if(!w)return;
    const renderer=window.__drawDetailedWeaponModel;
    if(typeof renderer==='function')renderer(g,w,canvas.width/2,canvas.height/2,.72,0);
    state.modelDraws++;
  }

  function updateWeaponCard(card,w,index,p,force=false){
    const key=weaponKey(w,index);
    if(force||state.weaponKeys[index]!==key){
      state.weaponKeys[index]=key;
      drawWeaponModel(card,w,index);
    }
    const supportMode=p.quickSlotMode==='support';
    const reload=Boolean(w&&p.reloadWeapon===w&&p.reloadTimer>0);
    card.classList.toggle('empty',!w);
    card.classList.toggle('active',Boolean(w&&!supportMode&&index===p.activeWeapon));
    card.classList.toggle('support-standby',supportMode);
    card.classList.toggle('broken',Boolean(w?.broken));
    card.classList.toggle('reloading',reload);
    const name=card.querySelector('.wname'),meta=card.querySelector('.wmeta'),ammo=card.querySelector('.ammo'),durbar=card.querySelector('.durbar i'),reloadBar=card.querySelector('.reload-progress i');
    if(!w){
      if(name.textContent!=='Slot vazio')name.textContent='Slot vazio';
      name.style.color='';meta.textContent='Sem arma equipada';ammo.textContent='—';durbar.style.width='0%';reloadBar.style.width='0%';
      return;
    }
    name.textContent=w.name||'Arma';name.style.color=safeColor(w);meta.textContent=safeRarity(w);
    const melee=w.def?.kind==='melee';
    ammo.innerHTML=melee?'∞ <small>corpo a corpo</small>':`${Math.max(0,w.mag||0)} <small>/ ${Math.max(0,w.reserve||0)}</small>`;
    const dur=safeDurability(w);durbar.style.width=`${dur}%`;durbar.style.background=dur<25?'#ff3558':dur<55?'#ffd166':'#58f2a2';
    const progress=reload?Math.max(0,Math.min(1,1-p.reloadTimer/(p.reloadTotal||1))):0;
    reloadBar.style.width=`${progress*100}%`;
  }

  function ensureSupportContainer(box){
    let quick=box.querySelector('#supportQuickSlots');
    if(!quick){quick=document.createElement('div');quick.id='supportQuickSlots';box.appendChild(quick)}
    for(let i=0;i<2;i++){
      let slot=quick.querySelector(`[data-stable-support-slot="${i}"]`);
      if(!slot){slot=document.createElement('div');slot.dataset.stableSupportSlot=String(i);slot.className='support-quick-slot';slot.innerHTML='<span class="support-key"></span><span class="support-icon"></span><span class="support-count"></span><span class="support-empty-mark">＋</span>';quick.appendChild(slot)}
    }
    [...quick.querySelectorAll('.support-quick-slot:not([data-stable-support-slot])')].forEach(el=>el.remove());
    return quick;
  }

  function updateSupportHud(box,p){
    const slots=ensureSupportSlots(p),quick=ensureSupportContainer(box);
    for(let i=0;i<2;i++){
      const item=slots[i],el=quick.querySelector(`[data-stable-support-slot="${i}"]`),key=supportKey(item,i,p);
      state.supportKeys[i]=key;
      el.classList.toggle('active',p.quickSlotMode==='support'&&p.activeSupport===i);
      el.classList.toggle('empty',!item);
      el.querySelector('.support-key').textContent=typeof prettyKey==='function'?prettyKey(i?(save.settings.keybinds.support2||'5'):(save.settings.keybinds.support1||'4')):(i?'5':'4');
      el.querySelector('.support-icon').textContent=item?.def?.icon||'';
      el.querySelector('.support-count').textContent=item?String(item.count||1):'';
      el.querySelector('.support-count').style.display=item?'':'none';
      el.querySelector('.support-empty-mark').style.display=item?'none':'grid';
    }
    const hint=q('#grenadeThrowHint');
    if(hint)hint.classList.toggle('show',Boolean(p.quickSlotMode==='support'&&slots[p.activeSupport]?.baseId==='grenade'&&game.running&&!game.paused&&!game.shopOpen&&!game.inventoryOpen));
  }

  function stableRender(force=false){
    const p=game.player,box=q('#weaponHud');if(!p||!box)return;
    box.classList.remove('hidden');q('#resourceStack')?.classList.remove('hidden');
    ensureWeaponCards(box);
    for(let i=0;i<3;i++)updateWeaponCard(box.querySelector(`[data-stable-weapon-slot="${i}"]`),p.weaponSlots?.[i]||null,i,p,force);
    updateSupportHud(box,p);
    const blood=q('#bloodHud'),count=q('#inventoryCountHud');if(blood)blood.textContent=Math.floor(game.blood||0);if(count)count.textContent=`${p.inventory?.filter(Boolean).length||0}/30`;
    state.renders++;
  }

  DBG.renderWeaponHUD=stableRender;
  window.__deadSignalStableHudRender=stableRender;
  window.__deadSignalRenderSupportHud=()=>stableRender(false);

  // Garante que 1/2/3 retornem visualmente ao modo arma, e 4/5 mostrem o suporte.
  const previousSwitch=DBG.switchWeapon;
  DBG.switchWeapon=function(index){
    if(game.player){game.player.quickSlotMode='weapon';game.player.__supportUseLatch=false}
    const result=previousSwitch?.apply(this,arguments);
    stableRender(true);return result;
  };

  // O modelo do suporte foi integrado diretamente ao renderizador principal do personagem.

  const oldStart=startGame;
  startGame=function(){const result=oldStart.apply(this,arguments);setTimeout(()=>stableRender(true),0);return result};
  stableRender(true);

  window.__deadSignalHudSupportDebug={state,render:stableRender,snapshot(){const p=game.player;return{mode:p?.quickSlotMode,activeWeapon:p?.activeWeapon,activeSupport:p?.activeSupport,weapons:[...document.querySelectorAll('[data-stable-weapon-slot]')].map(x=>({slot:x.dataset.stableWeaponSlot,active:x.classList.contains('active'),standby:x.classList.contains('support-standby')})),supports:[...document.querySelectorAll('[data-stable-support-slot]')].map(x=>({slot:x.dataset.stableSupportSlot,active:x.classList.contains('active'),empty:x.classList.contains('empty')})),modelDraws:state.modelDraws,renders:state.renders}}};
})();
