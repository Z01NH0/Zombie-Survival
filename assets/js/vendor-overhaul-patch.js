(()=>{
  'use strict';
  if(window.__deadSignalVendorOverhaul123) return;
  window.__deadSignalVendorOverhaul123=true;
  const DBG=window.__arsenalDebug;
  if(!DBG||typeof game==='undefined')return;

  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const color=item=>DBG.itemColor?.(item)||'#dbe5ef';
  const rarity=item=>DBG.rarityLabel?.(item)||item?.rarity||'';
  const desc=item=>item?.def?.desc||'';
  const condition=item=>{
    if(item?.type!=='weapon'&&item?.type!=='armor')return item?.count>1?`${item.count} unidades`:'Uso único';
    return `${Math.max(0,Math.min(100,Math.round(DBG.durabilityPct?.(item)??100)))}%`;
  };
  const kind=item=>item?.type==='weapon'?'Arma':item?.type==='armor'?'Armadura':item?.ammoType?'Munição':'Consumível';
  const playTrade=()=>window.gameAudio?.play?.('trade');
  const sync=()=>DBG.syncStoreResources?.();
  const showScreen=id=>document.getElementById(id)?.classList.remove('hidden');

  /* -------------------- DIÁLOGO -------------------- */
  const dialogBox=$('#dialogBox');
  let dialogue=null;
  if(dialogBox){
    dialogBox.innerHTML=`<div class="vendor-dialog-shell">
      <div class="vendor-dialog-portrait"><div class="vendor-dialog-glow"></div><div class="vendor-dialog-head"></div><div class="vendor-dialog-body"></div><div class="vendor-dialog-detail"></div></div>
      <div class="vendor-dialog-copy"><div class="dialog-name" id="dialogName"></div><div class="dialog-text" id="dialogText"></div><div class="vendor-dialog-footer"><span>CANAL LOCAL</span><b>CLIQUE PARA AVANÇAR</b></div></div>
    </div>`;
  }
  function paintDialogue(){
    if(!dialogue||!dialogBox)return;
    $('#dialogName').textContent=dialogue.name;
    $('#dialogText').textContent=dialogue.text.slice(0,dialogue.visible);
    const done=dialogue.visible>=dialogue.text.length;
    dialogBox.dataset.complete=done?'1':'0';
    dialogBox.dataset.speaker=dialogue.speaker;
    const hint=dialogBox.querySelector('.vendor-dialog-footer b');
    if(hint)hint.textContent=done?'CLIQUE PARA ABRIR':'CLIQUE PARA REVELAR';
  }
  function stopDialogue(){
    if(dialogue?.timer)clearInterval(dialogue.timer);
    dialogue=null;
    dialogBox?.classList.add('hidden');
    dialogBox?.removeAttribute('data-complete');
    dialogBox?.removeAttribute('data-speaker');
    if(game.modal==='dialogue')game.modal=null;
  }
  function beginDialogue(name,text,callback,speaker){
    stopDialogue();game.paused=true;game.shopOpen=false;game.modal='dialogue';
    dialogue={name,text,callback,speaker,visible:0,timer:null};
    dialogBox?.classList.remove('hidden');paintDialogue();
    dialogue.timer=setInterval(()=>{if(!dialogue)return;dialogue.visible=Math.min(dialogue.text.length,dialogue.visible+1);paintDialogue();if(dialogue.visible>=dialogue.text.length){clearInterval(dialogue.timer);dialogue.timer=null}},24);
  }
  function advanceDialogue(){
    if(!dialogue)return;
    if(dialogue.visible<dialogue.text.length){dialogue.visible=dialogue.text.length;if(dialogue.timer)clearInterval(dialogue.timer);dialogue.timer=null;paintDialogue();return}
    const callback=dialogue.callback;stopDialogue();setTimeout(()=>callback?.(),35);
  }
  document.addEventListener('pointerdown',event=>{
    if(!dialogue||dialogBox?.classList.contains('hidden'))return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();advanceDialogue();
  },true);

  /* -------------------- ABERTURA -------------------- */
  function openMerchantNew(){
    game.paused=true;game.shopOpen=true;game.modal='merchant';DBG.buildMerchantStock?.();renderMerchantNew('buy');showScreen('merchantScreen');
  }
  function openSpecialistNew(){
    game.paused=true;game.shopOpen=true;game.modal='specialist';DBG.buildSpecialistStock?.();renderSpecialistNew('stock');showScreen('specialistScreen');
  }
  function interactNew(){
    if(!game.running||game.phase!=='day'||game.paused||game.shopOpen||game.inventoryOpen)return;
    const target=DBG.nearestInteractable?.();if(!target?.npc)return;
    if(target.npc.type==='merchant')beginDialogue('Mauro, o Mercador','Trouxe suprimentos novos. Compra o que precisa e vende o peso morto antes do anoitecer.',openMerchantNew,'merchant');
    else beginDialogue('Brutus, o Especialista','Arma mal cuidada mata o dono. Escolhe, repara ou aprimora antes de voltar para a rua.',openSpecialistNew,'specialist');
  }
  DBG.openMerchant=openMerchantNew;DBG.openSpecialist=openSpecialistNew;DBG.interact=interactNew;

  /* -------------------- COMPONENTES -------------------- */
  const header=(title,count,label='itens')=>`<div class="vendor-section-title"><b>${title}</b><span>${count} ${label}</span></div>`;
  function card(entry,index,mode){
    const item=entry.item,c=item?color(item):(mode==='merchant'?'#ffd166':'#5cecff');
    const attr=mode==='merchant'?`data-merchant-buy="${index}"`:`data-special-buy="${index}"`;
    return `<article class="vendor-product-card" style="--vendor-color:${c}"><div class="vendor-product-icon">${item?.def?.icon||entry.icon||'◆'}</div><div class="vendor-product-info"><h3 style="color:${c}">${item?.name||entry.name}</h3><p>${item?desc(item):entry.desc||''}</p><small>${item?`${kind(item)} • ${(item.type==='weapon'||item.type==='armor')?rarity(item):condition(item)}`:'Bônus da expedição'}</small></div><div class="vendor-product-action"><span>⚙ ${entry.price}</span><button class="btn primary" ${attr}>Comprar</button></div></article>`;
  }
  function sellRow(ref,index){const item=ref.item,c=color(item);return `<article class="vendor-sell-row"><div class="vendor-sell-icon" style="color:${c}">${item.def?.icon||'◆'}</div><div class="vendor-sell-info"><b style="color:${c}">${item.name}</b><span>${kind(item)} • ${condition(item)}</span></div><strong>⚙ ${DBG.sellPrice?.(item)||0}</strong><button class="btn" data-sell-index="${index}">Vender</button></article>`}

  function merchantBuyNew(index){
    const entry=game.merchantStock?.[index];if(!entry)return;
    if(game.scrap<entry.price){DBG.transactionFeedback?.('Sucata insuficiente','bad','!');return}
    if(entry.kind==='item'&&!DBG.addToInventory?.(entry.item,true))return;
    game.scrap-=entry.price;if(entry.kind==='buff')entry.buy?.();game.merchantStock.splice(index,1);playTrade();sync();DBG.renderInventory?.();DBG.renderWeaponHUD?.();renderMerchantNew('buy');
  }
  function merchantSellNew(ref){
    if(!ref?.item||ref.item.baseId==='starter')return;
    const price=DBG.sellPrice?.(ref.item)||0;game.scrap+=price;
    let blood=0;if((ref.item.type==='weapon'||ref.item.type==='armor')&&Math.random()<.12){const order={bronze:1,silver:2,gold:3,diamond:4,platinum:5,unique:6};blood=Math.max(1,Math.floor((order[ref.item.rarity]||1)/2));game.blood=(game.blood||0)+blood}
    DBG.removeOwned?.(ref);playTrade();sync();DBG.renderInventory?.();DBG.renderWeaponHUD?.();DBG.transactionFeedback?.(`Vendido por ⚙ ${price}${blood?` + 🩸 ${blood}`:''}`,'sell','⚙');renderMerchantNew('sell');
  }
  function specialistBuyNew(index){
    const entry=game.specialistStock?.[index];if(!entry)return;
    if(game.scrap<entry.price){DBG.transactionFeedback?.('Sucata insuficiente','bad','!');return}
    if(!DBG.addToInventory?.(entry.item,true))return;
    game.scrap-=entry.price;game.specialistStock.splice(index,1);playTrade();sync();DBG.renderInventory?.();DBG.renderWeaponHUD?.();renderSpecialistNew('stock');
  }

  function renderMerchantNew(tab='buy'){
    sync();$$('[data-merchant-tab]').forEach(b=>b.classList.toggle('active',b.dataset.merchantTab===tab));const box=$('#merchantContent');if(!box)return;
    if(tab==='sell'){
      const items=DBG.getAllOwned?.(false).filter(r=>r.item?.baseId!=='starter')||[];
      box.innerHTML=`<div class="vendor-shop-layout">${header('Seus itens',items.length)}${items.length?`<div class="vendor-sell-list">${items.map(sellRow).join('')}</div>`:'<div class="vendor-empty">Nenhum item para vender</div>'}</div>`;
      box.querySelectorAll('[data-sell-index]').forEach(b=>b.onclick=()=>merchantSellNew(items[Number(b.dataset.sellIndex)]));return;
    }
    const stock=game.merchantStock||[];
    box.innerHTML=`<div class="vendor-shop-layout"><section>${header('Suprimentos',stock.length)}<div class="vendor-product-grid store-grid">${stock.map((e,i)=>card(e,i,'merchant')).join('')}</div></section></div>`;
    box.querySelectorAll('[data-merchant-buy]').forEach(b=>b.onclick=()=>merchantBuyNew(Number(b.dataset.merchantBuy)));
  }

  const oldRepair=DBG.renderRepair,oldFusion=DBG.renderFusion;
  function renderSpecialistNew(tab='stock'){
    sync();$$('[data-special-tab]').forEach(b=>b.classList.toggle('active',b.dataset.specialTab===tab));const box=$('#specialistContent');if(!box)return;
    if(tab==='repair'){oldRepair?.();box.classList.add('vendor-special-workshop');return}
    if(tab==='fusion'){oldFusion?.();box.classList.add('vendor-special-workshop');return}
    box.classList.remove('vendor-special-workshop');const stock=game.specialistStock||[];
    box.innerHTML=`<div class="vendor-shop-layout"><section>${header('Armas e equipamentos',stock.length)}<div class="vendor-product-grid store-grid">${stock.map((e,i)=>card(e,i,'specialist')).join('')}</div></section></div>`;
    box.querySelectorAll('[data-special-buy]').forEach(b=>b.onclick=()=>specialistBuyNew(Number(b.dataset.specialBuy)));
  }
  DBG.renderMerchant=renderMerchantNew;DBG.renderSpecialist=renderSpecialistNew;
  $$('[data-merchant-tab]').forEach(b=>b.onclick=()=>renderMerchantNew(b.dataset.merchantTab||'buy'));
  $$('[data-special-tab]').forEach(b=>b.onclick=()=>renderSpecialistNew(b.dataset.specialTab||'stock'));

  function polishLegacyOffers(root){
    if(!root)return;
    const ammo=root.querySelector('.ammo-supply-section');
    if(ammo){
      ammo.classList.add('vendor-injected-ammo');
      const title=ammo.querySelector('.ammo-supply-head b');if(title)title.textContent='Munições';
      const description=ammo.querySelector('.ammo-supply-head div span');if(description)description.textContent='';
      const tag=ammo.querySelector('.ammo-supply-head>span');if(tag)tag.textContent='Estoque diário';
    }
    const grenade=root.querySelector('#grenadeSpecialistOffer');
    if(grenade)grenade.classList.add('vendor-grenade-ready');
  }
  for(const id of ['merchantContent','specialistContent']){
    const root=document.getElementById(id);if(!root)continue;
    new MutationObserver(()=>requestAnimationFrame(()=>polishLegacyOffers(root))).observe(root,{childList:true,subtree:true});
  }

  /* -------------------- MODELOS E VANS -------------------- */
  function wheel(x,y){ctx.fillStyle='#171c22';ctx.beginPath();ctx.arc(x,y,14,0,TAU);ctx.fill();ctx.fillStyle='#070a0e';ctx.beginPath();ctx.arc(x,y,7,0,TAU);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.12)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,10,0,TAU);ctx.stroke()}
  function van(type){
    const merchant=type==='merchant',x=merchant?-94:94,body=merchant?'#796238':'#46555f',accent=merchant?'#ffd12f':'#4db6ff',label=merchant?'SUPRIMENTOS E VENDA':'ARMAS E REPAROS';
    ctx.save();ctx.translate(x,-5);ctx.fillStyle='rgba(0,0,0,.38)';ctx.beginPath();ctx.ellipse(0,42,78,20,0,0,TAU);ctx.fill();ctx.fillStyle=body;ctx.strokeStyle='rgba(255,255,255,.1)';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-72,-28,144,62,13);ctx.fill();ctx.stroke();ctx.fillStyle='#0b1118';for(const q of [[-58,-18,28,20],[-19,-18,28,20],[20,-18,33,20]]){ctx.beginPath();ctx.roundRect(...q,5);ctx.fill()}wheel(-40,35);wheel(39,35);
    ctx.strokeStyle='rgba(255,255,255,.17)';ctx.lineWidth=1.5;for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(-57+i*25,6+(i%2)*5);ctx.lineTo(-44+i*25,1+(i%2)*5);ctx.stroke()}
    if(!merchant){ctx.strokeStyle='rgba(142,18,34,.72)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-49,15);ctx.quadraticCurveTo(-12,30,25,16);ctx.stroke();ctx.fillStyle='rgba(132,15,29,.72)';ctx.beginPath();ctx.arc(31,22,5,0,TAU);ctx.fill()}
    else{ctx.fillStyle='rgba(255,209,47,.12)';ctx.beginPath();ctx.roundRect(-66,6,24,23,5);ctx.fill();ctx.fillStyle='#8b6c32';ctx.fillRect(-62,11,16,4);ctx.fillRect(-62,18,16,4)}
    ctx.save();ctx.rotate(-.045);ctx.font='900 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=4;ctx.strokeStyle='rgba(0,0,0,.5)';ctx.strokeText(label,0,13);ctx.fillStyle=accent;ctx.fillText(label,0,13);ctx.restore();ctx.restore();
  }
  if(DBG.NPC?.prototype){DBG.NPC.prototype.draw=function(){const merchant=this.type==='merchant',accent=merchant?'#ffd166':'#5cecff';ctx.save();ctx.translate(this.x,this.y);van(this.type);ctx.fillStyle='rgba(0,0,0,.4)';ctx.beginPath();ctx.ellipse(0,31,25,10,0,0,TAU);ctx.fill();ctx.shadowBlur=16;ctx.shadowColor=accent;ctx.fillStyle=merchant?'#5b4026':'#273f4d';ctx.beginPath();ctx.roundRect(-18,-3,36,44,12);ctx.fill();ctx.fillStyle='#d8c0a5';ctx.beginPath();ctx.arc(0,-15,12,0,TAU);ctx.fill();ctx.fillStyle=accent;ctx.fillRect(-14,4,28,8);ctx.fillStyle='#1a2028';ctx.fillRect(-13,37,9,17);ctx.fillRect(4,37,9,17);
      if(merchant){ctx.fillStyle='#6f5130';ctx.fillRect(-29,8,14,28);ctx.fillRect(15,8,14,28);ctx.fillStyle='#d8a746';ctx.beginPath();ctx.roundRect(-33,23,12,10,3);ctx.fill()}
      else{ctx.strokeStyle='#d9e3ee';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(13,8);ctx.lineTo(30,-13);ctx.stroke();ctx.fillStyle='#d9e3ee';ctx.fillRect(23,-19,13,8);ctx.strokeStyle='#eee7d9';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-8,-14);ctx.lineTo(-20,-19);ctx.stroke();ctx.fillStyle='#ff8757';ctx.beginPath();ctx.arc(-21,-19,2,0,TAU);ctx.fill();const sway=Math.sin(game.time*1.7)*4;ctx.strokeStyle='rgba(215,225,235,.28)';ctx.beginPath();ctx.moveTo(-23,-22);ctx.quadraticCurveTo(-34+sway,-34,-26+sway,-46);ctx.stroke()}
      ctx.restore();ctx.fillStyle=accent;ctx.font='900 10px Inter,system-ui';ctx.textAlign='center';ctx.fillText(this.name.toUpperCase(),this.x,this.y-57)}}

  const merchantTitle=$('#merchantScreen h2'),specialistTitle=$('#specialistScreen h2');if(merchantTitle)merchantTitle.textContent='MAURO';if(specialistTitle)specialistTitle.textContent='BRUTUS';
})();
