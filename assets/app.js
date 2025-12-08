// =====================
// Helpers & user state
// =====================

const Q  = new URLSearchParams(location.search);
const by = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const USER_KEY = 'sandler:user';

function userIdFromName(name){
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '') || 'anon';
}

function getUser(){
  try {
    const u = JSON.parse(localStorage.getItem(USER_KEY)) || {};
    // Backfill id if missing
    if (u.name && !u.id) {
      u.id = userIdFromName(u.name);
      setUser(u);
    }
    return u;
  } catch {
    return {};
  }
}

function setUser(u){
  localStorage.setItem(USER_KEY, JSON.stringify(u || {}));
}

// Per-user, per-module state
function lsKey(module_id){
  const user = getUser();
  const uid  = (user && user.id) || 'anon';
  return `sandler:${uid}:module:${module_id}`;
}

function getState(module_id){
  try {
    return JSON.parse(localStorage.getItem(lsKey(module_id))) || {};
  } catch {
    return {};
  }
}

function setState(module_id, obj){
  localStorage.setItem(lsKey(module_id), JSON.stringify(obj || {}));
}

// CSV loader (csv.js must define parseCSV)
async function loadCSV(path){
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error('Failed to load ' + path);
  const text = await res.text();
  return parseCSV(text);
}

// UI helpers
function flash(msg){
  const n = document.createElement('div');
  n.className = 'notice';
  n.textContent = msg;
  n.style.position = 'fixed';
  n.style.bottom = '20px';
  n.style.right = '20px';
  n.style.boxShadow = 'var(--shadow)';
  n.style.zIndex = 50;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 1800);
}

function shuffle(arr){
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Name bar wiring
function initNameBar(){
  const nameInput = by('#userNameInput');
  const nameLabel = by('#userNameLabel');
  const saveBtn   = by('#saveNameBtn');
  if (!nameInput || !saveBtn) return;

  const user = getUser();
  if (user.name){
    nameInput.value = user.name;
    if (nameLabel) nameLabel.textContent = `Participant: ${user.name}`;
  } else if (nameLabel){
    nameLabel.textContent = 'Participant: (enter your name)';
  }

  saveBtn.addEventListener('click', () => {
    const v = nameInput.value.trim();
    const u = getUser();
    u.name = v;
    u.id   = userIdFromName(v);
    setUser(u);
    if (nameLabel) {
      nameLabel.textContent = v ? `Participant: ${v}` : 'Participant: (enter your name)';
    }
    flash('Name saved');
  });
}

// URL builders
function moduleClipUrl(module_id, clip_id){
  return `clip.html?module_id=${encodeURIComponent(module_id)}&clip_id=${encodeURIComponent(clip_id)}`;
}

function moduleQuizUrl(module_id){
  return `quiz.html?module_id=${encodeURIComponent(module_id)}`;
}

// =====================
// Index page
// =====================

async function renderIndex(){
  initNameBar();

  const modules = (await loadCSV('data/Modules.csv'))
    .sort((a, b) => Number(a.order || 999) - Number(b.order || 999));

  const clips   = await loadCSV('data/Clips.csv');
  const wrap    = by('#modules');
  if (!wrap) return;
  wrap.innerHTML = '';

  modules.forEach(m => {
    const moduleClips = clips
      .filter(c => c.module_id === m.module_id)
      .sort((a, b) => Number(a.order || 999) - Number(b.order || 999));

    const total = moduleClips.length;
    const st   = getState(m.module_id);
    const completed = st.result?.pass;

    // Does this user have ANY progress saved for this module?
    const hasProgress = !!(st.lastClipId || st.quiz || st.clipQuiz);

    // Where should the main button send them?
    const nextClipId = hasProgress && st.lastClipId
      ? st.lastClipId
      : (moduleClips[0] && moduleClips[0].clip_id);

    const primaryLabel = completed
      ? 'Review module'
      : (hasProgress ? 'Resume module' : 'Start module');

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>${m.module_title || m.module_id} ${completed ? '✅' : ''}</h3>
      <p class="muted">${m.module_description || ''}</p>
      <p><strong>${total}</strong> audio clips · Pass mark: ${m.pass_mark_percent || 80}%</p>
      <div class="grid" style="grid-template-columns:auto auto;gap:8px;margin-top:6px">
        <a class="btn btn-primary" href="${moduleClipUrl(m.module_id, nextClipId || 'first')}">${primaryLabel}</a>
        <a class="btn btn-ghost" href="${moduleQuizUrl(m.module_id)}">Go to quiz</a>
      </div>
    `;
    wrap.appendChild(card);
  });
}

// =====================
// Clip page (audio + MCQs per clip)
// =====================

async function renderClip(){
  initNameBar();
  const module_id = Q.get('module_id');
  let   clip_id   = Q.get('clip_id');

  if (!module_id){
    const c = by('#content');
    if (c) c.innerHTML = '<div class="notice">Missing module_id.</div>';
    return;
  }

  const modules = await loadCSV('data/Modules.csv');
  const module  = modules.find(m => m.module_id === module_id);

  const clips = (await loadCSV('data/Clips.csv'))
    .filter(c => c.module_id === module_id)
    .sort((a, b) => Number(a.order || 999) - Number(b.order || 999));

  if (!clips.length){
    const c = by('#content');
    if (c) c.innerHTML = '<div class="notice">No clips configured for this module yet.</div>';
    return;
  }

  const st = getState(module_id);

  if (clip_id === 'first' || !clip_id){
    clip_id = st.lastClipId || clips[0].clip_id;
  }

  const idx  = clips.findIndex(c => c.clip_id === clip_id);
  const clip = clips[idx >= 0 ? idx : 0];

  const moduleTitleEl = by('#moduleTitle');
  const clipTitleEl   = by('#clipTitle');
  if (moduleTitleEl) moduleTitleEl.textContent = module?.module_title || module_id;
  if (clipTitleEl)   clipTitleEl.textContent   = clip.clip_title || clip.clip_id;

  // --- Audio handling ---
  const audio       = by('#audio');
  const progressBar = by('#audioProgress');
  const audioNotice = by('#audioNotice');

  if (audio){
    if (!clip.audio_url){
      audio.style.display = 'none';
      if (audioNotice){
        audioNotice.textContent = 'No audio file configured for this clip yet. Check data/Clips.csv.';
        audioNotice.style.display = 'block';
      }
    } else {
      audio.style.display = 'block';
      if (audioNotice){
        audioNotice.style.display = 'block';
        audioNotice.textContent = 'Audio source: ' + clip.audio_url;
      }

      audio.innerHTML = '';
      const src = document.createElement('source');
      src.src  = clip.audio_url;
      src.type = 'audio/mpeg';
      audio.appendChild(src);
      audio.load();

      const audioTime = (st.audioTime && st.audioTime[clip.clip_id]) || 0;
      if (audioTime && !isNaN(audioTime)){
        audio.currentTime = audioTime;
      }

      audio.onerror = () => {
        if (audioNotice){
          audioNotice.style.display = 'block';
          audioNotice.textContent = 'Could not load audio. Is this a public audio file? ' + clip.audio_url;
        }
        console.error('Audio failed to load for clip', clip.clip_id, 'URL:', clip.audio_url);
      };

      audio.addEventListener('timeupdate', () => {
        if (audio.duration){
          const pct = (audio.currentTime / audio.duration) * 100;
          if (progressBar) progressBar.style.width = `${pct.toFixed(1)}%`;
        }
        const s = getState(module_id);
        s.audioTime = s.audioTime || {};
        s.audioTime[clip.clip_id] = audio.currentTime;
        s.lastClipId = clip.clip_id;
        setState(module_id, s);
      });
    }
  }

  // --- Clip questions as MCQs ---
  const qs = (await loadCSV('data/Clip_Questions.csv'))
    .filter(q => q.module_id === module_id && q.clip_id === clip.clip_id)
    .sort((a, b) => Number(a.question_order || 999) - Number(b.question_order || 999));

  const form = by('#reflectForm');
  if (!form) return;
  form.innerHTML = '';

  const state = getState(module_id) || {};
  state.clipQuiz = state.clipQuiz || {};
  const clipQuizState = state.clipQuiz;
  const qMeta = [];

  qs.forEach((q, i) => {
    const qKey    = `cq_${clip.clip_id}_${q.question_order}`;
    const wrapper = document.createElement('div');
    wrapper.className = 'mcq';

    // Parse Answer column: CA: / IA:
    const raw = (q.Answer || q.answers || q.Answers || '').split(/\r?\n/);
    const choices = [];
    let correctText = '';

    raw.forEach(line => {
      const t = line.trim();
      if (!t) return;
      const m = t.match(/^(CA|IA)\s*:\s*(.+)$/i);
      if (!m) return;
      const type = m[1].toUpperCase();
      const text = m[2].trim();
      const isCorrect = type === 'CA';
      if (isCorrect) correctText = text;
      choices.push({ text, correct: isCorrect });
    });

    if (!choices.length){
      const text = q.Answer || 'No answers configured';
      choices.push({ text, correct: true });
      correctText = text;
    }

    const finalChoices = shuffle(choices);

    wrapper.innerHTML = `
      <h3>${i + 1}. ${q.question_text}</h3>
      <div class="choices">
        ${finalChoices.map(c => `
          <label class="choice">
            <input type="radio" name="${qKey}" value="${c.text.replace(/"/g, '&quot;')}" />
            <div>${c.text}</div>
          </label>
        `).join('')}
      </div>
      <div class="explain" id="exp_${qKey}" style="margin-top:6px;display:none"></div>
    `;

    form.appendChild(wrapper);

    // Restore saved choice
    const savedVal = clipQuizState[qKey]?.value;
    if (savedVal){
      wrapper.querySelectorAll(`input[name="${qKey}"]`).forEach(r => {
        if (r.value === savedVal) r.checked = true;
      });
    }

    qMeta.push({
      key: qKey,
      correctText,
      explanation: q.explanation || ''
    });

    wrapper.addEventListener('change', e => {
      const st2 = getState(module_id) || {};
      st2.clipQuiz = st2.clipQuiz || {};
      st2.clipQuiz[qKey] = { value: e.target.value };
      setState(module_id, st2);
    });
  });

  const saveBtn = by('#saveReflections');
  if (saveBtn){
    saveBtn.onclick = () => {
      const st2 = getState(module_id) || {};
      st2.clipQuiz = st2.clipQuiz || {};

      qMeta.forEach(meta => {
        const { key, correctText, explanation } = meta;
        const inputs = document.querySelectorAll(`input[name="${key}"]`);
        let chosen = '';
        inputs.forEach(r => { if (r.checked) chosen = r.value; });
        const isCorrect = (chosen || '').trim() === (correctText || '').trim();

        st2.clipQuiz[key] = {
          value: chosen,
          correct: isCorrect
        };

        const expEl = by('#exp_' + key);
        if (expEl){
          expEl.style.display = 'block';
          const expl = explanation || (
            isCorrect
              ? 'Correct – this matches the key learning from this clip.'
              : 'Review the audio again and pay attention to how Sandler handles this point.'
          );
          expEl.innerHTML = isCorrect
            ? `<span class="chip ok">Correct</span> ${expl}`
            : `<span class="chip fail">Incorrect</span> ${expl}`;
        }
      });

      setState(module_id, st2);
      flash('Answers saved for this clip');
    };
  }

  // Navigation
  const prevBtn = by('#prevBtn');
  const nextBtn = by('#nextBtn');

  if (prevBtn){
    prevBtn.onclick = () => {
      const prev = clips[idx - 1];
      if (prev){
        location.href = moduleClipUrl(module_id, prev.clip_id);
      } else {
        location.href = 'index.html';
      }
    };
  }

  if (nextBtn){
    nextBtn.onclick = () => {
      const next = clips[idx + 1];
      if (next){
        location.href = moduleClipUrl(module_id, next.clip_id);
      } else {
        location.href = moduleQuizUrl(module_id);
      }
    };
  }
}

// =====================
// Quiz page (module MCQs + certificate)
// =====================

async function renderQuiz(){
  initNameBar();
  const module_id = Q.get('module_id');
  if (!module_id){
    const c = by('#content');
    if (c) c.innerHTML = '<div class="notice">Missing module_id.</div>';
    return;
  }

  const modules = await loadCSV('data/Modules.csv');
  const module  = modules.find(m => m.module_id === module_id);
  const passMark = Number(module?.pass_mark_percent || 80);

  const moduleTitleEl = by('#moduleTitle');
  if (moduleTitleEl) moduleTitleEl.textContent = module?.module_title || module_id;

  const qrows = (await loadCSV('data/Module_Quiz.csv'))
    .filter(q => q.module_id === module_id)
    .sort((a, b) => Number(a.question_order || 999) - Number(b.question_order || 999));

  const wrap = by('#quizWrap');
  if (!wrap){
    console.warn('No #quizWrap found');
    return;
  }
  wrap.innerHTML = '';

  const state = getState(module_id) || {};
  state.quiz = state.quiz || {};

  qrows.forEach((item, idx) => {
    const box = document.createElement('div');
    box.className = 'mcq';

    const raw = (item.Answer || item.answers || item.Answers || '').split(/\r?\n/);
    const choices = [];
    let correctText = '';

    raw.forEach(line => {
      const t = line.trim();
      if (!t) return;
      const m = t.match(/^(CA|IA)\s*:\s*(.+)$/i);
      if (!m) return;
      const type = m[1].toUpperCase();
      const text = m[2].trim();
      const isCorrect = type === 'CA';
      if (isCorrect) correctText = text;
      choices.push({ text, correct: isCorrect });
    });

    if (!choices.length){
      const text = item.Answer || 'No answers configured';
      choices.push({ text, correct: true });
      correctText = text;
    }

    const finalChoices = shuffle(choices);

    box.innerHTML = `
      <h3>${idx + 1}. ${item.question_text}</h3>
      <div class="choices">
        ${finalChoices.map(c => `
          <label class="choice">
            <input type="radio" name="q_${item.question_id}" value="${c.text.replace(/"/g, '&quot;')}" />
            <div>${c.text}</div>
          </label>
        `).join('')}
      </div>
      <div class="explain" id="exp_${item.question_id}" style="margin-top:6px;display:none"></div>
    `;
    wrap.appendChild(box);

    const saved = state.quiz[item.question_id];
    if (saved){
      box.querySelectorAll(`input[name="q_${item.question_id}"]`).forEach(r => {
        if (r.value === saved) r.checked = true;
      });
    }

    box.addEventListener('change', e => {
      const st2 = getState(module_id) || {};
      st2.quiz = st2.quiz || {};
      st2.quiz[item.question_id] = e.target.value;
      setState(module_id, st2);
    });

    item._correctText = correctText;
  });

  const submitBtn = by('#submitQuiz');
  if (submitBtn){
    submitBtn.onclick = () => {
      const st = getState(module_id) || {};
      let correct = 0;
      const total = qrows.length;

      qrows.forEach(item => {
        const userVal   = st.quiz?.[item.question_id];
        const isCorrect = (userVal || '').trim() === (item._correctText || '').trim();
        if (isCorrect) correct++;

        const expEl = by('#exp_' + item.question_id);
        if (!expEl) return;
        expEl.style.display = 'block';

        const expl = item.explanation || (
          isCorrect
            ? 'Correct – this aligns with the Sandler method in this module.'
            : 'Review the module content and pay attention to how Sandler handles this situation.'
        );

        expEl.innerHTML = isCorrect
          ? `<span class="chip ok">Correct</span> ${expl}`
          : `<span class="chip fail">Incorrect</span> ${expl}`;
      });

      const percent = Math.round((correct / Math.max(1, total)) * 100);
      const pass    = percent >= passMark;

      st.result = { correct, total, percent, pass, when: new Date().toISOString() };
      if (pass) st.completed = true;
      setState(module_id, st);

      const resultEl = by('#quizResult');
      if (resultEl){
        resultEl.innerHTML = `
          <div class="notice">
            <div class="score">Score: ${percent}% (${correct}/${total})</div>
            <div>${ pass ? 'Great work. You passed.' : 'Keep going. Review the clips and try again.'}</div>
          </div>
        `;
      }
    };
  }

  // Certificate generation
  const certBtn = by('#certBtn');
  if (certBtn){
    certBtn.onclick = () => {
      const user = getUser();
      const st   = getState(module_id) || {};
      if (!st.result || !st.result.pass){
        flash('Pass the quiz before downloading a certificate.');
        return;
      }
      if (!user.name || !user.name.trim()){
        flash('Please enter your name at the top of the page first.');
        return;
      }

      const c   = by('#certCanvas');
      if (!c){
        console.warn('No #certCanvas found');
        return;
      }
      const ctx = c.getContext('2d');
      const name = user.name.trim();

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);

      const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary') || '#0a5cff';
      const accent  = getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00c2a8';

      ctx.strokeStyle = primary;
      ctx.lineWidth   = 10;
      ctx.strokeRect(40, 40, c.width - 80, c.height - 80);

      ctx.fillStyle = '#111827';
      ctx.font = 'bold 60px Inter, Arial, sans-serif';
      ctx.fillText('Certificate of Completion', 150, 200);

      ctx.fillStyle = '#374151';
      ctx.font = '26px Inter, Arial, sans-serif';
      ctx.fillText('This certifies that', 150, 260);

      ctx.fillStyle = '#111827';
      ctx.font = 'bold 46px Inter, Arial, sans-serif';
      ctx.fillText(name, 150, 315);

      ctx.fillStyle = '#374151';
      ctx.font = '24px Inter, Arial, sans-serif';
      const title = module?.module_title || module_id;
      ctx.fillText('has successfully completed', 150, 360);
      ctx.fillText(title, 150, 395);

      ctx.font = '22px Inter, Arial, sans-serif';
      ctx.fillText('Score: ' + (st.result.percent || 0) + '%', 150, 440);
      ctx.fillText('Date: ' + (new Date().toLocaleDateString()), 150, 470);

      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(1100, 750, 110, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 40px Inter, Arial, sans-serif';
      ctx.fillText('Sandler', 1030, 760);

      const url  = c.toDataURL('image/png');
      const link = by('#certDownload');
      if (link){
        link.href = url;
        link.download = `${module_id}-certificate-${name.replace(/\s+/g, '_')}.png`;
        link.style.display = 'inline-block';
        link.textContent = 'Download certificate';
      }
    };
  }
}

// =====================
// Boot
// =====================

window.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'index') renderIndex().catch(console.error);
  if (page === 'clip')  renderClip().catch(console.error);
  if (page === 'quiz')  renderQuiz().catch(console.error);
});
