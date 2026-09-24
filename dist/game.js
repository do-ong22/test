'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const W = 800, H = 700, playerY = 557;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const art = {};
  for (let n = 1; n <= 10; n++) { const im = new Image(); im.onload = () => { art[n] = im; }; im.src = `assets/comic-${String(n).padStart(2, '0')}.png`; }
  const nature = new Image();nature.onload=()=>{art.nature=nature;};nature.src='assets/nature-atlas.png';
  const natureCrops={tree:[96,43,328,442],grass:[553,284,431,168],smallGrass:[1132,307,310,145],fruitTree:[96,549,328,437],flowers:[583,760,358,176],flowerPatch:[1069,783,416,159]};
  const titles = ['마음의 신호 알아차리기', '함께 걸으면, 달라지는 길', '나의 방식으로 지나가기'];
  const locations = ['낯선 돌멩이를 만나는 길', '초록이 짙어지는 숲길', '꽃과 열매가 함께하는 길'];
  const durations = [22, 24, 22];
  const helperLines=['옆에 있을게','응원할게','같이 가자','천천히 가도 돼','내가 여기 있어','혼자가 아니야','괜찮아, 함께야'];
  const painWords=['아픔','두려움','흔들림','속상함','놀람','서툼'];
  const growthWords=['경험','성장','회복탄력성','자신감','용기','자기이해','유연함','자기신뢰'];
  const helpLead=.65,helpGrace=.45,heldKeys=new Set(),choiceKeys=new Set();
  const state = {mode:'start',chapter:0,lane:1,x:400,time:0,total:0,scroll:0,spawn:0,items:[],helper:null,slow:false,choice:'',tokens:[],notice:0,hits:0,hazardHits:0,protectedHits:0,steps:0,chapterSpawns:0,highlight:0,growth:0,effects:[],interlude:null,lastKeyword:'',pendingStone:null,pendingTrigger:null,flinch:0,dim:0};
  let last = 0, comicPage = 0, dialogReturn = null;
  const baseCaption = '길 위의 모든 돌을 치우지 않아도 괜찮아.';

  function message(text, seconds = 4) { $('message').textContent = text; state.notice = seconds; }
  function addToken(label) {
    if (!state.tokens.includes(label)) state.tokens.push(label);
    $('pocket-items').replaceChildren(...state.tokens.map(text => {const el=document.createElement('span');el.className='pocket-token';el.textContent=text;return el;}));
    $('pocket-count').textContent = `${state.tokens.length} / 3`;
  }
  function syncControls() {
    const running = state.mode === 'playing';
    const choosing=state.mode==='stone-choice';
    $('left').disabled = !running || state.lane === 0;
    $('right').disabled = !running || state.lane === 2;
    $('rest').disabled = !running&&!choosing;
    syncHelpUI();
  }
  function helpTarget(){
    if(state.chapter===0||state.mode!=='playing')return null;
    if(state.pendingTrigger)return state.pendingTrigger.item;
    const speed=128*(state.slow?.72:1);
    return state.items.filter(item=>item.type==='trigger'&&!item.passed&&!item.armed&&item.y<=playerY&&playerY-item.y<=speed*helpLead&&Math.abs(laneX(item.lane)-state.x)<(47+state.growth)*.42+27).sort((a,b)=>b.y-a.y)[0]||null;
  }
  function positionPrompt(node,halfWidth){
    node.style.left=`clamp(${halfWidth}px, ${state.x/W*100}%, calc(100% - ${halfWidth}px))`;
    node.style.top=`${Math.max(25,(playerY+27-(66+state.growth)-18)/H*100)}%`;
  }
  function syncHelpUI(){
    const running=state.mode==='playing',ready=!!helpTarget();
    $('support').disabled=!running||state.chapter===0;
    const label=ready?'지금 도움 요청':state.helper?'함께 걷는 중':'도움 요청하기';
    const html=`<span aria-hidden="true">♡</span> ${label} <kbd>H</kbd>`;
    if($('support').innerHTML!==html)$('support').innerHTML=html;
    $('support').classList[ready?'add':'remove']('timing-ready');
    $('timing-cue').hidden=!ready;
    if(ready)positionPrompt($('timing-cue'),95);
  }
  function showOverlay(html, mode) {
    state.mode = mode;
    $('stone-choice').hidden=true;
    $('overlay').innerHTML = `<div class="overlay-card${mode==='paused'?' pause-card':mode==='choice'?' path-card':''}">${html}</div>`;
    $('overlay').classList.remove('hidden');
    syncControls();
    const button = $('overlay').querySelector('button');
    if (button) button.focus({preventScroll:true});
  }
  function play() {
    state.mode = 'playing'; $('stone-choice').hidden=true;$('overlay').classList.add('hidden'); $('overlay').replaceChildren(); syncControls();
  }
  function updateChapter() {
    $('chapter-kicker').textContent = `CHAPTER 0${state.chapter + 1} / 03`;
    $('chapter-title').textContent = titles[state.chapter];
    $('world-location').textContent = locations[state.chapter];
    $('world-step').textContent = `0${state.chapter+1} — 03`;
    for(let i=0;i<3;i++) $('step-'+i).className = i===state.chapter?'current':i<state.chapter?'done':'';
    document.querySelectorAll('.journey-stages span').forEach((s,i)=>s.className=i===state.chapter?'current':i<state.chapter?'done':'');
    $('side-quote').innerHTML = [ '“이겨내야 한다”는 말도<br>잠시 내려놓아도 괜찮아.', '“어떻게 도와주면 좋을까?”<br>누군가의 한마디가 만드는 여유.', '“오늘 나에게 필요한 건 뭘까?”<br>그 답을 고르는 사람은 나.'][state.chapter];
    $('trigger-guide').textContent=state.chapter>0?'가까워지면 H로 보호받아요':'피해 가며 나를 돌봐요';
    $('stone-guide').textContent=state.chapter===2?'← 마주하기 / 지나가기 →':'피해도, 만나 배워도 괜찮아요';
  }
  function startScreen() {
    document.querySelector('.app').classList.remove('is-ending');
    Object.assign(state,{mode:'start',chapter:0,lane:1,x:400,time:0,total:0,scroll:0,spawn:0,items:[],helper:null,choice:'',tokens:[],notice:0,hits:0,hazardHits:0,protectedHits:0,steps:0,chapterSpawns:0,highlight:0,growth:0,effects:[],interlude:null,lastKeyword:'',pendingStone:null,pendingTrigger:null,flinch:0,dim:0});
    heldKeys.clear();choiceKeys.clear();
    $('trigger-guide').textContent='피해 가며 나를 돌봐요';$('stone-guide').textContent='피해도, 만나 배워도 괜찮아요';
    $('chapter-kicker').textContent='A LITTLE JOURNEY';$('chapter-title').textContent='나의 속도로, 한 걸음.';
    $('world-location').textContent='어느 날의 산책길';$('world-step').textContent='01 — 03';
    $('progress').style.width='0%';$('progress-label').textContent='0%';document.querySelector('.journey-progress').setAttribute('aria-valuenow','0');
    document.querySelectorAll('.journey-stages span').forEach((s,i)=>s.className=i===0?'current':'');
    $('pocket-items').innerHTML='<span class="empty-note">걷다 보면, 나를 돕는 것들이 쌓여요.</span>';$('pocket-count').textContent='0 / 3';
    for(let i=0;i<3;i++) $('step-'+i).className=i===0?'current':'';
    $('side-quote').innerHTML='“이겨내야 한다”는 말도<br>잠시 내려놓아도 괜찮아.';
    message(baseCaption,0);
    showOverlay(`<span class="tag">돌멩이가 있어도 · 작은 여정</span><h2>작은 나의<br>조금씩 커지는 여정.</h2><p>돌은 피해도, 만나 배워도 괜찮아요.<br>빨간 ‘발작버튼’은 피해 가요.<br>잠깐 작아져도 다시 걸을 수 있어요.</p><button class="primary-button" data-action="start">천천히 걸어볼까요 <span aria-hidden="true">→</span></button><label class="slow-option"><input type="checkbox" id="slow-mode" ${state.slow?'checked':''}> 더 느긋한 속도로 걷기</label><p class="small">← → 이동 · 언제든 쉬어가기<br>스테이지 사이에는 짧은 만화가 이어져요.</p>`,'start');
  }
  function start() {
    state.slow = !!$('slow-mode')?.checked;
    updateChapter();play();
    message('← → 키나 아래 버튼으로 길을 골라보세요.',6);
  }
  function move(direction) {
    if (state.mode !== 'playing'||state.flinch>0) return;
    state.lane=Math.max(0,Math.min(2,state.lane+direction));syncControls();
  }
  function pause() {
    if(!['playing','stone-choice'].includes(state.mode)) return;
    showOverlay(`<span class="tag">잠깐 멈춰도 괜찮아요</span><h2>여기는<br>쉬어가는 자리.</h2><p>화면에서 잠시 눈을 떼거나,<br>지금 주변을 천천히 살펴봐도 좋아요.<br>준비되면 다시 걸어요.</p><div class="pause-actions"><button class="primary-button" data-action="resume">내 속도로 이어 걷기 →</button><button class="secondary-button" data-action="rest-end">오늘은 여기서 쉬어가기</button></div>`,'paused');
    message('길도 잠시 기다리고 있어요.',0);
  }
  function requestHelp() {
    if(state.mode!=='playing'||state.chapter===0) return false;
    const item=helpTarget();
    if(!item){message('빨간 버튼 가까이에서 ‘지금 도움 요청’이 보이면 H를 한 번 눌러요.',3);return false;}
    if(state.pendingTrigger?.item===item)protectTrigger(item);
    else{item.armed=true;showProtection();message('곁의 도움을 불렀어요. 이 버튼의 영향을 막을 준비가 됐어요.',3);}
    syncHelpUI();return true;
  }
  function firstCrossing() {
    addToken('알아차림');state.items=[];
    startStageComic(0);
  }
  function secondChapter() {
    state.chapter=1;state.time=0;state.spawn=0;state.chapterSpawns=0;state.helper=null;state.pendingTrigger=null;
    addToken('연결');updateChapter();
    showOverlay(`<span class="tag">두 번째 걸음 · 함께 걸어보기</span><h2>도움이 필요한 순간,<br>H를 한 번.</h2><p>발작버튼에 닿기 직전이나 직후,<br><strong>‘지금 도움 요청’</strong>이 보이면 <strong>H</strong>를 눌러요.<br>H를 누른 순간, 곁의 도움이 보호해줘요.</p><button class="primary-button" data-action="start-second">함께 걸어보기 →</button><p class="small">도움은 요청했을 때만 잠깐 나타나요.<br>휴대폰에서는 도움 버튼을 눌러요.</p>`,'stage-intro');
    message('타이밍에 맞춰 도움을 요청하는 길이에요.',0);
  }
  function choosePath() {
    state.items=[];
    showOverlay(`<span class="tag">세 번째 걸음 · 나의 선택</span><h2>다음 걸음은, 나의 선택.</h2><p>돌 앞에서 길이 잠시 멈춰요.<br><strong>← 마주하기</strong>로 경험을 더하거나,<br><strong>지나가기 →</strong>로 크기 그대로 걸어요.</p><div class="stage-rules"><p>이 길에서도 발작버튼 가까이에서 H를 누르면<br>곁의 도움이 나타나 크기 감소를 막아줘요.</p></div><div class="button-stack"><button class="choice-button" data-action="leave"><span class="choice-icon" aria-hidden="true">∿</span><span><strong>돌 사이로 걸어보기</strong><small>돌마다 마주할지, 지나갈지 골라요.</small></span></button><button class="choice-button" data-action="stepstones"><span class="choice-icon" aria-hidden="true">⋯</span><span><strong>새로운 디딤돌 놓아보기</strong><small>초록 발판도 밟으며 다음 걸음을 도와요.</small></span></button></div><button class="text-button stone-rest" data-action="rest-end">오늘은 여기서 쉬어가기</button><p class="small">머리 위 작은 버튼을 누르거나 ← / → 키로 골라요.</p>`,'choice');
  }
  function thirdChapter(choice) {
    state.choice=choice;state.chapter=2;state.time=0;state.spawn=0;state.chapterSpawns=0;state.helper=null;state.pendingTrigger=null;
    addToken('나의 선택');updateChapter();play();
    message(choice==='stepstones'?'초록 발판을 밟아보세요. 돌을 만나면 마주할지 지나갈지 골라요.':'돌을 만나면 잠시 멈춰요. 마주하기와 지나가기 중 골라보세요.',7);
  }
  function finish(rested=false) {
    state.effects=[];state.highlight=0;state.helper=null;state.pendingStone=null;state.pendingTrigger=null;
    if(rested) {state.choice='rest';if(state.tokens.length<3)addToken('나의 선택');}
    if(!rested) {state.total=68;$('progress').style.width='100%';$('progress-label').textContent='100%';document.querySelectorAll('.journey-stages span').forEach(s=>s.className='done');document.querySelector('.journey-progress').setAttribute('aria-valuenow','100');}
    state.items=[];
    document.querySelector('.app').classList.add('is-ending');
    const endings = {
      rest:{mark:'Ⅱ',tag:'오늘의 선택 · 쉬어가기',title:'오늘은 여기까지.<br>이 걸음도 소중해요.',copy:'지금 내게 필요한 쉼을 골랐어요.<br>다시 걷는 때도, 걷는 속도도<br>내가 정할 수 있어요.',line:'쉬어가기로 한 나의 선택을 존중해요.'},
      leave:{mark:'∿',tag:'오늘의 선택 · 나의 길 넓히기',title:'돌멩이가 남아도,<br>나의 길은 계속돼요.',copy:'기억을 지우지 않고도,<br>도움을 받으며 거리를 고르고<br>내 삶의 다른 장면으로 걸어갈 수 있어요.',line:'모든 돌을 치우지 않아도, 우리는 앞으로 갈 수 있어요.'},
      stepstones:{mark:'✳',tag:'오늘의 선택 · 새로운 가능성',title:'내가 놓은 디딤돌,<br>다음 걸음의 시작.',copy:'힘든 일이 좋은 일이 된 건 아니에요.<br>그 이후에 만난 도움과 나의 선택이<br>새로운 가능성을 만들어 주었어요.',line:'성장은 의무가 아니에요. 나에게 맞는 변화면 충분해요.'}
    };
    const e=endings[state.choice]||endings.leave;
    $('side-quote').innerHTML=rested?'“오늘은 쉬어가고 싶어.”<br>내 마음의 속도를 존중하는 선택.':'“어떤 길로 가든, 나의 선택.”<br>다음 걸음도 내가 정할 수 있어요.';
    showOverlay(`<div class="ending-mark" aria-hidden="true">${e.mark}</div><span class="tag">${e.tag}</span><h2>${e.title}</h2><p>${e.copy}</p><p class="ending-caption">${e.line}<br>이 게임의 끝이 회복의 완성을 뜻하지는 않아요.</p><div class="finish-actions"><button class="secondary-button" data-action="restart">다시 걸어보기</button><button class="primary-button" data-action="comic">원작 만화 읽기 ↗</button></div>`,'ending');
    $('chapter-kicker').textContent='MY OWN PACE';$('chapter-title').textContent=rested?'지금의 나를 돌보는 선택.':'여기까지, 나의 속도로.';
    message(e.line,0);
  }
  function spawnItem() {
    const index=state.steps++,localIndex=state.chapterSpawns++;
    const lanes=[1,0,2,1,2,0,1,0,2,0,1,2];
    const lane=lanes[index%lanes.length];
    // The comic's red trigger button appears every three objects; two other lanes remain open.
    const hazard=localIndex%3===2?'trigger':null;
    const isStep=state.chapter===2&&state.choice==='stepstones'&&localIndex%2===0;
    const type=hazard||(isStep?'step':'rock');
    state.items.push({lane,y:75,type,yielding:false,passed:false,seed:index});
    if(state.chapter===0&&localIndex===2)message('빨간 발작버튼은 피해 가요. 닿아도 여정은 계속돼요.',5);
  }
  function encounterStone(item) {
    state.hits++;state.growth+=1;item.met=true;state.highlight=1.3;
    const candidates=growthWords.filter(word=>word!==state.lastKeyword);
    const label=candidates[Math.floor(Math.random()*candidates.length)];state.lastKeyword=label;
    const pain=painWords[Math.floor(Math.random()*painWords.length)];
    state.effects.push({kind:'stone',label,pain,x:state.x,y:playerY-12,age:0,duration:2.2});
    message(`${pain}도 있었지만, 나의 여정에 ‘${label}’이 더해졌어요.`,4);
  }
  function encounterStep(item){
    item.activated=true;item.activationAge=0;
    state.effects.push({kind:'step',label:'새로운 가능성',x:state.x,y:playerY+22,age:0,duration:2.2});
    message('디딤돌이 환하게 빛나요. 다음 한 걸음이 조금 가벼워졌어요.',4);
  }
  function chooseStone(item){
    state.pendingStone=item;state.mode='stone-choice';
    $('overlay').classList.add('hidden');$('overlay').replaceChildren();
    $('stone-choice').hidden=false;positionPrompt($('stone-choice'),126);syncControls();
    $('stone-choice').focus({preventScroll:true});
    message('← 마주하기 · 지나가기 →  |  고르는 동안 길이 기다려요.',0);
  }
  function resolveStone(face){
    const item=state.pendingStone;if(!item)return false;
    for(const code of heldKeys)if(['ArrowLeft','ArrowRight','KeyA','KeyD','a','A','d','D'].includes(code))choiceKeys.add(code);
    state.pendingStone=null;play();
    if(face)encounterStone(item);
    else{item.bypassed=true;item.bypassAge=0;message('이 돌은 지나가기로 했어요. 나의 선택을 존중해요.',4);}
    return true;
  }
  function encounterHazard(item){
    item.met=true;item.pressAge=0;state.hazardHits++;
    if(state.chapter>0){
      if(item.armed)protectTrigger(item);
      else state.pendingTrigger={item,remaining:helpGrace};
      return;
    }
    takeTriggerImpact();
  }
  function showProtection(){
    const lines=helperLines.filter(line=>line!==state.helper?.text);
    state.helper={age:0,duration:2,x:state.x>530?state.x-105:state.x+105,text:lines[Math.floor(Math.random()*lines.length)]};
    state.effects=state.effects.filter(effect=>effect.kind!=='shield');
    state.effects.push({kind:'shield',label:'보호받았어요',x:state.x,y:playerY-6,age:0,duration:2});
  }
  function protectTrigger(item){
    if(item.protected)return;
    item.protected=true;state.protectedHits++;
    if(state.pendingTrigger?.item===item)state.pendingTrigger=null;
    showProtection();message('“옆에 있을게.” 타이밍에 맞춰 도움을 받았어요. 크기는 그대로예요.',4);
  }
  function takeTriggerImpact(){
    // Keep the character visible even during unusually long play; normal chapters never reach this floor.
    state.growth=Math.max(-15,state.growth-1);state.highlight=0;state.flinch=1;state.dim=.7;
    state.effects.push({kind:'hazard',label:'잠깐 움츠림',x:state.x,y:playerY+13,age:0,duration:1.8});
    message('발작버튼이 눌렸어요. 잠깐 움츠러들어 움직이기 어려워요.',4);
  }
  function update(dt) {
    if(state.mode!=='playing') return;
    const pace=state.slow?.72:1;
    const delta=dt*pace;
    const oldTime=state.time;
    state.time+=delta;state.total+=delta;
    if(state.pendingTrigger){
      state.pendingTrigger.remaining-=dt;
      if(state.pendingTrigger.remaining<=0){state.pendingTrigger=null;takeTriggerImpact();}
    }
    state.highlight=Math.max(0,state.highlight-dt);
    state.flinch=Math.max(0,state.flinch-dt);state.dim=Math.max(0,state.dim-dt);
    state.items.forEach(item=>{if(item.pressAge!==undefined)item.pressAge+=dt;});
    state.effects.forEach(effect=>{effect.age+=dt;});state.effects=state.effects.filter(effect=>effect.age<effect.duration);
    if(state.helper){state.helper.age+=dt;if(state.helper.age>=state.helper.duration)state.helper=null;}
    if(state.notice>0){state.notice-=dt;if(state.notice<=0)$('message').textContent=state.chapter===0?'길을 바꿔도, 잠시 쉬어도 괜찮아요.':'발작버튼 가까이에서 H를 한 번 눌러 도움을 요청해요.';}
    const speed=(state.chapter===0?150:128)*pace;
    state.scroll+=speed*dt;state.spawn+=delta;
    if(state.spawn>1.8){spawnItem();state.spawn=0;}
    const target=laneX(state.lane);
    state.x+=(target-state.x)*Math.min(1,dt*13);
    for(const item of state.items){
      if(item.activated)item.activationAge+=dt;
      if(item.bypassed)item.bypassAge+=dt;
      const previous=item.y;item.y+=speed*dt;
      if(!item.passed&&previous<playerY&&item.y>=playerY){
        item.passed=true;
        const touching=Math.abs(laneX(item.lane)-state.x)<(47+state.growth)*.42+27;
        if(touching&&!item.yielding){
          if(item.type==='step')encounterStep(item);
          else if(item.type==='trigger')encounterHazard(item);
          else if(state.chapter===2){chooseStone(item);return;}
          else encounterStone(item);
        }
      }
    }
    state.items=state.items.filter(item=>item.y<H+70);
    syncHelpUI();
    if(state.chapter===1){
      if(oldTime<7&&state.time>=7)message('도움이 필요한 순간, H로 곁의 도움을 불러보세요.',5);
      if(oldTime<15&&state.time>=15)message('믿을 만한 사람과 전문적인 도움도 연결의 한 방법이에요.',5);
    }
    if(state.chapter===2&&state.choice==='stepstones'&&oldTime<10&&state.time>=10)message('디딤돌은 사건이 아니라, 이후에 얻은 도움과 발견이에요.',6);
    const percent=Math.min(100,state.total/68*100);$('progress').style.width=`${percent}%`;$('progress-label').textContent=`${Math.floor(percent)}%`;document.querySelector('.journey-progress').setAttribute('aria-valuenow',String(Math.round(percent)));
    if(state.time>=durations[state.chapter]&&!state.pendingTrigger){if(state.chapter===0)firstCrossing();else startStageComic(state.chapter);}
  }
  function laneX(lane){return 240+lane*160;}
  function sourceDraw(img,sx,sy,sw,sh,dx,dy,dw,dh,alpha=1){
    if(!img)return;
    ctx.save();ctx.globalAlpha=alpha;ctx.globalCompositeOperation='multiply';ctx.drawImage(img,sx,sy,sw,sh,dx,dy,dw,dh);ctx.restore();
  }
  let playerSprite=null;
  // Removes only the white backdrop connected to the crop edges, so the white body stays opaque over stones.
  function cutoutSprite(img,sx,sy,sw,sh){
    const c=document.createElement('canvas');c.width=sw;c.height=sh;const g=c.getContext('2d');
    g.drawImage(img,sx,sy,sw,sh,0,0,sw,sh);const data=g.getImageData(0,0,sw,sh),p=data.data;
    const light=i=>Math.min(p[i*4],p[i*4+1],p[i*4+2])>205,seen=new Uint8Array(sw*sh),queue=[];
    for(let x=0;x<sw;x++)queue.push(x,(sh-1)*sw+x);for(let y=0;y<sh;y++)queue.push(y*sw,y*sw+sw-1);
    while(queue.length){const i=queue.pop();if(seen[i]||!light(i))continue;seen[i]=1;p[i*4+3]=0;const x=i%sw;
      if(x>0)queue.push(i-1);if(x<sw-1)queue.push(i+1);if(i>=sw)queue.push(i-sw);if(i<sw*(sh-1))queue.push(i+sw);}
    g.putImageData(data,0,0);return c;
  }
  function roundRect(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}}
  function natureDraw(name,x,y,width,alpha=1){
    const crop=natureCrops[name];if(!art.nature||!crop)return;
    ctx.save();ctx.filter='brightness(1.08)';
    sourceDraw(art.nature,...crop,x,y,width,width*crop[3]/crop[2],alpha);
    ctx.restore();
  }
  function drawNature(){
    if(state.chapter===0){
      sourceDraw(art[10],111,832,225,248,4,92,133,147,.65);
      sourceDraw(art[10],811,881,167,202,680,218,103,125,.7);
      sourceDraw(art[10],111,832,225,248,-10,477,135,148,.5);
      return;
    }
    const tree=state.chapter===2?'fruitTree':'tree';
    // Layered nature sprites stay along the edge, leaving every playable lane clear.
    [[4,22,103,.82],[680,50,109,.8],[-20,242,122,.94],[682,275,115,.95],[1,467,108,1],[690,512,120,1]].forEach(([x,y,w,a])=>natureDraw(tree,x,y,w,a));
    [[16,180,110],[675,215,95],[0,417,100],[688,445,95],[6,630,118],[681,680,95]].forEach(([x,y,w],i)=>natureDraw(i%2?'smallGrass':'grass',x,y,w,.87));
    if(state.chapter===2){
      [[16,176,113],[665,215,118],[5,412,110],[665,448,130],[6,629,135],[667,670,137]].forEach(([x,y,w],i)=>natureDraw(i%2?'flowerPatch':'flowers',x,y,w,1));
    }
  }
  function drawShieldLight(){
    for(const effect of state.effects){
      if(effect.kind!=='shield')continue;
      const t=effect.age/effect.duration,fade=Math.min(1,(1-t)*2.4);
      const ease=1-Math.pow(1-Math.min(1,t*2.2),3);
      ctx.save();
      const wash=ctx.createRadialGradient(effect.x,effect.y,0,effect.x,effect.y,480);
      wash.addColorStop(0,'#ffe19a');wash.addColorStop(1,'#ffe19a00');
      ctx.globalAlpha=fade*.2;ctx.fillStyle=wash;ctx.fillRect(0,0,W,H);
      ctx.globalAlpha=fade;
      {
        const spin=reducedMotion?0:effect.age*.35;
        for(let i=0;i<8;i++){
          const a=spin+i*Math.PI/4,len=(i%2?120:190)*ease,w=i%2?.012:.02;
          const g=ctx.createRadialGradient(effect.x,effect.y,18,effect.x,effect.y,len+20);
          g.addColorStop(0,'#eeb54899');g.addColorStop(1,'#eeb54800');ctx.fillStyle=g;
          ctx.beginPath();ctx.moveTo(effect.x,effect.y);ctx.arc(effect.x,effect.y,len+20,a-w,a+w);ctx.closePath();ctx.fill();
        }
        ctx.globalAlpha=fade*(1-ease);ctx.strokeStyle='#e2a93a';ctx.lineWidth=1.4;
        ctx.beginPath();ctx.arc(effect.x,effect.y,26+ease*130,0,Math.PI*2);ctx.stroke();
        ctx.globalAlpha=fade;
      }
      const glowR=48+ease*52,glow=ctx.createRadialGradient(effect.x,effect.y,0,effect.x,effect.y,glowR);
      glow.addColorStop(0,'#fff8e2');glow.addColorStop(.4,'#ffe29a90');glow.addColorStop(1,'#ffd67000');
      ctx.fillStyle=glow;ctx.beginPath();ctx.arc(effect.x,effect.y,glowR,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
  }
  function drawEncounterEffects(){
    for(const effect of state.effects){
      const t=effect.age/effect.duration,fade=Math.min(1,(1-t)*2.4);
      ctx.save();ctx.globalAlpha=fade;
      if(effect.kind==='shield'){
        {
          for(let i=0;i<10;i++){
            const seed=i*2.399,rise=effect.age*(34+(i%4)*12);
            const sx=effect.x+Math.cos(seed)*(22+i*5),sy=effect.y+14-rise-(i%3)*14;
            const blink=.55+.45*Math.sin(effect.age*9+i*1.7);
            ctx.globalAlpha=fade*blink;twinkle(sx,sy,(1.4+(i%3)*.8)*(1-t*.5),i%4?'#dd9f2c':'#6aa982');
          }
        }
        ctx.restore();continue;
      }
      if(effect.kind==='hazard'){
        const p=Math.min(1,effect.age/.5);
        if(p<1){ctx.save();drawImpact(effect.x,effect.y+2,p,'#b8694a',1.3);ctx.restore();}
        drawEffectLabel(effect.label,effect.x,effect.y-95,'#a56744');
        ctx.restore();continue;
      }
      if(effect.kind==='step'){
        // A turquoise ripple and lifted light distinguish a step from a stone encounter.
        const radius=reducedMotion?58:28+t*91;
        const glow=ctx.createRadialGradient(effect.x,effect.y,0,effect.x,effect.y,radius);
        glow.addColorStop(0,'#8dcba484');glow.addColorStop(1,'#8dcba400');ctx.fillStyle=glow;
        ctx.beginPath();ctx.ellipse(effect.x,effect.y,radius,radius*.48,0,0,Math.PI*2);ctx.fill();
        for(let ring=0;ring<2;ring++){
          ctx.strokeStyle=ring?'#9ac6a1':'#499976';ctx.lineWidth=2-ring*.5;
          const r=radius*(ring?.63:1);ctx.beginPath();ctx.ellipse(effect.x,effect.y,r,r*.34,0,0,Math.PI*2);ctx.stroke();
        }
        for(let i=0;i<6;i++){
          const x=effect.x+(i-2.5)*15,y=effect.y-16-(reducedMotion?20:t*76)-Math.sin(i*1.8)*10;
          ctx.fillStyle=i%2?'#d4b86c':'#75a988';ctx.beginPath();ctx.arc(x,y,2.4,0,Math.PI*2);ctx.fill();
        }
        drawEffectLabel(effect.label,effect.x,effect.y-(reducedMotion?98:90+t*32),'#36735a');
        ctx.restore();continue;
      }
      if(effect.pain){
        // The hurt shows first and sinks away while the growth word rises: both feelings share the moment.
        const p=Math.min(1,effect.age/.45);
        ctx.save();
        if(p<1)drawImpact(effect.x,effect.y+28,p,'#7f8fa3',1);
        ctx.globalAlpha=fade*Math.max(0,1-effect.age/1.5);
        drawEffectLabel(effect.pain,effect.x-34,effect.y-14+effect.age*22,'#6f7f94',22);
        ctx.restore();
      }
      for(let i=0;i<6;i++){
        const x=effect.x+18+(i-2.5)*13,y=effect.y-(reducedMotion?22:10+t*70)-(i%3)*12;
        ctx.save();ctx.globalAlpha=fade*(reducedMotion?1:Math.min(1,effect.age/.25));twinkle(x,y,1.6+(i%2)*.8,i%2?'#c7a151':'#799766');ctx.restore();
      }
      drawEffectLabel(effect.label,effect.x+(effect.pain?28:0),effect.y-56-t*32,'#657f48');ctx.restore();
    }
  }
  // Comic-style impact strokes fanning out from the feet, echoing the source illustrations.
  function drawImpact(cx,cy,p,color,scale){
    ctx.globalAlpha*=1-p;ctx.strokeStyle=color;ctx.lineWidth=2*scale;ctx.lineCap='round';
    for(const side of [-1,1])for(let k=0;k<3;k++){
      const a=(k-1)*.45,r0=(30+p*10)*scale,r1=(42+p*16)*scale;
      ctx.beginPath();ctx.moveTo(cx+side*Math.cos(a)*r0,cy-Math.sin(a)*r0*.6);ctx.lineTo(cx+side*Math.cos(a)*r1,cy-Math.sin(a)*r1*.6);ctx.stroke();
    }
  }
  function twinkle(x,y,s,color){
    ctx.fillStyle=color;ctx.beginPath();
    ctx.moveTo(x,y-s*2.4);ctx.quadraticCurveTo(x,y,x+s*2.4,y);ctx.quadraticCurveTo(x,y,x,y+s*2.4);ctx.quadraticCurveTo(x,y,x-s*2.4,y);ctx.quadraticCurveTo(x,y,x,y-s*2.4);ctx.fill();
  }
  function drawEffectLabel(text,x,y,color,size=30){
    ctx.font=`600 ${size}px "Apple SD Gothic Neo","Malgun Gothic",sans-serif`;ctx.textAlign='center';
    ctx.lineJoin='round';ctx.lineWidth=size/5;ctx.strokeStyle='#fffdf4';ctx.strokeText(text,x,y);
    ctx.fillStyle=color;ctx.fillText(text,x,y);
  }
  function draw() {
    ctx.clearRect(0,0,W,H);
    const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,['#e6eadc','#dce7ca','#e2edcb'][state.chapter]);bg.addColorStop(1,['#f3f0e3','#edf0db','#f4efd8'][state.chapter]);ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    // Lane geometry, original comic characters, and a hand-drawn nature atlas.
    const wide=state.chapter===2?36:0;
    ctx.fillStyle='#fdfbef';ctx.beginPath();ctx.moveTo(191-wide,0);ctx.bezierCurveTo(145-wide,220,164-wide,400,115-wide,H);ctx.lineTo(685+wide,H);ctx.bezierCurveTo(636+wide,420,655+wide,230,609+wide,0);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#d8ddc8';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(191-wide,0);ctx.bezierCurveTo(145-wide,220,164-wide,400,115-wide,H);ctx.moveTo(609+wide,0);ctx.bezierCurveTo(655+wide,230,636+wide,420,685+wide,H);ctx.stroke();
    ctx.strokeStyle='#d9decb';ctx.lineWidth=1.3;ctx.setLineDash([4,18]);ctx.lineDashOffset=-(state.scroll%22);[320,480].forEach(x=>{ctx.beginPath();ctx.moveTo(x,65);ctx.lineTo(x,H-32);ctx.stroke();});ctx.setLineDash([]);
    drawNature();
    if(state.mode==='start'){
      [{lane:0,y:260},{lane:2,y:380},{lane:1,y:165}].forEach(item=>drawItem({...item,type:'rock',yielding:false,seed:0}));
    } else state.items.forEach(drawItem);
    drawShieldLight();
    const bob=state.mode==='playing'&&!reducedMotion?Math.sin(state.scroll/26)*3:0;
    if(state.helper){
      const helper=state.helper;
      const alpha=Math.max(0,Math.min(1,reducedMotion?1:helper.age/.16,(helper.duration-helper.age)/.6));
      const lift=reducedMotion?0:(1-Math.min(1,helper.age/.3))*9;
      sourceDraw(art[7],363,796,293,387,helper.x-34,playerY-66+lift,68,90,alpha*.8);
      ctx.save();ctx.globalAlpha=alpha;ctx.textAlign='center';ctx.fillStyle='#658254';ctx.font='24px sans-serif';ctx.fillText('♡',helper.x,playerY-82+lift);
      ctx.font='17px sans-serif';ctx.fillText(helper.text,helper.x,playerY+49);ctx.restore();
    }
    // Original 94 × 132 becomes 47 × 66; stones add 1px and hazards subtract 1px from both dimensions.
    const newest=state.effects.filter(effect=>effect.kind==='stone').at(-1);
    const pulse=newest&&!reducedMotion?1+Math.sin(Math.min(1,newest.age/.55)*Math.PI)*.065:1;
    const stepEffect=state.effects.filter(effect=>effect.kind==='step').at(-1);
    const stepLift=stepEffect&&!reducedMotion?Math.sin(Math.min(1,stepEffect.age/.8)*Math.PI)*13:0;
    const hazardEffect=state.effects.filter(effect=>effect.kind==='hazard').at(-1);
    const settle=hazardEffect&&!reducedMotion?Math.sin(Math.min(1,hazardEffect.age/.65)*Math.PI)*4:0;
    const stumble=newest&&!reducedMotion&&newest.age<.3?Math.sin(newest.age/.3*Math.PI)*6:0;
    const crouch=state.flinch>0?Math.min(1,state.flinch/.2):0;
    const playerWidth=(47+state.growth)*pulse*(1+crouch*.1),playerHeight=(66+state.growth)*pulse*(1-crouch*.16);
    if(state.dim>0){ctx.fillStyle=`rgba(52,48,62,${.26*Math.min(1,state.dim/.35)})`;ctx.fillRect(0,0,W,H);}
    ctx.fillStyle='#d0c6ae55';ctx.beginPath();ctx.ellipse(state.x,playerY+24,playerWidth*.43,7,0,0,Math.PI*2);ctx.fill();
    if(art[4]&&!playerSprite)playerSprite=cutoutSprite(art[4],412,802,244,342);
    if(playerSprite)ctx.drawImage(playerSprite,state.x-playerWidth/2,playerY+27-playerHeight+bob-stepLift+settle+stumble,playerWidth,playerHeight);
    else {ctx.fillStyle='#faf7ee';ctx.strokeStyle='#315b47';ctx.lineWidth=3;ctx.beginPath();ctx.arc(state.x,playerY,playerWidth*.3,0,Math.PI*2);ctx.fill();ctx.stroke();}
    drawEncounterEffects();
    if(state.mode==='playing'){
      ctx.font='15px sans-serif';ctx.textAlign='center';ctx.fillStyle='#7b8b69';ctx.fillText('나',state.x,playerY+54);
    }
  }
  function drawItem(item){
    let x=laneX(item.lane);
    if(item.yielding)x=item.lane<1?137:663;
    if(item.bypassed){const t=reducedMotion?1:Math.min(1,item.bypassAge/.5);x+=(item.lane===2?98:-98)*t;}
    if(item.type==='trigger'){
      const press=item.pressAge!==undefined?Math.min(1,item.pressAge/.35):1;
      const width=74,height=item.met?44-Math.sin(press*Math.PI)*14:53;
      ctx.save();ctx.globalAlpha=item.met?.38:1;
      ctx.strokeStyle=item.protected?'#5d9c8c':'#c58d80';ctx.fillStyle='#d9917c17';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.ellipse(x,item.y+13,52,22,0,0,Math.PI*2);ctx.fill();ctx.stroke();
      sourceDraw(art[2],600,1047,185,133,x-width/2,item.y+22-height,width,height,item.met?.38:1);
      ctx.font='600 18px "Apple SD Gothic Neo","Malgun Gothic",sans-serif';ctx.textAlign='center';ctx.fillStyle='#986341';
      ctx.fillText(item.protected?'보호됨':'발작버튼',x,item.y+49);ctx.restore();return;
    }
    const size=item.type==='step'?70:63;
    if(item.type==='step'){
      const bloom=item.activated&&!reducedMotion?Math.sin(Math.min(1,item.activationAge/.6)*Math.PI)*7:0;
      ctx.fillStyle=item.activated?'#b6dcb0':'#dce7c9';ctx.strokeStyle=item.activated?'#4e9b74':'#a0b689';ctx.lineWidth=item.activated?3:2;
      ctx.beginPath();ctx.ellipse(x,item.y+4,44+bloom,20+bloom*.4,0,0,Math.PI*2);ctx.fill();ctx.stroke();
      if(item.activated){ctx.strokeStyle='#e3c274';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,item.y+4,34,13,0,0,Math.PI*2);ctx.stroke();}
      ctx.font='21px sans-serif';ctx.textAlign='center';ctx.fillStyle=item.activated?'#2f7350':'#587645';ctx.fillText(item.activated?'✧':'✳',x,item.y+11);
    }else if(art[4])sourceDraw(art[4],718,1080,99,65,x-size/2,item.y-22,size,size*65/99,item.bypassed?.55:item.yielding?.55:item.met?.38:1);
    else{ctx.fillStyle='#9eaa94';ctx.beginPath();ctx.ellipse(x,item.y,28,17,0,0,Math.PI*2);ctx.fill();}
  }
  function frame(now){const dt=last?Math.min((now-last)/1000,.05):0;last=now;update(dt);draw();requestAnimationFrame(frame);}
  function action(name){
    const valid={start:['start'],'start-second':['stage-intro'],resume:['paused'],leave:['choice'],stepstones:['choice'],'face-stone':['stone-choice'],'pass-stone':['stone-choice'],'rest-end':['paused','choice','stone-choice'],restart:['ending'],comic:['ending'],'story-next':['interlude'],'story-prev':['interlude'],'story-skip':['interlude']};
    if(!valid[name]?.includes(state.mode))return false;
    switch(name){case 'start':start();break;case 'start-second':play();message('‘지금 도움 요청’이 보이면 H 또는 도움 버튼을 한 번 눌러요.',6);break;case 'resume':if(state.pendingStone)chooseStone(state.pendingStone);else{play();message('준비된 만큼, 다시 한 걸음.',4);}break;case 'leave':thirdChapter('leave');break;case 'stepstones':thirdChapter('stepstones');break;case 'face-stone':return resolveStone(true);case 'pass-stone':return resolveStone(false);case 'rest-end':finish(true);break;case 'restart':startScreen();break;case 'comic':openDialog('comic-dialog');break;case 'story-next':nextStageComic();break;case 'story-prev':previousStageComic();break;case 'story-skip':completeStageComic();break;}
    return true;
  }
  $('overlay').addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button)action(button.dataset.action);});
  $('stone-choice').addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button)action(button.dataset.action);});
  $('left').addEventListener('click',()=>move(-1));$('right').addEventListener('click',()=>move(1));
  $('rest').addEventListener('click',pause);$('support').addEventListener('click',requestHelp);
  $('timing-cue').addEventListener('click',requestHelp);
  canvas.addEventListener('pointerdown',event=>{if(state.mode!=='playing'||state.flinch>0)return;const bounds=canvas.getBoundingClientRect();state.lane=Math.max(0,Math.min(2,Math.round(((event.clientX-bounds.left)/bounds.width*W-240)/160)));syncControls();});
  document.addEventListener('keydown',event=>{
    const code=event.code||event.key;
    const fresh=!event.repeat&&!heldKeys.has(code);heldKeys.add(code);
    if(event.target.matches('input,textarea,select')||event.ctrlKey||event.metaKey||event.altKey)return;
    if($('stage-comic-dialog').open){
      if(event.repeat)return;
      if(event.key==='ArrowRight'){event.preventDefault();nextStageComic();}
      else if(event.key==='ArrowLeft'){event.preventDefault();previousStageComic();}
      return;
    }
    if(document.querySelector('dialog[open]'))return;
    if(['ArrowUp','ArrowDown'].includes(event.key))event.preventDefault();
    if(event.key==='Escape'&&['playing','stone-choice'].includes(state.mode)){pause();return;}
    if(state.mode==='stone-choice'){
      if(['ArrowLeft','ArrowRight'].includes(event.key)){
        event.preventDefault();
        if(fresh){choiceKeys.add(code);action(event.key==='ArrowLeft'?'face-stone':'pass-stone');}
      }else if(event.code==='Space'){event.preventDefault();if(fresh)pause();}
      return;
    }
    if(state.mode==='playing'){
      if(choiceKeys.has(code)){event.preventDefault();return;}
      if(['ArrowLeft','a','A'].includes(event.key)){event.preventDefault();move(-1);}
      else if(['ArrowRight','d','D'].includes(event.key)){event.preventDefault();move(1);}
      else if(event.code==='Space'){event.preventDefault();pause();}
      else if(event.code==='KeyH'||['h','H'].includes(event.key)){event.preventDefault();if(fresh)requestHelp();}
    }else if(state.mode==='paused'&&event.code==='Space'&&!event.target.matches('button')){event.preventDefault();action('resume');}
  });
  document.addEventListener('keyup',event=>{const code=event.code||event.key;heldKeys.delete(code);choiceKeys.delete(code);});
  function suspendForFocus(){heldKeys.clear();choiceKeys.clear();if(['playing','stone-choice'].includes(state.mode))pause();}
  addEventListener('blur',suspendForFocus);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)suspendForFocus();});
  const comicCaptions=[
    '01 · 발작 버튼 줄이기 — 원작 캠페인의 시작',
    '02 · 말, 장소, 냄새, 소리가 과거의 감정을 불러올 때',
    '03 · 비슷한 상황에서 다시 느껴지는 두려움과 불안',
    '04 · 모든 돌멩이가 나를 넘어뜨릴까?',
    '05 · 과거를 없애지 않고도 달라질 수 있는 반응',
    '06 · 완전히 극복해야 한다는 부담 내려놓기',
    '07 · 버튼이 눌린 순간을 알아차리고 현재 살펴보기',
    '08 · 버튼의 개수보다, 버튼의 힘',
    '09 · 이겨내야 한다는 말도 내려놓기',
    '10 · 길 위의 모든 돌을 치우지 않아도 우리는 앞으로 갈 수 있어요.'
  ];
  const stageComicRanges=[[0,3],[3,6],[6,10]];
  function startStageComic(chapter){
    state.mode='interlude';state.items=[];state.effects=[];state.helper=null;state.highlight=0;state.pendingStone=null;state.pendingTrigger=null;state.flinch=0;state.dim=0;state.interlude={chapter,page:stageComicRanges[chapter][0]};
    $('stone-choice').hidden=true;$('overlay').classList.add('hidden');syncControls();renderStageComic();
    $('stage-comic-dialog').showModal();$('stage-comic-next').focus({preventScroll:true});
    message('한 스테이지를 걸었어요. 잠시 이야기를 읽고 갈까요?',0);
  }
  function renderStageComic(){
    const story=state.interlude;if(!story)return;
    const [start,end]=stageComicRanges[story.chapter],lastPage=story.page===end-1;
    $('stage-comic-kicker').textContent=`STAGE 0${story.chapter+1} · 잠깐 읽는 이야기`;
    $('stage-comic-heading').textContent=['첫 번째 길에서 만난 마음','함께 걷는다는 것','나의 속도로, 다음 걸음'][story.chapter];
    $('stage-comic-image').src=`assets/comic-${String(story.page+1).padStart(2,'0')}.png`;
    $('stage-comic-image').alt=comicCaptions[story.page];
    $('stage-comic-caption').textContent=comicCaptions[story.page];
    $('stage-comic-page').textContent=`${story.page-start+1} / ${end-start}장 · 전체 ${story.page+1} / 10`;
    $('stage-comic-prev').disabled=story.page===start;
    $('stage-comic-next').textContent=lastPage?['2스테이지로 →','나의 길 선택하기 →','여정 마무리하기 →'][story.chapter]:'다음 장 →';
    $('stage-comic-dots').replaceChildren(...Array.from({length:end-start},(_,i)=>{const dot=document.createElement('span');dot.className=i<=story.page-start?'seen':'';return dot;}));
  }
  function nextStageComic(){
    const story=state.interlude;if(!story)return;
    if(story.page<stageComicRanges[story.chapter][1]-1){story.page++;renderStageComic();}else completeStageComic();
  }
  function previousStageComic(){
    const story=state.interlude;if(!story)return;
    if(story.page>stageComicRanges[story.chapter][0]){story.page--;renderStageComic();}
  }
  function completeStageComic(){
    if(!state.interlude)return;
    const chapter=state.interlude.chapter;state.interlude=null;
    if($('stage-comic-dialog').open)$('stage-comic-dialog').close();
    if(chapter===0)secondChapter();else if(chapter===1)choosePath();else finish();
  }
  $('stage-comic-prev').addEventListener('click',previousStageComic);$('stage-comic-next').addEventListener('click',nextStageComic);
  $('stage-comic-skip').addEventListener('click',completeStageComic);
  $('stage-comic-dialog').addEventListener('close',()=>{if(state.interlude)completeStageComic();});
  let storyPointer=null;
  $('stage-comic-image').addEventListener('pointerdown',event=>{storyPointer={x:event.clientX,y:event.clientY};});
  $('stage-comic-image').addEventListener('pointerup',event=>{if(!storyPointer)return;const dx=event.clientX-storyPointer.x,dy=event.clientY-storyPointer.y;storyPointer=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.5){if(dx<0)nextStageComic();else previousStageComic();}});
  $('stage-comic-image').addEventListener('pointercancel',()=>{storyPointer=null;});
  function renderComic(){
    $('comic-image').src=`assets/comic-${String(comicPage+1).padStart(2,'0')}.png`;
    $('comic-image').alt=comicCaptions[comicPage];$('comic-caption').textContent=comicCaptions[comicPage];
    $('comic-page').textContent=`${comicPage+1} / 10`;$('comic-prev').disabled=comicPage===0;$('comic-next').disabled=comicPage===9;
  }
  function openDialog(id){
    if(state.mode==='playing')pause();
    dialogReturn=document.activeElement;
    if(id==='comic-dialog')renderComic();
    $(id).showModal();
  }
  $('comic-open').addEventListener('click',()=>openDialog('comic-dialog'));$('about-open').addEventListener('click',()=>openDialog('about-dialog'));
  $('comic-prev').addEventListener('click',()=>{comicPage=Math.max(0,comicPage-1);renderComic();});$('comic-next').addEventListener('click',()=>{comicPage=Math.min(9,comicPage+1);renderComic();});
  document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
  ['comic-dialog','about-dialog'].forEach(id=>$(id).addEventListener('close',()=>dialogReturn?.focus({preventScroll:true})));
  // Optional browser-agent surface: the same actions and state used by the visible controls.
  const modelContext=document.modelContext;
  if(modelContext?.registerTool){
    const lifecycle=new AbortController();
    const readState=()=>({mode:state.mode,chapter:state.chapter+1,lane:state.lane,choice:state.choice,tokens:[...state.tokens],progress:Math.round(state.total/68*100),characterSize:{width:47+state.growth,height:66+state.growth},stoneEncounters:state.hits,hazardContacts:state.hazardHits,protectedContacts:state.protectedHits,helpTimingReady:!!helpTarget(),awaitingStoneChoice:!!state.pendingStone,comicPage:state.interlude?state.interlude.page+1:null});
    const tools=[
      {name:'read_journey_state',description:'현재 산책의 단계, 위치, 선택과 진행 상황을 확인합니다.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:readState},
      {name:'choose_journey_action',description:'산책 시작, 2스테이지 안내 후 출발(start-second), 이동, 쉬기, 타이밍 도움 요청, 만화 넘기기, 갈림길 선택 또는 돌 앞에서 마주하기(face-stone)와 지나가기(pass-stone)를 실행합니다.',inputSchema:{type:'object',properties:{action:{type:'string',enum:['start','start-second','left','right','pause','resume','help','leave','stepstones','face-stone','pass-stone','rest-end','restart','story-next','story-prev','story-skip']}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{
        if(!input||typeof input!=='object'||Object.keys(input).some(k=>k!=='action'))throw new Error('action 하나만 입력하세요.');
        const a=input.action;
        if(['left','right','pause','help'].includes(a)){
          if(state.mode!=='playing'&&!(a==='pause'&&state.mode==='stone-choice'))throw new Error('산책 중에만 사용할 수 있어요.');
          if(a==='left')move(-1);else if(a==='right')move(1);else if(a==='pause')pause();else if(!requestHelp())throw new Error('지금은 도움을 요청할 수 없어요.');
        }else if(!action(a))throw new Error('현재 화면에서 할 수 없는 선택이에요.');
        return readState();
      }}
    ];
    for(const tool of tools){try{Promise.resolve(modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
    addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  }
  startScreen();requestAnimationFrame(frame);
})();
