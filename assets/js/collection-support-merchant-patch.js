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
    if(!pickup||reportedPickups.has(pickup))return;
    reportedPickups.add(pickup);
    if(pickup.item?.resource){
      pushGroundPickup(pickup.label||'Fragmento do chefe',1,'☠',pickup.color||'#ffd166','Recurso especial');
      return;
    }
    if(pickup.item){reportItem(pickup.item);return}
    const ammoDefinition=typeof ammoDefs!=='undefined'?ammoDefs?.[pickup.type]:null;
    if(ammoDefinition){
      pushGroundPickup(ammoDefinition.name||'Munição',1,ammoDefinition.icon||'▰','#5cecff','Munição');
      return;
    }
    const data={
      xp:['Fragmento de experiência',1,'✦','#9d7cff','Experiência'],
      heal:['Recuperação',1,'✚','#58f2a2','Cura'],
      core:['Núcleo de energia',1,'◆','#ffd166','Recurso']
    }[pickup.type];
    if(data)pushGroundPickup(...data);
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

  /* ================================================================
     ARRASTAR E SOLTAR NOS SLOTS 4/5
  ================================================================ */
  const player=()=>game.player;
  const slots=()=>{const p=player();if(!p)return null;if(!Array.isArray(p.supportSlots))p.supportSlots=[null,null];while(p.supportSlots.length<2)p.supportSlots.push(null);return p.supportSlots};
  const readSource=event=>String(event.dataTransfer?.getData('text/plain')||'');
  const parseSource=value=>{const [source,key]=String(value||'').split(':');return{source,key:Number(key)}};
  const sourceItem=source=>{const p=player(),s=slots();if(!p||!s)return null;if(source.source==='inventory')return p.inventory?.[source.key]||null;if(source.source==='support')return s[source.key]||null;return null};
  const refresh=()=>{DBG.renderInventory?.();DBG.renderWeaponHUD?.();updateHUD?.()};
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
  const supportRow=document.getElementById('supportEquipRow');
  if(supportRow)new MutationObserver(()=>requestAnimationFrame(enhanceSupportSlots)).observe(supportRow,{childList:true,subtree:true});
  const inventoryGrid=document.getElementById('inventoryGrid');
  if(inventoryGrid){
    inventoryGrid.addEventListener('dragover',event=>{const source=parseSource(readSource(event));if(source.source!=='support')return;const target=event.target.closest?.('[data-inv-slot]');if(!target)return;event.preventDefault();event.stopPropagation();const targetItem=player()?.inventory?.[Number(target.dataset.invSlot)];const valid=!targetItem||isSupport(targetItem);event.dataTransfer.dropEffect=valid?'move':'none';target.classList.toggle('support-return-valid',valid)},true);
    inventoryGrid.addEventListener('dragleave',event=>{event.target.closest?.('[data-inv-slot]')?.classList.remove('support-return-valid')},true);
    inventoryGrid.addEventListener('drop',event=>{const source=parseSource(readSource(event));if(source.source!=='support')return;const target=event.target.closest?.('[data-inv-slot]');if(!target)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();const ok=moveSupportToInventory(source,Number(target.dataset.invSlot));clearDragMarks();if(!ok)pulseInvalid(target)},true);
  }
  const inventoryScreen=document.getElementById('inventoryScreen');
  if(inventoryScreen)new MutationObserver(()=>requestAnimationFrame(enhanceSupportSlots)).observe(inventoryScreen,{childList:true,subtree:true});
  requestAnimationFrame(enhanceSupportSlots);

  /* ================================================================
     MERCADOR — COMPRA, MUNIÇÕES E VENDA REORGANIZADAS
  ================================================================ */
  const typeLabel=item=>item?.type==='weapon'?'Arma':item?.type==='armor'?'Armadura':item?.ammoType?'Munição':'Consumível';
  const conditionLabel=item=>{
    if(item?.type!=='weapon'&&item?.type!=='armor')return item?.count>1?`${item.count} unidades`:'Uso único';
    const pct=Math.max(0,Math.min(100,Math.round(DBG.durabilityPct?.(item)??100)));return `${pct}% de condição`;
  };
  function merchantBuyMarkup(stock){
    return `<div class="merchant-section-head"><b>Mercadorias</b><span>${stock.length} disponíveis</span></div><div class="store-grid merchant-buy-grid">${stock.map((entry,index)=>{
      const item=entry.item,color=item?itemColor(item):'#ffd166',name=item?.name||entry.name,desc=item?itemDescription(item):entry.desc,meta=item?`${typeLabel(item)} • ${item.type==='weapon'||item.type==='armor'?rarityLabel(item):conditionLabel(item)}`:'Melhoria da expedição';
      return `<article class="merchant-product" style="--product-color:${color}"><div class="merchant-product-icon">${item?.def?.icon||entry.icon||'◆'}</div><div class="merchant-product-copy"><h3 style="color:${color}">${name}</h3><p>${desc||''}</p><div class="merchant-product-meta">${meta}</div></div><div class="merchant-product-buy"><span class="merchant-price">⚙ ${entry.price}</span><button class="btn primary" data-merchant-buy="${index}">Comprar</button></div></article>`
    }).join('')}</div>`;
  }
  function merchantSellMarkup(items){
    if(!items.length)return '<div class="merchant-empty">Nenhum item disponível para venda</div>';
    return `<div class="merchant-section-head"><b>Venda</b><span>${items.length} itens</span></div><div class="merchant-sell-list">${items.map((ref,index)=>{
      const item=ref.item,color=itemColor(item),price=sellPrice(item),meta=`${typeLabel(item)} • ${conditionLabel(item)}`;
      return `<article class="merchant-sell-row"><div class="merchant-sell-icon" style="color:${color}">${item.def?.icon||'◆'}</div><div class="merchant-sell-copy"><b style="color:${color}">${item.name}</b><span>${meta}</span></div><div class="merchant-sell-value">⚙ ${price}</div><button class="btn" data-sell="${index}">Vender</button></article>`
    }).join('')}</div>`;
  }
  const previousRenderMerchant=renderMerchant;
  renderMerchant=function(tab='buy'){
    syncStoreResources();
    document.querySelectorAll('[data-merchant-tab]').forEach(button=>button.classList.toggle('active',button.dataset.merchantTab===tab));
    const content=document.getElementById('merchantContent');if(!content)return;
    if(tab==='buy'){
      content.innerHTML=merchantBuyMarkup(game.merchantStock||[]);
      content.querySelectorAll('[data-merchant-buy]').forEach(button=>button.onclick=()=>merchantBuy(Number(button.dataset.merchantBuy)));
    }else{
      const items=getAllOwned(false).filter(ref=>ref.item?.baseId!=='starter');
      content.innerHTML=merchantSellMarkup(items);
      content.querySelectorAll('[data-sell]').forEach(button=>button.onclick=()=>merchantSell(items[Number(button.dataset.sell)]));
    }
    requestAnimationFrame(polishAmmoSection);
  };
  function polishAmmoSection(){
    const section=document.querySelector('#merchantScreen:not(.hidden) .ammo-supply-section');if(!section)return;
    const title=section.querySelector('.ammo-supply-head b');if(title)title.textContent='Munições';
    const tag=section.querySelector('.ammo-supply-head>span');if(tag)tag.textContent='Estoque diário';
  }
  const merchantContent=document.getElementById('merchantContent');
  if(merchantContent)new MutationObserver(()=>requestAnimationFrame(polishAmmoSection)).observe(merchantContent,{childList:true,subtree:true});

  /* Reabre a aba atual com o novo layout caso o patch carregue enquanto a loja está aberta. */
  if(!document.getElementById('merchantScreen')?.classList.contains('hidden')){
    const active=document.querySelector('[data-merchant-tab].active');renderMerchant(active?.dataset.merchantTab||'buy');
  }
})();
