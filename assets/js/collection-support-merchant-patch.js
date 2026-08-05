(()=>{
  'use strict';
  if(typeof game==='undefined'||!window.__arsenalDebug)return;
  const DBG=window.__arsenalDebug;
  const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const supportIds=new Set(['medkit','fielddressing','stim','battery','grenade']);
  const ammoWords=/ammo|municao|munição|cartucho|flecha|arrow|prego|nail|foguete|rocket|missil|míssil|shell/i;
  const itemColor=item=>DBG.itemColor?.(item)||'#58f2a2';
  const itemIcon=item=>item?.def?.icon||'◆';
  const itemKind=item=>item?.type==='weapon'?'Arma':item?.type==='armor'?'Armadura':item?.ammoType||ammoWords.test(`${item?.baseId||''} ${item?.name||''}`)?'Munição':'Consumível';
  const isSupport=item=>Boolean(item?.type==='consumable'&&supportIds.has(norm(item.baseId))&&!ammoWords.test(`${item.baseId||''} ${item.name||''}`));
  // AmmoDrop é criado dentro de um módulo privado. Em alguns navegadores,
  // `ammoDefs` não fica visível para este patch, então o feed usa um mapa local.
  const ammoFeedDefs={
    handgun:{name:'Munição de Pistola',icon:'▰'},light:{name:'Munição Leve',icon:'▥'},
    shells:{name:'Cartuchos de Escopeta',icon:'▤'},precision:{name:'Munição de Precisão',icon:'◆'},
    rockets:{name:'Mísseis Compactos',icon:'▲'},arrows:{name:'Flechas Reforçadas',icon:'➶'},
    nails:{name:'Pregos Industriais',icon:'⌁'}
  };

  /* ================================================================
     FEED DE TODAS AS COLETAS DO CHÃO — rastreamento centralizado
  ================================================================ */
  const liveEntries=new Map();
  const reportedPickups=new WeakSet();
  function ensurePickupFeed(){
    let feed=document.getElementById('resourcePickupFeed');
    if(feed)return feed;
    feed=document.createElement('div');
    feed.id='resourcePickupFeed';
    feed.setAttribute('aria-live','polite');
    document.body.appendChild(feed);
    return feed;
  }
  function removeFeedState(key,state){
    if(state?.element?.isConnected)state.element.remove();
    if(liveEntries.get(key)===state)liveEntries.delete(key);
  }
  function pushGroundPickup(label,amount=1,icon='◆',color='#58f2a2',kind='Item'){
    const feed=ensurePickupFeed();
    const key=`${norm(label)}:${norm(kind)}`;
    const numeric=Math.max(1,Number(amount)||1);
    const previous=liveEntries.get(key);
    if(previous?.element?.isConnected){
      previous.amount+=numeric;
      previous.element.querySelector('.pickup-amount').textContent=`+${previous.amount}`;
      clearTimeout(previous.timer);
      previous.element.style.animation='none';
      void previous.element.offsetWidth;
      previous.element.style.animation='resourcePickupIn .2s ease-out,resourcePickupOut .3s 2.35s forwards';
      previous.timer=setTimeout(()=>removeFeedState(key,previous),2750);
      return;
    }
    const entry=document.createElement('div');
    entry.className='resource-pickup-entry item-pickup-entry';
    entry.style.setProperty('--resource-color',color);
    entry.innerHTML=`<span class="resource-icon"></span><b><strong class="pickup-amount">+${numeric}</strong><span class="pickup-name"></span><small class="pickup-kind"></small></b>`;
    entry.querySelector('.resource-icon').textContent=icon;
    entry.querySelector('.pickup-name').textContent=label;
    entry.querySelector('.pickup-kind').textContent=kind;
    feed.appendChild(entry);
    while(feed.children.length>5){
      const first=feed.firstElementChild;
      for(const [entryKey,state] of liveEntries){
        if(state.element===first){clearTimeout(state.timer);liveEntries.delete(entryKey);break}
      }
      first?.remove();
    }
    const state={element:entry,amount:numeric,timer:null};
    state.timer=setTimeout(()=>removeFeedState(key,state),2750);
    liveEntries.set(key,state);
  }
  window.__deadSignalGroundPickup=pushGroundPickup;

  function reportItem(item){
    if(!item)return;
    const amount=item.type==='consumable'?Math.max(1,Number(item.count)||1):1;
    pushGroundPickup(item.name||item.def?.name||'Item',amount,itemIcon(item),itemColor(item),itemKind(item));
  }
  function reportPickup(pickup){
    if(!pickup||pickup.__pickupFeedReported||reportedPickups.has(pickup))return false;
    let reported=false;
    if(pickup.item?.resource){
      pushGroundPickup(pickup.label||'Fragmento do chefe',1,'☠',pickup.color||'#ffd166','Recurso especial');reported=true;
    }else if(pickup.item){
      reportItem(pickup.item);reported=true;
    }else{
      const external=typeof ammoDefs!=='undefined'?ammoDefs?.[pickup.type]:null;
      const ammoDefinition=external||ammoFeedDefs[pickup.type];
      if(ammoDefinition){
        pushGroundPickup(ammoDefinition.name||'Munição',1,ammoDefinition.icon||'▰','#5cecff','Munição');reported=true;
      }else{
        const data={
          xp:['Fragmento de experiência',1,'✦','#9d7cff','Experiência'],
          heal:['Recuperação',1,'✚','#58f2a2','Cura'],
          core:['Núcleo de energia',1,'◆','#ffd166','Recurso']
        }[pickup.type];
        if(data){pushGroundPickup(...data);reported=true}
      }
    }
    if(reported){pickup.__pickupFeedReported=true;reportedPickups.add(pickup)}
    return reported;
  }

  /*
     O loop do jogador é a fonte de verdade: ele sabe exatamente quais pickups
     saíram do chão. Isso evita depender de nomes de classes ou da ordem dos patches.
  */
  if(typeof Player!=='undefined'&&!Player.prototype.update.__universalPickupFeed){
    const previousPlayerUpdate=Player.prototype.update;
    function updateWithPickupFeed(...args){
      const before=Array.isArray(game.pickups)?game.pickups.slice():[];
      const result=previousPlayerUpdate.apply(this,args);
      if(before.length){
        const remaining=new Set(game.pickups||[]);
        for(const pickup of before){
          if(remaining.has(pickup))continue;
          /* Coletas que falham são recolocadas no chão por setTimeout(0).
             A confirmação atrasada separa sucesso real de inventário cheio. */
          setTimeout(()=>{
            if(!game.pickups?.includes(pickup))reportPickup(pickup);
          },0);
        }
      }
      return result;
    }
    updateWithPickupFeed.__universalPickupFeed=true;
    Player.prototype.update=updateWithPickupFeed;
  }


  /* Confirma a coleta na própria classe do pickup. O rastreamento do loop
     continua como segurança, mas estes wrappers cobrem munições e pickups
     que encerram a coleta alterando `life` antes da remoção do array. */
  function wrapPickupCollector(klass){
    if(!klass?.prototype||typeof klass.prototype.collect!=='function'||klass.prototype.collect.__groundFeedWrapped)return;
    const previous=klass.prototype.collect;
    function collectWithGroundFeed(...args){
      const beforeLife=Number(this.life);
      const result=previous.apply(this,args);
      const collected=(Number(this.life)<=0)||(Number.isFinite(beforeLife)&&beforeLife>0&&Number(this.life)<beforeLife&&Number(this.life)<=0);
      if(collected)queueMicrotask(()=>reportPickup(this));
      return result;
    }
    collectWithGroundFeed.__groundFeedWrapped=true;
    klass.prototype.collect=collectWithGroundFeed;
  }
  try{if(typeof GearPickup!=='undefined')wrapPickupCollector(GearPickup)}catch(_){}
  try{if(typeof AmmoDrop!=='undefined')wrapPickupCollector(AmmoDrop)}catch(_){}
  try{if(typeof Pickup!=='undefined')wrapPickupCollector(Pickup)}catch(_){}
  window.__deadSignalPickupDebug={pushGroundPickup,reportPickup,reportItem,wrapPickupCollector};

  /* ================================================================
     ARRASTAR E SOLTAR NOS SLOTS 4/5
  ================================================================ */
  const player=()=>game.player;
  const slots=()=>{const p=player();if(!p)return null;if(!Array.isArray(p.supportSlots))p.supportSlots=[null,null];while(p.supportSlots.length<2)p.supportSlots.push(null);return p.supportSlots};
  const readSource=event=>String(event.dataTransfer?.getData('text/plain')||'');
  const parseSource=value=>{const [source,key]=String(value||'').split(':');return{source,key:Number(key)}};
  const sourceItem=source=>{const p=player(),s=slots();if(!p||!s)return null;if(source.source==='inventory')return p.inventory?.[source.key]||null;if(source.source==='support')return s[source.key]||null;return null};
  const refresh=()=>{DBG.renderInventory?.();DBG.renderWeaponHUD?.()};
  const pulseInvalid=element=>{if(!element)return;element.classList.remove('support-drag-invalid');void element.offsetWidth;element.classList.add('support-drag-invalid');setTimeout(()=>element.classList.remove('support-drag-invalid'),360)};
  const clearDragMarks=()=>document.querySelectorAll('.support-drag-valid,.support-drag-invalid,.support-drag-source,.support-return-valid').forEach(el=>el.classList.remove('support-drag-valid','support-drag-invalid','support-drag-source','support-return-valid'));

  function moveToSupport(source,targetIndex){
    const p=player(),support=slots(),item=sourceItem(source);if(!p||!support||!item||targetIndex<0||targetIndex>1)return false;
    if(!isSupport(item))return false;
    if(source.source==='support'&&source.key===targetIndex)return true;
    const target=support[targetIndex]||null;
    if(target&&target.baseId===item.baseId){
      target.count=Math.max(1,Number(target.count)||1)+Math.max(1,Number(item.count)||1);
      if(source.source==='inventory')p.inventory[source.key]=null;else support[source.key]=null;
    }else if(source.source==='inventory'){
      p.inventory[source.key]=target;
      support[targetIndex]=item;
    }else if(source.source==='support'){
      support[source.key]=target;
      support[targetIndex]=item;
    }else return false;
    p.quickSlotMode='support';p.activeSupport=targetIndex;p.__supportUseLatch=false;
    refresh();return true;
  }
  function moveSupportToInventory(source,targetIndex){
    const p=player(),support=slots(),item=sourceItem(source);if(!p||!support||source.source!=='support'||!item||targetIndex<0||targetIndex>=p.inventory.length)return false;
    const target=p.inventory[targetIndex]||null;
    if(target&&!isSupport(target))return false;
    if(target&&target.baseId===item.baseId){
      target.count=Math.max(1,Number(target.count)||1)+Math.max(1,Number(item.count)||1);support[source.key]=null;
    }else{p.inventory[targetIndex]=item;support[source.key]=target}
    if(p.quickSlotMode==='support'&&p.activeSupport===source.key&&!support[source.key])p.quickSlotMode='weapon';
    refresh();return true;
  }
  function enhanceSupportSlots(){
    const support=slots();if(!support)return;
    document.querySelectorAll('#supportEquipRow [data-support-slot]').forEach(element=>{
      const index=Number(element.dataset.supportSlot),item=support[index];
      element.draggable=Boolean(item);
      if(item)element.dataset.supportDrag=`support:${index}`;else delete element.dataset.supportDrag;
      element.ondragstart=event=>{if(!item)return event.preventDefault();event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',`support:${index}`);element.classList.add('support-drag-source')};
      element.ondragend=clearDragMarks;
      element.ondragover=event=>{event.preventDefault();const src=parseSource(readSource(event)),valid=isSupport(sourceItem(src));event.dataTransfer.dropEffect=valid?'move':'none';element.classList.toggle('support-drag-valid',valid)};
      element.ondragleave=()=>element.classList.remove('support-drag-valid');
      element.ondrop=event=>{event.preventDefault();event.stopPropagation();const src=parseSource(readSource(event));const ok=moveToSupport(src,index);clearDragMarks();if(!ok)pulseInvalid(element)};
    });
  }
  const inventoryGrid=document.getElementById('inventoryGrid');
  if(inventoryGrid){
    inventoryGrid.addEventListener('dragover',event=>{const source=parseSource(readSource(event));if(source.source!=='support')return;const target=event.target.closest?.('[data-inv-slot]');if(!target)return;event.preventDefault();event.stopPropagation();const targetItem=player()?.inventory?.[Number(target.dataset.invSlot)];const valid=!targetItem||isSupport(targetItem);event.dataTransfer.dropEffect=valid?'move':'none';target.classList.toggle('support-return-valid',valid)},true);
    inventoryGrid.addEventListener('dragleave',event=>{event.target.closest?.('[data-inv-slot]')?.classList.remove('support-return-valid')},true);
    inventoryGrid.addEventListener('drop',event=>{const source=parseSource(readSource(event));if(source.source!=='support')return;const target=event.target.closest?.('[data-inv-slot]');if(!target)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();const ok=moveSupportToInventory(source,Number(target.dataset.invSlot));clearDragMarks();if(!ok)pulseInvalid(target)},true);
  }
  const previousSupportInventoryHook=window.__deadSignalRenderSupportInventory;
  window.__deadSignalRenderSupportInventory=function(){previousSupportInventoryHook?.();enhanceSupportSlots()};
  requestAnimationFrame(enhanceSupportSlots);

  /* Loja reorganizada pelo vendor-overhaul-patch.js. */
})();
