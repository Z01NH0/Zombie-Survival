(()=>{
  'use strict';
  if(window.__deadSignalPerformanceCore128)return;
  window.__deadSignalPerformanceCore128=true;
  if(typeof game==='undefined')return;

  const state={avgFrameMs:16.7,tier:'high',hudHz:15,lastHudAt:-Infinity,particleCap:520,culledParticles:0,hiddenSkips:0};
  const qualityCap=()=>save?.settings?.quality==='low'?190:save?.settings?.quality==='medium'?340:520;
  function refreshTier(dt){
    const ms=Math.max(1,Math.min(80,dt*1000));
    state.avgFrameMs=state.avgFrameMs*.965+ms*.035;
    const configured=qualityCap();
    if(state.avgFrameMs>27){state.tier='low';state.particleCap=Math.min(configured,190)}
    else if(state.avgFrameMs>21){state.tier='medium';state.particleCap=Math.min(configured,320)}
    else{state.tier='high';state.particleCap=configured}
  }
  function trimOldest(arr,cap){if(!Array.isArray(arr)||arr.length<=cap)return 0;const remove=arr.length-cap;arr.splice(0,remove);return remove}
  function enforceBudgets(){
    state.culledParticles+=trimOldest(game.particles,state.particleCap);
    trimOldest(game.texts,80);
    trimOldest(game.enemyBullets,state.tier==='low'?260:380);
    trimOldest(game.bullets,state.tier==='low'?320:520);
    trimOldest(game.fields,state.tier==='low'?72:110);
  }

  const updateBeforePerformance=update;
  update=function(dt){
    refreshTier(dt);
    const result=updateBeforePerformance.call(this,dt);
    enforceBudgets();
    return result;
  };

  const updateHUDBeforePerformance=updateHUD;
  updateHUD=function(force=false){
    const now=performance.now(),gap=1000/state.hudHz;
    if(!force&&now-state.lastHudAt<gap)return;
    state.lastHudAt=now;
    return updateHUDBeforePerformance.apply(this,arguments);
  };
  window.__deadSignalForceHUD=()=>updateHUD(true);

  drawParticles=function(){
    const minX=game.camera.x-140,maxX=game.camera.x+W+140,minY=game.camera.y-140,maxY=game.camera.y+H+140;
    const shadows=state.tier!=='low'&&save.settings.quality!=='low';
    for(const p of game.particles){
      if(p.type!=='line'&&(p.x<minX||p.x>maxX||p.y<minY||p.y>maxY))continue;
      if(p.type==='line'&&((p.x<minX&&p.x2<minX)||(p.x>maxX&&p.x2>maxX)||(p.y<minY&&p.y2<minY)||(p.y>maxY&&p.y2>maxY)))continue;
      const a=clamp(p.life/(p.max||1),0,1);ctx.globalAlpha=a;ctx.strokeStyle=p.color;ctx.fillStyle=p.color;ctx.shadowBlur=shadows&&p.type==='spark'?7:0;ctx.shadowColor=p.color;
      if(p.type==='dot'){ctx.beginPath();ctx.arc(p.x,p.y,Math.max(.01,p.r),0,TAU);ctx.fill()}
      else if(p.type==='spark'){ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx*.035,p.y-p.vy*.035);ctx.stroke()}
      else if(p.type==='ring'){ctx.lineWidth=p.width||4;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(.01,p.r),0,TAU);ctx.stroke()}
      else if(p.type==='line'){ctx.lineWidth=p.width||3;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x2,p.y2);ctx.stroke()}
      ctx.shadowBlur=0;
    }
    ctx.globalAlpha=1;
  };

  loop=function(now){
    if(!game.running)return;
    if(document.hidden){game.last=now;state.hiddenSkips++;setTimeout(()=>{if(game.running)requestAnimationFrame(loop)},180);return}
    const dt=clamp((now-game.last)/1000,0,.034);game.last=now;update(dt);drawWorld();requestAnimationFrame(loop);
  };

  let resizeTimer=0;
  addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{window.__deadSignalCityDebug?.rebuildCollisionIndex?.();window.__deadSignalForceHUD?.()},120)},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)game.last=performance.now()},{passive:true});

  window.__deadSignalPerformanceAudit={
    state,
    snapshot(){return{...state,particles:game.particles?.length||0,enemies:game.enemies?.filter(e=>!e.dead).length||0,collisionCells:window.__deadSignalCityDebug?.collisionIndex?.cells?.size||0,enemyBuckets:window.__deadSignalEnemyNavDebug?.bucketCount||0,mutationObserversInSource:0}}
  };
})();
