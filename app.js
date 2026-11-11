/* 小麥的杖劍工具集 v1.0.0：幻獸養成規劃工具，GitHub Pages 靜態網站。 */
(() => {
  'use strict';
  const G = window.GAME_DATA;
  const ROOT = document.querySelector('#app');
  const LEGACY_SAVE_KEY = 'fantasy-pet-planner-v1';
  const PROFILE_SAVE_KEY = 'wheat-sword-tools-characters-v1';
  const SITE_VERSION = 'v1.0.0';
  const FEEDBACK_EMAIL = 'cities0809@gmail.com';
  const TYPE_ORDER = ['防禦', '攻擊', '輔助'];
  const RARITY_ORDER = ['奇蹟', '傳說', '稀有'];
  const TABS = [
    { id:'collection', label:'我的幻獸', icon:'◈', mobile:'🐾' },
    { id:'slots', label:'同調配置', icon:'♛', mobile:'👑' },
    { id:'simulation', label:'養成規劃', icon:'◇', mobile:'🔮' },
    { id:'path', label:'後續推薦', icon:'↗', mobile:'🧭' },
    { id:'analysis', label:'效益分析', icon:'▥', mobile:'📊' },
    { id:'pricing', label:'材料行情', icon:'✧', mobile:'💎' }
  ];
  const petMap = Object.fromEntries(G.pets.map(x => [x.id, x]));
  const fmtInt = new Intl.NumberFormat('zh-TW', { maximumFractionDigits:0 });
  const fmtN = new Intl.NumberFormat('zh-TW', { maximumFractionDigits:2 });
  const safe = x => String(x ?? '').replace(/[&<>"']/g, a => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[a]));
  const money = x => x == null || !Number.isFinite(x) ? '—' : fmtN.format(x);
  const numeric = (x, max = 500) => {
    if (x === '' || x == null) return null;
    const n = Number(x);
    return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
  };
  const pct = x => x == null ? '—' : ((x * 100).toFixed(2) + '%');
  const petPct = x => x == null ? '—' : `${(x * 100).toFixed((x*100 + 1e-10) < 10 ? 2 : 1)}%`;
  const numberDelta = (x, asPct=false) => {
    if (x == null) return '—';
    const abs = asPct ? (Math.abs(x) * 100).toFixed(2) + '%' : fmtN.format(Math.abs(x));
    return (x > 0 ? '+' : x < 0 ? '−' : '±') + abs;
  };
  const stageLabel = n => ['關鍵節點','第1節點','第2節點'][n] ?? '未知節點';
  const progressLabel = (page,stage) => `第${page}頁 · ${stageLabel(stage)}`;
  const firstBase = rarity => G.rarityBase[rarity] ?? 0;
  const syncCap = pet => G.syncCaps[pet.rarity] ?? 0;
  const baseStep = pet => firstBase(pet.rarity) * (pet.type === '輔助' ? 1 : 2);
  const validatePage = p => Number.isInteger(p) && p >= 1 && p <= 10;
  const validateStage = (p, stage) => Number.isInteger(stage) && stage >= 0 && stage <= (p === 1 ? 1 : 2);
  const nodeOf = (p, stage) => p === 1 ? 0 : (p - 2) * 2 + stage;
  const nextProgress = (p, st) => {
    if (p === 1 && st === 0) return {page:1,stage:1};
    const n = nodeOf(p, st);
    if (n >= 18) return null;
    const next = n + 1;
    return {page:2+Math.floor((next-1)/2), stage:next%2===1?1:2};
  };
  // Google 試算表的 TRUNC(ROUND(百分點,10),位數)；先對每隻幻獸的每一項屬性捨去。
  const gameTrunc = ratio => {
    const points = Math.round(Math.max(0, ratio) * 100 * 1e10) / 1e10;
    const scale = points < 10 ? 100 : 10;
    return Math.floor(points * scale + 1e-9) / scale / 100;
  };
  function newPlan(id, slots=[null,null,null,null]) { return {id, name:`方案 ${id}`, slots:[...slots], overrides:{}}; }
  function newState() { return {
    owned:[], progress:{}, prices:{'防禦':80,'攻擊':80,'輔助':80},
    plans:[newPlan('A')], activePlan:'A', syncGain:12, backpack:{'防禦':0,'攻擊':0,'輔助':0}
  }; }
  function sanitizeState(input) {
    const state = newState();
    if (!input || typeof input !== 'object') return state;
    // 舊版 JSON 不含提升幅度，會使用 12 個百分點；新版自訂值則繼續保留。
    if (input.syncGain != null) {
      const gain = Number(input.syncGain);
      if (Number.isFinite(gain) && gain > 0 && gain <= 144) state.syncGain = gain;
    }
    if (input.backpack && typeof input.backpack==='object') for(const t of TYPE_ORDER){
      const n=numeric(input.backpack[t],100000000); if(n!==null) state.backpack[t]=Math.floor(n);
    }
    state.owned = [...new Set((Array.isArray(input.owned) ? input.owned : []).filter(id=>!!petMap[id]))];
    if (input.progress && typeof input.progress === 'object') {
      for (const pet of G.pets) {
        const p = input.progress[pet.id];
        if (!p || typeof p !== 'object') continue;
        const sync = numeric(p.sync, 1000);
        const page = validatePage(Number(p.page)) ? Number(p.page) : 1;
        const stage = validateStage(page, Number(p.stage)) ? Number(p.stage) : 1;
        state.progress[pet.id] = {sync, page, stage};
      }
    }
    if (input.prices && typeof input.prices === 'object') {
      for(const t of TYPE_ORDER) state.prices[t]=numeric(input.prices[t], 10000000);
    }
    if (Array.isArray(input.plans)) {
      const availableIds='ABCDEFGHIJ';
      const assigned=new Set();
      const cleaned=input.plans.slice(0,10).map((p,i)=>{
        const requested=typeof p?.id==='string' ? p.id : '';
        const id=availableIds.includes(requested)&&!assigned.has(requested) ? requested : [...availableIds].find(x=>!assigned.has(x));
        assigned.add(id);
        const q=newPlan(id);
        q.name = typeof p?.name === 'string' ? p.name.slice(0,36) : q.name;
        q.slots=Array.from({length:4},(_,k)=>petMap[p?.slots?.[k]]?p.slots[k]:null);
        let seen=new Set();q.slots=q.slots.map(x=>{if(x&&seen.has(x))return null;if(x)seen.add(x);return x;});
        if(p?.overrides && typeof p.overrides==='object') for(const pet of G.pets){
          const o=p.overrides[pet.id];if(!o)continue;
          const page=Number(o.page),stage=Number(o.stage);
          if(validatePage(page)&&validateStage(page,stage))q.overrides[pet.id]={page,stage};
        }
        return q;
      });
      if(cleaned.length)state.plans=cleaned;
    }
    for (const plan of state.plans)plan.slots=plan.slots.map(id=>state.owned.includes(id)?id:null);
    if(state.plans.some(p=>p.id===input.activePlan))state.activePlan=input.activePlan;
    return state;
  }
  // 每個角色都是獨立的遊戲資料。第一次使用時，只讀取舊版V1.9儲存值作為「角色 1」。
  // 不刪除、不覆寫舊版 Key，讓舊檔仍可獨立使用；此後新工具集存入新的 Key。
  function restoreProfiles(raw){
    const source=Array.isArray(raw?.characters) ? raw.characters.slice(0,20) : [];
    const characters=[];const seen=new Set();
    for(const item of source){
      if(!item||typeof item!=='object')continue;
      const id=typeof item.id==='string'&&/^character-\d+$/.test(item.id)?item.id:null;
      if(!id||seen.has(id))continue;
      seen.add(id);
      const name=typeof item.name==='string'&&item.name.trim()?item.name.trim().slice(0,24):`角色 ${characters.length+1}`;
      characters.push({id,name,state:sanitizeState(item.state)});
    }
    if(!characters.length){
      let old=null;try{old=JSON.parse(localStorage.getItem(LEGACY_SAVE_KEY)||'null')}catch{}
      characters.push({id:'character-1',name:'角色 1',state:sanitizeState(old)});
    }
    const activeId=characters.some(p=>p.id===raw?.activeId)?raw.activeId:characters[0].id;
    return {version:1,activeId,characters};
  }
  let PROFILES;
  try{PROFILES=restoreProfiles(JSON.parse(localStorage.getItem(PROFILE_SAVE_KEY)||'null'))}
  catch{PROFILES=restoreProfiles(null)}
  const activeCharacter=()=>PROFILES.characters.find(p=>p.id===PROFILES.activeId)||PROFILES.characters[0];
  let S=activeCharacter().state;
  const UI={route:location.hash.startsWith('#/pet')?'pet':'home',tab:'collection',search:'',type:'全部',rarity:'全部',ownedOnly:false,showSaveInfo:false,deletePlanId:null,syncGain:S.syncGain, abilityType:'全部',syncType:'綜合',optimizerGoal:'total',optimizerWeights:[1,1,1,1,1,1],optimizerLocked:[false,false,false,false],optimizerResults:null,plannerMode:'recycle',plannerResults:null,profileDialog:null,feedbackOpen:false,importTarget:'current'};
  let toastTimeout;
  const ownedPets = () => G.pets.filter(p=>S.owned.includes(p.id));
  const progressOf = id => S.progress[id] || {sync:null,page:1,stage:1};
  const planOf = () => S.plans.find(p=>p.id===S.activePlan) || S.plans[0];
  const positionOf=(plan,id)=>plan.slots[0]===id?1:plan.slots.slice(1).includes(id)?0.5:0.2;
  const smallPrice=type=>S.prices[type] == null ? null : S.prices[type]/16;
  const materialsFor=(type,page,stage)=>G.materials[type].slice(0,nodeOf(page,stage)).reduce((a,b)=>a+b,0);
  function petCalc(pet,plan, simulated=true, forcedSync=null) {
    const p=progressOf(pet.id);
    const o=simulated ? plan.overrides[pet.id] : null;
    const page=o?.page??p.page, stage=o?.stage??p.stage;
    const sync = forcedSync ?? p.sync;
    if(sync==null||!validatePage(page)||!validateStage(page,stage)||sync>syncCap(pet))return {pet,valid:false,page,stage,sync,reason:sync==null?'請輸入基礎同調':sync>syncCap(pet)?`基礎同調超過${pet.rarity}上限 ${syncCap(pet)}%`:'頁數或階段設定有誤'};
    const n=nodeOf(page,stage);
    const displayedSync = sync/100 + positionOf(plan,pet.id);
    const step=baseStep(pet),first=firstBase(pet.rarity)*displayedSync*(page===1&&stage===0?0:1);
    const a=step*displayedSync*Math.ceil(n/2), b=step*displayedSync*Math.floor(n/2);
    const values=[0,0,0,0,0,0];
    if (pet.type==='防禦') {values[0]=gameTrunc(a);values[1]=gameTrunc(b);values[4]=gameTrunc(first);}
    if (pet.type==='攻擊') {values[2]=gameTrunc(a);values[3]=gameTrunc(b);values[5]=gameTrunc(first);}
    if (pet.type==='輔助') {values[4]=gameTrunc(a);values[5]=gameTrunc(first+b);}
    const materials=materialsFor(pet.type,page,stage),unit=smallPrice(pet.type);
    return {pet,valid:true,page,stage,n,displayedSync,attrs:values,total:values.reduce((a,b)=>a+b,0),materials,cost:materials===0?0:unit==null?null:materials*unit,firstBonus:gameTrunc(first)};
  }
  function calcPlan(plan, simulated=true){
    const items=ownedPets().map(p=>petCalc(p,plan,simulated));
    const valid=items.filter(x=>x.valid), incomplete=items.filter(x=>!x.valid);
    const attrTotals=G.labels.map((_,k)=>valid.reduce((a,x)=>a+x.attrs[k],0));
    const qty=Object.fromEntries(TYPE_ORDER.map(t=>[t,valid.filter(x=>x.pet.type===t).reduce((a,x)=>a+x.materials,0)]));
    const costComplete=!incomplete.length&&TYPE_ORDER.every(t=>qty[t]===0||smallPrice(t)!=null);
    const cost=costComplete?TYPE_ORDER.reduce((a,t)=>a+qty[t]*smallPrice(t),0):null;
    const total=attrTotals.reduce((a,b)=>a+b,0);
    const estimatedCost=TYPE_ORDER.reduce((a,t)=>a+(smallPrice(t)==null?0:qty[t]*smallPrice(t)),0);
    return {items,valid,incomplete,attrs:attrTotals,qty,cost,costComplete,estimatedCost,total,perPercent:cost!=null&&total>0?cost/(total*100):null};
  }
  function save(){
    try{activeCharacter().state=S;localStorage.setItem(PROFILE_SAVE_KEY,JSON.stringify(PROFILES));return true}
    catch{notify('瀏覽器未能儲存資料，建議先匯出備份。',true);return false}
  }
  function notify(msg,warning=false){
    document.querySelector('.toast')?.remove();
    const el=document.createElement('div');el.className='toast'+(warning?' warn':'');el.textContent=msg;document.body.appendChild(el);
    clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.remove(),3600);
  }
  function update(){UI.optimizerResults=null;UI.plannerResults=null;save();render()}
  function pill(text,kind='dim'){return `<span class="pill ${kind}">${safe(text)}</span>`}
  function rarityPill(p){return pill(p.rarity,p.rarity==='奇蹟'?'miracle':p.rarity==='傳說'?'legend':'rare')}
  function typePill(p){return pill(p.type)}
  function petIcon(p){return `<span class="pet-icon ${safe(p.type)}">${G.typeIcons[p.type]}</span>`}
  function petName(id){return petMap[id]?.name??'—'}
  function titleStrip(title,sub,actions=''){return `<div class="page-head"><div><div class="eyebrow">幻獸養成規劃工具 · ${SITE_VERSION}</div><h1>${title}</h1>${sub?`<p class="subline">${sub}</p>`:''}</div>${actions?`<div class="actions-right">${actions}</div>`:''}</div>`}
  function cardTitle(title,sub,action=''){return `<div class="card-hd"><div><h3 class="card-title">${title}</h3>${sub?`<p class="card-sub">${sub}</p>`:''}</div>${action}</div>`}
  function kpi(label,value,hint='',ico='✦',cls=''){return `<div class="stat-tile"><div class="k"><span>${label}</span><span class="glyph">${ico}</span></div><div class="v ${cls}">${value}</div><div class="hint">${hint}</div></div>`}
  function empty(emo,title,body,button=''){return `<div class="empty"><span class="emo">${emo}</span><strong>${title}</strong><p>${body}</p>${button}</div>`}
  function planSwitch(){return `<div class="plan-row"><div class="scenario-tabs">${S.plans.map(p=>`<button data-action="choose-plan" data-plan="${p.id}" class="${planOf().id===p.id?'active':''}">${safe(p.name)}</button>`).join('')}</div><button class="button small" data-action="clone-plan" ${S.plans.length>=10?'disabled':''}>＋ 複製方案</button><button class="button small danger" data-action="delete-plan">${S.plans.length>1?'刪除目前方案':'重設目前方案'}</button></div>`}
  function overallKpis(s){return `<div class="stats-row">${kpi('已持有幻獸',`${S.owned.length} <span style="font-size:14px;color:#8c92a9">/ ${G.pets.length}</span>`,'可隨時加入或取消','🐾')}${kpi('六項屬性合計',pct(s.total),'每隻各項屬性已先截尾','✦','purple')}${kpi('材料晨星估值',s.cost==null?'待補資料':money(s.cost),s.cost==null?'仍可先查看已知屬性':'依三種材料市場行情','💎')}${kpi('每 1% 屬性估值',s.perPercent==null?'—':money(s.perPercent),s.perPercent==null?'需有完整資料':'晨星／百分點','⚖️','teal')}</div>`}
  function collection(){
    const owned=ownedPets(),plan=planOf(),tot=calcPlan(plan);
    const filtered=G.pets.filter(p=>(!UI.search||p.name.includes(UI.search))&&(UI.type==='全部'||p.type===UI.type)&&(UI.rarity==='全部'||p.rarity===UI.rarity)&&(!UI.ownedOnly||S.owned.includes(p.id))).sort((a,b)=>TYPE_ORDER.indexOf(a.type)-TYPE_ORDER.indexOf(b.type));
    const needs=owned.filter(p=>progressOf(p.id).sync==null||progressOf(p.id).sync>syncCap(p)).length;
    const button=`<button class="button small" data-action="demo">✧ 載入既有18隻示範資料</button>`;
    return `${titleStrip('我的幻獸','先選擇你擁有的幻獸，再設定每隻的基礎同調及養成進度。',button)}<div class="character-context"><span>目前角色：<strong>${safe(activeCharacter().name)}</strong>　·　已建立 ${PROFILES.characters.length} 組角色</span><div class="actions-right"><button class="button small" data-action="add-character">＋ 新增角色</button><button class="button small" data-action="rename-character">重新命名</button>${PROFILES.characters.length>1?`<button class="button small danger" data-action="delete-character">刪除目前角色</button>`:''}</div></div>
      <div class="hero"><div><small>YOUR COMPANIONS, YOUR BUILD</small><h2>從自己的幻獸出發，<br>找到最適合的養成配置。</h2><p>不用填寫複雜的試算表。勾選幻獸、輸入三項數據，就能開始試算。</p></div><button class="hero-btn" data-action="go-slots">前往同調配置 ↗</button><div class="hero-icon">✧</div></div>
      <div class="stats-row">${kpi('已持有',`${owned.length} 隻`,'未持有的不會參與計算','🐾','purple')}${kpi('已設定進度',`${owned.length-needs} 隻`,owned.length===0?'尚未開始登錄':needs?`還有 ${needs} 隻基礎同調未填或超過上限`:'全部已完成','✓')}${kpi('圖鑑總數',`${G.pets.length} 隻`,'依現有 V2.4 資料建立','◇')}${kpi('目前方案屬性',pct(tot.total),'已完成設定的幻獸小計','✦','teal')}</div>
      <div class="section-line"><h2>幻獸圖鑑 <span class="small-muted">${filtered.length} 隻</span></h2><div class="actions-right"><button class="button small" data-action="select-all">全選</button><button class="button small" data-action="select-none">全部取消</button></div></div>
      <div class="control-row" style="margin-bottom:15px"><div class="search"><span class="search-icon">⌕</span><input id="pet-search" class="input" placeholder="搜尋幻獸名稱…" value="${safe(UI.search)}" data-action="search-pet" /></div><div class="segmented">${['全部',...TYPE_ORDER].map(t=>`<button data-action="filter-type" data-val="${t}" class="${UI.type===t?'on':''}">${t}</button>`).join('')}</div><select class="select-inline" data-action="filter-rarity"><option value="全部">所有階級</option>${RARITY_ORDER.map(t=>`<option value="${t}" ${UI.rarity===t?'selected':''}>${t}</option>`).join('')}</select><label class="small-muted"><input type="checkbox" data-action="owned-only" ${UI.ownedOnly?'checked':''}/> 只顯示已持有</label></div>
      <div class="catalog">${filtered.map(p=>{let yes=S.owned.includes(p.id);return `<button class="pet-card ${yes?'owned':''}" data-action="toggle-owned" data-id="${p.id}" aria-pressed="${yes}">${petIcon(p)}<div class="pet-meta"><div class="pet-name">${safe(p.name)}</div><div class="pet-tags">${typePill(p)} ${rarityPill(p)}</div></div><span class="pet-check">✓</span></button>`}).join('')||empty('⌕','找不到符合的幻獸','試著清除搜尋或分類條件。')}</div>
      <div class="section-line" id="owned-editor"><h2>我的養成紀錄 <span class="small-muted">${owned.length} 隻</span></h2>${owned.length?'<span class="small-muted">基礎同調請輸入百分點，例如 56 代表 56%</span>':''}</div>
      ${owned.length?`<div class="owned-list">${owned.map(p=>{let x=progressOf(p.id);return `<div class="owned-row" id="pet-editor-${p.id}"><div class="owned-label">${petIcon(p)}<div style="min-width:0"><strong>${safe(p.name)}</strong><span class="secondary">${p.type} · ${p.rarity} · 基礎同調上限 ${syncCap(p)}% ${x.sync==null?'· 尚未設定':x.sync>syncCap(p)?'· ⚠ 超出上限':'· 已設定'}</span></div></div><div class="field"><label>基礎同調 (%) · 最高 ${syncCap(p)}%</label><input data-action="progress" data-id="${p.id}" data-key="sync" class="${x.sync!=null&&x.sync>syncCap(p)?'invalid-sync':''}" type="number" min="0" max="${syncCap(p)}" step="0.1" placeholder="0～${syncCap(p)}" value="${x.sync==null?'':x.sync}" />${x.sync!=null&&x.sync>syncCap(p)?`<small class="sync-warning">已匯入的 ${fmtN.format(x.sync)}% 超過上限 ${syncCap(p)}%，資料已保留，請修正後再計算。</small>`:''}</div><div class="field"><label>能力頁數</label><select data-action="progress" data-id="${p.id}" data-key="page">${pageOptions(x.page)}</select></div><div class="field"><label>強化節點</label><select data-action="progress" data-id="${p.id}" data-key="stage">${stageOptions(x.page,x.stage)}</select></div><button class="button small danger" data-action="toggle-owned" data-id="${p.id}">取消持有</button></div>`}).join('')}</div>`:empty('🐾','還沒有選取幻獸','在上面的圖鑑勾選已擁有的幻獸，就會出現養成輸入欄位。',`<button class="button primary small" data-action="demo">試用示範資料</button>`)}
      <div class="notice good">💡 取消持有不會刪除已輸入的養成數據；重新勾選即可恢復。資料只儲存在這台裝置的瀏覽器中。</div>`;
  }
  function pageOptions(current){return Array.from({length:10},(_,i)=>`<option value="${i+1}" ${current===i+1?'selected':''}>第 ${i+1} 頁</option>`).join('')}
  function stageOptions(page,current){return Array.from({length:page===1?2:3},(_,i)=>`<option value="${i}" ${current===i?'selected':''}>${stageLabel(i)}</option>`).join('')}
  function chooseOpts(plan,slot){
    const current=plan.slots[slot];
    return `<option value="">尚未配置</option>`+ownedPets().filter(p=>p.id===current||!plan.slots.includes(p.id)).map(p=>`<option value="${p.id}" ${p.id===current?'selected':''}>${safe(p.name)}</option>`).join('');
  }
  // 位置最佳化：屬性對每隻幻獸相加，因此先分別計算20/50/100%的精確截尾值，
  // 再枚舉1個100%位置與其他50%位置組合。50%位置順序不改變總收益，故以組合去重。
  // 每次模擬只變更位置；實際/模擬養成進度與材料消耗維持不變。
  function optimizerWeights(){
    const goal=UI.optimizerGoal;
    if(goal==='total')return [1,1,1,1,1,1];
    if(goal==='attack')return [0,0,1,1,0,1];
    if(goal==='defense')return [1,1,0,0,1,0];
    if(goal.startsWith('attr'))return G.labels.map((_,i)=>i===Number(goal.slice(4))?1:0);
    return UI.optimizerWeights.map(x=>Math.max(0,Math.min(10,Number(x)||0)));
  }
  const optGoalOptions=[
    ['total','六項屬性總和最高'],['attack','攻擊優先（會心＋精準＋傷害加成）'],
    ['defense','防禦優先（格擋＋會抗＋傷害抵抗）'],
    ...G.labels.map((name,i)=>['attr'+i,name+'最高']),['custom','自訂六項屬性權重']
  ];
  function optScore(vec,weights){return vec.reduce((sum,v,k)=>sum+v*weights[k],0)}
  function optimizeSlots(plan,options={}){
    const weights=options.weights??optimizerWeights();
    if(!weights.some(x=>x>0))return {error:'請至少設定一項大於零的屬性權重。'};
    const initial=calcPlan(plan,true);
    const locked=(options.locked??UI.optimizerLocked).map((fixed,i)=>fixed?plan.slots[i]:null);
    const usable=ownedPets().filter(p=>petCalc(p,plan,true).valid);
    if(usable.length===0)return {error:'請先勾選幻獸，並輸入有效的基礎同調及養成進度。'};
    const good=new Set(usable.map(p=>p.id));
    if(locked.some(id=>id&&!good.has(id)))return {error:'已鎖定的位置含資料不完整的幻獸，請先修正養成資料或解除鎖定。'};
    const lookup={};const base=Array(6).fill(0);
    for(const pet of usable){
      const attrs=(position)=>{
        const preview={...plan,slots:position===1?[pet.id,null,null,null]:position===.5?[null,pet.id,null,null]:[null,null,null,null]};
        return petCalc(pet,preview,true).attrs;
      };
      const at20=attrs(.2),at50=attrs(.5),at100=attrs(1);
      at20.forEach((v,k)=>base[k]+=v);
      lookup[pet.id]={at20,at50,at100,delta50:at50.map((v,k)=>v-at20[k]),delta100:at100.map((v,k)=>v-at20[k])};
    }
    const locked50=locked.slice(1).filter(Boolean);
    const count50=Math.min(3,usable.length-1);
    if(locked50.length>count50)return {error:'鎖定的50%幻獸數量超過可用的位置，請解除部分鎖定。'};
    const primaryIds=locked[0]?[locked[0]]:usable.map(p=>p.id);
    const availableIds=usable.map(p=>p.id);
    const results=[];let examined=0;
    const nowKey=plan.slots[0]+'|'+plan.slots.slice(1).filter(Boolean).sort().join('|');
    function record(primary,other){
      const position=[primary,null,null,null];let ix=0;
      for(let k=1;k<=3;k++)if(locked[k])position[k]=locked[k];
      for(let k=1;k<=3;k++)if(!position[k]&&ix<other.length)position[k]=other[ix++];
      const v=base.map((b,k)=>b+lookup[primary].delta100[k]);
      for(const id of [...locked50,...other])lookup[id].delta50.forEach((d,k)=>v[k]+=d);
      const score=optScore(v,weights);const total=v.reduce((a,b)=>a+b,0);
      // 相同得分時優先與目前配置最接近的結果，避免不必要的幻獸調整。
      const same=position[0]===plan.slots[0]?1:0;
      const overlap=position.slice(1).filter(id=>id&&plan.slots.slice(1).includes(id)).length;
      const candidate={slots:position,attrs:v,total,score,same:same+overlap,changed:nowKey!==position[0]+'|'+position.slice(1).filter(Boolean).sort().join('|')};
      results.push(candidate);examined++;
      results.sort((a,b)=>b.score-a.score||b.total-a.total||b.same-a.same||a.slots.join('|').localeCompare(b.slots.join('|'),'zh-Hant'));
      if(results.length>3)results.pop();
    }
    function choose(primary,options,left,chosen=[],start=0){
      if(left===0){record(primary,chosen);return}
      for(let i=start;i<=options.length-left;i++)choose(primary,options,left-1,[...chosen,options[i]],i+1);
    }
    for(const primary of primaryIds){
      if(locked50.includes(primary))continue;
      const options=availableIds.filter(id=>id!==primary&&!locked50.includes(id));
      choose(primary,options,count50-locked50.length);
    }
    if(!results.length)return {error:'目前的鎖定條件沒有可行配置，請解除部分鎖定。'};
    return {results,examined,weights,current:initial,goal:optGoalOptions.find(([id])=>id===UI.optimizerGoal)?.[1]||'屬性最佳化'};
  }
  function optimizerPanel(plan,current){
    const run=UI.optimizerResults;
    return `<section class="optimizer card" id="optimizer-panel">
      <div class="card-hd"><div><span class="analysis-step">V1.8 · 最佳化工具</span><h3 class="card-title" style="margin-top:9px">✦ 一鍵尋找最佳同調配置</h3><p class="card-sub">比較所有可行的100%＋50%位置組合，使用實際遊戲屬性截尾值。只調整位置，不增加材料或幻獸碎片消耗。</p></div></div>
      <div class="opt-controls">
        <div class="field"><label for="optimizer-goal">最佳化目標</label><select id="optimizer-goal" data-action="optimizer-goal">${optGoalOptions.map(([id,label])=>`<option value="${id}" ${id===UI.optimizerGoal?'selected':''}>${safe(label)}</option>`).join('')}</select></div>
        <div class="opt-action-col"><button class="button primary" data-action="run-optimizer">✧ 搜尋最佳配置</button><span class="small-muted">最多比較全部有效組合；結果不會自動覆蓋方案。</span></div>
      </div>
      ${UI.optimizerGoal==='custom'?`<div class="opt-weight-grid">${G.labels.map((label,k)=>`<div class="field"><label>${label}權重</label><input type="number" min="0" max="10" step="0.5" data-action="optimizer-weight" data-index="${k}" value="${safe(UI.optimizerWeights[k])}"/></div>`).join('')}</div><div class="small-muted">權重範圍0～10；至少一項大於0。這是偏好權重，不代表材料消耗。</div>`:''}
      <div class="opt-lock-head"><strong>鎖定目前位置（選用）</strong><button class="button xsmall" data-action="optimizer-unlock">全部解除鎖定</button></div>
      <div class="opt-lock-grid">${plan.slots.map((id,i)=>`<label class="opt-lock"><input type="checkbox" data-action="optimizer-lock" data-index="${i}" ${UI.optimizerLocked[i]&&id?'checked':''} ${!id?'disabled':''}/><span class="opt-lock-pos">${i===0?'100%':`50% ${i}`}</span><span>${id?safe(petName(id)):'尚未配置'}</span></label>`).join('')}</div>
      ${run?.error?`<div class="notice" role="alert">⚠ ${safe(run.error)}</div>`:''}
      ${run?.results?`<div class="opt-summary"><div><span class="small-muted">已完整比較</span><strong>${fmtInt.format(run.examined)} 種有效組合</strong></div><div><span class="small-muted">最佳化目標</span><strong>${safe(run.goal)}</strong></div><div><span class="small-muted">目前六項總和</span><strong>${pct(current.total)}</strong></div></div>
      <div class="opt-results">${run.results.map((r,i)=>`<div class="opt-result ${i===0?'best':''}">
        <div class="opt-result-head"><div><span class="opt-rank">${i===0?'★ 第一名':`第 ${i+1} 名`}</span>${r.changed?pill('推薦調整','legend'):pill('目前已是此配置','ok')}</div><div class="opt-result-value"><strong>${pct(r.total)}</strong><small>六項屬性總和／差異 ${numberDelta(r.total-current.total,true)}</small></div></div>
        <div class="opt-position-line"><span class="opt-big-slot">♛ 100%｜${safe(petName(r.slots[0]))}</span><span>50%｜${r.slots.slice(1).filter(Boolean).map(petName).map(safe).join('、')||'—'}</span></div>
        <div class="opt-goal-caption">目標加權分數 ${pct(r.score)} ／ 與現有目標差異 ${numberDelta(r.score-optScore(current.attrs,run.weights),true)}</div>
        <div class="opt-diff-grid">${G.labels.map((name,k)=>`<div><span>${safe(name)}</span><strong class="${r.attrs[k]-current.attrs[k]>=0?'up':'down'}">${numberDelta(r.attrs[k]-current.attrs[k],true)}</strong></div>`).join('')}</div>
        <div class="opt-result-actions"><button class="button ${i===0?'primary':''}" data-action="optimizer-apply" data-index="${i}" ${S.plans.length>=10?'disabled':''}>＋ 套用為新方案</button><span class="small-muted">保留目前方案；會複製目前的養成模擬設定。</span></div>
      </div>`).join('')}</div>`:''}
      <p class="small-muted" style="margin:16px 0 0">※ 推薦基於已持有且資料有效的幻獸。缺少養成資料的幻獸不參與位置搜尋；本次只調整同調位置，材料累積量不變。若持有少於4隻，未用完的位置自動保持空白。</p>
    </section>`;
  }
  function slots(){
    const plan=planOf(),s=calcPlan(plan),pool=ownedPets().filter(p=>!plan.slots.includes(p.id));
    return `${titleStrip('同調配置','1 個 100% 位置、3 個 50% 位置；其他持有幻獸自動享有 20% 位置同調。')} ${planSwitch()}
     ${!S.owned.length?empty('👑','先選擇你的幻獸','尚未持有任何幻獸，前往「我的幻獸」勾選後就能配置同調位置。',`<button class="button primary" data-action="go-collection">選擇我的幻獸</button>`):`<div class="split"><div class="card">${cardTitle('高同調位置','不會出現重複幻獸；選單只提供已持有的幻獸。')}
        <div class="slot-panel">${plan.slots.map((id,i)=>`<div class="slot ${i===0?'main-slot':''}"><div class="slot-bubble">${i===0?'♛':'50'}</div><div class="slot-body"><div class="slot-title">${i===0?'100% 同調位置':`50% 同調位置 ${i}`}</div><select data-action="set-slot" data-slot="${i}">${chooseOpts(plan,i)}</select></div></div>`).join('')}</div>
        <div class="divider"></div><div class="status-line"><strong>其餘幻獸：20% 同調</strong>${pill(`${pool.length} 隻`,'legend')}</div><div class="pool" style="margin-top:14px">${pool.length?pool.map(p=>`<span>${G.typeIcons[p.type]} ${safe(p.name)}</span>`).join(''):'<span>目前沒有其他幻獸</span>'}</div>
       </div><div style="display:grid;gap:17px;align-content:start"><div class="card">${cardTitle('目前配置收益','依已持有、已完成設定的幻獸計算。')}${meter(s.attrs)}</div>
       <div class="card ink"><div class="card-title">配置摘要</div><p class="card-sub">這份方案的六項屬性總和</p><div style="font-size:35px;font-weight:900;margin-top:12px">${pct(s.total)}</div><p style="font-size:12px;color:#cbc9eb;margin-top:11px">材料晨星估值：${s.cost==null?'待補資料':money(s.cost)}</p><button style="margin-top:13px" class="button wide" data-action="go-simulation">查看養成模擬 ↗</button></div></div></div>${optimizerPanel(plan,s)}`}`;
  }
  function meter(attrs){const max=Math.max(...attrs,0.0001);return `<div class="meter">${attrs.map((val,i)=>`<div class="meter-item"><span class="stat-name">${G.labels[i]}</span><span class="track"><span class="bar" style="display:block;width:${(val/max*100).toFixed(2)}%"></span></span><span class="stat-value">${pct(val)}</span></div>`).join('')}</div>`}
  // V1.9: 材料全數回收後依類型獨立進行整數多重選擇背包最佳化。
  // 與位置搜尋交替改善：此為多起點迭代搜尋，不宣稱已證明全域最優。
  const allProgressNodes=Array.from({length:19},(_,n)=>n===0?{page:1,stage:1,node:0}:{page:2+Math.floor((n-1)/2),stage:n%2?1:2,node:n});
  const gcd=(a,b)=>b?gcd(b,a%b):a;
  function statsForNode(pet,sync,bonus,node){
    const p=allProgressNodes[node],value=sync/100+bonus,step=baseStep(pet),intro=firstBase(pet.rarity)*value;
    const n=node,a=step*value*Math.ceil(n/2),b=step*value*Math.floor(n/2);
    const attrs=[0,0,0,0,0,0];
    if(pet.type==='防禦'){attrs[0]=gameTrunc(a);attrs[1]=gameTrunc(b);attrs[4]=gameTrunc(intro)}
    else if(pet.type==='攻擊'){attrs[2]=gameTrunc(a);attrs[3]=gameTrunc(b);attrs[5]=gameTrunc(intro)}
    else {attrs[4]=gameTrunc(a);attrs[5]=gameTrunc(intro+b)}
    return attrs;
  }
  const materialPrefix=Object.fromEntries(TYPE_ORDER.map(t=>[t,[0,...G.materials[t].map((_,n)=>G.materials[t].slice(0,n+1).reduce((a,b)=>a+b,0))]]));
  function materialPool(){
    const used=Object.fromEntries(TYPE_ORDER.map(t=>[t,0]));
    for(const pet of ownedPets()){
      const p=progressOf(pet.id);if(validatePage(p.page)&&validateStage(p.page,p.stage))used[pet.type]+=materialPrefix[pet.type][nodeOf(p.page,p.stage)];
    }
    const backpack=Object.fromEntries(TYPE_ORDER.map(t=>[t,Math.max(0,Math.floor(S.backpack?.[t]||0))]));
    const budget=Object.fromEntries(TYPE_ORDER.map(t=>[t,used[t]+backpack[t]]));
    return {used,backpack,budget};
  }
  function newPlanFromProgress(reference,chosen,slots){
    const q={id:'PREVIEW',name:'試算',slots:[...slots],overrides:{}};
    for(const pet of ownedPets()){
      const node=chosen[pet.id];
      if(node==null)continue;
      const target=allProgressNodes[node],actual=progressOf(pet.id);
      if(target.page!==actual.page||target.stage!==actual.stage)q.overrides[pet.id]={page:target.page,stage:target.stage};
    }
    return q;
  }
  function allocationForSlots(slots,weights,pool,mode){
    const choice={};let groups=[];
    for(const type of TYPE_ORDER){
      const pets=ownedPets().filter(p=>p.type===type);
      if(!pets.length)continue;
      const budget=pool.budget[type];
      const cost=materialPrefix[type];
      if(budget>=cost[18]*pets.length){for(const pet of pets)choice[pet.id]=18;groups.push(type);continue;}
      let unit=cost.slice(1).reduce((g,n)=>gcd(g,n),0)||1;
      const cap=Math.floor(Math.min(budget,cost[18]*pets.length)/unit);
      let dp=new Float64Array(cap+1);dp.fill(-Infinity);dp[0]=0;
      const parents=[];
      for(const pet of pets){
        const pos=slots[0]===pet.id?1:slots.slice(1).includes(pet.id)?.5:.2;
        const actual=progressOf(pet.id),minNode=mode==='keep'?nodeOf(actual.page,actual.stage):0;
        const options=[];
        for(let node=minNode;node<=18;node++){
          const attrs=statsForNode(pet,actual.sync,pos,node);
          options.push({node,cost:cost[node]/unit,score:optScore(attrs,weights)+attrs.reduce((a,b)=>a+b,0)*1e-6});
        }
        const next=new Float64Array(cap+1);next.fill(-Infinity);
        const previous=new Int32Array(cap+1);previous.fill(-1);
        const selected=new Uint8Array(cap+1);selected.fill(255);
        for(let k=0;k<=cap;k++){
          if(!Number.isFinite(dp[k]))continue;
          for(const o of options){
            const dest=k+o.cost;if(dest>cap)break;
            const val=dp[k]+o.score;
            if(val>next[dest]+1e-12){next[dest]=val;previous[dest]=k;selected[dest]=o.node}
          }
        }
        dp=next;parents.push({pet,previous,selected});
      }
      let best=-Infinity,bestIndex=0;
      for(let k=0;k<=cap;k++)if(dp[k]>best+1e-12){best=dp[k];bestIndex=k;}
      if(!Number.isFinite(best))return {error:`${type}材料不足以維持目前選定的節點；請增加背包數量或改用全數退回模式。`};
      for(let j=parents.length-1;j>=0;j--){
        const {pet,previous,selected}=parents[j];const node=selected[bestIndex];
        if(node===255)return {error:'材料路徑回推失敗，請重新計算。'};
        choice[pet.id]=node;bestIndex=previous[bestIndex];
      }
      groups.push(type);
    }
    return {choice,groups};
  }
  function resultFromPlan(plan,source,weights,pool){
    const calc=calcPlan(plan,true);
    const valid=TYPE_ORDER.every(t=>calc.qty[t]<=pool.budget[t]+1e-7);
    return {slots:[...plan.slots],overrides:structuredClone(plan.overrides),attrs:calc.attrs,total:calc.total,
      score:optScore(calc.attrs,weights),qty:calc.qty,valid,delta:calc.total-source.total};
  }
  function runJointPlanner(source){
    const weights=optimizerWeights(),pets=ownedPets();
    if(!weights.some(x=>x>0))return {error:'請至少指定一項大於0的屬性權重。'};
    if(!pets.length)return {error:'請先在「我的幻獸」勾選持有幻獸。'};
    if(pets.some(p=>!petCalc(p,source,false).valid))return {error:'部分幻獸的基礎同調或實際進度資料不完整，請先修正。'};
    const pool=materialPool();
    const initial=calcPlan(source,false);
    const seeds=[source.slots];
    const existing=optimizeSlots(source,{weights,locked:UI.optimizerLocked});
    if(existing.results?.length)seeds.push(existing.results[0].slots);
    // 第三起點：以全部養滿時的屬性效益找同調位置，降低陷入局部最佳的機率。
    const allMax={...source,overrides:Object.fromEntries(pets.map(p=>[p.id,{page:10,stage:2}]))};
    const maximal=optimizeSlots(allMax,{weights,locked:UI.optimizerLocked});
    if(maximal.results?.length)seeds.push(maximal.results[0].slots);
    const seenSeeds=new Set(),candidates=new Map();let rounds=0;
    for(const initialSlots of seeds){
      const key=initialSlots.join('|');if(seenSeeds.has(key))continue;seenSeeds.add(key);
      let slots=[...initialSlots],oldKey='';
      for(let pass=0;pass<4;pass++){
        const alloc=allocationForSlots(slots,weights,pool,UI.plannerMode);
        if(alloc.error)return {error:alloc.error};
        const preview=newPlanFromProgress(source,alloc.choice,slots);
        const bestPositions=optimizeSlots(preview,{weights,locked:UI.optimizerLocked});
        if(bestPositions.error)return {error:bestPositions.error};
        for(const option of bestPositions.results){
          const updated={...preview,slots:[...option.slots]};
          const result=resultFromPlan(updated,initial,weights,pool);
          if(!result.valid)continue;
          const signature=option.slots[0]+'|'+option.slots.slice(1).filter(Boolean).sort().join('|')+'|'+JSON.stringify(alloc.choice);
          const old=candidates.get(signature);if(!old||result.score>old.score+1e-10)candidates.set(signature,result);
        }
        rounds++;
        const nextSlots=bestPositions.results[0].slots;
        const fingerprint=nextSlots[0]+'|'+nextSlots.slice(1).filter(Boolean).sort().join('|')+'|'+JSON.stringify(alloc.choice);
        if(fingerprint===oldKey)break;
        oldKey=fingerprint;slots=[...nextSlots];
      }
    }
    const results=[...candidates.values()].sort((a,b)=>b.score-a.score||b.total-a.total||a.slots.join('|').localeCompare(b.slots.join('|'),'zh-Hant')).slice(0,3);
    if(!results.length)return {error:'沒有找到符合材料與鎖定位置限制的候選配置。'};
    return {results,pool,initial,weights,rounds,mode:UI.plannerMode};
  }
  function plannerPanel(source){
    const pool=materialPool(),run=UI.plannerResults;
    return `<section id="joint-planner" class="card joint-planner">
      ${cardTitle('✦ 整體養成最佳化 V1.9','能力頁數材料可全數退回；以同類材料池重新分配，再反覆搜尋最佳同調位置。基礎同調與幻獸碎片保持原值。')}
      <div class="planning-method"><label class="field"><span>資源分配模式</span><select data-action="planner-mode"><option value="recycle" ${UI.plannerMode==='recycle'?'selected':''}>全部退回重分配（預設）</option><option value="keep" ${UI.plannerMode==='keep'?'selected':''}>保留目前節點，只能往上</option></select></label>
        <label class="field"><span>最佳化目標</span><select data-action="planner-goal">${optGoalOptions.map(([id,label])=>`<option value="${id}" ${UI.optimizerGoal===id?'selected':''}>${safe(label)}</option>`).join('')}</select></label></div>
      ${UI.optimizerGoal==='custom'?`<div class="opt-weight-grid">${G.labels.map((n,k)=>`<label class="field">${n}<input type="number" min="0" max="10" step="0.5" data-action="optimizer-weight" data-index="${k}" value="${UI.optimizerWeights[k]}"/></label>`).join('')}</div>`:''}
      <div class="section-line"><h2>① 三類材料預算</h2><small>目前已投入可100%退回，背包數量需自行輸入</small></div>
      <div class="planner-budget">${TYPE_ORDER.map(t=>`<div class="budget-card"><strong>${G.typeIcons[t]} ${G.materialNames[t]}</strong><p>已投入 <b>${fmtInt.format(pool.used[t])}</b></p><div class="field"><label>背包剩餘（小材料）</label><input type="number" data-action="backpack" data-type="${t}" min="0" step="1" value="${pool.backpack[t]}"/></div><p class="budget-sum">可分配 ${fmtInt.format(pool.budget[t])}</p></div>`).join('')}</div>
      <div class="control-row" style="margin-top:15px"><button class="button primary" data-action="run-joint-planner">♛ 搜尋能力＋位置最佳方案</button><span class="small-muted">沿用「同調配置」的固定位置設定；不會更動實際養成資料。</span></div>
      <p class="small-muted" style="margin:11px 0">方法：各類材料使用離散節點預算最佳化，再與位置搜尋交替改善、多起點比較。結果為迭代搜尋候選最佳，不保證數學全域最優。</p>
      ${run?.error?`<div class="notice" role="alert">⚠ ${safe(run.error)}</div>`:''}
      ${run?.results?`<div class="section-line"><h2>② 能力頁數＋同調配置候選前三名</h2><small>共 ${run.rounds} 次迭代改善</small></div>
        ${run.results.map((r,i)=>`<div class="planning-result"><div class="status-line"><strong>${i===0?'★ 第一名':`第 ${i+1} 名`}　六項合計 ${pct(r.total)}</strong><b class="${r.delta>=0?'up':'down'}">與目前實際 ${numberDelta(r.delta,true)}</b></div>
          <p class="small-muted">100% ${safe(petName(r.slots[0]))} ／ 50% ${r.slots.slice(1).filter(Boolean).map(id=>safe(petName(id))).join('、')||'—'} ／ 目標分數 ${pct(r.score)}</p>
          <div class="budget-chips">${TYPE_ORDER.map(t=>`<span>${G.materialNames[t]} ${fmtInt.format(r.qty[t])} / ${fmtInt.format(run.pool.budget[t])}（餘 ${fmtInt.format(run.pool.budget[t]-r.qty[t])}）</span>`).join('')}</div>
          <details ${i===0?'open':''}><summary>查看每隻幻獸的推薦能力頁數及材料變動</summary><div class="scroll-table"><table class="plan-table"><thead><tr><th>幻獸</th><th>類型</th><th>原進度</th><th>推薦進度</th><th>材料差額</th></tr></thead><tbody>${ownedPets().map(p=>{const real=progressOf(p.id),x=r.overrides[p.id]??real;const diff=materialsFor(p.type,x.page,x.stage)-materialsFor(p.type,real.page,real.stage);return `<tr><td>${safe(p.name)}</td><td>${p.type}</td><td>${progressLabel(real.page,real.stage)}</td><td>${progressLabel(x.page,x.stage)}</td><td class="${diff<0?'up':diff>0?'down':''}">${diff>0?'+':''}${fmtInt.format(diff)} ${diff<0?'（退回）':''}</td></tr>`}).join('')}</tbody></table></div></details>
          <div class="opt-diff-grid">${G.labels.map((n,k)=>`<div><span>${n}</span><strong class="${r.attrs[k]-run.initial.attrs[k]>=-1e-10?'up':'down'}">${numberDelta(r.attrs[k]-run.initial.attrs[k],true)}</strong></div>`).join('')}</div>
          <button class="button ${i===0?'primary':''}" data-action="apply-joint-plan" data-index="${i}" ${S.plans.length>=10?'disabled':''}>＋ 選定此方案，進入後續推薦</button>
        </div>`).join('')}`:''}
    </section>`;
  }
  function path(){
    const plan=planOf(),stats=calcPlan(plan,true),pool=materialPool(),rank=recommendations(plan),syncRank=syncRecommendations(plan,UI.syncGain);
    return `${titleStrip('後續提升推薦','以你最後選定的能力養成進度及同調位置為基礎，決定下一筆資源該如何投入。')}${planSwitch()}
      <div class="notice">目前顯示「${safe(plan.name)}」。如需先重新分配所有小材料，請至「養成規劃」執行最佳化並選用方案。基礎同調需要同名碎片，與三類小材料分開評估。</div>
      <div class="stats-row">${kpi('選定方案六項屬性',pct(stats.total),'以模擬節點及位置計算','✦','purple')}${kpi('小雞蛋可剩餘',fmtInt.format(pool.budget['防禦']-stats.qty['防禦']),'含退回與背包存量','🛡️')}${kpi('小羽毛可剩餘',fmtInt.format(pool.budget['攻擊']-stats.qty['攻擊']),'含退回與背包存量','⚔️')}${kpi('小精油可剩餘',fmtInt.format(pool.budget['輔助']-stats.qty['輔助']),'含退回與背包存量','✨')}</div>
      <div class="section-line"><h2>③ 下一步能力頁數提升</h2><small>三種材料分組，依小材料／1%屬性排行</small></div>
      <div class="planner-next-grid">${TYPE_ORDER.map(t=>{const list=rank.filter(x=>x.pet.type===t);const available=pool.budget[t]-stats.qty[t];return `<div class="card">${cardTitle(`${G.typeIcons[t]} ${t}型｜${G.materialNames[t]}`,`剩餘 ${fmtInt.format(available)} 個小材料`)}${list.length?list.slice(0,5).map((x,i)=>`<div class="next-item"><strong>${i+1}. ${safe(x.pet.name)}</strong><span>${progressLabel(x.from.page,x.from.stage)} → ${progressLabel(x.next.page,x.next.stage)}</span><span>需 ${fmtInt.format(x.extraMat)} 個／屬性 ${numberDelta(x.benefit,true)} ${x.extraMat<=available?pill('材料足夠','ok'):pill('材料不足','warn')}</span></div>`).join(''):empty('✓','沒有可見增益節點','這個類型目前沒有符合條件的下一階。')}</div>`}).join('')}</div>
      <div class="section-line"><h2>④ 下一步基礎同調提升</h2><small>同名幻獸碎片；預計 +${fmtN.format(UI.syncGain)} 個百分點</small></div>
      <div class="card"><div class="control-row" style="margin-bottom:12px">${analysisTypeSelect('analysis-sync-type',UI.syncType)}<button class="button small" data-action="go-analysis">查看完整屬性效益</button></div>${(UI.syncType==='綜合'?syncRank:syncRank.filter(x=>UI.syncType==='全部'||x.pet.type===UI.syncType)).slice(0,9).map((r,i)=>`<div class="next-item"><strong>${i+1}. ${safe(r.pet.name)} ${typePill(r.pet)}</strong><span>${fmtN.format(r.before)}% → ${fmtN.format(r.afterSync)}%；實際提升 ${fmtN.format(r.actualGain)} 個百分點</span><span class="up">六項屬性增加 ${numberDelta(r.extra,true)}</span></div>`).join('')||'<p class="small-muted">目前無符合篩選條件的幻獸。</p>'}<p class="small-muted" style="margin-top:12px">※ 未有各隻幻獸的碎片消耗量資料，故此處只依實際屬性收益排名，不稱為碎片CP值。</p></div>`;
  }
  function simulation(){
    const plan=planOf(),sim=calcPlan(plan),actual=calcPlan(plan,false);
    const changed=ownedPets().filter(p=>plan.overrides[p.id]).length;
    return `${titleStrip('養成規劃','小材料可100%退回重新分配，並同時尋找合適的同調位置；原始進度不會被修改。')} ${planSwitch()}
    ${plannerPanel(plan)}
    ${!S.owned.length?empty('🔮','先選擇你的幻獸','建立持有清單後，就能模擬不同的養成進度。',`<button class="button primary" data-action="go-collection">選擇我的幻獸</button>`):`<div class="stats-row">${kpi('模擬六項屬性',pct(sim.total),'目前方案總屬性','✦','purple')}${kpi('相對實際增益',numberDelta(sim.total-actual.total,true),'可降低養成階段比較','↗','teal')}${kpi('模擬晨星估值',sim.cost==null?'待補資料':money(sim.cost),'所有持有幻獸的累積估值','💎')}${kpi('額外材料估值',sim.cost!=null&&actual.cost!=null?numberDelta(sim.cost-actual.cost):'待補資料','模擬結果減實際養成','◈')}</div>
    <div class="section-line"><h2>各幻獸養成試算</h2><div class="actions-right"><span class="small-muted">已覆寫 ${changed} 隻</span><button class="button small" data-action="reset-overrides">清空本方案模擬</button></div></div>
    <div class="sim-list">${ownedPets().map(p=>{const actualPet=petCalc(p,plan,false),petSim=petCalc(p,plan,true),o=plan.overrides[p.id],pr=progressOf(p.id);return `<div class="sim-row"><div class="sim-upper"><div class="owned-label">${petIcon(p)}<div><strong>${safe(p.name)}</strong><span class="secondary">${p.type} · ${p.rarity} · 實際 ${progressLabel(pr.page,pr.stage)}</span></div></div><div class="control-row">${o?pill('模擬中','legend'):pill('沿用實際','dim')} ${o?`<button class="button xsmall" data-action="clear-override" data-id="${p.id}">還原</button>`:''}</div></div>
    <div class="sim-details"><div class="sim-inputs"><div class="field"><label>模擬能力頁數</label><select data-action="override" data-key="page" data-id="${p.id}">${pageOptions(o?.page??pr.page)}</select></div><div class="field"><label>模擬強化節點</label><select data-action="override" data-key="stage" data-id="${p.id}">${stageOptions(o?.page??pr.page,o?.stage??pr.stage)}</select></div></div>
    <div class="sim-result"><div><div class="tiny">六項屬性合計</div><div class="big">${petSim.valid?pct(petSim.total):'請先輸入同調'}</div></div><div class="sim-delta ${petSim.valid&&actualPet.valid&&petSim.total<actualPet.total?'down':''}">${petSim.valid&&actualPet.valid?numberDelta(petSim.total-actualPet.total,true):'—'}</div></div>
    <div class="sim-result"><div><div class="tiny">累積小材料</div><div class="big">${petSim.valid?money(petSim.materials):'—'}</div></div><div class="sim-delta ${petSim.valid&&actualPet.valid&&petSim.materials<actualPet.materials?'down':''}">${petSim.valid&&actualPet.valid?numberDelta(petSim.materials-actualPet.materials):'—'}</div></div>
    <div class="sim-result"><div><div class="tiny">晨星估值</div><div class="big">${petSim.cost==null?'—':money(petSim.cost)}</div></div><div class="sim-delta ${petSim.cost!=null&&actualPet.cost!=null&&petSim.cost<actualPet.cost?'down':''}">${petSim.cost!=null&&actualPet.cost!=null?numberDelta(petSim.cost-actualPet.cost):'—'}</div></div></div></div>`}).join('')}</div><div class="notice">※ 材料與晨星估值為所有已完成養成的累積量；「差額」才是相較目前實際進度額外需要的數量。本遊戲能力頁數材料可全數退回，負值表示可回收的同類小材料；基礎同調不隨能力重置。</div>`}`;
  }
  // 能力頁數推薦僅使用該類型的「小材料／增加 1% 屬性」衡量。
  // 不把雞蛋、羽毛、精油直接當作同一種資源，也不將晨星行情誤作實際消耗。
  function recommendations(plan){
    return ownedPets().map(p=>{
      const cur=petCalc(p,plan,true);
      if(!cur.valid)return null;
      const next=nextProgress(cur.page,cur.stage);
      if(!next)return null;
      const tempPlan={...plan,overrides:{...plan.overrides,[p.id]:next}};
      const nextVal=petCalc(p,tempPlan,true);
      const extraMat=nextVal.materials-cur.materials;
      const extraCost=nextVal.cost!=null&&cur.cost!=null?nextVal.cost-cur.cost:null;
      const benefit=nextVal.total-cur.total;
      return {pet:p,from:cur,next,extraMat,extraCost,benefit,
        materialPerPoint:benefit>1e-10?extraMat/(benefit*100):null,
        eff:benefit>1e-10&&extraCost!=null?extraCost/(benefit*100):null};
    }).filter(x=>x&&x.benefit>1e-10&&x.extraMat>=0)
      .sort((a,b)=>a.materialPerPoint-b.materialPerPoint || b.benefit-a.benefit || a.pet.name.localeCompare(b.pet.name,'zh-TW'));
  }
  function analysisTypeSelect(action,current){
    const opts = action==='analysis-sync-type'
      ? [['綜合','全部類型（綜合排行）'],['全部','全部類型（分組推薦）'],['攻擊','攻擊型幻獸'],['防禦','防禦型幻獸'],['輔助','輔助型幻獸']]
      : [['全部','全部類型（分組推薦）'],['攻擊','攻擊型幻獸'],['防禦','防禦型幻獸'],['輔助','輔助型幻獸']];
    return `<div class="field analysis-filter"><label>篩選幻獸類型</label><select data-action="${action}" aria-label="篩選幻獸類型">
      ${opts.map(([value,label])=>`<option value="${value}" ${current===value?'selected':''}>${label}</option>`).join('')}
      </select></div>`;
  }
  function abilityRecommendationPanel(plan){
    const ranking=recommendations(plan);
    const groups=UI.abilityType==='全部'?['攻擊','防禦','輔助']:[UI.abilityType];
    return `<section class="analysis-section ability-section" id="ability-recommendations">
      <div class="analysis-section-head"><div><span class="analysis-step">養成建議 01</span><h2>⬡ 能力頁數提升推薦</h2><p>使用 ${G.materialNames['防禦']}、${G.materialNames['攻擊']}、${G.materialNames['輔助']} 強化能力頁數，依各類型的小材料／1% 屬性增益排序。</p></div>
      ${analysisTypeSelect('analysis-ability-type',UI.abilityType)}</div>
      <div class="type-groups">${groups.map(t=>{
        const rows=ranking.filter(x=>x.pet.type===t),best=rows[0],label=G.materialNames[t];
        return `<section class="type-group" data-type="${t}">
          <div class="type-group-head"><div><span class="type-glyph">${G.typeIcons[t]}</span><div><h3>${t}型幻獸</h3><span>${label} · 每 1 大材料 = 16 小材料</span></div></div><span class="type-count">可比較 ${rows.length} 隻</span></div>
          ${best?`<div class="reco-best"><div><span class="mini-kicker">本類最推薦</span><div class="reco-pet">${petIcon(best.pet)}<div><strong>${safe(best.pet.name)}</strong><small>${safe(best.pet.rarity)} · ${progressLabel(best.from.page,best.from.stage)} → ${progressLabel(best.next.page,best.next.stage)}</small></div></div></div><div class="reco-best-score"><span>每增加 1% 屬性需要</span><strong>${money(best.materialPerPoint)}</strong><small>${label}（小材料）</small></div></div>`:''}
          ${rows.length?`<div class="ability-rank-list">${rows.map((r,i)=>`<div class="ability-rank-row"><span class="mini-rank">${i+1}</span><div class="ability-rank-name"><strong>${safe(r.pet.name)}</strong><small>下一步 ${progressLabel(r.next.page,r.next.stage)}</small></div><div><small>屬性增益</small><strong class="gain">${numberDelta(r.benefit,true)}</strong></div><div><small>需要${label}</small><strong>${fmtInt.format(r.extraMat)} 小</strong></div><div><small>小材料／1%</small><strong>${money(r.materialPerPoint)}</strong></div><div><small>晨星估值</small><strong>${money(r.extraCost)}</strong></div></div>`).join('')}</div>`:empty('◇','目前沒有可推薦的提升','請先勾選此類型幻獸、設定有效的養成資料；已滿階或沒有可見屬性提升者不列入。')}
        </section>`;
      }).join('')}</div>
      <p class="analysis-disclaimer">※ 排名以各類型「小材料需求量 ÷ 實際增加的屬性百分點」比較；不同種類材料不直接混合排名。晨星僅為行情估值。如果下一階不增加可見屬性，該階段不列入推薦。</p>
    </section>`;
  }
  // 基礎同調提升建議：在相同位置、頁數與節點下，只改變一隻幻獸的基礎同調。
  // 成長屬性必須先經 gameTrunc（遊戲無條件捨去），再計算真正顯示的提升。
  function syncRecommendations(plan,gain){
    return ownedPets().map(p=>{
      const prog=progressOf(p.id);
      const current=petCalc(p,plan,true);
      if(!current.valid || prog.sync==null)return null;
      const cap=syncCap(p);
      const remaining=Math.max(0,cap-prog.sync);
      if(remaining<1e-9)return null;
      // 計算「提升後基礎同調」時只在觸及階級上限才縮減。
      // 例如凱爾斯原42%，提升12個百分點，應得到54%（不是52%）。
      const afterSync=Math.min(cap,prog.sync+gain);
      const actualGain=Math.max(0,afterSync-prog.sync);
      const after=petCalc(p,plan,true,afterSync);
      if(!after.valid)return null;
      const changes=G.labels.map((_,i)=>Math.max(0,after.attrs[i]-current.attrs[i]));
      const extra=changes.reduce((a,b)=>a+b,0);
      return {pet:p,before:prog.sync,afterSync,actualGain,remaining,capped:actualGain<gain-1e-9,position:positionOf(plan,p.id),
        page:current.page,stage:current.stage,changes,extra};
    }).filter(Boolean).sort((a,b)=> b.extra-a.extra || b.page-a.page || a.pet.name.localeCompare(b.pet.name,'zh-TW'));
  }
  function syncRecommendationPanel(plan){
    const gain=UI.syncGain,ranking=syncRecommendations(plan,gain);
    const groups=UI.syncType==='綜合'?['綜合']:UI.syncType==='全部'?['攻擊','防禦','輔助']:[UI.syncType];
    const atCap=ownedPets().filter(p=>{const x=progressOf(p.id);return x.sync!=null&&x.sync>=syncCap(p)-1e-9;}).length;
    return `<section class="analysis-section sync-section" id="sync-recommendations">
      <div class="analysis-section-head"><div><span class="analysis-step">養成建議 02</span><h2>✦ 基礎同調提升推薦</h2><p>使用<strong>每隻幻獸自己的同名碎片</strong>提升基礎同調，可比較全類型的屬性增益，也可依攻擊、防禦、輔助個別推薦。</p></div>${analysisTypeSelect('analysis-sync-type',UI.syncType)}</div>
      <div class="card sync-panel"><div class="sync-controls"><div><strong>假設增加基礎同調</strong><p class="card-sub">每隻幻獸獨立模擬，只有觸及自身階級上限才縮減實際提升量。</p><span class="sync-meta">奇蹟 144% · 傳說 56% · 稀有 40% · 已滿值 ${atCap} 隻</span></div>
      <div class="field sync-gain-field"><label for="sync-gain-input">目前套用的提升幅度</label><div class="sync-gain-input-wrap"><input id="sync-gain-input" type="number" inputmode="decimal" data-action="sync-gain" min="0.01" max="144" step="any" value="${safe(gain)}" aria-label="基礎同調增加百分點"/><span>%</span></div><div class="sync-gain-actions"><small>目前比較 +${fmtN.format(gain)} 個百分點。會沿用上次儲存的設定；初次使用預設 12%。</small><button class="button xsmall" data-action="reset-sync-gain" type="button">恢復預設 12%</button></div></div></div>
      <div class="type-groups">${groups.map(t=>{
        const all=t==='綜合',rows=all?ranking:ranking.filter(x=>x.pet.type===t);
        const best=rows.find(x=>x.extra>1e-10);
        const heading=all?'全部類型｜綜合排行榜':t+'型幻獸';
        return `<section class="type-group" data-type="${t}"><div class="type-group-head"><div><span class="type-glyph">${all?'🏆':G.typeIcons[t]}</span><div><h3>${heading}</h3><span>${all?'攻擊、防禦、輔助一起比較六項屬性增益；碎片成本不混算':'消耗：該幻獸自己的同名碎片'}</span></div></div><span class="type-count">尚可提升 ${rows.length} 隻</span></div>
          ${best?`<div class="reco-best sync-best"><div><span class="mini-kicker">${all?'全類型最推薦':'本類最推薦'}</span><div class="reco-pet">${petIcon(best.pet)}<div><strong>${safe(best.pet.name)}</strong><small>${safe(best.pet.type)}型 · 基礎同調 ${fmtN.format(best.before)}% → ${fmtN.format(best.afterSync)}% · 預計 +${fmtN.format(gain)}，實際 +${fmtN.format(best.actualGain)} 個百分點${best.capped?'（達上限）':''}</small></div></div></div><div class="reco-best-score"><span>六項屬性總增益</span><strong>${numberDelta(best.extra,true)}</strong><small>未計碎片數量成本</small></div></div>`:''}
          ${rows.length?`<div class="sync-list">${rows.map((r,i)=>`<div class="sync-rank-row ${r===best?'best':''}"><span class="sync-rank-no">${i+1}</span><div class="sync-rank-pet"><strong>${safe(r.pet.name)}${all?` <span class="pill ${r.pet.type}">${r.pet.type}</span>`:''}</strong><span>${safe(r.pet.rarity)} · ${fmtN.format(r.before)}% → ${fmtN.format(r.afterSync)}%（上限 ${syncCap(r.pet)}%） · 預計 +${fmtN.format(gain)}，實際 +${fmtN.format(r.actualGain)} 個百分點${r.capped?'（達上限）':''}</span></div><div class="sync-gain"><strong>${numberDelta(r.extra,true)}</strong><span>${r.changes.map((v,k)=>v>1e-10?`${G.labels[k]} +${(v*100).toFixed(2)}%`:null).filter(Boolean).join('、')||'本次提升無可見增益'}</span></div><button class="button xsmall sync-edit" data-action="edit-pet" data-id="${r.pet.id}">編輯</button></div>`).join('')}</div>`:empty('✦','目前沒有可提升的幻獸','已達基礎同調上限或尚未設定有效資料的幻獸不列入排名。')}
        </section>`;
      }).join('')}</div>
      <div class="notice sync-note">※ 「全部類型（綜合排行）」按六項屬性的<strong>實際增益</strong>跨類型排序，並非不同碎片價格的 CP 值；沒有碎片用量資料前，不會混合比較碎片成本。<strong>若你之前設定過10%，會沿用10%；可輸入12或按「恢復預設12%」。</strong></div>
      </div></section>`;
  }
  function analysis(){
    const plan=planOf(),s=calcPlan(plan);
    return `${titleStrip('效益分析','能力頁數與基礎同調分開推薦，攻擊、防禦、輔助可獨立篩選。')} ${planSwitch()}
      ${overallKpis(s)}
      ${s.incomplete.length?`<div class="notice">有 ${s.incomplete.length} 隻幻獸的基礎同調未填或超出上限：${s.incomplete.slice(0,6).map(x=>safe(x.pet.name)).join('、')}。目前顯示的是已完成設定的部分屬性；完整材料總成本暫不計算。</div>`:''}
      ${!S.owned.length?empty('📊','還沒有可分析的幻獸','先勾選持有幻獸並輸入基礎同調，這裡就會自動出現養成效益。',`<button class="button primary" data-action="go-collection">開始設定</button>`):`<div class="split"><div class="card">${cardTitle('六項屬性分布','已依每隻幻獸、每項屬性的遊戲精度分別截尾，再加總。')}${meter(s.attrs)}</div><div class="card">${cardTitle('三類材料需求','材料消耗統一換算為小材料數量。')}<div class="breakdown">${TYPE_ORDER.map(t=>`<div class="breakrow"><div class="left"><span style="font-size:22px">${G.typeIcons[t]}</span><div><strong>${G.materialNames[t]}</strong><div class="fineprint">${t} · 大材料單價 ${S.prices[t]==null?'未設定':money(S.prices[t])+' 晨星'}</div></div></div><div style="text-align:right"><div class="qty">${money(s.qty[t])}</div><div class="fineprint">${smallPrice(t)==null?'行情未設定':money(s.qty[t]*smallPrice(t))+' 晨星'}</div></div></div>`).join('')}</div><div class="divider"></div><div class="status-line"><strong>總晨星估值</strong><span style="font-size:20px;color:var(--violet);font-weight:900">${money(s.cost)}</span></div></div></div>
      ${abilityRecommendationPanel(plan)}
      ${syncRecommendationPanel(plan)}
      <div class="section-line"><h2>方案比較</h2><small>可在上方複製方案，修改位置或模擬進度再比較。</small></div><div class="card" style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;text-align:left;min-width:560px"><thead><tr style="border-bottom:1px solid #e9eaf3;color:#8b91a4;font-size:11px"><th style="padding:9px">方案</th><th>六項屬性</th><th>材料估值</th><th>晨星／1%</th><th>狀態</th></tr></thead><tbody>${S.plans.map(p=>{let a=calcPlan(p);return `<tr style="border-bottom:1px solid #f2f3f7;font-size:13px"><td style="padding:14px 9px;font-weight:850">${safe(p.name)}</td><td>${pct(a.total)}</td><td>${money(a.cost)}</td><td>${money(a.perPercent)}</td><td>${a.costComplete?pill('資料完整','ok'):pill('資料待補','warn')}</td></tr>`}).join('')}</tbody></table></div>
      <p class="fineprint" style="margin-top:15px">說明：性價比以小材料的交易行情等值估算，並非升級時實際扣除晨星。遊戲若要求整顆購買大材料，實際採購數量可能因庫存而不同。</p>`}`;
  }
  function pricing(){
    return `${titleStrip('材料行情設定','市場價格會變動。只需要填寫「1個大材料」的交易價，網站自動換算單位成本。')}
      <div class="hero" style="min-height:144px"><div><small>MARKET VALUE</small><h2>1 個大材料 = 16 個小材料</h2><p>所有消耗都以小材料記錄。晨星只用來估算材料的交易價值，不是直接強化消耗。</p></div><div class="hero-icon">◆</div></div>
      <div class="settings-grid">${TYPE_ORDER.map(t=>`<div class="price-panel"><div class="price-title"><span class="price-icon">${G.typeIcons[t]}</span><div>${t}型幻獸<div class="small-muted">${G.materialNames[t].slice(1)}</div></div></div><div class="field"><label>1 個大${G.materialNames[t].slice(1)}價格（晨星）</label><input type="number" min="0" step="1" data-action="price" data-type="${t}" value="${S.prices[t]??''}" placeholder="請輸入交易行價格" /></div><div class="price-value"><div class="small-muted">1 個${G.materialNames[t]}的估值</div><strong>${smallPrice(t)==null?'—':money(smallPrice(t))}</strong><span class="small-muted"> 晨星／小材料</span></div></div>`).join('')}</div>
      <div class="section-line"><h2>換算方式</h2></div><div class="two-panels"><div class="card">${cardTitle('材料交換比例','不同尺寸為同一種材料的等值換算。')}<div style="text-align:center;font-weight:900;font-size:21px;color:#5f55ca;margin:14px 0">1 大 = 4 中 = 16 小</div><div class="small-muted" style="text-align:center">每 4 個小材料可換成 1 個中材料；4 個中材料可換 1 個大材料。</div></div><div class="card">${cardTitle('計算範例','以防禦型幻獸第2頁第1節點為例。')}<div class="breakrow"><span>需求</span><strong>1,146 小雞蛋</strong></div><div class="breakrow"><span>單價</span><strong>${smallPrice('防禦')==null?'未設定':money(smallPrice('防禦'))+' 晨星'}</strong></div><div class="breakrow"><span>市場估值</span><strong style="font-size:20px;color:var(--violet)">${smallPrice('防禦')==null?'—':money(1146*smallPrice('防禦'))}</strong></div></div></div>
      <div class="notice good">調整行情後，所有方案的材料總估值、每1%屬性估值、下一階效率排名都會重新計算；已輸入的幻獸養成進度不受影響。</div>`;
  }
  function deleteDialog(){
    if (!UI.deletePlanId) return '';
    const item=S.plans.find(p=>p.id===UI.deletePlanId);
    if (!item) return '';
    const onlyOne=S.plans.length===1;
    return `<div class="modal-backdrop" data-action="cancel-delete-plan">
      <section class="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description">
        <div class="modal-warning">!</div>
        <h2 id="delete-title">${onlyOne?'重設目前方案？':'確定刪除目前方案？'}</h2>
        <p id="delete-description">${onlyOne?`目前只有「${safe(item.name)}」一組方案。系統必須保留至少一組；確認後會清除這組的同調位置與模擬進度，但不會刪除你的幻獸持有、實際養成或行情設定。`:`即將刪除「${safe(item.name)}」的同調位置與模擬進度。其他方案、幻獸持有與實際養成資料都會保留。`}</p>
        <div class="modal-actions">
          <button type="button" class="button" data-action="cancel-delete-plan">取消</button>
          <button type="button" class="button delete-confirm" data-action="confirm-delete-plan">${onlyOne?'確認重設':'確認刪除'}</button>
        </div>
      </section>
    </div>`;
  }
  function openDeleteDialog(){
    UI.deletePlanId=planOf().id;
    render();
    ROOT.querySelector('[data-action="confirm-delete-plan"]')?.focus();
  }
  function commitDeletePlan(){
    const id=UI.deletePlanId;
    UI.deletePlanId=null;
    if (!id) return;
    const index=S.plans.findIndex(p=>p.id===id);
    if (index===-1) return render();
    if (S.plans.length===1) {
      S.plans[0].slots=[null,null,null,null];
      S.plans[0].overrides={};
      update();notify('已重設目前方案，幻獸養成資料仍保留。');
      return;
    }
    S.plans.splice(index,1);
    const successor=S.plans[Math.min(index,S.plans.length-1)];
    if (S.activePlan===id || !S.plans.some(p=>p.id===S.activePlan))S.activePlan=successor.id;
    update();notify('方案已刪除，其餘方案與實際養成資料保持不變。');
  }
  function homePage(){
    return `<div class="hub-shell">
      <div class="hub-backdrop" aria-hidden="true"><span class="hub-glow hub-glow-one"></span><span class="hub-glow hub-glow-two"></span><span class="hub-sigil">✧</span></div>
      <header class="hub-header"><span class="hub-version">${SITE_VERSION}</span><div class="hub-header-right"><span class="hub-arc">✦</span> 工具集入口</div></header>
      <main class="hub-main">
        <div class="hub-kicker"><span></span> 獨立製作的玩家工具集 <span></span></div>
        <h1 class="hub-heading">杖劍傳說-坎斯汀之約</h1>
        <p class="hub-subheading">小麥的杖劍工具集</p>
        <p class="hub-description">把複雜的幻獸養成數字，整理成簡單好用的規劃工具。<br>從目前持有的幻獸出發，探索更適合自己的養成路線。</p>
        <div class="hub-tools" aria-label="工具選單">
          <button class="hub-tool-card active" data-action="open-tool"><span class="hub-tool-icon">♛</span><span class="hub-tool-main"><span class="hub-tool-tag">現已開放</span><strong>幻獸養成規劃</strong><small>能力節點 · 同調配置 · 資源重分配</small><span class="hub-tool-link">進入規劃工具 <span aria-hidden="true">↗</span></span></span></button>
          <div class="hub-tool-card coming"><span class="hub-tool-icon muted">⌛</span><span class="hub-tool-main"><span class="hub-tool-tag upcoming">未來工具</span><strong>更多玩法工具</strong><small>後續將陸續開放其他遊戲小工具</small><button type="button" disabled aria-disabled="true" class="hub-construction">施工中</button></span></div>
        </div>
        <p class="hub-local-note">無須登入 · 玩家資料只存放在使用中的瀏覽器 · 可匯出備份</p>
      </main>
      <footer class="hub-footer"><span>作者：林小麥</span><span>© 2026 林小麥｜非官方玩家工具。遊戲名稱及相關商標權利歸其原權利人所有。</span></footer>
    </div>`;
  }
  function profileSelector(){
    return `<div class="character-bar"><label for="character-select">遊戲角色</label><select id="character-select" class="character-select" data-action="switch-character" aria-label="切換遊戲角色">${PROFILES.characters.map(p=>`<option value="${p.id}" ${p.id===PROFILES.activeId?'selected':''}>${safe(p.name)}</option>`).join('')}</select><button class="button small" data-action="add-character" title="建立另一個獨立角色">＋ 新增角色</button><button class="button small" data-action="rename-character" title="重新命名目前角色">✎ 命名</button></div>`;
  }
  function profileDialog(){
    if(!UI.profileDialog)return '';
    const deleting=UI.profileDialog==='delete';
    const creating=UI.profileDialog==='create';
    const title=creating?'新增遊戲角色':deleting?'刪除目前角色？':'重新命名遊戲角色';
    const value=creating?`角色 ${PROFILES.characters.length+1}`:activeCharacter().name;
    return `<div class="modal-backdrop profile-modal-backdrop" role="presentation"><section class="modal-card custom-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-dialog-title"><div class="modal-warning">${deleting?'!':'♧'}</div><h2 id="profile-dialog-title">${title}</h2>
      ${deleting?`<p>即將刪除「${safe(activeCharacter().name)}」的幻獸持有、能力進度、背包與方案資料。其他角色不受影響，建議先匯出所有角色備份。</p>`:`<p>${creating?'每個角色的持有幻獸、能力頁數、材料與同調方案互相獨立。':'名稱只用來識別角色，不會變動任何養成進度。'}</p><label class="profile-input-label" for="profile-name-input">角色名稱</label><input id="profile-name-input" class="input" maxlength="24" autocomplete="off" value="${safe(value)}" placeholder="例如：主角色／分身" />`}
      <div class="modal-actions"><button class="button" data-action="close-profile-dialog">取消</button><button class="button ${deleting?'delete-confirm':'primary'}" data-action="${deleting?'confirm-delete-character':'confirm-character-dialog'}">${deleting?'確認刪除':creating?'建立角色':'儲存名稱'}</button></div></section></div>`;
  }
  function feedbackDialog(){
    if(!UI.feedbackOpen)return '';
    return `<div class="modal-backdrop feedback-modal-backdrop" role="presentation"><section class="modal-card custom-dialog feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title"><div class="modal-warning">✉</div><h2 id="feedback-title">問題回報</h2>
      <p>填寫遇到的狀況，按下「開啟郵件程式」即可建立寄給作者的郵件。<strong>請留意：必須在自己的郵件程式中確認送出，網站不會自行寄信。</strong></p>
      <label class="profile-input-label" for="feedback-category">問題類型</label><select id="feedback-category" class="select-inline"><option>計算結果疑問</option><option>功能操作問題</option><option>錯誤／無法使用</option><option>新增功能建議</option><option>其他</option></select>
      <label class="profile-input-label" for="feedback-description">問題說明</label><textarea id="feedback-description" class="feedback-textarea" maxlength="2500" rows="5" placeholder="例如：我操作的步驟、預期結果、實際發生的問題…"></textarea>
      <p class="feedback-note">收件信箱：<a href="mailto:${FEEDBACK_EMAIL}">${FEEDBACK_EMAIL}</a>。不會自動附上角色資料或備份檔，若需協助請自行確認是否提供個人資訊。</p>
      <div class="modal-actions"><button class="button" data-action="close-feedback">取消</button><button class="button primary" data-action="send-feedback">開啟郵件程式 ↗</button></div></section></div>`;
  }
  function manual(){
    return `${titleStrip('操作說明手冊','從遊戲角色、幻獸輸入到最佳化方案，一步步完成規劃。',`<button class="button small" data-action="go-collection">開始設定我的幻獸 ↗</button>`)}
      <div class="manual-intro"><strong>歡迎使用「幻獸養成規劃工具」</strong><p>本工具為非官方玩家輔助規劃用途。計算結果以目前記錄的遊戲數值與材料需求推估，遊戲更新後請以實際遊戲為準。</p></div>
      <div class="manual-grid">
      <article class="manual-step"><span>01</span><h3>選擇／新增遊戲角色</h3><p>頁面上方可以建立、命名或切換角色。各角色的「我的幻獸」、背包材料與同調方案互相獨立；切換前會自動儲存。</p></article>
      <article class="manual-step"><span>02</span><h3>設定「我的幻獸」</h3><p>勾選持有的幻獸，輸入基礎同調 (%)、實際能力頁數及節點。奇蹟／傳說／稀有的基礎同調上限分別為144%／56%／40%。</p></article>
      <article class="manual-step"><span>03</span><h3>填寫背包材料</h3><p>到「養成規劃」輸入尚未使用的小雞蛋、小羽毛、小精油數量。能力頁數的材料可全額退回；總預算為已投入材料＋背包剩餘材料。</p></article>
      <article class="manual-step"><span>04</span><h3>搜尋養成與同調配置</h3><p>選擇最佳化目標後搜尋，系統會推薦能力進度及100%／50%位置。也可到「同調配置」鎖定既有位置。推薦屬於迭代搜尋候選解，不保證全域最佳。</p></article>
      <article class="manual-step"><span>05</span><h3>另存方案、查看後續推薦</h3><p>確認候選結果後按「套用／選定此方案」，系統會新增方案，不會覆蓋實際養成紀錄。進入「後續推薦」可看每種類型的下一階能力與基礎同調增益。</p></article>
      <article class="manual-step"><span>06</span><h3>備份、匯入與換裝置</h3><p>「匯出目前角色」會產生單一角色 JSON；「備份全部角色」包含所有角色。換裝置可使用對應匯入。單純重新整理網站仍保留本機資料，但不同瀏覽器／電腦不會自動同步。</p></article></div>
      <section class="manual-faq"><h2>常見問題</h2><details><summary>如果同時玩兩個遊戲角色，資料會混在一起嗎？</summary><p>不會。請用上方「＋ 新增角色」建立另一組資料。各角色的幻獸進度、同調方案與背包均分開儲存；切換角色後請核對上方名稱。</p></details><details><summary>我的紀錄會傳到伺服器嗎？</summary><p>目前沒有帳號系統，內容只存在使用中瀏覽器的 localStorage。清除網站資料、使用無痕模式或換裝置都可能造成紀錄無法讀取，請定期匯出 JSON。</p></details><details><summary>退回能力頁數材料會退回基礎同調嗎？</summary><p>不會。雞蛋／羽毛／精油用於能力頁數且可全額回收；基礎同調使用同名幻獸碎片，是獨立養成系統。</p></details><details><summary>報告計算錯誤或想提出功能建議？</summary><p>使用上方「問題回報」編輯郵件，或直接寄信至 <a href="mailto:${FEEDBACK_EMAIL}">${FEEDBACK_EMAIL}</a>。</p></details></section>`;
  }
  function switchCharacter(id){
    if(id===PROFILES.activeId)return;
    if(!PROFILES.characters.some(p=>p.id===id)){notify('找不到該遊戲角色。',true);render();return}
    save();PROFILES.activeId=id;S=activeCharacter().state;UI.syncGain=S.syncGain;
    UI.optimizerLocked=[false,false,false,false];UI.optimizerResults=null;UI.plannerResults=null;UI.deletePlanId=null;
    UI.search='';UI.type='全部';UI.ownedOnly=false;UI.tab='collection';save();render();notify(`已切換到「${activeCharacter().name}」。`);
  }
  function exportAllData(){
    const data={app:'wheat-sword-toolkit',version:1,exportedAt:new Date().toISOString(),activeId:PROFILES.activeId,characters:PROFILES.characters.map(p=>({...p,state:p.id===PROFILES.activeId?S:p.state}))};
    downloadJson(data,`小麥杖劍工具集_全部角色備份_${new Date().toISOString().slice(0,10)}.json`);
    notify(`已匯出 ${PROFILES.characters.length} 組角色資料。`);
  }
  function downloadJson(obj,filename){
    const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2500);
  }
  function shell(content){
    const t=TABS.find(x=>x.id===UI.tab)||{id:'manual',label:'操作說明手冊'};
    return `<div class="layout"><aside class="sidebar"><div class="brand"><span class="logo">✧</span><div><div class="brand-title">幻獸養成規劃工具</div><div class="brand-sub">小麥的杖劍工具集</div></div></div><button class="side-home-button" data-action="go-home">← 返回工具集首頁</button><div class="side-label">幻獸規劃 / 工作空間</div><div class="nav-list">${TABS.map(x=>`<button class="nav-item ${UI.tab===x.id?'active':''}" data-action="navigate" data-tab="${x.id}"><span class="nav-ico">${x.icon}</span><span>${x.label}</span>${x.id==='collection'?`<span class="nav-tag">${S.owned.length}</span>`:''}</button>`).join('')}</div><div class="side-bottom"><div class="side-note"><strong>✧ 快速操作</strong><p>有多隻遊戲角色？可在頁面上方建立獨立的角色資料。</p><button class="button small wide" data-action="open-manual">操作說明手冊</button><button class="button small wide" style="margin-top:8px" data-action="demo">載入示範資料</button></div><div class="side-foot">${SITE_VERSION} · 計算規格 V2.4<br>🔒 玩家資料僅存在本機瀏覽器</div></div></aside>
      <div class="workspace"><header class="topbar toolkit-topbar"><div class="toolkit-home-nav"><button type="button" class="toolkit-home-button" data-action="go-home" aria-label="回到小麥的杖劍工具集首頁">← 回到首頁</button></div><div class="topbar-page"><span class="crumbs">小麥的杖劍工具集 / ${safe(t.label)}</span><strong class="top-title">幻獸養成規劃工具</strong></div><div class="toolkit-controls">${profileSelector()}<div class="toolkit-help"><button class="button small" data-action="open-manual">📖 操作手冊</button><button class="button small" data-action="open-feedback">✉ 問題回報</button></div></div></header>
      <div class="toolkit-storage"><span>● 已保存在此瀏覽器 · 目前角色：<b>${safe(activeCharacter().name)}</b></span><div class="toolkit-storage-actions"><button class="button xsmall" data-action="export">匯出目前角色</button><button class="button xsmall" data-action="import">匯入目前角色</button><button class="button xsmall" data-action="export-all">備份全部角色</button><button class="button xsmall" data-action="import-all">匯入全部角色</button><button class="button xsmall danger" data-action="reset">重設目前角色</button></div></div>
      <main class="main">${content}</main></div></div>
      <nav class="mobile-tabs">${TABS.map(x=>`<button class="${UI.tab===x.id?'active':''}" data-action="navigate" data-tab="${x.id}"><span>${x.mobile}</span>${safe(x.label)}</button>`).join('')}</nav>${deleteDialog()}${profileDialog()}${feedbackDialog()}`;
  }
  function render(){
    const nowHome=UI.route==='home';
    const views={collection,slots,simulation,analysis,pricing,path,manual};
    ROOT.innerHTML=nowHome?homePage():shell((views[UI.tab]||collection)());
    document.title=nowHome?'杖劍傳說-坎斯汀之約｜小麥的杖劍工具集':'幻獸養成規劃工具｜小麥的杖劍工具集';
  }
  function loadDemo(){
    if(S.owned.length && !confirm('要載入示範資料嗎？這會取代目前已設定的幻獸、行情與方案。建議先匯出備份。'))return;
    const demo=newState();
    // Preserve the existing 18-pet demo's numerical results after catalog expansion.
    // The newly registered pet remains unowned until selected by the player.
    const demoPets=G.pets.filter(p=>p.id!=='p19');
    demo.owned=demoPets.map(p=>p.id);
    for(const p of demoPets)demo.progress[p.id]={sync:p.demoSync,page:p.demoPage,stage:p.demoStage};
    const ids=['紫雲獸','暗夜帝王','竹林仙君','岩飛龍'].map(name=>G.pets.find(p=>p.name===name).id);
    demo.plans[0].slots=ids;
    demo.prices={'防禦':80,'攻擊':80,'輔助':80};
    S=demo;UI.tab='collection';UI.ownedOnly=false;UI.search='';UI.type='全部';UI.rarity='全部';UI.deletePlanId=null;
    update();notify('已載入既有18隻幻獸及指定示範位置；繃繃南瓜可另外勾選。');
  }
  function setOwned(id,yes){
    if(yes&&!S.owned.includes(id)){S.owned.push(id);S.progress[id]??={sync:null,page:1,stage:1};}
    if(!yes){
      S.owned=S.owned.filter(x=>x!==id);
      // 不刪除進度，但釋放同調位置，避免隱藏的未持有幻獸占位。
      for(const plan of S.plans)plan.slots=plan.slots.map(x=>x===id?null:x);
    }
    update();
  }
  function exportData(){
    downloadJson({app:'fantasy-pet-planner',version:1,exportedAt:new Date().toISOString(),...S},`幻獸養成_${activeCharacter().name.replace(/[^\p{L}\p{N}_-]/gu,'_')}_備份_${new Date().toISOString().slice(0,10)}.json`);
    notify('已匯出目前角色 JSON 備份。');
  }
  function clonePlan(){
    if(S.plans.length>=10)return notify('最多支援10組方案。',true);
    const ids='ABCDEFGHIJ';const id=[...ids].find(x=>!S.plans.some(p=>p.id===x)),source=planOf();
    S.plans.push({id,name:`方案 ${id}`,slots:[...source.slots],overrides:structuredClone(source.overrides)});
    S.activePlan=id;update();notify('已複製方案，可自由調整配置和模擬進度。');
  }
  function clickAction(a,el){
    const id=el.dataset.id,plan=planOf();
    switch(a){
      case 'open-tool':UI.route='pet';UI.tab='collection';location.hash='#/pet';render();window.scrollTo(0,0);break;
      case 'go-home':UI.route='home';location.hash='#/';render();window.scrollTo(0,0);break;
      case 'open-manual':UI.tab='manual';render();window.scrollTo(0,0);break;
      case 'open-feedback':UI.feedbackOpen=true;render();document.getElementById('feedback-description')?.focus();break;
      case 'close-feedback':UI.feedbackOpen=false;render();break;
      case 'send-feedback':{
        const category=document.getElementById('feedback-category')?.value||'問題回報';
        const content=document.getElementById('feedback-description')?.value?.trim()||'';
        if(content.length<5){notify('請至少填寫5個字的問題內容。',true);document.getElementById('feedback-description')?.focus();return}
        const title=`【杖劍工具集 ${SITE_VERSION}】${category}`;
        const body=`功能：幻獸養成規劃工具\n問題分類：${category}\n\n問題描述：\n${content}\n\n（可自行補充裝置、瀏覽器與重現步驟，請勿附上私人資料）`;
        const url=`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
        window.location.href=url;
        notify('已嘗試開啟郵件程式，請在郵件程式中確認送出。');break;
      }
      case 'add-character':if(PROFILES.characters.length>=20){notify('最多支援20組角色。',true);return}UI.profileDialog='create';render();document.getElementById('profile-name-input')?.focus();break;
      case 'rename-character':UI.profileDialog='rename';render();document.getElementById('profile-name-input')?.focus();break;
      case 'close-profile-dialog':UI.profileDialog=null;render();break;
      case 'confirm-character-dialog':{
        const name=document.getElementById('profile-name-input')?.value?.trim()||'';
        if(!name){notify('角色名稱不可空白。',true);return}
        if(UI.profileDialog==='create'){
          let i=1;while(PROFILES.characters.some(p=>p.id===`character-${i}`))i++;
          const profile={id:`character-${i}`,name:name.slice(0,24),state:newState()};
          save();PROFILES.characters.push(profile);PROFILES.activeId=profile.id;S=profile.state;
          UI.tab='collection';UI.search='';UI.ownedOnly=false;UI.type='全部';UI.syncGain=S.syncGain;
          UI.optimizerLocked=[false,false,false,false];UI.optimizerResults=null;UI.plannerResults=null;
        }else if(UI.profileDialog==='rename'){activeCharacter().name=name.slice(0,24)}
        UI.profileDialog=null;update();notify(`目前使用角色「${activeCharacter().name}」。`);break;
      }
      case 'export-all':exportAllData();break;
      case 'import-all':UI.importTarget='all';document.querySelector('#import-file').click();break;
      case 'delete-character':if(PROFILES.characters.length<=1){notify('至少要保留一個角色。',true);return}UI.profileDialog='delete';render();break;
      case 'confirm-delete-character':{
        if(PROFILES.characters.length<=1)return;
        PROFILES.characters=PROFILES.characters.filter(p=>p.id!==PROFILES.activeId);
        PROFILES.activeId=PROFILES.characters[0].id;S=activeCharacter().state;
        UI.profileDialog=null;UI.tab='collection';UI.syncGain=S.syncGain;update();notify('目前角色已刪除，已切換到其他角色。');break;
      }
      case 'navigate':UI.tab=el.dataset.tab;render();window.scrollTo(0,0);break;
      case 'go-slots':UI.tab='slots';render();window.scrollTo(0,0);break;
      case 'go-collection':UI.tab='collection';render();window.scrollTo(0,0);break;
      case 'go-simulation':UI.tab='simulation';render();window.scrollTo(0,0);break;
      case 'go-path':UI.tab='path';render();window.scrollTo(0,0);break;
      case 'go-analysis':UI.tab='analysis';render();window.scrollTo(0,0);break;
      case 'edit-pet':UI.tab='collection';UI.ownedOnly=true;UI.search='';UI.type='全部';UI.rarity='全部';render();document.getElementById('pet-editor-'+id)?.scrollIntoView({behavior:'smooth',block:'center'});break;
      case 'demo':loadDemo();break;
      case 'toggle-owned':setOwned(id,!S.owned.includes(id));break;
      case 'select-all':S.owned=G.pets.map(p=>p.id);for(const p of G.pets)S.progress[p.id]??={sync:null,page:1,stage:1};update();break;
      case 'select-none':if(S.owned.length&&!confirm('確認取消所有幻獸的持有標記？原先輸入的養成數據仍會保留。'))return;S.owned=[];update();break;
      case 'filter-type':UI.type=el.dataset.val;render();break;
      case 'choose-plan':S.activePlan=el.dataset.plan;UI.optimizerLocked=[false,false,false,false];update();break;
      case 'clone-plan':clonePlan();break;
      case 'run-optimizer':UI.optimizerResults=optimizeSlots(plan);render();ROOT.querySelector('#optimizer-panel')?.scrollIntoView({behavior:'smooth',block:'start'});break;
      case 'optimizer-unlock':UI.optimizerLocked=[false,false,false,false];UI.optimizerResults=null;render();break;
      case 'optimizer-apply':{
        const r=UI.optimizerResults?.results?.[Number(el.dataset.index)];
        if(!r)return notify('搜尋結果已失效，請重新尋找最佳配置。',true);
        if(S.plans.length>=10)return notify('方案最多10組，請先刪除不使用的方案。',true);
        const id=[...'ABCDEFGHIJ'].find(id=>!S.plans.some(p=>p.id===id));
        const name=`方案 ${id} · 最佳配置`;
        S.plans.push({id,name,slots:[...r.slots],overrides:structuredClone(plan.overrides)});
        S.activePlan=id;UI.optimizerLocked=[false,false,false,false];update();notify(`已建立「${name}」，原方案仍完整保留。`);break;
      }

      case 'run-joint-planner':{
        UI.plannerResults=runJointPlanner(plan);render();ROOT.querySelector('#joint-planner')?.scrollIntoView({behavior:'smooth',block:'start'});break;
      }
      case 'apply-joint-plan':{
        const result=UI.plannerResults?.results?.[Number(el.dataset.index)];
        if(!result)return notify('推薦結果已失效，請重新搜尋。',true);
        if(S.plans.length>=10)return notify('方案已達10組上限，請先刪除不使用的方案。',true);
        const newId=[...'ABCDEFGHIJ'].find(x=>!S.plans.some(p=>p.id===x));
        S.plans.push({id:newId,name:`方案 ${newId} · 資源重分配`,slots:[...result.slots],overrides:structuredClone(result.overrides)});
        S.activePlan=newId;UI.tab='path';update();notify('已建立能力頁數＋同調位置新方案；原始資料與舊方案都保留。');break;
      }
      case 'reset-sync-gain':UI.syncGain=12;S.syncGain=12;update();notify('模擬提升幅度已恢復為 12 個百分點。');break;
      case 'delete-plan':openDeleteDialog();break;
      case 'cancel-delete-plan':UI.deletePlanId=null;render();break;
      case 'confirm-delete-plan':commitDeletePlan();break;
      case 'clear-override':delete plan.overrides[id];update();break;
      case 'reset-overrides':plan.overrides={};update();notify('本方案的模擬已全部還原。');break;
      case 'export':exportData();break;
      case 'import':UI.importTarget='current';document.querySelector('#import-file').click();break;
      case 'reset':if(confirm(`確定要重設「${activeCharacter().name}」的持有幻獸、養成、價格及方案嗎？其他角色不受影響。建議先匯出備份。`)){S=newState();UI.tab='collection';UI.syncGain=12;update();notify('目前角色已重設，其他角色保留。')}break;
    }
  }
  function changeAction(a,el){
    const id=el.dataset.id,plan=planOf();
    switch(a){
      case 'switch-character':switchCharacter(el.value);return;
      case 'filter-rarity':UI.rarity=el.value;render();return;
      case 'analysis-ability-type':UI.abilityType=el.value;render();return;
      case 'optimizer-goal':UI.optimizerGoal=el.value;UI.optimizerResults=null;UI.plannerResults=null;render();return;
      case 'planner-goal':UI.optimizerGoal=el.value;UI.plannerResults=null;render();return;
      case 'planner-mode':UI.plannerMode=el.value;UI.plannerResults=null;render();return;
      case 'backpack':{
        const n=numeric(el.value,100000000);if(n===null||!Number.isInteger(n)){notify('背包材料請填入0以上整數。',true);render();return;}
        S.backpack[el.dataset.type]=n;update();return;
      }
      case 'optimizer-weight':{
        const k=Number(el.dataset.index),n=numeric(el.value,10);
        if(n===null){notify('權重請輸入0～10的數值。',true);render();return;}
        UI.optimizerWeights[k]=n;UI.optimizerResults=null;UI.plannerResults=null;render();return;
      }
      case 'optimizer-lock':{
        const k=Number(el.dataset.index);
        UI.optimizerLocked[k]=Boolean(el.checked&&plan.slots[k]);UI.optimizerResults=null;UI.plannerResults=null;render();return;
      }

      case 'analysis-sync-type':UI.syncType=el.value;render();return;
      case 'sync-gain':{
        const n = numeric(el.value, 144);
        if (n == null || n <= 0) {notify('請輸入大於 0、且不超過 144 的提升百分點，例如 12 或 2.5。',true);render();return;}
        UI.syncGain=n;S.syncGain=n;update();return;
      }
      case 'owned-only':UI.ownedOnly=el.checked;render();return;
      case 'progress':{
        const p=progressOf(id),key=el.dataset.key;
        if(key==='sync'){
          const max=syncCap(petMap[id]);
          const n=numeric(el.value,max);if(el.value!==''&&n==null){notify(`基礎同調請輸入 0～${max}%（${petMap[id].rarity}階級上限）。`,true);render();return}p.sync=n;
        } else if(key==='page'){
          p.page=Number(el.value);if(p.page===1&&p.stage>1)p.stage=1;
        } else if(key==='stage')p.stage=Number(el.value);
        S.progress[id]=p;update();return;
      }
      case 'set-slot':{
        const slot=Number(el.dataset.slot);if(el.value&&plan.slots.some((x,i)=>i!==slot&&x===el.value)){notify('同一隻幻獸不能同時占用兩個高同調位置。',true);render();return}
        plan.slots[slot]=el.value||null;update();return;
      }
      case 'override':{
        const p=progressOf(id),current=plan.overrides[id]??{page:p.page,stage:p.stage};
        const key=el.dataset.key;current[key]=Number(el.value);
        if(current.page===1&&current.stage>1)current.stage=1;
        plan.overrides[id]=current;
        if(current.page===p.page&&current.stage===p.stage)delete plan.overrides[id];
        update();return;
      }
      case 'price':{
        const n=numeric(el.value,10000000);if(el.value!==''&&n==null){notify('市場價格只能輸入非負數。',true);render();return}
        S.prices[el.dataset.type]=n;update();return;
      }
    }
  }
  document.addEventListener('click',e=>{
    const el=e.target.closest('button[data-action]');
    if(!el){if(e.target.classList?.contains('feedback-modal-backdrop')){UI.feedbackOpen=false;render()}else if(e.target.classList?.contains('profile-modal-backdrop')){UI.profileDialog=null;render()}else if(e.target.classList?.contains('modal-backdrop')){UI.deletePlanId=null;render()}return;}
    clickAction(el.dataset.action,el);
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape' && (UI.deletePlanId||UI.profileDialog||UI.feedbackOpen)){UI.deletePlanId=null;UI.profileDialog=null;UI.feedbackOpen=false;render();}
  });
  document.addEventListener('change',e=>{
    const el=e.target;if(!el.dataset?.action)return;
    changeAction(el.dataset.action,el);
  });
  document.addEventListener('input',e=>{
    const el=e.target;if(el.dataset?.action!=='search-pet')return;
    UI.search=el.value;
    const at=el.selectionStart;render();
    const replacement=document.querySelector('#pet-search');if(replacement){replacement.focus();replacement.setSelectionRange(at,at)}
  });
  document.querySelector('#import-file').addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(file.size>4_000_000){notify('檔案過大，請選擇有效的設定備份。',true);e.target.value='';return;}
    try{
      const raw=JSON.parse(await file.text());
      if(UI.importTarget==='all'){
        if(raw.app!=='wheat-sword-toolkit'||raw.version!==1||!Array.isArray(raw.characters)||!raw.characters.length)throw Error('請選擇「全部角色」JSON備份');
        if(!confirm('匯入全部角色將取代目前工具集內的所有角色，確定繼續嗎？建議先備份現有資料。'))return;
        PROFILES=restoreProfiles(raw);S=activeCharacter().state;UI.tab='collection';UI.syncGain=S.syncGain;update();notify(`已匯入 ${PROFILES.characters.length} 組角色。`);
      }else{
        if(raw.app!=='fantasy-pet-planner'||raw.version!==1)throw Error('請選擇單一角色的幻獸養成JSON備份');
        if((S.owned.length||Object.keys(S.progress).length)&&!confirm(`匯入後將覆蓋「${activeCharacter().name}」的資料（其他角色不受影響），確定繼續嗎？`))return;
        S=sanitizeState(raw);UI.tab='collection';UI.syncGain=S.syncGain;update();notify('目前角色的備份已匯入。');
      }
    }catch(err){notify(`匯入失敗：${err.message}`,true)}finally{e.target.value='';UI.importTarget='current'}
  });
  window.addEventListener('hashchange',()=>{
    const route=location.hash.startsWith('#/pet')?'pet':'home';
    if(route!==UI.route){UI.route=route;UI.feedbackOpen=false;UI.profileDialog=null;render();window.scrollTo(0,0)}
  });
  render();
})();