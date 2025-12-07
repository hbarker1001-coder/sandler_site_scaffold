async function renderQuiz(){
  initNameBar();
  const module_id = Q.get('module_id');
  if (!module_id) {
    by('#content').innerHTML = '<div class="notice">Missing module_id.</div>';
    return;
  }

  const modules = await loadCSV('data/Modules.csv');
  const module = modules.find(m => m.module_id === module_id);
  const passMark = Number(module?.pass_mark_percent || 80);
  by('#moduleTitle').textContent = module?.module_title || module_id;

  // Load all questions for this module
  const qrows = (await loadCSV('data/Module_Quiz.csv'))
    .filter(q => q.module_id === module_id)
    .sort((a,b) => Number(a.question_order || 999) - Number(b.question_order || 999));

  const wrap = by('#quizWrap');
  wrap.innerHTML = '';

  const state = getState(module_id) || {};
  state.quiz = state.quiz || {};

  qrows.forEach((item, idx) => {
    const box = document.createElement('div');
    box.className = 'mcq';

    // Parse Answer column: CA/IA lines
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

    // Fallback if something is misformatted
    if (!choices.length) {
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
            <input type="radio" name="q_${item.question_id}" value="${c.text.replace(/"/g,'&quot;')}" />
            <div>${c.text}</div>
          </label>
        `).join('')}
      </div>
      <div class="explain" id="exp_${item.question_id}" style="margin-top:6px;display:none"></div>
    `;
    wrap.appendChild(box);

    // Restore saved selection if there is one
    const saved = state.quiz[item.question_id];
    if (saved) {
      box.querySelectorAll(`input[name="q_${item.question_id}"]`).forEach(r => {
        if (r.value === saved) r.checked = true;
      });
    }

    // Save new selection
    box.addEventListener('change', e => {
      const st = getState(module_id) || {};
      st.quiz = st.quiz || {};
      st.quiz[item.question_id] = e.target.value;
      setState(module_id, st);
    });

    // Store correct answer text for scoring
    item._correctText = correctText;
  });

  // Submit & score
  by('#submitQuiz').onclick = () => {
    const st = getState(module_id) || {};
    let correct = 0;
    const total = qrows.length;

    qrows.forEach(item => {
      const userVal = st.quiz?.[item.question_id];
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
    const pass = percent >= passMark;

    st.result = { correct, total, percent, pass, when: new Date().toISOString() };
    if (pass) st.completed = true;
    setState(module_id, st);

    by('#quizResult').innerHTML = `
      <div class="notice">
        <div class="score">Score: ${percent}% (${correct}/${total})</div>
        <div>${ pass ? 'Great work. You passed.' : 'Keep going. Review the clips and try again.'}</div>
      </div>
    `;
  };

  // Certificate button should already be wired in your existing code.
  // If you’re using the v2 scaffold, it uses the saved name + score.
}
