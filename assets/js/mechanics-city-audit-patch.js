(()=>{
  'use strict';
  if(window.__deadSignalMechanicsCity125)return;
  window.__deadSignalMechanicsCity125=true;
  const APOCALYPSE = {lampBase: 168};
  if(typeof game==='undefined'||typeof WORLD==='undefined')return;

  const DBG=window.__arsenalDebug||{};
  const CITY={roadWidth:220,sidewalk:34,centers:[],lampRadius:168};
  const pickOne=list=>list[(Math.random()*list.length)|0];
  const weightedOne = list => { let t=0; for(const e of list)t+=e.w; let r=Math.random()*t; for(const e of list){ r-=e.w; if(r<=0) return e.v; } return list[list.length-1].v; };
  const clampNum=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
  const hash01=(seed,index=0)=>{const n=Math.sin((Number(seed)||1)*12.9898+(index+1)*78.233)*43758.5453123;return n-Math.floor(n)};
  const stableRange=(seed,index,a,b)=>a+(b-a)*hash01(seed,index);
  const circleRect=(x,y,r,q)=>{const cx=Math.max(q.x,Math.min(x,q.x+q.w)),cy=Math.max(q.y,Math.min(y,q.y+q.h)),dx=x-cx,dy=y-cy;return dx*dx+dy*dy<r*r};
  const structureRect=s=>s?.collision||{x:s.x,y:s.y,w:s.w,h:s.h};
  const propRect=p=>p?.collision||{x:p.x-(p.w||p.r*2||0)/2,y:p.y-(p.h||p.r*2||0)/2,w:p.w||p.r*2||0,h:p.h||p.r*2||0};

  const COLLISION_CELL=240;
  let collisionIndex=null;
  const collisionKey=(x,y)=>`${x},${y}`;
  function collisionCellsForRect(q){
    const out=[],minX=Math.floor(q.x/COLLISION_CELL),maxX=Math.floor((q.x+q.w)/COLLISION_CELL),minY=Math.floor(q.y/COLLISION_CELL),maxY=Math.floor((q.y+q.h)/COLLISION_CELL);
    for(let cy=minY;cy<=maxY;cy++)for(let cx=minX;cx<=maxX;cx++)out.push(collisionKey(cx,cy));
    return out;
  }
  function rebuildCollisionIndex(){
    const cells=new Map(),add=(kind,o,q)=>{for(const key of collisionCellsForRect(q)){let bucket=cells.get(key);if(!bucket)cells.set(key,bucket=[]);bucket.push({kind,o,q})}};
    for(const s of game.structures||[])add('structure',s,structureRect(s));
    for(const p of game.props||[]){if(!p.block||p.kind==='buildingCollision')continue;add('prop',p,propRect(p))}
    collisionIndex={cells,structures:game.structures?.length||0,props:(game.props||[]).filter(p=>p.block&&p.kind!=='buildingCollision').length};
    return collisionIndex;
  }
  function collisionCandidates(q){
    if(!collisionIndex)rebuildCollisionIndex();
    const result=[],seen=new Set();
    for(const key of collisionCellsForRect(q))for(const entry of collisionIndex.cells.get(key)||[]){if(seen.has(entry.o))continue;seen.add(entry.o);result.push(entry)}
    return result;
  }
  function blockedAtCity(x,y,r=16,ignore=null){
    if(x-r<12||y-r<12||x+r>WORLD.w-12||y+r>WORLD.h-12)return true;
    const query={x:x-r,y:y-r,w:r*2,h:r*2};
    for(const entry of collisionCandidates(query)){if(entry.o===ignore)continue;if(circleRect(x,y,r,entry.q))return true}
    return false;
  }
  function segmentHitsRect(x1,y1,x2,y2,q,pad=0){
    const minX=q.x-pad,maxX=q.x+q.w+pad,minY=q.y-pad,maxY=q.y+q.h+pad,dx=x2-x1,dy=y2-y1;let t0=0,t1=1;
    const clip=(p,v)=>{if(Math.abs(p)<1e-9)return v>=0;const t=v/p;if(p<0){if(t>t1)return false;if(t>t0)t0=t}else{if(t<t0)return false;if(t<t1)t1=t}return true};
    return clip(-dx,x1-minX)&&clip(dx,maxX-x1)&&clip(-dy,y1-minY)&&clip(dy,maxY-y1);
  }
  function projectileHitsCity(x1,y1,x2,y2,r=2){
    const q={x:Math.min(x1,x2)-r,y:Math.min(y1,y2)-r,w:Math.abs(x2-x1)+r*2,h:Math.abs(y2-y1)+r*2};
    for(const entry of collisionCandidates(q))if(segmentHitsRect(x1,y1,x2,y2,entry.q,r))return entry.o;
    return null;
  }
  function spiralOpen(x,y,r=20,max=420){
    if(!blockedAtCity(x,y,r))return{x,y};
    for(let d=12;d<=max;d+=12)for(let i=0;i<32;i++){const a=i/32*TAU,nx=clampNum(x+Math.cos(a)*d,40,WORLD.w-40),ny=clampNum(y+Math.sin(a)*d,40,WORLD.h-40);if(!blockedAtCity(nx,ny,r))return{x:nx,y:ny}}
    return{x:WORLD.w/2,y:WORLD.h/2};
  }
  function randomRoadPoint(){
    const road=pickOne(game.roads||[]);if(!road)return{x:WORLD.w/2,y:WORLD.h/2};
    if(road.orientation==='v')return{x:road.center+rand(-road.w*.24,road.w*.24),y:rand(55,WORLD.h-55)};
    return{x:rand(55,WORLD.w-55),y:road.center+rand(-road.h*.24,road.h*.24)};
  }
  function findOpenNearCity(x,y,min=70,max=390,radius=34){
    for(let i=0;i<180;i++){
      let nx,ny;
      if(i>70&&Math.random()<.7){const q=randomRoadPoint();nx=q.x;ny=q.y;const d=Math.hypot(nx-x,ny-y);if(d<min||d>max)continue}
      else{const a=rand(0,TAU),d=rand(min,max);nx=clampNum(x+Math.cos(a)*d,45,WORLD.w-45);ny=clampNum(y+Math.sin(a)*d,45,WORLD.h-45)}
      if(!blockedAtCity(nx,ny,radius))return{x:nx,y:ny};
    }
    return spiralOpen(clampNum(x+min,45,WORLD.w-45),y,radius,620);
  }

  function addBuilding(lot,style){
    const height=rand(74,126),roofDx=height*.5;
    const w=Math.max(210,lot.w-roofDx-rand(30,72)),h=Math.max(160,lot.h-height-rand(28,62));
    const x=lot.x+rand(12,Math.max(13,lot.w-w-roofDx-10));
    const y=lot.y+height+rand(12,Math.max(13,lot.h-h-height-10));
    const kind=style||weightedOne([{v:'apartment',w:1.6},{v:'office',w:1.1},{v:'shop',w:.7},{v:'warehouse',w:1.0},{v:'hospital',w:.5},{v:'ruin',w:2.15}]);
    const s={x,y,w,h,height,kind,tone:rand(0,1),windows:Math.max(3,Math.floor(w/52)),stories:Math.max(2,Math.floor(height/24)),signSeed:Math.random(),decay:rand(.28,.95),moss:Math.random()*(kind==='ruin'?1:.75),collapse:Math.random()<(kind==='ruin'?.82:.34),wallCracks:2+((Math.random()*4)|0),bloodMarks:(kind==='ruin'||Math.random()<.42)?((Math.random()*3)|0):0,visualSeed:Math.random()*100000};
    s.collision={x:x-8,y:y-height-8,w:w+roofDx+16,h:h+height+16};
    game.structures.push(s);
    // A movimentação moderna usa DBG.blockedAt, mas alguns patches antigos
    // ainda consultam diretamente `game.props`. Este proxy invisível garante
    // a mesma hitbox completa para jogador, zumbis, NPCs e spawns legados.
    game.props.push({kind:'buildingCollision',x:s.collision.x+s.collision.w/2,y:s.collision.y+s.collision.h/2,r:0,w:s.collision.w,h:s.collision.h,rot:0,block:true,collision:{...s.collision},building:s});collisionIndex=null;
    return s;
  }
  function addProp(p){
    const radius=p.testRadius||Math.max(10,p.r||12,Math.max(p.w||0,p.h||0)*.5);
    if(blockedAtCity(p.x,p.y,radius))return false;
    game.props.push(p);collisionIndex=null;return true;
  }
  function addStreetLight(x,y,side='left'){
    const mode=weightedOne([{v:'stable',w:1.55},{v:'flicker',w:.78},{v:'dead',w:.95}]);
    const p={kind:'streetlamp',x,y,r:15,rot:0,block:true,w:12,h:12,collision:{x:x-6,y:y-6,w:12,h:12},lightRadius:CITY.lampRadius+rand(-18,10),lightPower:rand(.74,.96),flicker:rand(0,TAU),mode,broken:Math.random()<(mode==='dead'?.7:.28),side};
    if(blockedAtCity(x,y,12))return false;
    game.props.push(p);game.streetLights.push(p);collisionIndex=null;return true;
  }
  function buildStreetLights(){
    const gap=560,offset=CITY.roadWidth/2+22;
    for(const road of game.roads){
      if(road.orientation==='v'){
        for(let y=105;y<WORLD.h-105;y+=gap){
          if(CITY.centers.some(c=>Math.abs(y-c)<CITY.roadWidth*.65))continue;
          if(Math.random()<.74)addStreetLight(road.center-offset,y,'right');
          if(((y/gap)|0)%3===0&&Math.random()<.22)addStreetLight(road.center+offset,y,'left');
        }
      }else{
        for(let x=105;x<WORLD.w-105;x+=gap){
          if(CITY.centers.some(c=>Math.abs(x-c)<CITY.roadWidth*.65))continue;
          if(Math.random()<.74)addStreetLight(x,road.center-offset,'down');
          if(((x/gap)|0)%3===1&&Math.random()<.22)addStreetLight(x,road.center+offset,'up');
        }
      }
    }
  }
  function buildDecorations(){
    const kinds=['car','wreck','debris','barrel','dumpster','barricade','hydrant','bench'];
    for(let i=0;i<190;i++){
      const q=randomRoadPoint(),kind=pickOne(kinds),road=game.roads.find(r=>r.orientation==='v'?Math.abs(q.x-r.center)<r.w/2:Math.abs(q.y-r.center)<r.h/2);
      if(!road)continue;
      let x=q.x,y=q.y;
      if(road.orientation==='v')x=road.center+(Math.random()<.5?-1:1)*(road.w*.34+rand(8,24));
      else y=road.center+(Math.random()<.5?-1:1)*(road.h*.34+rand(8,24));
      const vehicle=kind==='car'||kind==='wreck',wide=kind==='barricade';
      const p={kind,x,y,r:vehicle?31:wide?25:rand(10,20),rot:road.orientation==='v'?Math.PI/2+(Math.random()-.5)*.16:(Math.random()-.5)*.16,tone:rand(0,1),flicker:rand(0,TAU),block:vehicle||wide||kind==='dumpster',w:vehicle?94:wide?78:kind==='dumpster'?54:0,h:vehicle?43:wide?18:kind==='dumpster'?34:0};
      if(p.block)p.collision={x:x-p.w/2,y:y-p.h/2,w:p.w,h:p.h};
      addProp(p);
    }
    const center={x:WORLD.w/2,y:WORLD.h/2};
    for(let i=0;i<14;i++){const a=i/14*TAU,d=rand(185,335),kind=pickOne(['car','wreck','barricade','debris']);const x=center.x+Math.cos(a)*d,y=center.y+Math.sin(a)*d,p={kind,x,y,r:kind==='car'||kind==='wreck'?32:22,rot:a+Math.PI/2,block:kind!=='debris',w:kind==='barricade'?76:94,h:kind==='barricade'?18:43};if(p.block)p.collision={x:x-p.w/2,y:y-p.h/2,w:p.w,h:p.h};addProp(p)}
  }
  function createCity125(){
    game.props=[];game.structures=[];game.roads=[];game.lootCrates=[];game.npcs=[];game.streetLights=[];game.cityDecals=[];game.vendorVanColliders=[];
    CITY.centers=[];const count=7,margin=300,spacing=(WORLD.w-margin*2)/(count-1);for(let i=0;i<count;i++)CITY.centers.push(Math.round(margin+i*spacing));
    for(const c of CITY.centers){game.roads.push({x:c-CITY.roadWidth/2,y:0,w:CITY.roadWidth,h:WORLD.h,orientation:'v',center:c});game.roads.push({x:0,y:c-CITY.roadWidth/2,w:WORLD.w,h:CITY.roadWidth,orientation:'h',center:c})}
    for(let ix=0;ix<CITY.centers.length-1;ix++)for(let iy=0;iy<CITY.centers.length-1;iy++){
      const left=CITY.centers[ix]+CITY.roadWidth/2+CITY.sidewalk,right=CITY.centers[ix+1]-CITY.roadWidth/2-CITY.sidewalk,top=CITY.centers[iy]+CITY.roadWidth/2+CITY.sidewalk,bottom=CITY.centers[iy+1]-CITY.roadWidth/2-CITY.sidewalk;
      const lot={x:left,y:top,w:right-left,h:bottom-top,cx:(left+right)/2,cy:(top+bottom)/2};
      const distance=Math.hypot(lot.cx-WORLD.w/2,lot.cy-WORLD.h/2);
      if(distance<470||Math.random()<.13){
        // Pequenas áreas abertas quebram a repetição da malha urbana.
        for(let n=0;n<rand(3,7);n++){const kind=pickOne(['tree','bench','debris','hydrant']),x=rand(left+30,right-30),y=rand(top+30,bottom-30);addProp({kind,x,y,r:kind==='tree'?22:14,rot:rand(0,TAU),block:false})}
      }else addBuilding(lot);
      for(let n=0;n<10;n++)game.cityDecals.push({x:rand(left,right),y:rand(top,bottom),r:rand(12,58),rot:rand(0,TAU),type:weightedOne([{v:'crack',w:2.5},{v:'stain',w:1.2},{v:'pothole',w:1.15},{v:'moss',w:1.0},{v:'blood',w:.95},{v:'drag',w:.62}]),seed:Math.random()*100000});
    }
    buildStreetLights();buildDecorations();
    const center={x:WORLD.w/2,y:WORLD.h/2};
    for(let i=0;i<46;i++)game.cityDecals.push({x:rand(70,WORLD.w-70),y:rand(70,WORLD.h-70),r:rand(20,70),rot:rand(0,TAU),type:weightedOne([{v:'crack',w:2.2},{v:'pothole',w:1.4},{v:'blood',w:1.0},{v:'drag',w:.8},{v:'moss',w:1.35}]),seed:Math.random()*100000});
    game.cityPlaza={x:center.x,y:center.y,r:245};
    // Remove decorações que tenham caído dentro da silhueta projetada de prédios.
    game.props=game.props.filter(p=>{
      if(p.kind==='buildingCollision')return true;
      const radius=Math.max(2,p.r||2,Math.max(p.w||0,p.h||0)*.35);
      return !game.structures.some(s=>circleRect(p.x,p.y,radius,structureRect(s)));
    });
    // Garante que o centro inicial e um corredor ao redor dele estejam livres.
    game.props=game.props.filter(p=>Math.hypot(p.x-center.x,p.y-center.y)>145||p.kind==='streetlamp');
    game.streetLights=game.props.filter(p=>p.kind==='streetlamp');
    rebuildCollisionIndex();
  }

  const drawGroundBefore=drawGround;
  function drawGround125(){
    const day=game.phase==='day',tile=96,sx=Math.floor(game.camera.x/tile)*tile,ex=game.camera.x+W+tile,sy=Math.floor(game.camera.y/tile)*tile,ey=game.camera.y+H+tile;
    for(let x=sx;x<ex;x+=tile)for(let y=sy;y<ey;y+=tile){const alt=((x/tile+y/tile)|0)&1;ctx.fillStyle=day?(alt?'#292a2e':'#25262b'):(alt?'#10151d':'#0c1118');ctx.fillRect(x,y,tile,tile);ctx.fillStyle=day?'rgba(255,220,170,.018)':'rgba(90,135,170,.018)';ctx.fillRect(x,y,tile,5)}
    const walk=day?'#3b3a3d':'#1b222a',road=day?'#202126':'#090e14',curb=day?'rgba(205,195,180,.22)':'rgba(195,215,230,.09)';
    for(const r of game.roads){ctx.fillStyle=walk;ctx.fillRect(r.x-CITY.sidewalk,r.y-CITY.sidewalk,r.w+CITY.sidewalk*2,r.h+CITY.sidewalk*2);ctx.fillStyle=road;ctx.fillRect(r.x,r.y,r.w,r.h);ctx.strokeStyle=curb;ctx.lineWidth=3;ctx.strokeRect(r.x,r.y,r.w,r.h);ctx.strokeStyle=day?'rgba(255,222,145,.2)':'rgba(255,225,155,.11)';ctx.lineWidth=2;ctx.setLineDash([26,24]);ctx.beginPath();if(r.orientation==='h'){ctx.moveTo(r.x,r.center);ctx.lineTo(r.x+r.w,r.center)}else{ctx.moveTo(r.center,r.y);ctx.lineTo(r.center,r.y+r.h)}ctx.stroke();ctx.setLineDash([])}
    // Faixas posicionadas nas quatro aproximações do cruzamento, fora do miolo da via.
    ctx.fillStyle=day?'rgba(220,216,204,.22)':'rgba(202,214,224,.1)';
    const crossOffset=CITY.roadWidth*.5+23,crossDepth=32,stripe=9,gap=11,span=72;
    for(const x of CITY.centers)for(const y of CITY.centers){
      if(x<game.camera.x-240||x>game.camera.x+W+240||y<game.camera.y-240||y>game.camera.y+H+240)continue;
      for(let o=-span;o<=span;o+=stripe+gap){
        // Norte e sul: travessia sobre a rua vertical.
        ctx.fillRect(x+o-stripe*.5,y-crossOffset-crossDepth*.5,stripe,crossDepth);
        ctx.fillRect(x+o-stripe*.5,y+crossOffset-crossDepth*.5,stripe,crossDepth);
        // Leste e oeste: travessia sobre a rua horizontal.
        ctx.fillRect(x-crossOffset-crossDepth*.5,y+o-stripe*.5,crossDepth,stripe);
        ctx.fillRect(x+crossOffset-crossDepth*.5,y+o-stripe*.5,crossDepth,stripe);
      }
    }
    const plaza=game.cityPlaza;if(plaza){ctx.fillStyle=day?'#343338':'#151b23';ctx.beginPath();ctx.arc(plaza.x,plaza.y,plaza.r,0,TAU);ctx.fill();ctx.strokeStyle=day?'rgba(255,210,130,.16)':'rgba(100,210,230,.1)';ctx.lineWidth=5;ctx.beginPath();ctx.arc(plaza.x,plaza.y,plaza.r-18,0,TAU);ctx.stroke();for(let i=0;i<16;i++){const a=i/16*TAU;ctx.strokeStyle='rgba(255,255,255,.035)';ctx.beginPath();ctx.moveTo(plaza.x,plaza.y);ctx.lineTo(plaza.x+Math.cos(a)*(plaza.r-20),plaza.y+Math.sin(a)*(plaza.r-20));ctx.stroke()}}
    for(const d of game.cityDecals||[]){if(d.x<game.camera.x-80||d.x>game.camera.x+W+80||d.y<game.camera.y-80||d.y>game.camera.y+H+80)continue;ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.rot);if(d.type==='crack'){ctx.strokeStyle=day?'rgba(18,16,18,.32)':'rgba(0,0,0,.46)';ctx.lineWidth=2.3;ctx.beginPath();ctx.moveTo(-d.r,0);ctx.lineTo(-d.r*.58,5);ctx.lineTo(-d.r*.2,-6);ctx.lineTo(0,-2);ctx.lineTo(d.r*.18,-9);ctx.lineTo(d.r*.52,6);ctx.lineTo(d.r,0);ctx.stroke();ctx.beginPath();ctx.moveTo(-d.r*.15,-3);ctx.lineTo(-d.r*.26,-d.r*.3);ctx.moveTo(d.r*.22,1);ctx.lineTo(d.r*.3,d.r*.28);ctx.stroke()}else if(d.type==='pothole'){ctx.fillStyle=day?'rgba(17,17,19,.54)':'rgba(5,6,9,.74)';ctx.beginPath();ctx.ellipse(0,0,d.r,d.r*.48,0,0,TAU);ctx.fill();ctx.strokeStyle='rgba(108,102,96,.22)';ctx.lineWidth=2;ctx.stroke();}else if(d.type==='moss'){ctx.fillStyle=day?'rgba(58,82,43,.22)':'rgba(42,70,36,.18)';ctx.beginPath();ctx.ellipse(0,0,d.r,d.r*.46,0,0,TAU);ctx.fill();ctx.fillStyle=day?'rgba(84,112,59,.15)':'rgba(84,112,59,.1)';ctx.beginPath();ctx.ellipse(d.r*.1,-2,d.r*.58,d.r*.24,.2,0,TAU);ctx.fill();}else if(d.type==='blood'){ctx.fillStyle=day?'rgba(108,22,28,.26)':'rgba(118,18,28,.24)';ctx.beginPath();ctx.ellipse(0,0,d.r*.8,d.r*.28,0,0,TAU);ctx.fill();for(let k=0;k<3;k++){ctx.beginPath();ctx.arc(stableRange(d.seed,k*3,-d.r*.5,d.r*.5),stableRange(d.seed,k*3+1,-6,6),stableRange(d.seed,k*3+2,2,6),0,TAU);ctx.fill();}}else if(d.type==='drag'){ctx.fillStyle=day?'rgba(92,18,26,.22)':'rgba(98,14,24,.18)';ctx.beginPath();ctx.roundRect(-d.r,-d.r*.14,d.r*2,d.r*.28,10);ctx.fill();ctx.beginPath();ctx.ellipse(-d.r*.95,0,d.r*.24,d.r*.24,0,0,TAU);ctx.fill();for(let t=1;t<5;t++){ctx.fillRect(-d.r+t*(d.r*.42),-2+t*.35,d.r*.18,3);}}else{ctx.fillStyle=day?'rgba(70,33,37,.09)':'rgba(70,18,28,.12)';ctx.beginPath();ctx.ellipse(0,0,d.r,d.r*.35,0,0,TAU);ctx.fill()}ctx.restore()}
  }

  function buildingPalette(s,day){
    const palettes={apartment:['#46464d','#303239','#55545b'],office:['#39454e','#242e37','#53616b'],shop:['#51463f','#342d2b','#64564a'],warehouse:['#44464a','#292d32','#575a5f'],hospital:['#4b5555','#30393b','#647071'],ruin:['#3f363b','#251f24','#51454b']};
    const p=palettes[s.kind]||palettes.apartment;if(day)return p;return p.map(c=>c);
  }
  function drawStructure125(s){
    const day=game.phase==='day',h=s.height,dx=h*.5,p=buildingPalette(s,day),front=p[0],side=p[1],roof=p[2];ctx.save();
    ctx.fillStyle='rgba(0,0,0,.38)';ctx.beginPath();ctx.moveTo(s.x+18,s.y+22);ctx.lineTo(s.x+s.w+dx+28,s.y-h+24);ctx.lineTo(s.x+s.w+dx+28,s.y+s.h-h+26);ctx.lineTo(s.x+18,s.y+s.h+26);ctx.closePath();ctx.fill();
    ctx.fillStyle=front;ctx.fillRect(s.x,s.y,s.w,s.h);
    ctx.fillStyle=side;ctx.beginPath();ctx.moveTo(s.x+s.w,s.y);ctx.lineTo(s.x+s.w+dx,s.y-h);ctx.lineTo(s.x+s.w+dx,s.y+s.h-h);ctx.lineTo(s.x+s.w,s.y+s.h);ctx.closePath();ctx.fill();
    ctx.fillStyle=roof;ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(s.x+dx,s.y-h);ctx.lineTo(s.x+s.w+dx,s.y-h);ctx.lineTo(s.x+s.w,s.y);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.07)';ctx.lineWidth=2;ctx.strokeRect(s.x,s.y,s.w,s.h);
    // Façada, janelas e porta.
    const cols=Math.max(3,s.windows||4),rows=Math.max(2,Math.min(4,s.stories||3)),gapX=s.w/(cols+1),gapY=Math.max(30,s.h/(rows+1));
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){const wx=s.x+gapX*(col+1)-8,wy=s.y+gapY*(row+1)-10;ctx.fillStyle=game.phase==='day'?'rgba(185,205,210,.15)':((col+row+Math.floor(s.tone*9))%5===0?'rgba(255,204,105,.23)':'rgba(20,31,42,.8)');ctx.fillRect(wx,wy,16,20);ctx.strokeStyle='rgba(255,255,255,.055)';ctx.strokeRect(wx,wy,16,20)}
    ctx.fillStyle='#171b21';ctx.fillRect(s.x+s.w*.44,s.y+s.h-40,28,40);ctx.fillStyle='rgba(255,255,255,.06)';ctx.fillRect(s.x+s.w*.44+5,s.y+s.h-32,4,4);
    // sem textos decorativos nas fachadas
    if(s.kind==='warehouse'){ctx.strokeStyle='rgba(255,255,255,.08)';for(let i=1;i<6;i++){ctx.beginPath();ctx.moveTo(s.x+i*s.w/6,s.y+s.h-70);ctx.lineTo(s.x+i*s.w/6,s.y+s.h);ctx.stroke()}ctx.fillStyle='rgba(5,8,11,.55)';ctx.fillRect(s.x+22,s.y+s.h-68,s.w-44,68)}
    if(s.kind==='ruin'){ctx.fillStyle='rgba(4,5,7,.42)';ctx.beginPath();ctx.moveTo(s.x+s.w*.12,s.y);ctx.lineTo(s.x+s.w*.28,s.y-h*.42);ctx.lineTo(s.x+s.w*.42,s.y);ctx.closePath();ctx.fill();ctx.strokeStyle='rgba(255,120,105,.2)';ctx.beginPath();ctx.moveTo(s.x+s.w*.72,s.y+12);ctx.lineTo(s.x+s.w*.62,s.y+55);ctx.lineTo(s.x+s.w*.76,s.y+88);ctx.stroke()}
    // Equipamento no telhado, rachaduras, musgo e destruição apocalíptica.
    ctx.fillStyle='rgba(15,19,24,.72)';ctx.fillRect(s.x+dx+s.w*.62,s.y-h+18,34,20);ctx.strokeStyle='rgba(255,255,255,.08)';ctx.strokeRect(s.x+dx+s.w*.62,s.y-h+18,34,20);
    if(s.collapse){ctx.fillStyle='rgba(10,11,14,.9)';ctx.beginPath();ctx.moveTo(s.x+s.w*.08,s.y);ctx.lineTo(s.x+s.w*.24,s.y-h*stableRange(s.visualSeed,1,.22,.46));ctx.lineTo(s.x+s.w*.42,s.y);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(s.x+s.w*.64,s.y+s.h*.08);ctx.lineTo(s.x+s.w*.84,s.y+s.h*.22);ctx.lineTo(s.x+s.w*.76,s.y+s.h*.42);ctx.closePath();ctx.fill();}
    ctx.strokeStyle='rgba(0,0,0,.34)';ctx.lineWidth=2;for(let c=0;c<s.wallCracks;c++){const base=10+c*7,cx=s.x+stableRange(s.visualSeed,base,s.w*.12,s.w*.88),cy=s.y+stableRange(s.visualSeed,base+1,16,s.h-20);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+stableRange(s.visualSeed,base+2,-18,12),cy+stableRange(s.visualSeed,base+3,14,24));ctx.lineTo(cx+stableRange(s.visualSeed,base+4,-28,22),cy+stableRange(s.visualSeed,base+5,28,46));ctx.stroke();}
    if(s.moss>.08){ctx.fillStyle=game.phase==='day'?'rgba(72,101,58,.22)':'rgba(52,79,42,.18)';for(let m=0;m<3;m++){const base=50+m*5;ctx.beginPath();ctx.ellipse(s.x+stableRange(s.visualSeed,base,12,s.w-12),s.y+s.h-stableRange(s.visualSeed,base+1,18,62),stableRange(s.visualSeed,base+2,16,34),stableRange(s.visualSeed,base+3,7,14),stableRange(s.visualSeed,base+4,-.4,.4),0,TAU);ctx.fill();}}
    if(s.bloodMarks>0){ctx.fillStyle='rgba(112,18,28,.18)';for(let b=0;b<s.bloodMarks;b++){const base=80+b*5;ctx.beginPath();ctx.ellipse(s.x+stableRange(s.visualSeed,base,18,s.w-18),s.y+s.h-stableRange(s.visualSeed,base+1,10,26),stableRange(s.visualSeed,base+2,8,16),stableRange(s.visualSeed,base+3,3,6),stableRange(s.visualSeed,base+4,0,TAU),0,TAU);ctx.fill();}}
    // janelas quebradas extras
    ctx.strokeStyle='rgba(0,0,0,.32)';for(let br=0;br<Math.max(1,Math.floor((s.windows||4)*s.decay));br++){const base=110+br*2,bx=s.x+stableRange(s.visualSeed,base,18,s.w-28),by=s.y+stableRange(s.visualSeed,base+1,20,s.h-52);ctx.beginPath();ctx.moveTo(bx-6,by-8);ctx.lineTo(bx+7,by+9);ctx.moveTo(bx+6,by-8);ctx.lineTo(bx-7,by+8);ctx.stroke();}
    ctx.restore();
  }

  const drawPropBefore=drawProp;
  function drawProp125(p){
    if(p.kind==='vendorVanCollider'||p.kind==='buildingCollision')return;
    if(p.kind==='streetlamp'){
      ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.ellipse(5,7,13,6,0,0,TAU);ctx.fill();ctx.fillStyle='#111820';ctx.fillRect(-4,-70,8,76);ctx.strokeStyle='rgba(118,126,138,.2)';ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(stableRange(p.flicker,2,-2,2),6);ctx.stroke();ctx.fillStyle='#26323c';ctx.beginPath();ctx.roundRect(-10,-77,20,13,5);ctx.fill();const pow=lampPower(p);ctx.fillStyle=game.phase==='day'?'#b9b09a':`rgba(255,219,139,${pow})`;ctx.shadowBlur=game.phase==='day'?2:24*pow;ctx.shadowColor='#ffd98b';ctx.beginPath();ctx.arc(0,-71,6,0,TAU);ctx.fill();if(p.mode==='dead'||pow<.08){ctx.strokeStyle='rgba(255,122,96,.35)';ctx.beginPath();ctx.moveTo(-7,-79);ctx.lineTo(7,-65);ctx.stroke();}ctx.shadowBlur=0;ctx.restore();return;
    }
    if(['dumpster','barricade','hydrant','bench','sign'].includes(p.kind)){
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot||0);ctx.fillStyle='rgba(0,0,0,.3)';ctx.beginPath();ctx.ellipse(4,12,(p.w||30)*.45,8,0,0,TAU);ctx.fill();
      if(p.kind==='dumpster'){ctx.fillStyle=game.phase==='day'?'#36504d':'#1b302e';ctx.beginPath();ctx.roundRect(-27,-17,54,34,5);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.08)';ctx.stroke();ctx.fillStyle='#1a2225';ctx.fillRect(-29,-20,58,7)}
      else if(p.kind==='barricade'){ctx.fillStyle='#80543a';ctx.fillRect(-39,-7,78,14);ctx.fillStyle='#d7a04f';for(let i=-30;i<=30;i+=20)ctx.fillRect(i,-11,9,22)}
      else if(p.kind==='hydrant'){ctx.fillStyle='#8d2836';ctx.fillRect(-7,-11,14,25);ctx.beginPath();ctx.arc(0,-12,9,Math.PI,TAU);ctx.fill();ctx.fillRect(-13,-5,26,7)}
      else if(p.kind==='bench'){ctx.fillStyle='#4b352b';ctx.fillRect(-25,-8,50,7);ctx.fillRect(-25,3,50,7);ctx.fillStyle='#1b2026';ctx.fillRect(-20,10,5,12);ctx.fillRect(15,10,5,12)}
      else{ctx.fillStyle='#222a32';ctx.fillRect(-3,-26,6,40);ctx.fillStyle='#5a6671';ctx.fillRect(-18,-29,36,18);ctx.strokeStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.moveTo(-14,-24);ctx.lineTo(14,-13);ctx.stroke();}
      ctx.restore();return;
    }
    return drawPropBefore.call(this,p);
  }

  function lampPower(l){
    if(!l) return 0;
    if(l.mode==='dead') return 0;
    if(l.mode==='flicker'){
      const cycle=Math.sin(game.time*7.4+l.flicker)*.5+.5;
      const cut=Math.sin(game.time*19.5+l.flicker*1.7)*.5+.5;
      const blink = cycle>.18 && cut>.2 ? (.34 + cycle*.58) : 0;
      return (l.lightPower||.84) * blink;
    }
    return l.lightPower||.9;
  }

  function lampLineClear(l,e){
    for(const s of game.structures||[]){const q=structureRect(s);if(segmentHitsRect(l.x,l.y,e.x,e.y,q,2))return false}
    return true;
  }
  const lampVisibilityCache=new WeakMap();
  function lampVisibility(enemy){
    if(game.phase!=='night'||!enemy)return 0;
    const cached=lampVisibilityCache.get(enemy);if(cached&&cached.time===game.time)return cached.value;
    let best=0;
    for(const l of game.streetLights||[]){const d=Math.hypot(enemy.x-l.x,enemy.y-l.y),radius=l.lightRadius||CITY.lampRadius;if(d>=radius)continue;const power=lampPower(l);if(power<=.02)continue;if(!lampLineClear(l,enemy))continue;const v=clampNum(.25+(1-d/radius)*.9,0,1)*power;if(v>best)best=v}
    lampVisibilityCache.set(enemy,{time:game.time,value:best});return best;
  }
  const PLAYER_AMBIENT_RADIUS=112;
  function playerAmbientEnabled(){const f=game.flashlight||{};return game.phase==='night'&&(f.enabled===false||(f.battery??0)<=0)}
  function playerAmbientVisibility(enemy){
    if(!playerAmbientEnabled()||!game.player||!enemy)return 0;
    const d=Math.hypot(enemy.x-game.player.x,enemy.y-game.player.y);
    if(d>=PLAYER_AMBIENT_RADIUS)return 0;
    const t=1-d/PLAYER_AMBIENT_RADIUS;
    return clampNum(.12+t*.42,0,.54);
  }
  const bodyVisibilityBeforeCity=bodyVisibility,eyeVisibilityBeforeCity=eyeVisibility,drawLightingBeforeCity=drawLighting;
  bodyVisibility=function(enemy){return Math.max(bodyVisibilityBeforeCity.call(this,enemy),lampVisibility(enemy),playerAmbientVisibility(enemy))};
  eyeVisibility=function(enemy){return Math.max(eyeVisibilityBeforeCity.call(this,enemy),lampVisibility(enemy)*.82,playerAmbientVisibility(enemy)*.74)};
  let cityDarkMask=null,cityDarkCtx=null;
  function ensureCityDarkMask(){
    if(!cityDarkMask){cityDarkMask=document.createElement('canvas');cityDarkCtx=cityDarkMask.getContext('2d')}
    if(cityDarkMask.width!==W||cityDarkMask.height!==H){cityDarkMask.width=W;cityDarkMask.height=H}
    return cityDarkCtx;
  }
  function carveRadialLight(g,x,y,r,strength=.8,inner=.1){
    const grd=g.createRadialGradient(x,y,Math.max(1,r*inner),x,y,r);
    grd.addColorStop(0,`rgba(0,0,0,${clampNum(strength,0,1)})`);
    grd.addColorStop(.38,`rgba(0,0,0,${clampNum(strength*.72,0,1)})`);
    grd.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=grd;g.beginPath();g.arc(x,y,r,0,TAU);g.fill();
  }
  function carveFlashlight(g,px,py){
    const f=game.flashlight||{},enabled=f.enabled!==false&&(f.battery??1)>0;
    if(!enabled){
      carveRadialLight(g,px,py,PLAYER_AMBIENT_RADIUS,.82,.03);
      carveRadialLight(g,px,py,PLAYER_AMBIENT_RADIUS*.52,.94,.02);
      return;
    }
    const near=Math.max(65,(f.near||92)+18),range=Math.max(260,f.range||460),arc=Math.max(.3,f.arc||.56);
    carveRadialLight(g,px,py,near,.96,.02);
    g.save();g.translate(px,py);g.rotate(game.player.angle);
    const cone=g.createRadialGradient(0,0,near*.25,0,0,range);
    cone.addColorStop(0,'rgba(0,0,0,.95)');cone.addColorStop(.62,'rgba(0,0,0,.72)');cone.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=cone;g.beginPath();g.moveTo(0,0);g.arc(0,0,range,-arc,arc);g.closePath();g.fill();g.restore();
  }
  drawLighting=function(){
    if(game.phase==='day')return drawLightingBeforeCity.apply(this,arguments);
    if(!game.player)return;
    const px=game.player.x-game.camera.x,py=game.player.y-game.camera.y,g=ensureCityDarkMask();
    g.clearRect(0,0,W,H);g.globalCompositeOperation='source-over';g.fillStyle='rgba(0,0,0,.90)';g.fillRect(0,0,W,H);
    g.globalCompositeOperation='destination-out';carveFlashlight(g,px,py);
    for(const l of game.streetLights||[]){
      const sx=l.x-game.camera.x,sy=l.y-game.camera.y,r=l.lightRadius||CITY.lampRadius;
      if(sx+r<0||sy+r<0||sx-r>W||sy-r>H)continue;
      const power=lampPower(l);
      if(power<=.02) continue;
      carveRadialLight(g,sx,sy,r,Math.min(.88,.74*power),.05);
    }
    g.globalCompositeOperation='source-over';ctx.drawImage(cityDarkMask,0,0);
    const vg=ctx.createRadialGradient(px,py,100,px,py,Math.max(W,H)*.78);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(.62,'rgba(0,0,0,.04)');vg.addColorStop(1,'rgba(0,0,0,.34)');ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);
    ctx.save();ctx.globalCompositeOperation='screen';
    for(const l of game.streetLights||[]){
      const sx=l.x-game.camera.x,groundY=l.y-game.camera.y,bulbY=groundY-68,r=l.lightRadius||CITY.lampRadius;
      if(sx+r<0||groundY+r<0||sx-r>W||groundY-r>H)continue;
      const power=lampPower(l); if(power<=.02) continue; const pool=ctx.createRadialGradient(sx,groundY,8,sx,groundY,r);
      pool.addColorStop(0,`rgba(255,226,155,${.24*power})`);pool.addColorStop(.42,`rgba(255,205,112,${.11*power})`);pool.addColorStop(1,'rgba(255,185,80,0)');ctx.fillStyle=pool;ctx.beginPath();ctx.arc(sx,groundY,r,0,TAU);ctx.fill();
      const halo=ctx.createRadialGradient(sx,bulbY,1,sx,bulbY,42);halo.addColorStop(0,`rgba(255,244,205,${.8*power})`);halo.addColorStop(.2,`rgba(255,220,145,${.34*power})`);halo.addColorStop(1,'rgba(255,210,120,0)');ctx.fillStyle=halo;ctx.beginPath();ctx.arc(sx,bulbY,42,0,TAU);ctx.fill();
    }
    const f=game.flashlight||{};
    if(f.enabled!==false&&(f.battery??1)>0){
      ctx.translate(px,py);ctx.rotate(game.player.angle);const glow=ctx.createRadialGradient(0,0,0,0,0,f.range||460);glow.addColorStop(0,'rgba(205,250,255,.16)');glow.addColorStop(.66,'rgba(92,220,240,.08)');glow.addColorStop(1,'rgba(92,220,240,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,f.range||460,-(f.arc||.56),(f.arc||.56));ctx.closePath();ctx.fill();
    }else{
      const ambient=ctx.createRadialGradient(px,py,2,px,py,PLAYER_AMBIENT_RADIUS);
      ambient.addColorStop(0,'rgba(220,239,242,.20)');
      ambient.addColorStop(.38,'rgba(170,204,210,.105)');
      ambient.addColorStop(1,'rgba(126,164,174,0)');
      ctx.fillStyle=ambient;ctx.beginPath();ctx.arc(px,py,PLAYER_AMBIENT_RADIUS,0,TAU);ctx.fill();
    }
    ctx.restore();
  };

  function rectsOverlap(a,b,pad=0){return !(a.x+a.w+pad<=b.x||a.x>=b.x+b.w+pad||a.y+a.h+pad<=b.y||a.y>=b.y+b.h+pad)}
  function vendorVanRect(type,x,y){const merchant=type==='merchant',vx=x+(merchant?-94:94),vy=y-5;return{x:vx-72,y:vy-31,w:144,h:62,cx:vx,cy:vy}}
  function vendorAreaClear(type,x,y){
    if(blockedAtCity(x,y,34))return false;
    const van=vendorVanRect(type,x,y);
    if(van.x<14||van.y<14||van.x+van.w>WORLD.w-14||van.y+van.h>WORLD.h-14)return false;
    for(const s of game.structures||[])if(rectsOverlap(van,structureRect(s),8))return false;
    for(const p of game.props||[]){if(!p.block||p.kind==='npc'||p.kind==='vendorVanCollider')continue;if(rectsOverlap(van,propRect(p),5))return false}
    return true;
  }
  function findNpcPosition125(minPlayer,maxPlayer,avoid=null,minAvoid=850,type='merchant'){
    for(let i=0;i<360;i++){const q=randomRoadPoint(),x=q.x,y=q.y,dp=Math.hypot(x-game.player.x,y-game.player.y);if(dp<minPlayer||dp>maxPlayer||!vendorAreaClear(type,x,y))continue;if(avoid&&Math.hypot(x-avoid.x,y-avoid.y)<minAvoid)continue;return{x,y}}
    for(let i=0;i<180;i++){const q=findOpenNearCity(game.player.x,game.player.y,minPlayer,maxPlayer,44);if(vendorAreaClear(type,q.x,q.y)&&(!avoid||Math.hypot(q.x-avoid.x,q.y-avoid.y)>=minAvoid))return q}
    return spiralOpen(clampNum(game.player.x+minPlayer,45,WORLD.w-45),game.player.y,44,900);
  }
  function syncVendorColliders(){
    game.props=game.props.filter(p=>p.kind!=='vendorVanCollider');game.vendorVanColliders=[];
    for(const n of game.npcs||[]){const q=vendorVanRect(n.type,n.x,n.y),p={kind:'vendorVanCollider',x:q.cx,y:q.cy,r:72,block:true,w:q.w,h:q.h,collision:{x:q.x,y:q.y,w:q.w,h:q.h},npc:n};game.props.push(p);game.vendorVanColliders.push(p)}
    rebuildCollisionIndex();
  }
  const startDawnBeforeCity=startDawn,startNightBeforeCity=startNight;
  startDawn=function(){
    const result=startDawnBeforeCity.apply(this,arguments);
    const merchant=game.npcs?.find(n=>n.type==='merchant'),specialist=game.npcs?.find(n=>n.type==='specialist');
    if(merchant&&specialist&&game.player){
      const a=findNpcPosition125(320,1050,null,850,'merchant'),b=findNpcPosition125(420,1450,a,850,'specialist');
      merchant.x=a.x;merchant.y=a.y;specialist.x=b.x;specialist.y=b.y;
      for(const p of game.props.filter(p=>p.kind==='npc'&&p.npc)){p.x=p.npc.x;p.y=p.npc.y}
    }
    syncVendorColliders();return result;
  };
  startNight=function(){game.props=game.props.filter(p=>p.kind!=='vendorVanCollider');game.vendorVanColliders=[];rebuildCollisionIndex();return startNightBeforeCity.apply(this,arguments)};

  function relocateCrate(crate){
    if(!crate||!game.player||!blockedAtCity(crate.x,crate.y,36))return false;
    const pos=findOpenNearCity(game.player.x,game.player.y,340,860,38);crate.x=pos.x;crate.y=pos.y;
    const prop=game.props.find(p=>p.kind==='lootcrate'&&p.crate===crate);if(prop){prop.x=pos.x;prop.y=pos.y}
    return true;
  }

  function auditCity(){
    const structureGaps=[];for(const s of game.structures||[]){const q=structureRect(s),points=[[q.x+2,q.y+2],[q.x+q.w-2,q.y+2],[q.x+2,q.y+q.h-2],[q.x+q.w-2,q.y+q.h-2],[q.x+q.w/2,q.y+q.h/2]];if(points.some(([x,y])=>!blockedAtCity(x,y,1)))structureGaps.push(s)}
    const invalidProps=(game.props||[]).filter(p=>!['vendorVanCollider','npc','buildingCollision'].includes(p.kind)&&game.structures.some(s=>circleRect(p.x,p.y,Math.max(2,p.r||2),structureRect(s))));
    const collisionProxies=(game.props||[]).filter(p=>p.kind==='buildingCollision').length;
    return{structures:game.structures?.length||0,props:game.props?.length||0,streetLights:game.streetLights?.length||0,collisionProxies,structureGaps:structureGaps.length,invalidProps:invalidProps.length};
  }

  // Guarda final de colisão. Alguns comportamentos especiais de inimigos
  // aplicam impulso depois da checagem antiga; esta camada impede que qualquer
  // atualização termine dentro de prédio, van ou obstáculo sólido.
  const playerUpdateBeforeCity=Player.prototype.update;
  Player.prototype.update=function(dt){
    const ox=this.x,oy=this.y,result=playerUpdateBeforeCity.call(this,dt),radius=this.collisionRadius||10.8;
    if(blockedAtCity(this.x,this.y,radius)){
      if(!blockedAtCity(ox,oy,radius)){this.x=ox;this.y=oy}
      else{const q=spiralOpen(ox,oy,radius,180);this.x=q.x;this.y=q.y}
    }
    return result;
  };
  const enemyUpdateBeforeCity=Enemy.prototype.update;
  Enemy.prototype.update=function(dt){
    const ox=this.x,oy=this.y,result=enemyUpdateBeforeCity.call(this,dt),radius=Math.max(7,(this.r||18)*.72);
    if(!this.dead&&blockedAtCity(this.x,this.y,radius)){
      if(!blockedAtCity(ox,oy,radius)){this.x=ox;this.y=oy}
      else{const q=spiralOpen(ox,oy,radius,220);this.x=q.x;this.y=q.y}
      this.vx=(this.vx||0)*-.18;this.vy=(this.vy||0)*-.18;
      if(this.chargeTime>0)this.chargeTime=0;
    }
    return result;
  };

  // Projéteis precisam respeitar a silhueta completa dos prédios, não apenas
  // o retângulo frontal usado pela versão antiga.
  const bulletUpdateBeforeCity=Bullet.prototype.update;
  Bullet.prototype.update=function(dt){
    if(this.life>0){const nx=this.x+Math.cos(this.a)*this.s*dt,ny=this.y+Math.sin(this.a)*this.s*dt,hit=projectileHitsCity(this.x,this.y,nx,ny,this.r||2);if(hit){this.x=nx;this.y=ny;if(this.explosive){for(const e of game.enemies||[])if(!e.dead&&Math.hypot(this.x-e.x,this.y-e.y)<this.explosive+e.r)e.damage(this.d*(1-Math.hypot(this.x-e.x,this.y-e.y)/(this.explosive+e.r))*.95,false);if(typeof explosionFX==='function')explosionFX(this.x,this.y,'#ff7d3b',this.explosive)}else if(typeof sparks==='function')sparks(this.x,this.y,'#cbd4df',7);this.life=0;return}}
    return bulletUpdateBeforeCity.call(this,dt);
  };
  const enemyBulletUpdateBeforeCity=EnemyBullet.prototype.update;
  EnemyBullet.prototype.update=function(dt){const nx=this.x+Math.cos(this.a)*this.s*dt,ny=this.y+Math.sin(this.a)*this.s*dt;if(projectileHitsCity(this.x,this.y,nx,ny,this.r||3)){this.x=nx;this.y=ny;this.life=0;if(typeof sparks==='function')sparks(this.x,this.y,'#6d8294',4);return}return enemyBulletUpdateBeforeCity.call(this,dt)};

  const updateBeforeCity=update;
  update=function(dt){const before=new Set(game.lootCrates||[]),result=updateBeforeCity.call(this,dt);for(const c of game.lootCrates||[])if(!before.has(c)||blockedAtCity(c.x,c.y,36))relocateCrate(c);return result};

  createWorld=createCity125;drawGround=drawGround125;drawStructure=drawStructure125;drawProp=drawProp125;worldBlocked=blockedAtCity;
  if(DBG){DBG.blockedAt=blockedAtCity;DBG.projectileHitsWorld=projectileHitsCity}
  window.__deadSignalCityDebug={CITY,hash01,stableRange,blockedAt:blockedAtCity,structureRect,propRect,findOpenNear:findOpenNearCity,findNpcPosition:findNpcPosition125,vendorAreaClear,vendorVanRect,lampVisibility,auditCity,syncVendorColliders,relocateCrate,createWorld:createCity125,projectileHits:projectileHitsCity,rebuildCollisionIndex,get collisionIndex(){return collisionIndex}};
})();
