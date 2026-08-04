(function(){
  'use strict';
  if(window.__deadSignalEnemyOverhaul12) return;
  window.__deadSignalEnemyOverhaul12 = true;

  const weightedPick = entries => {
    let total = 0;
    for(const e of entries) total += e.w;
    let roll = Math.random() * total;
    for(const e of entries){ roll -= e.w; if(roll <= 0) return e.v; }
    return entries[entries.length - 1].v;
  };
  const angDiff = (a,b)=>Math.abs(Math.atan2(Math.sin(a-b), Math.cos(a-b)));
  const enemyFacingPlayer = enemy => Math.atan2(game.player.y - enemy.y, game.player.x - enemy.x);
  const incomingBulletFor = enemy => {
    let nearest=null, nearestDistance=enemy.r+20;
    for(const bullet of game.bullets||[]){
      if(!bullet||bullet.life<=0||bullet.hit?.has?.(enemy))continue;
      const dx=enemy.x-bullet.x,dy=enemy.y-bullet.y,d=Math.hypot(dx,dy);
      if(d>nearestDistance)continue;
      const forward=Math.cos(bullet.a||0)*dx+Math.sin(bullet.a||0)*dy;
      if(forward<=0)continue;
      nearest=bullet;nearestDistance=d;
    }
    return nearest;
  };
  const currentWeaponKind = ()=>{
    const p = game.player; if(!p || !p.weaponSlots) return null;
    const w = p.weaponSlots[p.activeWeapon];
    return w?.def?.kind || null;
  };
  const isMeleeHit = enemy => {
    const p = game.player;
    return !!(p && p.meleeAnim && p.meleeAnim.time > 0 && currentWeaponKind() === 'melee' && Math.hypot((p.x||0)-enemy.x,(p.y||0)-enemy.y) < 210 + enemy.r);
  };
  const trailBurst = (x,y,color,count=10,spread=220)=>{
    for(let i=0;i<count;i++){
      const a = rand(0, TAU), s = rand(spread*.35, spread), life = rand(.14, .34);
      game.particles.push({type:'spark',x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life,max:life,r:rand(6,18),color,gravity:0});
    }
  };
  const pushEnemy = (enemy, x, y, force) => {
    const a = Math.atan2(enemy.y-y, enemy.x-x);
    enemy.vx = (enemy.vx||0) + Math.cos(a) * force;
    enemy.vy = (enemy.vy||0) + Math.sin(a) * force;
  };

  Object.assign(ENEMIES, {
    carapace:{hp:240,speed:66,damage:16,r:28,xp:34,color:'#57676b'},
    reflector:{hp:188,speed:74,damage:15,r:27,xp:33,color:'#4b8bb7'},
    lancer:{hp:120,speed:94,damage:17,r:24,xp:31,color:'#8c7c61'},
    brood:{hp:165,speed:72,damage:14,r:29,xp:38,color:'#6f7c55'},
    dodger:{hp:108,speed:132,damage:13,r:20,xp:35,color:'#725f9c'},
    baby:{hp:16,speed:178,damage:5,r:10,xp:4,color:'#b6cf85'}
  });

  const specialTypes = new Set(['carapace','reflector','lancer','brood','dodger','baby']);
  const baseSpawnEnemy = spawnEnemy;
  const baseSpawnEnemyNear = spawnEnemyNear;
  const baseChooseEnemy = chooseEnemy;
  function initSpecial(enemy){
    if(!enemy || enemy.__enemyOverhaulInit) return enemy;
    enemy.__enemyOverhaulInit = true;
    if(enemy.type === 'carapace'){
      enemy.bulletMitigation = .42;
      enemy.meleeMultiplier = 1.9;
      enemy.plateGlow = rand(0,TAU);
    }else if(enemy.type === 'reflector'){
      enemy.reflectArc = .9;
      enemy.reflectCd = 0;
      enemy.reflectShield = 9999;
      enemy.plateGlow = rand(0,TAU);
    }else if(enemy.type === 'lancer'){
      enemy.chargeCd = rand(1.3, 2.8);
      enemy.chargeTime = 0;
      enemy.chargeDir = 0;
      enemy.chargeTelegraph = 0;
      enemy.chargeImpactCd = 0;
    }else if(enemy.type === 'brood'){
      enemy.spawnCount = 3;
      enemy.phase = rand(0,TAU);
    }else if(enemy.type === 'dodger'){
      enemy.dodgeCd = rand(.2, 1.4);
      enemy.feint = rand(0,TAU);
    }else if(enemy.type === 'baby'){
      enemy.hitCd = .4;
    }
    return enemy;
  }

  chooseEnemy = function(){
    const n = game?.night || 1;
    const entries = [
      {v:'walker',w:2.6},
      {v:'runner',w:1.9}
    ];
    if(n>=2) entries.push({v:'spitter',w:1.15});
    if(n>=3) entries.push({v:'brute',w:1.1},{v:'bomber',w:.95},{v:'carapace',w:.75});
    if(n>=4) entries.push({v:'wraith',w:.9},{v:'shield',w:.9},{v:'lancer',w:.68},{v:'brood',w:.6});
    if(n>=5) entries.push({v:'reflector',w:.58},{v:'dodger',w:.55});
    if(n>=6) entries.push({v:'necromancer',w:.5});
    return weightedPick(entries);
  };

  spawnEnemy = function(){
    /* Cada Ninhada reserva dois espaços para que sua morte consiga gerar
       três bebês sem romper o teto de 30 ameaças vivas. */
    const alive=(game.enemies||[]).filter(enemy=>!enemy.dead).length;
    const broods=(game.enemies||[]).filter(enemy=>!enemy.dead&&enemy.type==='brood').length;
    const reserved=Math.min(8,broods*2);
    if(alive>=30-reserved)return;
    const before = game.enemies.length;
    const result = baseSpawnEnemy.apply(this, arguments);
    for(let i = before; i < game.enemies.length; i++) initSpecial(game.enemies[i]);
    return result;
  };
  spawnEnemyNear = function(type, x, y, elite){
    const before = game.enemies.length;
    const result = baseSpawnEnemyNear.apply(this, arguments);
    for(let i = before; i < game.enemies.length; i++) initSpecial(game.enemies[i]);
    return result;
  };

  const baseEnemyUpdate = Enemy.prototype.update;
  Enemy.prototype.update = function(dt){
    initSpecial(this);
    if(this.dead) return;
    if(this.type === 'reflector')this.reflectCd=Math.max(0,(this.reflectCd||0)-dt);
    if(this.type === 'lancer'){
      this.flash -= dt; this.hitCd -= dt; this.attackCd -= dt;
      this.chargeCd -= dt; this.chargeImpactCd -= dt; this.chargeTelegraph = Math.max(0, (this.chargeTelegraph||0) - dt);
      const p = game.player, dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx,dy)||1, a = Math.atan2(dy,dx);
      if(this.chargeTime > 0){
        this.chargeTime -= dt;
        this.vx = Math.cos(this.chargeDir) * 460;
        this.vy = Math.sin(this.chargeDir) * 460;
        const ox=this.x, oy=this.y;
        this.x += this.vx * dt; this.y += this.vy * dt;
        trail(this.x, this.y, '#f2c27a', 3);
        if(worldBlocked(this.x,this.y,this.r)){ this.x=ox; this.y=oy; this.chargeTime = 0; shockwave(this.x,this.y,'#ffba66',95,.26,5); }
        const impactDistance=Math.hypot(p.x-this.x,p.y-this.y);
        if(impactDistance < this.r + p.r + 10 && this.chargeImpactCd <= 0){ this.chargeImpactCd = .5; p.hurt(this.damageValue*1.45); screenShake(7); this.chargeTime = 0; }
        return;
      }
      if(this.chargeCd <= 0 && d < 350 && d > 95){
        this.chargeCd = rand(3.3,5.1);
        this.chargeTime = .52;
        this.chargeDir = a;
        this.chargeTelegraph = .34;
        lineEffect(this.x,this.y,this.x+Math.cos(a)*100,this.y+Math.sin(a)*100,'#ffd166',.24,4);
        burst(this.x,this.y,'#ffd166',8,160,4);
        return;
      }
    }
    if(this.type === 'dodger'){
      this.dodgeCd -= dt;
      if(this.dodgeCd <= 0){
        let nearest = null, nearestD = 82;
        for(const b of game.bullets){
          const bd = Math.hypot((b.x||0)-this.x, (b.y||0)-this.y);
          if(bd < nearestD){ nearestD = bd; nearest = b; }
        }
        if(nearest){
          const aa = Math.atan2(nearest.y - this.y, nearest.x - this.x) + (Math.random()<.5 ? Math.PI/2 : -Math.PI/2);
          this.vx = (this.vx||0) + Math.cos(aa) * 310;
          this.vy = (this.vy||0) + Math.sin(aa) * 310;
          this.dodgeCd = rand(.95,1.45);
          burst(this.x,this.y,'#bfa9ff',5,110,3);
        }
      }
    }
    baseEnemyUpdate.call(this, dt);
    if(this.type === 'brood'){
      this.vx += Math.sin(game.time*2.6 + this.phase) * 5 * dt;
      this.vy += Math.cos(game.time*2.4 + this.phase) * 5 * dt;
    }
    if(this.type === 'baby'){
      this.vx *= 1.02; this.vy *= 1.02;
    }
  };

  const baseEnemyDamage = Enemy.prototype.damage;
  Enemy.prototype.damage = function(v, crit){
    initSpecial(this);
    if(this.dead) return;
    const melee = isMeleeHit(this);
    if(this.type === 'carapace'){
      if(melee){ v *= this.meleeMultiplier || 1.9; sparks(this.x,this.y,'#ffd166',6); }
      else { v *= this.bulletMitigation || .42; sparks(this.x,this.y,'#7f96a1',7); }
    }
    if(this.type === 'reflector' && !melee){
      const incoming=incomingBulletFor(this);
      if(incoming){
        const facing=enemyFacingPlayer(this);
        const impactSide=Math.atan2(incoming.y-this.y,incoming.x-this.x);
        if(angDiff(facing,impactSide)<(this.reflectArc||.9)){
          incoming.life=0;
          if((this.reflectCd||0)<=0){
            this.reflectCd=.24;
            lineEffect(this.x,this.y,game.player.x,game.player.y,'#8be9ff',.18,4);
            sparks(this.x,this.y,'#8be9ff',8);
            burst(this.x,this.y,'#8be9ff',6,120,3);
            game.enemyBullets.push(new EnemyBullet(this.x,this.y,Math.atan2(game.player.y-this.y,game.player.x-this.x),360,this.damageValue*.6,'boss'));
          }
          return;
        }
      }
    }
    return baseEnemyDamage.call(this, v, crit);
  };

  const baseEnemyDie = Enemy.prototype.die;
  Enemy.prototype.die = function(){
    if(this.dead) return;
    const type = this.type, x=this.x, y=this.y;
    baseEnemyDie.call(this);
    if(type === 'brood'){
      for(let i=0;i<3;i++) spawnEnemyNear('baby', x + rand(-8,8), y + rand(-8,8), false);
      burst(x,y,'#c5ef8a',12,180,5);
      shockwave(x,y,'#b9da75',64,.24,3);
    }
  };

  const baseEnemyDraw = Enemy.prototype.draw;
  Enemy.prototype.draw = function(){
    initSpecial(this);
    if(!specialTypes.has(this.type)) return baseEnemyDraw.call(this);
    const vis = bodyVisibility(this), eyes = eyeVisibility(this), a = Math.atan2(game.player.y-this.y, game.player.x-this.x), walk = Math.sin((this.step||0))*3;
    ctx.save();
    ctx.translate(this.x,this.y);
    ctx.fillStyle='rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.ellipse(0,this.r*1.14,this.r*.95,this.r*.33,0,0,TAU);
    ctx.fill();
    ctx.rotate(a);
    ctx.globalAlpha = game.phase==='day' ? 1 : Math.max(.06, vis);
    ctx.shadowBlur = this.elite ? 22 : 11;
    ctx.shadowColor = this.elite ? '#ffd166' : this.color;
    ctx.fillStyle = this.flash>0 ? '#fff' : this.color;
    ctx.strokeStyle = 'rgba(0,0,0,.46)';
    ctx.lineWidth = this.elite ? 3.4 : 2;

    if(this.type === 'carapace'){
      roundedRectPath(ctx,-this.r*.8,-this.r*.02,this.r*1.6,this.r*1.48,14); ctx.fill(); ctx.stroke();
      ctx.fillStyle='rgba(0,0,0,.22)';
      for(let i=0;i<4;i++){
        roundedRectPath(ctx,-this.r*.62 + i*9, -this.r*.16 + (i%2)*4, 14, 12, 4); ctx.fill();
      }
      ctx.fillStyle='#7b877c'; ctx.beginPath(); ctx.arc(0,-this.r*.46,this.r*.56,0,TAU); ctx.fill();
      ctx.strokeStyle='#95a4b2'; ctx.lineWidth=3;
      for(let i=-1;i<=1;i++){ ctx.beginPath(); ctx.moveTo(-this.r*.45, i*8+8); ctx.lineTo(this.r*.45, i*8+2); ctx.stroke(); }
    }else if(this.type === 'reflector'){
      roundedRectPath(ctx,-this.r*.72,0,this.r*1.42,this.r*1.34,12); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#8a9380'; ctx.beginPath(); ctx.arc(0,-this.r*.46,this.r*.56,0,TAU); ctx.fill();
      ctx.strokeStyle='#8be9ff'; ctx.lineWidth=5;
      ctx.beginPath(); ctx.arc(this.r*.16, 3, this.r*.72, -1.1, 1.1); ctx.stroke();
      ctx.fillStyle='rgba(139,233,255,.22)'; ctx.beginPath(); ctx.arc(this.r*.16, 3, this.r*.72, -1.1, 1.1); ctx.fill();
    }else if(this.type === 'lancer'){
      ctx.beginPath(); ctx.moveTo(-this.r*.88,6); ctx.lineTo(-this.r*.4,-this.r*.42); ctx.lineTo(this.r*.86,-this.r*.12); ctx.lineTo(this.r*.45,this.r*.78); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#9b9f93'; ctx.beginPath(); ctx.arc(-1,-this.r*.46,this.r*.54,0,TAU); ctx.fill();
      ctx.fillStyle='#dfc392'; ctx.fillRect(this.r*.18,-6,this.r*1.1,4);
      ctx.beginPath(); ctx.moveTo(this.r*1.18,-9); ctx.lineTo(this.r*1.6,-1); ctx.lineTo(this.r*1.18,7); ctx.closePath(); ctx.fill();
      if(this.chargeTelegraph>0){ ctx.strokeStyle='#ffd166'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(this.r*2.1,0); ctx.stroke(); }
    }else if(this.type === 'brood'){
      ctx.beginPath(); ctx.ellipse(0,this.r*.18,this.r*.94,this.r*1.06,0,0,TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#868f7b'; ctx.beginPath(); ctx.arc(0,-this.r*.4,this.r*.46,0,TAU); ctx.fill();
      ctx.fillStyle='rgba(0,0,0,.18)';
      for(let i=0;i<3;i++){ ctx.beginPath(); ctx.arc(-this.r*.38 + i*this.r*.38, this.r*.4, this.r*.16, 0, TAU); ctx.fill(); }
    }else if(this.type === 'dodger'){
      ctx.beginPath(); ctx.moveTo(-this.r*.78,6); ctx.lineTo(-this.r*.2,-this.r*.58); ctx.lineTo(this.r*.82,-this.r*.08); ctx.lineTo(this.r*.2,this.r*.84); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#c0c4ba'; ctx.beginPath(); ctx.arc(0,-this.r*.5,this.r*.52,0,TAU); ctx.fill();
      ctx.strokeStyle='#bfa9ff'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(0,0,this.r*.92,Math.PI*.15,Math.PI*.85); ctx.stroke();
    }else if(this.type === 'baby'){
      ctx.beginPath(); ctx.arc(0,this.r*.12,this.r*.82,0,TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle='#cfd8bb'; ctx.beginPath(); ctx.arc(0,-this.r*.35,this.r*.48,0,TAU); ctx.fill();
    }

    ctx.fillStyle='rgba(0,0,0,.32)';
    if(this.type !== 'baby'){
      ctx.fillRect(-this.r*.36,this.r*.44+walk,this.r*.25,this.r*.72);
      ctx.fillRect(this.r*.06,this.r*.44-walk,this.r*.25,this.r*.72);
    }

    ctx.globalAlpha = 1;
    const eyeAlpha = game.phase==='day' ? .72 : Math.max(.1, eyes*.86);
    ctx.fillStyle = `rgba(255,34,58,${eyeAlpha})`;
    ctx.shadowBlur = 14; ctx.shadowColor='#ff2748';
    ctx.beginPath();
    ctx.arc(this.r*.12,-this.r*.48,this.type==='baby'?2.4:3.2,0,TAU);
    ctx.arc(this.r*.4,-this.r*.48,this.type==='baby'?2.4:3.2,0,TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
    if(vis>.18 || game.phase==='day'){
      const w = this.r*2.25;
      ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(this.x-w/2,this.y-this.r-18,w,5);
      const c = this.type==='carapace' ? '#8aa1ae' : this.type==='reflector' ? '#7be5ff' : this.type==='lancer' ? '#ffd37c' : this.type==='brood' ? '#b0d06f' : this.type==='dodger' ? '#c19fff' : '#ff7b92';
      ctx.fillStyle = this.elite ? '#ffd166' : c;
      ctx.fillRect(this.x-w/2,this.y-this.r-18,w*clamp(this.hp/this.maxHp,0,1),5);
    }
  };

  const baseSpawnBoss = spawnBoss;
  spawnBoss = function(){
    const before = game.boss;
    const result = baseSpawnBoss.apply(this, arguments);
    if(game.boss && game.boss !== before){
      const b = game.boss;
      if(!b.__bossThreatInit){
        b.__bossThreatInit = true;
        const archetypes = [
          {name:'REGENTE DO OSSÁRIO', color:'#ff4a66', accent:'#ffd166'},
          {name:'ABERRAÇÃO DO BREU', color:'#aa5cff', accent:'#7be5ff'},
          {name:'CARNICEIRO TITÂNICO', color:'#ff7a42', accent:'#fff1bf'}
        ];
        const choice = pick(archetypes);
        b.name = choice.name;
        b.color = choice.color;
        b.accent = choice.accent;
        b.r = 78;
        b.maxHp *= 1.14; b.hp = b.maxHp;
        b.speed *= 1.08;
        b.pulse = rand(0, TAU);
        b.specialCd = 1.8;
        b.chargeCd = 4.8;
        b.volleyCd = 3.2;
      }
    }
    return result;
  };

  Boss.prototype.update = function(dt){
    if(this.dead) return;
    if(!this.__bossThreatInit){ this.__bossThreatInit=true; this.color=this.color||'#ff4a66'; this.accent=this.accent||'#ffd166'; this.specialCd=1.8; this.chargeCd=4.8; this.volleyCd=3.2; this.r=78; }
    this.hitCd -= dt; this.attackCd -= dt; this.specialCd -= dt; this.chargeCd -= dt; this.volleyCd -= dt; this.pulse = (this.pulse||0) + dt*2.4;
    const p = game.player, dx=p.x-this.x, dy=p.y-this.y, d=Math.hypot(dx,dy)||1, a=Math.atan2(dy,dx);
    if(this.hp < this.maxHp*.55) this.phase2 = true;
    const sp = this.phase2 ? 88 : 60;
    const ox=this.x, oy=this.y;
    this.x += Math.cos(a)*sp*dt;
    this.y += Math.sin(a)*sp*dt;
    if(worldBlocked(this.x,this.y,this.r)){ this.x=ox; this.y=oy; }
    if(d < this.r + p.r + 8 && this.hitCd <= 0){ this.hitCd = .85; p.hurt(this.damageValue*1.9); screenShake(8); }

    if(this.volleyCd <= 0){
      this.volleyCd = this.phase2 ? 2.25 : 3.4;
      const shots = this.phase2 ? 16 : 10;
      for(let i=0;i<shots;i++){
        const aa = a + (i/(shots-1)-.5) * (this.phase2 ? 1.95 : 1.28);
        game.enemyBullets.push(new EnemyBullet(this.x,this.y,aa, this.phase2 ? 370 : 330, this.damageValue*1.25, 'boss'));
      }
      burst(this.x,this.y,this.accent||'#ffd166',18,260,5);
      screenShake(6);
    }
    if(this.specialCd <= 0){
      this.specialCd = this.phase2 ? 4.9 : 6.3;
      game.fields.push(new Field(p.x,p.y, this.phase2 ? 190 : 160, 1.18, 'telegraph', {damage:this.damageValue*(this.phase2?2.5:2.05), color:this.color, hurtsPlayer:true}));
      shockwave(this.x,this.y,this.color,110,.32,5);
      for(let i=0;i<(this.phase2?2:1);i++) setTimeout(()=>{ if(game.running && !this.dead) spawnEnemyNear(pick(['runner','carapace','reflector','lancer','dodger']), this.x, this.y, false); }, i*250);
    }
    if(this.chargeCd <= 0 && d > 140){
      this.chargeCd = this.phase2 ? 4.3 : 5.6;
      const tx = this.x + Math.cos(a) * Math.min(220, d*.7), ty = this.y + Math.sin(a) * Math.min(220, d*.7);
      lineEffect(this.x,this.y,tx,ty,this.accent||'#ffd166',.28,7);
      setTimeout(()=>{
        if(!game.running || this.dead) return;
        this.x = clamp(tx, 90, WORLD.w-90); this.y = clamp(ty, 90, WORLD.h-90);
        burst(this.x,this.y,this.color,28,430,7);
        shockwave(this.x,this.y,this.accent||'#ffd166',160,.42,8);
        for(const enemy of game.enemies){ if(enemy===this || enemy.dead) continue; if(dist(this, enemy) < 165) pushEnemy(enemy, this.x, this.y, 260); }
        if(dist(this,p) < 165) p.hurt(this.damageValue*1.55);
        screenShake(12);
      }, 320);
    }
  };

  Boss.prototype.draw = function(){
    const vis = bodyVisibility(this), eyes = eyeVisibility(this), aura = .72 + Math.sin(this.pulse||0)*.12;
    ctx.save();
    ctx.translate(this.x,this.y);
    ctx.fillStyle='rgba(0,0,0,.48)'; ctx.beginPath(); ctx.ellipse(0,82,80,26,0,0,TAU); ctx.fill();
    // Aura crown
    for(let i=0;i<10;i++){
      const aa = (this.pulse||0)*.3 + i/10*TAU;
      ctx.fillStyle = i%2 ? (this.accent||'#ffd166') : this.color;
      ctx.globalAlpha = .35 + (i%3)*.08;
      ctx.beginPath(); ctx.moveTo(Math.cos(aa)*54,Math.sin(aa)*20); ctx.lineTo(Math.cos(aa)*96-6,Math.sin(aa)*42); ctx.lineTo(Math.cos(aa)*96+6,Math.sin(aa)*42); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = game.phase==='day' ? 1 : Math.max(.12, vis);
    ctx.shadowBlur = 38; ctx.shadowColor = this.color;
    const body = ctx.createLinearGradient(-50,-80,40,100);
    body.addColorStop(0,'#60202f'); body.addColorStop(.55, this.flash>0 ? '#fff' : '#351018'); body.addColorStop(1,'#12070a');
    ctx.fillStyle = body; ctx.strokeStyle = this.color; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-56,8); ctx.quadraticCurveTo(-74,-54,-16,-74); ctx.lineTo(18,-74); ctx.quadraticCurveTo(82,-48,74,12); ctx.lineTo(62,58); ctx.quadraticCurveTo(0,92,-62,58); ctx.closePath(); ctx.fill(); ctx.stroke();
    // chest plates
    ctx.fillStyle='rgba(255,255,255,.05)';
    for(let i=0;i<3;i++){ roundedRectPath(ctx,-28+i*18,-10+i*10,18,24,6); ctx.fill(); }
    // head
    ctx.fillStyle='#9fa292'; ctx.beginPath(); ctx.arc(0,-26,28,0,TAU); ctx.fill();
    // horns
    ctx.fillStyle=this.accent||'#ffd166';
    ctx.beginPath(); ctx.moveTo(-14,-48); ctx.lineTo(-36,-78); ctx.lineTo(-22,-46); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(14,-48); ctx.lineTo(36,-78); ctx.lineTo(22,-46); ctx.closePath(); ctx.fill();
    // arms
    ctx.fillStyle='#260d13'; roundedRectPath(ctx,-70,-4,16,52,7); ctx.fill(); roundedRectPath(ctx,54,-4,16,52,7); ctx.fill();
    // claws
    ctx.fillStyle=this.accent||'#ffd166';
    for(let s=-1;s<=1;s+=2){ ctx.beginPath(); ctx.moveTo(s*62,42); ctx.lineTo(s*84,56); ctx.lineTo(s*66,24); ctx.closePath(); ctx.fill(); }
    // eyes & mouth glow
    ctx.globalAlpha = 1;
    ctx.fillStyle=`rgba(255,220,120,${Math.max(.18, eyes)})`;
    ctx.shadowBlur = 26; ctx.shadowColor=this.accent||'#ffd166';
    ctx.beginPath(); ctx.arc(-12,-28,8,0,TAU); ctx.arc(12,-28,8,0,TAU); ctx.fill();
    ctx.fillStyle='rgba(255,84,111,.82)'; ctx.fillRect(-12,-4,24,6);
    ctx.shadowBlur = 0;
    ctx.restore();
    if(vis>.1 || game.phase==='day'){
      const w = this.r*2.8;
      ctx.fillStyle='rgba(0,0,0,.58)'; ctx.fillRect(this.x-w/2,this.y-this.r-24,w,8);
      ctx.fillStyle=this.color; ctx.fillRect(this.x-w/2,this.y-this.r-24,w*clamp(this.hp/this.maxHp,0,1),8);
      ctx.strokeStyle='rgba(255,255,255,.08)'; ctx.strokeRect(this.x-w/2,this.y-this.r-24,w,8);
      ctx.fillStyle = this.accent || '#ffd166'; ctx.font='900 12px system-ui'; ctx.textAlign='center'; ctx.fillText(this.name||'ABERRAÇÃO', this.x, this.y-this.r-32);
    }
  };

  window.__enemyOverhaulDebug={
    types:[...specialTypes],
    spawn(type,x=game.player?.x+180||300,y=game.player?.y||300,elite=false){
      if(!ENEMIES[type])throw new Error(`Tipo especial desconhecido: ${type}`);
      const enemy=initSpecial(new Enemy(type,x,y,elite));
      game.enemies.push(enemy);
      return enemy;
    },
    spawnBoss(){spawnBoss();return game.boss},
    alive(type){return (game.enemies||[]).filter(enemy=>!enemy.dead&&(!type||enemy.type===type))},
    initSpecial
  };

})();
