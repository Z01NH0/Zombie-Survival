(() => {
  'use strict';
  if (typeof game === 'undefined' || typeof Player === 'undefined' || !window.__arsenalDebug) return;

  const DBG = window.__arsenalDebug;
  const clampNumber = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const normalizeToken = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const prettyKey = key => ({ escape:'ESC', space:'ESPAÇO', shift:'SHIFT', control:'CTRL', ctrl:'CTRL', tab:'TAB' }[key] || String(key || '').toUpperCase());
  const supportBaseIds = new Set(['medkit','fieldDressing','stim','battery','grenade']);

  /* ==================================================================
     AMMO COMPATIBILITY — Flechas and Pregos always win over kind fallback.
  ================================================================== */
  const AMMO = {
    handgun:{name:'Munição de Pistola',icon:'▰',ratio:.357,flat:20},
    light:{name:'Munição Leve',icon:'▥',ratio:.323,flat:47},
    shells:{name:'Cartuchos de Escopeta',icon:'▤',ratio:.306,flat:20},
    precision:{name:'Munição de Precisão',icon:'◆',ratio:.289,flat:9},
    rockets:{name:'Mísseis Compactos',icon:'▲',ratio:.425,flat:2},
    arrows:{name:'Flechas Reforçadas',icon:'➶',ratio:.30,flat:8},
    nails:{name:'Pregos Industriais',icon:'⌁',ratio:.25,flat:40}
  };
  const aliasGroups = {
    handgun:['handgun','pistol','pistola','revolver','municaodepistola'],
    light:['light','leve','smg','sub','submetralhadora','rifle','municaoleve'],
    shells:['shell','shells','shotgun','escopeta','cartucho','cartuchos','cartuchosdeescopeta'],
    precision:['precision','precisao','sniper','fuzilprecisao','municaodeprecisao'],
    rockets:['rocket','rockets','foguete','foguetes','missil','misseis','misseiscompactos'],
    arrows:['arrow','arrows','flecha','flechas','virote','virotes','crossbow','silentfang','silverfang','flechasreforcadas','pacotedeflechas'],
    nails:['nail','nails','prego','pregos','nailgun','nailstorm','pregadora','pregosindustriais','pacotedepregos']
  };
  const aliasMap = new Map(Object.entries(aliasGroups).flatMap(([type, values]) => values.map(value => [value, type])));

  function resolveAmmoValue(value) {
    const normalized = normalizeToken(value).replace(/^ammo/, '');
    if (!normalized) return null;
    if (/silentfang|silverfang|crossbow|flecha|virote/.test(normalized)) return 'arrows';
    if (/nailstorm|nailgun|pregadora|prego|nail/.test(normalized)) return 'nails';
    if (aliasMap.has(normalized)) return aliasMap.get(normalized);
    for (const [alias, type] of aliasMap) if (alias.length >= 5 && normalized.includes(alias)) return type;
    return null;
  }
  function ammoTypeFromItem(item) {
    if (!item) return null;
    for (const value of [item.ammoType,item.baseId,item.id,item.key,item.name,item.def?.name,item.def?.ammoType,item.def?.desc]) {
      const type = resolveAmmoValue(value); if (type) return type;
    }
    return null;
  }
  function weaponAmmoType(weapon) {
    if (!weapon?.def) return null;
    const joined = [weapon.baseId,weapon.ammoType,weapon.def.ammoType,weapon.name,weapon.def.name,weapon.def.desc].map(normalizeToken).join('|');
    if (/silentfang|silverfang|crossbow|besta|flecha|virote/.test(joined)) return 'arrows';
    if (/nailstorm|nailgun|pregadora|prego|nail/.test(joined)) return 'nails';
    const explicit = resolveAmmoValue(weapon.ammoType || weapon.def.ammoType); if (explicit) return explicit;
    if (['pistol','dual','revolver'].includes(weapon.def.kind)) return 'handgun';
    if (['smg','rifle'].includes(weapon.def.kind)) return 'light';
    if (weapon.def.kind === 'shotgun') return 'shells';
    if (weapon.def.kind === 'sniper') return 'precision';
    if (weapon.def.kind === 'launcher') return 'rockets';
    return null;
  }
  function normalizeAmmoItem(item) {
    if (!item || item.type === 'weapon' || item.type === 'armor' || item.def?.kind) return null;
    const type = ammoTypeFromItem(item); if (!type) return null;
    const def = AMMO[type];
    item.type = 'consumable'; item.ammoType = type; item.baseId = `ammo_${type}`; item.name = def.name;
    item.count = Math.max(1, Number(item.count) || 1);
    item.def = Object.assign({}, item.def || {}, { name:def.name, icon:def.icon, ammoType:type,
      desc:type === 'arrows' ? 'Exclusivas para a Silent Fang e outras armas de flecha.' : type === 'nails' ? 'Exclusivos para a Nailstorm e outras pregadoras.' : (item.def?.desc || def.name), use(){} });
    return type;
  }
  function normalizeAllAmmoItems() {
    for (const item of game.player?.inventory || []) normalizeAmmoItem(item);
  }
  function ownedWeaponRefs() {
    const player = game.player; if (!player) return [];
    const refs=[];
    (player.weaponSlots||[]).forEach((item,index)=>{if(item?.type==='weapon')refs.push({source:'weapon',index,item})});
    (player.inventory||[]).forEach((item,index)=>{if(item?.type==='weapon')refs.push({source:'inventory',index,item})});
    const seen=new Set();
    return refs.filter(ref=>{const key=ref.item.uid||`${ref.source}:${ref.index}`;if(seen.has(key))return false;seen.add(key);return true});
  }
  function removeAmmoUnit(item, ref) {
    item.count=Math.max(0,(Number(item.count)||1)-1);
    if(item.count>0)return;
    if(ref?.source==='inventory'&&game.player?.inventory?.[ref.index]===item)game.player.inventory[ref.index]=null;
  }
  function refreshAmmoUI(item, ref) {
    DBG.renderInventory?.(); DBG.renderWeaponHUD?.(); updateHUD?.();
    if(item?.count>0&&ref?.source==='inventory'&&game.player?.inventory?.[ref.index]===item)DBG.selectItem?.({source:'inventory',index:ref.index,item});
    else { const c=document.querySelector('#scanContent'),a=document.querySelector('#itemActionArea');if(c)c.innerHTML='<h3 class="scan-title">Munição distribuída</h3><p class="scan-desc">Selecione outro item para continuar.</p>';if(a)a.innerHTML=''; }
  }
  function openCompatibleAmmoModal(item, ref) {
    if(!item||item.type!=='consumable')return false;
    const modal=document.querySelector('#ammoAllocationModal'),list=document.querySelector('#ammoWeaponList');
    const title=document.querySelector('#ammoAllocationTitle'),subtitle=document.querySelector('#ammoAllocationSubtitle');
    if(!modal||!list)return false;
    const generic=normalizeToken(item.baseId)==='ammopack'||normalizeToken(item.name).includes('caixademunicao');
    let type=normalizeAmmoItem(item)||ammoTypeFromItem(item);
    if(!type&&generic)type=weaponAmmoType(DBG.currentWeapon?.());
    if(!type&&!generic)return false;
    const def=AMMO[type]||{name:'Caixa de Munição',icon:'📦',ratio:.18,flat:1};
    const candidates=ownedWeaponRefs().filter(refItem=>refItem.item?.def?.kind!=='melee'&&(generic||weaponAmmoType(refItem.item)===type));
    if(title)title.textContent=generic?'Caixa de Munição':def.name;
    if(subtitle)subtitle.textContent=candidates.length?'Escolha uma única arma para receber a munição.':'Nenhuma arma compatível foi encontrada.';
    list.innerHTML=candidates.length?candidates.map((weaponRef,index)=>{const weapon=weaponRef.item;const amount=generic?Math.ceil(weapon.maxReserve*.18):Math.max(def.flat,Math.round(weapon.maxReserve*def.ratio));const actual=Math.max(0,Math.min(amount,weapon.maxReserve-weapon.reserve));const location=weaponRef.source==='weapon'?`Equipada no slot ${weaponRef.index+1}`:'Guardada no inventário';return `<button class="ammo-weapon-option ${actual<=0?'full':''}" data-compatible-ammo="${index}" ${actual<=0?'disabled':''}><span class="ammo-weapon-icon">${weapon.def.icon||def.icon}</span><span class="ammo-weapon-copy"><b style="color:${DBG.itemColor?.(weapon)||'#65e8ff'}">${weapon.name}</b><small>${location} • reserva ${weapon.reserve}/${weapon.maxReserve}</small></span><span class="ammo-weapon-gain">${actual>0?`+${actual}`:'CHEIA'}</span></button>`}).join(''):'<div class="ammo-empty-state">Você não possui uma arma compatível com este pacote.</div>';
    list.querySelectorAll('[data-compatible-ammo]').forEach(button=>button.onclick=()=>{const weaponRef=candidates[Number(button.dataset.compatibleAmmo)];if(!weaponRef)return;const weapon=weaponRef.item;const amount=generic?Math.ceil(weapon.maxReserve*.18):Math.max(def.flat,Math.round(weapon.maxReserve*def.ratio));const before=Number(weapon.reserve)||0;weapon.reserve=Math.min(weapon.maxReserve,before+amount);const gained=weapon.reserve-before;if(gained<=0)return;removeAmmoUnit(item,ref);modal.classList.remove('show');window.gameAudio?.play('menuButton',{gain:.7});DBG.transactionFeedback?.(`${weapon.name}: +${gained} munições`,'success',def.icon);notice(`${weapon.name.toUpperCase()} RECEBEU +${gained} DE MUNIÇÃO`);refreshAmmoUI(item,ref)});
    modal.dataset.ammoType=type||'generic';modal.classList.add('show');return true;
  }
  window.__requestAmmoAllocation=openCompatibleAmmoModal;
  window.__deadSignalAmmoCompatibility={ammoTypeFromItem,weaponAmmoType,normalizeAmmoItem,openCompatibleAmmoModal};

  /* ==================================================================
     FLASHLIGHT TOGGLE AND CUSTOM KEYS.
  ================================================================== */
  save.settings.keybinds=Object.assign({},save.settings.keybinds||{});
  save.settings.keybinds.flashlight ||= 'g'; save.settings.keybinds.support1 ||= '4'; save.settings.keybinds.support2 ||= '5'; persist();
  function toggleFlashlight(){if(!game.running||!game.player||!game.flashlight)return;if((game.flashlight.battery||0)<=0&&game.flashlight.enabled===false){notice('A LANTERNA ESTÁ SEM BATERIA');return}game.flashlight.enabled=game.flashlight.enabled===false;notice(game.flashlight.enabled?'LANTERNA LIGADA':'LANTERNA DESLIGADA');window.gameAudio?.play('menuButton',{gain:.42});updateHUD?.()}

  /* ==================================================================
     SUPPORT SLOTS 4/5.
  ================================================================== */
  function ensureSupportSlots(player=game.player){if(!player)return[];if(!Array.isArray(player.supportSlots))player.supportSlots=[null,null];player.supportSlots.length=2;player.activeSupport=clampNumber(player.activeSupport,0,1);if(!['weapon','support'].includes(player.quickSlotMode))player.quickSlotMode='weapon';return player.supportSlots}
  function isAmmoItem(item){return Boolean(ammoTypeFromItem(item)||normalizeToken(item?.baseId)==='ammopack'||normalizeToken(item?.name).includes('caixademunicao'))}
  function isSupportItem(item){return Boolean(item?.type==='consumable'&&!isAmmoItem(item)&&supportBaseIds.has(item.baseId))}
  function itemIcon(item){return item?.def?.icon||'✚'}
  function selectSupport(index){const player=game.player;if(!player)return;ensureSupportSlots(player);player.quickSlotMode='support';player.activeSupport=clampNumber(index,0,1);player.__supportUseLatch=false;DBG.renderWeaponHUD?.();const item=player.supportSlots[player.activeSupport];notice(item?`${prettyKey(index?save.settings.keybinds.support2:save.settings.keybinds.support1)} • ${item.name.toUpperCase()}`:`SLOT DE SUPORTE ${index+1} VAZIO`)}
  function weaponMode(){if(game.player){game.player.quickSlotMode='weapon';game.player.__supportUseLatch=false;renderSupportHud()}}
  function equipSupport(ref,index){const player=game.player;if(!player||!ref?.item||!isSupportItem(ref.item))return false;const slots=ensureSupportSlots(player),item=ref.item,previous=slots[index];if(ref.source==='inventory'){player.inventory[ref.index]=previous||null}else if(ref.source==='support'){if(ref.index===index)return true;slots[ref.index]=previous||null}else return false;slots[index]=item;player.quickSlotMode='support';player.activeSupport=index;DBG.renderInventory?.();DBG.renderWeaponHUD?.();DBG.transactionFeedback?.(`${item.name} equipado no slot ${index+4}`,'success',itemIcon(item));return true}
  function storeSupport(index){const player=game.player;if(!player)return false;const slots=ensureSupportSlots(player),item=slots[index];if(!item)return false;if(!DBG.addToInventory?.(item,false))return false;slots[index]=null;if(player.quickSlotMode==='support'&&player.activeSupport===index)player.quickSlotMode='weapon';DBG.renderInventory?.();DBG.renderWeaponHUD?.();DBG.transactionFeedback?.(`${item.name} guardado`,'success','▣');return true}

  class ThrownGrenade{
    constructor(owner,targetX,targetY){this.owner=owner;this.startX=owner.x;this.startY=owner.y;this.x=owner.x;this.y=owner.y;this.targetX=targetX;this.targetY=targetY;this.duration=.72;this.life=.72;this.maxLife=.72;this.r=9;this.type='playerGrenade';this.rotation=0;this.exploded=false}
    update(dt){this.life-=dt;this.rotation+=dt*10;const p=clampNumber(1-this.life/this.maxLife,0,1),e=1-Math.pow(1-p,2);this.x=this.startX+(this.targetX-this.startX)*e;this.y=this.startY+(this.targetY-this.startY)*e;if(this.life<=0&&!this.exploded)this.explode()}
    explode(){this.exploded=true;this.life=0;const radius=205*(this.owner.area||1),damage=185*(this.owner.damageMult||1)*(1+Math.min(.55,Math.max(0,(game.night||1)-1)*.035));for(const enemy of game.enemies||[]){if(enemy.dead)continue;const distance=Math.hypot(enemy.x-this.x,enemy.y-this.y);if(distance>radius+enemy.r)continue;const falloff=.45+.55*(1-Math.min(1,distance/radius));enemy.damage(damage*falloff,false);const angle=Math.atan2(enemy.y-this.y,enemy.x-this.x);enemy.vx=(enemy.vx||0)+Math.cos(angle)*260;enemy.vy=(enemy.vy||0)+Math.sin(angle)*260}window.gameAudio?.play('explosion',{gain:1});if(typeof explosionFX==='function')explosionFX(this.x,this.y,'#ff8738',radius);burst(this.x,this.y,'#ff9b45',48,520,8);burst(this.x,this.y,'#fff1bf',22,330,5);shockwave(this.x,this.y,'#ff6734',radius*1.08,.55,10);shockwave(this.x,this.y,'#fff2c7',radius*.7,.38,5);screenShake(14);game.flash=Math.max(game.flash||0,.52)}
    draw(){const p=clampNumber(1-this.life/this.maxLife,0,1),altitude=Math.sin(p*Math.PI)*88,scale=.82+Math.sin(p*Math.PI)*.55,shadowScale=.72+p*.3;ctx.save();ctx.translate(this.x,this.y);ctx.globalAlpha=.3+p*.45;ctx.fillStyle='rgba(0,0,0,.55)';ctx.beginPath();ctx.ellipse(0,5,15*shadowScale,6*shadowScale,0,0,TAU);ctx.fill();ctx.globalAlpha=1;ctx.translate(0,-altitude);ctx.rotate(this.rotation);ctx.scale(scale,scale);ctx.shadowBlur=20;ctx.shadowColor='#ff8a3c';ctx.fillStyle='#26313a';ctx.strokeStyle='#ff9b45';ctx.lineWidth=2.5;ctx.beginPath();ctx.roundRect(-8,-11,16,22,6);ctx.fill();ctx.stroke();ctx.fillStyle='#151b21';ctx.fillRect(-6,-3,12,4);ctx.fillStyle='#ffb45d';ctx.fillRect(-3,-15,6,6);ctx.strokeStyle='#dce6ed';ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(5,-13,5,-.6,2.2);ctx.stroke();ctx.restore()}
  }
  function throwGrenade(player){const mx=Number(game.mouse?.worldX),my=Number(game.mouse?.worldY);let dx=Number.isFinite(mx)?mx-player.x:Math.cos(player.angle)*360,dy=Number.isFinite(my)?my-player.y:Math.sin(player.angle)*360;const distance=Math.hypot(dx,dy)||1,scale=Math.min(1,520/distance);dx*=scale;dy*=scale;let targetX=clampNumber(player.x+dx,30,WORLD.w-30),targetY=clampNumber(player.y+dy,30,WORLD.h-30);if(DBG.blockedAt?.(targetX,targetY,9)){for(let factor=.92;factor>=.25;factor-=.08){const x=player.x+dx*factor,y=player.y+dy*factor;if(!DBG.blockedAt?.(x,y,9)){targetX=x;targetY=y;break}}}game.fields.push(new ThrownGrenade(player,targetX,targetY));window.gameAudio?.play('meleeMiss',{gain:.35});notice('GRANADA LANÇADA')}
  function consumeSupport(index){const player=game.player;if(!player)return;const slots=ensureSupportSlots(player),item=slots[index];if(!item){notice('SLOT DE SUPORTE VAZIO');return}if(item.baseId==='grenade')throwGrenade(player);else{if(item.baseId==='medkit'&&player.hp>=player.maxHp){notice('VIDA JÁ ESTÁ CHEIA');return}if(item.baseId==='battery'&&(game.flashlight?.battery||0)>=(game.flashlight?.maxBattery||100)){notice('BATERIA DA LANTERNA JÁ ESTÁ CHEIA');return}item.def?.use?.(player);window.gameAudio?.play(item.baseId==='medkit'||item.baseId==='fieldDressing'?'heal':'menuButton');DBG.transactionFeedback?.(`${item.name} utilizado`,'success',itemIcon(item))}item.count=Math.max(0,(Number(item.count)||1)-1);if(item.count<=0)slots[index]=null;if(!slots[index])player.quickSlotMode='weapon';DBG.renderWeaponHUD?.();DBG.renderInventory?.();updateHUD?.()}

  if(!document.querySelector('#grenadeThrowHint'))document.body.insertAdjacentHTML('beforeend','<div id="grenadeThrowHint" class="grenade-throw-hint">Clique para arremessar a granada</div>');
  function renderSupportHud(){const player=game.player,box=document.querySelector('#weaponHud');if(!player||!box)return;const slots=ensureSupportSlots(player);let quick=box.querySelector('#supportQuickSlots');if(!quick){quick=document.createElement('div');quick.id='supportQuickSlots';box.appendChild(quick)}quick.innerHTML=slots.map((item,index)=>`<div class="support-quick-slot ${player.quickSlotMode==='support'&&player.activeSupport===index?'active':''} ${item?'':'empty'}"><span class="support-key">${prettyKey(index?save.settings.keybinds.support2:save.settings.keybinds.support1)}</span>${item?`<span class="support-icon">${itemIcon(item)}</span><span class="support-count">${item.count||1}</span>`:'<span class="support-empty-mark">＋</span>'}</div>`).join('');document.querySelector('#grenadeThrowHint')?.classList.toggle('show',Boolean(player.quickSlotMode==='support'&&slots[player.activeSupport]?.baseId==='grenade'&&game.running&&!game.paused&&!game.shopOpen&&!game.inventoryOpen))}
  function ensureSupportInventorySection(){const center=document.querySelector('#inventoryScreen .inventory-center'),weapons=document.querySelector('#weaponEquipRow');if(!center||!weapons)return null;let section=center.querySelector('#supportInventorySection');if(!section){section=document.createElement('section');section.id='supportInventorySection';section.className='support-inventory-section';section.innerHTML='<div class="support-inventory-title"><span>Suportes rápidos</span><span>Somente consumíveis de campo</span></div><div id="supportEquipRow" class="support-equip-row"></div>';weapons.insertAdjacentElement('afterend',section)}return section.querySelector('#supportEquipRow')}
  function renderSupportInventory(){const row=ensureSupportInventorySection(),player=game.player;if(!row||!player)return;const slots=ensureSupportSlots(player);row.innerHTML=slots.map((item,index)=>`<div class="support-equip-slot ${item?'':'empty'}" data-support-slot="${index}"><span class="support-slot-key">${prettyKey(index?save.settings.keybinds.support2:save.settings.keybinds.support1)}</span><span class="support-slot-icon">${item?itemIcon(item):'＋'}</span><b>${item?item.name:`Slot de suporte ${index+1}`}</b><small>${item?`Quantidade: ${item.count||1}`:'Kit médico, bateria, estimulante ou granada'}</small></div>`).join('');row.querySelectorAll('[data-support-slot]').forEach(element=>element.onclick=()=>{const index=Number(element.dataset.supportSlot),item=slots[index];if(!item)return;uiSelectedRef={source:'support',index,item};DBG.selectItem?.(uiSelectedRef);setTimeout(()=>decorateSelectedSupport(uiSelectedRef),0)})}

  let uiSelectedRef=null;
  function decorateSelectedSupport(ref){const area=document.querySelector('#itemActionArea');if(!area||!ref?.item)return;if(ref.source==='support'){area.innerHTML='<div class="support-action-group"><button class="btn primary" data-support-action="use">Usar agora</button><button class="btn" data-support-action="store">Guardar</button></div>'}else if(ref.source==='inventory'&&isSupportItem(ref.item)){const useNow=ref.item.baseId==='grenade'?'':'<button class="btn" data-support-action="use-inventory">Usar agora</button>';area.innerHTML=`<div class="support-action-group"><button class="btn primary" data-support-action="equip0">Equipar no 4</button><button class="btn primary" data-support-action="equip1">Equipar no 5</button></div>${useNow}<button class="btn" data-item-action="drop">Dropar</button>`;const drop=area.querySelector('[data-item-action="drop"]');if(drop)drop.onclick=()=>DBG.itemAction?.('drop')}area.querySelectorAll('[data-support-action]').forEach(button=>button.onclick=()=>handleSupportAction(button.dataset.supportAction,ref))}
  function useInventorySupport(ref){const item=ref.item,player=game.player;if(!item||!player)return;if(item.baseId==='medkit'&&player.hp>=player.maxHp){notice('VIDA JÁ ESTÁ CHEIA');return}if(item.baseId==='battery'&&(game.flashlight?.battery||0)>=(game.flashlight?.maxBattery||100)){notice('BATERIA DA LANTERNA JÁ ESTÁ CHEIA');return}item.def?.use?.(player);item.count=Math.max(0,(Number(item.count)||1)-1);if(item.count<=0&&player.inventory?.[ref.index]===item)player.inventory[ref.index]=null;window.gameAudio?.play(item.baseId==='medkit'||item.baseId==='fieldDressing'?'heal':'menuButton');DBG.renderInventory?.();DBG.renderWeaponHUD?.();updateHUD?.()}
  function handleSupportAction(action,ref){if(action==='equip0'||action==='equip1'){equipSupport(ref,action==='equip1'?1:0);uiSelectedRef=null;return}if(action==='store'){storeSupport(ref.index);uiSelectedRef=null;return}if(action==='use'){consumeSupport(ref.index);renderSupportInventory();return}if(action==='use-inventory'){useInventorySupport(ref);return}}

  document.addEventListener('click',event=>{const inventorySlot=event.target.closest?.('[data-inv-slot]');if(inventorySlot){const index=Number(inventorySlot.dataset.invSlot),item=game.player?.inventory?.[index];uiSelectedRef=item?{source:'inventory',index,item}:null;if(item)setTimeout(()=>decorateSelectedSupport(uiSelectedRef),0)}const weaponSlot=event.target.closest?.('[data-drop-weapon],[data-drop-armor]');if(weaponSlot)uiSelectedRef=null},true);

  const baseRenderWeaponHUD=DBG.renderWeaponHUD;
  DBG.renderWeaponHUD=function(){const result=baseRenderWeaponHUD?.apply(this,arguments);renderSupportHud();return result};
  const baseRenderInventory=DBG.renderInventory;
  DBG.renderInventory=function(){normalizeAllAmmoItems();const result=baseRenderInventory?.apply(this,arguments);renderSupportInventory();renderSupportHud();return result};
  const baseSwitchWeapon=DBG.switchWeapon;
  DBG.switchWeapon=function(index){weaponMode();return baseSwitchWeapon?.apply(this,arguments)};
  const hud=document.querySelector('#weaponHud');if(hud)new MutationObserver(()=>{if(!hud.querySelector('#supportQuickSlots'))requestAnimationFrame(renderSupportHud)}).observe(hud,{childList:true});
  const inventoryGrid=document.querySelector('#inventoryGrid');if(inventoryGrid)new MutationObserver(()=>requestAnimationFrame(()=>{normalizeAllAmmoItems();renderSupportInventory()})).observe(inventoryGrid,{childList:true,subtree:true});

  const shootBeforeSupport=Player.prototype.shoot;
  Player.prototype.shoot=function(){ensureSupportSlots(this);if(this.quickSlotMode==='support'){if(this.__supportUseLatch)return;this.__supportUseLatch=true;consumeSupport(this.activeSupport||0);return}return shootBeforeSupport.apply(this,arguments)};
  const playerUpdateBeforeSupport=Player.prototype.update;
  Player.prototype.update=function(dt){const result=playerUpdateBeforeSupport.call(this,dt);const mobile=Boolean(typeof touch!=='undefined'&&touch?.aim?.active&&Math.hypot(touch.aim.x||0,touch.aim.y||0)>.24);if(!game.mouse?.down&&!mobile)this.__supportUseLatch=false;return result};
  window.addEventListener('mouseup',()=>{if(game.player)game.player.__supportUseLatch=false},true);

  /* ==================================================================
     GRENADE OFFER AT SPECIALIST.
  ================================================================== */
  function grenadePrice(){return Math.round(72+Math.max(0,(game.night||1)-1)*5.5)}
  function injectGrenadeOffer(){const screen=document.querySelector('#specialistScreen'),content=document.querySelector('#specialistContent'),active=document.querySelector('[data-special-tab="stock"].active');if(!screen||screen.classList.contains('hidden')||!content||!active||content.querySelector('#grenadeSpecialistOffer'))return;const grid=content.querySelector('.store-grid');if(!grid)return;const card=document.createElement('div');card.id='grenadeSpecialistOffer';card.className='store-item grenade-store-card';card.innerHTML=`<div><div class="item-icon">💣</div><h3 style="color:#ffad5c">Granada de Fragmentação</h3><p>Explosivo de uso único para slots de suporte. Causa uma grande explosão e empurra infectados.</p><div class="stock-meta">Consumível único • sem níveis ou raridades</div><div class="cost-row"><span class="cost-chip grenade-price">⚙ ${grenadePrice()}</span></div></div><button class="btn primary" id="buyGrenadeSupport">Comprar</button>`;grid.prepend(card);card.querySelector('#buyGrenadeSupport').onclick=()=>{const price=grenadePrice();if(game.scrap<price){notice('SUCATA INSUFICIENTE');DBG.transactionFeedback?.('Sucata insuficiente','bad','!');return}const grenade=DBG.makeConsumable?.('grenade',1);if(!grenade||!DBG.addToInventory?.(grenade,true))return;game.scrap-=price;window.gameAudio?.play('trade');DBG.transactionFeedback?.('Granada comprada','success','💣');const scrap=document.querySelector('#specialistScrap');if(scrap)scrap.textContent=Math.floor(game.scrap);updateHUD?.();DBG.renderInventory?.()}}
  const specialistContent=document.querySelector('#specialistContent');if(specialistContent)new MutationObserver(()=>requestAnimationFrame(injectGrenadeOffer)).observe(specialistContent,{childList:true,subtree:true});

  /* ==================================================================
     POWERUPS AND MANUAL ENERGY.
  ================================================================== */
  const goldenBattery={id:'goldenBattery',name:'Bateria de Ouro',icon:'🔋',rarity:'Raro',desc:'A bateria da lanterna dura 3% mais.',available:player=>(player.flashlightDrainMult||1)>.66,apply(player){player.flashlightDrainMult=Math.max(.65,(Number(player.flashlightDrainMult)||1)/1.03)}};
  const manualEnergy={id:'manualEnergy',name:'Energia Manual',icon:'⚡',rarity:'Raro',desc:'Em movimento, regenera 0,3% de bateria por segundo. Máximo: 1,2%.',available:player=>(Number(player.manualBatteryRegen)||0)<1.199,apply(player){player.manualBatteryRegen=Math.min(1.2,(Number(player.manualBatteryRegen)||0)+.3)}};
  if(!UPGRADES.some(upgrade=>upgrade.id===goldenBattery.id))UPGRADES.push(goldenBattery);if(!UPGRADES.some(upgrade=>upgrade.id===manualEnergy.id))UPGRADES.push(manualEnergy);
  if(typeof openUpgrade==='function')openUpgrade=function(){if(!game.running||game.upgradeQueue<=0||!document.querySelector('#upgradeScreen')?.classList.contains('hidden'))return;game.paused=true;overlay('upgradeScreen');const eligible=UPGRADES.filter(upgrade=>typeof upgrade.available!=='function'||upgrade.available(game.player));const choices=[...eligible].sort(()=>Math.random()-.5).slice(0,Math.min(3,eligible.length));document.querySelector('#choiceGrid').innerHTML=choices.map(upgrade=>`<button class="card choice" data-up="${upgrade.id}" style="text-align:left;color:white"><div class="rarity">${upgrade.rarity}</div><div class="big">${upgrade.icon}</div><h3>${upgrade.name}</h3><p>${upgrade.desc}</p></button>`).join('');document.querySelectorAll('[data-up]').forEach(button=>button.onclick=()=>{const upgrade=UPGRADES.find(entry=>entry.id===button.dataset.up);if(!upgrade||(typeof upgrade.available==='function'&&!upgrade.available(game.player)))return;upgrade.apply(game.player);game.upgradeQueue--;hide('upgradeScreen');game.paused=false;audio.ui();if(game.upgradeQueue>0)setTimeout(openUpgrade,120)})};
  let previousPosition=null,previousTick=performance.now();
  setInterval(()=>{const now=performance.now(),dt=Math.min(.12,(now-previousTick)/1000);previousTick=now;const player=game.player;if(!player||!game.running||game.paused||game.phase!=='night'||!game.flashlight){previousPosition=player?{x:player.x,y:player.y}:null;return}if((player.manualBatteryRegen||0)>0&&previousPosition&&Math.hypot(player.x-previousPosition.x,player.y-previousPosition.y)>.15)game.flashlight.battery=Math.min(game.flashlight.maxBattery||100,(game.flashlight.battery||0)+player.manualBatteryRegen*dt);previousPosition={x:player.x,y:player.y}},50);

  /* ==================================================================
     NEW KEYBIND ROWS.
  ================================================================== */
  const customActions=[['flashlight','Lanterna'],['support1','Suporte 1'],['support2','Suporte 2']];let rebinding=null;
  function updateCustomRows(){for(const[action]of customActions){const button=document.querySelector(`[data-custom-bind="${action}"]`);if(button){button.textContent=rebinding===action?'PRESSIONE…':prettyKey(save.settings.keybinds[action]);button.classList.toggle('listening',rebinding===action)}}const battery=document.querySelector('#flashlightBatteryHud');if(battery)battery.style.setProperty('--flashlight-key',`'${prettyKey(save.settings.keybinds.flashlight)}'`);renderSupportHud();renderSupportInventory()}
  function injectCustomRows(){const grid=document.querySelector('#controlsSettings .keybind-grid');if(!grid||grid.querySelector('[data-custom-bind]'))return;for(const[action,label]of customActions){const row=document.createElement('div');row.className='keybind-row';row.innerHTML=`<span>${label}<small class="custom-bind-note">${action==='flashlight'?'Liga/desliga e economiza carga':'Seleciona item de suporte'}</small></span><button class="keybind-button" data-custom-bind="${action}">${prettyKey(save.settings.keybinds[action])}</button>`;grid.appendChild(row)}grid.querySelectorAll('[data-custom-bind]').forEach(button=>button.onclick=()=>{rebinding=button.dataset.customBind;updateCustomRows()})}
  injectCustomRows();
  window.addEventListener('keydown',event=>{const target=event.target;if(target&&/INPUT|SELECT|TEXTAREA/.test(target.tagName))return;const key=String(event.key||'').toLowerCase()===' '?'space':String(event.key||'').toLowerCase();if(rebinding){event.preventDefault();event.stopImmediatePropagation();if(key==='escape'){rebinding=null;updateCustomRows();return}const conflict=Object.entries(save.settings.keybinds).find(([action,bound])=>action!==rebinding&&bound===key);if(conflict){notice(`A TECLA ${prettyKey(key)} JÁ ESTÁ EM USO`);rebinding=null;updateCustomRows();return}save.settings.keybinds[rebinding]=key;rebinding=null;persist();updateCustomRows();return}if(!game.running||event.repeat)return;if(key===save.settings.keybinds.flashlight){event.preventDefault();toggleFlashlight();return}if(game.paused||game.shopOpen||game.inventoryOpen)return;if(key===save.settings.keybinds.support1){event.preventDefault();selectSupport(0);return}if(key===save.settings.keybinds.support2){event.preventDefault();selectSupport(1)}},true);

  /* ==================================================================
     RUN INITIALIZATION.
  ================================================================== */
  function initializeRunSystems(){if(!game.player)return;game.player.supportSlots=[null,null];game.player.activeSupport=0;game.player.quickSlotMode='weapon';game.player.flashlightDrainMult=1;game.player.manualBatteryRegen=0;game.player.__supportUseLatch=false;if(game.flashlight)game.flashlight.enabled=true;normalizeAllAmmoItems();DBG.renderWeaponHUD?.();renderSupportHud()}
  const startButton=document.querySelector('#startBtn');if(startButton){const previous=startButton.onclick;startButton.onclick=function(event){const result=previous?.call(this,event);setTimeout(initializeRunSystems,0);return result}}
  const retryButton=document.querySelector('#retryBtn');if(retryButton){const previous=retryButton.onclick;retryButton.onclick=function(event){const result=previous?.call(this,event);setTimeout(initializeRunSystems,0);return result}}

  normalizeAllAmmoItems();ensureSupportSlots();injectCustomRows();updateCustomRows();
  console.info('[Dead Signal] Support slots, grenade, flashlight toggle, battery powerups and deep ammo compatibility 11.0 loaded.');
})();
