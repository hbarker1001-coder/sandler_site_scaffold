
const Q = new URLSearchParams(location.search);
const by = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

async function loadCSV(path){
  const res = await fetch(path, {cache:'no-cache'});
  if(!res.ok) throw new Error('Failed to load '+path);
  const text = await res.text();
  return parseCSV(text);
}

function lsKey(module_id){ return `sandler:${module_id}`; }
function getState(module_id){ try{return JSON.parse(localStorage.getItem(lsKey(module_id)))||{};}catch{return{}} }
function setState(module_id, obj){ localStorage.setItem(lsKey(module_id), JSON.stringify(obj||{})); }

function modClipUrl(module_id, clip_id){ return `clip.html?module_id=${encodeURIComponent(module_id)}&clip_id=${encodeURIComponent(clip_id)}` }
function modQuizUrl(module_id){ return `quiz.html?module_id=${encodeURIComponent(module_id)}` }

function flash(msg){
  const n = document.createElement('div');
  n.className = 'notice'; n.textContent = msg;
  n.style.position='fixed'; n.style.bottom='20px'; n.style.right='20px'; n.style.boxShadow='var(--shadow)';
  document.body.appendChild(n); setTimeout(()=>n.remove(),1600);
}

async function renderIndex(){
  const modules = (await loadCSV('data/Modules.csv'))
    .sort((a,b)=>Number(a.order||999)-Number(b.order||999));
  const clips = await loadCSV('data/Clips.csv');
  const wrap = by('#modules');
  wrap.innerHTML = '';
  modules.forEach(m => {
    const total = clips.filter(c => c.module_id===m.module_id).length;
    const st = getState(m.module_id);
    const done = st.completed ? '✅' : '';
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <h3>${m.module_title} ${done}</h3>
      <p>${m.module_description||''}</p>
      <p><strong>${total}</strong> clips • Pass mark: ${m.pass_mark_percent||80}%</p>
      <div class="grid" style="grid-template-columns:auto auto;gap:8px">
        <a class="btn btn-primary" href="${modClipUrl(m.module_id,'first')}">Start module</a>
        <a class="btn btn-ghost" href="${modQuizUrl(m.module_id)}">Go to quiz</a>
      </div>
    `;
    wrap.appendChild(div);
  });
}

async function renderClip(){
  const module_id = Q.get('module_id');
  let clip_id = Q.get('clip_id');
  const modules = await loadCSV('data/Modules.csv');
  const module = modules.find(m=>m.module_id===module_id);
  const clips = (await loadCSV('data/Clips.csv'))
    .filter(c=>c.module_id===module_id)
    .sort((a,b)=>Number(a.order||999)-Number(b.order||999));
  if(clip_id==='first') clip_id = clips[0]?.clip_id;
  const clipIdx = clips.findIndex(c=>c.clip_id===clip_id);
  const clip = clips[clipIdx];
  if(!clip){ by('#content').innerHTML='<div class="notice">Clip not found.</div>'; return; }

  const qs = (await loadCSV('data/Clip_Questions.csv'))
    .filter(q=>q.module_id===module_id && q.clip_id===clip_id)
    .sort((a,b)=>Number(a.question_order||999)-Number(b.question_order||999));

  by('#moduleTitle').textContent = module?.module_title || module_id;
  by('#clipTitle').textContent = clip.clip_title;
  const audio = by('#audio');
  audio.innerHTML = `<source src="${clip.audio_url}" type="audio/mpeg">`;
  audio.load();

  const st = getState(module_id);
  const rwrap = by('#reflectForm'); rwrap.innerHTML='';
  qs.forEach((q, i) => {
    const id = `r_${clip_id}_${q.question_order}`;
    const div = document.createElement('div');
    div.className='q';
    div.innerHTML = `<label for="${id}">${i+1}. ${q.question_text}</label>
      <textarea id="${id}" placeholder="Type your answer..."></textarea>`;
    rwrap.appendChild(div);
    if(st.reflections && st.reflections[id]) by('#'+id).value = st.reflections[id];
  });

  by('#saveReflections').onclick = () => {
    const s = getState(module_id); s.reflections = s.reflections || {};
    qs.forEach(q => {
      const id = `r_${clip_id}_${q.question_order}`;
      s.reflections[id] = (by('#'+id).value||'').trim();
    });
    setState(module_id, s); flash('Saved');
  };

  by('#nextBtn').onclick = () => {
    const next = clips[clipIdx+1];
    if(next){ location.href = modClipUrl(module_id, next.clip_id); }
    else{ location.href = modQuizUrl(module_id); }
  };
  by('#prevBtn').onclick = () => {
    const prev = clips[clipIdx-1];
    if(prev){ location.href = modClipUrl(module_id, prev.clip_id); }
    else{ location.href = 'index.html'; }
  };

  // audio progress
  const bar = by('#audioProgress');
  audio.addEventListener('timeupdate', () => {
    const pct = (audio.currentTime/(audio.duration||1))*100;
    bar.style.width = pct.toFixed(1)+'%';
    const s = getState(module_id); s.audioTime = s.audioTime || {}; s.audioTime[clip_id] = audio.currentTime; setState(module_id, s);
  });
  const s0 = getState(module_id); if(s0.audioTime && s0.audioTime[clip_id]) audio.currentTime = s0.audioTime[clip_id];
}

function shuffle(arr){ return [...arr].sort(()=>Math.random()-0.5); }

async function renderQuiz(){
  const module_id = Q.get('module_id');
  const modules = await loadCSV('data/Modules.csv');
  const module = modules.find(m=>m.module_id===module_id);
  const passMark = Number(module?.pass_mark_percent || 80);
  by('#moduleTitle').textContent = module?.module_title || module_id;

  const qrows = (await loadCSV('data/Module_Quiz.csv'))
    .filter(q=>q.module_id===module_id)
    .sort((a,b)=>Number(a.question_order||999)-Number(b.question_order||999));

  const wrap = by('#quizWrap'); wrap.innerHTML='';
  const state = getState(module_id);

  qrows.forEach((item, idx) => {
    const qBox = document.createElement('div'); qBox.className='mcq';
    const choices = [];
    if(item.correct_answer) choices.push({text:item.correct_answer, correct:true});
    ['choice_a','choice_b','choice_c','choice_d','distractor_1','distractor_2','distractor_3','distractor_4'].forEach(k=>{
      if(item[k] && item[k]!==item.correct_answer) choices.push({text:item[k], correct:false});
    });
    const unique = []; const seen = Set ? new Set() : {add:()=>{},has:()=>false};
    choices.forEach(c=>{ const key = c.text.toLowerCase(); if(!seen.has(key)){ seen.add(key); unique.push(c);} });
    const finalChoices = shuffle(unique);

    qBox.innerHTML = `
      <h3>${idx+1}. ${item.question_text}</h3>
      <div class="choices">
        ${finalChoices.map((c,i)=>`
          <label class="choice">
            <input type="radio" name="q_${item.question_id}" value="${c.text.replace(/"/g,'&quot;')}" />
            <div>${c.text}</div>
          </label>
        `).join('')}
      </div>
      <div class="explain" id="exp_${item.question_id}" style="margin-top:6px;display:none"></div>
    `;
    wrap.appendChild(qBox);

    const sel = state.quiz?.[item.question_id];
    if(sel){
      qBox.querySelectorAll(`input[name="q_${item.question_id}"]`).forEach(r=>{ if(r.value===sel) r.checked = true; });
    }

    qBox.addEventListener('change', (e)=>{
      const st = getState(module_id); st.quiz = st.quiz || {}; st.quiz[item.question_id] = e.target.value; setState(module_id, st);
    });
  });

  by('#submitQuiz').onclick = () => {
    const st = getState(module_id);
    let correct = 0; const total = qrows.length;
    qrows.forEach(item => {
      const user = st.quiz?.[item.question_id];
      const isCorrect = (user || '').trim() === (item.correct_answer||'').trim();
      if(isCorrect) correct++;
      const box = by('#exp_'+item.question_id);
      box.style.display='block';
      const expl = item.explanation || (isCorrect ? 'Correct.' : 'Review the lesson and try again.');
      box.innerHTML = isCorrect ? `<span class="chip ok">Correct</span> ${expl}` : `<span class="chip fail">Incorrect</span> ${expl}`;
    });
    const percent = Math.round((correct/Math.max(1,total))*100);
    const pass = percent >= passMark;
    st.result = {correct,total,percent,pass,when:new Date().toISOString()};
    if(pass) st.completed = true;
    setState(module_id, st);
    by('#quizResult').innerHTML = `
      <div class="notice">
        <div class="score">Score: ${percent}% (${correct}/${total})</div>
        <div>${ pass ? 'Great work. You passed.' : 'Keep going. Review and try again.'}</div>
      </div>
    `;
  };

  by('#certBtn').onclick = () => {
    const st = getState(module_id);
    if(!st.result || !st.result.pass){ flash('Pass the quiz first'); return; }
    const c = document.getElementById('certCanvas'); const ctx = c.getContext('2d');
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height);
    ctx.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--primary') || '#0a5cff';
    ctx.lineWidth=12; ctx.strokeRect(40,40,c.width-80,c.height-80);
    ctx.fillStyle='#111827'; ctx.font='bold 64px Inter, Arial, sans-serif';
    ctx.fillText('Certificate of Completion', 140, 200);
    ctx.fillStyle='#374151'; ctx.font='28px Inter, Arial, sans-serif'; ctx.fillText('This certifies that', 140, 260);
    ctx.fillStyle='#111827'; ctx.font='bold 48px Inter, Arial, sans-serif'; ctx.fillText('Participant', 140, 320);
    ctx.fillStyle='#374151'; ctx.font='28px Inter, Arial, sans-serif';
    ctx.fillText(`has completed ${module?.module_title || module_id}`, 140, 370);
    ctx.font='24px Inter, Arial, sans-serif';
    ctx.fillText('Score: ' + (st.result.percent||0) + '%', 140, 420);
    ctx.fillText('Date: ' + (new Date().toLocaleDateString()), 140, 460);
    ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c2a8';
    ctx.beginPath(); ctx.arc(1100, 750, 120, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='bold 44px Inter, Arial, sans-serif'; ctx.fillText('Sandler', 1030, 760);
    const url = c.toDataURL('image/png');
    const a = document.getElementById('certDownload'); a.href=url; a.download=`${module_id}-certificate.png`; a.style.display='inline-block'; a.textContent='Download certificate';
  };
}

window.addEventListener('DOMContentLoaded', async () => {
  const page = document.body.dataset.page;
  try{
    if(page==='index') await renderIndex();
    if(page==='clip') await renderClip();
    if(page==='quiz') await renderQuiz();
  }catch(err){
    console.error(err);
    const el = document.querySelector('#content') || document.body;
    el.innerHTML = `<div class="notice">Error: ${err.message}</div>`;
  }
});
