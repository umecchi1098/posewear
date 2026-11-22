'use strict';
(()=>{const A=window.APP;if(!A)return;const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s),esc=A.esc;
const t=UI.t;
const toast=A.toast;
const locale=()=>({zh:'zh-CN',en:'en',ja:'ja'}[UI.locale]);
const provider=id=>t(PROV[id]?.name||id||'');
const LS=k=>{try{return JSON.parse(localStorage[k]||'null')}catch(e){return null}},SV=(k,v)=>{try{localStorage[k]=JSON.stringify(v)}catch(e){}};
// ---------- 服务商 ----------
const PROV={openai:{name:'OpenAI',base:'https://api.openai.com/v1',model:'gpt-image-1',models:[]},
 gemini:{name:'Gemini',base:'https://generativelanguage.googleapis.com/v1beta',model:'gemini-2.5-flash-image',models:['gemini-2.5-flash-image','gemini-3-pro-image-preview','gemini-3.1-flash-image']},
 seedream:{name:'豆包 Seedream',base:'https://ark.cn-beijing.volces.com/api/v3',model:'doubao-seedream-4-0-250828',models:['doubao-seedream-4-0-250828','doubao-seedream-4-5-251128','doubao-seedream-5-0-flash-260915']},
 comfy:{name:'ComfyUI',base:'http://127.0.0.1:8188',model:'',models:[]},
 custom:{name:'自定义中转',base:'',model:'gpt-image-1',models:['gpt-image-1','gpt-image-2','gemini-2.5-flash-image','flux-kontext-pro','qwen-image-edit','doubao-seedream-4-0-250828']}};
const cfg=Object.assign({prov:'openai',base:'',key:'',model:'',quality:'',complexity:'',field:'image[]',proto:'edits',proxy:false},LS('wbCfg')||{});
// ローカル設定を分け、クラウドのキーや接続情報を ComfyUI に渡さないようにします。
const workflowStore=window.ComfyWorkflows;
let comfyState=workflowStore.load(),comfy=workflowStore.active(comfyState);
function useComfyState(next){
 comfyState=next;
 comfy=workflowStore.active(comfyState);
}
const isComfy=()=>cfg.prov=='comfy';
const COMFY_LIMIT='ComfyUI 需要 1 张人物照和 1 张服装图。';
const COMFY_POSE='请设置 ComfyUI 的姿势图片节点，或移除已选的姿势。';
const canPickPose=()=>!isComfy()||!!comfy.mapping.pose;
// ---------- 预设 ----------
// モデル・スタイルの各行は、識別子、UIラベル、英語・中国語・日本語の生成指示です。
const CHARS=[['asia','东亚女性','an adult East Asian woman in her mid-20s, long black hair, natural makeup, slim build','一位二十多岁的成年东亚女性，黑色长发，自然淡妆，身材纤细','20代半ばの成人の東アジア系女性。黒いロングヘア、自然なメイク、細身の体型'],
 ['west','欧美女性','an adult Caucasian woman in her late 20s, wavy light-brown hair, natural makeup, athletic build','一位二十多岁的成年欧美女性，浅棕色波浪长发，自然妆容，匀称身材','20代後半の成人の欧米系女性。明るい茶色のウェーブヘア、自然なメイク、引き締まった体型'],
 ['man','男性模特','an adult East Asian man in his late 20s, short black hair, clean-shaven, tall and lean','一位二十多岁的成年东亚男性，黑色短发，干净面容，高瘦身材','20代後半の成人の東アジア系男性。短い黒髪でひげがなく、背が高く細身'],
 ['anime','动漫角色','an adult anime-style girl, long silver hair, large expressive eyes, adult proportions, clean cel-shaded illustration','一位成年动漫风格女性角色，银色长发，大眼睛，成人身材比例，干净的赛璐璐上色插画','成人のアニメ風女性キャラクター。銀色の長い髪と表情豊かな大きな目。成人の体型で、明快なセル塗りのイラスト'],
 ['custom','自定义','','','']];
const STYLES=[['keep','照片质感','photorealistic, matching the original photo quality','写实摄影质感，与原照片画质一致','元の写真の画質に合わせた写実的な写真'],['studio','影棚大片','clean high-end fashion studio, soft key light, seamless light-grey backdrop, editorial lookbook photo','高端时尚影棚，柔和主光，浅灰无缝背景，杂志画册质感','高級ファッション誌のルックブック風。柔らかな主照明と継ぎ目のない薄いグレーの背景のスタジオ写真'],
 ['street','城市街拍','candid city street-style photo, natural daylight, shallow depth of field','城市街拍抓拍，自然日光，浅景深','自然光と浅い被写界深度を使った街中のストリートスナップ'],['ecom','电商白底','e-commerce product-model photo, pure white background, even lighting, full body','电商模特图，纯白背景，均匀布光，全身构图','通販の商品ページ用モデル写真。純白の背景、均一な照明、全身が入る構図'],
 ['film','胶片氛围','35mm film photograph, warm tones, subtle grain, golden hour light','35mm 胶片摄影，暖色调，轻微颗粒，黄金时刻光线','暖色で粒子感のある35mmフィルム写真。ゴールデンアワーの光'],['anime','动漫插画','high-quality anime illustration, clean line art, soft cel shading','高质量动漫插画，干净线稿，柔和赛璐璐上色','整った線画と柔らかなセル塗りの、高精細なアニメイラスト']];
const ANG_EN={'正面':'front view','斜侧':'three-quarter view','侧面':'side profile','俯拍':'high-angle shot looking down','仰拍':'low-angle shot looking up','背面':'back view','下から':'low angle'};
// 保存済みの手動選択を引き継ぎ、初回や未知の値では英語で送信します。
const savedPromptLanguage=LS('wbPl');
const W={mode:LS('wbMode')||'tryon',persons:[],garments:[],poses:[],char:LS('wbChar')||'asia',charTxt:LS('wbCharTxt')||'',style:LS('wbStyle')||'keep',bm:LS('wbBm')||'each',pl:['en','zh','ja'].includes(savedPromptLanguage)?savedPromptLanguage:'en',keepBg:LS('wbKeepBg')??true,keepBody:LS('wbKeepBody')===true,busy:null,dirty:false,results:[],ri:0,cmp:true};
// item: {kind:'lib',k,ai?} | {kind:'file',blob,url,name}
const g0=LS('wbSel')||{};
// ---------- 工具 ----------
const normBase=b=>(b||'').trim().replace(/\/+$/,'');
function root(cfgState=cfg){const cfg=cfgState;let b=normBase(cfg.base)||PROV[cfg.prov].base;if(cfg.prov=='gemini')return/\/v1(beta|alpha)?$/.test(b)?b:b+'/v1beta';if(cfg.prov=='seedream')return b;return/\/v\d+$/.test(b)?b:b+'/v1'}
const modelOf=(state=cfg)=>(state.model||'').trim()||PROV[state.prov].model;
const proto=()=>cfg.prov=='openai'?'edits':cfg.prov=='custom'?cfg.proto:cfg.prov;
// 読み込みエラーはキーを保持し、エラー表示中に言語を切り替えても翻訳できるようにします。
function imageError(key,params){
 const error=Error(key);
 error.ui=()=>t(key,params);
 return error;
}
// 共有素材をCanvasで縮小できるよう、別オリジンの画像もCORS付きで読み込みます。
function loadImg(src){return new Promise((r,j)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>r(i);i.onerror=()=>j(imageError('图片读取失败'));i.src=src})}
async function toJpeg(src,max=1536){const i=await loadImg(src);let w=i.naturalWidth,h=i.naturalHeight,s=Math.min(1,max/Math.max(w,h));w=Math.round(w*s);h=Math.round(h*s);
 const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(i,0,0,w,h);return new Promise(r=>c.toBlob(b=>r({blob:b,w,h}),'image/jpeg',.92))}
const libSrc=a=>{const it=A.ITEMS[a.k];return it.type=='pose'?it.angles[a.ai??it.ai].i:it.i};
// コピーではAPI用の縮小を行わず、選択中の画像データを読み込みます。
async function referenceBlob(asset,signal){
 if(asset.blob)return asset.blob;
 const response=await fetch(libSrc(asset),{signal});
 if(!response.ok)throw imageError('素材下载失败（{status}）',{status:response.status});
 return response.blob();
}
async function assetBlob(a,signal){if(a.kind=='file')return a.blob;const u=URL.createObjectURL(await referenceBlob(a,signal));try{return(await toJpeg(u,1280)).blob}finally{URL.revokeObjectURL(u)}}
const b64=b=>new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(b)});
const dataURL=async b=>'data:'+(b.type||'image/jpeg')+';base64,'+await b64(b);
const isGen=()=>!isComfy()&&W.mode=='gen';const hasPerson=()=>W.persons.length>0;
// ---------- 提示词 ----------
function poseDesc(p,lang){
 const it=A.ITEMS[p.k];if(!it)return'';
 const a=it.angles[p.ai??it.ai];
 // 同じポーズでもカードと試着で別の角度を選べるため、試着側に保存した角度を使います。
 if(lang=='ja')return `${it.promptJa}（${it.lineJa}、${a.ja}）${/2人|双人/.test(it.line)?'。2人の人数と位置関係を線画に合わせる':''}`;
 return lang=='en'?`${it.en} (${it.lineEn}, ${ANG_EN[a.zh]||a.en||a.zh})${/2人|双人/.test(it.line)?' — a two-person pose: match the number of people and their relative positions':''}`:`${it.zh}（${it.line}，${a.zh}）${/2人|双人/.test(it.line)?'——双人姿势，人数与相对位置需与线稿一致':''}`}
// 素材ごとの説明はそのまま使い、体の比率だけを人物参照に合わせる指示を加えます。
const bodyInstructions = {
 en: "Body proportions: prioritize the person reference. Preserve their head-to-body ratio, relative shoulder and hip widths, and the length and thickness of their torso and limbs. Fit the outfit to their build. Recreate the pose’s orientation, balance and joint angles using their own limb lengths.",
 ja: "体型：人物参照画像を優先する。元の人物の頭身、肩幅と腰幅のバランス、胴と手足の長さ・太さを保つ。衣装はその人物の体格に合わせて着せる。ポーズは体の向き、重心、関節の曲げ方を読み取り、本人の手足の長さで再現する。",
 zh: "体型：优先参照人物图。保持原人物的头身比、肩宽与胯宽的比例，以及躯干和四肢的长度与粗细。让服装贴合本人的体型，按本人的四肢长度还原姿势的朝向、重心和关节角度。"
};
function compose(poseSet,lang=W.pl){const en=lang=='en',P=W.persons.length,G=W.garments.length,ps=poseSet||W.poses,np=ps.length,sheet=np>1;const style=STYLES.find(s=>s[0]==W.style)||STYLES[0],ch=CHARS.find(c=>c[0]==W.char)||CHARS[0],ex=$('#wbExtra').value.trim();
 const gi=W.garments.map(g=>g.kind=='lib'&&A.ITEMS[g.k]).filter(Boolean);let n=0;const rng=(c)=>{if(!c)return null;const a=n+1,b=n+c;n=b;if(lang=='ja')return a==b?`画像${a}`:`画像${a}～${b}`;return a==b?(en?`image ${a}`:`第 ${a} 张`):(en?`images ${a}–${b}`:`第 ${a}–${b} 张`)};
 const rP=rng(P),rG=rng(G),rS=rng(np);const L=[];
 if(en){L.push(P?`Fashion ${isGen()?'image generation':'virtual try-on'} using reference images. ${rP} ${P>1?'show':'shows'} the person (same individual)${G?`; ${rG} ${G>1?'show':'shows'} the outfit${G>1?' pieces (top and bottom)':''} on an invisible mannequin`:''}${np?`; ${rS} ${np>1?'are':'is'} pose sketch${np>1?'es':''}`:''}.`:`Fashion image generation from reference images. ${G?`${rG} ${G>1?'show':'shows'} the outfit on an invisible mannequin`:''}${np?`; ${rS} ${np>1?'are':'is'} pose sketch${np>1?'es':''}`:''}.`);
  L.push(P?"Subject: the person from the photo. Preserve their face, identity, hairstyle, skin tone and body proportions exactly; they must stay recognisably the same adult.":`Subject: ${(W.char=='custom'?W.charTxt:ch[2])||ch[2]||'an adult model'}. Always an adult with adult proportions.`);
  if(G)L.push(`Outfit: dress the subject in the complete outfit from ${rG}, reproducing every garment faithfully — cut, color, fabric, pattern, layering, shoes and accessories${gi.length?': '+gi.map(x=>x.en.replace(/^[^,]*outfit,\s*/,'')).join('; '):''}. Replace the original clothing entirely. Never draw the mannequin or a blank body.`);
  if(np)L.push((sheet&&W.bm=='sheet'?`Pose: draw ${np} panels in one image, one per pose sketch, same subject and outfit in every panel, with even spacing and no text: `:'Pose: ')+ps.map((p,i)=>(sheet&&W.bm=='sheet'?`(${i+1}) `:'')+poseDesc(p,'en')).join('; ')+'. Use the sketch only for body posture, weight, limb placement and camera angle; never draw sketch lines, joint circles or guide marks.');
  else if(P)L.push('Pose: keep the original pose, framing and camera angle.');
  L.push(`Look: ${P&&W.keepBg&&!isGen()?'keep the original background and lighting of the photo; ':''}${style[2]}. Natural fabric drape with realistic folds and shadows, high detail. No text, no watermark, no borders.`);
  if(ex)L.push('Additional: '+ex)}
 else if(lang=='ja'){
  // 画像番号・衣装・ポーズ・スタイルは英語版と同じ選択状態から組み立てます。
  L.push(isGen()||!P?'参照画像を使ってファッション写真を生成する。':'参照画像を使って服を着せ替える。');
  if(P)L.push(`${rP}は同一人物を写した参照写真。`);
  if(G)L.push(`${rG}は透明マネキンに着せた服${G>1?'（トップスとボトムス）':''}の参照画像。`);
  if(np)L.push(`${rS}はポーズの線画。`);
  L.push(P?'人物：写真の人物の顔立ち、髪型、肌の色、体の比率と本人らしさを忠実に保ち、同じ成人だと分かるようにする。':
   `人物：${(W.char=='custom'?W.charTxt:ch[4])||'成人のモデル'}。成人の体型で描く。`);
  if(G)L.push(`服装：${rG}のコーディネートにすべて着替え、形、色、生地、柄、重ね着、靴、アクセサリーを忠実に再現する。${gi.map(it=>it.promptJa).join(' ')}マネキンや中身のない体は描かない。`);
  if(np){
   const panels=sheet&&W.bm=='sheet';
   const poses=ps.map((p,i)=>(panels?`（${i+1}）`:'')+poseDesc(p,'ja'));
   L.push((panels?`ポーズ：線画ごとに1コマずつ、1枚に${np}コマを並べる。全コマで同じ人物と服装を保ち、余白は均等にして文字は入れない。`:'ポーズ：')+poses.join('、')+'。線画は姿勢・重心・手足の位置・カメラの角度の参考のみに使い、輪郭線、関節の丸、補助線は描かない。');
  }else if(P)L.push('ポーズ：元の写真の姿勢、構図、カメラの角度を保つ。');
  L.push(`仕上げ：${P&&W.keepBg&&!isGen()?'元の背景と照明を保つ。':''}${style[4]}。布の落ち感やしわ、影を自然に描き、細部を鮮明にする。文字、透かし、枠は入れない。`);
  if(ex)L.push('追加指示：'+ex);
 }
 else{L.push(P?`时尚${isGen()?'生图':'虚拟试穿'}，使用参考图。${rP}是人物照片（同一人）${G?`；${rG}是放在隐形人台上的服装${G>1?'（上装与下装）':''}`:''}${np?`；${rS}是姿势线稿`:''}。`:`根据参考图进行时尚生图。${G?`${rG}是放在隐形人台上的服装`:''}${np?`；${rS}是姿势线稿`:''}。`);
  L.push(P?'人物：照片中的人。严格保留其面部、身份特征、发型、肤色与身材比例，必须一眼认出是同一位成年人。':`人物：${(W.char=='custom'?W.charTxt:ch[3])||ch[3]||'一位成年模特'}。始终为成年人比例。`);
  if(G)L.push(`服装：为人物换上${rG}中的整套服装，准确还原版型、颜色、面料、图案、叠穿、鞋袜与配饰${gi.length?'：'+gi.map(x=>x.zh.replace(/[。.]$/,'')).join('；'):''}。完全替换原有衣物，不要画出人台或空白身体。`);
  if(np)L.push((sheet&&W.bm=='sheet'?`姿势：在同一张图中画 ${np} 格，每格对应一张线稿，人物与服装保持一致，均匀留白，不写文字：`:'姿势：')+ps.map((p,i)=>(sheet&&W.bm=='sheet'?`（${i+1}）`:'')+poseDesc(p,'zh')).join('；')+'。线稿只用于提取身体姿态、重心、四肢位置和镜头角度，不要画出线条、关节圆或辅助线。');
  else if(P)L.push('姿势：保持原照片的姿势、构图和拍摄角度。');
  L.push(`画面：${P&&W.keepBg&&!isGen()?'保留原照片的背景与光线；':''}${style[3]}。衣物垂坠自然，褶皱阴影真实，高细节。不要文字、水印或边框。`);
  if(ex)L.push('补充：'+ex)}
 if(P&&W.keepBody)L.push(bodyInstructions[lang]);
 return L.join('\n')}
// 個別生成では各画像に渡す線画が1枚ずつ変わります。確認用の訳も送信時と同じ分け方にします。
function poseSets(){
 return W.poses.length>1&&(isComfy()||W.bm=='each')?W.poses.map(p=>[p]):[W.poses];
}
function renderJapanesePreview(){
 const preview=$('#wbJaPreview'),output=$('#wbJaText');
 preview.hidden=W.pl=='ja'||W.dirty;
 if(preview.hidden||!preview.open){output.value='';return}
 const sets=poseSets();
 output.value=sets.map((set,i)=>(sets.length>1?`【ポーズ${i+1}】\n`:'')+compose(set,'ja')).join('\n\n');
 $('#wbJaNeutral').hidden=isComfy()||!neutralOn()||sets.every(isAdultJob);
}
let bodyInstructionActive=false;
function reprompt(force){
 const input=$('#wbPrompt');
 input.lang=W.pl=='zh'?'zh-CN':W.pl;
 const useBody=hasPerson()&&W.keepBody;
 if(force||!W.dirty){input.value=compose(isComfy()?poseSets()[0]:undefined);W.dirty=false}
 else if(bodyInstructionActive!==useBody){
  // 手編集後は全文を作り直さず、切り替えた設定の行だけを追加・削除します。
  const instruction=bodyInstructions[W.pl];
  const lines=input.value.split('\n');
  if(useBody&&!lines.includes(instruction))input.value+=(input.value?'\n':'')+instruction;
  if(!useBody)input.value=lines.filter(line=>line!==instruction).join('\n');
 }
 bodyInstructionActive=useBody;
 renderJapanesePreview();
}
// ---------- 渲染 ----------
// 素材名と撮影角度は、現在の画面言語に対応するデータを表示します。
const displayLabel=(zh,en,ja)=>({en,ja}[UI.locale]||t(zh));
const angleLabel=a=>displayLabel(a.zh,a.en,a.ja);
function pickRow(a,type,i){const it=a.kind=='lib'&&A.ITEMS[a.k];if(a.kind=='lib'&&!it)return`<div class="empty0">${t('加载中…')}</div>`;
 const src=it?(type=='pose'?A.ath(it.angles[a.ai??it.ai].t):A.thumb(it)):a.url,name=it?A.title(it):(a.name||t('自定义图片')),sub=it?(it.type=='pose'?displayLabel(it.line,it.lineEn,it.lineJa)+' · '+angleLabel(it.angles[a.ai??it.ai]):displayLabel(it.cat,it.catEn,it.catJa)+' · '+it.id):(type=='costume'?(W.garments.length>1?t(i==0?'上装':'下装'):t('本地上传')):t('本地上传'));
 return`<div class="pick ${type}"><img src="${src}" alt="${esc(name)}"><div><b>${esc(name)}</b><small>${esc(sub)}</small></div>${type=='pose'&&it?`<select data-ang="${i}" aria-label="${esc(t('角度'))}">${it.angles.map((x,j)=>`<option value="${j}" ${j==(a.ai??it.ai)?'selected':''}>${esc(angleLabel(x))}</option>`).join('')}</select>`:''}<button class="rmx" data-rm="${type}" data-i="${i}" aria-label="${esc(t('移除'))}" title="${esc(t('移除'))}">×</button></div>`}
function render(localeOnly=false){
 const local=isComfy(),G=isGen(),poseEnabled=canPickPose();
 $('#wbWorkflowControls').hidden=!local;
 if(local){
  const picker=$('#wbWorkflow');
  picker.replaceChildren(...comfyState.workflows.map(profile=>new Option(profile.name,profile.id)));
  if(!comfy.id&&comfyState.workflows.length){
   const placeholder=new Option(t('选择已注册的工作流'),'');
   placeholder.disabled=true;picker.prepend(placeholder);
  }
  picker.value=comfy.id||'';picker.disabled=!!W.busy;
  $('#wbWorkflowWrap').hidden=!comfyState.workflows.length;
 }
 const promptEnabled=!local||!!comfy.mapping.prompt,aspectEnabled=!local||!!comfy.mapping.aspect;
 const countEnabled=!local||!!comfy.mapping.seed;
 // 未設定の入力は隠し、設定変更前に選んだポーズだけは削除できるようにします。
 $('#wbModes').hidden=local;$('#wbAdv').hidden=!promptEnabled;
 $('#wbQuick').hidden=!promptEnabled&&!aspectEnabled&&!countEnabled;
 $('#wbStyleLabel').hidden=!promptEnabled;$('#wbStyles').hidden=!promptEnabled;
 $('#wbARWrap').hidden=!aspectEnabled;$('#wbNWrap').hidden=!countEnabled;
 $('#wbNeutral').closest('label').hidden=local;
 $('.step[data-s="3"]').hidden=!poseEnabled&&!W.poses.length;
 $('.step[data-s="3"] [data-pick="pose"]').hidden=!poseEnabled;
 $('#wbPoseSep').hidden=!poseEnabled;$('[data-f="3"]').hidden=!poseEnabled;
 $('#wbFile').multiple=!local;$('#wbGFile').multiple=!local;$$('[data-mode]').forEach(b=>b.classList.toggle('on',b.dataset.mode==W.mode));
 $('#stLead').textContent=t(local?'每次试穿使用 1 张人物照和 1 张服装图。':G?'选模特类型和服装，直接出一张上身图。':'上传照片，选一套衣服，换上看看。');
 $('#s1R').textContent=t(G?'可传脸部参考':'必选');$('#s1T').textContent=t(G?'模特':'人物');
 $('#wbPersons').innerHTML=W.persons.map((p,i)=>`<div class="pp"><img src="${p.url}" alt="${esc(t('人物照片 {count}',{count:i+1}))}"><small>${p.w}×${p.h}</small><button class="x" data-rmp="${i}" aria-label="${esc(t('移除'))}">×</button></div>`).join('');
 $('#wbDrop').classList.toggle('mini',W.persons.length>0);$('#wbDrop').hidden=W.persons.length>=(local?1:3);$('#wbChar').hidden=!G||hasPerson();
 $('#wbChars').innerHTML=CHARS.map(c=>`<button class="chip ${W.char==c[0]?'on':''}" data-char="${c[0]}">${t(c[1])}</button>`).join('');$('#wbCharTxt').hidden=W.char!='custom';if(!localeOnly)$('#wbCharTxt').value=W.charTxt;
 $('#wbG').innerHTML=W.garments.length?W.garments.map((g,i)=>pickRow(g,'costume',i)).join(''):`<button class="empty0" data-pick="costume"><span><b>${t('选择服装')}</b><small>${t('从库里选，或上传图片')}</small></span></button>`;
 $('#wbPo').innerHTML=W.poses.length?W.poses.map((p,i)=>pickRow(p,'pose',i)).join(''):`<button class="empty0" data-pick="pose"><span><b>${t('选择姿势（可选）')}</b><small>${t(G?'不选就随机':'不选就保持原姿势')}</small></span></button>`;
 $('#wbBatch').hidden=local||W.poses.length<2;$$('[data-bm]').forEach(b=>b.classList.toggle('on',b.dataset.bm==W.bm));$('#wbAllAng').hidden=!poseEnabled||W.poses.length!=1||!A.ITEMS[(W.poses[0]||{}).k];
 $('#wbStyles').innerHTML=STYLES.map(s=>`<button class="chip ${W.style==s[0]?'on':''}" data-style="${s[0]}">${t(s[1])}</button>`).join('');$('#wbKeepBg').checked=W.keepBg;$('#wbKeepBg').closest('label').hidden=G||!hasPerson();
 $('#wbKeepBody').checked=W.keepBody;
 $('#wbKeepBody').closest('label').hidden=!hasPerson();
 $$('[data-pl]').forEach(b=>{
  const selected=b.dataset.pl==W.pl;
  b.classList.toggle('on',selected);b.setAttribute('aria-pressed',String(selected));
 });
 const ok=local?!!comfy.workflow:!!cfg.key;
 $('#wbDot').className='dot'+(ok?' on':'');
 $('#wbProv').textContent=local?provider(cfg.prov):ok?provider(cfg.prov)+' · '+modelOf():t('未配置 API');
 $('#wbDot2').className='dot'+(ok?' on':'');$('#wbProv2').textContent=ok||local?provider(cfg.prov):t('未配置 API');$('#wbOnb').hidden=ok||local;
 const dn=[G?true:hasPerson(),W.garments.length>0,W.poses.length>0,!!(W.style||$('#wbExtra').value)];$$('.step[data-s]').forEach(e=>e.classList.toggle('done',dn[e.dataset.s-1]));
 const jobs=nJobs();$('#wbEst').textContent=t('将生成 {count} 张',{count:jobs});
 const miss=[!G&&!hasPerson()&&'人物照片',!W.garments.length&&'服装',local&&!ok&&'工作流 API JSON'].filter(Boolean).map(key=>t(key));
 $('#wbHint').textContent=miss.length?t('还缺：{items}',{items:miss.join(locale()=='en'?', ':'、')}):local||!ok?'':t('每张约半分钟');
 $('#wbHint').classList.toggle('miss',!!miss.length);
 const localError=local&&(W.persons.length>1||W.garments.length>1?COMFY_LIMIT:!poseEnabled&&W.poses.length?COMFY_POSE:'');
 if(localError){$('#wbHint').textContent=t(localError);$('#wbHint').classList.add('miss')}
 const need=localError||missingReference();
 const go=$('#wbGo');
 const chat=$('#wbChatOpen');chat.disabled=!!missingReference();chat.title=chat.disabled?t(missingReference()):'';
 if(W.busy){const label=go.lastChild;if(label?.nodeType===Node.TEXT_NODE)label.textContent=t('生成中…')}
 else{go.disabled=!!need;go.title=need?t(need):'';go.textContent=t(localError?'生成':need||'生成')}
 $$('.flow [data-f]').forEach(e=>e.classList.toggle('on',e.dataset.f<4?dn[e.dataset.f-1]&&(e.dataset.f!=3||W.poses.length>0):!need.length));
 if(localeOnly)return;
 SV('wbSel',{g:W.garments.filter(g=>g.kind=='lib').map(g=>g.k),p:W.poses.filter(p=>p.kind=='lib').map(p=>[p.k,p.ai])});reprompt()}
const outputCount=()=>isComfy()&&!comfy.mapping.seed?1:+$('#wbN').value||1;
const nJobs=()=>poseSets().length*outputCount();
function missingReference(){
 if(!isGen()&&!hasPerson())return '请先上传人物照片';
 return W.garments.length?'':'请先选择服装';
}
// ---------- 上传 ----------
async function addPortrait(it){if(isComfy()&&W.persons.length)return toast(COMFY_LIMIT);if(W.persons.length>=3)return toast('最多 3 张人物照片');try{const x=await toJpeg(it.m,1536);W.persons.push({blob:x.blob,url:URL.createObjectURL(x.blob),w:x.w,h:x.h,k:it.k});render();toast(isGen()?'已设为脸部参考（生成时保持这张脸）':'已设为人物照片')}catch(e){toast('人像加载失败')}}
async function addPersons(files){files=[...files].filter(f=>/^image\//.test(f.type));if(!files.length)return toast('请选择图片文件');if(isComfy()&&(files.length!=1||W.persons.length))return toast(COMFY_LIMIT);for(const f of files){if(W.persons.length>=3){toast('最多 3 张人物照片');break}const u=URL.createObjectURL(f);try{const r=await toJpeg(u,1536);W.persons.push({blob:r.blob,url:URL.createObjectURL(r.blob),w:r.w,h:r.h})}catch(e){toast('无法读取这张图片')}finally{URL.revokeObjectURL(u)}}render()}
const drop=$('#wbDrop');$('#wbFile').onchange=e=>{addPersons(e.target.files);e.target.value=''};
['dragenter','dragover'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add('over')}));['dragleave','drop'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove('over')}));
drop.addEventListener('drop',e=>addPersons(e.dataTransfer.files));drop.addEventListener('keydown',e=>{if(e.key=='Enter'||e.key==' '){e.preventDefault();$('#wbFile').click()}});
$('#wbGFile').onchange=async e=>{const fs=[...e.target.files];e.target.value='';if(isComfy()&&fs.length!=1)return fs.length&&toast(COMFY_LIMIT);W.garments=isComfy()?[]:W.garments.filter(g=>g.kind=='file');for(const f of fs){if(W.garments.length>=2){toast('最多上传 2 张服装图（上装 + 下装）');break}const u=URL.createObjectURL(f);try{const r=await toJpeg(u,1280);URL.revokeObjectURL(u);W.garments.push({kind:'file',blob:r.blob,url:URL.createObjectURL(r.blob),name:f.name})}catch(x){toast('无法读取服装图')}}render()};
document.addEventListener('paste',e=>{if(document.body.classList.contains('studio')&&!chatDialog.open&&!/INPUT|TEXTAREA/.test(document.activeElement.tagName)){const f=[...e.clipboardData.files].filter(f=>/^image/.test(f.type));if(f.length)addPersons(f)}});
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
// 選択は次回も復元し、指示の有無をその場でプロンプトに反映します。
$('#wbKeepBody').onchange=e=>{
 W.keepBody=e.target.checked;
 SV('wbKeepBody',W.keepBody);
 reprompt();
};
$('#wbCharTxt').oninput=e=>{W.charTxt=e.target.value;SV('wbCharTxt',W.charTxt);reprompt()};
$('#wbAllAng').onclick=()=>{const p=W.poses[0],it=A.ITEMS[p.k];W.poses=it.angles.slice(0,6).map((a,i)=>({kind:'lib',k:p.k,ai:i}));toast('已展开 {count} 个角度',null,{count:W.poses.length});render()};
$('#wbJaPreview').ontoggle=renderJapanesePreview;
$('#wbPrompt').oninput=()=>{W.dirty=true;renderJapanesePreview()};$('#wbExtra').oninput=()=>reprompt();$('#wbReP').onclick=()=>{reprompt(true);toast('已按当前选择重新生成提示词')};
$('#wbCopyP').onclick=()=>A.copy($('#wbPrompt').value,'提示词');
// チャット用の画面を開くたびに設定を読み直し、ポーズごとの画像番号と本文を揃えます。
const chatDialog=$('#wbChat'),chatPose=$('#wbChatPose'),chatImages=$('#wbChatImages');
const chatPrompt=$('#wbChatPrompt'),chatStatus=$('#wbChatStatus');
let chatJobs=[];
let chatCopyRevision=0;
function renderChatJob(){
 chatCopyRevision++;
 const job=chatJobs[Number(chatPose.value)||0];
 chatPrompt.value=job.prompt;
 chatStatus.textContent='';
 chatImages.innerHTML=job.images.map(({asset,role},index)=>{
  const item=A.ITEMS[asset.k];
  const name=item?A.title(item):asset.name||'';
  const angle=role=='姿势'?angleLabel(item.angles[asset.ai??item.ai]):'';
  const src=asset.url||(angle?A.ath(item.angles[asset.ai??item.ai].t):A.thumb(item));
  const label=t('参考图 {count}',{count:index+1});
  return `<li class="chat-reference"><img src="${esc(src)}" alt="">
   <div><b>${esc(label)} · ${esc(t(role))}</b>${name?`<small>${esc(name)}${angle?' · '+esc(angle):''}</small>`:''}</div>
   <div class="chat-reference-actions"><button class="sm" type="button" data-image="${index}" aria-label="${esc(label+' '+t('复制图片'))}">${t('复制图片')}</button>
   <button class="sm ghost" type="button" data-image="${index}" data-save aria-label="${esc(label+' '+t('下载'))}">${t('下载')}</button></div>
   <p class="chat-status" role="status"></p></li>`;
 }).join('');
}
$('#wbChatOpen').onclick=()=>{
 const shared=[...W.persons.map(asset=>({asset,role:'人物照片'})),...W.garments.map(asset=>({asset,role:'服装'}))];
 const edited=W.dirty?$('#wbPrompt').value:'';
 chatJobs=poseSets().map(set=>({
  images:[...shared,...set.map(asset=>({asset,role:'姿势'}))],
  prompt:edited.trim()?edited:compose(set)
 }));
 chatPose.replaceChildren(...chatJobs.map((job,index)=>new Option(t('姿势 {count}',{count:index+1}),String(index))));
 chatPose.parentElement.hidden=chatJobs.length===1;
 $('#wbChatEdited').hidden=chatJobs.length===1||!edited.trim();
 chatPrompt.lang=W.pl==='zh'?'zh-CN':W.pl;
 renderChatJob();
 chatDialog.showModal();
};
chatPose.onchange=renderChatJob;
// ダイアログを操作中は、試着画面の外のショートカットにキーを渡しません。
chatDialog.addEventListener('keydown',event=>event.stopPropagation());
chatDialog.addEventListener('close',()=>{
 if(chatDialog.open)return;
 chatCopyRevision++;
 chatJobs=[];
 chatImages.replaceChildren();
 chatPrompt.value='';
});
$('#wbChatCopyPrompt').onclick=async()=>{
 const revision=++chatCopyRevision;
 let message='已复制提示词';
 try{
  await navigator.clipboard.writeText(chatPrompt.value);
 }catch{
  if(!chatDialog.open||revision!==chatCopyRevision)return;
  chatPrompt.select();
  message='无法复制提示词，请复制选中的文字。';
 }
 if(chatDialog.open&&revision===chatCopyRevision)chatStatus.textContent=t(message);
};
chatImages.onclick=async event=>{
 const button=event.target.closest('[data-image]');
 if(!button||button.disabled)return;
 const index=Number(button.dataset.image);
 const {asset}=chatJobs[Number(chatPose.value)||0].images[index];
 const status=button.closest('li').querySelector('[role=status]');
 const save=button.hasAttribute('data-save');
 const revision=save?null:++chatCopyRevision;
 const isCurrent=()=>save||(chatDialog.open&&revision===chatCopyRevision);
 button.disabled=true;
 status.textContent='';
 let imageErrorMessage='';
 try{
  if(!save&&(!navigator.clipboard?.write||!window.ClipboardItem))throw Error('Clipboard unavailable');
  // 書き込みはクリック中に始めます。PNGへの変換はClipboardItemにPromiseで渡します。
  const png=referenceBlob(asset).then(async blob=>{
   if(blob.type!=='image/png'){
    const image=await createImageBitmap(blob);
    const canvas=document.createElement('canvas');
    canvas.width=image.width;canvas.height=image.height;
    canvas.getContext('2d').drawImage(image,0,0);
    image.close();
    blob=await new Promise((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(Error()),'image/png'));
   }
   // 読み込み中にポーズを切り替えた場合、前の画像でコピー済みの内容を上書きしません。
   if(!isCurrent())throw new DOMException('Copy cancelled','AbortError');
   return blob;
  }).catch(error=>{
   imageErrorMessage=error.ui?.()||t('图片读取失败');
   throw error;
  });
  if(save)window.X.dl(await png,`posewear-reference-${index+1}.png`);
  else {
   // 書き込みを拒否された場合も、ブラウザーに渡した画像の取得エラーを処理します。
   png.catch(()=>{});
   await navigator.clipboard.write([new ClipboardItem({'image/png':png})]);
  }
  if(isCurrent())status.textContent=t(save?'已开始下载':'已复制图片');
 }catch{
  if(isCurrent())status.textContent=imageErrorMessage||t(save?'下载失败':'无法复制图片，请下载。');
 }finally{
  button.disabled=false;
 }
};
// ---------- 选择器 ----------
let pkType='costume',pkSelected=false;
function pickerTitle(){
 $('#pkT').textContent=pkType=='pose'&&pkSelected?t('选姿势（{count}/6）',{count:W.poses.length}):
  t({pose:'选择姿势（可多选，最多 6 个）',portrait:'选择人像（作为人物 / 脸部参考）',anime:'选择动画服装',costume:'选择服装'}[pkType]);
}
async function picker(type){if(type=='pose'&&!canPickPose())return toast(COMFY_POSE);pkType=type;pkSelected=false;pickerTitle();$('#pkDone').hidden=type!='pose';$('#pk').hidden=false;document.body.style.overflow='hidden';$('#pkQ').value='';$('#pkG').innerHTML='<div class="skel"></div>'.repeat(12);await A.load(type);drawPk();setTimeout(()=>$('#pkQ').focus(),50)}
function drawPk(){
 const q=$('#pkQ').value.toLowerCase().trim().split(/\s+/).filter(Boolean);
 const L=A.DATA[pkType].filter(A.ok).filter(it=>{
  // ギャラリーを開かず直接試着を使った場合も、各言語のタイトルで検索できます。
  const words=it._s||[it.id,it.titleJa,it.titleEn,it.ja,it.ti,it.zh,it.en,it.cat,it.line].join(' ').toLowerCase();
  return q.every(word=>words.includes(word));
 }).slice(0,150),sel=new Set(W.poses.map(p=>p.k));
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
const FRAME={ja:'衣料品の通販カタログ用に、プロの試着写真を撮る。成人のモデルが参照画像と同じデザイン、色、裁断の衣服を着用し、衣服を足したり取り除いたりしない。本人の顔立ちを保ち、落ち着いたスタジオや日常の場面で、自然でリラックスしたポーズを取る。',en:'Professional e-commerce fashion try-on photo for a clothing catalog. The subject is an adult, fully clothed in exactly the reference garments (same design, color and cut, nothing added or removed), keeping the same identity, in a natural, relaxed, non-suggestive pose, in a tasteful studio or lifestyle setting.',
 zh:'服装电商的专业试穿照片，用于商品目录。人物是成年人，完整穿着参考图中的服装（款式、颜色、剪裁完全一致，不增不减），保持同一人的长相，姿势自然放松，场景为简洁的影棚或生活场景。'};
const neutralOn=()=>LS('wbNeutral')!==false;$('#wbNeutral').checked=neutralOn();$('#wbNeutral').onchange=e=>{SV('wbNeutral',e.target.checked);renderJapanesePreview();toast(e.target.checked?'已开启减少误拦截':'已关闭减少误拦截，将按原提示词发送')};
const isAdultJob=set=>[...W.garments,...(set||[])].some(g=>g.kind=='lib'&&A.ITEMS[g.k]&&A.ITEMS[g.k].a);
function neutralize(p,lang){if(lang=='ja')return FRAME.ja+'\n'+p;let t=p;for(const [a,b] of NEUTRAL)t=t.replace(a,b?'\x01'+b+'\x01':'\x02');
 t=t.replace(/\b(with|and|in)\s+\x02\s+(?:and|with)\b/gi,'$1').replace(/\x01\x02*\x01/g,'、').replace(/\x01\s+\x01/g,' ').replace(/[\x01]/g,'').replace(/\s*\x02\s*/g,' ')
  .replace(/(^|[，,、；;：:。.\n])\s*(?:and|with|,)?\s*(?=[，,、；;。.\n]|$)/g,'$1').replace(/([，、；])[，、；]+/g,'$1').replace(/([,;])\s*[,;]+/g,'$1').replace(/[ \t]{2,}/g,' ').replace(/\s+([,.;，。；、])/g,'$1').replace(/^[，,、]\s*|[，,、]\s*$/gm,'').replace(/[,，、]\s*([.。;；])/g,'$1');
 return FRAME[lang]+'\n'+t}
// 表示文言の更新と入力の初期化を分け、言語変更時は編集中の値を保持します。
const COMFY_ERRORS={
 invalidBase:'请输入本机回环地址，例如 http://127.0.0.1:8188。',
 invalidWorkflow:'无法读取工作流。请在 ComfyUI 中以 API 格式导出 JSON。',
 invalidWorkflowName:'请输入工作流名称。',
 invalidMapping:'请选择两个不同的 LoadImage 节点和一个 SaveImage 节点。',
 invalidPoseMapping:'姿势图片需要单独的 LoadImage 节点。',
 invalidImage:'无法读取试穿所需的图片。',
 invalidJob:'ComfyUI 生成设置无效，请检查节点和画幅。',
 connection:'无法连接 ComfyUI。请检查本机地址、服务是否运行、CORS 和浏览器的本地网络权限。',
 upload:'无法将图片上传到 ComfyUI。',
 submit:'ComfyUI 无法接受工作流。请检查所需节点和模型是否已安装。',
 history:'无法读取 ComfyUI 的生成状态。',
 execution:'ComfyUI 工作流执行失败。请在 ComfyUI 中查看错误详情。',
 noOutput:'所选的 SaveImage 节点没有返回图片。',
 download:'无法下载 ComfyUI 的生成结果。',
 timeout:'等待 ComfyUI 结果超时。请在 ComfyUI 中查看队列。'
};
const comfyError=e=>t(COMFY_ERRORS[e.code]||COMFY_ERRORS.invalidWorkflow);
const COMFY_BINDINGS=[
 ['person','#cfComfyPerson',true],['garment','#cfComfyGarment',true],['output','#cfComfyOutput',true],
 ['pose','#cfComfyPose'],['prompt','#cfComfyPrompt'],['aspect','#cfComfyAspect'],['seed','#cfComfySeed']
];
let comfyDraft, configRevision=0;
function showComfyWorkflow(suggest=false){
 // 保存済みの JSON を開いたときも、登録したファイル名をボタンの隣に表示します。
 $('#cfComfyName').textContent=comfyDraft.fileName||t('尚未选择文件');
 $('#cfComfyBindings').hidden=!comfyDraft.workflow;
 const nodes=Object.entries(comfyDraft.workflow||{});
 for(const [key,selector,required] of COMFY_BINDINGS){
  const select=$(selector);
  select.replaceChildren(new Option(t(required?'请选择节点':'不指定节点'),''));
  const candidates=nodes.filter(([,node])=>window.ComfyUI.matchesBinding(node,key));
  for(const [id,node] of candidates){
   // 同名のノードも区別できるよう、ComfyUI のノード番号を添えます。
   select.add(new Option(`${node._meta?.title||node.class_type} (#${id})`,id));
  }
  if(!suggest){
   select.value=comfyDraft.mapping[key]||'';
   continue;
  }
  // 新しく読み込んだファイルだけ、型が合う役割タグが一つに決まれば初期値にします。
  const tagged=candidates.filter(([,node])=>node._meta?.posewear_role===key);
  if(tagged.length==1)select.value=tagged[0][0];
  else if(candidates.length==1&&['output','prompt','aspect'].includes(key))select.value=candidates[0][0];
 }
}
function readComfy(){
 return {
  ...comfyDraft,
  name:$('#cfComfyProfileName').value.trim(),
  base:$('#cfComfyBase').value,
  mapping:Object.fromEntries(COMFY_BINDINGS.map(([key,selector])=>[key,$(selector).value]))
 };
}
function editComfy(profile){
 // ファイルを読み込み中に選択を変えた場合は、古い読み込み結果を反映しません。
 configRevision++;
 comfyDraft=profile?{...profile}:{id:null,name:'',fileName:'',workflow:null,mapping:{}};
 const picker=$('#cfComfySaved');
 picker.replaceChildren(new Option(t('选择已注册的工作流'),''),...comfyState.workflows.map(item=>new Option(item.name,item.id)));
 picker.options[0].disabled=true;picker.value=comfyDraft.id||'';
 $('#cfComfySavedWrap').hidden=!comfyState.workflows.length;
 $('#cfComfyDelete').hidden=!comfyDraft.id;
 $('#cfComfyProfileName').value=comfyDraft.name;
 $('#cfComfyWorkflow').value='';
 showComfyWorkflow();
 cfgMessage=null;$('#cfComfyMsg').textContent='';$('#cfComfyMsg').className='fine';
}
const cfgLink=(url,label)=>`<a href="${url}" target="_blank" rel="noopener">${esc(label)}</a>`;
function cfgLabels(prov){
 const P=PROV[prov];
 const local=prov=='comfy';
 // OpenAI の任意項目は、ほかのサービスの設定を編集するときには隠します。
 $('#cfQualityW').hidden=$('#cfComplexityW').hidden=prov!='openai';
 $('#cfCloud').hidden=local;$('#cfCloudFooter').hidden=local;
 if(local){$('#cfHelp').textContent='';return}
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
// 接続先が変わった後に、以前の候補や遅れて届いた応答を表示しないようにします。
let modelListRevision=0, modelStatus=null;
function resetModelList(){
 modelListRevision++;
 $('#cfOpenAIModels').replaceChildren();
 $('#cfOpenAIList').hidden=true;
 modelStatus=null;
 $('#cfModelStatus').textContent='';
 $('#cfModelStatus').hidden=true;
}
$('#cfModel').onfocus=async()=>{
 const draft=cfgRead();
 if(draft.prov!='openai')return;
 resetModelList();
 if(!draft.key)return;
 const revision=modelListRevision;
 const status=$('#cfModelStatus');
 modelStatus=()=>t('正在获取模型…');
 status.textContent=modelStatus();status.hidden=false;
 try{
  // 接続テストと同じ認証・プロキシ設定を使い、保存前の接続先も反映します。
  const response=await call(root(draft)+'/models',{method:'GET',headers:auth(draft)},draft);
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw await apiErr(response,body,draft);
  if(revision!=modelListRevision)return;
  if(!Array.isArray(body?.data))throw imageError('模型列表格式不正确。');
  const models=body.data.filter(item=>typeof item?.id=='string'&&item.id.startsWith('gpt-image-'))
   .sort((a,b)=>(b.created||0)-(a.created||0));
  // 自由入力欄は変更せず、保存済みの名前に関係なく全候補を選べるようにします。
  const list=$('#cfOpenAIModels');
  list.replaceChildren(...models.map(model=>new Option(model.id,model.id)));
  list.selectedIndex=-1;
  $('#cfOpenAIList').hidden=!models.length;
  modelStatus=models.length?null:()=>t('未找到图像模型。');
 }catch(error){
  if(revision!=modelListRevision)return;
  modelStatus=()=>t('无法获取模型列表：{reason}',{reason:nice(error)});
 }
 status.textContent=modelStatus?modelStatus():'';
 status.hidden=!modelStatus;
};
$('#cfOpenAIModels').onchange=event=>{$('#cfModel').value=event.target.value};
// 手入力に切り替えたらリストの選択を外し、直前と同じ候補も選び直せるようにします。
$('#cfModel').oninput=()=>{$('#cfOpenAIModels').selectedIndex=-1};
for(const selector of ['#cfKey','#cfBase','#cfProxy']){
 $(selector).addEventListener('input',resetModelList);
}
let cfgMessage;
function cfgFill(){

 $$('[name=prov]').forEach(r=>r.checked=r.value==cfg.prov);
 const cloud=cfg.prov=='comfy'?(cfg.cloudProv||'openai'):cfg.prov;
 const P=PROV[cloud];
 $('#cfKey').type='password';
 $('#cfBase').value=cfg.base;$('#cfKey').value=cfg.key;
 $('#cfModel').value=cfg.model;$('#cfModel').placeholder=P.model;
 resetModelList();
 $('#cfQuality').value=cfg.quality;$('#cfComplexity').value=cfg.complexity;
 $('#cfModels').replaceChildren(...P.models.map(m=>new Option(m,m)));
 $('#cfField').value=cfg.field;$('#cfProto').value=cfg.proto;$('#cfProtoW').hidden=cloud!='custom';
 $('#cfFieldW').hidden=!(cloud=='custom'&&cfg.proto=='edits');$('#cfProxy').checked=cfg.proxy;
 cfgLabels(cfg.prov);cfgMessage=null;$('#cfMsg').textContent='';$('#cfMsg').className='fine';
}
function cfgRead(){
 return {
  prov:$('[name=prov]:checked')?.value||'openai',
  base:$('#cfBase').value.trim(),key:$('#cfKey').value.trim(),model:$('#cfModel').value.trim(),
  quality:$('#cfQuality').value.trim(),complexity:$('#cfComplexity').value.trim(),
  field:$('#cfField').value,proto:$('#cfProto').value,proxy:$('#cfProxy').checked
 };
}
const cloudCfgOpen=()=>{configRevision++;cfgFill();$('#cfg').hidden=false;document.body.style.overflow='hidden';$('#cfgX').focus()};
const cfgClose=()=>{resetModelList();configRevision++;$('#cfg').hidden=true;document.body.style.overflow=''};
const comfyOpen=()=>{
 $('#comfyManager').hidden=false;document.body.style.overflow='hidden';
 $('#cfComfyBase').value=comfy.base;editComfy(comfy.id?comfy:comfyState.workflows[0]);$('#cfComfyX').focus();
};
const comfyClose=()=>{configRevision++;$('#comfyManager').hidden=true;document.body.style.overflow=''};
const cfgOpen=()=>isComfy()?comfyOpen():cloudCfgOpen();
$('#wbCfg').onclick=cfgOpen;$('#wbCfg2').onclick=cfgOpen;$('#wbOnbGo').onclick=cfgOpen;
$('#cfgX').onclick=cfgClose;$('#cfg').addEventListener('click',e=>{if(e.target.id=='cfg')cfgClose()});
$('#wbWorkflowManage').onclick=comfyOpen;
$('#cfComfyX').onclick=comfyClose;
$('#comfyManager').addEventListener('click',e=>{if(e.target.id=='comfyManager')comfyClose()});
$('#cfComfyProviders').onclick=()=>{comfyClose();cloudCfgOpen()};
$('[name=prov][value=comfy]').onclick=()=>{cfgClose();comfyOpen()};
$$('[name=prov]').forEach(r=>r.onchange=()=>{
 if(r.value=='comfy')return;
 resetModelList();configRevision++;
 const prov=r.value,stored=isComfy()?cfg.cloudProv||'openai':cfg.prov;
 const P=PROV[prov];
 $('#cfBase').value=prov==stored?cfg.base:'';
 $('#cfModel').value=prov==stored?cfg.model:'';
 $('#cfModel').placeholder=P.model;
 $('#cfModels').replaceChildren(...P.models.map(m=>new Option(m,m)));
 if(prov=='seedream')$('#cfProxy').checked=true;
 $('#cfProtoW').hidden=prov!='custom';
 $('#cfFieldW').hidden=!(prov=='custom'&&$('#cfProto').value=='edits');
 cfgLabels(prov);
 cfgMessage=null;$('#cfMsg').textContent='';
 if(prov=='seedream')msg('火山方舟接口不允许浏览器跨域，已开启本站代理');
});
$('#cfComfySaved').onchange=e=>editComfy(comfyState.workflows.find(profile=>profile.id===e.target.value));
$('#cfComfyNew').onclick=()=>{
 editComfy();
 $('#cfComfyWorkflow').focus();
};
$('#cfComfyDelete').onclick=()=>{
 if(W.busy)return msg('请等待当前生成完成。',1);
 if(!comfyDraft.id||!confirm(t('删除工作流「{name}」？',{name:comfyDraft.name})))return;
 try{
  useComfyState(workflowStore.remove(comfyState,comfyDraft.id));
  editComfy(comfy.id?comfy:comfyState.workflows[0]);render();msg('已删除工作流');
 }catch(error){msg(()=>comfySaveError(error),1)}
};
$('#wbWorkflow').onchange=e=>{
 if(W.busy){e.target.value=comfy.id;return}
 try{
  useComfyState(workflowStore.select(comfyState,e.target.value));
 }catch(error){toast(comfySaveError(error))}
 render();
};
$('#cfComfyWorkflow').onchange=async e=>{
 const file=e.target.files[0],draft=comfyDraft,revision=++configRevision;
 if(!file)return;
 e.target.value='';
 try{
  const workflow=window.ComfyUI.parseWorkflow(await file.text());
  if(revision!=configRevision||draft!==comfyDraft)return;
  const name=$('#cfComfyProfileName').value.trim()||file.name.replace(/\.json$/i,'').trim();
  comfyDraft={...draft,workflow,mapping:{},name,fileName:file.name};
  $('#cfComfyProfileName').value=name;
  showComfyWorkflow(true);
  cfgMessage=null;$('#cfComfyMsg').textContent='';
 }catch(error){
  if(revision==configRevision)msg(()=>comfyError(error),1);
 }
};
$('#cfProto').onchange=()=>{$('#cfFieldW').hidden=$('#cfProto').value!='edits'};
$('#cfEye').onclick=()=>{const k=$('#cfKey');k.type=k.type=='password'?'text':'password';$('#cfEye').textContent=t(k.type=='password'?'显示':'隐藏')};
const comfySaveError=error=>error.code?comfyError(error):t('无法在此浏览器中保存 ComfyUI 设置。');
function setComfyProvider(){
 if(!isComfy())cfg.cloudProv=cfg.prov;
 cfg.prov='comfy';SV('wbCfg',cfg);
}
$('#cfComfySave').onclick=()=>{
 if(W.busy)return msg('请等待当前生成完成。',1);
 if(!comfyDraft.workflow)return msg('请选择 ComfyUI 试穿工作流。',1);
 try{
  const saved=workflowStore.save(comfyState,readComfy());
  useComfyState(saved.state);
  $('#cfComfyBase').value=comfy.base;editComfy(saved.profile);
 }catch(error){return msg(()=>comfySaveError(error),1)}
 render();msg('已保存工作流');
};
$('#cfComfyUse').onclick=()=>{
 if(W.busy)return msg('请等待当前生成完成。',1);
 const draft=readComfy();
 const saved=comfyState.workflows.find(profile=>profile.id===draft.id);
 // 「使う」で編集中の内容が失われないよう、表示中の内容と保存した登録を照合します。
 if(!saved||saved.workflow!==draft.workflow||saved.name!==draft.name||draft.base.trim()!==comfy.base||
    COMFY_BINDINGS.some(([role])=>(saved.mapping[role]||'')!==draft.mapping[role])){
  return msg('请先保存更改',1);
 }
 try{useComfyState(workflowStore.select(comfyState,saved.id))}
 catch(error){return msg(()=>comfySaveError(error),1)}
 setComfyProvider();render();comfyClose();$('#wbWorkflow').focus();
};
$('#cfSave').onclick=()=>{
 if(W.busy)return msg('请等待当前生成完成。',1);
 const o=cfgRead();
 if(o.prov=='custom'&&!o.base)return msg('自定义中转需要填写 Base URL',1);
 Object.assign(cfg,o);SV('wbCfg',cfg);render();cfgClose();toast('API 设置已保存在本机');
};
$('#cfClr').onclick=()=>{resetModelList();cfg.key='';$('#cfKey').value='';SV('wbCfg',cfg);render();msg('已从本机清除密钥')};
function msg(key,bad,params){
 cfgMessage=typeof key=='function'?key:()=>t(key,params);
 const m=$($('#comfyManager').hidden?'#cfMsg':'#cfComfyMsg');
 m.textContent=cfgMessage();m.className='fine '+(bad?'bad':'good');
}
$('#cfComfyTest').onclick=async()=>{
 const revision=++configRevision;
 const report=(...args)=>{if(revision==configRevision)msg(...args)};
 report('正在连接…');
 try{
  await window.ComfyUI.test($('#cfComfyBase').value);
  report('已连接到 ComfyUI。');
 }catch(error){report(()=>error.code=='timeout'?t('连接 ComfyUI 超时。'):comfyError(error),1)}
};
$('#cfTest').onclick=async()=>{
 const o=cfgRead(),revision=++configRevision;
 const report=(...args)=>{if(revision==configRevision)msg(...args)};
 if(!o.key)return report('请先填写 API Key',1);
 if(o.prov=='custom'&&!o.base)return report('请填写 Base URL',1);
 report('正在连接…');
 try{
  const g=o.prov=='gemini',url=g?`${root(o)}/models/${encodeURIComponent(modelOf(o))}`:`${root(o)}/models`;
  const r=await call(url,{method:'GET',headers:auth(o)},o),j=await r.json().catch(()=>null);
  if(!r.ok){
   if(o.prov=='seedream'&&r.status==404)return report('地址可达、密钥已被接受（方舟不提供模型列表接口，可直接生成测试）');
   throw await apiErr(r,j,o);
  }
  if(g)report('连接成功：模型 {model} 可用',false,{model:j&&j.displayName||modelOf(o)});
  else{
   const ids=(j&&j.data||[]).map(m=>m.id),model=modelOf(o);
   const key=!ids.length?'连接成功：共 {count} 个模型':ids.includes(model)?'连接成功：共 {count} 个模型，包含 {model}':'连接成功：共 {count} 个模型，但未找到 {model}（中转可能不列出，可直接尝试）';
   report(key,false,{count:ids.length,model});
  }
 }catch(e){report(()=>nice(e),1)}
};
// ---------- 请求 ----------
function auth(state=cfg){const cfg=state;return cfg.prov=='gemini'?{'x-goog-api-key':cfg.key}:{Authorization:'Bearer '+cfg.key}}
const p2=n=>String(n).padStart(2,'0'),stamp=d=>`${d.getFullYear()}${p2(d.getMonth()+1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
const OFF=/^(api\.openai\.com|generativelanguage\.googleapis\.com|ark\.[a-z0-9-]+\.(volces|bytepluses)\.com)$/;
function call(url,o,state=cfg){const cfg=state;let hn='';try{hn=new URL(url).hostname}catch(e){}const cu=cfg.prov=='custom'||!OFF.test(hn);if(!cfg.proxy&&!cu)return fetch(url,o);const h=new Headers(o.headers||{});h.set('x-target-url',url);if(cu)h.set('x-proxy-custom','1');return fetch('/api/proxy',Object.assign({},o,{headers:h}))}
async function fetchResult(url){let r=await fetch(url).catch(()=>null);if(!r||!r.ok)r=await fetch('/api/proxy',{headers:{'x-target-url':url,'x-proxy-kind':'image'}}).catch(()=>null);if(r&&r.ok)return r.blob();const e=Error('');e.ui=()=>t('结果图片无法在浏览器中下载，请直接打开：{url}',{url});throw e}

const SAFE_RE=/safety system|safety_violations|moderation_blocked|content_policy_violation|content policy|SensitiveContent|sensitive content|PROHIBITED_CONTENT|IMAGE_SAFETY|\bSAFETY\b|BLOCKLIST|SPII|blocked by|内容安全|敏感/i;
const CAT=[[/minor|child|CSAM/i,'涉及未成年人'],[/sexual|SEXUALLY_EXPLICIT|nudity|porn|色情/i,'性感/暴露内容'],[/violen|gore|血腥|暴力/i,'暴力或血腥'],[/self-?harm/i,'自残'],[/hate|HATE_SPEECH/i,'仇恨'],[/harass/i,'骚扰'],[/illicit|DANGEROUS/i,'危险或违法内容'],[/SPII|personal/i,'个人隐私信息'],[/copyright|RECITATION|trademark/i,'版权内容']];
function safeErr(raw,j,rid,state=cfg){const cfg=state;const t=String(raw||'')+' '+JSON.stringify(j||'');if(!SAFE_RE.test(t))return null;const e=Error(String(raw||'safety'));const c=CAT.filter(x=>x[0].test(t)).map(x=>x[1]);
 e.safe={cats:[...new Set(c)],where:/InputImage|input image/i.test(t)?'in':/OutputImage|output/i.test(t)?'out':'',rid:rid||(t.match(/req_[A-Za-z0-9]+/)||[])[0]||''};
 let r=String(raw||'').trim();if(cfg.key)r=r.split(cfg.key).join('***');e.raw=r||t.slice(0,600);e.ui=()=>t('被服务商的安全审核拦下了');return e}
async function apiErr(r,j,state=cfg){const cfg=state;if(j===undefined)j=await r.json().catch(()=>null);const raw=(j&&(j.error&&(j.error.message||j.error.status||j.error)||j.message))||r.statusText||'';{const se=safeErr(typeof raw=='string'?raw:JSON.stringify(raw),j,(j&&j.error&&j.error.request_id)||r.headers.get('x-request-id'),state);if(se){se.status=r.status;return se}}
 const m={400:'请求参数有误：常见原因是模型不支持参考图、画幅尺寸不对或图片格式不支持，可换个模型或画幅再试',401:'密钥无效或已过期，请检查 API Key',403:'没有权限：密钥无此模型权限、账户未验证，或所在地区不受支持',404:'地址或模型不存在：请检查 Base URL 和模型名',413:'图片太大，请换一张更小的照片',429:'请求过于频繁或额度已用完，请稍后再试或检查账户余额',500:'服务商内部错误，请稍后重试',502:'网关错误（中转服务不可用）',503:'服务暂时不可用，请稍后重试',504:'服务商响应超时，请重试'}[r.status]||'请求失败（HTTP {status}）';
 let t=String(typeof raw=='string'?raw:JSON.stringify(raw));if(cfg.key)t=t.split(cfg.key).join('***');const bad=/API_KEY_INVALID|API key not valid|invalid api key|Incorrect API key|AuthenticationError|InvalidApiKey/i.test(t+' '+JSON.stringify(j||''));const e=Error(t);e.status=r.status;
 // 提供元が画質や検討量を拒否した場合は、その理由を設定画面から修正できるように残します。
 if(cfg.prov=='openai' && (cfg.quality || cfg.complexity)){
  e.imageOptionError=['quality','complexity'].includes(j?.error?.param) || /\b(quality|complexity)\b/i.test(t);
 }
 e.ui=()=>apiMessage(bad?'密钥无效或已过期，请检查 API Key':m,r.status,t);return e}
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
 // 空欄の項目は送らずモデルの既定値を使います。明示的に選んだ auto は送信します。
 const imageOptions={};
 if(cfg.prov=='openai'){
  if(cfg.quality)imageOptions.quality=cfg.quality;
  if(cfg.complexity)imageOptions.complexity=cfg.complexity;
 }
 const json=async(withImgs,extra)=>{const body=Object.assign({model:m,prompt,n:1},extra,imageOptions);if(withImgs&&imgs.length)body.image=await Promise.all(imgs.map(dataURL));
  const r=await call(`${root()}/images/generations`,{method:'POST',signal:sig,headers:Object.assign({'Content-Type':'application/json'},auth()),body:JSON.stringify(body)});const j=await r.json().catch(()=>null);if(!r.ok)throw await apiErr(r,j);return openaiData(j)};
 if(P=='seedream'){const ex={size:SD[ar]||SD.auto,response_format:'b64_json',watermark:false,sequential_image_generation:'disabled'};try{return{blob:await json(true,ex)}}catch(e){if(!e.safe&&e.status==400&&/image|参考/i.test(e.message)){warn='该模型没有接收参考图，结果只按文字生成，人物与服装可能对不齐。';return{blob:await json(false,ex),warn}}throw e}}
 const sz=AR[ar]||(/^gpt-image/.test(m)?'auto':'1024x1024');
 if(P=='json')return{blob:await json(true,{size:sz})};
 const edits=async field=>{const fd=new FormData();fd.append('model',m);fd.append('prompt',prompt);const one=/^dall-e-2$/.test(m);(one?imgs.slice(0,1):imgs).forEach((b,i)=>fd.append(field,b,`ref-${i+1}.jpg`));fd.append('n','1');fd.append('size',one&&sz=='auto'?'1024x1024':sz);
  for(const [name,value] of Object.entries(imageOptions))fd.append(name,value);
  const r=await call(`${root()}/images/edits`,{method:'POST',signal:sig,headers:auth(),body:fd});const j=await r.json().catch(()=>null);if(!r.ok)throw await apiErr(r,j);return openaiData(j)};
 const f0=cfg.prov=='custom'?cfg.field:'image[]';
 try{return{blob:await edits(f0)}}catch(e){if(e.name=='AbortError'||e.safe||e.imageOptionError)throw e;
  if(e.status==400&&/image/i.test(e.message)&&!/safety|moderation|reject/i.test(e.message)){try{return{blob:await edits(f0=='image[]'?'image':'image[]'),warn:'已自动改用另一种图片字段名重试成功。'}}catch(x){if(x.imageOptionError||x.safe||x.name=='AbortError')throw x}}
  if([404,405,415,501].includes(e.status)||/edits|not supported|unsupported|no such|invalid url/i.test(e.message)){try{return{blob:await json(true,{size:sz}),warn:'该接口不支持 images/edits，已自动改用 images/generations（JSON 多图）。'}}catch(x){if(x.name=='AbortError'||x.safe||x.imageOptionError)throw x;return{blob:await json(false,{size:sz}),warn:'该接口不支持参考图，结果只按文字生成，人物与服装可能对不齐。'}}}
  throw e}}
// ---------- 进度 ----------
let T0,tick,PR=0,done=0,total=1,stageKey,stageParams,warnings=[],lastError;
function stage(key,params){stageKey=key;stageParams=params;$('#wbStage1').textContent=t(key,params)}
function progressTime(){
 const seconds=Math.round((Date.now()-T0)/1000);
 $('#wbTime').textContent=t('{count} 秒',{count:seconds})+(total>1?' · '+t('已完成 {done} / {total}',{done,total}):'');
}
function busy(on){
 $('#wbStop').textContent=t(isComfy()?'停止等待':'取消');
 $('#wbWorkflow').disabled=on;
 $('#wbBusy').hidden=!on;$('#wbGo').classList.toggle('run',on);$('#wbGo').disabled=on;clearInterval(tick);
 if(!on){render();return}
 $('#wbGo').innerHTML=`<i class="ring"></i>${t('生成中…')}`;
 T0=Date.now();PR=.03;progressTime();
 tick=setInterval(()=>{const cap=(done+.95)/total;PR=Math.max(done/total,Math.min(cap,PR+(cap-PR)*.03));$('#wbProg').style.transform=`scaleX(${PR})`;progressTime()},250);
}
const COMFY_STAGES={
 uploading:'正在上传素材…',
 submitting:'正在提交 ComfyUI 工作流…',
 waiting:'正在等待 ComfyUI 结果…',
 downloading:'正在下载 ComfyUI 结果…'
};
const HISTORY_LIMIT=40;
const limitDialog=$('#wbLimit');
limitDialog.addEventListener('keydown',event=>event.stopPropagation());
// 保存ボタンはダイアログを閉じないので、保存した後も生成するかどうかを選べます。
$('#wbLimitZip').onclick=async()=>{
 const status=$('#wbLimitStatus');
 try{
  await downloadHistory();
  status.textContent=t('已开始下载历史图片。');
 }catch{
  status.textContent=t('无法打包历史图片。');
 }
};
async function confirmHistorySpace(planned){
 // クリック直後に前回のエラーを閉じ、件数を調べている間も二重送信を防ぎます。
 $('#wbErr').hidden=true;$('#wbWarn').hidden=true;
 $('#wbBusy').hidden=false;$('#wbGo').disabled=true;
 stage('正在检查历史记录…');
 // ほかのタブでの変更も含めます。保存領域を読めない環境では表示中の履歴を使います。
 const current=await tx('readonly',store=>store.count()).catch(()=>W.hist?.length||0);
 if(W.busy.signal.aborted)return false;
 const removed=current+planned-HISTORY_LIMIT;
 if(removed<=0)return true;
 $('#wbBusy').hidden=true;
 $('#wbLimitText').textContent=t('现有 {current} 条记录。如果计划生成的 {planned} 张图片全部保存，最早的 {removed} 条记录将被删除。',{current,planned,removed});
 $('#wbLimitStatus').textContent='';
 // Escで閉じたとき、前回の「生成を続ける」が選択結果に残らないようにします。
 limitDialog.returnValue='';
 limitDialog.showModal();
 return new Promise(resolve=>limitDialog.addEventListener('close',()=>resolve(limitDialog.returnValue==='generate'),{once:true}));
}
async function runComfy(){
 if(!hasPerson())return toast('请先上传人物照片');
 if(!W.garments.length)return toast('请先选择服装');
 if(W.persons.length!=1||W.garments.length!=1)return toast(COMFY_LIMIT);
 if(!canPickPose()&&W.poses.length)return toast(COMFY_POSE);
 if(!comfy.workflow){toast('请选择 ComfyUI 试穿工作流。');return cfgOpen()}
 const ac=new AbortController(),before=W.persons[0].blob,reference=W.garments[0];
 const {base,workflow,mapping,name}=comfy;
 const count=outputCount(),ratio=$('#wbAR').value;
 const aspect=mapping.aspect&&ratio!='auto'?ratio:undefined;
 const edited=W.dirty?$('#wbPrompt').value.trim():'';
 const output=[],errors=[];
 // 画像の取得を待つ前に各ジョブのプロンプトと角度を確定し、シート出力は使いません。
 const sets=poseSets().map(set=>({
  pose:set[0]&&{...set[0]},
  prompt:mapping.prompt?edited||compose(set):undefined
 }));
 // 繰り返し出力はジョブごとに異なるシードを使います。1枚だけならグラフの値を保ちます。
 const firstSeed=mapping.seed&&sets.length*count>1?crypto.getRandomValues(new Uint32Array(1))[0]:undefined;
 W.busy=ac;
 if(!await confirmHistorySpace(sets.length*count)){W.busy=null;busy(false);return}
 done=0;total=sets.length*count;
 let savedAny=false,saveFailed=false;
 busy(true);stage('正在准备素材…');
 try{
  const garment=await assetBlob(reference,ac.signal),jobs=[];
  const poseAssets=new Map();
  for(const {pose,prompt} of sets){
   let image;
   if(pose){
    try{
     const src=libSrc(pose);
     if(!poseAssets.has(src))poseAssets.set(src,assetBlob(pose,ac.signal));
     image=await poseAssets.get(src);
    }catch(error){
     ac.signal.throwIfAborted();
     for(let i=0;i<count;i++)errors.push(error);
     done+=count;continue;
    }
   }
   for(let i=0;i<count;i++){
    jobs.push({pose:image,prompt,aspect,seed:firstSeed===undefined?undefined:firstSeed+jobs.length,poseKey:pose?.k});
   }
  }
  if(jobs.length){
   await window.ComfyUI.generateBatch({
    base,workflow,mapping,person:before,garment,jobs,signal:ac.signal,
    onProgress:progress=>stage(COMFY_STAGES[progress]),
    onError(error){errors.push(error);done++},
    async onResult(after,index){
     const job=jobs[index],it=A.ITEMS[job.poseKey];
     const rec={
      t:Date.now()+Math.random(),prov:'comfy',model:name,mode:'tryon',before,after,
      prompt:job.prompt,poseNames:it?[{zh:it.zh,en:it.titleEn,ja:it.titleJa}]:[]
     };
     if(await save(rec))savedAny=true;
     else saveFailed=true;
     output.push(rec);done++;W.results=output.slice();show(output.length-1);
    }
   });
  }
  if(output.length)toast(output.length>1?'完成 {count} 张':'生成完成',null,{count:output.length});
  if(errors.length){
   const error=errors[0];
   errBox(error.code?imageError(COMFY_ERRORS[error.code]||COMFY_ERRORS.execution):error,errors.length>1||output.length?errors.length:0);
  }
 }catch(error){
  if(ac.signal.aborted)toast('已停止等待。请在 ComfyUI 中查看队列。');
  else errBox(error.code?imageError(COMFY_ERRORS[error.code]||COMFY_ERRORS.execution):error);
 }finally{
  if(savedAny)hist();
  if(saveFailed){
   // 保存できない画像も結果に残し、ダウンロードできるようにします。
   warnings=['无法保存试穿记录，请下载结果图片。'];
   $('#wbWarn').textContent=t(warnings[0]);$('#wbWarn').hidden=false;
  }
  W.busy=null;busy(false);
 }
}
async function run(){if(W.busy)return;if(isComfy())return runComfy();if(!cfg.key){toast('请先配置你的 API');return cfgOpen()}const need=missingReference();if(need)return toast(need);
 const ac=new AbortController();W.busy=ac;
 // 非同期の画像読み込みが始まる前に、表示中の送信言語と本文を画像ごとに確定します。
 const n=+$('#wbN').value||1,jobs=[],pl=W.pl,edited=W.dirty?$('#wbPrompt').value.trim():'';
 for(const set of poseSets()){
  const prompt0=edited||compose(set,pl),soft=neutralOn()&&!isAdultJob(set);
  const prompt=soft?neutralize(prompt0,pl):prompt0;
  for(let i=0;i<n;i++)jobs.push({set,prompt0,soft,prompt});
 }
 if(!await confirmHistorySpace(jobs.length)){W.busy=null;busy(false);return}
 done=0;total=jobs.length;busy(true);stage('正在准备素材…');const errs=[],warns=new Set(),got=[];
 try{const pb=W.persons.map(p=>p.blob),gb=await Promise.all(W.garments.map(g=>assetBlob(g,ac.signal))),cache=new Map();const poseB=async p=>{const key=p.k+':'+p.ai;if(!cache.has(key))cache.set(key,assetBlob(p,ac.signal));return cache.get(key)};
  stage(total>1?'模型正在绘制… 共 {count} 张':'模型正在绘制…',{count:total});
  let q=0;const worker=async()=>{while(q<jobs.length&&!ac.signal.aborted){const {set,prompt0,soft,prompt}=jobs[q++];try{const imgs=[...pb,...gb,...await Promise.all(set.map(poseB))];W.lastSent=prompt;
    const jc=new AbortController(),onA=()=>jc.abort();ac.signal.addEventListener('abort',onA);let tmo=false;const tm=setTimeout(()=>{tmo=true;jc.abort()},window.__TMO||180000);let r;try{r=await genOnce(imgs,prompt,jc.signal)}catch(x){x.sent=prompt;if(tmo&&!ac.signal.aborted){const y=Error('timeout');y.ui=()=>t('等了 3 分钟还没有返回。服务商可能正忙，稍后点「重试」。');throw y}throw x}finally{clearTimeout(tm);ac.signal.removeEventListener('abort',onA)}if(r.warn)warns.add(r.warn);const rec={t:Date.now()+Math.random(),prov:cfg.prov,model:modelOf(),prompt,orig:soft?prompt0:null,neutral:soft,mode:W.mode,label:set.map(p=>poseDesc(p,'zh').split('（')[0]).join(' / ')||'',poseNames:set.map(p=>A.ITEMS[p.k]).filter(Boolean).map(it=>({zh:it.zh,en:it.titleEn,ja:it.titleJa})),before:pb[0]||null,after:r.blob};got.push(rec);await save(rec);W.results=got.slice();show(got.length-1)}
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
function exportSettings(local){
 // ローカル試着のエクスポートには、以前に使用したクラウドのキーや接続先を含めません。
 const withKey=!local&&confirm(t('导出时包含 API Key 吗？\n确定 = 包含，取消 = 不含密钥'));
 const o=local?{prov:'comfy'}:{...cfg,prov:cfg.prov=='comfy'?cfg.cloudProv||'openai':cfg.prov};
 if(!withKey)delete o.key;
 const value={app:'衣姿 PoseWear',type:'api-config',cfg:o};
 if(local)value.comfy=comfyState;
 window.X.dl(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),t('衣姿-API设置.json'));
 msg(withKey?'已导出设置（含密钥，请妥善保管）':'已导出设置（不含密钥）');
}
$('#cfExp').onclick=()=>exportSettings(false);
$('#cfComfyExport').onclick=()=>exportSettings(true);
$('#cfImp').onclick=$('#cfComfyImport').onclick=()=>$('#cfImpF').click();
$('#cfImpF').onchange=async e=>{
 const file=e.target.files[0],revision=++configRevision;
 e.target.value='';
 if(!file)return;
 try{
  const j=JSON.parse(await file.text()),o=j.cfg||j;
  if(revision!=configRevision)return;
  if(W.busy)return msg('请等待当前生成完成。',1);
  if(!Object.hasOwn(PROV,o.prov))throw Error('invalid provider');
  if(o.prov=='comfy'){
   if(comfyState.workflows.length&&!confirm(t('用备份替换全部已注册的工作流？')))return;
   useComfyState(workflowStore.replace(j.comfy));setComfyProvider();
   cfgClose();comfyOpen();
  }else{
   // インポートでは既知の設定項目だけを反映します。
   for(const key of ['prov','base','key','model','field','proto','proxy']){
    if(typeof o[key]==typeof cfg[key])cfg[key]=o[key];
   }
   // 旧形式のバックアップに任意項目がないときはモデル既定の空欄に戻します。
   for(const key of ['quality','complexity'])cfg[key]=typeof o[key]=='string'?o[key].trim():'';
   comfyClose();cloudCfgOpen();
  }
  SV('wbCfg',cfg);render();msg('已导入设置');
 }catch(error){
  if(revision==configRevision)msg(error.code?()=>comfyError(error):'导入失败：文件格式不正确',1);
 }
};
$('#wbDl').onclick=()=>{const r=W.results[W.ri];if(!r)return;const l=document.createElement('a');l.href=U(r.after);l.download=`posewear-${r.mode=='gen'?'gen':'tryon'}-${stamp(new Date(r.t))}-${String(W.ri+1).padStart(2,'0')}.png`;l.click()};
$('#wbUse').onclick=async()=>{const r=W.results[W.ri];if(!r)return;const x=await toJpeg(U(r.after),1536);W.persons=[{blob:x.blob,url:URL.createObjectURL(x.blob),w:x.w,h:x.h}];W.mode='tryon';render();toast('已将结果设为新的人物照片')};
function setX(x){$('#wbCmp').style.setProperty('--x',x+'%');$('#wbRange').value=x}$('#wbRange').oninput=e=>setX(e.target.value);
// ---------- IndexedDB ----------
let dbp;const db=()=>dbp||(dbp=new Promise((r,j)=>{const q=indexedDB.open('lk-studio',1);q.onupgradeneeded=()=>q.result.createObjectStore('h',{keyPath:'t'});q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)}));
const tx=async(m,f)=>{const d=await db();return new Promise((r,j)=>{const t=d.transaction('h',m),s=t.objectStore('h'),q=f(s);t.oncomplete=()=>r(q&&q.result);t.onerror=()=>j(t.error)})};
async function save(rec){
 // まず画像を履歴に保存し、書き込みの成功を呼び出し元に知らせます。
 try{await tx('readwrite',s=>s.put(rec))}catch{return false}
 try{
  const all=await tx('readonly',s=>s.getAllKeys());
  if(all.length>HISTORY_LIMIT)await tx('readwrite',s=>{all.slice(0,all.length-HISTORY_LIMIT).forEach(k=>s.delete(k))});
 }catch{/* 古い履歴の整理に失敗しても、今回の画像は保存済みです。 */}
 return true;
}
// 保存ボタンを押した時点の履歴を読み、生成画像だけを日時と連番付きでまとめます。
async function downloadHistory(){
 const records=await tx('readonly',store=>store.getAll());
 if(!records.length)return toast('还没有生成记录');
 const files=records.map((record,index)=>{
  const extension=record.after.type.split('/')[1]||'png';
  const name=`posewear-${stamp(new Date(record.t))}-${p2(index+1)}.${extension}`;
  return {name,blob:record.after};
 });
 window.X.dl(await makeZip(files),`posewear-history-${stamp(new Date())}.zip`);
}
$('#wbHistZip').onclick=()=>downloadHistory().catch(()=>toast('无法打包历史图片。'));
let hu=[];
async function hist(){
 let L=[];
 try{L=(await tx('readonly',s=>s.getAll()))||[]}catch(e){}
 L.sort((a,b)=>b.t-a.t);hu.forEach(URL.revokeObjectURL);hu=[];
 $('#wbHist').innerHTML=L.length?L.map(r=>{
  const u=URL.createObjectURL(r.after);hu.push(u);
  return `<button data-t="${r.t}"><img src="${u}" alt=""><span></span><i data-del="${r.t}" aria-label="">×</i></button>`;
 }).join(''):`<p class="fine"></p>`;
 $('#wbHistZip').disabled=!L.length;
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
window.WB={async show(){await init();render()},async pick(it){await init();if(it.type=='pose'){if(!canPickPose())return toast(COMFY_POSE);if(!W.poses.some(p=>p.k==it.k)){if(W.poses.length>=6)W.poses.shift();W.poses.push({kind:'lib',k:it.k,ai:it.ai})}toast('已加入姿势参考（{count} 个）',null,{count:W.poses.length})}else if(it.type=='portrait'){await addPortrait(it)}else{W.garments=[{kind:'lib',k:it.k}];toast('已选为试穿服装')}A.setTab('studio')},_W:W,_cfg:cfg};
// 言語変更で更新するのは表示だけです。入力、生成、履歴の再読み込みは行いません。
addEventListener('uilocalechange',()=>{
 if(inited)render(true);
 if(!$('#cfg').hidden){
  cfgLabels($('[name=prov]:checked')?.value||cfg.prov);
  if(modelStatus)$('#cfModelStatus').textContent=modelStatus();
  if(cfgMessage)$('#cfMsg').textContent=cfgMessage();
 }
 if(!$('#comfyManager').hidden){
  $('#cfComfyName').textContent=comfyDraft.fileName||t('尚未选择文件');
  $('#cfComfySaved').options[0].textContent=t('选择已注册的工作流');
  for(const [,selector,required] of COMFY_BINDINGS){
   $(selector).options[0].textContent=t(required?'请选择节点':'不指定节点');
  }
  if(cfgMessage)$('#cfComfyMsg').textContent=cfgMessage();
 }
 if(!$('#pk').hidden){
  pickerTitle();
  if(A.DATA[pkType])drawPk();
 }
 if(W.busy&&stageKey){stage(stageKey,stageParams);progressTime();$('#wbStop').textContent=t(isComfy()?'停止等待':'取消')}
 if(!$('#wbWarn').hidden)$('#wbWarn').textContent=warnings.map(key=>t(key)).join(' ');
 if(lastError&&!$('#wbErr').hidden)errorText();
 if(W.results[W.ri])resultText(W.results[W.ri]);
 historyText();
});
if(document.body.classList.contains('studio'))WB.show();
if(location.hash=='#studio'){const t0=()=>scrollTo(0,0);requestAnimationFrame(t0);addEventListener('load',()=>setTimeout(t0,0),{once:true})}
addEventListener('keydown',e=>{if(e.key=='Escape'){if(!$('#pk').hidden)pkClose();else if(!$('#comfyManager').hidden)comfyClose();else if(!$('#cfg').hidden)cfgClose()}});
})();
// v10：手机端把密钥引导卡放到第 1 步之前
(()=>{const mq=matchMedia('(max-width:760px)'),o=document.getElementById('wbOnb');if(!o)return;const place=()=>{if(mq.matches){const s1=document.querySelector('.st-l [data-s="1"]');s1&&s1.parentNode.insertBefore(o,s1)}else document.querySelector('.st-c').prepend(o)};place();mq.addEventListener('change',place)})();
