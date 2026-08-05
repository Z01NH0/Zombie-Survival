(()=>{
  'use strict';
  if(window.__deadSignalEnemyNavigation127)return;
  window.__deadSignalEnemyNavigation127=true;
  if(typeof Enemy==='undefined'||typeof game==='undefined'||!window.__deadSignalCityDebug)return;

  const CITY=window.__deadSignalCityDebug;
  const CELL=84;
  const SQRT2=Math.SQRT2;
  const DIRS=[
    [1,0,1],[-1,0,1],[0,1,1],[0,-1,1],
    [1,1,SQRT2],[1,-1,SQRT2],[-1,1,SQRT2],[-1,-1,SQRT2]
  ];
  let grid=null;
  let gridVersion=0;
  let lastFlowAt=-99;
  let lastPlayerCell=-1;
  let lastPlayerX=NaN,lastPlayerY=NaN;
  const ENEMY_BUCKET=150;
  let enemyBuckets=new Map(),enemyBucketTime=NaN;
  const enemyBucketKey=(x,y)=>`${Math.floor(x/ENEMY_BUCKET)},${Math.floor(y/ENEMY_BUCKET)}`;
  function rebuildEnemyBuckets(){
    if(enemyBucketTime===game.time)return;
    enemyBucketTime=game.time;enemyBuckets=new Map();
    for(const e of game.enemies||[]){if(!e||e.dead)continue;const key=enemyBucketKey(e.x,e.y);let bucket=enemyBuckets.get(key);if(!bucket)enemyBuckets.set(key,bucket=[]);bucket.push(e)}
  }
  function nearbyEnemies(enemy,range){
    rebuildEnemyBuckets();const out=[],cx=Math.floor(enemy.x/ENEMY_BUCKET),cy=Math.floor(enemy.y/ENEMY_BUCKET),rings=Math.max(1,Math.ceil(range/ENEMY_BUCKET));
    for(let y=cy-rings;y<=cy+rings;y++)for(let x=cx-rings;x<=cx+rings;x++)for(const e of enemyBuckets.get(`${x},${y}`)||[])if(e!==enemy&&!e.dead)out.push(e);
    return out;
  }


  const clampN=(v,a,b)=>Math.max(a,Math.min(b,v));
  const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
  const radiusFor=e=>Math.max(8,Math.min(e instanceof Boss?52:28,(e.r||18)*.72));
  const cellX=x=>clampN(Math.floor(x/CELL),0,(grid?.cols||1)-1);
  const cellY=y=>clampN(Math.floor(y/CELL),0,(grid?.rows||1)-1);
  const indexOf=(cx,cy)=>cy*grid.cols+cx;
  const centerOf=(cx,cy)=>({x:(cx+.5)*CELL,y:(cy+.5)*CELL});

  function lineClear(x1,y1,x2,y2,r=14){
    const d=Math.hypot(x2-x1,y2-y1),steps=Math.max(1,Math.ceil(d/34));
    for(let i=1;i<steps;i++){
      const t=i/steps;
      if(CITY.blockedAt(x1+(x2-x1)*t,y1+(y2-y1)*t,r))return false;
    }
    return !CITY.blockedAt(x2,y2,r);
  }

  function nearestWalkable(cx,cy,maxRing=5){
    if(grid.walk[indexOf(cx,cy)])return[cx,cy];
    for(let ring=1;ring<=maxRing;ring++){
      let best=null,bestScore=Infinity;
      for(let yy=cy-ring;yy<=cy+ring;yy++)for(let xx=cx-ring;xx<=cx+ring;xx++){
        if(xx<0||yy<0||xx>=grid.cols||yy>=grid.rows||Math.max(Math.abs(xx-cx),Math.abs(yy-cy))!==ring)continue;
        const idx=indexOf(xx,yy);if(!grid.walk[idx])continue;
        const p=centerOf(xx,yy),score=Math.hypot(p.x-game.player.x,p.y-game.player.y);
        if(score<bestScore){bestScore=score;best=[xx,yy]}
      }
      if(best)return best;
    }
    return[cx,cy];
  }

  function buildGrid(){
    const cols=Math.ceil(WORLD.w/CELL),rows=Math.ceil(WORLD.h/CELL),size=cols*rows;
    const walk=new Uint8Array(size),distances=new Float32Array(size);
    distances.fill(Infinity);
    grid={cols,rows,walk,distances,version:++gridVersion,reachable:0,buildMs:0};
    const started=performance.now();
    for(let cy=0;cy<rows;cy++)for(let cx=0;cx<cols;cx++){
      const p=centerOf(cx,cy),edge=p.x<35||p.y<35||p.x>WORLD.w-35||p.y>WORLD.h-35;
      walk[indexOf(cx,cy)]=edge||CITY.blockedAt(p.x,p.y,18)?0:1;
    }
    grid.buildMs=performance.now()-started;
    lastFlowAt=-99;lastPlayerCell=-1;
  }

  function rebuildFlow(force=false){
    if(!game.player)return;
    if(!grid)buildGrid();
    const px=cellX(game.player.x),py=cellY(game.player.y),moved=Math.hypot(game.player.x-lastPlayerX,game.player.y-lastPlayerY);
    const idx=indexOf(px,py);
    if(!force&&idx===lastPlayerCell&&moved<CELL*.48&&game.time-lastFlowAt<.72)return;
    lastFlowAt=game.time;lastPlayerCell=idx;lastPlayerX=game.player.x;lastPlayerY=game.player.y;
    grid.distances.fill(Infinity);grid.reachable=0;
    const [sx,sy]=nearestWalkable(px,py,7),start=indexOf(sx,sy),queueX=new Int16Array(grid.walk.length),queueY=new Int16Array(grid.walk.length);
    let head=0,tail=0;queueX[tail]=sx;queueY[tail++]=sy;grid.distances[start]=0;
    while(head<tail){
      const cx=queueX[head],cy=queueY[head++],base=grid.distances[indexOf(cx,cy)];grid.reachable++;
      for(const [dx,dy,cost] of DIRS){
        const nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=grid.cols||ny>=grid.rows)continue;
        const ni=indexOf(nx,ny);if(!grid.walk[ni])continue;
        if(dx&&dy){if(!grid.walk[indexOf(cx+dx,cy)]||!grid.walk[indexOf(cx,cy+dy)])continue}
        if(Number.isFinite(grid.distances[ni]))continue;
        grid.distances[ni]=base+1;queueX[tail]=nx;queueY[tail++]=ny;
      }
    }
  }

  function flowDirection(enemy){
    rebuildFlow();
    const cx=cellX(enemy.x),cy=cellY(enemy.y);let bestX=cx,bestY=cy,best=grid.distances[indexOf(cx,cy)];
    if(!Number.isFinite(best)){
      for(let ring=1;ring<=4;ring++){
        for(let yy=cy-ring;yy<=cy+ring;yy++)for(let xx=cx-ring;xx<=cx+ring;xx++){
          if(xx<0||yy<0||xx>=grid.cols||yy>=grid.rows)continue;
          const val=grid.distances[indexOf(xx,yy)];if(val<best){best=val;bestX=xx;bestY=yy}
        }
        if(Number.isFinite(best))break;
      }
    }
    for(const [dx,dy] of DIRS){
      const nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=grid.cols||ny>=grid.rows)continue;
      const val=grid.distances[indexOf(nx,ny)];
      if(val<best-.02){best=val;bestX=nx;bestY=ny}
    }
    const target=centerOf(bestX,bestY);
    return Number.isFinite(best)?Math.atan2(target.y-enemy.y,target.x-enemy.x):Math.atan2(game.player.y-enemy.y,game.player.x-enemy.x);
  }

  function separation(enemy,range=52){
    let x=0,y=0,count=0;
    for(const other of nearbyEnemies(enemy,range+70)){
      if(other===enemy||other.dead)continue;
      const dx=enemy.x-other.x,dy=enemy.y-other.y,d=Math.hypot(dx,dy)||.001,need=range+(enemy.r||18)+(other.r||18)*.35;
      if(d>=need)continue;
      const f=(1-d/need);x+=dx/d*f;y+=dy/d*f;count++;
    }
    return count?{x:x/count,y:y/count}:{x:0,y:0};
  }

  function behaviorAngle(enemy,baseAngle,distance,directClear){
    enemy.__navPersona??=(Math.random()<.5?-1:1);
    const t=game.time+(enemy.phase||0);
    if((enemy.type==='runner'||enemy.type==='baby')&&directClear&&distance<470)return baseAngle+enemy.__navPersona*(distance<170?.68:.38);
    if((enemy.type==='wraith'||enemy.type==='dodger')&&directClear&&distance<520)return baseAngle+enemy.__navPersona*(.5+Math.sin(t*2.2)*.18);
    if(enemy.type==='brood'&&directClear&&distance<210)return baseAngle+Math.PI*.78*enemy.__navPersona;
    if((enemy.type==='spitter'||enemy.type==='necromancer')&&directClear&&distance<330)return baseAngle+Math.PI*.64*enemy.__navPersona;
    if(enemy.type==='reflector'||enemy.type==='shield')return baseAngle+Math.sin(t*.9)*.08;
    return baseAngle;
  }

  function probeScore(enemy,angle,look,targetAngle){
    const r=radiusFor(enemy),steps=5;let clear=0;
    for(let i=1;i<=steps;i++){
      const d=look*i/steps,x=enemy.x+Math.cos(angle)*d,y=enemy.y+Math.sin(angle)*d;
      if(CITY.blockedAt(x,y,r))break;
      clear=i/steps;
    }
    const alignment=Math.cos(angleDelta(angle,targetAngle));
    const px=game.player.x-(enemy.x+Math.cos(angle)*look),py=game.player.y-(enemy.y+Math.sin(angle)*look),progress=-Math.hypot(px,py)/Math.max(WORLD.w,WORLD.h);
    return clear*5+alignment*1.15+progress;
  }

  function chooseSteer(enemy,targetAngle){
    const look=Math.max(64,(enemy.speed||70)*.72),side=enemy.__navSide||1;
    const offsets=[0,.28*side,-.28*side,.55*side,-.55*side,.88*side,-.88*side,1.24*side,-1.24*side,Math.PI*.72*side];
    let best=targetAngle,bestScore=-Infinity;
    for(const off of offsets){const a=targetAngle+off,score=probeScore(enemy,a,look,targetAngle);if(score>bestScore){bestScore=score;best=a}}
    return best;
  }

  function attemptMove(enemy,angle,step){
    const r=radiusFor(enemy),attempts=[0,.22,-.22,.45,-.45,.78,-.78,1.12,-1.12];
    for(const off of attempts){
      const a=angle+off,nx=enemy.x+Math.cos(a)*step,ny=enemy.y+Math.sin(a)*step;
      const mx=(enemy.x+nx)/2,my=(enemy.y+ny)/2;
      if(!CITY.blockedAt(mx,my,r)&&!CITY.blockedAt(nx,ny,r)){enemy.x=nx;enemy.y=ny;enemy.vx=Math.cos(a)*(enemy.speed||70);enemy.vy=Math.sin(a)*(enemy.speed||70);return true}
    }
    return false;
  }

  function pushSwarm(enemy){
    if(!['brute','carapace'].includes(enemy.type))return;
    for(const other of nearbyEnemies(enemy,110)){
      if(other===enemy||other.dead||(other.r||18)>=(enemy.r||28))continue;
      const dx=other.x-enemy.x,dy=other.y-enemy.y,d=Math.hypot(dx,dy)||1,range=(enemy.r||28)+(other.r||18)+8;
      if(d<range){other.vx=(other.vx||0)+dx/d*45;other.vy=(other.vy||0)+dy/d*45}
    }
  }

  function initNav(enemy){
    if(enemy.__smartNav)return;
    enemy.__smartNav=true;enemy.__navSide=Math.random()<.5?-1:1;enemy.__stuckTime=0;enemy.__lastNavX=enemy.x;enemy.__lastNavY=enemy.y;enemy.__navRecoverCd=0;
  }

  function navigateAfter(enemy,dt,ox,oy,wasCharge=false){
    if(enemy.dead||!game.player)return;
    initNav(enemy);enemy.__navRecoverCd=Math.max(0,(enemy.__navRecoverCd||0)-dt);
    const moved=Math.hypot(enemy.x-ox,enemy.y-oy),distance=Math.hypot(game.player.x-enemy.x,game.player.y-enemy.y),radius=radiusFor(enemy),clear=lineClear(enemy.x,enemy.y,game.player.x,game.player.y,radius*.75);
    if(moved<Math.max(.18,(enemy.speed||60)*dt*.08)&&distance>70)enemy.__stuckTime+=dt;else enemy.__stuckTime=Math.max(0,enemy.__stuckTime-dt*1.8);
    if(CITY.blockedAt(enemy.x,enemy.y,radius)){enemy.x=ox;enemy.y=oy;enemy.__stuckTime+=dt*2}
    if(wasCharge||enemy.chargeTime>0)return;
    const needsRoute=!clear||enemy.__stuckTime>.18;
    if(needsRoute){
      enemy.x=ox;enemy.y=oy;
      let target=flowDirection(enemy);target=behaviorAngle(enemy,target,distance,false);
      const sep=separation(enemy,enemy instanceof Boss?72:48);target=Math.atan2(Math.sin(target)+sep.y*.72,Math.cos(target)+sep.x*.72);
      target=chooseSteer(enemy,target);
      const speedMult=enemy instanceof Boss?.92:enemy.type==='baby'?1.04:enemy.type==='runner'?.98:.9;
      const ok=attemptMove(enemy,target,(enemy.speed||65)*dt*speedMult);
      if(!ok)enemy.__stuckTime+=dt*1.8;
    }else{
      const desired=behaviorAngle(enemy,Math.atan2(game.player.y-enemy.y,game.player.x-enemy.x),distance,true);
      if(Math.abs(angleDelta(desired,Math.atan2(game.player.y-enemy.y,game.player.x-enemy.x)))>.16){
        const sep=separation(enemy,44),a=Math.atan2(Math.sin(desired)+sep.y*.5,Math.cos(desired)+sep.x*.5);
        attemptMove(enemy,a,(enemy.speed||65)*dt*.28);
      }
    }
    pushSwarm(enemy);
    if(enemy.__stuckTime>1.15&&enemy.__navRecoverCd<=0){enemy.__navSide*=-1;enemy.__navRecoverCd=.55;enemy.__stuckTime=.45}
    if(enemy.__stuckTime>2.4){
      const q=CITY.findOpenNear(enemy.x,enemy.y,24,155,radius+2);
      if(q&&!CITY.blockedAt(q.x,q.y,radius)){enemy.x=q.x;enemy.y=q.y;enemy.__stuckTime=0;enemy.__navRecoverCd=1}
    }
    enemy.__lastNavX=enemy.x;enemy.__lastNavY=enemy.y;
  }

  const enemyUpdateBeforeNav=Enemy.prototype.update;
  Enemy.prototype.update=function(dt){
    initNav(this);
    const r=radiusFor(this);
    if(CITY.blockedAt(this.x,this.y,r)){
      const escape=CITY.findOpenNear(this.x,this.y,18,460,r+3);
      if(escape&&!CITY.blockedAt(escape.x,escape.y,r)){this.x=escape.x;this.y=escape.y;this.vx=0;this.vy=0;this.__stuckTime=0}
    }
    const ox=this.x,oy=this.y,direct=lineClear(this.x,this.y,game.player.x,game.player.y,r*.72);
    if(this.type==='lancer'&&this.chargeTime<=0&&this.chargeCd<=.12&&!direct){this.chargeCd=Math.max(this.chargeCd,.42);this.__seekingChargeLane=true}
    else if(this.type==='lancer'&&direct)this.__seekingChargeLane=false;
    const wasCharge=this.chargeTime>0;
    const result=enemyUpdateBeforeNav.call(this,dt);
    navigateAfter(this,dt,ox,oy,wasCharge);
    return result;
  };

  if(typeof Boss!=='undefined'){
    const bossUpdateBeforeNav=Boss.prototype.update;
    Boss.prototype.update=function(dt){
      initNav(this);const ox=this.x,oy=this.y,wasCharge=Math.hypot(this.x-(this.__lastBossX??this.x),this.y-(this.__lastBossY??this.y))>90;
      const result=bossUpdateBeforeNav.call(this,dt);
      const teleported=Math.hypot(this.x-ox,this.y-oy)>120;
      if(!teleported)navigateAfter(this,dt,ox,oy,wasCharge);
      this.__lastBossX=this.x;this.__lastBossY=this.y;return result;
    };
  }

  const createWorldBeforeNav=createWorld;
  createWorld=function(){const result=createWorldBeforeNav.apply(this,arguments);grid=null;enemyBuckets=new Map();enemyBucketTime=NaN;buildGrid();return result};
  const startNightBeforeNav=startNight;
  startNight=function(){const result=startNightBeforeNav.apply(this,arguments);lastFlowAt=-99;rebuildFlow(true);return result};

  function auditNavigation(samples=160){
    if(!grid)buildGrid();rebuildFlow(true);
    let sampled=0,reachable=0,blocked=0;
    for(let i=0;i<samples;i++){
      const x=40+Math.random()*(WORLD.w-80),y=40+Math.random()*(WORLD.h-80),r=18;
      if(CITY.blockedAt(x,y,r)){blocked++;continue}
      sampled++;const idx=indexOf(cellX(x),cellY(y));if(Number.isFinite(grid.distances[idx]))reachable++;
    }
    return{cell:CELL,cols:grid.cols,rows:grid.rows,walkable:grid.walk.reduce((a,b)=>a+b,0),reachableCells:grid.reachable,buildMs:+grid.buildMs.toFixed(2),sampled,reachable,blocked,coverage:sampled?+(reachable/sampled*100).toFixed(1):100};
  }

  window.__deadSignalEnemyNavDebug={buildGrid,rebuildFlow,auditNavigation,lineClear,flowDirection,chooseSteer,nearbyEnemies,get grid(){return grid},get bucketCount(){rebuildEnemyBuckets();return enemyBuckets.size}};
})();
