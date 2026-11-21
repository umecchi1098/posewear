'use strict';
(()=>{const A=window.APP;if(!A)return;const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s),esc=A.esc;
const t=UI.t;
const toast=A.toast;
const locale=()=>({zh:'zh-CN',en:'en',ja:'ja'}[UI.locale]);
const provider=id=>t(PROV[id]?.name||id||'');
const LS=k=>{try{return JSON.parse(localStorage[k]||'null')}catch(e){return null}},SV=(k,v)=>{try{localStorage[k]=JSON.stringify(v)}catch(e){}};
// ---------- 服务商 ----------
const PROV={openai:{name:'OpenAI',base:'https://api.openai.com/v1',model:'gpt-image-1',models:['gpt-image-1','gpt-image-1-mini','gpt-image-2','dall-e-2']},
 gemini:{name:'Gemini',base:'https://generativelanguage.googleapis.com/v1beta',model:'gemini-2.5-flash-image',models:['gemini-2.5-flash-image','gemini-3-pro-image-preview','gemini-3.1-flash-image']},
 seedream:{name:'豆包 Seedream',base:'https://ark.cn-beijing.volces.com/api/v3',model:'doubao-seedream-4-0-250828',models:['doubao-seedream-4-0-250828','doubao-seedream-4-5-251128','doubao-seedream-5-0-flash-260915']},
 custom:{name:'自定义中转',base:'',model:'gpt-image-1',models:['gpt-image-1','gpt-image-2','gemini-2.5-flash-image','flux-kontext-pro','qwen-image-edit','doubao-seedream-4-0-250828']}};
const cfg=Object.assign({prov:'openai',base:'',key:'',model:'',field:'image[]',proto:'edits',proxy:false},LS('wbCfg')||{});
// ---------- 预设 ----------
const CHARS=[['asia','东亚女性','an adult East Asian woman in her mid-20s, long black hair, natural makeup, slim build','一位二十多岁的成年东亚女性，黑色长发，自然淡妆，身材纤细'],
 ['west','欧美女性','an adult Caucasian woman in her late 20s, wavy light-brown hair, natural makeup, athletic build','一位二十多岁的成年欧美女性，浅棕色波浪长发，自然妆容，匀称身材'],
 ['man','男性模特','an adult East Asian man in his late 20s, short black hair, clean-shaven, tall and lean','一位二十多岁的成年东亚男性，黑色短发，干净面容，高瘦身材'],
 ['anime','动漫角色','an adult anime-style girl, long silver hair, large expressive eyes, adult proportions, clean cel-shaded illustration','一位成年动漫风格女性角色，银色长发，大眼睛，成人身材比例，干净的赛璐璐上色插画'],
 ['custom','自定义','','']];
const STYLES=[['keep','照片质感','photorealistic, matching the original photo quality','写实摄影质感，与原照片画质一致'],['studio','影棚大片','clean high-end fashion studio, soft key light, seamless light-grey backdrop, editorial lookbook photo','高端时尚影棚，柔和主光，浅灰无缝背景，杂志画册质感'],
 ['street','城市街拍','candid city street-style photo, natural daylight, shallow depth of field','城市街拍抓拍，自然日光，浅景深'],['ecom','电商白底','e-commerce product-model photo, pure white background, even lighting, full body','电商模特图，纯白背景，均匀布光，全身构图'],
 ['film','胶片氛围','35mm film photograph, warm tones, subtle grain, golden hour light','35mm 胶片摄影，暖色调，轻微颗粒，黄金时刻光线'],['anime','动漫插画','high-quality anime illustration, clean line art, soft cel shading','高质量动漫插画，干净线稿，柔和赛璐璐上色']];
const ANG_EN={'正面':'front view','斜侧':'three-quarter view','侧面':'side profile','俯拍':'high-angle shot looking down','仰拍':'low-angle shot looking up','背面':'back view','下から':'low angle'};
const W={mode:LS('wbMode')||'tryon',persons:[],garments:[],poses:[],char:LS('wbChar')||'asia',charTxt:LS('wbCharTxt')||'',style:LS('wbStyle')||'keep',bm:LS('wbBm')||'each',pl:LS('wbPl')||'en',keepBg:LS('wbKeepBg')??true,busy:null,dirty:false,results:[],ri:0,cmp:true};
// item: {kind:'lib',k,ai?} | {kind:'file',blob,url,name}
const g0=LS('wbSel')||{};
// ---------- 工具 ----------
const normBase=b=>(b||'').trim().replace(/\/+$/,'');
function root(){let b=normBase(cfg.base)||PROV[cfg.prov].base;if(cfg.prov=='gemini')return/\/v1(beta|alpha)?$/.test(b)?b:b+'/v1beta';if(cfg.prov=='seedream')return b;return/\/v\d+$/.test(b)?b:b+'/v1'}
const modelOf=()=>(cfg.model||'').trim()||PROV[cfg.prov].model;
const proto=()=>cfg.prov=='openai'?'edits':cfg.prov=='custom'?cfg.proto:cfg.prov;
// 読み込みエラーはキーを保持し、エラー表示中に言語を切り替えても翻訳できるようにします。
function imageError(key,params){
 const error=Error(key);
 error.ui=()=>t(key,params);
 return error;
}
function loadImg(src){return new Promise((r,j)=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>j(imageError('图片读取失败'));i.src=src})}
async function toJpeg(src,max=1536){const i=await loadImg(src);let w=i.naturalWidth,h=i.naturalHeight,s=Math.min(1,max/Math.max(w,h));w=Math.round(w*s);h=Math.round(h*s);
 const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(i,0,0,w,h);return new Promise(r=>c.toBlob(b=>r({blob:b,w,h}),'image/jpeg',.92))}
const libSrc=a=>{const it=A.ITEMS[a.k];return it.type=='pose'?it.angles[a.ai??it.ai].i:it.i};
async function assetBlob(a){if(a.kind=='file')return a.blob;const src=libSrc(a);const r=await fetch(src);if(!r.ok)throw imageError('素材下载失败（{status}）',{status:r.status});const u=URL.createObjectURL(await r.blob());try{return(await toJpeg(u,1280)).blob}finally{URL.revokeObjectURL(u)}}
const b64=b=>new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(b)});
const dataURL=async b=>'data:'+(b.type||'image/jpeg')+';base64,'+await b64(b);
const isGen=()=>W.mode=='gen';const hasPerson=()=>W.persons.length>0;
// ---------- 提示词 ----------
function poseDesc(p,en){const it=A.ITEMS[p.k];if(!it)return'';const a=it.angles[p.ai??it.ai];return en?`${it.en} (${it.lineEn}, ${ANG_EN[a.zh]||a.en||a.zh})${/2人|双人/.test(it.line)?' — a two-person pose: match the number of people and their relative positions':''}`:`${it.zh}（${it.line}，${a.zh}）${/2人|双人/.test(it.line)?'——双人姿势，人数与相对位置需与线稿一致':''}`}
function compose(poseSet){const en=W.pl=='en',P=W.persons.length,G=W.garments.length,ps=poseSet||W.poses,np=ps.length,sheet=np>1;const style=STYLES.find(s=>s[0]==W.style)||STYLES[0],ch=CHARS.find(c=>c[0]==W.char)||CHARS[0],ex=$('#wbExtra').value.trim();
 const gi=W.garments.map(g=>g.kind=='lib'&&A.ITEMS[g.k]).filter(Boolean);let n=0;const rng=(c)=>{if(!c)return null;const a=n+1,b=n+c;n=b;return a==b?(en?`image ${a}`:`第 ${a} 张`):(en?`images ${a}–${b}`:`第 ${a}–${b} 张`)};
 const rP=rng(P),rG=rng(G),rS=rng(np);const L=[];
 if(en){L.push(P?`Fashion ${isGen()?'image generation':'virtual try-on'} using reference images. ${rP} ${P>1?'show':'shows'} the person (same individual)${G?`; ${rG} ${G>1?'show':'shows'} the outfit${G>1?' pieces (top and bottom)':''} on an invisible mannequin`:''}${np?`; ${rS} ${np>1?'are':'is'} pose sketch${np>1?'es':''}`:''}.`:`Fashion image generation from reference images. ${G?`${rG} ${G>1?'show':'shows'} the outfit on an invisible mannequin`:''}${np?`; ${rS} ${np>1?'are':'is'} pose sketch${np>1?'es':''}`:''}.`);
  L.push(P?"Subject: the person from the photo. Preserve their face, identity, hairstyle, skin tone and body proportions exactly; they must stay recognisably the same adult.":`Subject: ${(W.char=='custom'?W.charTxt:ch[2])||ch[2]||'an adult model'}. Always an adult with adult proportions.`);
  if(G)L.push(`Outfit: dress the subject in the complete outfit from ${rG}, reproducing every garment faithfully — cut, color, fabric, pattern, layering, shoes and accessories${gi.length?': '+gi.map(x=>x.en.replace(/^[^,]*outfit,\s*/,'')).join('; '):''}. Replace the original clothing entirely. Never draw the mannequin or a blank body.`);
  if(np)L.push((sheet&&W.bm=='sheet'?`Pose: draw ${np} panels in one image, one per pose sketch, same subject and outfit in every panel, with even spacing and no text: `:'Pose: ')+ps.map((p,i)=>(sheet&&W.bm=='sheet'?`(${i+1}) `:'')+poseDesc(p,true)).join('; ')+'. Use the sketch only for body posture, weight, limb placement and camera angle; never draw sketch lines, joint circles or guide marks.');
  else if(P)L.push('Pose: keep the original pose, framing and camera angle.');
  L.push(`Look: ${P&&W.keepBg&&!isGen()?'keep the original background and lighting of the photo; ':''}${style[2]}. Natural fabric drape with realistic folds and shadows, high detail. No text, no watermark, no borders.`);
  if(ex)L.push('Additional: '+ex)}
 else{L.push(P?`时尚${isGen()?'生图':'虚拟试穿'}，使用参考图。${rP}是人物照片（同一人）${G?`；${rG}是放在隐形人台上的服装${G>1?'（上装与下装）':''}`:''}${np?`；${rS}是姿势线稿`:''}。`:`根据参考图进行时尚生图。${G?`${rG}是放在隐形人台上的服装`:''}${np?`；${rS}是姿势线稿`:''}。`);
  L.push(P?'人物：照片中的人。严格保留其面部、身份特征、发型、肤色与身材比例，必须一眼认出是同一位成年人。':`人物：${(W.char=='custom'?W.charTxt:ch[3])||ch[3]||'一位成年模特'}。始终为成年人比例。`);
  if(G)L.push(`服装：为人物换上${rG}中的整套服装，准确还原版型、颜色、面料、图案、叠穿、鞋袜与配饰${gi.length?'：'+gi.map(x=>x.zh.replace(/[。.]$/,'')).join('；'):''}。完全替换原有衣物，不要画出人台或空白身体。`);
  if(np)L.push((sheet&&W.bm=='sheet'?`姿势：在同一张图中画 ${np} 格，每格对应一张线稿，人物与服装保持一致，均匀留白，不写文字：`:'姿势：')+ps.map((p,i)=>(sheet&&W.bm=='sheet'?`（${i+1}）`:'')+poseDesc(p,false)).join('；')+'。线稿只用于提取身体姿态、重心、四肢位置和镜头角度，不要画出线条、关节圆或辅助线。');
  else if(P)L.push('姿势：保持原照片的姿势、构图和拍摄角度。');
  L.push(`画面：${P&&W.keepBg&&!isGen()?'保留原照片的背景与光线；':''}${style[3]}。衣物垂坠自然，褶皱阴影真实，高细节。不要文字、水印或边框。`);
  if(ex)L.push('补充：'+ex)}
 return L.join('\n')}
function reprompt(force){if(force||!W.dirty){$('#wbPrompt').value=compose();W.dirty=false}}
// ---------- 渲染 ----------
// 素材名と撮影角度は、現在の画面言語に対応するデータを表示します。
const displayLabel=(zh,en,ja)=>({en,ja}[UI.locale]||t(zh));
const angleLabel=a=>displayLabel(a.zh,a.en,a.ja);
function pickRow(a,type,i){const it=a.kind=='lib'&&A.ITEMS[a.k];if(a.kind=='lib'&&!it)return`<div class="empty0">${t('加载中…')}</div>`;
 const src=it?(type=='pose'?A.ath(it.angles[a.ai??it.ai].t):A.thumb(it)):a.url,name=it?A.title(it):(a.name||t('自定义图片')),sub=it?(it.type=='pose'?displayLabel(it.line,it.lineEn,it.lineJa)+' · '+angleLabel(it.angles[a.ai??it.ai]):displayLabel(it.cat,it.catEn,it.catJa)+' · '+it.id):(type=='costume'?(W.garments.length>1?t(i==0?'上装':'下装'):t('本地上传')):t('本地上传'));
 return`<div class="pick ${type}"><img src="${src}" alt="${esc(name)}"><div><b>${esc(name)}</b><small>${esc(sub)}</small></div>${type=='pose'&&it?`<select data-ang="${i}" aria-label="${esc(t('角度'))}">${it.angles.map((x,j)=>`<option value="${j}" ${j==(a.ai??it.ai)?'selected':''}>${esc(angleLabel(x))}</option>`).join('')}</select>`:''}<button class="rmx" data-rm="${type}" data-i="${i}" aria-label="${esc(t('移除'))}" title="${esc(t('移除'))}">×</button></div>`}
function render(localeOnly=false){const G=isGen();$$('[data-mode]').forEach(b=>b.classList.toggle('on',b.dataset.mode==W.mode));
 $('#stLead').textContent=t(G?'选模特类型和服装，直接出一张上身图。':'上传照片，选一套衣服，换上看看。');
 $('#s1R').textContent=t(G?'可传脸部参考':'必选');$('#s1T').textContent=t(G?'模特':'人物');
 $('#wbPersons').innerHTML=W.persons.map((p,i)=>`<div class="pp"><img src="${p.url}" alt="${esc(t('人物照片 {count}',{count:i+1}))}"><small>${p.w}×${p.h}</small><button class="x" data-rmp="${i}" aria-label="${esc(t('移除'))}">×</button></div>`).join('');
 $('#wbDrop').classList.toggle('mini',W.persons.length>0);$('#wbDrop').hidden=W.persons.length>=3;$('#wbChar').hidden=!G||hasPerson();
 $('#wbChars').innerHTML=CHARS.map(c=>`<button class="chip ${W.char==c[0]?'on':''}" data-char="${c[0]}">${t(c[1])}</button>`).join('');$('#wbCharTxt').hidden=W.char!='custom';if(!localeOnly)$('#wbCharTxt').value=W.charTxt;
 $('#wbG').innerHTML=W.garments.length?W.garments.map((g,i)=>pickRow(g,'costume',i)).join(''):`<button class="empty0" data-pick="costume"><span><b>${t('选择服装')}</b><small>${t('从库里选，或上传图片')}</small></span></button>`;
 $('#wbPo').innerHTML=W.poses.length?W.poses.map((p,i)=>pickRow(p,'pose',i)).join(''):`<button class="empty0" data-pick="pose"><span><b>${t('选择姿势（可选）')}</b><small>${t(G?'不选就随机':'不选就保持原姿势')}</small></span></button>`;
 $('#wbBatch').hidden=W.poses.length<2;$$('[data-bm]').forEach(b=>b.classList.toggle('on',b.dataset.bm==W.bm));$('#wbAllAng').hidden=W.poses.length!=1||!A.ITEMS[(W.poses[0]||{}).k];
 $('#wbStyles').innerHTML=STYLES.map(s=>`<button class="chip ${W.style==s[0]?'on':''}" data-style="${s[0]}">${t(s[1])}</button>`).join('');$('#wbKeepBg').checked=W.keepBg;$('#wbKeepBg').closest('label').hidden=G||!hasPerson();
 $$('[data-pl]').forEach(b=>b.classList.toggle('on',b.dataset.pl==W.pl));
 const ok=!!cfg.key;$('#wbDot').className='dot'+(ok?' on':'');$('#wbProv').textContent=ok?provider(cfg.prov)+' · '+modelOf():t('未配置 API');$('#wbDot2').className='dot'+(ok?' on':'');$('#wbProv2').textContent=ok?provider(cfg.prov):t('未配置 API');$('#wbOnb').hidden=ok;
 const dn=[G?true:hasPerson(),W.garments.length>0,W.poses.length>0,!!(W.style||$('#wbExtra').value)];$$('.step[data-s]').forEach(e=>e.classList.toggle('done',dn[e.dataset.s-1]));
 const jobs=nJobs();$('#wbEst').textContent=t('将生成 {count} 张',{count:jobs});
 const miss=[!G&&!hasPerson()&&'人物照片',!W.garments.length&&'服装',!ok&&'API 密钥'].filter(Boolean).map(key=>t(key));
 $('#wbHint').textContent=miss.length?t('还缺：{items}',{items:miss.join(locale()=='en'?', ':'、')}):t('每张约半分钟');
 $('#wbHint').classList.toggle('miss',!!miss.length);
 const need=!G&&!hasPerson()?'请先上传人物照片':!W.garments.length?'请先选择服装':'';
 const go=$('#wbGo');
 if(W.busy){const label=go.lastChild;if(label?.nodeType===Node.TEXT_NODE)label.textContent=t('生成中…')}
 else{go.disabled=!!need;go.title=need?t(need):'';go.textContent=t(need||'生成')}
 $$('.flow [data-f]').forEach(e=>e.classList.toggle('on',e.dataset.f<4?dn[e.dataset.f-1]&&(e.dataset.f!=3||W.poses.length>0):!need.length));
 if(localeOnly)return;
 SV('wbSel',{g:W.garments.filter(g=>g.kind=='lib').map(g=>g.k),p:W.poses.filter(p=>p.kind=='lib').map(p=>[p.k,p.ai])});reprompt()}
const nJobs=()=>(W.poses.length>1&&W.bm=='each'?W.poses.length:1)*(+$('#wbN').value||1);
// ---------- 上传 ----------
async function addPortrait(it){if(W.persons.length>=3)return toast('最多 3 张人物照片');try{const x=await toJpeg(it.m,1536);W.persons.push({blob:x.blob,url:URL.createObjectURL(x.blob),w:x.w,h:x.h,k:it.k});render();toast(W.mode=='gen'?'已设为脸部参考（生成时保持这张脸）':'已设为人物照片')}catch(e){toast('人像加载失败')}}
async function addPersons(files){files=[...files].filter(f=>/^image\//.test(f.type));if(!files.length)return toast('请选择图片文件');for(const f of files){if(W.persons.length>=3){toast('最多 3 张人物照片');break}const u=URL.createObjectURL(f);try{const r=await toJpeg(u,1536);W.persons.push({blob:r.blob,url:URL.createObjectURL(r.blob),w:r.w,h:r.h})}catch(e){toast('无法读取这张图片')}finally{URL.revokeObjectURL(u)}}render()}
const drop=$('#wbDrop');$('#wbFile').onchange=e=>{addPersons(e.target.files);e.target.value=''};
['dragenter','dragover'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add('over')}));['dragleave','drop'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove('over')}));
drop.addEventListener('drop',e=>addPersons(e.dataTransfer.files));drop.addEventListener('keydown',e=>{if(e.key=='Enter'||e.key==' '){e.preventDefault();$('#wbFile').click()}});
$('#wbGFile').onchange=async e=>{const fs=[...e.target.files];e.target.value='';W.garments=W.garments.filter(g=>g.kind=='file');for(const f of fs){if(W.garments.length>=2){toast('最多上传 2 张服装图（上装 + 下装）');break}const u=URL.createObjectURL(f);try{const r=await toJpeg(u,1280);URL.revokeObjectURL(u);W.garments.push({kind:'file',blob:r.blob,url:URL.createObjectURL(r.blob),name:f.name})}catch(x){toast('无法读取服装图')}}render()};
document.addEventListener('paste',e=>{if(document.body.classList.contains('studio')&&!/INPUT|TEXTAREA/.test(document.activeElement.tagName)){const f=[...e.clipboardData.files].filter(f=>/^image/.test(f.type));if(f.length)addPersons(f)}});
$('#studio').addEventListener('click',e=>{const t=e.target;let b;
 if(b=t.closest('[data-rm]')){const i=+b.dataset.i;b.dataset.rm=='pose'?W.poses.splice(i,1):W.garments.splice(i,1);render()}
 if(b=t.closest('[data-rmp]')){W.persons.splice(+b.dataset.rmp,1);render()}
 if(b=t.closest('[data-pick]'))picker(b.dataset.pick);
 if(b=t.closest('[data-pl]')){W.pl=b.dataset.pl;SV('wbPl',W.pl);reprompt(true);render()}
 if(b=t.closest('[data-mode]')){W.mode=b.dataset.mode;SV('wbMode',W.mode);if(W.mode=='gen'&&W.style=='keep'){W.style='studio'}if(W.mode=='tryon'&&W.style=='studio'&&!W.dirtyStyle)W.style='keep';W.dirty=false;render()}
 if(b=t.closest('[data-char]')){W.char=b.dataset.char;SV('wbChar',W.char);render()}
 if(b=t.closest('[data-style]')){W.style=b.dataset.style;W.dirtyStyle=1;SV('wbStyle',W.style);render()}
 if(b=t.closest('[data-bm]')){W.bm=b.dataset.bm;SV('wbBm',W.bm);render()}});
$('#studio').addEventListener('change',e=>{const s=e.target.closest('[data-ang]');if(s){W.poses[+s.dataset.ang].ai=+s.value;render()}if(e.target.id=='wbN')render();if(e.target.id=='wbKeepBg'){W.keepBg=e.target.checked;SV('wbKeepBg',W.keepBg);render()}});
$('#wbCharTxt').oninput=e=>{W.charTxt=e.target.value;SV('wbCharTxt',W.charTxt);reprompt()};
$('#wbAllAng').onclick=()=>{const p=W.poses[0],it=A.ITEMS[p.k];W.poses=it.angles.slice(0,6).map((a,i)=>({kind:'lib',k:p.k,ai:i}));toast('已展开 {count} 个角度',null,{count:W.poses.length});render()};
$('#wbPrompt').oninput=()=>W.dirty=true;$('#wbExtra').oninput=()=>reprompt();$('#wbReP').onclick=()=>{reprompt(true);toast('已按当前选择重新生成提示词')};
$('#wbCopyP').onclick=()=>A.copy($('#wbPrompt').value,'提示词');
// ---------- 选择器 ----------
let pkType='costume',pkSelected=false;
function pickerTitle(){
 $('#pkT').textContent=pkType=='pose'&&pkSelected?t('选姿势（{count}/6）',{count:W.poses.length}):
  t({pose:'选择姿势（可多选，最多 6 个）',portrait:'选择人像（作为人物 / 脸部参考）',anime:'选择动画服装',costume:'选择服装'}[pkType]);
}
async function picker(type){pkType=type;pkSelected=false;pickerTitle();$('#pkDone').hidden=type!='pose';$('#pk').hidden=false;document.body.style.overflow='hidden';$('#pkQ').value='';$('#pkG').innerHTML='<div class="skel"></div>'.repeat(12);await A.load(type);drawPk();setTimeout(()=>$('#pkQ').focus(),50)}
function drawPk(){const q=$('#pkQ').value.toLowerCase().trim().split(/\s+/).filter(Boolean),L=A.DATA[pkType].filter(A.ok).filter(it=>q.every(w=>(it._s||[it.id,it.zh,it.en,it.cat,it.line||''].join(' ').toLowerCase()).includes(w))).slice(0,150),sel=new Set(W.poses.map(p=>p.k));
 $('#pkG').innerHTML=L.length?L.map(it=>`<button data-k="${it.k}" class="${pkType} ${sel.has(it.k)?'on':''}" title="${esc(A.title(it))}"><img loading="lazy" src="${A.thumb(it)}" alt="${esc(A.title(it))}"><span>${esc(A.title(it))}</span></button>`).join(''):`<p class="fine">${t('没有匹配的结果')}</p>`}
let pq;$('#pkQ').oninput=()=>{clearTimeout(pq);pq=setTimeout(drawPk,150)};const pkClose=()=>{$('#pk').hidden=true;document.body.style.overflow='';render()};$('#pkX').onclick=pkClose;$('#pkDone').onclick=pkClose;
$('#pk').onclick=e=>{if(e.target.id=='pk')return pkClose();const b=e.target.closest('[data-k]');if(!b)return;const k=b.dataset.k;
 if(pkType=='pose'){const i=W.poses.findIndex(p=>p.k==k);if(i>=0)W.poses.splice(i,1);else if(W.poses.length>=6)return toast('最多选择 6 个姿势');else W.poses.push({kind:'lib',k,ai:A.ITEMS[k].ai});b.classList.toggle('on',i<0);pkSelected=true;pickerTitle()}
 else if(pkType=='portrait'){pkClose();addPortrait(A.ITEMS[k])}
 else{W.garments=[{kind:'lib',k}];pkClose()}};
// ---------- 设置 ----------

// ---------- 减少误拦截：只改发送给服务商的措辞，不改服装、姿势 ----------
// [匹配, 替换]，按顺序执行；替换为空表示删掉
const NEUTRAL=[
 [/(?:胸部|臀部|腰臀|身材)(?:曲线|线条)?(?:突出|丰满|饱满|凸显)/g,''],[/凸显(?:身材|曲线|胸部|臀部)/g,''],[/火辣|撩人|诱惑|魅惑|勾人|性感/g,'时尚'],
 [/紧身/g,'修身'],[/露肩/g,'一字肩'],[/露背/g,'开背设计'],[/露脐/g,'短款'],[/低胸/g,'V 领'],[/透视/g,'薄纱拼接'],
 [/比基尼|泳装|泳衣/g,'泳池边时装'],[/情趣内衣|内衣/g,'内搭'],[/裸露|裸体|半裸/g,''],
 [/\b(?:emphasi[sz]ing|accentuating|showing off|highlighting) (?:her |his |the )?(?:curves|figure|body|bust|chest|hips|cleavage)\b/gi,''],
 [/\b(?:curvy|voluptuous|busty)\b/gi,''],[/\b(?:sexy|seductive|sultry|alluring|provocative|hot)\b/gi,'stylish'],
 [/\b(?:skin-?tight|bodycon)\b/gi,'fitted'],[/\btight\b/gi,'fitted'],[/\boff[- ]the[- ]shoulder\b/gi,'off-shoulder neckline'],[/\bbackless\b/gi,'open-back design'],
 [/\b(?:bikini|swimsuit|swimwear)\b/gi,'swimwear fashion catalog piece'],[/\b(?:lingerie|underwear|bra and panties)\b/gi,'loungewear catalog set'],
 [/\b(?:nude|naked|topless|cleavage|bust|busty)\b/gi,''],[/\bsee-?through\b/gi,'sheer-panel'],[/\blow-?cut\b/gi,'V-neck'],
];
const FRAME={en:'Professional e-commerce fashion try-on photo for a clothing catalog. The subject is an adult, fully clothed in exactly the reference garments (same design, color and cut, nothing added or removed), keeping the same identity, in a natural, relaxed, non-suggestive pose, in a tasteful studio or lifestyle setting.',
 zh:'服装电商的专业试穿照片，用于商品目录。人物是成年人，完整穿着参考图中的服装（款式、颜色、剪裁完全一致，不增不减），保持同一人的长相，姿势自然放松，场景为简洁的影棚或生活场景。'};
const neutralOn=()=>LS('wbNeutral')!==false;$('#wbNeutral').checked=neutralOn();$('#wbNeutral').onchange=e=>{SV('wbNeutral',e.target.checked);toast(e.target.checked?'已开启减少误拦截':'已关闭减少误拦截，将按原提示词发送')};
const isAdultJob=set=>[...W.garments,...(set||[])].some(g=>g.kind=='lib'&&A.ITEMS[g.k]&&A.ITEMS[g.k].a);
function neutralize(p){let t=p;for(const [a,b] of NEUTRAL)t=t.replace(a,b?'\x01'+b+'\x01':'\x02');
 t=t.replace(/\b(with|and|in)\s+\x02\s+(?:and|with)\b/gi,'$1').replace(/\x01\x02*\x01/g,'、').replace(/\x01\s+\x01/g,' ').replace(/[\x01]/g,'').replace(/\s*\x02\s*/g,' ')
  .replace(/(^|[，,、；;：:。.\n])\s*(?:and|with|,)?\s*(?=[，,、；;。.\n]|$)/g,'$1').replace(/([，、；])[，、；]+/g,'$1').replace(/([,;])\s*[,;]+/g,'$1').replace(/[ \t]{2,}/g,' ').replace(/\s+([,.;，。；、])/g,'$1').replace(/^[，,、]\s*|[，,、]\s*$/gm,'').replace(/[,，、]\s*([.。;；])/g,'$1');
 const zh=/[\u4e00-\u9fa5]/.test(t.slice(0,40))&&W.pl!='en';return FRAME[zh?'zh':'en']+'\n'+t}
// 表示文言の更新と入力の初期化を分け、言語変更時は編集中の値を保持します。
const cfgLink=(url,label)=>`<a href="${url}" target="_blank" rel="noopener">${esc(label)}</a>`;
function cfgLabels(prov){
 const P=PROV[prov];
 $('#cfBase').placeholder=P.base||t('https://你的中转地址/v1');
 $('#cfKey').placeholder=prov=='gemini'?'AIza…':t('sk-… / 方舟 API Key');
 $('#cfEye').textContent=t($('#cfKey').type=='password'?'显示':'隐藏');
 const help={
  openai:()=>t('在 {link} 创建密钥；gpt-image-1 需要已验证的组织。',{link:cfgLink('https://platform.openai.com/api-keys','platform.openai.com/api-keys')}),
  gemini:()=>t('在 {link} 免费获取 API Key（AIza 开头）。',{link:cfgLink('https://aistudio.google.com/apikey','Google AI Studio')}),
  seedream:()=>t('在 {link} 开通 Seedream 模型并创建 API Key；会自动走本站代理。',{link:cfgLink('https://console.volcengine.com/ark',t('火山方舟控制台'))}),
  custom:()=>t('填写中转商提供的 Base URL（通常以 /v1 结尾）与密钥，并按中转文档选择接口协议。')
 };
 $('#cfHelp').innerHTML=help[prov]();
}
let cfgMessage;
function cfgFill(){
 $$('[name=prov]').forEach(r=>r.checked=r.value==cfg.prov);
 const P=PROV[cfg.prov];
 $('#cfBase').value=cfg.base;$('#cfKey').value=cfg.key;
 $('#cfModel').value=cfg.model;$('#cfModel').placeholder=P.model;
 $('#cfModels').innerHTML=P.models.map(m=>`<option value="${m}">`).join('');
 $('#cfField').value=cfg.field;$('#cfProto').value=cfg.proto;$('#cfProtoW').hidden=cfg.prov!='custom';
 $('#cfFieldW').hidden=!(cfg.prov=='custom'&&cfg.proto=='edits');$('#cfProxy').checked=cfg.proxy;
 cfgLabels(cfg.prov);cfgMessage=null;$('#cfMsg').textContent='';$('#cfMsg').className='fine';
}
function cfgRead(){return{prov:($('[name=prov]:checked')||{}).value||'openai',base:$('#cfBase').value.trim(),key:$('#cfKey').value.trim(),model:$('#cfModel').value.trim(),field:$('#cfField').value,proto:$('#cfProto').value,proxy:$('#cfProxy').checked}}
const cfgOpen=()=>{cfgFill();$('#cfg').hidden=false;document.body.style.overflow='hidden'},cfgClose=()=>{$('#cfg').hidden=true;document.body.style.overflow=''};
$('#wbCfg').onclick=cfgOpen;$('#wbCfg2').onclick=cfgOpen;$('#wbOnbGo').onclick=cfgOpen;$('#cfgX').onclick=cfgClose;$('#cfg').addEventListener('click',e=>{if(e.target.id=='cfg')cfgClose()});
$$('[name=prov]').forEach(r=>r.onchange=()=>{const o=cfgRead();Object.assign(cfg,o,{base:'',model:''});if(o.prov=='seedream')cfg.proxy=true;cfgFill();if(o.prov=='seedream')msg('火山方舟接口不允许浏览器跨域，已开启本站代理')});
$('#cfProto').onchange=()=>{cfg.proto=$('#cfProto').value;$('#cfFieldW').hidden=cfg.proto!='edits'};
$('#cfEye').onclick=()=>{const k=$('#cfKey');k.type=k.type=='password'?'text':'password';$('#cfEye').textContent=t(k.type=='password'?'显示':'隐藏')};
$('#cfSave').onclick=()=>{const o=cfgRead();if(o.prov=='custom'&&!o.base)return msg('自定义中转需要填写 Base URL',1);Object.assign(cfg,o);SV('wbCfg',cfg);render();cfgClose();toast('API 设置已保存在本机')};
$('#cfClr').onclick=()=>{cfg.key='';$('#cfKey').value='';SV('wbCfg',cfg);render();msg('已从本机清除密钥')};
function msg(key,bad,params){
 cfgMessage=typeof key=='function'?key:()=>t(key,params);
 const m=$('#cfMsg');m.textContent=cfgMessage();m.className='fine '+(bad?'bad':'good');
}
$('#cfTest').onclick=async()=>{const o=cfgRead();if(!o.key)return msg('请先填写 API Key',1);if(o.prov=='custom'&&!o.base)return msg('请填写 Base URL',1);const old=Object.assign({},cfg);Object.assign(cfg,o);msg('正在连接…');
 try{const g=cfg.prov=='gemini',url=g?`${root()}/models/${encodeURIComponent(modelOf())}`:`${root()}/models`;const r=await call(url,{method:'GET',headers:auth()});const j=await r.json().catch(()=>null);
  if(!r.ok){if(cfg.prov=='seedream'&&r.status==404)return msg('地址可达、密钥已被接受（方舟不提供模型列表接口，可直接生成测试）');throw await apiErr(r,j)}
  if(g)msg('连接成功：模型 {model} 可用',false,{model:j&&j.displayName||modelOf()});
  else{const ids=(j&&j.data||[]).map(m=>m.id),model=modelOf();
   const key=!ids.length?'连接成功：共 {count} 个模型':ids.includes(model)?'连接成功：共 {count} 个模型，包含 {model}':'连接成功：共 {count} 个模型，但未找到 {model}（中转可能不列出，可直接尝试）';
   msg(key,false,{count:ids.length,model})}}
 catch(e){msg(()=>nice(e),1)}finally{Object.assign(cfg,old)}};
// ---------- 请求 ----------
function auth(){return cfg.prov=='gemini'?{'x-goog-api-key':cfg.key}:{Authorization:'Bearer '+cfg.key}}
const p2=n=>String(n).padStart(2,'0'),stamp=d=>`${d.getFullYear()}${p2(d.getMonth()+1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
const OFF=/^(api\.openai\.com|generativelanguage\.googleapis\.com|ark\.[a-z0-9-]+\.(volces|bytepluses)\.com)$/;
function call(url,o){let hn='';try{hn=new URL(url).hostname}catch(e){}const cu=cfg.prov=='custom'||!OFF.test(hn);if(!cfg.proxy&&!cu)return fetch(url,o);const h=new Headers(o.headers||{});h.set('x-target-url',url);if(cu)h.set('x-proxy-custom','1');return fetch('/api/proxy',Object.assign({},o,{headers:h}))}
async function fetchResult(url){let r=await fetch(url).catch(()=>null);if(!r||!r.ok)r=await fetch('/api/proxy',{headers:{'x-target-url':url,'x-proxy-kind':'image'}}).catch(()=>null);if(r&&r.ok)return r.blob();const e=Error('');e.ui=()=>t('结果图片无法在浏览器中下载，请直接打开：{url}',{url});throw e}

const SAFE_RE=/safety system|safety_violations|moderation_blocked|content_policy_violation|content policy|SensitiveContent|sensitive content|PROHIBITED_CONTENT|IMAGE_SAFETY|\bSAFETY\b|BLOCKLIST|SPII|blocked by|内容安全|敏感/i;
const CAT=[[/minor|child|CSAM/i,'涉及未成年人'],[/sexual|SEXUALLY_EXPLICIT|nudity|porn|色情/i,'性感/暴露内容'],[/violen|gore|血腥|暴力/i,'暴力或血腥'],[/self-?harm/i,'自残'],[/hate|HATE_SPEECH/i,'仇恨'],[/harass/i,'骚扰'],[/illicit|DANGEROUS/i,'危险或违法内容'],[/SPII|personal/i,'个人隐私信息'],[/copyright|RECITATION|trademark/i,'版权内容']];
function safeErr(raw,j,rid){const t=String(raw||'')+' '+JSON.stringify(j||'');if(!SAFE_RE.test(t))return null;const e=Error(String(raw||'safety'));const c=CAT.filter(x=>x[0].test(t)).map(x=>x[1]);
 e.safe={cats:[...new Set(c)],where:/InputImage|input image/i.test(t)?'in':/OutputImage|output/i.test(t)?'out':'',rid:rid||(t.match(/req_[A-Za-z0-9]+/)||[])[0]||''};
 let r=String(raw||'').trim();if(cfg.key)r=r.split(cfg.key).join('***');e.raw=r||t.slice(0,600);e.ui=()=>t('被服务商的安全审核拦下了');return e}
async function apiErr(r,j){if(j===undefined)j=await r.json().catch(()=>null);const raw=(j&&(j.error&&(j.error.message||j.error.status||j.error)||j.message))||r.statusText||'';{const se=safeErr(typeof raw=='string'?raw:JSON.stringify(raw),j,(j&&j.error&&j.error.request_id)||r.headers.get('x-request-id'));if(se){se.status=r.status;return se}}
 const m={400:'请求参数有误：常见原因是模型不支持参考图、画幅尺寸不对或图片格式不支持，可换个模型或画幅再试',401:'密钥无效或已过期，请检查 API Key',403:'没有权限：密钥无此模型权限、账户未验证，或所在地区不受支持',404:'地址或模型不存在：请检查 Base URL 和模型名',413:'图片太大，请换一张更小的照片',429:'请求过于频繁或额度已用完，请稍后再试或检查账户余额',500:'服务商内部错误，请稍后重试',502:'网关错误（中转服务不可用）',503:'服务暂时不可用，请稍后重试',504:'服务商响应超时，请重试'}[r.status]||'请求失败（HTTP {status}）';
 let t=String(typeof raw=='string'?raw:JSON.stringify(raw));if(cfg.key)t=t.split(cfg.key).join('***');const bad=/API_KEY_INVALID|API key not valid|invalid api key|Incorrect API key|AuthenticationError|InvalidApiKey/i.test(t+' '+JSON.stringify(j||''));const e=Error(t);e.status=r.status;e.ui=()=>apiMessage(bad?'密钥无效或已过期，请检查 API Key':m,r.status,t);return e}
// プロキシ由来の既知の文言を翻訳し、提供元の任意の応答はそのまま表示します。
function apiMessage(key,status,detail){
 const header=t(key,{status});
 return detail?header+'\n'+t('服务商返回：{detail}',{detail:t(detail.slice(0,300))}):header;
}
function nice(e){if(e.name=='AbortError')return t('已取消');if(e instanceof TypeError)return t('无法连接到服务商：网络不通，或该地址不允许浏览器跨域访问（CORS）。\n可在 API 设置中开启「通过本站代理转发」。');return e.ui?.()||e.message||String(e)}
const AR={auto:null,'2:3':'1024x1536','3:4':'1024x1536','9:16':'1024x1536','1:1':'1024x1024','4:3':'1536x1024','16:9':'1536x1024'};
const SD={auto:'1728x2304','2:3':'1664x2496','3:4':'1728x2304','9:16':'1440x2560','1:1':'2048x2048','4:3':'2304x1728','16:9':'2560x1440'};
const toB=async d=>(await fetch('data:image/png;base64,'+d)).blob();
async function openaiData(j){const d=j&&j.data&&j.data[0];if(!d){const e=Error('');const detail=j?.error?.message;e.ui=()=>detail?t('服务商没有返回图片数据：{detail}',{detail}):t('服务商没有返回图片数据');throw e}return d.b64_json?toB(d.b64_json):fetchResult(d.url)}
function geminiMessage(reason,detail){
 const header=reason?t('模型没有返回图片（{reason}，可能触发了安全策略）',{reason}):t('模型没有返回图片');
 return detail?header+'\n'+t('模型回复：{detail}',{detail:detail.slice(0,300)}):header;
}
async function genOnce(imgs,prompt,sig){const ar=$('#wbAR').value,m=modelOf(),P=proto();let warn='';
 if(P=='gemini'){const parts=[{text:prompt}];for(const b of imgs)parts.push({inline_data:{mime_type:b.type||'image/jpeg',data:await b64(b)}});const gc={responseModalities:['TEXT','IMAGE']};if(ar!='auto')gc.imageConfig={aspectRatio:ar};
  const r=await call(`${root()}/models/${encodeURIComponent(m)}:generateContent`,{method:'POST',signal:sig,headers:Object.assign({'Content-Type':'application/json'},auth()),body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:gc})});
  const j=await r.json().catch(()=>null);if(!r.ok)throw await apiErr(r,j);const c=j&&j.candidates&&j.candidates[0],ps=((j&&j.candidates)||[]).flatMap(c=>(c.content&&c.content.parts)||[]),im=ps.find(p=>(p.inlineData||p.inline_data||{}).data);
  if(!im){const why=(j&&j.promptFeedback&&j.promptFeedback.blockReason)||(c&&c.finishReason);{const rs=(c&&c.safetyRatings||[]).filter(x=>x.blocked||/HIGH|MEDIUM/.test(x.probability||'')).map(x=>x.category).join(' ');const se=why&&/SAFETY|PROHIBITED|BLOCKLIST|SPII|OTHER/i.test(why)?safeErr(why+' '+rs+' '+((c&&c.finishMessage)||''),null,j&&j.responseId):null;if(se)throw se}const t=ps.map(p=>p.text).filter(Boolean).join(' ');const e=Error(t);e.ui=()=>geminiMessage(why,t);throw e}
  const d=im.inlineData||im.inline_data;return{blob:await(await fetch(`data:${d.mimeType||d.mime_type||'image/png'};base64,${d.data}`)).blob()}}
 const json=async(withImgs,extra)=>{const body=Object.assign({model:m,prompt,n:1},extra);if(withImgs&&imgs.length)body.image=await Promise.all(imgs.map(dataURL));
  const r=await call(`${root()}/images/generations`,{method:'POST',signal:sig,headers:Object.assign({'Content-Type':'application/json'},auth()),body:JSON.stringify(body)});const j=await r.json().catch(()=>null);if(!r.ok)throw await apiErr(r,j);return openaiData(j)};
 if(P=='seedream'){const ex={size:SD[ar]||SD.auto,response_format:'b64_json',watermark:false,sequential_image_generation:'disabled'};try{return{blob:await json(true,ex)}}catch(e){if(!e.safe&&e.status==400&&/image|参考/i.test(e.message)){warn='该模型没有接收参考图，结果只按文字生成，人物与服装可能对不齐。';return{blob:await json(false,ex),warn}}throw e}}
 const sz=AR[ar]||(/^gpt-image/.test(m)?'auto':'1024x1024');
 if(P=='json')return{blob:await json(true,{size:sz})};
 const edits=async field=>{const fd=new FormData();fd.append('model',m);fd.append('prompt',prompt);const one=/^dall-e-2$/.test(m);(one?imgs.slice(0,1):imgs).forEach((b,i)=>fd.append(field,b,`ref-${i+1}.jpg`));fd.append('n','1');fd.append('size',one&&sz=='auto'?'1024x1024':sz);
  const r=await call(`${root()}/images/edits`,{method:'POST',signal:sig,headers:auth(),body:fd});const j=await r.json().catch(()=>null);if(!r.ok)throw await apiErr(r,j);return openaiData(j)};
 const f0=cfg.prov=='custom'?cfg.field:'image[]';
 try{return{blob:await edits(f0)}}catch(e){if(e.name=='AbortError'||e.safe)throw e;
  if(e.status==400&&/image/i.test(e.message)&&!/safety|moderation|reject/i.test(e.message)){try{return{blob:await edits(f0=='image[]'?'image':'image[]'),warn:'已自动改用另一种图片字段名重试成功。'}}catch(x){}}
  if([404,405,415,501].includes(e.status)||/edits|not supported|unsupported|no such|invalid url/i.test(e.message)){try{return{blob:await json(true,{size:sz}),warn:'该接口不支持 images/edits，已自动改用 images/generations（JSON 多图）。'}}catch(x){if(x.name=='AbortError')throw x;return{blob:await json(false,{size:sz}),warn:'该接口不支持参考图，结果只按文字生成，人物与服装可能对不齐。'}}}
  throw e}}
// ---------- 进度 ----------
let T0,tick,PR=0,done=0,total=1,stageKey,stageParams,warnings=[],lastError;
function stage(key,params){stageKey=key;stageParams=params;$('#wbStage1').textContent=t(key,params)}
function progressTime(){
 const seconds=Math.round((Date.now()-T0)/1000);
 $('#wbTime').textContent=t('{count} 秒',{count:seconds})+(total>1?' · '+t('已完成 {done} / {total}',{done,total}):'');
}
function busy(on){
 $('#wbBusy').hidden=!on;$('#wbGo').classList.toggle('run',on);$('#wbGo').disabled=on;clearInterval(tick);
 if(!on){render();return}
 $('#wbGo').innerHTML=`<i class="ring"></i>${t('生成中…')}`;
 T0=Date.now();PR=.03;progressTime();
 tick=setInterval(()=>{const cap=(done+.95)/total;PR=Math.max(done/total,Math.min(cap,PR+(cap-PR)*.03));$('#wbProg').style.transform=`scaleX(${PR})`;progressTime()},250);
}
async function run(){if(!cfg.key){toast('请先配置你的 API');return cfgOpen()}if(!isGen()&&!hasPerson())return toast('请先上传人物照片');if(!W.garments.length)return toast('请先选择服装');
 const ac=new AbortController();W.busy=ac;$('#wbErr').hidden=true;$('#wbWarn').hidden=true;
 const n=+$('#wbN').value||1,sets=W.poses.length>1&&W.bm=='each'?W.poses.map(p=>[p]):[W.poses];const jobs=[];sets.forEach(s=>{for(let i=0;i<n;i++)jobs.push(s)});
 done=0;total=jobs.length;busy(true);stage('正在准备素材…');const errs=[],warns=new Set(),got=[];
 try{const pb=W.persons.map(p=>p.blob),gb=await Promise.all(W.garments.map(assetBlob)),cache=new Map();const poseB=async p=>{const key=p.k+':'+p.ai;if(!cache.has(key))cache.set(key,assetBlob(p));return cache.get(key)};
  const custom=W.dirty?$('#wbPrompt').value.trim():null;stage(total>1?'模型正在绘制… 共 {count} 张':'模型正在绘制…',{count:total});
  let q=0;const worker=async()=>{while(q<jobs.length&&!ac.signal.aborted){const set=jobs[q++];try{const imgs=[...pb,...gb,...await Promise.all(set.map(poseB))];const prompt0=custom&&sets.length==1?custom:compose(set),soft=neutralOn()&&!isAdultJob(set),prompt=soft?neutralize(prompt0):prompt0;W.lastSent=prompt;
    const jc=new AbortController(),onA=()=>jc.abort();ac.signal.addEventListener('abort',onA);let tmo=false;const tm=setTimeout(()=>{tmo=true;jc.abort()},window.__TMO||180000);let r;try{r=await genOnce(imgs,prompt,jc.signal)}catch(x){x.sent=prompt;if(tmo&&!ac.signal.aborted){const y=Error('timeout');y.ui=()=>t('等了 3 分钟还没有返回。服务商可能正忙，稍后点「重试」。');throw y}throw x}finally{clearTimeout(tm);ac.signal.removeEventListener('abort',onA)}if(r.warn)warns.add(r.warn);const rec={t:Date.now()+Math.random(),prov:cfg.prov,model:modelOf(),prompt,orig:soft?prompt0:null,neutral:soft,mode:W.mode,label:set.map(p=>poseDesc(p,false).split('（')[0]).join(' / ')||'',poseNames:set.map(p=>A.ITEMS[p.k]).filter(Boolean).map(it=>({zh:it.zh,en:it.en,ja:it.ja})),before:pb[0]||null,after:r.blob};got.push(rec);await save(rec);W.results=got.slice();show(got.length-1)}
   catch(e){if(e.name=='AbortError')throw e;errs.push(e)}finally{done++}}};
  await Promise.all(Array.from({length:Math.min(2,jobs.length)},worker));
  if(got.length){toast(got.length>1?'完成 {count} 张':'生成完成',null,{count:got.length});hist()}if(errs.length){const e=errs.find(x=>x.safe)||errs[0];errBox(e,got.length?errs.length:0)}
  if(warns.size){$('#wbWarn').hidden=false;warnings=[...warns];$('#wbWarn').textContent=warnings.map(key=>t(key)).join(' ')}}
 catch(e){if(e.name=='AbortError'){toast('已取消生成');if(got.length)hist()}else errBox(e)}
 finally{W.busy=null;busy(false)}}
function errBox(e,count){
 lastError={e,count,providerId:cfg.prov};
 const el=$('#wbErr');el.hidden=false;el.classList.toggle('safe',!!e.safe);
 errorText();
}
function errorText(){
 const el=$('#wbErr'),{e,count,providerId}=lastError,head=count?t('{count} 张生成失败',{count}):'';
 const wasOpen=el.querySelector('details')?.open;
 if(e.safe){
  const S=e.safe, target=t(S.where=='in'?'上传的照片或服装图':S.where=='out'?'生成出来的图片':'这次请求');
  const summary=t('{provider} 判断{target}不合规。',{provider:provider(providerId)||t('服务商'),target});
  const reason=S.cats.length?t('安全审核原因：{reasons}',{reasons:S.cats.map(key=>t(key)).join(locale()=='en'?', ':'、')}):'';
  const raw=e.raw+(S.rid&&!e.raw.includes(S.rid)?'\n'+t('请求 ID：{id}',{id:S.rid}):'')+
   (e.sent?'\n\n'+t('实际发送的提示词')+(neutralOn()?t('（已开启减少误拦截）'):'')+':\n'+e.sent:'');
  el.innerHTML=`<b>${esc((head?head+' · ':'')+t('被服务商的安全审核拦下了'))}</b><p>${esc(summary+(reason?' '+reason:'')+' '+t('真人照片配上比较暴露的服装（泳装、内衣、露背等）很容易被拦，OpenAI 审核最严，Gemini 和豆包 Seedream 相对宽松一些。'))}</p>
    <p class="fine">${t('可以换一家服务商，或换一套遮挡多一点的服装。原样重试大多还会被拦。')}</p>
    <div class="row"><button class="sm" data-ef="prov">${t('换服务商重试')}</button><button class="sm ghost" data-ef="cos">${t('换一套服装')}</button><button class="sm ghost" id="wbRetry">${t('重试')}</button></div>
    ${neutralOn()?'':`<div class="row"><button class="sm" data-ef="neutral">${t('打开减少误拦截后重试')}</button></div>`}
    <details class="raw" ${wasOpen?'open':''}><summary>${t('查看原始信息')}</summary><pre>${esc(raw)}</pre><button class="sm ghost" data-ef="copy">${t('复制')}</button></details>`;
  return;
 }
 el.innerHTML=`<b>${head||t('生成失败')}</b><p>${esc(nice(e)).replace(/\n/g,'<br>')}</p><div class="row"><button class="sm" id="wbRetry">${t('重试')}</button><button class="sm ghost" data-open-cfg>${t('检查 API 设置')}</button></div>`;
}
$('#wbStage').addEventListener('click',e=>{const f=e.target.closest('[data-ef]');if(f){const k=f.dataset.ef;if(k=='prov'){cfgOpen();const p=$('#cfg .prov');p.scrollIntoView({block:'start'});p.classList.remove('hl');void p.offsetWidth;p.classList.add('hl');const o=$('[name=prov]:not(:checked)');o&&o.focus()}if(k=='cos')picker('costume');if(k=='neutral'){SV('wbNeutral',true);$('#wbNeutral').checked=true;run()}if(k=='copy')A.copy?A.copy(f.previousElementSibling.textContent):navigator.clipboard.writeText(f.previousElementSibling.textContent).then(()=>toast('已复制'));return}if(e.target.id=='wbRetry')run();if(e.target.closest('[data-open-cfg]'))cfgOpen()});
$('#wbGo').onclick=run;$('#wbAgain').onclick=run;$('#wbStop').onclick=()=>W.busy&&W.busy.abort();
// ---------- 结果 ----------
const ru=new Map();const U=b=>{if(!ru.has(b))ru.set(b,URL.createObjectURL(b));return ru.get(b)};
let fromHistory=false;
function resultLabel(r){
 // 保存済みの旧形式の履歴も、元のポーズ名で表示できます。
 return r.poseNames?.map(it=>displayLabel(it.zh,it.en,it.ja)).join(' / ')||r.label||'';
}
function resultText(r){
 let details=$('#wbSentD');
 if(!details){
  details=document.createElement('details');details.id='wbSentD';details.className='raw sent';
  $('#wbOutAct').after(details);
 }
 details.hidden=!r.prompt;
 const summary=t('查看原始信息')+(r.neutral?' · '+t('已减少误拦截'):'');
 const original=r.orig?t('原提示词：')+'\n'+r.orig+'\n\n':'';
 details.innerHTML=r.prompt?`<summary>${summary}</summary><pre>${esc(original+t('实际发送：')+'\n'+r.prompt)}</pre>`:'';
 $('#wbCmpT').textContent=t(W.cmp?'关闭对比':'前后对比');
 const meta=fromHistory?new Date(r.t).toLocaleString(locale()):resultLabel(r);
 $('#wbMeta').textContent=[provider(r.prov),r.model,meta].filter(Boolean).join(' · ');
 $$('#wbRes img').forEach((img,i)=>img.alt=t('结果 {count}',{count:i+1}));
}
function show(i,history=false){
 const r=W.results[i];if(!r)return;
 fromHistory=history;
 W.ri=i;const a=U(r.after),hasB=!!r.before;
 $('#wbAfter').src=a;if(hasB)$('#wbBefore').src=U(r.before);
 $('#wbCmp').hidden=false;$('#wbCmp').classList.toggle('solo',!hasB||!W.cmp);$('#wbCmpT').hidden=!hasB;
 $('#wbPh0').hidden=true;$('#wbErr').hidden=true;$('#wbOutAct').hidden=false;setX(50);$('#wbZip').hidden=W.results.length<2;if(!matchMedia('(prefers-reduced-motion: reduce)').matches){$('#wbAfter').animate([{opacity:0,transform:'scale(1.03)',filter:'blur(8px)'},{opacity:1,transform:'none',filter:'none'}],{duration:620,easing:'cubic-bezier(.16,1,.3,1)'});if(hasB&&W.cmp&&!W._wig){W._wig=1;const t0=performance.now();const f=t=>{const p=(t-t0)/1400;if(p>=1)return setX(50);setX(50+Math.sin(p*Math.PI*2)*12*(1-p));requestAnimationFrame(f)};setTimeout(()=>requestAnimationFrame(f),500)}}
 const R=$('#wbRes');R.hidden=W.results.length<2;
 R.innerHTML=W.results.map((x,j)=>`<button data-ri="${j}" class="${j==i?'on':''}"><img src="${U(x.after)}" alt=""></button>`).join('');
 resultText(r);
}
$('#wbRes').onclick=e=>{const b=e.target.closest('[data-ri]');b&&show(+b.dataset.ri)};$('#wbCmpT').onclick=()=>{W.cmp=!W.cmp;show(W.ri,fromHistory)};
$('#wbZip').onclick=async()=>{if(!window.makeZip)return;const ts=stamp(new Date());const fs=W.results.map((r,i)=>({name:`posewear-${r.mode=='gen'?'gen':'tryon'}-${ts}-${String(i+1).padStart(2,'0')}.png`,blob:r.after}));window.X.dl(await makeZip(fs),`posewear-tryon-${ts}.zip`);toast('已打包 {count} 张',null,{count:fs.length})};
$('#cfExp').onclick=()=>{const withKey=confirm(t('导出时包含 API Key 吗？\n确定 = 包含，取消 = 不含密钥'));const o={...cfg};if(!withKey)delete o.key;window.X.dl(new Blob([JSON.stringify({app:'衣姿 PoseWear',type:'api-config',cfg:o},null,2)],{type:'application/json'}),t('衣姿-API设置.json'));msg(withKey?'已导出设置（含密钥，请妥善保管）':'已导出设置（不含密钥）')};
$('#cfImp').onclick=()=>$('#cfImpF').click();$('#cfImpF').onchange=async e=>{try{const j=JSON.parse(await e.target.files[0].text());const o=j.cfg||j;if(!o.prov)throw 0;Object.assign(cfg,o);SV('wbCfg',cfg);cfgFill();render();msg('已导入设置')}catch(err){msg('导入失败：文件格式不正确',1)}e.target.value=''};
$('#wbDl').onclick=()=>{const r=W.results[W.ri];if(!r)return;const l=document.createElement('a');l.href=U(r.after);l.download=`posewear-${r.mode=='gen'?'gen':'tryon'}-${stamp(new Date(r.t))}-${String(W.ri+1).padStart(2,'0')}.png`;l.click()};
$('#wbUse').onclick=async()=>{const r=W.results[W.ri];if(!r)return;const x=await toJpeg(U(r.after),1536);W.persons=[{blob:x.blob,url:URL.createObjectURL(x.blob),w:x.w,h:x.h}];W.mode='tryon';render();toast('已将结果设为新的人物照片')};
function setX(x){$('#wbCmp').style.setProperty('--x',x+'%');$('#wbRange').value=x}$('#wbRange').oninput=e=>setX(e.target.value);
// ---------- IndexedDB ----------
let dbp;const db=()=>dbp||(dbp=new Promise((r,j)=>{const q=indexedDB.open('lk-studio',1);q.onupgradeneeded=()=>q.result.createObjectStore('h',{keyPath:'t'});q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)}));
const tx=async(m,f)=>{const d=await db();return new Promise((r,j)=>{const t=d.transaction('h',m),s=t.objectStore('h'),q=f(s);t.oncomplete=()=>r(q&&q.result);t.onerror=()=>j(t.error)})};
async function save(rec){try{await tx('readwrite',s=>s.put(rec));const all=await tx('readonly',s=>s.getAllKeys());if(all.length>40)await tx('readwrite',s=>{all.slice(0,all.length-40).forEach(k=>s.delete(k))})}catch(e){}}
let hu=[];
async function hist(){
 let L=[];
 try{L=(await tx('readonly',s=>s.getAll()))||[]}catch(e){}
 L.sort((a,b)=>b.t-a.t);hu.forEach(URL.revokeObjectURL);hu=[];
 $('#wbHist').innerHTML=L.length?L.map(r=>{
  const u=URL.createObjectURL(r.after);hu.push(u);
  return `<button data-t="${r.t}"><img src="${u}" alt=""><span></span><i data-del="${r.t}" aria-label="">×</i></button>`;
 }).join(''):`<p class="fine"></p>`;
 W.hist=L;historyText();
}
function historyText(){
 if(!W.hist?.length){
  const empty=$('#wbHist .fine');if(empty)empty.textContent=t('还没有生成记录');
  return;
 }
 $$('#wbHist button[data-t]').forEach((b,i)=>{
  const r=W.hist[i],date=new Date(r.t),label=resultLabel(r);
  b.title=date.toLocaleString(locale())+(label?' · '+label:'');
  b.querySelector('img').alt=t('历史结果');
  b.querySelector('span').textContent=t(r.mode=='gen'?'生图':'试穿')+' · '+date.toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'});
  b.querySelector('[data-del]').setAttribute('aria-label',t('删除'));
 });
}
$('#wbHist').onclick=async e=>{const d=e.target.closest('[data-del]');if(d){e.stopPropagation();const rec=(W.hist||[]).find(x=>x.t==d.dataset.del);await tx('readwrite',s=>s.delete(+d.dataset.del));await hist();if(rec)toast('已删除 1 条记录',async()=>{await tx('readwrite',s=>s.put(rec));hist()});return}const b=e.target.closest('[data-t]');if(!b)return;const r=W.hist.find(x=>x.t==b.dataset.t);if(r){W.results=[r];show(0,true);$('#wbStage').scrollIntoView({behavior:'smooth',block:'nearest'})}};
$('#wbHClr').onclick=async()=>{const all=W.hist||[];if(!all.length)return toast('还没有生成记录');await tx('readwrite',s=>s.clear());await hist();toast('已清空 {count} 条记录',async()=>{await tx('readwrite',s=>{all.forEach(r=>s.put(r))});hist()},{count:all.length})};
// ---------- 对外 ----------
let inited=false;async function init(){if(inited)return;inited=true;const gk=[].concat(g0.g||[]),pk=(g0.p||[]).filter(x=>Array.isArray(x));const need=[gk.length&&'costume',gk.some(k=>k[0]=='a')&&'anime',pk.length&&'pose'].filter(Boolean);if(need.length)await Promise.all(need.map(A.load)).catch(()=>{});
 if(!W.garments.length)W.garments=gk.filter(k=>A.ITEMS[k]).slice(0,1).map(k=>({kind:'lib',k}));if(!W.poses.length)W.poses=pk.filter(x=>A.ITEMS[x[0]]).slice(0,6).map(x=>({kind:'lib',k:x[0],ai:x[1]??A.ITEMS[x[0]].ai}));hist()}
window.WB={async show(){await init();render()},async pick(it){await init();if(it.type=='pose'){if(!W.poses.some(p=>p.k==it.k)){if(W.poses.length>=6)W.poses.shift();W.poses.push({kind:'lib',k:it.k,ai:it.ai})}toast('已加入姿势参考（{count} 个）',null,{count:W.poses.length})}else if(it.type=='portrait'){await addPortrait(it)}else{W.garments=[{kind:'lib',k:it.k}];toast('已选为试穿服装')}A.setTab('studio')},_W:W,_cfg:cfg};
// 言語変更で更新するのは表示だけです。入力、生成、履歴の再読み込みは行いません。
addEventListener('uilocalechange',()=>{
 if(inited)render(true);
 if(!$('#cfg').hidden){
  cfgLabels($('[name=prov]:checked')?.value||cfg.prov);
  if(cfgMessage)$('#cfMsg').textContent=cfgMessage();
 }
 if(!$('#pk').hidden){
  pickerTitle();
  if(A.DATA[pkType])drawPk();
 }
 if(W.busy&&stageKey){stage(stageKey,stageParams);progressTime()}
 if(!$('#wbWarn').hidden)$('#wbWarn').textContent=warnings.map(key=>t(key)).join(' ');
 if(lastError&&!$('#wbErr').hidden)errorText();
 if(W.results[W.ri])resultText(W.results[W.ri]);
 historyText();
});
if(document.body.classList.contains('studio'))WB.show();
if(location.hash=='#studio'){const t0=()=>scrollTo(0,0);requestAnimationFrame(t0);addEventListener('load',()=>setTimeout(t0,0),{once:true})}
addEventListener('keydown',e=>{if(e.key=='Escape'){if(!$('#pk').hidden)pkClose();else if(!$('#cfg').hidden)cfgClose()}});
})();
// v10：手机端把密钥引导卡放到第 1 步之前
(()=>{const mq=matchMedia('(max-width:760px)'),o=document.getElementById('wbOnb');if(!o)return;const place=()=>{if(mq.matches){const s1=document.querySelector('.st-l [data-s="1"]');s1&&s1.parentNode.insertBefore(o,s1)}else document.querySelector('.st-c').prepend(o)};place();mq.addEventListener('change',place)})();
