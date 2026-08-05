(()=>{
  'use strict';
  if(typeof game==='undefined'||typeof Player==='undefined')return;

  const DBG=window.__arsenalDebug||{};
  const root=document.body;
  const noticeBox=document.getElementById('notice');
  if(noticeBox){noticeBox.textContent='';noticeBox.classList.remove('show');noticeBox.setAttribute('aria-hidden','true')}

  const feed=document.createElement('div');
  feed.id='resourcePickupFeed';
  feed.setAttribute('aria-live','polite');
  root.appendChild(feed);

  const state=document.createElement('div');
  state.id='weaponStateSignal';
  state.setAttribute('aria-hidden','true');
  state.innerHTML='<div class="weapon-state-ring"></div><div class="weapon-state-core"></div>';
  root.appendChild(state);

  const cleanText=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const numeric=value=>{const match=String(value??'').match(/\+?\s*(\d+(?:[.,]\d+)?)/);return match?match[1].replace(',','.'):'1'};
  const pushResource=(label,amount='1',icon='◆',color='#58f2a2')=>{
    const entry=document.createElement('div');
    entry.className='resource-pickup-entry';
    entry.style.setProperty('--resource-color',color);
    entry.innerHTML=`<span class="resource-icon">${icon}</span><b><strong>+${amount}</strong>${label}</b>`;
    feed.appendChild(entry);
    while(feed.children.length>4)feed.firstElementChild?.remove();
    setTimeout(()=>entry.remove(),2400);
  };
  window.__deadSignalResourcePickup=pushResource;

  const routeResourceText=(text,icon)=>{
    const normalized=cleanText(text);
    let handled=false;
    const blood=String(text).match(/\+?\s*(\d+(?:[.,]\d+)?)\s*(?:de\s+)?sangue/i);
    if(blood){pushResource('Sangue necrótico',blood[1].replace(',','.'),icon||'🩸','#ff5b78');handled=true}
    const scrap=String(text).match(/\+?\s*(\d+(?:[.,]\d+)?)\s*(?:de\s+)?sucata/i);
    if(scrap){pushResource('Sucata',scrap[1].replace(',','.'),'⚙','#ffd166');handled=true}
    const battery=String(text).match(/bateria[^+]*\+\s*(\d+(?:[.,]\d+)?)\s*%/i);
    if(battery){pushResource('Bateria',`${battery[1].replace(',','.')}%`,'▰','#58f2a2');handled=true}
    const core=String(text).match(/\+?\s*(\d+(?:[.,]\d+)?)\s*(?:nucleo|núcleo)/i);
    if(core){pushResource('Núcleo',core[1].replace(',','.'),'◆','#9d7cff');handled=true}
    if(!handled&&normalized.includes('sangue coletado')){pushResource('Sangue necrótico',numeric(text),icon||'🩸','#ff5b78');handled=true}
    return handled;
  };

  window.__deadSignalRouteResource=routeResourceText;
  const pulseContext=selector=>{
    const element=document.querySelector(selector);if(!element)return;
    element.classList.remove('context-denied');void element.offsetWidth;element.classList.add('context-denied');
    setTimeout(()=>element.classList.remove('context-denied'),620);
  };
  const contextualFeedback=text=>{
    const value=cleanText(text);
    if(value.includes('sucata insuficiente')||value.includes('recursos insuficientes'))pulseContext('#merchantScreen:not(.hidden) .store-panel,#specialistScreen:not(.hidden) .store-panel,#inventoryScreen:not(.hidden) .inventory-panel,.currency');
    else if(value.includes('inventario cheio'))pulseContext('#inventoryScreen:not(.hidden) .inventory-grid,#inventoryScreen:not(.hidden) .inventory-panel');
    else if(value.includes('sem bateria')||value.includes('bateria da lanterna ja esta cheia')||value.includes('bateria da lanterna quase vazia'))pulseContext('#flashlightBatteryHud');
    else if(value.includes('slot de suporte')||value.includes('slot de arma vazio'))pulseContext('#weaponHud');
    else if(value.includes('vida ja esta cheia'))pulseContext('.bars');
    else if(value.includes('tecla')&&value.includes('uso'))pulseContext('#settingsScreen .keybind-panel,#settingsScreen .settings-grid');
    else if(value.includes('somente armas')||value.includes('armadura nao cabe')||value.includes('nao pode ser descartada'))pulseContext('#inventoryScreen .inventory-panel');
  };
  /* O aviso genérico deixa de produzir textos. Recursos viram feed; erros pulsam no componente afetado. */
  notice=function(text){if(!routeResourceText(text))contextualFeedback(text)};
  const gameplayClear=()=>game.running&&!game.paused&&!game.shopOpen&&!game.inventoryOpen&&
    !document.querySelector('#merchantScreen:not(.hidden),#specialistScreen:not(.hidden),#inventoryScreen:not(.hidden),#settingsScreen:not(.hidden)');

  let signalTimer=0,lastEmpty=0,lastBroken=0;
  const activeSlot=weapon=>{
    const player=game.player;if(!player)return null;
    let index=player.weaponSlots?.findIndex(item=>item===weapon||item?.uid&&item.uid===weapon?.uid);
    if(index<0)index=player.activeWeapon;
    return document.querySelectorAll('#weaponHud .weapon-slot-hud')[index]||null;
  };
  const signalWeapon=(kind,weapon)=>{
    const now=performance.now();
    if(kind==='empty'){if(now-lastEmpty<180)return;lastEmpty=now}
    else{if(now-lastBroken<700)return;lastBroken=now}
    state.className='';void state.offsetWidth;state.className=`${kind} show`;
    clearTimeout(signalTimer);signalTimer=setTimeout(()=>state.className='',kind==='broken'?1200:760);
    const decorate=()=>{
      const slot=activeSlot(weapon);if(!slot)return;
      slot.classList.remove('state-empty','state-broken');void slot.offsetWidth;
      slot.classList.add(kind==='broken'?'state-broken':'state-empty');
      setTimeout(()=>slot.classList.remove('state-empty','state-broken'),kind==='broken'?1050:520);
    };
    decorate();requestAnimationFrame(decorate);
    if(kind==='broken'){
      root.classList.remove('weapon-break-vignette');void root.offsetWidth;root.classList.add('weapon-break-vignette');
      setTimeout(()=>root.classList.remove('weapon-break-vignette'),950);
      if(typeof screenShake==='function')screenShake(3.5);
    }
  };
  window.__deadSignalWeaponState=signalWeapon;

  if(window.__arsenalDebug)window.__arsenalDebug.showBrokenMessage=weapon=>signalWeapon('broken',weapon);

  const previousShoot=Player.prototype.shoot;
  Player.prototype.shoot=function(...args){
    /* Usar suporte não deve disparar os sinais de arma vazia/quebrada. */
    if(this.quickSlotMode==='support')return previousShoot.apply(this,args);
    const weapon=(DBG.currentWeapon?.()||this.weaponSlots?.[this.activeWeapon])||null;
    const ranged=weapon&&weapon.def?.kind!=='melee';
    const cost=Math.max(1,Number(weapon?.def?.ammoCost)||1);
    const canAttempt=this.fireCd<=0&&!game.paused&&this.reloadTimer<=0;
    const broken=Boolean(weapon&&(weapon.broken||Number(weapon.durability)<=0));
    const empty=Boolean(ranged&&!broken&&canAttempt&&Number(weapon.mag)<cost&&Number(weapon.reserve)<=0);
    if(broken&&canAttempt)signalWeapon('broken',weapon);
    else if(empty)signalWeapon('empty',weapon);
    return previousShoot.apply(this,args);
  };

  const cleanWeaponHud=()=>{
    document.querySelectorAll('#weaponHud .weapon-slot-hud.reloading .wmeta').forEach(meta=>{
      meta.textContent=meta.textContent.replace(/\s*•\s*RECARREGANDO/gi,'').trim();
    });
  };
  if(window.__arsenalDebug?.renderWeaponHUD){
    const previousRender=window.__arsenalDebug.renderWeaponHUD;
    window.__arsenalDebug.renderWeaponHUD=function(...args){const result=previousRender.apply(this,args);cleanWeaponHud();return result};
  }
  cleanWeaponHud();

  /* Corrige resíduos visuais de notificações antigas ao iniciar/retornar ao jogo. */
  const clearGeneric=()=>{
    if(noticeBox){noticeBox.textContent='';noticeBox.classList.remove('show')}
    if(gameplayClear())document.getElementById('transactionFeedback')?.classList.remove('show');
  };
  setInterval(clearGeneric,1800);
})();
