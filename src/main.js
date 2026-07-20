import * as api from './api.js';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import mascotUrl from './assets/mascot.png';
import mascot2Url from './assets/mascot2.png';

window.google = {
  script: {
    // Bridge that mimics Apps Script's google.script.run. Handlers can be
    // chained in any order (withSuccessHandler / withFailureHandler, either
    // first, both, or neither) — only a non-handler property triggers the call.
    run: (function() {
      function makeRunner(handlers) {
        return new Proxy({}, {
          get: function(target, prop) {
            if (prop === 'withSuccessHandler') {
              return function(fn) { return makeRunner(Object.assign({}, handlers, { success: fn })); };
            }
            if (prop === 'withFailureHandler') {
              return function(fn) { return makeRunner(Object.assign({}, handlers, { failure: fn })); };
            }
            return async function(...args) {
              try {
                const res = await api[prop](...args);
                if (handlers.success) handlers.success(res);
              } catch (e) {
                if (handlers.failure) handlers.failure(e);
                else console.error(e);
              }
            };
          }
        });
      }
      return makeRunner({});
    })()
  }
};


var App = {
  state: {
    user: null,
    currentRoute: 'login',
    modules: null,
    dashboardData: {
      xp: 0, level: 'Beginner', streak: 0, badges: [],
      readiness: 0, recommendation: { weakness: '-', module: 1 }
    },
    leaderboard: [],
    leaderboardFilter: '',
    leaderboardSearch: '',
    leaderboardClasses: [],
    completedModules: [],
    streakInfo: null,
    activeStory: null,
    storyKind: 'text',
    weeklyGoal: { loaded: false, goal: null },
    wgPick: { type: 'lessons', target: 3 },
    feed: { stories: [], loaded: false },
    activity: { items: [], loaded: false },
    viewingUser: null,
    // แอดมินสลับไปดู/เรียนแบบนักเรียนได้ (จำไว้ข้ามการรีเฟรช)
    studentMode: localStorage.getItem('lms_student_mode') === '1',
    myScores: { data: null, loaded: false },
    grades: { result: null, loading: false, tried: false },
    announcement: { items: [], idx: 0, loaded: false, show: false, seenAll: false, hideChecked: false },
    announceAdmin: { items: [], loaded: false, image: null, busy: false },
    cropper: null,
    cropperOpen: false,
    editAvatar: null,
    quiz: { questions: [], currentIndex: 0, score: 0, moduleId: 1, submitted: false, awarded: 0, alreadyDone: false },
    flashcards: { cards: [], currentIndex: 0, moduleId: 1, submitted: false, awarded: 0, alreadyDone: false },
    admin: { tables: [], currentTable: '', headers: [], data: [], editingRow: -1 },
    dataLoaded: false,
    bonusScore: { total: 0, history: [] },
    scannerStream: null,
    scannerAnimFrame: null,
    scannedUser: null,
    scannedUserBonus: 0,
    pendingBonusPoints: 10,
    placement: { phase: 'intro', currentIndex: 0, answers: [], result: null, answering: false },
    englishCourse: { exp: 0, progress: {}, loaded: false },
    englishQuiz: { moduleId: null, questions: [], currentIndex: 0, answers: [], submitted: false, awarded: 0 },
    selfProfile: null
  },

  get bear() { return '<img src="' + mascot2Url + '" class="mascot-img-inline" />'; },
  get bearHappy() { return '<img src="' + mascot2Url + '" class="mascot-img-inline" />'; },
  get bearStar() { return '<img src="' + mascot2Url + '" class="mascot-img-inline" />'; },

  // ===== LEVEL TIERS (XP-based, top out at 10,000) =====
  levelTiers: [
    { min: 0,    name: 'Beginner', th: 'มือใหม่',       emoji: '🐣' },
    { min: 500,  name: 'Explorer', th: 'นักสำรวจ',      emoji: '🧭' },
    { min: 1500, name: 'Learner',  th: 'นักเรียนรู้',    emoji: '📘' },
    { min: 3000, name: 'Skilled',  th: 'ชำนาญ',          emoji: '🎯' },
    { min: 5000, name: 'Advanced', th: 'ขั้นสูง',        emoji: '🏅' },
    { min: 7000, name: 'Expert',   th: 'ผู้เชี่ยวชาญ',   emoji: '💎' },
    { min: 9000, name: 'Master',   th: 'ปรมาจารย์',      emoji: '👑' }
  ],
  XP_MAX: 10000,

  // ===== ENGLISH TGAT COURSE =====
  ENGLISH_MODULES: [
    { id: 'grammar', emoji: '📝', title: 'Grammar Mastery', titleTh: 'ไวยากรณ์',
      color: '#2E7D32', light: '#E8F5E9', shadow: 'rgba(46,125,50,0.22)',
      desc: 'Tenses · Passive · Conditionals · Modal Verbs', exp: 100 },
    { id: 'vocab', emoji: '🔤', title: 'Vocabulary Mastery', titleTh: 'คำศัพท์',
      color: '#1565C0', light: '#E3F2FD', shadow: 'rgba(21,101,192,0.22)',
      desc: 'Academic Words · Collocations · Word Forms', exp: 100 },
    { id: 'reading', emoji: '📖', title: 'Reading & Error ID', titleTh: 'อ่านและจับผิด',
      color: '#BF360C', light: '#FBE9E7', shadow: 'rgba(191,54,12,0.22)',
      desc: 'Main Idea · Inference · Error Identification', exp: 100 }
  ],

  ENGLISH_QUESTIONS: {
    grammar: [
      { q: 'He ___ to school yesterday.', opts: ['go', 'goes', 'went', 'gone'], ans: 2, explain: 'Past Simple + yesterday → went' },
      { q: 'The students ___ very tired after the exam.', opts: ['is', 'was', 'are', 'were'], ans: 3, explain: 'students (plural) + were' },
      { q: 'If I ___ a car, I would drive to work.', opts: ['have', 'had', 'has', 'having'], ans: 1, explain: 'Conditional Type 2: If + Past Simple, would + V' },
      { q: 'The letter ___ by my mother this morning.', opts: ['write', 'wrote', 'is written', 'was written'], ans: 3, explain: 'Passive Voice (Past): was + past participle' },
      { q: 'The girl ___ won the prize is my classmate.', opts: ['which', 'whom', 'who', 'whose'], ans: 2, explain: 'who — ใช้กับคน ทำหน้าที่ประธาน' },
      { q: 'She is ___ honest and hardworking student.', opts: ['a', 'an', 'the', '–'], ans: 1, explain: 'an + เสียงสระ (honest ออกเสียง /ɒn/)' },
      { q: "You ___ wear a seatbelt. It's the law!", opts: ['should', 'may', 'must', 'might'], ans: 2, explain: 'must = บังคับ/กฎหมาย' },
      { q: 'I enjoy ___ music in my free time.', opts: ['listen', 'listened', 'to listen', 'listening'], ans: 3, explain: 'enjoy + Gerund (V-ing)' },
      { q: 'If it rains tomorrow, we ___ cancel the picnic.', opts: ['will', 'would', 'can', 'should'], ans: 0, explain: 'Conditional Type 1: If + Present Simple, will + V' },
      { q: 'He said that he ___ very tired.', opts: ['is', 'was', 'were', 'be'], ans: 1, explain: 'Reported Speech: is → was (backshift tense)' }
    ],
    vocab: [
      { q: 'The researcher carefully ___ the experimental data.', opts: ['analyzed', 'concluded', 'defined', 'suggested'], ans: 0, explain: 'analyze = วิเคราะห์' },
      { q: 'Which word is a SYNONYM of "significant"?', opts: ['minor', 'important', 'ordinary', 'difficult'], ans: 1, explain: 'significant = สำคัญ ≈ important' },
      { q: '"The scientist made an important ___." — Choose the correct word form.', opts: ['discover', 'discovering', 'discovery', 'discovered'], ans: 2, explain: 'discovery = คำนาม (การค้นพบ)' },
      { q: 'Which COLLOCATION is correct?', opts: ['do a decision', 'make a decision', 'take a decision', 'have a decision'], ans: 1, explain: 'make a decision = ตัดสินใจ' },
      { q: 'The price was so ___ that no one could afford it.', opts: ['cheap', 'affordable', 'prohibitive', 'reasonable'], ans: 2, explain: 'prohibitive = แพงมากจนซื้อไม่ได้' },
      { q: "I don't like coffee; ___, I prefer tea.", opts: ['therefore', 'however', 'moreover', 'furthermore'], ans: 1, explain: 'however = อย่างไรก็ตาม (แสดงความตรงข้าม)' },
      { q: 'The word "evaluate" most closely means ___', opts: ['to create', 'to assess', 'to ignore', 'to describe'], ans: 1, explain: 'evaluate = ประเมิน ≈ assess' },
      { q: 'Which word uses a prefix meaning "not"?', opts: ['preview', 'incorrect', 'prepare', 'promote'], ans: 1, explain: 'in- = ไม่ → incorrect = ไม่ถูกต้อง' },
      { q: 'The government will ___ a new education policy next year.', opts: ['implement', 'examine', 'consider', 'calculate'], ans: 0, explain: 'implement = นำไปปฏิบัติ' },
      { q: 'Which word is closest in meaning to "conclude"?', opts: ['begin', 'infer', 'question', 'support'], ans: 1, explain: 'conclude/infer = สรุป/อนุมาน' }
    ],
    reading: [
      { q: 'Error ID: "She go to school every day."', opts: ['She', 'go', 'school', 'every day'], ans: 1, explain: 'go → goes (3rd person singular present)' },
      { q: 'Error ID: "The students was studying hard."', opts: ['The students', 'was', 'studying', 'hard'], ans: 1, explain: 'was → were (students = plural noun)' },
      { q: 'Error ID: "He speaks English very good."', opts: ['He speaks', 'English', 'very good', 'ไม่มีผิด'], ans: 2, explain: 'good (adj) → well (adv) ขยายกริยา speaks' },
      { q: 'Error ID: "She is interested on science."', opts: ['She is', 'interested', 'on', 'science'], ans: 2, explain: 'on → in: "interested in" คือ collocation ที่ถูกต้อง' },
      { q: 'Error ID: "He is a honest person."', opts: ['He is', 'a', 'honest', 'person'], ans: 1, explain: 'a → an ก่อนเสียงสระ (honest = /ɒ/)' },
      { q: 'Read: "Scientists found that even short walks of 20 min may boost brain function." — Main idea?', opts: ['Walking is difficult', 'Exercise benefits the brain', 'Scientists like walking', 'Memory improves with age'], ans: 1, explain: 'ใจความหลัก = การออกกำลังกาย (แม้น้อย) ช่วยสมอง' },
      { q: 'Read: "Despite heavy rain, the students arrived on time." — We can infer students were ___', opts: ['confused', 'late', 'determined', 'lucky'], ans: 2, explain: 'despite (ทั้งๆ ที่) + on time → แสดงว่า determined (มุ่งมั่น)' },
      { q: 'Error ID: "I have lived here since five years."', opts: ['I have lived', 'here', 'since', 'five years'], ans: 2, explain: 'since → for (ใช้ for กับระยะเวลา, since กับจุดเริ่มต้น)' },
      { q: 'Read: "The policy was controversial, with many citizens opposing it." — "controversial" means ___', opts: ['popular', 'causing disagreement', 'successful', 'unimportant'], ans: 1, explain: 'controversial = ขัดแย้ง ≈ causing disagreement' },
      { q: 'Error ID: "Each of the students have their own textbook."', opts: ['Each of', 'the students', 'have', 'their own'], ans: 2, explain: 'have → has (Each of + N + singular verb)' }
    ]
  },

  // ===== BADGE DEFINITIONS =====
  BADGE_DEFS: [
    // XP / Level
    { id:'xp_500',   emoji:'🌱', label:'เริ่มต้นแล้ว',   desc:'สะสม 500 XP',          group:'xp',      check:function(d){return d.xp>=500;} },
    { id:'xp_1500',  emoji:'📘', label:'นักเรียนรู้',     desc:'สะสม 1,500 XP',        group:'xp',      check:function(d){return d.xp>=1500;} },
    { id:'xp_3000',  emoji:'🎯', label:'ชำนาญ',           desc:'สะสม 3,000 XP',        group:'xp',      check:function(d){return d.xp>=3000;} },
    { id:'xp_7000',  emoji:'💎', label:'ผู้เชี่ยวชาญ',   desc:'สะสม 7,000 XP',        group:'xp',      check:function(d){return d.xp>=7000;} },
    // Streak
    { id:'streak_3',  emoji:'🔥', label:'ไฟไม่ดับ',      desc:'เรียน 3 วันต่อเนื่อง',  group:'streak',  check:function(d){return d.streak>=3;} },
    { id:'streak_7',  emoji:'⚡', label:'สายฟ้า',         desc:'เรียน 7 วันต่อเนื่อง',  group:'streak',  check:function(d){return d.streak>=7;} },
    { id:'streak_14', emoji:'🌟', label:'ดาวเด่น',        desc:'เรียน 14 วันต่อเนื่อง', group:'streak',  check:function(d){return d.streak>=14;} },
    // Modules
    { id:'mod_1',   emoji:'📚', label:'เริ่มเรียน',       desc:'เรียนจบ 1 Unit',        group:'lessons', check:function(d){return d.completedModules>=1;} },
    { id:'mod_all', emoji:'🏆', label:'เรียนจบหมด',       desc:'เรียนจบทุก Unit',       group:'lessons', check:function(d){return d.completedModules>=4;} },
    // English TGAT
    { id:'eng_placement', emoji:'🎓', label:'Placement Pro',   desc:'วัดระดับ CEFR แล้ว',   group:'english', check:function(d){return d.placementDone;} },
    { id:'eng_grammar',   emoji:'✏️',  label:'Grammar Star',    desc:'Grammar ≥ 80%',        group:'english', check:function(d){return (d.grammarPct||0)>=80;} },
    { id:'eng_vocab',     emoji:'📖', label:'Vocab Hunter',    desc:'ทำ Vocabulary ครบ',    group:'english', check:function(d){return !!d.vocabDone;} },
    { id:'eng_reading',   emoji:'🔍', label:'Error Detective', desc:'Error ID ≥ 80%',       group:'english', check:function(d){return (d.readingPct||0)>=80;} },
    { id:'eng_master',    emoji:'🏅', label:'English Master',  desc:'EXP ≥ 210 ทุกโมดูล',  group:'english', check:function(d){return (d.totalEngExp||0)>=210;} },
    // Rank
    { id:'rank_1',  emoji:'🥇', label:'อันดับ 1',  desc:'Top 1 ของห้อง',   group:'rank', check:function(d){return d.rank===1;} },
    { id:'rank_3',  emoji:'🥈', label:'Top 3',     desc:'อันดับ 2–3',       group:'rank', check:function(d){return d.rank<=3 && d.rank>1;} },
    { id:'rank_10', emoji:'🥉', label:'Top 10',    desc:'อันดับ 4–10',      group:'rank', check:function(d){return d.rank<=10 && d.rank>3;} },
  ],

  profileBadgesHtml: function(data) {
    var self = this;
    var groups = [
      { key:'rank',    label:'🏆 อันดับ' },
      { key:'english', label:'📗 English TGAT' },
      { key:'xp',      label:'⚡ XP & ระดับ' },
      { key:'streak',  label:'🔥 ความสม่ำเสมอ' },
      { key:'lessons', label:'📚 บทเรียน' },
    ];

    // Rank pill at top
    var rankPill = '';
    if (data.rank) {
      var rColor = data.rank === 1 ? '#B7950B' : data.rank <= 3 ? '#1565C0' : data.rank <= 10 ? '#6A1B9A' : '#555';
      var rBg    = data.rank === 1 ? '#FFF9C4' : data.rank <= 3 ? '#E3F2FD' : data.rank <= 10 ? '#F3E5F5' : '#F5F5F5';
      var rEmoji = data.rank === 1 ? '🥇' : data.rank <= 3 ? '🥈' : data.rank <= 10 ? '🥉' : '🎖️';
      rankPill = '<div style="display:inline-flex; align-items:center; gap:8px; background:' + rBg + '; border:1.5px solid ' + rColor + '44; border-radius:20px; padding:8px 16px; margin-bottom:14px;">' +
        '<span style="font-size:22px;">' + rEmoji + '</span>' +
        '<div>' +
          '<div style="font-weight:900; font-size:16px; color:' + rColor + ';">อันดับที่ ' + data.rank + '</div>' +
          '<div style="font-size:11px; color:#888; margin-top:1px;">Leaderboard XP</div>' +
        '</div>' +
      '</div>';
    }

    var html = '<div class="card" style="padding:16px; margin-top:12px;">' +
      '<div style="font-weight:800; font-size:15px; color:var(--clay-text); margin-bottom:12px;">🏅 Badge ที่ได้รับ</div>' +
      (rankPill ? '<div>' + rankPill + '</div>' : '');

    groups.forEach(function(g) {
      var defs = self.BADGE_DEFS.filter(function(b){ return b.group === g.key; });
      if (!defs.length) return;
      // skip rank group — already shown as pill
      if (g.key === 'rank') return;
      html += '<div style="font-size:11px; font-weight:800; color:var(--clay-text-light); letter-spacing:0.8px; text-transform:uppercase; margin:14px 0 8px;">' + g.label + '</div>' +
        '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">';
      defs.forEach(function(b) {
        var earned = b.check(data);
        html += '<div style="display:flex; align-items:center; gap:10px; background:' + (earned ? '#F0FFF4' : 'rgba(0,0,0,0.03)') + '; border:1.5px solid ' + (earned ? '#4CAF5066' : 'rgba(0,0,0,0.06)') + '; border-radius:14px; padding:10px 12px; opacity:' + (earned ? '1' : '0.38') + ';">' +
          '<div style="font-size:22px; flex-shrink:0;">' + b.emoji + '</div>' +
          '<div style="min-width:0;">' +
            '<div style="font-weight:800; font-size:12px; color:var(--clay-text); line-height:1.5;">' + b.label + '</div>' +
            '<div style="font-size:10px; color:var(--clay-text-light); margin-top:2px; line-height:1.5;">' + b.desc + '</div>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    });

    html += '</div>';
    return html;
  },

  // ===== PLACEMENT TEST QUESTIONS (20 ข้อ A1→B2 สำหรับ TGAT/A-Level) =====
  placementQuestions: [
    // A1 — พื้นฐานสุด
    { q: 'She ___ a student at our school.', opts: ['am','is','are','be'], ans: 'is', level: 'A1', type: 'Grammar', th: 'Verb to be' },
    { q: 'I ___ TV every evening with my family.', opts: ['watch','watches','watching','watched'], ans: 'watch', level: 'A1', type: 'Grammar', th: 'Present Simple' },
    { q: 'What does "happy" mean in Thai?', opts: ['เศร้า','โกรธ','มีความสุข','กลัว'], ans: 'มีความสุข', level: 'A1', type: 'Vocab', th: 'Basic Vocabulary' },
    { q: 'Choose the CORRECT sentence:', opts: ["She don't like cats.","She doesn't like cats.","She not like cats.","She no like cats."], ans: "She doesn't like cats.", level: 'A1', type: 'Grammar', th: 'Negative Form' },
    { q: '___ you speak English well?', opts: ['Is','Are','Do','Does'], ans: 'Do', level: 'A1', type: 'Grammar', th: 'Question Form' },
    // A2 — พื้นฐาน
    { q: 'I ___ to Bangkok last summer.', opts: ['go','goes','went','going'], ans: 'went', level: 'A2', type: 'Grammar', th: 'Past Simple' },
    { q: 'I have ___ apple in my lunch box.', opts: ['a','an','the','—'], ans: 'an', level: 'A2', type: 'Grammar', th: 'Articles' },
    { q: 'The opposite of "expensive" is ___', opts: ['cheap','rich','poor','costly'], ans: 'cheap', level: 'A2', type: 'Vocab', th: 'Antonyms' },
    { q: 'My sister is ___ than me.', opts: ['tall','more tall','taller','tallest'], ans: 'taller', level: 'A2', type: 'Grammar', th: 'Comparative' },
    { q: 'We have lived here ___ 2010.', opts: ['for','since','ago','from'], ans: 'since', level: 'A2', type: 'Grammar', th: 'Present Perfect' },
    // B1 — กลาง
    { q: 'If I ___ you, I would study harder every day.', opts: ['am','was','were','be'], ans: 'were', level: 'B1', type: 'Grammar', th: 'Conditional Type 2' },
    { q: 'By the time she arrived, the film ___ already.', opts: ['starts','has started','had started','will start'], ans: 'had started', level: 'B1', type: 'Grammar', th: 'Past Perfect' },
    { q: 'What does "reluctant" mean?', opts: ['ไม่เต็มใจ','กระตือรือร้น','ซื่อสัตย์','สงบ'], ans: 'ไม่เต็มใจ', level: 'B1', type: 'Vocab', th: 'Intermediate Vocab' },
    { q: 'The homework must ___ by tomorrow morning.', opts: ['submit','submits','submitted','be submitted'], ans: 'be submitted', level: 'B1', type: 'Grammar', th: 'Passive Voice' },
    { q: 'I wish I ___ speak French as fluently as she does.', opts: ['can','could','will','would'], ans: 'could', level: 'B1', type: 'Grammar', th: 'Wish Clauses' },
    // B2 — ขั้นสูง / TGAT
    { q: 'Despite ___ tired, she continued working until midnight.', opts: ['be','to be','being','been'], ans: 'being', level: 'B2', type: 'Grammar', th: 'Gerund after Despite' },
    { q: 'No sooner ___ he arrived than it started raining heavily.', opts: ['has','had','did','was'], ans: 'had', level: 'B2', type: 'Grammar', th: 'Inversion' },
    { q: 'What does "ambiguous" mean?', opts: ['ไม่ชัดเจน','ทะเยอทะยาน','มีชื่อเสียง','ขัดแย้ง'], ans: 'ไม่ชัดเจน', level: 'B2', type: 'Vocab', th: 'Advanced Vocab' },
    { q: 'It is high time we ___ action on this serious issue.', opts: ['take','took','taking','have taken'], ans: 'took', level: 'B2', type: 'Grammar', th: 'Subjunctive' },
    { q: 'The results, ___ were published last week, surprised everyone.', opts: ['which','who','whom','what'], ans: 'which', level: 'B2', type: 'Grammar', th: 'Non-defining Relative Clause' },
  ],

  levelInfo: function(xp) {
    xp = xp || 0;
    var tiers = this.levelTiers, idx = 0;
    for (var i = 0; i < tiers.length; i++) { if (xp >= tiers[i].min) idx = i; }
    var cur = tiers[idx];
    var next = tiers[idx + 1] || null;
    var floor = cur.min;
    var ceil = next ? next.min : this.XP_MAX;
    var pct = ceil > floor ? Math.min(100, Math.round(((xp - floor) / (ceil - floor)) * 100)) : 100;
    return {
      index: idx, name: cur.name, th: cur.th, emoji: cur.emoji,
      floor: floor, ceil: ceil, pct: pct,
      isMax: !next,
      next: next, toNext: next ? Math.max(0, ceil - xp) : 0
    };
  },

  init: function() {
    var storedUser = localStorage.getItem('lms_user');
    if (storedUser) {
      try {
        this.state.user = JSON.parse(storedUser);
      } catch(e) {}
    }
    if (this.state.user) {
      if (this.isAdmin() && !this.state.studentMode) this.navigate('admin');
      else this.afterAuth();
    } else {
      this.render();
    }
  },

  isAdmin: function() {
    return !!(this.state.user && this.state.user.Role === 'Admin');
  },

  // สลับระหว่างโหมดครู (แดชบอร์ดแอดมิน) กับโหมดนักเรียน (เรียนได้จริง)
  toggleStudentMode: function() {
    if (!this.isAdmin()) return;
    var on = !this.state.studentMode;
    this.state.studentMode = on;
    localStorage.setItem('lms_student_mode', on ? '1' : '0');
    if (on) {
      this.state.dataLoaded = false;
      this.toast('👀 โหมดนักเรียน — เรียนและเก็บ XP ได้เหมือนนักเรียนจริง');
      this.afterAuth();
    } else {
      this.toast('🛠️ กลับสู่โหมดครู');
      this.navigate('admin');
    }
  },

  // แถบสลับโหมด ลอยอยู่กลางบน แคบและโปร่ง จึงไม่บังเนื้อหาที่กำลังเรียน
  modeSwitch: function() {
    if (!this.isAdmin()) return '';
    var on = this.state.studentMode;
    return '<div onclick="App.toggleStudentMode()" title="สลับโหมดครู / นักเรียน" ' +
      'style="position:absolute; top:8px; left:50%; transform:translateX(-50%); z-index:8000; ' +
      'display:flex; align-items:center; gap:7px; cursor:pointer; user-select:none; ' +
      'padding:6px 12px; border-radius:999px; font-size:11px; font-weight:800; ' +
      'background:' + (on ? 'rgba(91,164,245,0.92)' : 'rgba(61,43,92,0.82)') + '; color:white; ' +
      'box-shadow:0 3px 10px rgba(40,20,70,0.28); backdrop-filter:blur(6px); white-space:nowrap;">' +
        '<span>' + (on ? '👀 โหมดนักเรียน' : '🛠️ โหมดครู') + '</span>' +
        '<span style="width:26px; height:15px; border-radius:999px; background:rgba(255,255,255,0.35); position:relative; flex-shrink:0;">' +
          '<span style="position:absolute; top:2px; ' + (on ? 'right:2px' : 'left:2px') + '; width:11px; height:11px; border-radius:50%; background:white; transition:all 0.2s;"></span>' +
        '</span>' +
      '</div>';
  },

  afterAuth: function() {
    // Record login → real streak + daily bonus, then route to placement test (first-time) or dashboard
    var self = this;
    this.state.dataLoaded = false;
    google.script.run.withSuccessHandler(function(res) {
      if (res && res.success) {
        self.state.streakInfo = res;
        if (res.bonus > 0) {
          setTimeout(function() {
            self.celebrate(40);
            self.toast('🔥 Streak ' + res.streak + ' วัน! รับโบนัส +' + res.bonus + ' XP');
          }, 600);
        }
      }
      var goTo = (self.state.user && self.state.user.PlacementDone) ? 'dashboard' : 'placementTest';
      self.navigate(goTo);
    }).withFailureHandler(function() {
      var goTo = (self.state.user && self.state.user.PlacementDone) ? 'dashboard' : 'placementTest';
      self.navigate(goTo);
    }).recordLogin(this.state.user.UserID);
    this.loadAnnouncement();
  },

  /* ===== ประกาศจากคุณครู ===== */

  // วันที่วันนี้ตามเวลาไทย (YYYY-MM-DD) — ใช้ตัดสินว่า "วันนี้" หมดหรือยัง
  todayTH: function() {
    return new Date(Date.now() + 7 * 3600 * 1000).toISOString().split('T')[0];
  },

  // ลายเซ็นของชุดประกาศ ใช้เทียบว่า "ชุดเดิม" หรือมีอันใหม่เพิ่มเข้ามา
  // ถ้าครูโพสต์เพิ่ม ลายเซ็นเปลี่ยน การ์ดจะกลับมาเด้งแม้เคยติ๊กปิดวันนี้แล้ว
  announceSignature: function(items) {
    return (items || []).map(function(a) { return a.id; }).join(',');
  },

  // โหลดประกาศที่เปิดอยู่ทั้งหมด — เด้งทุกครั้งที่เข้าระบบ
  // ยกเว้นผู้ใช้ติ๊ก "ไม่ต้องแสดงอีกวันนี้" กับชุดเดียวกันในวันเดียวกัน
  loadAnnouncement: function() {
    var self = this;
    localStorage.removeItem('lms_announce_seen'); // คีย์เดิมสมัยที่ปิดแล้วปิดถาวร
    google.script.run.withSuccessHandler(function(res) {
      var items = (res && res.success) ? (res.items || []) : [];
      var show = false;
      if (items.length) {
        var hide = null;
        try { hide = JSON.parse(localStorage.getItem('lms_announce_hide') || 'null'); } catch (e) { hide = null; }
        show = !(hide && hide.sig === self.announceSignature(items) && hide.date === self.todayTH());
      }
      self.state.announcement = { items: items, idx: 0, loaded: true, show: show, seenAll: items.length <= 1, hideChecked: false };
      if (show) self.render(true);
    }).withFailureHandler(function() {
      self.state.announcement = { items: [], idx: 0, loaded: true, show: false, seenAll: false, hideChecked: false };
    }).getActiveAnnouncements();
  },

  closeAnnouncement: function() {
    var st = this.state.announcement;
    var cb = document.getElementById('announce-hide-today');
    if (st.items.length && cb && cb.checked) {
      localStorage.setItem('lms_announce_hide', JSON.stringify({
        sig: this.announceSignature(st.items), date: this.todayTH()
      }));
    }
    st.show = false;
    this.render(true);
  },

  /* ---- สไลด์: นักเรียนกด/ปัดเองเพื่อให้ได้อ่านจริง ---- */

  isLastSlide: function() {
    var st = this.state.announcement;
    return st.idx >= st.items.length - 1;
  },

  nextAnnounce: function() {
    var st = this.state.announcement;
    if (st.idx < st.items.length - 1) this.goAnnounceSlide(st.idx + 1);
  },

  prevAnnounce: function() {
    var st = this.state.announcement;
    if (st.idx > 0) this.goAnnounceSlide(st.idx - 1);
  },

  // เปลี่ยนสไลด์โดยแก้ DOM ตรง ๆ ไม่ render ใหม่ทั้งหน้า
  // (ถ้า render ใหม่ ช่องติ๊กที่ผู้ใช้กดไว้จะหาย)
  goAnnounceSlide: function(i) {
    var st = this.state.announcement;
    if (!st.items.length) return;
    st.idx = Math.max(0, Math.min(i, st.items.length - 1));
    // ดูถึงใบสุดท้ายแล้ว จึงปลดล็อกช่องติ๊ก "ไม่แสดงอีกวันนี้"
    if (this.isLastSlide()) st.seenAll = true;

    var a = st.items[st.idx];
    var body = document.getElementById('announce-body');
    if (body) {
      body.innerHTML = a.image
        ? '<img id="announce-img" src="' + a.image + '" alt="' + this.esc(a.title) + '" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;">'
        : this.announceTextSlide(a);
    }
    var dots = document.getElementById('announce-dots');
    if (dots) dots.innerHTML = this.announceDotsHtml();
    var foot = document.getElementById('announce-foot');
    if (foot) foot.innerHTML = this.announceFooterHtml();
    var hint = document.getElementById('announce-hint');
    if (hint) hint.innerHTML = this.announceHintHtml();
    var close = document.getElementById('announce-close');
    if (close) close.innerHTML = this.announceCloseHtml();
  },

  // จำสถานะช่องติ๊กไว้ เผื่อผู้ใช้ย้อนกลับไปดูใบก่อนหน้าแล้วกลับมา
  onHideTodayToggle: function(el) {
    this.state.announcement.hideChecked = !!el.checked;
  },

  announceDotsHtml: function() {
    var st = this.state.announcement;
    if (st.items.length < 2) return '';
    var cur = st.idx;
    return st.items.map(function(a, i) {
      var on = i === cur;
      return '<span onclick="App.goAnnounceSlide(' + i + ')" style="width:' + (on ? '20px' : '7px') + '; height:7px; border-radius:99px; cursor:pointer; transition:all 0.25s; background:' + (on ? 'white' : 'rgba(255,255,255,0.45)') + ';"></span>';
    }).join('');
  },

  announceTextSlide: function(a) {
    return '<div style="position:absolute; inset:0; background:linear-gradient(145deg,#FF8C42,#C084FC); display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:28px 22px;">' +
      '<div style="font-size:52px; margin-bottom:12px;">📣</div>' +
      '<div style="font-size:20px; font-weight:800; color:white; line-height:1.5;">' + this.esc(a.title) + '</div>' +
      (a.content ? '<div style="font-size:14px; color:rgba(255,255,255,0.95); line-height:1.7; margin-top:10px; white-space:pre-wrap;">' + this.esc(a.content) + '</div>' : '') +
    '</div>';
  },

  // ส่วนล่างการ์ด: ปุ่มถัดไป หรือ (เมื่อถึงใบสุดท้าย) ช่องติ๊กไม่แสดงอีก
  announceFooterHtml: function() {
    var st = this.state.announcement;
    if (!this.isLastSlide()) {
      return '<button class="btn btn-primary" style="margin:0; font-size:14px;" onclick="App.nextAnnounce()">อ่านแล้ว ดูถัดไป →</button>';
    }
    return '<label style="display:flex; align-items:center; gap:9px; cursor:pointer; background:rgba(255,255,255,0.95); border-radius:14px; padding:10px 15px; box-shadow:0 4px 0 rgba(0,0,0,0.15);">' +
        '<input type="checkbox" id="announce-hide-today" onchange="App.onHideTodayToggle(this)"' + (st.hideChecked ? ' checked' : '') + ' style="width:19px; height:19px; margin:0; accent-color:var(--bear-orange); cursor:pointer; flex-shrink:0;">' +
        '<span style="font-size:13px; font-weight:700; color:var(--clay-text); line-height:1.5;">ไม่ต้องแสดงอีกวันนี้</span>' +
      '</label>' +
      '<button class="btn btn-primary" style="margin:0; font-size:14px;" onclick="App.closeAnnouncement()">เข้าใจแล้ว เริ่มเรียน 🐾</button>';
  },

  // ปุ่มปิดโผล่เฉพาะใบสุดท้าย เพื่อให้นักเรียนได้อ่านครบก่อน
  announceCloseHtml: function() {
    if (!this.isLastSlide()) return '';
    return '<button onclick="App.closeAnnouncement()" aria-label="ปิดประกาศ" style="position:absolute; top:12px; right:12px; width:40px; height:40px; min-height:0; margin:0; padding:0; border-radius:50%; border:none; background:rgba(255,255,255,0.96); color:#3D2B5C; font-size:19px; font-weight:800; line-height:1; cursor:pointer; box-shadow:0 4px 0 rgba(0,0,0,0.18), 0 6px 14px rgba(0,0,0,0.28); display:flex; align-items:center; justify-content:center; z-index:3; animation:popIn 0.3s cubic-bezier(0.34,1.56,0.64,1);">✕</button>';
  },

  announceHintHtml: function() {
    var st = this.state.announcement;
    if (st.items.length < 2) return '';
    if (!this.isLastSlide()) {
      return 'แตะที่ภาพ หรือปัดไปทางซ้าย เพื่อดูประกาศถัดไป (' + (st.idx + 1) + '/' + st.items.length + ')';
    }
    return 'อ่านครบทุกประกาศแล้ว ✓';
  },

  // การ์ดประกาศ อัตราส่วน 3:4 — โชว์รูปล้วน ไม่มีข้อความทับ
  // นักเรียนกด/ปัดเพื่อเลื่อนเอง ช่องติ๊ก "ไม่แสดงอีก" โผล่ตอนใบสุดท้าย
  viewAnnouncementCard: function() {
    var st = this.state.announcement;
    var a = st.items[st.idx];
    if (!a) return '';
    var many = st.items.length > 1;
    var body = a.image
      ? '<img id="announce-img" src="' + a.image + '" alt="' + this.esc(a.title) + '" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;">'
      // ไม่มีรูป: ต้องมีอะไรให้อ่าน จึงแสดงข้อความแทน ไม่งั้นการ์ดจะว่างเปล่า
      : this.announceTextSlide(a);

    // ยังอ่านไม่ครบ ห้ามปิดด้วยการแตะพื้นหลัง เพื่อให้ได้อ่านจนจบ
    var backdropClose = st.seenAll ? ' onclick="App.closeAnnouncement()"' : '';

    return '<div' + backdropClose + ' style="position:absolute; inset:0; z-index:9000; background:rgba(40,20,70,0.55); backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; padding:24px;">' +
      '<div onclick="event.stopPropagation()" style="width:100%; max-width:320px; display:flex; flex-direction:column; align-items:center; gap:11px;">' +
        '<div id="announce-card" style="position:relative; width:100%; aspect-ratio:3/4; border-radius:26px; overflow:hidden; cursor:' + (many ? 'pointer' : 'default') + '; box-shadow:0 10px 0 rgba(90,40,150,0.35), 0 24px 48px rgba(60,20,110,0.45); animation:popIn 0.35s cubic-bezier(0.34,1.56,0.64,1); -webkit-user-select:none; user-select:none; -webkit-touch-callout:none;">' +
          '<div id="announce-body" style="position:absolute; inset:0;">' + body + '</div>' +
          '<div id="announce-close">' + this.announceCloseHtml() + '</div>' +
          // จุดบอกลำดับ อยู่ในกรอบล่างสุด ไม่บังเนื้อหาหลัก
          (many ? '<div id="announce-dots" style="position:absolute; left:0; right:0; bottom:12px; z-index:3; display:flex; gap:6px; align-items:center; justify-content:center;">' + this.announceDotsHtml() + '</div>' : '') +
        '</div>' +
        // อยู่นอกกรอบรูป จึงไม่บังประกาศ
        (many ? '<div id="announce-hint" style="font-size:11px; color:rgba(255,255,255,0.92); font-weight:700; text-align:center; line-height:1.6; text-shadow:0 1px 3px rgba(0,0,0,0.45);">' + this.announceHintHtml() + '</div>' : '') +
        '<div id="announce-foot" style="width:100%; display:flex; flex-direction:column; align-items:center; gap:10px;">' + this.announceFooterHtml() + '</div>' +
      '</div>' +
    '</div>';
  },

  // ผูกการแตะและการปัด (เรียกจาก postRender หลัง HTML ลง DOM แล้ว)
  initAnnounceCard: function() {
    var self = this;
    var card = document.getElementById('announce-card');
    if (!card || this.state.announcement.items.length < 2) return;

    // แตะที่ภาพ = ไปใบถัดไป (ยกเว้นแตะปุ่มปิดหรือจุดบอกลำดับ)
    card.addEventListener('click', function(e) {
      if (e.target.closest('button') || e.target.closest('#announce-dots')) return;
      self.nextAnnounce();
    });

    // ปัดขวา→ซ้าย = ถัดไป, ซ้าย→ขวา = ย้อนกลับ
    var x0 = null, y0 = null;
    card.addEventListener('touchstart', function(e) {
      var t = e.changedTouches[0]; x0 = t.clientX; y0 = t.clientY;
    }, { passive: true });
    card.addEventListener('touchend', function(e) {
      if (x0 === null) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - x0, dy = t.clientY - y0;
      x0 = null;
      // ต้องปัดแนวนอนชัดเจน ไม่ใช่เลื่อนหน้าจอขึ้นลง
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) self.nextAnnounce(); else self.prevAnnounce();
    }, { passive: true });
  },

  toast: function(msg) {
    var host = document.querySelector('.app-container') || document.body;
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:absolute; left:50%; top:18px; transform:translateX(-50%); background:linear-gradient(135deg,#FF8C42,#C084FC); color:white; font-weight:800; font-size:13px; padding:12px 18px; border-radius:16px; box-shadow:0 6px 16px rgba(160,80,200,0.35); z-index:10000; max-width:90%; text-align:center; animation:popIn 0.4s ease;';
    host.appendChild(t);
    setTimeout(function() { t.style.transition = 'opacity 0.4s'; t.style.opacity = '0'; setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 400); }, 2800);
  },

  navigate: function(route, params) {
    var self = this;
    // Stop any running QR scanner camera when navigating away
    this.stopQRScanner();
    if (!this.state.user && route !== 'login' && route !== 'register') {
      route = 'login';
    }
    this.state.currentRoute = route;

    if (route === 'dashboard') {
      this.render();
      google.script.run.withSuccessHandler(function(res) {
        if (res.success) self.state.bonusScore = { total: res.total, history: res.history };
        if (self.state.currentRoute === 'dashboard') self.render(true);
      }).withFailureHandler(function() {}).getBonusScore(this.state.user.UserID);
      google.script.run.withSuccessHandler(function(res) {
        if (res && res.success) {
          self.state.weeklyGoal = { loaded: true, goal: res.goal };
          if (res.goal && res.goal.justCompleted) { self.celebrate(50); self.toast('🎉 ทำเป้าหมายสัปดาห์สำเร็จ! รับ Badge'); }
        }
        if (self.state.currentRoute === 'dashboard') self.render(true);
      }).withFailureHandler(function() {}).getWeeklyGoal(this.state.user.UserID);
      if (!this.state.dataLoaded) {
        google.script.run.withSuccessHandler(function(res) {
          if (res.success) {
            if (res.dashboard) self.state.dashboardData = res.dashboard;
            if (res.modules) self.state.modules = res.modules;
            self.state.dataLoaded = true;
          }
          if (self.state.currentRoute === 'dashboard') self.render(true);
        }).withFailureHandler(function() { if (self.state.currentRoute === 'dashboard') self.render(true); }).getAppData(self.state.user.UserID);
      } else {
        google.script.run.withSuccessHandler(function(res) {
          if (res.success) self.state.dashboardData = res.data;
          if (self.state.currentRoute === 'dashboard') self.render(true);
        }).withFailureHandler(function() {}).getDashboardData(self.state.user.UserID);
      }
    } else if (route === 'lessons' || route === 'midtermLessons') {
      this.render();
      google.script.run.withSuccessHandler(function(res) {
        if (res.success) self.state.completedModules = res.data;
        if (self.state.currentRoute === route) self.render(true);
      }).withFailureHandler(function() {}).getCompletedModules(this.state.user.UserID);
      if (!this.state.modules) {
        google.script.run.withSuccessHandler(function(res) {
          self.state.modules = res;
          if (self.state.currentRoute === route) self.render(true);
        }).withFailureHandler(function() { if (self.state.currentRoute === route) self.render(true); }).getModules();
      }
    } else if (route === 'leaderboard') {
      this.render();
      google.script.run.withSuccessHandler(function(res) {
        if (res.success) { self.state.leaderboard = res.data; self.state.leaderboardClasses = res.classes || []; }
        if (self.state.currentRoute === 'leaderboard') self.render(true);
      }).withFailureHandler(function() {}).getLeaderboard(self.state.leaderboardFilter || null);
    } else if (route === 'dailyQuest') {
      this.state.quiz.moduleId = 'Daily';
      this.state.quiz.currentIndex = 0; this.state.quiz.score = 0;
      this.state.quiz.submitted = false; this.state.quiz.awarded = 0; this.state.quiz.alreadyDone = false;
      this.state.quiz.questions = [];
      this.render();
      google.script.run.withSuccessHandler(function(res) {
        if (res.success) self.state.quiz.questions = res.data;
        if (self.state.currentRoute === 'dailyQuest') self.render(true);
      }).withFailureHandler(function() { if (self.state.currentRoute === 'dailyQuest') self.render(true); }).getDailyQuest();
    } else if (route === 'quiz') {
      var paramStr = String(params || '1');
      var parts = paramStr.split('|');
      var mId = parts[0] || 1;
      var qType = parts[1] || null;
      this.state.quiz.moduleId = mId; this.state.quiz.quizType = qType;
      this.state.quiz.currentIndex = 0; this.state.quiz.score = 0;
      this.state.quiz.submitted = false; this.state.quiz.awarded = 0; this.state.quiz.alreadyDone = false;
      this.state.quiz.questions = [];
      this.render();
      google.script.run.withSuccessHandler(function(res) {
        if (res.success) self.state.quiz.questions = res.data;
        if (self.state.currentRoute === 'quiz') self.render(true);
      }).withFailureHandler(function() { if (self.state.currentRoute === 'quiz') self.render(true); }).getQuizQuestions(mId, qType);
    } else if (route === 'lesson') {
      this.state.currentModuleId = params || 1;
      this.render();
    } else if (route === 'flashcards') {
      var fmId = params || 1;
      this.state.flashcards.moduleId = fmId;
      this.state.flashcards.currentIndex = 0;
      this.state.flashcards.submitted = false; this.state.flashcards.awarded = 0; this.state.flashcards.alreadyDone = false;
      this.state.flashcards.cards = [];
      this.render();
      google.script.run.withSuccessHandler(function(res) {
        if (res.success) self.state.flashcards.cards = res.data;
        if (self.state.currentRoute === 'flashcards') self.render(true);
      }).withFailureHandler(function() { if (self.state.currentRoute === 'flashcards') self.render(true); }).getFlashcards(fmId);
    } else if (route === 'admin') {
      this.render();
    } else if (route === 'adminDB') {
      this.render();
      google.script.run.withSuccessHandler(function(res) {
        if (res.success) self.state.admin.tables = res.data;
        if (self.state.currentRoute === 'adminDB') self.render(true);
      }).withFailureHandler(function() {}).adminGetTables();
    } else if (route === 'adminExport') {
      this.render();
    } else if (route === 'bonusQR') {
      this.render();
      google.script.run.withSuccessHandler(function(res) {
        if (res.success) self.state.bonusScore = { total: res.total, history: res.history };
        if (self.state.currentRoute === 'bonusQR') self.render(true);
      }).withFailureHandler(function() {}).getBonusScore(self.state.user.UserID);
    } else if (route === 'weeklyGoal') {
      var ex = this.state.weeklyGoal.goal;
      this.state.wgGoalEdit = ex ? { type: ex.goalType, target: ex.target } : Object.assign({}, this.state.wgPick);
      this.render();
    } else if (route === 'grades') {
      // เข้ามาแล้วดึงคะแนนให้เลยด้วยเลขประจำตัวในโปรไฟล์ ไม่ต้องกรอกเอง
      this.state.grades = { result: null, loading: false, tried: false };
      this.render();
      var sid = (this.state.user && this.state.user.StudentId) || '';
      if (sid) {
        this.lookupGrade(sid);
      } else {
        // ล็อกอินค้างมาจากเวอร์ชันก่อน — ขอเลขประจำตัวจากฐานข้อมูลก่อน
        google.script.run.withSuccessHandler(function(r) {
          if (r && r.studentId) {
            self.state.user.StudentId = r.studentId;
            localStorage.setItem('lms_user', JSON.stringify(self.state.user));
            self.lookupGrade(r.studentId);
          } else if (self.state.currentRoute === 'grades') {
            self.state.grades.tried = true; self.render(true);
          }
        }).withFailureHandler(function() {
          self.state.grades.tried = true; self.render(true);
        }).getStudentIdOf(this.state.user.UserID);
      }
    } else if (route === 'myScores') {
      this.state.myScores = { data: null, loaded: false };
      this.render();
      google.script.run.withSuccessHandler(function(res) {
        self.state.myScores = { data: (res && res.success) ? res : null, loaded: true };
        if (self.state.currentRoute === 'myScores') self.render(true);
      }).withFailureHandler(function() {
        self.state.myScores = { data: null, loaded: true };
        if (self.state.currentRoute === 'myScores') self.render(true);
      }).getMyScoreReport(this.state.user.UserID);
    } else if (route === 'adminAnnounce') {
      this.state.announceAdmin = { items: [], loaded: false, image: null, busy: false };
      this.render();
      google.script.run.withSuccessHandler(function(res) {
        self.state.announceAdmin.items = (res && res.success) ? res.items : [];
        self.state.announceAdmin.loaded = true;
        if (self.state.currentRoute === 'adminAnnounce') self.render(true);
      }).withFailureHandler(function() {
        self.state.announceAdmin.loaded = true;
        if (self.state.currentRoute === 'adminAnnounce') self.render(true);
      }).adminListAnnouncements();
    } else if (route === 'activity') {
      // Activity tab — recent learning activity timeline (derived, no extra tables)
      this.render();
      google.script.run.withSuccessHandler(function(res) {
        if (res && res.success) self.state.activity = { items: res.feed || [], loaded: true };
        else self.state.activity = Object.assign({}, self.state.activity, { loaded: true });
        if (self.state.currentRoute === 'activity') self.render(true);
      }).withFailureHandler(function() {
        self.state.activity = Object.assign({}, self.state.activity, { loaded: true });
        if (self.state.currentRoute === 'activity') self.render(true);
      }).getCommunityData();
    } else if (route === 'userProfile') {
      this.state.viewingUser = null;
      this.render();
      google.script.run.withSuccessHandler(function(res) {
        if (res && res.success) self.state.viewingUser = res;
        else self.state.viewingUser = { error: true };
        if (self.state.currentRoute === 'userProfile') self.render(true);
      }).withFailureHandler(function() {
        self.state.viewingUser = { error: true };
        if (self.state.currentRoute === 'userProfile') self.render(true);
      }).getUserProfile(params);
    } else if (route === 'profile') {
      this.render();
      google.script.run.withSuccessHandler(function(res) {
        if (res && res.success) self.state.selfProfile = res;
        if (self.state.currentRoute === 'profile') self.render(true);
      }).withFailureHandler(function() {
        if (self.state.currentRoute === 'profile') self.render(true);
      }).getUserProfile(self.state.user.UserID);
    } else if (route === 'adminScanner') {
      this.state.scannedUser = null;
      this.render();
    } else if (route === 'adminQuizBuilder') {
      this.render();
    } else if (route === 'adminTable') {
      var tName = params;
      this.state.admin.currentTable = tName;
      this.state.admin.editingRow = -1;
      this.render();
      google.script.run.withSuccessHandler(function(res) {
        if (res.success) { self.state.admin.headers = res.headers; self.state.admin.data = res.data; }
        if (self.state.currentRoute === 'adminTable') self.render(true);
      }).withFailureHandler(function() {}).adminGetTableData(tName);
    } else if (route === 'placementTest') {
      this.state.placement = { phase: 'intro', currentIndex: 0, answers: [], result: null, answering: false };
      this.render();
    } else if (route === 'englishCourse') {
      this.state.englishCourse = Object.assign({}, this.state.englishCourse, { loaded: false });
      this.render();
      var self = this;
      google.script.run.withSuccessHandler(function(res) {
        if (res && res.success) self.state.englishCourse = { exp: res.totalExp || 0, progress: res.progress || {}, loaded: true };
        else self.state.englishCourse = Object.assign({}, self.state.englishCourse, { loaded: true });
        if (self.state.currentRoute === 'englishCourse') self.render(true);
      }).withFailureHandler(function() {
        self.state.englishCourse = Object.assign({}, self.state.englishCourse, { loaded: true });
        if (self.state.currentRoute === 'englishCourse') self.render(true);
      }).getEnglishProgress(self.state.user.UserID);
    } else if (route === 'englishModuleQuiz') {
      var modId = params || 'grammar';
      var qs = this.ENGLISH_QUESTIONS[modId] || [];
      this.state.englishQuiz = { moduleId: modId, questions: qs, currentIndex: 0, answers: [], submitted: false, awarded: 0 };
      this.render();
    } else {
      this.render();
    }
  },

  // Build the HTML string for the current route (no DOM side-effects)
  _buildHtml: function() {
    var r = this.state.currentRoute;
    if (r === 'login') return this.viewLogin();
    if (r === 'register') return this.viewRegister();
    if (r === 'dashboard') return this.viewDashboard() + this.bottomNav('home');
    if (r === 'lessons') return this.viewLessons() + this.bottomNav('lessons');
    if (r === 'midtermLessons') return this.viewMidtermLessons() + this.bottomNav('lessons');
    if (r === 'moduleDetail') return this.viewModuleDetail();
    if (r === 'lesson') return this.viewLesson();
    if (r === 'quiz' || r === 'dailyQuest') return this.viewQuiz();
    if (r === 'flashcards') return this.viewFlashcards();
    if (r === 'profile') return this.viewProfile() + this.bottomNav('profile');
    if (r === 'profileEdit') return this.viewProfileEdit() + this.bottomNav('profile');
    if (r === 'leaderboard') return this.viewLeaderboard() + this.bottomNav('home');
    if (r === 'guide') return this.viewGuide() + this.bottomNav('profile');
    if (r === 'bonusQR') return this.viewBonusQR() + this.bottomNav('bonus');
    if (r === 'activity') return this.viewActivity() + this.bottomNav('activity');
    if (r === 'userProfile') return this.viewUserProfile() + this.bottomNav('activity');
    if (r === 'weeklyGoal') return this.viewWeeklyGoal() + this.bottomNav('home');
    if (r === 'admin') return this.viewAdmin();
    if (r === 'adminScanner') return this.viewAdminScanner();
    if (r === 'adminDB') return this.viewAdminDB();
    if (r === 'adminTable') return this.viewAdminTable();
    if (r === 'adminExport') return this.viewAdminExport();
    if (r === 'adminQuizBuilder') return this.viewAdminQuizBuilder();
    if (r === 'grades') return this.viewGrades() + this.bottomNav('home');
    if (r === 'myScores') return this.viewMyScores() + this.bottomNav('home');
    if (r === 'adminAnnounce') return this.viewAdminAnnounce();
    if (r === 'placementTest') return this.viewPlacementTest();
    if (r === 'englishCourse') return this.viewEnglishCourse() + this.bottomNav('home');
    if (r === 'englishModuleQuiz') return this.viewEnglishModuleQuiz();
    return '<div class="loader">Page not found</div>';
  },

  // render(quiet=false) — route changes use View Transition; background data updates pass quiet=true
  render: function(quiet) {
    var el = document.getElementById('app');
    if (!el) return;
    var self = this;
    // แถบสลับโหมดและการ์ดประกาศลอยทับทุกหน้า จึงต่อท้ายผลของ _buildHtml
    var html = this._buildHtml() +
      (this.state.currentRoute === 'login' || this.state.currentRoute === 'register' ? '' : this.modeSwitch()) +
      (this.state.announcement.show ? this.viewAnnouncementCard() : '');

    function commit() { el.innerHTML = html; self.postRender(); }

    if (!quiet && typeof document.startViewTransition === 'function') {
      document.startViewTransition(commit);
    } else {
      commit();
    }
  },

  postRender: function() {
    var r = this.state.currentRoute;
    if (r === 'bonusQR') this.initBonusQR();
    else if (r === 'adminScanner') this.initQRScanner();
    else if (r === 'profileEdit' && this.state.cropperOpen) this.initCropper();
    if (r === 'profile' || r === 'userProfile') this.initVinyl();
    if (this.state.announcement.show) this.initAnnounceCard();
  },

  // ===== CONFETTI (variable reward feedback) =====
  celebrate: function(amount) {
    // respect reduced motion
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var host = document.querySelector('.app-container') || document.body;
    var layer = document.createElement('div');
    layer.className = 'confetti-layer';
    var colors = ['#FF8C42', '#C084FC', '#4ECB71', '#5BA4F5', '#FFD166', '#FF6B6B'];
    var n = amount || 36;
    for (var i = 0; i < n; i++) {
      var piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + '%';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDuration = (1.4 + Math.random() * 1.2) + 's';
      piece.style.animationDelay = (Math.random() * 0.3) + 's';
      if (Math.random() > 0.5) piece.style.borderRadius = '50%';
      piece.style.width = (7 + Math.random() * 7) + 'px';
      piece.style.height = (9 + Math.random() * 8) + 'px';
      layer.appendChild(piece);
    }
    host.appendChild(layer);
    setTimeout(function() { if (layer.parentNode) layer.parentNode.removeChild(layer); }, 3200);
  },

  /* ===== VIEWS ===== */

  viewLogin: function() {
    return '<div class="page-content" style="display:flex; flex-direction:column; justify-content:center; min-height:100%;">' +
      '<div class="text-center" style="margin-bottom: 24px;">' +
        '<div class="mascot-bounce" style="display:inline-block; margin-bottom:10px;">' +
          '<img src="' + mascotUrl + '" style="width:160px; height:160px; border-radius:50%; object-fit:cover; filter:drop-shadow(0 10px 20px rgba(120,60,200,0.35));" />' +
        '</div>' +
        '<h1 style="font-size:32px; font-weight:900; margin:0 0 4px; background:linear-gradient(135deg,#5B21B6,#FF8C42); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">Engkrit M6</h1>' +
        '<div style="display:inline-block; background:linear-gradient(135deg,#EDE9FE,#FFE0CC); border-radius:20px; padding:5px 18px; font-size:13px; font-weight:800; color:#5B21B6; box-shadow:0 4px 0 rgba(91,33,182,0.15);">📗 English Learning · ชั้น ม.6</div>' +
      '</div>' +
      '<div class="card" style="padding: 20px;">' +
        '<input type="text" class="input-field" placeholder="👤 Username (รหัสนักเรียน)" id="username">' +
        '<input type="password" class="input-field" placeholder="🔒 Password" id="password">' +
        '<button class="btn btn-primary" onclick="App.handleLogin()">🐻 เข้าสู่ระบบ</button>' +
        '<button class="btn btn-outline" onclick="App.navigate(\'register\')">สมัครสมาชิกใหม่</button>' +
      '</div>' +
      // ชื่อคนห่อด้วย .no-break กันเบราว์เซอร์หักกลางคำไทย (ไทยไม่มีช่องว่างระหว่างคำ)
      '<div style="margin-top: 20px; text-align: center; font-size: 11px; line-height: 1.9; color: var(--clay-text-light);">' +
        '<div><b>พัฒนาโดย:</b> <span class="no-break">ครูกฤษณะ เจี๊ยะทา</span></div>' +
        '<div><b>เนื้อหา:</b> <span class="no-break">ครูจิตสุภา คำโหงษ์</span> · <span class="no-break">ครูกฤษณะ เจี๊ยะทา</span></div>' +
      '</div>' +
    '</div>';
  },

  viewRegister: function() {
    return '<div class="page-content">' +
      '<div class="text-center" style="margin-bottom:16px;">' +
        '<div style="font-size:56px; filter:drop-shadow(0 8px 0 rgba(200,140,80,0.25));">' + this.bear + '</div>' +
        '<h2 class="text-title" style="background: linear-gradient(135deg, var(--bear-brown), var(--clay-purple)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">สมัครสมาชิก</h2>' +
        '<p style="font-size:13px; color:var(--clay-text-light);">พี่หมีน้อยอยากรู้จักเธอ! 🐾</p>' +
      '</div>' +
      '<div class="card" style="border:none; padding:0;">' +
        '<select class="input-field" id="reg-prefix">' +
          '<option value="นาย">นาย (Mr.)</option>' +
          '<option value="นางสาว">นางสาว (Miss)</option>' +
        '</select>' +
        '<input type="text" class="input-field" placeholder="ชื่อ" id="reg-firstname">' +
        '<input type="text" class="input-field" placeholder="นามสกุล" id="reg-lastname">' +
        '<select class="input-field" id="reg-class">' +
          '<option value="">-- เลือกห้องเรียน --</option>' +
          this.classOptionsHtml() +
        '</select>' +
        '<input type="number" class="input-field" placeholder="เลขที่" id="reg-number">' +
        '<input type="text" class="input-field" placeholder="รหัสนักเรียน" id="reg-studentid">' +
        '<input type="text" class="input-field" placeholder="Username" id="reg-username">' +
        '<input type="password" class="input-field" placeholder="Password" id="reg-password">' +
        '<input type="password" class="input-field" placeholder="ยืนยัน Password" id="reg-confirm-password">' +
        '<button class="btn btn-primary" onclick="App.handleRegister()">สมัครสมาชิก</button>' +
        '<button class="btn btn-outline" onclick="App.navigate(\'login\')">มีบัญชีอยู่แล้ว?</button>' +
      '</div>' +
    '</div>';
  },

  /* ===== PLACEMENT TEST ===== */

  viewPlacementTest: function() {
    var ph = this.state.placement.phase;
    if (ph === 'result') return this._ptResult();
    if (ph === 'quiz') return this._ptQuiz();
    return this._ptIntro();
  },

  _ptIntro: function() {
    return '<div class="page-content" style="display:flex; flex-direction:column; justify-content:center; min-height:100%;">' +
      '<div class="text-center" style="margin-bottom:24px;">' +
        '<div class="mascot-bounce" style="font-size:88px; filter:drop-shadow(0 10px 0 rgba(200,140,80,0.3)); display:inline-block;">' + this.bear + '</div>' +
        '<h1 class="text-title" style="background:linear-gradient(135deg,#5BA4F5,#C084FC); -webkit-background-clip:text; -webkit-text-fill-color:transparent; font-size:24px; margin-bottom:6px;">วัดระดับภาษาอังกฤษ</h1>' +
        '<div style="display:inline-block; background:linear-gradient(135deg,#E8F4FF,#EEE0FF); border-radius:20px; padding:6px 18px; font-size:13px; font-weight:800; color:#4A3F7A;">CEFR English Placement Test 🎯</div>' +
      '</div>' +
      '<div style="background:linear-gradient(145deg,#F0F7FF,#E8F0FF); border-radius:20px; padding:18px 20px; margin-bottom:18px; border-left:4px solid #5BA4F5;">' +
        '<div style="font-weight:800; font-size:14px; color:#2563EB; margin-bottom:10px;">📋 รายละเอียดแบบทดสอบ</div>' +
        '<div style="font-size:13px; color:#1e3a5f; line-height:1.9;">' +
          '📝 <b>20 ข้อ</b> ครอบคลุม Grammar &amp; Vocabulary<br>' +
          '🎯 ประเมินระดับ <b>CEFR A1 → B2</b><br>' +
          '📚 เนื้อหาตรงกับ <b>TGAT / A-Level</b><br>' +
          '⏱️ ใช้เวลาประมาณ <b>5–10 นาที</b><br>' +
          '💡 ผลจะช่วยวางแผนการเรียน<b>ให้ตรงจุด</b>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex; gap:8px; margin-bottom:20px; justify-content:center;">' +
        ['A1','A2','B1','B2'].map(function(lv, i) {
          var colors = ['#4ECB71','#5BA4F5','#FF8C42','#C084FC'];
          return '<div style="flex:1; text-align:center; padding:10px 4px; border-radius:14px; background:' + colors[i] + '22;">' +
            '<div style="font-weight:900; font-size:16px; color:' + colors[i] + ';">' + lv + '</div>' +
            '<div style="font-size:9px; color:var(--clay-text-light); font-weight:700; margin-top:2px;">' + ['ต้น','พื้นฐาน','กลาง','สูง'][i] + '</div>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<button class="btn btn-primary" style="font-size:16px; padding:16px;" onclick="App.startPlacement()">🚀 เริ่มทดสอบเลย!</button>' +
      '<button class="btn btn-outline" style="font-size:12px; margin-top:8px;" onclick="App.skipPlacement()">ข้ามก่อน (ทำทีหลังในโปรไฟล์)</button>' +
    '</div>';
  },

  _ptQuiz: function() {
    var pl = this.state.placement;
    var q = this.placementQuestions[pl.currentIndex];
    var total = this.placementQuestions.length;
    var pct = Math.round((pl.currentIndex / total) * 100);
    var levelColors = { A1: '#4ECB71', A2: '#5BA4F5', B1: '#FF8C42', B2: '#C084FC' };
    var levelBg    = { A1: '#E8FFF0', A2: '#E8F4FF', B1: '#FFF3E0', B2: '#F3E8FF' };
    var col = levelColors[q.level] || '#FF8C42';
    var bg  = levelBg[q.level]  || '#FFF3E0';
    var self = this;

    var optsHtml = q.opts.map(function(opt, i) {
      var letter = ['A','B','C','D'][i];
      return '<button class="pt-option" onclick="App.placementAnswer(' + i + ')" style="width:100%; text-align:left; display:flex; align-items:center; gap:12px; padding:14px 16px; background:var(--clay-white); border:2px solid rgba(150,100,200,0.12); border-radius:16px; cursor:pointer; font-family:var(--font-main); box-shadow:0 4px 0 rgba(150,100,200,0.08); margin-bottom:10px; transition:all 0.15s;">' +
        '<div style="width:32px; height:32px; border-radius:50%; background:var(--clay-bg); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:13px; color:var(--clay-text); flex-shrink:0;">' + letter + '</div>' +
        '<span style="font-size:14px; font-weight:600; color:var(--clay-text);">' + self.esc(opt) + '</span>' +
      '</button>';
    }).join('');

    return '<div class="page-content">' +
      '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">' +
        '<div style="font-weight:800; font-size:13px; color:var(--clay-text-light);">แบบทดสอบวัดระดับ</div>' +
        '<div style="background:' + bg + '; color:' + col + '; font-weight:800; font-size:12px; padding:5px 14px; border-radius:20px; border:1px solid ' + col + '44;">' + q.level + '</div>' +
      '</div>' +
      '<div class="progress-bar-container" style="margin-bottom:6px; height:10px;"><div class="progress-bar-fill" style="width:' + pct + '%; height:100%; border-radius:10px; background:linear-gradient(90deg,#5BA4F5,#C084FC); transition:width 0.4s;"></div></div>' +
      '<div style="display:flex; justify-content:space-between; font-size:11px; color:var(--clay-text-light); font-weight:700; margin-bottom:20px;">' +
        '<span>ข้อ ' + (pl.currentIndex + 1) + ' / ' + total + '</span>' +
        '<span>' + q.type + ' — ' + q.th + '</span>' +
      '</div>' +
      '<div class="card" style="background:linear-gradient(145deg,#F8F3FF,#EEE8FF); border:none; padding:20px 22px; margin-bottom:20px;">' +
        '<div style="font-size:16px; font-weight:800; color:var(--clay-text); line-height:1.6;">' + this.esc(q.q) + '</div>' +
      '</div>' +
      optsHtml +
    '</div>';
  },

  _ptResult: function() {
    var res = this.state.placement.result;
    var levelColors = { A1: '#4ECB71', A2: '#5BA4F5', B1: '#FF8C42', B2: '#C084FC' };
    var levelMeta = {
      A1: { emoji: '🐣', colorLight: '#E8FFF0', label: 'Beginner', th: 'เริ่มต้น', desc: 'ต้องเสริมพื้นฐาน Grammar & Vocab' },
      A2: { emoji: '📗', colorLight: '#E8F4FF', label: 'Elementary', th: 'พื้นฐาน', desc: 'มีฐานดีพอควร ต้องฝึกเพิ่ม' },
      B1: { emoji: '📘', colorLight: '#FFF3E0', label: 'Intermediate', th: 'กลาง', desc: 'กำลังพัฒนาดี ใกล้ถึงเป้า TGAT' },
      B2: { emoji: '🏅', colorLight: '#F3E8FF', label: 'Upper-Intermediate', th: 'ขั้นสูง', desc: 'ใกล้พร้อมสอบ TGAT แล้ว!' },
    };
    var recs = {
      A1: ['Flashcards ทุกวัน — Vocab 1-5 ก่อนเลย', 'ฝึก Present Simple & Past Simple ให้แม่น', 'Daily Quest ทุกวัน เน้นข้อ Vocab'],
      A2: ['เรียน Tenses ให้ครบก่อน (12 Tenses)', 'ขยาย Vocabulary ให้ได้ 1,500+ คำ', 'ฝึก Functional English ให้คล่อง'],
      B1: ['เน้น Grammar: Passive, Conditionals, Wish', 'ฝึก Vocabulary ระดับ Academic Word List', 'ทำโจทย์ TGAT เก่าให้ชิน Pattern ข้อสอบ'],
      B2: ['Mock Test TGAT/A-Level จับเวลาทุกสัปดาห์', 'ฝึก Reading Comprehension แบบยาว', 'เน้น Error Identification & Sentence Completion'],
    };
    var info = levelMeta[res.level] || levelMeta.B1;
    var col  = levelColors[res.level] || '#FF8C42';
    var recItems = (recs[res.level] || []).map(function(r, i) {
      return '<div style="display:flex; align-items:flex-start; gap:10px; padding:10px 0; ' + (i > 0 ? 'border-top:1px solid rgba(150,100,200,0.08);' : '') + '">' +
        '<div style="width:24px; height:24px; border-radius:50%; background:' + col + '; display:flex; align-items:center; justify-content:center; font-size:12px; color:white; font-weight:800; flex-shrink:0;">' + (i+1) + '</div>' +
        '<span style="font-size:13px; color:var(--clay-text); line-height:1.5; padding-top:2px;">' + r + '</span>' +
      '</div>';
    }).join('');
    var breakdown = ['A1','A2','B1','B2'].map(function(lv) {
      var sc = (res.byLevel && res.byLevel[lv]) || { correct: 0, total: 5 };
      var lc = levelColors[lv] || '#888';
      var bpct = sc.total > 0 ? Math.round((sc.correct/sc.total)*100) : 0;
      return '<div style="margin-bottom:10px;">' +
        '<div style="display:flex; justify-content:space-between; font-size:12px; font-weight:800; color:var(--clay-text); margin-bottom:4px;"><span>' + lv + '</span><span style="color:' + lc + ';">' + sc.correct + '/' + sc.total + '</span></div>' +
        '<div style="height:8px; border-radius:8px; background:rgba(150,100,200,0.10);"><div style="width:' + bpct + '%; height:100%; border-radius:8px; background:' + lc + '; transition:width 0.6s;"></div></div>' +
      '</div>';
    }).join('');

    return '<div class="page-content">' +
      '<div class="text-center" style="margin-bottom:20px;">' +
        '<div style="font-size:72px; margin-bottom:8px; animation:mascot-bounce 1s ease infinite;">' + info.emoji + '</div>' +
        '<h2 class="text-title" style="color:var(--bear-brown); margin:0 0 4px;">ผลการทดสอบ</h2>' +
        '<div style="font-size:12px; color:var(--clay-text-light);">ได้รับ +50 XP สำหรับการทำแบบทดสอบ 🎉</div>' +
      '</div>' +
      '<div style="background:' + info.colorLight + '; border:2px solid ' + col + '; border-radius:24px; padding:22px; text-align:center; margin-bottom:16px;">' +
        '<div style="font-size:11px; font-weight:800; color:' + col + '; letter-spacing:2px; margin-bottom:6px;">CEFR LEVEL</div>' +
        '<div style="font-size:56px; font-weight:900; color:' + col + '; line-height:1;">' + res.level + '</div>' +
        '<div style="font-size:15px; font-weight:800; color:var(--clay-text); margin-top:8px;">' + info.label + ' — ' + info.th + '</div>' +
        '<div style="font-size:12px; color:var(--clay-text-light); margin-top:4px;">' + info.desc + '</div>' +
        '<div style="margin-top:12px; font-size:22px; font-weight:900; color:' + col + ';">' + res.correct + '<span style="font-size:14px; color:var(--clay-text-light); font-weight:700;">/20 ข้อ</span></div>' +
      '</div>' +
      '<div class="card" style="padding:16px; margin-bottom:14px;">' +
        '<div style="font-weight:800; font-size:13px; color:var(--clay-text); margin-bottom:14px;">📊 คะแนนแยกตามระดับ</div>' +
        breakdown +
      '</div>' +
      '<div class="card" style="padding:16px; margin-bottom:18px;">' +
        '<div style="font-weight:800; font-size:14px; color:var(--clay-text); margin-bottom:12px;">💡 แนะนำ: เรียนอะไรก่อน?</div>' +
        recItems +
      '</div>' +
      '<button class="btn btn-primary" style="font-size:15px;" onclick="App.finishPlacement()">🐾 เริ่มเรียนเลย!</button>' +
    '</div>';
  },

  startPlacement: function() {
    this.state.placement.phase = 'quiz';
    this.state.placement.currentIndex = 0;
    this.state.placement.answers = [];
    this.state.placement.answering = false;
    this.render(true);
  },

  skipPlacement: function() {
    var self = this;
    this.state.user.PlacementDone = true;
    localStorage.setItem('lms_user', JSON.stringify(this.state.user));
    google.script.run.withSuccessHandler(function() { self.navigate('dashboard'); })
      .withFailureHandler(function() { self.navigate('dashboard'); })
      .submitPlacementResult(this.state.user.UserID, 'B1', 0);
  },

  placementAnswer: function(optIdx) {
    var pl = this.state.placement;
    if (pl.answering) return;
    pl.answering = true;
    var q = this.placementQuestions[pl.currentIndex];
    var correct = q.opts[optIdx] === q.ans;
    var ansIdx = q.opts.indexOf(q.ans);

    var btns = document.querySelectorAll('.pt-option');
    btns.forEach(function(b, i) {
      b.style.pointerEvents = 'none';
      if (i === ansIdx) {
        b.style.background = 'linear-gradient(135deg,#4ECB71,#2EAA55)';
        b.style.color = 'white'; b.style.borderColor = '#2EAA55';
        b.querySelector('div').style.background = 'rgba(255,255,255,0.25)';
        b.querySelector('div').style.color = 'white';
      } else if (i === optIdx && !correct) {
        b.style.background = 'linear-gradient(135deg,#FF6B6B,#E53E3E)';
        b.style.color = 'white'; b.style.borderColor = '#E53E3E';
      }
    });

    var self = this;
    setTimeout(function() {
      pl.answers.push({ level: q.level, type: q.type, correct: correct });
      pl.currentIndex++;
      pl.answering = false;
      if (pl.currentIndex >= self.placementQuestions.length) {
        pl.result = self.calcPlacementResult(pl.answers);
        pl.phase = 'result';
        self.state.user.EnglishLevel = pl.result.level;
        self.state.user.PlacementDone = true;
        localStorage.setItem('lms_user', JSON.stringify(self.state.user));
        google.script.run
          .withSuccessHandler(function(res) {
            if (!res || !res.success) self.toast('⚠️ บันทึกผลไม่สำเร็จ — ผลจะยังใช้ได้ในเครื่องนี้');
          })
          .withFailureHandler(function() { self.toast('⚠️ บันทึกผลไม่สำเร็จ — ผลจะยังใช้ได้ในเครื่องนี้'); })
          .submitPlacementResult(self.state.user.UserID, pl.result.level, pl.result.correct);
        self.celebrate(30);
      }
      self.render(true);
    }, 750);
  },

  calcPlacementResult: function(answers) {
    var byLevel = { A1: { correct: 0, total: 0 }, A2: { correct: 0, total: 0 }, B1: { correct: 0, total: 0 }, B2: { correct: 0, total: 0 } };
    var total = 0;
    answers.forEach(function(a) {
      if (byLevel[a.level]) {
        byLevel[a.level].total++;
        if (a.correct) { byLevel[a.level].correct++; total++; }
      }
    });
    var level = total <= 4 ? 'A1' : total <= 9 ? 'A2' : total <= 14 ? 'B1' : 'B2';
    return { correct: total, byLevel: byLevel, level: level };
  },

  finishPlacement: function() {
    this.toast('🎯 ระดับของคุณ: ' + (this.state.user.EnglishLevel || 'B1') + ' — เริ่มคอร์ส English TGAT ได้เลย!');
    this.navigate('englishCourse');
  },

  viewDashboard: function() {
    var u = this.state.user;
    var d = this.state.dashboardData;

    return '<div class="page-content">' +
      // Clay header greeting
      '<div style="background:linear-gradient(135deg,#FF8C42,#C084FC); border-radius:28px; padding:16px 20px; margin-bottom:18px; box-shadow:0 8px 0 rgba(160,80,200,0.2),0 14px 28px rgba(160,80,200,0.15); display:flex; gap:12px; align-items:center;">' +
        '<div class="mascot-bounce" style="font-size:52px; filter:drop-shadow(0 4px 0 rgba(0,0,0,0.15)); flex-shrink:0;">' + this.bear + '</div>' +
        '<div>' +
          '<div style="font-size:18px; font-weight:800; color:white;">สวัสดี ' + App.esc(u.FirstName) + '! 🐾</div>' +
          '<div style="font-size:12px; color:rgba(255,255,255,0.85); margin-top:4px;">วันนี้พี่หมีน้อยเตรียมบทเรียนไว้ให้แล้ว!</div>' +
        '</div>' +
      '</div>' +
      // Stats row
      '<div style="display:flex; gap:10px; margin-bottom:16px;">' +
        '<div class="stat-card" style="background:linear-gradient(145deg,#FFF3E0,#FFE8CC); box-shadow:0 6px 0 rgba(200,140,80,0.2),0 10px 20px rgba(200,140,80,0.10);">' +
          '<div style="font-size:22px;">⚡</div>' +
          '<div style="font-weight:800; font-size:20px; color:var(--bear-orange);">' + d.xp + '</div>' +
          '<div style="font-size:11px; color:var(--clay-text-light); font-weight:600;">XP</div>' +
        '</div>' +
        '<div class="stat-card" style="background:linear-gradient(145deg,#FFE0E0,#FFD0D0); box-shadow:0 6px 0 rgba(200,80,80,0.2),0 10px 20px rgba(200,80,80,0.10);">' +
          '<div style="font-size:22px;">🔥</div>' +
          '<div style="font-weight:800; font-size:20px; color:var(--clay-red);">' + d.streak + '</div>' +
          '<div style="font-size:11px; color:var(--clay-text-light); font-weight:600;">Streak</div>' +
        '</div>' +
        '<div class="stat-card" style="background:linear-gradient(145deg,#E0FFE8,#C8F5D8); box-shadow:0 6px 0 rgba(80,180,100,0.2),0 10px 20px rgba(80,180,100,0.10);">' +
          '<div style="font-size:22px;">' + this.levelInfo(d.xp).emoji + '</div>' +
          '<div style="font-weight:700; font-size:13px; color:var(--clay-green-shadow);">' + this.levelInfo(d.xp).name + '</div>' +
          '<div style="font-size:11px; color:var(--clay-text-light); font-weight:600;">Rank</div>' +
        '</div>' +
      '</div>' +
      // คะแนนกลางภาค + คะแนนในแอป — วางบนสุดให้นักเรียนกดได้ทันที
      '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:16px;">' +
        '<div class="card action-card" style="background:linear-gradient(145deg,#FFE9D6,#FFD9BC); box-shadow:0 6px 0 rgba(200,120,60,0.22),0 10px 20px rgba(200,120,60,0.12); margin:0; text-align:center; padding:16px 10px; cursor:pointer;" onclick="App.navigate(\'grades\')">' +
          '<div style="font-size:32px;">📋</div>' +
          '<div style="font-weight:800; font-size:13px; color:#B85C1E; margin-top:6px;">คะแนนกลางภาค</div>' +
          '<div style="font-size:10px; color:var(--clay-text-light); margin-top:2px;">จากคุณครู</div>' +
        '</div>' +
        '<div class="card action-card" style="background:linear-gradient(145deg,#E3F2FD,#D0E4FF); box-shadow:0 6px 0 rgba(60,130,220,0.22),0 10px 20px rgba(60,130,220,0.12); margin:0; text-align:center; padding:16px 10px; cursor:pointer;" onclick="App.navigate(\'myScores\')">' +
          '<div style="font-size:32px;">📊</div>' +
          '<div style="font-weight:800; font-size:13px; color:var(--clay-blue-shadow); margin-top:6px;">คะแนนในแอป</div>' +
          '<div style="font-size:10px; color:var(--clay-text-light); margin-top:2px;">รายบท + พิเศษ</div>' +
        '</div>' +
      '</div>' +
      // ===== HERO: สิ่งที่นักเรียนทำบ่อยที่สุด (จากข้อมูลการใช้งานจริง) =====
      '<div style="font-weight:800; font-size:14px; color:var(--clay-text-light); margin:2px 4px 10px;">วันนี้เรียนอะไรดี 🐾</div>' +
      // Daily Quest — อันดับ 1 ของการใช้งาน
      '<div class="card action-card" style="background:linear-gradient(145deg,#E0EEFF,#CCE0FF); box-shadow:0 6px 0 rgba(60,130,220,0.2),0 10px 20px rgba(60,130,220,0.10); margin-bottom:12px; cursor:pointer;" onclick="App.navigate(\'dailyQuest\')">' +
        '<div style="display:flex; align-items:center; gap:12px;">' +
          '<div style="font-size:40px;">' + this.bear + '</div>' +
          '<div style="flex:1;">' +
            '<div style="font-weight:800; font-size:15px; color:var(--clay-blue-shadow);">⭐ แบบฝึกหัดประจำวัน</div>' +
            '<div style="font-size:12px; color:var(--clay-text-light); margin-top:4px;">โจทย์สุ่ม 10 ข้อ รับ XP พิเศษวันละครั้ง!</div>' +
          '</div>' +
          '<div style="width:36px; height:36px; border-radius:50%; background:white; box-shadow:0 4px 0 rgba(60,130,220,0.2); display:flex; align-items:center; justify-content:center; font-size:16px; color:var(--clay-blue);">▶</div>' +
        '</div>' +
      '</div>' +
      // เข้าบทเรียน — ทางลัดที่เคยหายไปจากหน้าแรก
      '<div class="card action-card" style="background:linear-gradient(145deg,#E8F5E9,#C8E6C9); box-shadow:0 6px 0 rgba(46,125,50,0.2),0 10px 20px rgba(46,125,50,0.10); margin-bottom:12px; cursor:pointer;" onclick="App.navigate(\'lessons\')">' +
        '<div style="display:flex; align-items:center; gap:12px;">' +
          '<div style="font-size:38px;">📚</div>' +
          '<div style="flex:1;">' +
            '<div style="font-weight:800; font-size:15px; color:#1B5E20;">เข้าบทเรียน</div>' +
            '<div style="font-size:12px; color:var(--clay-text-light); margin-top:4px;">Pre-Test · คำศัพท์ · แบบฝึกหัด · Post-Test</div>' +
          '</div>' +
          '<div style="width:36px; height:36px; border-radius:50%; background:white; box-shadow:0 4px 0 rgba(46,125,50,0.2); display:flex; align-items:center; justify-content:center; font-size:16px; color:#2E7D32;">▶</div>' +
        '</div>' +
      '</div>' +
      // ===== สถานะของฉัน =====
      '<div style="font-weight:800; font-size:14px; color:var(--clay-text-light); margin:16px 4px 10px;">ของฉัน 🎒</div>' +
      // CEFR English Level badge
      (function(u) {
        var lv = u.EnglishLevel;
        if (!lv) return '<div class="card action-card" onclick="App.navigate(\'placementTest\')" style="background:linear-gradient(145deg,#EEF4FF,#E0EAFF); margin-bottom:14px; cursor:pointer; padding:14px 16px; display:flex; align-items:center; gap:12px; box-shadow:0 4px 0 rgba(91,164,245,0.2);">' +
          '<div style="font-size:32px;">📋</div>' +
          '<div style="flex:1;"><div style="font-weight:800; font-size:14px; color:#2563EB;">ยังไม่ได้วัดระดับภาษาอังกฤษ</div><div style="font-size:11px; color:var(--clay-text-light); margin-top:3px;">แตะเพื่อทำ Placement Test (CEFR) 5 นาที</div></div>' +
          '<div style="font-size:18px; color:#5BA4F5;">→</div>' +
        '</div>';
        var lvCols = { A1:'#4ECB71',A2:'#5BA4F5',B1:'#FF8C42',B2:'#C084FC' };
        var lvBg   = { A1:'#E8FFF0',A2:'#EEF4FF',B1:'#FFF3E0',B2:'#F5EEFF' };
        var col = lvCols[lv] || '#5BA4F5', bg = lvBg[lv] || '#EEF4FF';
        return '<div class="card" onclick="App.navigate(\'placementTest\')" style="background:' + bg + '; margin-bottom:14px; cursor:pointer; padding:12px 16px; display:flex; align-items:center; gap:12px; border-left:4px solid ' + col + '; box-shadow:none;">' +
          '<div style="font-size:28px;">🎯</div>' +
          '<div style="flex:1;"><div style="font-size:11px; color:var(--clay-text-light); font-weight:700;">ระดับภาษาอังกฤษของคุณ (CEFR)</div><div style="font-weight:900; font-size:22px; color:' + col + '; line-height:1;">' + lv + '</div></div>' +
          '<div style="font-size:11px; color:' + col + '; font-weight:700; text-align:right;">ทำใหม่<br>→</div>' +
        '</div>';
      })(u) +
      // Bonus score (คะแนนพิเศษ)
      '<div class="card action-card" style="background:linear-gradient(145deg,#F8F3FF,#EEE0FF); box-shadow:0 6px 0 rgba(160,80,200,0.2),0 10px 20px rgba(160,80,200,0.10); margin-bottom:16px; cursor:pointer; padding:16px;" onclick="App.navigate(\'bonusQR\')">' +
        '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">' +
          '<div style="font-weight:800; font-size:15px; color:var(--clay-purple-shadow);">⭐ คะแนนพิเศษ</div>' +
          '<div style="font-weight:800; font-size:18px; color:var(--clay-purple-shadow);">' + this.state.bonusScore.total + '<span style="font-size:13px; color:var(--clay-text-light);">/100</span></div>' +
        '</div>' +
        '<div class="progress-bar-container" style="margin:0; height:12px;"><div class="progress-bar-fill" style="width:' + this.state.bonusScore.total + '%; height:100%; border-radius:10px; background:linear-gradient(90deg,#4ECB71,#C084FC);"></div></div>' +
        '<div style="font-size:11px; color:var(--clay-text-light); margin-top:6px; text-align:right;">แตะเพื่อดู QR รับคะแนนจากคุณครู 🎫</div>' +
      '</div>' +
      // Weekly goal
      this.dashWeeklyGoalCard() +
      // Bear recommendation — แสดงเฉพาะเมื่อมีข้อมูลจุดอ่อนจริง
      (function(d, bear) {
        var w = d.recommendation && d.recommendation.weakness;
        if (!w || w === 'None' || w === '-') return '';
        return '<div class="card" style="background:linear-gradient(145deg,#F8F3FF,#EEE8FF); box-shadow:0 6px 0 rgba(160,100,220,0.2),0 10px 20px rgba(160,100,220,0.10);">' +
          '<div style="display:flex; gap:12px; align-items:center; margin-bottom:12px;">' +
            '<div style="font-size:36px;">' + bear + '</div>' +
            '<div>' +
              '<div style="font-weight:800; font-size:15px; color:var(--clay-purple-shadow);">🐾 พี่หมีน้อยแนะนำ</div>' +
              '<div style="font-size:13px; color:var(--clay-text-light); margin-top:4px;">ทบทวน <b style="color:var(--clay-text);">' + w + '</b> นะ!</div>' +
            '</div>' +
          '</div>' +
          '<button class="btn btn-primary" style="margin-bottom:0; font-size:13px;" onclick="App.navigate(\'quiz\', ' + d.recommendation.module + ')">ฝึกเลย! ⚡</button>' +
        '</div>';
      })(d, this.bear) +
      // ===== เพิ่มเติม =====
      '<div style="font-weight:800; font-size:14px; color:var(--clay-text-light); margin:16px 4px 10px;">เพิ่มเติม ✨</div>' +
      '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">' +
        '<div class="card action-card" style="background:linear-gradient(145deg,#E8F5E9,#C8E6C9); box-shadow:0 5px 0 rgba(46,125,50,0.18); text-align:center; padding:14px 8px; margin:0; cursor:pointer;" onclick="App.navigate(\'englishCourse\')">' +
          '<div style="font-size:28px;">📗</div>' +
          '<div style="font-weight:800; font-size:12px; color:#1B5E20; margin-top:5px;">English TGAT</div>' +
        '</div>' +
        '<div class="card action-card" style="background:linear-gradient(145deg,#FFF9D0,#FFF0A0); box-shadow:0 5px 0 rgba(180,160,60,0.18); text-align:center; padding:14px 8px; margin:0; cursor:pointer;" onclick="App.navigate(\'leaderboard\')">' +
          '<div style="font-size:28px;">🏆</div>' +
          '<div style="font-weight:800; font-size:12px; color:var(--clay-yellow-shadow); margin-top:5px;">อันดับ</div>' +
        '</div>' +
        '<div class="card action-card" style="background:linear-gradient(145deg,#E0F7FA,#C8EEF5); box-shadow:0 5px 0 rgba(60,170,200,0.18); text-align:center; padding:14px 8px; margin:0; cursor:pointer;" onclick="App.navigate(\'activity\')">' +
          '<div style="font-size:28px;">⚡</div>' +
          '<div style="font-weight:800; font-size:12px; color:#0E7C8B; margin-top:5px;">กิจกรรม</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  },

  /* ===== คะแนนกลางภาค (ดึงจากระบบเกรดของครู) ===== */

  lookupGrade: function(studentId) {
    var self = this;
    this.state.grades = { result: null, loading: true, tried: true };
    this.render(true);
    google.script.run.withSuccessHandler(function(res) {
      self.state.grades = { result: res, loading: false, tried: true };
      if (self.state.currentRoute === 'grades') self.render(true);
    }).withFailureHandler(function() {
      self.state.grades = { result: { success: false, message: 'เชื่อมต่อระบบคะแนนไม่ได้ ลองใหม่อีกครั้งนะ' }, loading: false, tried: true };
      if (self.state.currentRoute === 'grades') self.render(true);
    }).getMidtermGrade(studentId);
  },

  submitGradeLookup: function() {
    var el = document.getElementById('grade-sid');
    var sid = el ? el.value.trim() : '';
    if (!sid) { alert('กรุณากรอกเลขประจำตัวนักเรียน'); return; }
    this.lookupGrade(sid);
  },

  viewGrades: function() {
    var self = this;
    var g = this.state.grades;
    var u = this.state.user;
    var myRoom = u.Class || '';
    var roomCovered = api.GRADE_ROOMS.indexOf(myRoom) >= 0;

    var head = '<button onclick="App.navigate(\'dashboard\')" style="background:none; border:none; font-size:18px; color:var(--clay-text-light); cursor:pointer; padding:0; margin-bottom:14px; font-weight:700;">&#x2190; กลับ</button>' +
      '<h2 class="text-title" style="color:var(--bear-brown); margin:0 0 4px;">📋 คะแนนกลางภาค</h2>' +
      '<p style="font-size:12px; color:var(--clay-text-light); margin:0 0 16px;">อ33101 ภาษาอังกฤษ · ภาคเรียนที่ 1/2569</p>';

    if (g.loading) {
      return '<div class="page-content">' + head +
        '<div class="loader" style="height:auto; padding:40px 0;"><div class="loader-bear">' + this.bear + '</div><div class="loader-text">กำลังค้นหาคะแนน...</div></div>' +
      '</div>';
    }

    var r = g.result;

    // เจอคะแนนแล้ว
    if (r && r.success) {
      var s = r.student;
      var scoreCards = (r.scores || []).map(function(sc) {
        var v = String(sc.value);
        var isPass = /^pass$/i.test(v);
        var isBlank = v === '-' || v === '' || v === 'null';
        var col = isPass ? 'var(--clay-green-shadow)' : (isBlank ? 'var(--clay-text-light)' : 'var(--bear-orange)');
        var bg = isPass ? 'linear-gradient(145deg,#E0FFE8,#C8F5D8)' : (isBlank ? 'linear-gradient(145deg,#F3F0FA,#E8E3F5)' : 'linear-gradient(145deg,#FFF3E0,#FFE8CC)');
        var shown = isPass ? '✓' : (isBlank ? '—' : v);
        return '<div style="background:' + bg + '; border-radius:18px; padding:14px 10px; text-align:center; box-shadow:0 5px 0 rgba(150,100,200,0.14);">' +
          '<div style="font-size:10px; font-weight:800; color:var(--clay-text-light); line-height:1.5; min-height:30px; display:flex; align-items:center; justify-content:center; white-space:pre-line;">' + self.esc(sc.label) + '</div>' +
          '<div style="font-size:' + (isPass ? '26px' : '24px') + '; font-weight:900; color:' + col + '; line-height:1.3; margin-top:2px;">' + self.esc(shown) + '</div>' +
        '</div>';
      }).join('');

      return '<div class="page-content">' + head +
        '<div style="background:linear-gradient(135deg,#FF8C42,#C084FC); border-radius:26px; padding:18px 20px; margin-bottom:16px; box-shadow:0 8px 0 rgba(160,80,200,0.2),0 14px 28px rgba(160,80,200,0.15);">' +
          '<div style="font-size:19px; font-weight:800; color:white; line-height:1.5;">' + this.esc((s.prefix || '') + s.firstName + ' ' + s.lastName) + '</div>' +
          '<div style="display:flex; gap:7px; margin-top:9px; flex-wrap:wrap;">' +
            '<span class="clay-pill" style="background:rgba(255,255,255,0.24); color:white;">ห้อง ' + this.esc(s.class) + '</span>' +
            '<span class="clay-pill" style="background:rgba(255,255,255,0.24); color:white;">เลขที่ ' + this.esc(s.number) + '</span>' +
            '<span class="clay-pill" style="background:rgba(255,255,255,0.24); color:white;">รหัส ' + this.esc(s.studentId) + '</span>' +
          '</div>' +
        '</div>' +
        '<div style="font-weight:800; font-size:14px; color:var(--clay-text-light); margin:0 4px 10px;">รายการคะแนน 📝</div>' +
        '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">' + scoreCards + '</div>' +
        (r.lastUpdate ? '<div style="font-size:11px; color:var(--clay-text-light); text-align:center; margin-top:16px;">อัปเดตล่าสุด ' + this.esc(r.lastUpdate) + '</div>' : '') +
        '<button class="btn btn-outline" style="margin-top:16px;" onclick="App.state.grades={result:null,loading:false,tried:true}; App.render(true);">🔍 ค้นหาเลขประจำตัวอื่น</button>' +
      '</div>';
    }

    // ยังไม่เจอ / ยังไม่ได้ค้น — ให้กรอกเลขประจำตัวเอง
    var msg = '';
    if (r && !r.success) {
      msg = '<div class="card" style="background:linear-gradient(145deg,#FFE8E8,#FFD8D8); box-shadow:0 5px 0 rgba(200,80,80,0.18); padding:13px 15px; display:flex; gap:10px; align-items:flex-start;">' +
        '<div style="font-size:20px;">⚠️</div>' +
        '<div style="flex:1; font-size:13px; color:var(--clay-red-shadow); font-weight:700; line-height:1.6;">' + this.esc(r.message || 'ไม่พบข้อมูล') + '</div>' +
      '</div>';
    }

    var roomNote = !roomCovered && myRoom
      ? '<div class="card" style="background:linear-gradient(145deg,#FFF9D0,#FFF0A0); box-shadow:0 5px 0 rgba(180,160,60,0.18); padding:13px 15px; display:flex; gap:10px; align-items:flex-start;">' +
          '<div style="font-size:20px;">ℹ️</div>' +
          '<div style="flex:1; font-size:12px; color:#8a6d00; font-weight:700; line-height:1.7;">ระบบนี้มีคะแนนเฉพาะห้องที่ครูกฤษณะสอน (' + api.GRADE_ROOMS.join(', ') + ')<br>ห้อง ' + this.esc(myRoom) + ' ให้สอบถามคุณครูประจำวิชาโดยตรงนะ</div>' +
        '</div>'
      : '';

    return '<div class="page-content">' + head + msg + roomNote +
      '<div class="card">' +
        '<label style="display:block; font-weight:800; margin-bottom:6px; font-size:13px;">เลขประจำตัวนักเรียน</label>' +
        '<input type="tel" id="grade-sid" class="input-field" inputmode="numeric" maxlength="6" placeholder="เช่น 26717" value="' + this.esc((u && u.StudentId) || '') + '">' +
        '<button class="btn btn-primary" style="margin-bottom:0;" onclick="App.submitGradeLookup()">🔍 ดูคะแนนของฉัน</button>' +
      '</div>' +
      '<div style="font-size:11px; color:var(--clay-text-light); text-align:center; margin-top:10px; line-height:1.7;">คะแนนมาจากระบบของคุณครูโดยตรง<br>ถ้าข้อมูลไม่ถูกต้อง แจ้งคุณครูได้เลย 🐾</div>' +
    '</div>';
  },

  /* ===== เช็คคะแนนของฉัน ===== */

  viewMyScores: function() {
    var self = this;
    var st = this.state.myScores;

    if (!st.loaded) {
      return '<div class="page-content">' +
        '<button onclick="App.navigate(\'dashboard\')" style="background:none; border:none; font-size:18px; color:var(--clay-text-light); cursor:pointer; padding:0; margin-bottom:16px; font-weight:700;">&#x2190; กลับ</button>' +
        '<div class="loader" style="height:auto; padding:50px 0;"><div class="loader-bear">' + this.bear + '</div><div class="loader-text">กำลังรวบรวมคะแนน...</div></div>' +
      '</div>';
    }
    if (!st.data) {
      return '<div class="page-content">' +
        '<button onclick="App.navigate(\'dashboard\')" style="background:none; border:none; font-size:18px; color:var(--clay-text-light); cursor:pointer; padding:0; margin-bottom:16px; font-weight:700;">&#x2190; กลับ</button>' +
        '<div class="card" style="text-align:center;"><div style="font-size:40px;">😢</div><div style="font-size:14px; color:var(--clay-text-light); font-weight:700; margin-top:8px;">โหลดคะแนนไม่สำเร็จ ลองใหม่อีกครั้งนะ</div></div>' +
      '</div>';
    }

    var d = st.data;
    var u = this.state.user;

    // แถบสรุปคะแนนรวม
    var summary = '<div style="background:linear-gradient(135deg,#5BA4F5,#C084FC); border-radius:26px; padding:20px; margin-bottom:16px; box-shadow:0 8px 0 rgba(100,80,200,0.2),0 14px 28px rgba(100,80,200,0.15); text-align:center;">' +
      '<div style="font-size:12px; color:rgba(255,255,255,0.9); font-weight:700;">คะแนนรวมจากบทเรียน</div>' +
      '<div style="font-size:44px; font-weight:900; color:white; line-height:1.25; margin-top:2px;">' + d.totals.got + '<span style="font-size:22px; opacity:0.85;">/' + d.totals.full + '</span></div>' +
      '<div style="display:flex; gap:8px; justify-content:center; margin-top:10px;">' +
        '<span class="clay-pill" style="background:rgba(255,255,255,0.22); color:white;">⚡ ' + d.xp + ' XP</span>' +
        '<span class="clay-pill" style="background:rgba(255,255,255,0.22); color:white;">🏆 อันดับ ' + d.rank + '</span>' +
        (d.englishLevel ? '<span class="clay-pill" style="background:rgba(255,255,255,0.22); color:white;">🎯 ' + d.englishLevel + '</span>' : '') +
      '</div>' +
    '</div>';

    // ตารางคะแนนรายบท
    var unitsHtml = d.units.map(function(un) {
      var rows = un.parts.map(function(p) {
        var pct = p.done && p.max ? Math.round((p.score / p.max) * 100) : 0;
        var col = !p.done ? 'var(--clay-text-light)' : (pct >= 80 ? 'var(--clay-green-shadow)' : (pct >= 50 ? 'var(--bear-orange)' : 'var(--clay-red-shadow)'));
        return '<div style="display:flex; align-items:center; gap:10px; padding:9px 0; border-top:1px solid rgba(150,100,200,0.10);">' +
          '<div style="flex:1; font-size:13px; color:var(--clay-text); font-weight:600;">' + p.label + '</div>' +
          (p.done
            ? '<div style="width:74px; height:7px; border-radius:99px; background:var(--clay-gray); overflow:hidden; flex-shrink:0;"><div style="width:' + pct + '%; height:100%; background:' + col + ';"></div></div>' +
              '<div style="font-size:13px; font-weight:800; color:' + col + '; width:52px; text-align:right; flex-shrink:0;">' + p.score + '/' + p.max + '</div>'
            : '<div style="font-size:12px; font-weight:700; color:var(--clay-text-light); flex-shrink:0;">ยังไม่ได้ทำ</div>') +
        '</div>';
      }).join('');

      var allDone = un.doneCount === un.parts.length;
      return '<div class="card" style="padding:14px 16px;">' +
        '<div style="display:flex; align-items:center; gap:9px;">' +
          '<div style="font-size:13px; font-weight:800; color:var(--clay-text); flex:1;">Unit ' + un.no + ': ' + self.esc(un.title) + '</div>' +
          '<span class="clay-pill" style="background:' + (allDone ? 'var(--clay-green)' : 'var(--clay-gray)') + '; color:' + (allDone ? 'white' : 'var(--clay-text-light)') + '; font-size:11px;">' + un.doneCount + '/' + un.parts.length + (allDone ? ' ✓' : '') + '</span>' +
        '</div>' + rows +
      '</div>';
    }).join('');

    return '<div class="page-content">' +
      '<button onclick="App.navigate(\'dashboard\')" style="background:none; border:none; font-size:18px; color:var(--clay-text-light); cursor:pointer; padding:0; margin-bottom:14px; font-weight:700;">&#x2190; กลับ</button>' +
      '<h2 class="text-title" style="color:var(--bear-brown); margin:0 0 4px;">📊 คะแนนของฉัน</h2>' +
      '<p style="font-size:12px; color:var(--clay-text-light); margin:0 0 14px;">' + this.esc(u.FirstName + ' ' + u.LastName) + (d.className ? ' · ' + this.esc(d.className) : '') + '</p>' +
      summary +
      '<div style="font-weight:800; font-size:14px; color:var(--clay-text-light); margin:0 4px 10px;">คะแนนรายบท 📚</div>' +
      unitsHtml +
      '<div style="font-weight:800; font-size:14px; color:var(--clay-text-light); margin:16px 4px 10px;">อื่น ๆ ✨</div>' +
      '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">' +
        '<div class="stat-card" style="background:linear-gradient(145deg,#F8F3FF,#EEE0FF); box-shadow:0 5px 0 rgba(160,80,200,0.18);">' +
          '<div style="font-size:22px;">⭐</div>' +
          '<div style="font-weight:800; font-size:17px; color:var(--clay-purple-shadow);">' + d.bonus + '<span style="font-size:11px; color:var(--clay-text-light);">/100</span></div>' +
          '<div style="font-size:10px; color:var(--clay-text-light); font-weight:700;">คะแนนพิเศษ</div>' +
        '</div>' +
        '<div class="stat-card" style="background:linear-gradient(145deg,#E0EEFF,#CCE0FF); box-shadow:0 5px 0 rgba(60,130,220,0.18);">' +
          '<div style="font-size:22px;">📅</div>' +
          '<div style="font-weight:800; font-size:17px; color:var(--clay-blue-shadow);">' + d.dailyCount + '</div>' +
          '<div style="font-size:10px; color:var(--clay-text-light); font-weight:700;">แบบฝึกประจำวัน</div>' +
        '</div>' +
        '<div class="stat-card" style="background:linear-gradient(145deg,#FFF3E0,#FFE8CC); box-shadow:0 5px 0 rgba(200,140,80,0.18);">' +
          '<div style="font-size:22px;">🔤</div>' +
          '<div style="font-weight:800; font-size:17px; color:var(--bear-orange);">' + d.flashCount + '</div>' +
          '<div style="font-size:10px; color:var(--clay-text-light); font-weight:700;">ท่องคำศัพท์</div>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:11px; color:var(--clay-text-light); text-align:center; margin-top:16px; line-height:1.7;">แสดงคะแนนครั้งที่ทำได้ดีที่สุดของแต่ละพาร์ท<br>ทำซ้ำเพื่อเก็บคะแนนให้ดีขึ้นได้เสมอ 🐾</div>' +
    '</div>';
  },

  goalMeta: { lessons: { emoji:'📚', label:'เรียนบทเรียน', unit:'บท' }, xp: { emoji:'⚡', label:'สะสม XP', unit:'XP' }, vocab: { emoji:'🔤', label:'ท่องคำศัพท์', unit:'ครั้ง' } },

  dashWeeklyGoalCard: function() {
    var wg = this.state.weeklyGoal;
    if (!wg.loaded) return '';
    if (!wg.goal) {
      return '<div class="card action-card" style="background:linear-gradient(145deg,#FFF9D0,#FFE9A0); box-shadow:0 6px 0 rgba(180,150,40,0.2),0 10px 20px rgba(180,150,40,0.10); margin-bottom:16px; cursor:pointer;" onclick="App.navigate(\'weeklyGoal\')">' +
        '<div style="display:flex; align-items:center; gap:12px;">' +
          '<div style="font-size:38px;">🎯</div>' +
          '<div style="flex:1;"><div style="font-weight:800; font-size:15px; color:#8a6d00;">ตั้งเป้าหมายสัปดาห์นี้</div>' +
          '<div style="font-size:12px; color:var(--clay-text-light); margin-top:3px;">ตั้งเป้าแล้วทำสำเร็จรับ Badge พิเศษ! 🏅</div></div>' +
          '<div style="width:36px; height:36px; border-radius:50%; background:white; box-shadow:0 4px 0 rgba(180,150,40,0.2); display:flex; align-items:center; justify-content:center; font-size:16px; color:#8a6d00;">＋</div>' +
        '</div>' +
      '</div>';
    }
    var g = wg.goal, m = this.goalMeta[g.goalType] || this.goalMeta.lessons;
    var pct = Math.min(100, Math.round((g.progress / g.target) * 100));
    return '<div class="card action-card" style="background:linear-gradient(145deg,#FFF9D0,#FFE9A0); box-shadow:0 6px 0 rgba(180,150,40,0.2),0 10px 20px rgba(180,150,40,0.10); margin-bottom:16px; cursor:pointer;" onclick="App.navigate(\'weeklyGoal\')">' +
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
        '<div style="font-weight:800; font-size:14px; color:#8a6d00;">🎯 เป้าหมายสัปดาห์: ' + m.emoji + ' ' + m.label + '</div>' +
        '<div style="font-weight:800; font-size:13px; color:#8a6d00;">' + g.progress + '/' + g.target + ' ' + m.unit + '</div>' +
      '</div>' +
      '<div class="progress-bar-container" style="margin:0; height:12px;"><div class="progress-bar-fill" style="width:' + pct + '%; height:100%; border-radius:10px; background:linear-gradient(90deg,#FFD166,#FF8C42);"></div></div>' +
      (g.completed
        ? '<div style="font-size:12px; font-weight:800; color:var(--clay-green-shadow); margin-top:6px;">🏅 สำเร็จแล้ว! เก่งมาก</div>'
        : '<div style="font-size:11px; color:var(--clay-text-light); margin-top:6px; text-align:right;">อีก ' + (g.target - g.progress) + ' ' + m.unit + ' ก็ถึงเป้า สู้ๆ! 💪</div>') +
    '</div>';
  },

  viewWeeklyGoal: function() {
    var pick = this.state.wgGoalEdit || this.state.wgPick;
    var self = this;
    var types = ['lessons','xp','vocab'];
    var presets = { lessons:[2,3,5], xp:[300,500,1000], vocab:[5,10,20] };
    var typeCards = types.map(function(t){
      var m = self.goalMeta[t];
      var sel = pick.type === t;
      return '<div onclick="App.wgSetType(\'' + t + '\')" style="flex:1; text-align:center; padding:14px 6px; border-radius:16px; cursor:pointer; ' +
        (sel ? 'background:linear-gradient(135deg,#FFD166,#FF8C42); color:white; box-shadow:0 4px 0 rgba(200,140,40,0.3);' : 'background:var(--clay-white); color:var(--clay-text); box-shadow:0 4px 0 rgba(150,100,200,0.12);') + '">' +
        '<div style="font-size:26px;">' + m.emoji + '</div>' +
        '<div style="font-size:12px; font-weight:800; margin-top:4px;">' + m.label + '</div>' +
      '</div>';
    }).join('');
    var pr = presets[pick.type] || [];
    var presetBtns = pr.map(function(v){
      var sel = pick.target === v;
      return '<div onclick="App.wgSetTarget(' + v + ')" style="flex:1; text-align:center; padding:12px 0; border-radius:14px; cursor:pointer; font-weight:800; font-size:16px; ' +
        (sel ? 'background:linear-gradient(135deg,#FF8C42,#C084FC); color:white;' : 'background:var(--clay-bg); color:var(--clay-text);') + '">' + v + '</div>';
    }).join('');
    var m = this.goalMeta[pick.type];

    return '<div class="page-content">' +
      '<button onclick="App.navigate(\'dashboard\')" style="background:none; border:none; font-size:18px; color:var(--clay-text-light); cursor:pointer; padding:0; margin-bottom:16px; font-weight:700;">&#x2190; กลับ</button>' +
      '<h2 class="text-title" style="color:var(--bear-brown); margin-top:0;">🎯 เป้าหมายรายสัปดาห์</h2>' +
      '<p style="font-size:13px; color:var(--clay-text-light); margin-top:0;">ตั้งเป้าของสัปดาห์นี้ ระบบจะนับความคืบหน้าให้อัตโนมัติ ทำสำเร็จรับ Badge! 🏅</p>' +
      '<div class="card">' +
        '<div style="font-weight:800; font-size:14px; color:var(--clay-text); margin-bottom:10px;">1. เลือกประเภท</div>' +
        '<div style="display:flex; gap:10px;">' + typeCards + '</div>' +
      '</div>' +
      '<div class="card">' +
        '<div style="font-weight:800; font-size:14px; color:var(--clay-text); margin-bottom:10px;">2. ตั้งจำนวนเป้าหมาย (' + m.label + ')</div>' +
        '<div style="display:flex; gap:8px; margin-bottom:12px;">' + presetBtns + '</div>' +
        '<input id="wg-target" type="number" min="1" class="input-field" style="margin-bottom:0; text-align:center; font-size:20px; font-weight:800;" value="' + pick.target + '" oninput="App.wgSetTarget(parseInt(this.value)||1, true)">' +
        '<div style="text-align:center; font-size:12px; color:var(--clay-text-light); margin-top:8px;">เป้าหมาย: <b>' + pick.target + ' ' + m.unit + '</b> ภายในสัปดาห์นี้</div>' +
      '</div>' +
      '<button class="btn btn-primary" onclick="App.saveWeeklyGoal()">💾 ตั้งเป้าหมายนี้</button>' +
      (this.state.weeklyGoal.goal ? '<button class="btn btn-outline" onclick="App.navigate(\'dashboard\')">ยกเลิก</button>' : '') +
    '</div>';
  },

  wgSetType: function(t) { var p = this.state.wgGoalEdit || Object.assign({}, this.state.wgPick); p.type = t; var def = { lessons:3, xp:500, vocab:10 }; p.target = def[t]; this.state.wgGoalEdit = p; this.render(true); },
  wgSetTarget: function(v, noRender) { var p = this.state.wgGoalEdit || Object.assign({}, this.state.wgPick); p.target = Math.max(1, v || 1); this.state.wgGoalEdit = p; if (!noRender) this.render(true); },

  saveWeeklyGoal: function() {
    var self = this;
    var p = this.state.wgGoalEdit || this.state.wgPick;
    var inp = document.getElementById('wg-target');
    var target = inp ? Math.max(1, parseInt(inp.value) || 1) : p.target;
    google.script.run.withSuccessHandler(function(res) {
      if (res && res.success) { self.state.wgGoalEdit = null; self.state.dataLoaded = false; self.toast('🎯 ตั้งเป้าหมายแล้ว!'); self.navigate('dashboard'); }
      else { alert((res && res.message) || 'บันทึกไม่สำเร็จ'); }
    }).withFailureHandler(function(e){ alert('Error: ' + e.message); }).setWeeklyGoal(this.state.user.UserID, p.type, target);
  },

  timeAgo: function(iso) {
    if (!iso) return '';
    var diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return 'เมื่อสักครู่';
    if (diff < 3600) return Math.floor(diff / 60) + ' นาทีที่แล้ว';
    if (diff < 86400) return Math.floor(diff / 3600) + ' ชม.ที่แล้ว';
    if (diff < 604800) return Math.floor(diff / 86400) + ' วันที่แล้ว';
    return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  },

  activityHeader: function() {
    return '<div style="background:linear-gradient(135deg,#26C6DA,#5BA4F5); border-radius:24px; padding:18px 20px; margin-bottom:16px; box-shadow:0 8px 0 rgba(40,150,180,0.2),0 14px 28px rgba(40,150,180,0.15); display:flex; align-items:center; gap:12px;">' +
      '<div style="font-size:36px; filter:drop-shadow(0 4px 0 rgba(0,0,0,0.12));">⚡</div>' +
      '<div style="flex:1;"><div style="font-size:18px; font-weight:800; color:white;">กิจกรรมล่าสุด</div>' +
      '<div style="font-size:12px; color:rgba(255,255,255,0.9);">ดูว่าเพื่อนๆ กำลังเรียนอะไรกันอยู่! 🎉</div></div>' +
    '</div>';
  },


  // ===== ACTIVITY TAB (route 'activity') — recent learning activity timeline =====
  viewActivity: function() {
    var ad = this.state.activity || { items: [], loaded: false };
    if (!ad.loaded) {
      return '<div class="page-content">' + this.activityHeader() +
        '<div class="loader" style="height:auto; padding:40px 0;"><div class="loader-bear">' + this.bear + '</div><div class="loader-text">กำลังโหลดกิจกรรม...</div></div>' +
      '</div>';
    }
    var self = this;
    var items = ad.items || [];
    var listHtml = items.length === 0
      ? '<div class="card" style="text-align:center; background:linear-gradient(145deg,#F8F3FF,#EEE8FF);"><div style="font-size:40px; margin-bottom:6px;">⚡</div><div style="font-size:13px; color:var(--clay-text-light); font-weight:700;">ยังไม่มีกิจกรรม — เริ่มเรียนเพื่อให้เพื่อนๆ เห็น!</div></div>'
      : items.map(function(a){ return self.activityItem(a); }).join('');

    return '<div class="page-content">' + this.activityHeader() +
      listHtml +
    '</div>';
  },

  // One activity row (avatar clickable → profile, emoji + action text + time)
  activityItem: function(a) {
    var av = a.img
      ? '<img src="' + a.img + '" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;">'
      : '<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#EDE9F7,#DDD4EF);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">👤</div>';
    var avWrap = a.userId
      ? '<div onclick="App.navigate(\'userProfile\',\'' + a.userId + '\')" style="cursor:pointer;">' + av + '</div>'
      : av;
    return '<div style="background:var(--clay-white); border-radius:16px; padding:12px 14px; margin-bottom:8px; box-shadow:0 4px 0 rgba(150,100,200,0.10),0 6px 12px rgba(150,100,200,0.06); display:flex; gap:12px; align-items:center;">' + avWrap +
      '<div style="flex:1; min-width:0;">' +
        '<div style="font-size:14px; color:var(--clay-text); line-height:1.6;"><b>' + this.esc(a.name) + '</b> <span style="color:var(--clay-text-light);">' + this.esc(a.text) + '</span></div>' +
        '<div style="font-size:11px; color:var(--clay-text-light); margin-top:3px;">' + (a.cls ? this.esc(a.cls) + ' · ' : '') + this.timeAgo(a.at) + '</div>' +
      '</div>' +
      '<div style="font-size:26px; flex-shrink:0;">' + a.emoji + '</div>' +
    '</div>';
  },

  viewGuide: function() {
    return '<div class="page-content">' +
      '<div class="text-center" style="margin-bottom:20px;">' +
        '<div class="mascot-bounce" style="font-size:72px; filter:drop-shadow(0 8px 0 rgba(200,140,80,0.3));">' + this.bear + '</div>' +
        '<h2 class="text-title" style="background:linear-gradient(135deg,var(--bear-brown),var(--clay-purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;">คำแนะนำจากพี่หมีน้อย</h2>' +
      '</div>' +
      '<div class="card" style="background:linear-gradient(145deg,#E0FFE8,#C8F5D8); box-shadow:0 6px 0 rgba(80,180,100,0.2),0 10px 20px rgba(80,180,100,0.10);">' +
        '<h3 style="margin-top:0; color:var(--clay-green-shadow); font-size:15px;">🐾 1. เรียนทีละโมดูล</h3>' +
        '<p style="font-size:13px; color:var(--clay-text-light); margin:0;">กดเข้าไปในแต่ละโมดูลเพื่อเลือกทำ Quiz หรือ Flashcard ได้เลย!</p>' +
      '</div>' +
      '<div class="card" style="background:linear-gradient(145deg,#FFF3E0,#FFE8CC); box-shadow:0 6px 0 rgba(200,140,80,0.2),0 10px 20px rgba(200,140,80,0.10);">' +
        '<h3 style="margin-top:0; color:var(--bear-orange-shadow); font-size:15px;">⚡ 2. สะสม XP</h3>' +
        '<p style="font-size:13px; color:var(--clay-text-light); margin:0;"><b>+10 XP</b> ต่อข้อที่ตอบถูก | <b>+20 XP</b> เมื่อจบ Flashcard</p>' +
      '</div>' +
      '<div class="card" style="background:linear-gradient(145deg,#FFE0E0,#FFD0D0); box-shadow:0 6px 0 rgba(200,80,80,0.2),0 10px 20px rgba(200,80,80,0.10);">' +
        '<h3 style="margin-top:0; color:var(--clay-red-shadow); font-size:15px;">🔥 3. แข่งกับเพื่อน</h3>' +
        '<p style="font-size:13px; color:var(--clay-text-light); margin:0;">ดู Leaderboard เพื่อเช็คอันดับ! พี่หมีน้อยเชียร์ให้นะ!</p>' +
      '</div>' +
      '<button class="btn btn-primary" onclick="App.navigate(\'dashboard\')">เข้าใจแล้ว! 🐾</button>' +
    '</div>';
  },

  viewLessons: function() {
    var mods = this.state.modules;
    var mainHtml;

    if (mods && mods.length > 0) {
      var completed = this.state.completedModules || [];
      var doneCount = mods.filter(function(m) { return completed.indexOf(m.id) >= 0; }).length;
      var allDone = doneCount >= mods.length;
      mainHtml = '<div class="card module-card" style="background:linear-gradient(135deg,#FF8C42,#C084FC); box-shadow:0 6px 0 rgba(160,80,200,0.3),0 10px 20px rgba(100,60,160,0.10); cursor:pointer;" onclick="App.navigate(\'midtermLessons\')">' +
        '<div style="display:flex; align-items:center; gap:16px;">' +
          '<div style="width:56px; height:56px; border-radius:18px; background:white; box-shadow:0 4px 0 rgba(0,0,0,0.08); display:flex; align-items:center; justify-content:center; font-size:28px; flex-shrink:0;">&#x1F4DA;</div>' +
          '<div style="flex:1;">' +
            '<div style="font-weight:800; font-size:16px; color:white;">บทเรียนกลางภาคเทอม 1/2569' + (allDone ? ' <span style="font-size:11px;">เรียนจบแล้ว</span>' : '') + '</div>' +
            '<div style="margin-top:4px; font-size:12px; color:rgba(255,255,255,0.85);">รวมทุกเนื้อหา คำศัพท์ แบบฝึกหัด และแบบทดสอบไว้ในที่เดียว &middot; เรียนจบแล้ว ' + doneCount + '/' + mods.length + ' หมวด</div>' +
          '</div>' +
          '<div style="font-size:20px; color:white;">&rsaquo;</div>' +
        '</div>' +
      '</div>';
    } else {
      mainHtml = '<div class="loader"><div class="loader-bear">' + this.bear + '</div><div class="loader-text">กำลังโหลดบทเรียน...</div></div>';
    }

    return '<div class="page-content">' +
      '<div style="background:linear-gradient(135deg,#5BA4F5,#C084FC); border-radius:28px; padding:16px 20px; margin-bottom:18px; box-shadow:0 8px 0 rgba(100,80,200,0.2),0 14px 28px rgba(100,80,200,0.15); display:flex; align-items:center; gap:12px;">' +
        '<div style="font-size:40px; filter:drop-shadow(0 4px 0 rgba(0,0,0,0.15));">' + this.bear + '</div>' +
        '<div>' +
          '<div style="font-size:18px; font-weight:800; color:white;">เส้นทางการเรียนรู้</div>' +
          '<div style="font-size:12px; color:rgba(255,255,255,0.85); margin-top:4px;">เลือกโมดูลที่อยากเรียนได้เลยนะ! 📚</div>' +
        '</div>' +
      '</div>' +
      mainHtml +
    '</div>';
  },

  // One module's 5-step learning path (Pre-Test / Vocab / Content / Activity / Post-Test).
  // Every step still routes with the module's own id, so scores keep recording
  // under the same reference_id as before — merging the lesson list touches no scores.
  _moduleStepsHtml: function(m, unitNo) {
    var mid = m.id;
    var completed = this.state.completedModules || [];
    var isDone = completed.indexOf(mid) >= 0;
    return '<div style="font-weight:800; font-size:14px; color:var(--clay-text); margin:18px 0 8px;">หมวด ' + unitNo + ': ' + this.esc(m.title) + (isDone ? ' <span style="font-size:11px; color:var(--clay-green-shadow);">เรียนจบแล้ว</span>' : '') + '</div>' +
      (m.desc ? '<div style="font-size:12px; color:var(--clay-text-light); margin-bottom:10px;">' + this.esc(m.desc) + '</div>' : '') +
      '<div style="display:flex; flex-direction:column; gap:10px; margin-bottom:8px;">' +
        '<div class="card" style="background:linear-gradient(145deg,#FFE0E0,#FFD0D0); box-shadow:0 6px 0 rgba(200,80,80,0.2),0 10px 20px rgba(200,80,80,0.1); cursor:pointer; display:flex; align-items:center; gap:14px; padding:16px;" onclick="App.navigate(\'quiz\', \'' + mid + '|PreTest\')">' +
          '<div style="width:48px; height:48px; border-radius:16px; background:white; box-shadow:0 4px 0 rgba(200,80,80,0.15); display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0;">1️⃣</div>' +
          '<div style="flex:1;"><div style="font-weight:800; font-size:15px; color:#b03030;">ทดสอบก่อนเรียน</div><div style="font-size:12px; color:var(--clay-text-light); margin-top:3px;">Pre-Test — วัดความรู้เบื้องต้น</div></div>' +
          '<div style="font-size:20px; color:#b03030;">›</div>' +
        '</div>' +
        '<div class="card" style="background:linear-gradient(145deg,#FFF3E0,#FFE8CC); box-shadow:0 6px 0 rgba(200,140,80,0.2),0 10px 20px rgba(200,140,80,0.1); cursor:pointer; display:flex; align-items:center; gap:14px; padding:16px;" onclick="App.navigate(\'flashcards\', ' + mid + ')">' +
          '<div style="width:48px; height:48px; border-radius:16px; background:white; box-shadow:0 4px 0 rgba(200,140,80,0.15); display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0;">2️⃣</div>' +
          '<div style="flex:1;"><div style="font-weight:800; font-size:15px; color:var(--bear-brown);">คำศัพท์</div><div style="font-size:12px; color:var(--clay-text-light); margin-top:3px;">Flashcards — ท่องศัพท์สำคัญ</div></div>' +
          '<div style="font-size:20px; color:var(--bear-brown);">›</div>' +
        '</div>' +
        '<div class="card" style="background:linear-gradient(145deg,#E3F2FD,#BBDEFB); box-shadow:0 6px 0 rgba(60,130,220,0.2),0 10px 20px rgba(60,130,220,0.1); cursor:pointer; display:flex; align-items:center; gap:14px; padding:16px;" onclick="App.navigate(\'lesson\', ' + mid + ')">' +
          '<div style="width:48px; height:48px; border-radius:16px; background:white; box-shadow:0 4px 0 rgba(60,130,220,0.15); display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0;">3️⃣</div>' +
          '<div style="flex:1;"><div style="font-weight:800; font-size:15px; color:var(--clay-blue-shadow);">เนื้อหา</div><div style="font-size:12px; color:var(--clay-text-light); margin-top:3px;">Lesson Content — ทฤษฎีและตัวอย่าง</div></div>' +
          '<div style="font-size:20px; color:var(--clay-blue-shadow);">›</div>' +
        '</div>' +
        '<div class="card" style="background:linear-gradient(145deg,#E8F5E9,#C8E6C9); box-shadow:0 6px 0 rgba(60,160,80,0.2),0 10px 20px rgba(60,160,80,0.1); cursor:pointer; display:flex; align-items:center; gap:14px; padding:16px;" onclick="App.navigate(\'quiz\', \'' + mid + '|Activity\')">' +
          '<div style="width:48px; height:48px; border-radius:16px; background:white; box-shadow:0 4px 0 rgba(60,160,80,0.15); display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0;">4️⃣</div>' +
          '<div style="flex:1;"><div style="font-weight:800; font-size:15px; color:var(--clay-green-shadow);">แบบฝึกหัด</div><div style="font-size:12px; color:var(--clay-text-light); margin-top:3px;">Activity — ฝึกทำโจทย์</div></div>' +
          '<div style="font-size:20px; color:var(--clay-green-shadow);">›</div>' +
        '</div>' +
        '<div class="card" style="background:linear-gradient(145deg,#F3E5F5,#E1BEE7); box-shadow:0 6px 0 rgba(150,80,200,0.2),0 10px 20px rgba(150,80,200,0.1); cursor:pointer; display:flex; align-items:center; gap:14px; padding:16px;" onclick="App.navigate(\'quiz\', \'' + mid + '|PostTest\')">' +
          '<div style="width:48px; height:48px; border-radius:16px; background:white; box-shadow:0 4px 0 rgba(150,80,200,0.15); display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0;">5️⃣</div>' +
          '<div style="flex:1;"><div style="font-weight:800; font-size:15px; color:var(--clay-purple-shadow);">ทดสอบหลังเรียน</div><div style="font-size:12px; color:var(--clay-text-light); margin-top:3px;">Post-Test — วัดความรู้หลังเรียน</div></div>' +
          '<div style="font-size:20px; color:var(--clay-purple-shadow);">›</div>' +
        '</div>' +
      '</div>';
  },

  // Every module's steps in one scrollable page — this IS the "merge" the teacher asked
  // for: one lesson entry point instead of N separate Unit cards. Nothing in api.js
  // changed, so scores/reference_id history is untouched.
  viewMidtermLessons: function() {
    var mods = this.state.modules || [];
    var self = this;
    var sections = mods.map(function(m, i) { return self._moduleStepsHtml(m, i + 1); }).join('');
    return '<div class="page-content">' +
      '<button onclick="App.navigate(\'lessons\')" style="background:none; border:none; font-size:18px; color:var(--clay-text-light); cursor:pointer; padding:0; margin-bottom:16px; font-weight:700;">&#x2190; กลับ</button>' +
      '<div style="background:linear-gradient(135deg,#FF8C42,#C084FC); border-radius:24px; padding:20px; margin-bottom:16px; text-align:center; box-shadow:0 8px 0 rgba(160,80,200,0.2),0 14px 28px rgba(160,80,200,0.12);">' +
        '<div style="font-size:56px; margin-bottom:8px;">' + this.bear + '</div>' +
        '<h2 style="margin:0 0 6px 0; color:white; font-size:20px; font-weight:800;">บทเรียนกลางภาคเทอม 1/2569</h2>' +
        '<p style="margin:0; font-size:13px; color:rgba(255,255,255,0.85);">รวมทุก Unit ไว้ในหน้าเดียว เลือกทำได้ทุกหมวด</p>' +
      '</div>' +
      sections +
    '</div>';
  },

  showModuleDetail: function(moduleId, idx) {
    this.state.currentModuleId = moduleId;
    this.state.currentModuleIdx = idx || 0;
    this.state.currentRoute = 'moduleDetail';
    this.render();
  },

  lockedUnitHint: function(unitNo) {
    alert('🔒 Unit ' + unitNo + ' ยังล็อกอยู่\nเรียน Unit ' + (unitNo - 1) + ' ให้จบก่อน (ทำ Post-Test ให้เสร็จ) แล้วจะปลดล็อกอัตโนมัติ');
  },

  viewModuleDetail: function() {
    var mid = this.state.currentModuleId;
    var idx = this.state.currentModuleIdx || 0;
    var mods = this.state.modules || [];
    var mod = null;
    for (var i = 0; i < mods.length; i++) {
      if (Number(mods[i].id) === Number(mid)) { mod = mods[i]; break; }
    }
    var title = mod ? mod.title : 'Module ' + mid;
    var desc = mod ? (mod.desc || '') : '';

    var bgColors = [
      'linear-gradient(135deg, #e8f5e9, #c8e6c9)',
      'linear-gradient(135deg, #e3f2fd, #bbdefb)',
      'linear-gradient(135deg, #fce4ec, #f8bbd0)',
      'linear-gradient(135deg, #fff3e0, #ffe0b2)'
    ];
    var borderColors = ['var(--duo-green)', 'var(--duo-blue)', 'var(--duo-red)', 'var(--bear-orange)'];
    var cIdx = idx % 4;

    return '<div class="page-content">' +
      '<button onclick="App.navigate(\'lessons\')" style="background:none; border:none; font-size:18px; color:var(--clay-text-light); cursor:pointer; padding:0; margin-bottom:16px; font-weight:700;">&#x2190; กลับ</button>' +
      '<div style="background:linear-gradient(135deg,#FF8C42,#C084FC); border-radius:24px; padding:20px; margin-bottom:16px; text-align:center; box-shadow:0 8px 0 rgba(160,80,200,0.2),0 14px 28px rgba(160,80,200,0.12);">' +
        '<div style="font-size:56px; margin-bottom:8px;">' + this.bear + '</div>' +
        '<h2 style="margin:0 0 6px 0; color:white; font-size:20px; font-weight:800;">Unit ' + (idx + 1) + ': ' + title + '</h2>' +
        '<p style="margin:0; font-size:13px; color:rgba(255,255,255,0.85);">' + desc + '</p>' +
      '</div>' +
      // Learning path steps
      '<div style="display:flex; flex-direction:column; gap:10px;">' +
        // Step 1 - Pre-test
        '<div class="card" style="background:linear-gradient(145deg,#FFE0E0,#FFD0D0); box-shadow:0 6px 0 rgba(200,80,80,0.2),0 10px 20px rgba(200,80,80,0.1); cursor:pointer; display:flex; align-items:center; gap:14px; padding:16px;" onclick="App.navigate(\'quiz\', \'' + mid + '|PreTest\')">' +
          '<div style="width:48px; height:48px; border-radius:16px; background:white; box-shadow:0 4px 0 rgba(200,80,80,0.15); display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0;">1️⃣</div>' +
          '<div style="flex:1;"><div style="font-weight:800; font-size:15px; color:#b03030;">ทดสอบก่อนเรียน</div><div style="font-size:12px; color:var(--clay-text-light); margin-top:3px;">Pre-Test — วัดความรู้เบื้องต้น</div></div>' +
          '<div style="font-size:20px; color:#b03030;">›</div>' +
        '</div>' +
        // Step 2 - Vocab flashcards
        '<div class="card" style="background:linear-gradient(145deg,#FFF3E0,#FFE8CC); box-shadow:0 6px 0 rgba(200,140,80,0.2),0 10px 20px rgba(200,140,80,0.1); cursor:pointer; display:flex; align-items:center; gap:14px; padding:16px;" onclick="App.navigate(\'flashcards\', ' + mid + ')">' +
          '<div style="width:48px; height:48px; border-radius:16px; background:white; box-shadow:0 4px 0 rgba(200,140,80,0.15); display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0;">2️⃣</div>' +
          '<div style="flex:1;"><div style="font-weight:800; font-size:15px; color:var(--bear-brown);">คำศัพท์</div><div style="font-size:12px; color:var(--clay-text-light); margin-top:3px;">Flashcards — ท่องศัพท์สำคัญ</div></div>' +
          '<div style="font-size:20px; color:var(--bear-brown);">›</div>' +
        '</div>' +
        // Step 3 - Content
        '<div class="card" style="background:linear-gradient(145deg,#E3F2FD,#BBDEFB); box-shadow:0 6px 0 rgba(60,130,220,0.2),0 10px 20px rgba(60,130,220,0.1); cursor:pointer; display:flex; align-items:center; gap:14px; padding:16px;" onclick="App.navigate(\'lesson\', ' + mid + ')">' +
          '<div style="width:48px; height:48px; border-radius:16px; background:white; box-shadow:0 4px 0 rgba(60,130,220,0.15); display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0;">3️⃣</div>' +
          '<div style="flex:1;"><div style="font-weight:800; font-size:15px; color:var(--clay-blue-shadow);">เนื้อหา</div><div style="font-size:12px; color:var(--clay-text-light); margin-top:3px;">Lesson Content — ทฤษฎีและตัวอย่าง</div></div>' +
          '<div style="font-size:20px; color:var(--clay-blue-shadow);">›</div>' +
        '</div>' +
        // Step 4 - Activity
        '<div class="card" style="background:linear-gradient(145deg,#E8F5E9,#C8E6C9); box-shadow:0 6px 0 rgba(60,160,80,0.2),0 10px 20px rgba(60,160,80,0.1); cursor:pointer; display:flex; align-items:center; gap:14px; padding:16px;" onclick="App.navigate(\'quiz\', \'' + mid + '|Activity\')">' +
          '<div style="width:48px; height:48px; border-radius:16px; background:white; box-shadow:0 4px 0 rgba(60,160,80,0.15); display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0;">4️⃣</div>' +
          '<div style="flex:1;"><div style="font-weight:800; font-size:15px; color:var(--clay-green-shadow);">แบบฝึกหัด</div><div style="font-size:12px; color:var(--clay-text-light); margin-top:3px;">Activity — ฝึกทำโจทย์</div></div>' +
          '<div style="font-size:20px; color:var(--clay-green-shadow);">›</div>' +
        '</div>' +
        // Step 5 - Post-test
        '<div class="card" style="background:linear-gradient(145deg,#F3E5F5,#E1BEE7); box-shadow:0 6px 0 rgba(150,80,200,0.2),0 10px 20px rgba(150,80,200,0.1); cursor:pointer; display:flex; align-items:center; gap:14px; padding:16px;" onclick="App.navigate(\'quiz\', \'' + mid + '|PostTest\')">' +
          '<div style="width:48px; height:48px; border-radius:16px; background:white; box-shadow:0 4px 0 rgba(150,80,200,0.15); display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0;">5️⃣</div>' +
          '<div style="flex:1;"><div style="font-weight:800; font-size:15px; color:var(--clay-purple-shadow);">ทดสอบหลังเรียน</div><div style="font-size:12px; color:var(--clay-text-light); margin-top:3px;">Post-Test — วัดความรู้หลังเรียน</div></div>' +
          '<div style="font-size:20px; color:var(--clay-purple-shadow);">›</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  },

  viewLesson: function() {
    var mid = this.state.currentModuleId;
    return '<div class="page-content">' +
      '<button onclick="App.navigate(\'moduleDetail\')" style="background:none; border:none; font-size:18px; color:var(--duo-text-light); cursor:pointer; padding:0; margin-bottom:16px; font-weight:700;">&#x2190; กลับ</button>' +
      '<h2 class="text-title" style="color:var(--bear-brown); margin-top:0;">&#x1F4D6; เนื้อหาบทเรียน</h2>' +
      '<div class="card" style="min-height: 300px; display:flex; flex-direction:column; justify-content:center; align-items:center;">' +
        '<div style="font-size:64px; margin-bottom:16px;">' + this.bear + '</div>' +
        '<p style="font-size:16px; color:var(--duo-text-light); text-align:center;">เนื้อหาส่วนนี้รอคุณครูเพิ่มข้อมูลอยู่นะครับ!</p>' +
      '</div>' +
    '</div>';
  },

  viewQuiz: function() {
    var qState = this.state.quiz;
    if (qState.questions.length === 0) {
      return '<div class="loader">' +
        '<div class="loader-bear">' + this.bear + '</div>' +
        '<div class="loader-text">ยังไม่มีข้อสอบในระบบ</div>' +
        '<button class="btn btn-outline" style="width:auto; padding:12px 24px; margin-top:16px;" onclick="App.navigate(\'dashboard\')">กลับหน้าหลัก</button>' +
      '</div>';
    }
    if (qState.currentIndex >= qState.questions.length) {
      var stars = qState.score >= qState.questions.length ? '&#x2B50;&#x2B50;&#x2B50;' :
                  qState.score >= qState.questions.length * 0.5 ? '&#x2B50;&#x2B50;' : '&#x2B50;';
      var msg = qState.score === qState.questions.length ? 'เก่งมากเลย! พี่หมีน้อยภูมิใจจัง!' :
                qState.score >= qState.questions.length * 0.5 ? 'ดีมากเลย! ทำต่อไปนะ!' : 'พยายามอีกนิด พี่หมีน้อยเชื่อในตัวเธอ!';
      var extraNote = '';
      var nextModBtn = '';
      if (qState.moduleId === 'Daily') {
        extraNote = '<div style="font-size:12px; color:var(--duo-text-light); margin-top:8px;">* Daily Quest จะได้ XP แค่วันละ 1 ครั้ง ทำซ้ำเพื่อทบทวนได้แต่ไม่ได้คะแนนเพิ่ม</div>';
      } else if (qState.quizType) {
        extraNote = '<div style="font-size:12px; color:var(--duo-text-light); margin-top:8px;">* แต่ละพาร์ทจะได้ XP เฉพาะครั้งแรกที่ทำ ทำซ้ำได้เพื่อทบทวน</div>';
      } else {
        var nextMid = Number(qState.moduleId) + 1;
        if (nextMid <= 6) {
          nextModBtn = '<button class="btn btn-primary" style="margin-bottom:8px; background-color:var(--duo-blue); border-color:var(--duo-blue-shadow);" onclick="App.navigate(\'moduleDetail\', ' + nextMid + ')">ไปบทเรียนถัดไป (โมดูล ' + nextMid + ') &#x27A1;</button>';
        }
      }

      return '<div class="page-content" style="display:flex; flex-direction:column; justify-content:center; align-items:center;">' +
        '<div class="mascot-bounce" style="font-size:80px; margin-bottom:16px;">' + this.bear + '</div>' +
        '<div style="font-size:36px; margin-bottom:8px;">' + stars + '</div>' +
        '<h2 class="text-title" style="color:var(--bear-brown);">จบแล้ว!</h2>' +
        '<p style="font-size:14px; color:var(--duo-text-light); text-align:center;">' + msg + '</p>' +
        '<div class="card" style="width:100%; text-align:center; margin: 20px 0;">' +
          '<p style="font-size:18px; font-weight:800; color:var(--duo-text); margin:0 0 8px 0;">คะแนน: ' + qState.score + ' / ' + qState.questions.length + '</p>' +
          (!qState.submitted
            ? '<div style="font-size:15px; font-weight:800; color:var(--clay-text-light);">กำลังบันทึก... ⏳</div>'
            : (qState.alreadyDone
                ? '<div style="font-size:18px; font-weight:800; color:var(--clay-text-light);">+0 XP</div><div style="font-size:12px; color:var(--clay-purple-shadow); font-weight:700; margin-top:4px;">✓ เคยรับ XP จากชุดนี้แล้ว</div>'
                : '<div style="font-size:22px; font-weight:800; color:var(--bear-orange);">+' + qState.awarded + ' XP</div>')) +
          extraNote +
        '</div>' +
        nextModBtn +
        '<button class="btn btn-primary" style="margin-bottom:8px;" onclick="App.navigate(\'lessons\')">กลับหน้ารวมบทเรียน</button>' +
        '<button class="btn btn-outline" onclick="App.navigate(\'dashboard\')">หน้าหลัก</button>' +
      '</div>';
    }

    var q = qState.questions[qState.currentIndex];
    var progressPct = (qState.currentIndex / qState.questions.length) * 100;

    // Create a copy of options and shuffle them
    var shuffledOptions = q.options.slice();
    for (var i = shuffledOptions.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = shuffledOptions[i];
      shuffledOptions[i] = shuffledOptions[j];
      shuffledOptions[j] = temp;
    }

    // Keep the shuffled order on the question so answerQuiz can resolve the
    // chosen option by index — avoids fragile string-escaping in the onclick
    // attribute (a quote/newline/HTML in an option used to break answering).
    q._shuffled = shuffledOptions;
    var optionsHtml = '';
    for (var i = 0; i < shuffledOptions.length; i++) {
      optionsHtml += '<button class="btn quiz-option" onclick="App.answerQuiz(this, ' + i + ')">' + App.esc(shuffledOptions[i]) + '</button>';
    }

    // Context box for conversation/reading questions
    var contextHtml = '';
    if (q.context) {
      var formattedCtx = App.esc(q.context).replace(/\n/g, '<br>');
      // Highlight the specific blank being asked about e.g. (4) → highlight ___(4)___
      var blankMatch = q.text.match(/\((\d+)\)/);
      if (blankMatch) {
        var blankNum = blankMatch[1];
        formattedCtx = formattedCtx.replace(
          new RegExp('___\\(' + blankNum + '\\)___', 'g'),
          '<span style="background:#FFE082;padding:2px 6px;border-radius:6px;font-weight:800;color:#7B5800;">___(' + blankNum + ')___</span>'
        );
      }
      contextHtml = '<div style="background:linear-gradient(145deg,#F0F8FF,#E3F2FD); border-radius:18px; border-left:4px solid var(--clay-blue); padding:14px 16px; margin-bottom:16px; font-size:13px; color:var(--clay-text); line-height:1.7; box-shadow:0 4px 0 rgba(60,130,220,0.1);">' + formattedCtx + '</div>';
    }

    // Quiz type label
    var typeLabel = '';
    if (qState.quizType === 'PreTest') typeLabel = '<span style="background:linear-gradient(135deg,#FFE0E0,#FFD0D0); color:#b03030; font-size:11px; font-weight:800; padding:4px 10px; border-radius:10px; margin-bottom:12px; display:inline-block;">📋 Pre-Test</span>';
    else if (qState.quizType === 'PostTest') typeLabel = '<span style="background:linear-gradient(135deg,#F3E5F5,#E1BEE7); color:var(--clay-purple-shadow); font-size:11px; font-weight:800; padding:4px 10px; border-radius:10px; margin-bottom:12px; display:inline-block;">🎓 Post-Test</span>';
    else if (qState.quizType === 'Activity') typeLabel = '<span style="background:linear-gradient(135deg,#E8F5E9,#C8E6C9); color:var(--clay-green-shadow); font-size:11px; font-weight:800; padding:4px 10px; border-radius:10px; margin-bottom:12px; display:inline-block;">✏️ Activity</span>';

    return '<div class="page-content" style="padding-top: 16px; padding-bottom:100px; display:flex; flex-direction:column;">' +
      '<div style="display:flex; align-items:center; gap:12px; margin-bottom: 16px;">' +
        '<button onclick="App.navigate(\'lessons\')" style="background:none; border:none; font-size:22px; color:var(--duo-gray-shadow); font-weight:800; cursor:pointer;">&#x2715;</button>' +
        '<div class="progress-bar-container" style="margin:0; flex:1;"><div class="progress-bar-fill" style="width: ' + progressPct + '%; background-color:var(--duo-green);"></div></div>' +
        '<span style="font-size:13px; font-weight:700; color:var(--duo-text-light);">' + (qState.currentIndex + 1) + '/' + qState.questions.length + '</span>' +
      '</div>' +
      typeLabel +
      contextHtml +
      '<div style="display:flex; gap:12px; align-items:flex-start; margin-bottom: 16px;">' +
        '<div style="font-size:48px; flex-shrink:0;">' + this.bear + '</div>' +
        '<div class="speech-bubble" style="flex:1; font-size:15px; font-weight:600; line-height:1.5; white-space:pre-line;">' + App.esc(q.text) + '</div>' +
      '</div>' +
      '<div id="quiz-options">' + optionsHtml + '</div>' +
    '</div>' +
    '<div id="quiz-footer" style="position:absolute; bottom:0; left:0; width:100%; background:white; border-top:2px solid var(--duo-gray); padding:16px; box-sizing:border-box; display:flex; flex-direction:column; justify-content:center;">' +
      '<div id="quiz-feedback" style="display:none; margin-bottom:12px;"></div>' +
      '<button id="quiz-next-btn" class="btn btn-primary" style="margin:0;" disabled>Check</button>' +
    '</div>';
  },

  viewFlashcards: function() {
    var fState = this.state.flashcards;
    if (fState.cards.length === 0) return '<div class="loader"><div style="font-size:48px;">' + this.bear + '</div><div class="loader-text">กำลังเตรียมคำศัพท์...</div></div>';
    if (fState.currentIndex >= fState.cards.length) {
      return '<div class="page-content" style="display:flex; flex-direction:column; justify-content:center; align-items:center;">' +
        '<div class="mascot-bounce" style="font-size:80px; margin-bottom:16px;">' + this.bear + '</div>' +
        '<h2 class="text-title" style="color:var(--duo-blue-shadow);">ท่องศัพท์ครบแล้ว!</h2>' +
        '<p style="font-size:14px; color:var(--duo-text-light);">เก่งมาก! ทบทวนคำศัพท์ได้ทุกเมื่อเลยนะ!</p>' +
        '<div class="card" style="width:100%; text-align:center; margin: 20px 0;">' +
          (!fState.submitted
            ? '<div style="font-size:15px; font-weight:800; color:var(--clay-text-light);">กำลังบันทึก... ⏳</div>'
            : (fState.alreadyDone
                ? '<div style="font-size:18px; font-weight:800; color:var(--clay-text-light);">+0 XP</div><div style="font-size:12px; color:var(--clay-blue-shadow); font-weight:700; margin-top:4px;">✓ เคยรับ XP จากชุดคำศัพท์นี้แล้ว · ทบทวนได้ไม่จำกัด</div>'
                : '<div style="font-size:22px; font-weight:800; color:var(--bear-orange);">+' + fState.awarded + ' XP</div>')) +
        '</div>' +
        '<button class="btn btn-primary" onclick="App.navigate(\'lessons\')">กลับหน้าบทเรียน</button>' +
      '</div>';
    }

    var card = fState.cards[fState.currentIndex];
    var progressPct = (fState.currentIndex / fState.cards.length) * 100;

    return '<div class="page-content" style="padding-top: 16px; padding-bottom:100px; display:flex; flex-direction:column; flex:1;">' +
      '<div style="display:flex; align-items:center; gap:12px; margin-bottom: 20px;">' +
        '<button onclick="App.navigate(\'lessons\')" style="background:none; border:none; font-size:22px; color:var(--duo-gray-shadow); font-weight:800; cursor:pointer;">&#x2715;</button>' +
        '<div class="progress-bar-container" style="margin:0; flex:1;"><div class="progress-bar-fill" style="width: ' + progressPct + '%; background-color:var(--duo-blue);"></div></div>' +
        '<span style="font-size:13px; font-weight:700; color:var(--duo-text-light);">' + (fState.currentIndex + 1) + '/' + fState.cards.length + '</span>' +
      '</div>' +
      '<div style="display:flex; align-items:center; gap:8px; margin-bottom:16px;"><div style="font-size:28px;">' + this.bear + '</div><h2 class="text-title" style="margin:0; font-size:18px;">คำศัพท์ใหม่</h2></div>' +
      '<div class="card" style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; cursor:pointer; border-bottom: 5px solid var(--duo-gray-shadow); min-height:200px;" onclick="document.getElementById(\'fc-meaning\').style.display=\'block\'; document.getElementById(\'fc-front\').style.display=\'none\';">' +
        '<div id="fc-front">' +
          '<h1 style="font-size: 32px; color: var(--bear-brown); margin-bottom: 8px; font-weight:800;">' + card.vocab + '</h1>' +
          '<div style="font-size:14px; color:var(--duo-text-light); font-weight:700;">' + card.pronun + '</div>' +
          '<p style="font-size: 14px; color: var(--duo-blue); font-weight:800; margin-top: 24px;">&#x1F43E; แตะเพื่อดูความหมาย</p>' +
        '</div>' +
        '<div id="fc-meaning" style="display:none;">' +
          '<p style="font-size: 28px; font-weight:800; color:var(--duo-blue); margin-bottom:12px; margin-top:0;">' + card.meaning + '</p>' +
          '<p style="font-size: 14px; color: var(--duo-text-light); font-weight:600; line-height:1.5;">"' + card.example + '"</p>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div style="position:absolute; bottom:0; left:0; width:100%; background:white; border-top:2px solid var(--duo-gray); padding:16px; box-sizing:border-box; display:flex; gap:10px;">' +
      '<button class="btn btn-outline" style="margin:0; color:var(--duo-red); font-size:13px;" onclick="App.nextFlashcard()">ยังจำไม่ได้</button>' +
      '<button class="btn btn-secondary" style="margin:0; font-size:13px;" onclick="App.nextFlashcard()">จำได้แล้ว!</button>' +
    '</div>';
  },

  setLeaderboardFilter: function(val) {
    this.state.leaderboardFilter = val || '';
    this.state.leaderboardSearch = '';
    this.navigate('leaderboard');
  },

  lbSearchInput: function(val) {
    this.state.leaderboardSearch = val || '';
    this._updateLbSuggestions(val);
    this._updateLbList(val);
  },

  lbSelectSuggestion: function(name) {
    this.state.leaderboardSearch = name;
    var inp = document.getElementById('lb-search-input');
    if (inp) inp.value = name;
    this._updateLbSuggestions('');
    this._updateLbList(name);
  },

  _updateLbSuggestions: function(val) {
    var el = document.getElementById('lb-suggestions');
    if (!el) return;
    var q = (val || '').trim().toLowerCase();
    if (!q) { el.innerHTML = ''; el.style.display = 'none'; return; }
    var lb = this.state.leaderboard || [];
    var myId = this.state.user ? this.state.user.UserID : null;
    var matches = lb.filter(function(s) {
      return s.name && s.name.toLowerCase().indexOf(q) !== -1;
    }).slice(0, 6);
    if (!matches.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
    var safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    el.style.display = 'block';
    el.innerHTML = matches.map(function(s, i) {
      var hi = App.esc(s.name).replace(new RegExp('(' + safe + ')', 'gi'), '<b style="color:var(--clay-purple-shadow);">$1</b>');
      var av = s.profileImage
        ? '<img src="' + s.profileImage + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">'
        : '<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#EDE9F7,#DDD4EF);display:flex;align-items:center;justify-content:center;font-size:14px;">👤</div>';
      var isMe = myId && s.id === myId;
      return '<div onclick="App.lbSelectSuggestion(\'' + App.esc(s.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'")) + '\')" style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(0,0,0,0.05);background:' + (i % 2 === 0 ? 'white' : '#FAFAFA') + ';" onmouseenter="this.style.background=\'#F3EEFF\'" onmouseleave="this.style.background=\'' + (i % 2 === 0 ? 'white' : '#FAFAFA') + '\'">' +
        av +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:13px;font-weight:700;color:var(--clay-text);">' + hi + (isMe ? ' <span style="color:var(--bear-orange);font-size:11px;">(คุณ)</span>' : '') + '</div>' +
          '<div style="font-size:11px;color:var(--clay-text-light);">' + (s.className || '-') + ' · ' + s.xp + ' XP</div>' +
        '</div>' +
        '<div style="font-size:11px;font-weight:800;color:var(--clay-text-light);">#' + (lb.indexOf(s) + 1) + '</div>' +
      '</div>';
    }).join('');
  },

  _buildLbListHtml: function(filtered, allLb) {
    var self = this;
    var myId = this.state.user ? this.state.user.UserID : null;
    if (!filtered.length) return '<p class="text-center" style="font-weight:bold; color:var(--clay-text-light); padding:20px 0;">ไม่พบชื่อที่ค้นหา</p>';
    return filtered.map(function(s) {
      var rank = allLb.indexOf(s);
      var medal = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : '<span style="font-weight:800;font-size:15px;color:var(--clay-text-light);">' + (rank + 1) + '</span>';
      var av = s.profileImage ? '<img src="' + s.profileImage + '" style="width:44px;height:44px;border-radius:50%;object-fit:cover;box-shadow:0 3px 0 rgba(0,0,0,0.1);">' : '<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#EDE9F7,#DDD4EF);display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 3px 0 rgba(150,100,200,0.2);">👤</div>';
      var isMe = myId && s.id === myId;
      var itemStyle = isMe
        ? 'background:linear-gradient(145deg,#FFF3E0,#FFE8CC); border-radius:20px; box-shadow:0 5px 0 rgba(200,140,80,0.2),0 8px 16px rgba(200,140,80,0.10); padding:12px 14px; margin-bottom:8px; border:2px solid var(--bear-orange);'
        : 'background:var(--clay-white); border-radius:18px; box-shadow:0 4px 0 rgba(150,100,200,0.12),0 6px 12px rgba(150,100,200,0.08); padding:10px 14px; margin-bottom:8px;';
      return '<div onclick="App.navigate(\'userProfile\',\'' + s.id + '\')" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;' + itemStyle + '">' +
        '<div style="display:flex;align-items:center;gap:12px;min-width:0;">' +
          '<div style="width:28px;text-align:center;font-size:20px;flex-shrink:0;">' + medal + '</div>' + av +
          '<div style="min-width:0;"><div style="font-weight:700;font-size:14px;color:var(--clay-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + App.esc(s.name) + (isMe ? ' <span style="color:var(--bear-orange);font-size:11px;">(คุณ)</span>' : '') + '</div>' +
            '<div style="font-size:12px;color:var(--clay-text-light);">' + (s.className || '-') + '</div></div>' +
        '</div>' +
        '<div style="background:linear-gradient(135deg,#FF8C42,#C084FC);border-radius:12px;padding:6px 12px;font-weight:800;color:white;font-size:13px;box-shadow:0 3px 0 rgba(160,80,200,0.2);flex-shrink:0;">' + s.xp + ' XP</div>' +
      '</div>';
    }).join('');
  },

  _updateLbList: function(val) {
    var el = document.getElementById('lb-list');
    if (!el) return;
    var lb = this.state.leaderboard || [];
    var cur = this.state.leaderboardFilter || '';
    var q = (val || '').trim().toLowerCase();
    var filtered = q ? lb.filter(function(s){ return s.name && s.name.toLowerCase().indexOf(q) !== -1; }) : lb;
    el.innerHTML = this._buildLbListHtml(filtered, lb);
    var countEl = document.getElementById('lb-count');
    if (countEl) {
      countEl.textContent = q
        ? (filtered.length + ' จาก ' + lb.length + ' คน')
        : (lb.length + ' คน' + (cur ? ' · ' + cur : ' · ทั้งระดับ'));
    }
  },

  viewLeaderboard: function() {
    var lb = this.state.leaderboard;
    var cur = this.state.leaderboardFilter || '';
    var searchVal = this.state.leaderboardSearch || '';

    // Filter by search (client-side)
    var q = searchVal.trim().toLowerCase();
    var filtered = q ? lb.filter(function(s){ return s.name && s.name.toLowerCase().indexOf(q) !== -1; }) : lb;
    var listHtml = this._buildLbListHtml(filtered, lb);

    // Class filter dropdown
    var optionsHtml = '<option value=""' + (cur === '' ? ' selected' : '') + '>🌐 ทั้งระดับ (ทุกห้อง)</option>';
    var classes = this.state.leaderboardClasses || [];
    for (var c = 0; c < classes.length; c++) {
      optionsHtml += '<option value="' + classes[c] + '"' + (cur === classes[c] ? ' selected' : '') + '>🏫 ' + classes[c] + '</option>';
    }

    var countLabel = q
      ? (filtered.length + ' จาก ' + lb.length + ' คน')
      : (lb.length + ' คน' + (cur ? ' · ' + cur : ' · ทั้งระดับ'));

    return '<div class="page-content" style="padding:0;">' +
      '<div style="background:linear-gradient(135deg,#FF8C42,#C084FC); border-radius:0 0 28px 28px; padding:20px; box-shadow:0 8px 0 rgba(160,80,200,0.2),0 14px 28px rgba(160,80,200,0.15); margin-bottom:16px;">' +
        // Header row
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">' +
          '<div style="display:flex; align-items:center; gap:10px;">' +
            '<div style="font-size:32px; filter:drop-shadow(0 4px 0 rgba(0,0,0,0.15));">' + this.bear + '</div>' +
            '<div><div style="font-size:20px; font-weight:800; color:white;">🏆 Leaderboard</div>' +
            '<div id="lb-count" style="font-size:12px; color:rgba(255,255,255,0.85);">' + countLabel + '</div></div>' +
          '</div>' +
          '<button onclick="App.navigate(\'dashboard\')" style="background:rgba(255,255,255,0.25); border:none; width:36px; height:36px; border-radius:50%; font-size:18px; cursor:pointer; color:white; display:flex; align-items:center; justify-content:center;">✕</button>' +
        '</div>' +
        // Search box (with suggestion dropdown)
        '<div style="position:relative; margin-bottom:10px;">' +
          '<div style="position:absolute; left:14px; top:50%; transform:translateY(-50%); font-size:16px; pointer-events:none;">🔍</div>' +
          '<input id="lb-search-input" type="search" autocomplete="off" placeholder="ค้นหาชื่อนักเรียน..." ' +
            'value="' + this.esc(searchVal) + '" ' +
            'oninput="App.lbSearchInput(this.value)" ' +
            'onfocus="App.lbSearchInput(this.value)" ' +
            'onblur="setTimeout(function(){var el=document.getElementById(\'lb-suggestions\');if(el)el.style.display=\'none\';},180)" ' +
            'style="width:100%; padding:12px 16px 12px 40px; border:none; border-radius:16px; font-family:var(--font-main); font-weight:600; font-size:14px; color:var(--clay-text); background:rgba(255,255,255,0.95); box-shadow:inset 0 2px 6px rgba(0,0,0,0.08); outline:none; box-sizing:border-box;" />' +
          // Clear button
          (searchVal ? '<button onclick="App.lbSearchInput(\'\');document.getElementById(\'lb-search-input\').value=\'\';" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.1);border:none;border-radius:50%;width:22px;height:22px;font-size:12px;cursor:pointer;color:var(--clay-text);display:flex;align-items:center;justify-content:center;padding:0;">✕</button>' : '') +
          // Suggestions dropdown
          '<div id="lb-suggestions" style="display:none; position:absolute; top:calc(100% + 6px); left:0; right:0; background:white; border-radius:16px; box-shadow:0 8px 24px rgba(0,0,0,0.18); z-index:200; overflow:hidden; max-height:260px; overflow-y:auto;"></div>' +
        '</div>' +
        // Class filter dropdown
        '<select onchange="App.setLeaderboardFilter(this.value)" style="width:100%; padding:12px 16px; border:none; border-radius:16px; font-family:var(--font-main); font-weight:700; font-size:14px; color:var(--clay-text); background:rgba(255,255,255,0.95); box-shadow:inset 0 2px 6px rgba(0,0,0,0.08); -webkit-appearance:none; appearance:none; cursor:pointer;">' + optionsHtml + '</select>' +
      '</div>' +
      '<div id="lb-list" style="padding:0 16px;">' + listHtml + '</div>' +
    '</div>';
  },

  /* ===== YOUTUBE VINYL HELPER ===== */

  extractYouTubeId: function(url) {
    if (!url) return null;
    var m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  },

  vinylHtml: function(youtubeUrl) {
    var vid = this.extractYouTubeId(youtubeUrl);
    if (!vid) return '';
    // Real (visible) YouTube player sits UNDER the spinning disc so the browser
    // allows muted autoplay. The disc artwork (opaque) covers the video.
    return '<div style="background:linear-gradient(145deg,#1a1a2e,#2d2d44); border-radius:24px; padding:18px 20px; margin-bottom:16px; box-shadow:0 8px 0 rgba(0,0,0,0.3),0 12px 24px rgba(0,0,0,0.2); display:flex; align-items:center; gap:18px; position:relative; overflow:hidden;">' +
      '<div style="position:absolute; inset:0; background:repeating-linear-gradient(45deg,rgba(255,255,255,0.01) 0px,rgba(255,255,255,0.01) 1px,transparent 1px,transparent 8px); pointer-events:none;"></div>' +
      '<div style="position:relative; width:90px; height:90px; flex-shrink:0; z-index:1;">' +
        // the actual player (covered by the disc above it)
        '<div style="position:absolute; inset:0; border-radius:50%; overflow:hidden; background:#000;"><div id="yt-player" data-vid="' + vid + '" style="width:90px; height:90px;"></div></div>' +
        // spinning vinyl artwork on top
        '<div id="vinyl-disc" onclick="App.vinylUnmute()" style="position:absolute; inset:0; border-radius:50%; background:repeating-conic-gradient(#111 0deg 12deg, #222 12deg 24deg); animation:vinylSpin 3s linear infinite; box-shadow:0 4px 12px rgba(0,0,0,0.5); cursor:pointer; z-index:2;">' +
          '<div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:32px; height:32px; border-radius:50%; background:linear-gradient(135deg,#FF8C42,#C084FC);">' +
            '<div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:8px; height:8px; border-radius:50%; background:#1a1a2e;"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div style="flex:1; min-width:0; z-index:1;">' +
        '<div style="color:white; font-weight:800; font-size:14px; margin-bottom:4px;">🎵 เพลงประจำโปรไฟล์</div>' +
        '<div style="color:rgba(255,255,255,0.6); font-size:12px; margin-bottom:12px;">เล่นอัตโนมัติ (ปิดเสียง)</div>' +
        '<button id="vinyl-mute-btn" onclick="App.vinylUnmute()" style="background:rgba(255,255,255,0.15); border:2px solid rgba(255,255,255,0.3); border-radius:10px; padding:6px 16px; color:white; font-size:12px; font-weight:800; cursor:pointer; font-family:var(--font-main);">🔇 แตะเพื่อเปิดเสียง</button>' +
      '</div>' +
    '</div>';
  },

  initVinyl: function() {
    var el = document.getElementById('yt-player');
    if (!el) { this.ytPlayer = null; return; }
    var vid = el.getAttribute('data-vid');
    if (!vid) return;
    var self = this;
    var make = function() {
      try { if (self.ytPlayer && self.ytPlayer.destroy) self.ytPlayer.destroy(); } catch (_) {}
      self.ytPlayer = new YT.Player('yt-player', {
        width: '90', height: '90', videoId: vid,
        playerVars: { autoplay: 1, mute: 1, loop: 1, playlist: vid, controls: 0, playsinline: 1, modestbranding: 1, rel: 0, disablekb: 1, fs: 0 },
        events: {
          onReady: function(e) { try { e.target.mute(); e.target.playVideo(); } catch (_) {} },
          onStateChange: function(e) { if (e.data === YT.PlayerState.ENDED) { try { e.target.seekTo(0); e.target.playVideo(); } catch (_) {} } }
        }
      });
    };
    if (window.YT && window.YT.Player) { make(); return; }
    // Load the IFrame API once, then build the player when ready
    if (!document.getElementById('yt-iframe-api')) {
      var tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
    var tries = 0;
    var iv = setInterval(function() {
      tries++;
      if (window.YT && window.YT.Player) { clearInterval(iv); if (document.getElementById('yt-player')) make(); }
      else if (tries > 60) { clearInterval(iv); }
    }, 150);
  },

  vinylUnmute: function() {
    var btn = document.getElementById('vinyl-mute-btn');
    var p = this.ytPlayer;
    if (!p) return;
    try {
      if (p.isMuted && !p.isMuted()) {
        // already unmuted → toggle back to muted
        p.mute();
        if (btn) { btn.textContent = '🔇 แตะเพื่อเปิดเสียง'; btn.style.background = 'rgba(255,255,255,0.15)'; btn.style.borderColor = 'rgba(255,255,255,0.3)'; }
        return;
      }
      p.unMute();
      p.setVolume(70);
      p.playVideo();
      if (btn) { btn.textContent = '🔊 กำลังเล่น'; btn.style.background = 'rgba(255,140,66,0.3)'; btn.style.borderColor = '#FF8C42'; }
    } catch (_) {}
  },

  /* ===== FRIEND PROFILE VIEW ===== */

  viewUserProfile: function() {
    var data = this.state.viewingUser;
    if (!data) return '<div class="loader"><div class="loader-bear">' + this.bear + '</div><div class="loader-text">กำลังโหลดโปรไฟล์...</div></div>' + this.bottomNav('story');
    if (data.error) return '<div class="page-content"><button onclick="App.navigate(\'feed\')" style="background:none;border:none;font-size:18px;color:var(--clay-text-light);cursor:pointer;padding:0;margin-bottom:16px;font-weight:700;">&#x2190; กลับ</button><div class="card" style="text-align:center;padding:32px;"><div style="font-size:48px;margin-bottom:12px;">' + this.bear + '</div><div style="font-weight:800;font-size:16px;color:var(--clay-text);">ไม่พบข้อมูลผู้ใช้</div><div style="font-size:13px;color:var(--clay-text-light);margin-top:8px;">อาจเกิดข้อผิดพลาดหรือผู้ใช้ถูกลบออกแล้ว</div></div></div>' + this.bottomNav('story');
    var u = data.user;
    var st = data.stats;
    var lv = this.levelInfo(u.xp);
    var avatar = u.profileImage
      ? '<img src="' + u.profileImage + '" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">'
      : '<div style="display:flex;justify-content:center;align-items:center;width:100%;height:100%;font-size:44px;">' + this.bear + '</div>';
    var isMe = this.state.user && this.state.user.UserID === u.id;
    return '<div class="page-content">' +
      '<button onclick="App.navigate(\'feed\')" style="background:none; border:none; font-size:18px; color:var(--clay-text-light); cursor:pointer; padding:0; margin-bottom:16px; font-weight:700;">&#x2190; กลับ</button>' +
      '<div style="background:linear-gradient(135deg,#5BA4F5,#C084FC); border-radius:28px; padding:24px; margin-bottom:16px; text-align:center; box-shadow:0 8px 0 rgba(90,140,200,0.2),0 14px 28px rgba(90,140,200,0.15);">' +
        '<div style="position:relative; width:90px; height:90px; margin:0 auto 12px;">' +
          '<div style="width:90px; height:90px; border-radius:50%; overflow:hidden; border:4px solid white; box-shadow:0 4px 12px rgba(0,0,0,0.2);">' + avatar + '</div>' +
          '<div style="position:absolute; bottom:-2px; right:-2px; width:34px; height:34px; border-radius:50%; background:white; display:flex; align-items:center; justify-content:center; font-size:18px; box-shadow:0 3px 8px rgba(0,0,0,0.2);">' + lv.emoji + '</div>' +
        '</div>' +
        '<div style="font-weight:800; font-size:22px; color:white;">' + this.esc(u.firstName) + ' ' + this.esc(u.lastName) + (u.nickname ? ' <span style="font-size:15px; opacity:0.9;">(' + this.esc(u.nickname) + ')</span>' : '') + '</div>' +
        '<div style="font-size:13px; color:rgba(255,255,255,0.85); margin-top:4px;">' + this.esc(u.className || '-') + '</div>' +
        (u.motto ? '<div style="font-size:13px; color:white; margin-top:8px; font-style:italic;">💬 "' + this.esc(u.motto) + '"</div>' : '') +
        (isMe ? '<button onclick="App.openProfileEdit()" style="margin-top:12px; background:rgba(255,255,255,0.95); border:none; border-radius:14px; padding:8px 18px; font-family:var(--font-main); font-weight:800; font-size:13px; color:var(--clay-purple-shadow); cursor:pointer;">✏️ แก้ไขโปรไฟล์ฉัน</button>' : '') +
      '</div>' +
      // Vinyl player (if they have music)
      this.vinylHtml(u.youtubeUrl) +
      // Stats
      '<div class="card">' +
        '<div style="font-weight:800; font-size:15px; color:var(--clay-text); margin-bottom:12px;">📊 สถิติการเรียน</div>' +
        '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">' +
          '<div style="text-align:center; background:linear-gradient(145deg,#F8F3FF,#EEE8FF); border-radius:16px; padding:12px 6px;">' +
            '<div style="font-size:22px; font-weight:800; color:var(--clay-purple-shadow);">' + u.xp.toLocaleString() + '</div>' +
            '<div style="font-size:11px; color:var(--clay-text-light); font-weight:700;">XP</div>' +
          '</div>' +
          '<div style="text-align:center; background:linear-gradient(145deg,#FFF3E0,#FFE8CC); border-radius:16px; padding:12px 6px;">' +
            '<div style="font-size:22px; font-weight:800; color:var(--bear-orange-shadow);">🔥 ' + (u.streak || 0) + '</div>' +
            '<div style="font-size:11px; color:var(--clay-text-light); font-weight:700;">วันต่อเนื่อง</div>' +
          '</div>' +
          '<div style="text-align:center; background:linear-gradient(145deg,#E8FFF0,#D4F5E0); border-radius:16px; padding:12px 6px;">' +
            '<div style="font-size:22px; font-weight:800; color:var(--clay-green-shadow);">' + st.completedModules + '</div>' +
            '<div style="font-size:11px; color:var(--clay-text-light); font-weight:700;">Unit จบแล้ว</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      // Level
      '<div class="card">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
          '<div style="font-weight:800; font-size:15px; color:var(--clay-text);">' + lv.emoji + ' ' + lv.name + ' <span style="font-size:12px; color:var(--clay-text-light);">(' + lv.th + ')</span></div>' +
          '<div style="background:linear-gradient(135deg,#5BA4F5,#C084FC); border-radius:12px; padding:4px 12px; font-weight:800; color:white; font-size:13px;">' + u.xp.toLocaleString() + ' XP</div>' +
        '</div>' +
        '<div class="progress-bar-container"><div class="progress-bar-fill" style="width:' + lv.pct + '%;"></div></div>' +
      '</div>' +
      // About
      ((u.dream || u.targetGoal || u.bio)
        ? '<div class="card">' +
            '<div style="font-weight:800; font-size:15px; color:var(--clay-text); margin-bottom:10px;">💬 เกี่ยวกับเขา/เธอ</div>' +
            (u.targetGoal ? '<div style="display:flex; gap:8px; margin-bottom:8px;"><span>🎯</span><div style="font-size:13px; color:var(--clay-text);"><b>เป้าหมาย:</b> ' + this.esc(u.targetGoal) + '</div></div>' : '') +
            (u.dream ? '<div style="display:flex; gap:8px; margin-bottom:8px;"><span>🌈</span><div style="font-size:13px; color:var(--clay-text);"><b>ความฝัน:</b> ' + this.esc(u.dream) + '</div></div>' : '') +
            (u.bio ? '<div style="display:flex; gap:8px;"><span>📝</span><div style="font-size:13px; color:var(--clay-text-light); line-height:1.6;">' + this.esc(u.bio) + '</div></div>' : '') +
          '</div>'
        : '') +
      // Badges
      this.profileBadgesHtml({
        xp: u.xp,
        streak: u.streak || 0,
        completedModules: st.completedModules,
        placementDone: !!(data.english && data.english.placementDone),
        grammarPct: data.english ? (data.english.grammarPct || 0) : 0,
        vocabDone: data.english ? (data.english.vocabDone || false) : false,
        readingPct: data.english ? (data.english.readingPct || 0) : 0,
        totalEngExp: data.english ? (data.english.totalEngExp || 0) : 0,
        rank: data.rank || null
      }) +
    '</div>';
  },

  viewProfile: function() {
    var u = this.state.user;
    var d = this.state.dashboardData;
    var lv = this.levelInfo(d.xp);
    var avatar = u.ProfileImage
      ? '<img src="' + u.ProfileImage + '" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">'
      : '<div style="display:flex;justify-content:center;align-items:center;width:100%;height:100%;font-size:44px;">' + this.bear + '</div>';

    var nextLabel = lv.isMax
      ? '🏆 ระดับสูงสุดแล้ว!'
      : 'อีก ' + lv.toNext + ' XP → ' + lv.next.emoji + ' ' + lv.next.th;

    return '<div class="page-content">' +
      '<div style="background:linear-gradient(135deg,#FF8C42,#C084FC); border-radius:28px; padding:24px; margin-bottom:16px; text-align:center; box-shadow:0 8px 0 rgba(160,80,200,0.2),0 14px 28px rgba(160,80,200,0.15);">' +
        '<div style="position:relative; width:90px; height:90px; margin:0 auto 12px;">' +
          '<div style="width:90px; height:90px; border-radius:50%; overflow:hidden; border:4px solid white; box-shadow:0 4px 12px rgba(0,0,0,0.2);">' + avatar + '</div>' +
          '<div style="position:absolute; bottom:-2px; right:-2px; width:34px; height:34px; border-radius:50%; background:white; display:flex; align-items:center; justify-content:center; font-size:18px; box-shadow:0 3px 8px rgba(0,0,0,0.2);">' + lv.emoji + '</div>' +
        '</div>' +
        '<div style="font-weight:800; font-size:22px; color:white;">' + App.esc(u.FirstName) + ' ' + App.esc(u.LastName) + (u.Nickname ? ' <span style="font-size:15px; opacity:0.9;">(' + App.esc(u.Nickname) + ')</span>' : '') + '</div>' +
        '<div style="font-size:13px; color:rgba(255,255,255,0.85); margin-top:4px;">' + (u.Class || '-') + ' เลขที่ ' + (u.Number || '-') + '</div>' +
        (u.Motto ? '<div style="font-size:13px; color:white; margin-top:8px; font-style:italic;">💬 "' + this.esc(u.Motto) + '"</div>' : '') +
        '<button onclick="App.openProfileEdit()" style="margin-top:12px; background:rgba(255,255,255,0.95); border:none; border-radius:14px; padding:8px 18px; font-family:var(--font-main); font-weight:800; font-size:13px; color:var(--clay-purple-shadow); cursor:pointer; box-shadow:0 3px 0 rgba(0,0,0,0.12);">✏️ แก้ไขโปรไฟล์</button>' +
      '</div>' +
      // About me
      ((u.Dream || u.TargetGoal || u.Bio)
        ? '<div class="card">' +
            '<div style="font-weight:800; font-size:15px; color:var(--clay-text); margin-bottom:10px;">💬 เกี่ยวกับฉัน</div>' +
            (u.TargetGoal ? '<div style="display:flex; gap:8px; margin-bottom:8px;"><span>🎯</span><div style="font-size:13px; color:var(--clay-text);"><b>เป้าหมาย:</b> ' + this.esc(u.TargetGoal) + '</div></div>' : '') +
            (u.Dream ? '<div style="display:flex; gap:8px; margin-bottom:8px;"><span>🌈</span><div style="font-size:13px; color:var(--clay-text);"><b>ความฝัน:</b> ' + this.esc(u.Dream) + '</div></div>' : '') +
            (u.Bio ? '<div style="display:flex; gap:8px;"><span>📝</span><div style="font-size:13px; color:var(--clay-text-light); line-height:1.6;">' + this.esc(u.Bio) + '</div></div>' : '') +
          '</div>'
        : '<div class="card" style="text-align:center; background:linear-gradient(145deg,#F8F3FF,#EEE8FF);"><div style="font-size:13px; color:var(--clay-text-light);">ยังไม่ได้กรอกข้อมูลแนะนำตัว 🐾<br>กด "แก้ไขโปรไฟล์" เพื่อเพิ่มความฝันและเป้าหมายของคุณ!</div></div>') +
      // Vinyl music player (if set)
      this.vinylHtml(u.YoutubeUrl) +
      // Level card
      '<div class="card">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
          '<div style="font-weight:800; font-size:15px; color:var(--clay-text);">' + lv.emoji + ' ' + lv.name + ' <span style="font-size:12px; color:var(--clay-text-light); font-weight:600;">(' + lv.th + ')</span></div>' +
          '<div style="background:linear-gradient(135deg,#FF8C42,#C084FC); border-radius:12px; padding:4px 12px; font-weight:800; color:white; font-size:13px;">' + d.xp + ' XP</div>' +
        '</div>' +
        '<div class="progress-bar-container"><div class="progress-bar-fill" style="width:' + lv.pct + '%;"></div></div>' +
        '<div style="display:flex; justify-content:space-between; font-size:11px; color:var(--clay-text-light); margin-top:6px;">' +
          '<span>' + nextLabel + '</span><span>เป้าหมายสูงสุด ' + this.XP_MAX.toLocaleString() + ' XP</span>' +
        '</div>' +
      '</div>' +
      // Streak card
      '<div class="card" style="background:linear-gradient(145deg,#FFF3E0,#FFE0CC); box-shadow:0 6px 0 rgba(200,140,80,0.2),0 10px 20px rgba(200,140,80,0.10);">' +
        '<div style="display:flex; align-items:center; gap:14px;">' +
          '<div style="font-size:40px;">🔥</div>' +
          '<div style="flex:1;">' +
            '<div style="font-weight:800; font-size:18px; color:var(--bear-orange-shadow);">' + (d.streak || 0) + ' วันต่อเนื่อง</div>' +
            '<div style="font-size:12px; color:var(--clay-text-light); margin-top:2px;">เข้าเรียนทุกวันรับโบนัส XP (สูงสุด +50/วัน) 🎁</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      // Level ladder
      '<div class="card">' +
        '<div style="font-weight:800; font-size:15px; color:var(--clay-text); margin-bottom:12px;">🪜 เส้นทางระดับ</div>' +
        this.levelTiers.map(function(t, i){
          var reached = d.xp >= t.min;
          var isCur = i === lv.index;
          return '<div style="display:flex; align-items:center; gap:10px; padding:6px 0; opacity:' + (reached?'1':'0.45') + ';">' +
            '<div style="font-size:22px;">' + t.emoji + '</div>' +
            '<div style="flex:1; font-weight:' + (isCur?'800':'600') + '; font-size:13px; color:' + (isCur?'var(--clay-purple-shadow)':'var(--clay-text)') + ';">' + t.name + ' <span style="color:var(--clay-text-light); font-weight:600;">' + t.th + '</span></div>' +
            '<div style="font-size:11px; color:var(--clay-text-light);">' + t.min.toLocaleString() + '+ XP</div>' +
            (isCur ? '<div style="font-size:11px; font-weight:800; color:var(--bear-orange);">● ปัจจุบัน</div>' : (reached ? '<div style="color:var(--clay-green);">✓</div>' : '')) +
          '</div>';
        }).join('') +
      '</div>' +
      // English Level card
      (function(u, self) {
        var lv = u.EnglishLevel;
        var lvCols = { A1:'#4ECB71', A2:'#5BA4F5', B1:'#FF8C42', B2:'#C084FC' };
        var lvBg   = { A1:'#E8FFF0', A2:'#EEF4FF', B1:'#FFF3E0', B2:'#F5EEFF' };
        var col = lv ? (lvCols[lv] || '#5BA4F5') : '#5BA4F5';
        var bg  = lv ? (lvBg[lv]  || '#EEF4FF') : '#EEF4FF';
        return '<div class="card" style="background:' + bg + '; border-left:4px solid ' + col + '; box-shadow:none;">' +
          '<div style="display:flex; align-items:center; gap:12px;">' +
            '<div style="font-size:32px;">🎯</div>' +
            '<div style="flex:1;">' +
              '<div style="font-size:11px; font-weight:700; color:var(--clay-text-light); margin-bottom:2px;">ระดับภาษาอังกฤษ (CEFR)</div>' +
              (lv
                ? '<div style="font-weight:900; font-size:28px; color:' + col + '; line-height:1;">' + lv + '</div>'
                : '<div style="font-weight:700; font-size:13px; color:var(--clay-text-light);">ยังไม่ได้วัดระดับ</div>') +
            '</div>' +
            '<button onclick="App.navigate(\'placementTest\')" style="background:' + col + '; border:none; border-radius:12px; padding:8px 14px; font-family:var(--font-main); font-weight:800; font-size:12px; color:white; cursor:pointer;">' +
              (lv ? 'ทำใหม่' : 'วัดระดับ') +
            '</button>' +
          '</div>' +
        '</div>';
      })(u, this) +
      // Badges
      (function(self) {
        var ec = self.state.englishCourse;
        var sp = self.state.selfProfile;
        var engProg = ec.progress || {};
        var grammarPct = engProg['english_grammar']
          ? Math.round((engProg['english_grammar'].score / engProg['english_grammar'].maxScore) * 100) : 0;
        var readingPct = engProg['english_reading']
          ? Math.round((engProg['english_reading'].score / engProg['english_reading'].maxScore) * 100) : 0;
        return self.profileBadgesHtml({
          xp: d.xp,
          streak: d.streak || 0,
          completedModules: self.state.completedModules ? self.state.completedModules.length : 0,
          placementDone: !!(u.PlacementDone || (sp && sp.english && sp.english.placementDone)),
          grammarPct: sp ? (sp.english && sp.english.grammarPct || 0) : grammarPct,
          vocabDone:  sp ? !!(sp.english && sp.english.vocabDone) : !!engProg['english_vocab'],
          readingPct: sp ? (sp.english && sp.english.readingPct || 0) : readingPct,
          totalEngExp: ec.exp || 0,
          rank: sp ? (sp.rank || null) : null
        });
      })(this) +
      '<button class="btn btn-outline" onclick="App.navigate(\'guide\')">📖 คู่มือการใช้งาน</button>' +
      '<button class="btn btn-danger" onclick="App.logout()">ออกจากระบบ</button>' +
    '</div>';
  },

  /* ===== PROFILE EDIT + IMAGE CROPPER ===== */

  openProfileEdit: function() {
    this.state.editAvatar = null;
    this.state.cropperOpen = false;
    this.state.cropper = null;
    this.navigate('profileEdit');
  },

  esc: function(v) { return (v == null ? '' : String(v)).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); },

  // <option> ห้องเรียน ม.6/1–ม.6/10 จากรายการกลางใน api.js
  // selected = ค่าปัจจุบัน (ถ้าไม่ตรงมาตรฐานจะไม่มีอันไหนถูกเลือก)
  classOptionsHtml: function(selected) {
    var cur = api.normalizeClassName(selected) || selected || '';
    return api.CLASS_OPTIONS.map(function(c) {
      return '<option value="' + c + '"' + (c === cur ? ' selected' : '') + '>' + c + '</option>';
    }).join('');
  },
  fieldLabel: function(t) { return '<div style="font-size:12px; font-weight:700; color:var(--clay-text-light); margin:0 0 4px 2px;">' + t + '</div>'; },

  viewProfileEdit: function() {
    var u = this.state.user;
    var previewSrc = this.state.editAvatar || u.ProfileImage || '';
    var avatar = previewSrc
      ? '<img src="' + previewSrc + '" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">'
      : '<div style="display:flex;justify-content:center;align-items:center;width:100%;height:100%;font-size:44px;">' + this.bear + '</div>';

    return '<div class="page-content">' +
      '<button onclick="App.navigate(\'profile\')" style="background:none; border:none; font-size:18px; color:var(--clay-text-light); cursor:pointer; padding:0; margin-bottom:16px; font-weight:700;">&#x2190; กลับ</button>' +
      '<h2 class="text-title" style="color:var(--bear-brown); margin-top:0;">✏️ แก้ไขโปรไฟล์</h2>' +
      // avatar + change photo
      '<div class="card" style="text-align:center;">' +
        '<div style="width:110px; height:110px; margin:0 auto 12px; border-radius:50%; overflow:hidden; border:4px solid var(--clay-purple); box-shadow:0 4px 12px rgba(160,80,200,0.2);">' + avatar + '</div>' +
        '<input type="file" id="avatar-file" accept="image/*" style="display:none;" onchange="App.onAvatarFileChosen(this)">' +
        '<button class="btn btn-secondary" style="width:auto; padding:10px 20px; margin:0;" onclick="document.getElementById(\'avatar-file\').click()">📷 เลือก/เปลี่ยนรูป</button>' +
        (this.state.editAvatar ? '<div style="font-size:12px; color:var(--clay-green-shadow); font-weight:700; margin-top:8px;">✓ ครอปรูปใหม่แล้ว — กดบันทึกเพื่อใช้งาน</div>' : '') +
      '</div>' +
      // basic info
      '<div class="card">' +
        '<div style="font-weight:800; font-size:14px; color:var(--clay-text); margin-bottom:10px;">📋 ข้อมูลพื้นฐาน</div>' +
        this.fieldLabel('ชื่อ') +
        '<input id="edit-firstname" class="input-field" value="' + this.esc(u.FirstName) + '" placeholder="ชื่อ">' +
        this.fieldLabel('นามสกุล') +
        '<input id="edit-lastname" class="input-field" value="' + this.esc(u.LastName) + '" placeholder="นามสกุล">' +
        this.fieldLabel('ชื่อเล่น') +
        '<input id="edit-nickname" class="input-field" value="' + this.esc(u.Nickname) + '" placeholder="เช่น กฤษณ์">' +
        '<div style="display:flex; gap:10px;">' +
          '<div style="flex:1;">' + this.fieldLabel('ห้องเรียน') +
            '<select id="edit-class" class="input-field" style="margin-bottom:0;">' +
              '<option value="">-- เลือกห้อง --</option>' +
              this.classOptionsHtml(u.Class) +
            '</select>' +
          '</div>' +
          '<div style="width:96px;">' + this.fieldLabel('เลขที่') + '<input id="edit-number" type="number" class="input-field" style="margin-bottom:0;" value="' + this.esc(u.Number) + '" placeholder="เลขที่"></div>' +
        '</div>' +
      '</div>' +
      // about me
      '<div class="card">' +
        '<div style="font-weight:800; font-size:14px; color:var(--clay-text); margin-bottom:10px;">💬 เกี่ยวกับฉัน</div>' +
        this.fieldLabel('คติประจำตัว') +
        '<input id="edit-motto" class="input-field" value="' + this.esc(u.Motto) + '" placeholder="เช่น Practice makes perfect">' +
        this.fieldLabel('ความฝันในอนาคต') +
        '<input id="edit-dream" class="input-field" value="' + this.esc(u.Dream) + '" placeholder="เช่น อยากเป็นล่าม / วิศวกร">' +
        this.fieldLabel('เป้าหมายคะแนน (TOEIC / TGAT / A-Level)') +
        '<input id="edit-target" class="input-field" value="' + this.esc(u.TargetGoal) + '" placeholder="เช่น A-Level อังกฤษ 80+">' +
        this.fieldLabel('แนะนำตัวสั้นๆ') +
        '<textarea id="edit-bio" class="input-field" style="min-height:70px; resize:vertical;" placeholder="เล่าเกี่ยวกับตัวเองสั้นๆ">' + this.esc(u.Bio) + '</textarea>' +
      '</div>' +
      // Music
      '<div class="card">' +
        '<div style="font-weight:800; font-size:14px; color:var(--clay-text); margin-bottom:10px;">🎵 เพลงประจำโปรไฟล์</div>' +
        this.fieldLabel('YouTube Link (วางลิงก์เพลงที่ต้องการ)') +
        '<input id="edit-youtube" class="input-field" style="margin-bottom:0;" value="' + this.esc(u.YoutubeUrl || '') + '" placeholder="เช่น https://youtu.be/xxxxx หรือ youtube.com/watch?v=xxxxx">' +
        '<div style="font-size:11px; color:var(--clay-text-light); margin-top:6px;">เพลงจะเล่นอัตโนมัติ (ปิดเสียง) เมื่อใครเข้าดูโปรไฟล์ของคุณ 🎧</div>' +
      '</div>' +
      '<div id="profile-save-status" style="text-align:center; font-size:13px; font-weight:700; margin-bottom:8px;"></div>' +
      '<button class="btn btn-primary" onclick="App.saveProfile()">💾 บันทึก</button>' +
      '<button class="btn btn-outline" onclick="App.navigate(\'profile\')">ยกเลิก</button>' +
      // cropper modal
      (this.state.cropperOpen ? this.viewCropperModal() : '') +
    '</div>';
  },

  viewCropperModal: function() {
    return '<div id="cropper-modal" style="position:absolute; inset:0; background:rgba(45,30,70,0.85); z-index:9000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px;">' +
      '<div style="color:white; font-weight:800; font-size:16px; margin-bottom:14px;">ครอปรูปโปรไฟล์ 🖼️</div>' +
      '<div id="crop-frame" style="position:relative; width:260px; height:260px; border-radius:50%; overflow:hidden; background:#000; box-shadow:0 0 0 4px white, 0 10px 30px rgba(0,0,0,0.4); touch-action:none; cursor:grab;">' +
        '<img id="crop-img" draggable="false" style="position:absolute; left:0; top:0; user-select:none; pointer-events:none; max-width:none;">' +
      '</div>' +
      '<div style="display:flex; align-items:center; gap:10px; width:260px; margin-top:16px;">' +
        '<span style="color:white; font-size:18px;">🔍</span>' +
        '<input id="crop-zoom" type="range" min="1" max="3" step="0.01" value="1" style="flex:1;" oninput="App.cropZoom(this.value)">' +
      '</div>' +
      '<div style="display:flex; gap:10px; margin-top:18px; width:260px;">' +
        '<button class="btn btn-outline" style="margin:0;" onclick="App.cropCancel()">ยกเลิก</button>' +
        '<button class="btn btn-primary" style="margin:0;" onclick="App.cropApply()">✓ ใช้รูปนี้</button>' +
      '</div>' +
    '</div>';
  },

  onAvatarFileChosen: function(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { alert('ไฟล์ใหญ่เกินไป (จำกัด 8MB)'); return; }
    var self = this;
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var FRAME = 260;
        var base = Math.max(FRAME / img.naturalWidth, FRAME / img.naturalHeight);
        self.state.cropper = {
          src: e.target.result, natW: img.naturalWidth, natH: img.naturalHeight,
          frame: FRAME, base: base, scale: base,
          x: (FRAME - img.naturalWidth * base) / 2,
          y: (FRAME - img.naturalHeight * base) / 2
        };
        self.state.cropperOpen = true;
        self.render(true);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  cropClamp: function() {
    var c = this.state.cropper; if (!c) return;
    var w = c.natW * c.scale, h = c.natH * c.scale;
    if (c.x > 0) c.x = 0;
    if (c.y > 0) c.y = 0;
    if (c.x < c.frame - w) c.x = c.frame - w;
    if (c.y < c.frame - h) c.y = c.frame - h;
  },

  cropApplyDom: function() {
    var c = this.state.cropper; if (!c) return;
    var img = document.getElementById('crop-img');
    if (img) { img.style.width = (c.natW * c.scale) + 'px'; img.style.height = (c.natH * c.scale) + 'px'; img.style.left = c.x + 'px'; img.style.top = c.y + 'px'; }
  },

  cropZoom: function(val) {
    var c = this.state.cropper; if (!c) return;
    var newScale = Math.max(c.base, parseFloat(val) * c.base);
    // keep frame center stable
    var cx = (c.frame / 2 - c.x) / c.scale, cy = (c.frame / 2 - c.y) / c.scale;
    c.scale = newScale;
    c.x = c.frame / 2 - cx * c.scale;
    c.y = c.frame / 2 - cy * c.scale;
    this.cropClamp(); this.cropApplyDom();
  },

  cropCancel: function() {
    this.state.cropperOpen = false; this.state.cropper = null;
    var f = document.getElementById('avatar-file'); if (f) f.value = '';
    this.render(true);
  },

  cropApply: function() {
    var c = this.state.cropper; if (!c) return;
    var out = 256;
    var canvas = document.createElement('canvas');
    canvas.width = out; canvas.height = out;
    var ctx = canvas.getContext('2d');
    var srcX = -c.x / c.scale, srcY = -c.y / c.scale, srcSize = c.frame / c.scale;
    var imgEl = document.getElementById('crop-img');
    var src = imgEl || (function(){ var im = new Image(); im.src = c.src; return im; })();
    ctx.drawImage(src, srcX, srcY, srcSize, srcSize, 0, 0, out, out);
    this.state.editAvatar = canvas.toDataURL('image/jpeg', 0.82);
    this.state.cropperOpen = false; this.state.cropper = null;
    this.render(true);
  },

  initCropper: function() {
    var self = this;
    var c = this.state.cropper; if (!c) return;
    var imgEl = document.getElementById('crop-img');
    if (imgEl && imgEl.getAttribute('src') !== c.src) imgEl.src = c.src;
    this.cropApplyDom();
    var frame = document.getElementById('crop-frame');
    if (!frame) return;
    var dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    var down = function(e) {
      dragging = true; frame.style.cursor = 'grabbing';
      var p = e.touches ? e.touches[0] : e;
      sx = p.clientX; sy = p.clientY; ox = c.x; oy = c.y;
    };
    var move = function(e) {
      if (!dragging) return;
      var p = e.touches ? e.touches[0] : e;
      c.x = ox + (p.clientX - sx); c.y = oy + (p.clientY - sy);
      self.cropClamp(); self.cropApplyDom();
      if (e.cancelable) e.preventDefault();
    };
    var up = function() { dragging = false; frame.style.cursor = 'grab'; };
    frame.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    frame.addEventListener('touchstart', down, { passive: true });
    frame.addEventListener('touchmove', move, { passive: false });
    frame.addEventListener('touchend', up);
  },

  saveProfile: function() {
    var self = this;
    var val = function(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var f = {
      firstName: val('edit-firstname'), lastName: val('edit-lastname'), nickname: val('edit-nickname'),
      className: val('edit-class'), number: val('edit-number'),
      motto: val('edit-motto'), dream: val('edit-dream'), targetGoal: val('edit-target'), bio: val('edit-bio'),
      youtubeUrl: val('edit-youtube')
    };
    var st = document.getElementById('profile-save-status');
    if (!f.firstName) { if (st) { st.style.color = 'var(--clay-red)'; st.innerText = 'กรุณากรอกชื่อ'; } return; }
    if (st) { st.style.color = 'var(--clay-text-light)'; st.innerText = 'กำลังบันทึก... ⏳'; }
    var newAvatar = this.state.editAvatar;

    var doneInfo = false, doneImg = !newAvatar;
    var finish = function() {
      if (!doneInfo || !doneImg) return;
      var u = self.state.user;
      u.FirstName = f.firstName; u.LastName = f.lastName; u.Nickname = f.nickname;
      u.Class = f.className; u.Number = f.number;
      u.Motto = f.motto; u.Dream = f.dream; u.TargetGoal = f.targetGoal; u.Bio = f.bio;
      u.YoutubeUrl = f.youtubeUrl;
      if (newAvatar) u.ProfileImage = newAvatar;
      localStorage.setItem('lms_user', JSON.stringify(u));
      self.state.editAvatar = null;
      self.toast('✅ บันทึกโปรไฟล์แล้ว');
      self.navigate('profile');
    };
    google.script.run.withSuccessHandler(function(res) {
      if (!res.success) { if (st) { st.style.color = 'var(--clay-red)'; st.innerText = res.message || 'บันทึกไม่สำเร็จ'; } return; }
      doneInfo = true; finish();
    }).withFailureHandler(function(e){ if(st){st.style.color='var(--clay-red)'; st.innerText='Error: '+e.message;} }).updateProfile(this.state.user.UserID, f);

    if (newAvatar) {
      google.script.run.withSuccessHandler(function(res) {
        if (!res.success) { if (st) { st.style.color = 'var(--clay-red)'; st.innerText = res.message || 'บันทึกรูปไม่สำเร็จ'; } return; }
        doneImg = true; finish();
      }).withFailureHandler(function(e){ if(st){st.style.color='var(--clay-red)'; st.innerText='Error: '+e.message;} }).uploadProfileImage(this.state.user.UserID, newAvatar);
    }
  },

  /* ===== BONUS QR VIEWS ===== */

  viewBonusQR: function() {
    var u = this.state.user;
    var b = this.state.bonusScore;
    var pct = b.total;
    var scoreColor = pct >= 80 ? '#4ECB71' : pct >= 50 ? '#FF8C42' : '#C084FC';

    var histHtml = '';
    if (b.history && b.history.length > 0) {
      for (var i = 0; i < Math.min(b.history.length, 5); i++) {
        var h = b.history[i];
        var dt = h.created_at ? new Date(h.created_at).toLocaleDateString('th-TH', { day:'numeric', month:'short' }) : '';
        histHtml += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(150,100,200,0.1);">' +
          '<span style="font-size:13px;color:var(--clay-text);">📅 ' + dt + '</span>' +
          '<span style="font-size:14px;font-weight:800;color:var(--clay-green-shadow);">+' + h.score + ' คะแนน</span>' +
        '</div>';
      }
    } else {
      histHtml = '<p style="font-size:13px;color:var(--clay-text-light);text-align:center;margin:8px 0;">ยังไม่เคยได้รับคะแนนพิเศษ</p>';
    }

    return '<div class="page-content">' +
      '<div style="background:linear-gradient(135deg,#C084FC,#5BA4F5);border-radius:28px;padding:20px;margin-bottom:16px;text-align:center;box-shadow:0 8px 0 rgba(100,80,200,0.2),0 14px 28px rgba(100,80,200,0.12);">' +
        '<div style="font-size:40px;margin-bottom:6px;">🎫</div>' +
        '<div style="font-size:18px;font-weight:800;color:white;">' + App.esc(u.FirstName) + ' ' + App.esc(u.LastName) + '</div>' +
        '<div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">' + App.esc(u.Class) + ' · เลขที่ ' + App.esc(u.Number) + '</div>' +
      '</div>' +

      // QR Code card
      '<div class="card" style="text-align:center;padding:24px;">' +
        '<div style="font-size:13px;font-weight:700;color:var(--clay-text-light);margin-bottom:16px;">📱 แสดง QR Code นี้ให้ครูสแกน</div>' +
        '<canvas id="bonus-qr-canvas" style="border-radius:16px;box-shadow:0 4px 12px rgba(150,100,200,0.2);max-width:220px;"></canvas>' +
        '<div style="margin-top:12px;font-size:11px;color:var(--clay-text-light);">User ID: ' + u.UserID + '</div>' +
      '</div>' +

      // Score card
      '<div class="card" style="background:linear-gradient(145deg,#F8F3FF,#EEE8FF);box-shadow:0 6px 0 rgba(160,100,220,0.2),0 10px 20px rgba(160,100,220,0.10);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
          '<div style="font-weight:800;font-size:15px;color:var(--clay-purple-shadow);">⭐ คะแนนพิเศษ</div>' +
          '<div style="background:linear-gradient(135deg,' + scoreColor + ',#C084FC);border-radius:14px;padding:6px 14px;font-weight:800;color:white;font-size:18px;">' + b.total + '<span style="font-size:12px;opacity:0.85;">/100</span></div>' +
        '</div>' +
        '<div class="progress-bar-container" style="height:14px;border-radius:10px;">' +
          '<div class="progress-bar-fill" style="width:' + pct + '%;background:linear-gradient(90deg,' + scoreColor + ',#C084FC);border-radius:10px;height:100%;transition:width 0.5s ease;"></div>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--clay-text-light);margin-top:6px;text-align:right;">' + b.total + ' / 100 คะแนน</div>' +
      '</div>' +

      // History
      '<div class="card">' +
        '<div style="font-weight:800;font-size:15px;color:var(--clay-text);margin-bottom:12px;">📋 ประวัติการรับคะแนน</div>' +
        histHtml +
      '</div>' +
    '</div>';
  },

  viewAdminScanner: function() {
    var scanned = this.state.scannedUser;

    if (scanned) {
      // Show result + give bonus UI
      var bonus = this.state.scannedUserBonus;
      var remaining = 100 - bonus;
      var av = scanned.profile_image
        ? '<img src="' + scanned.profile_image + '" style="width:60px;height:60px;border-radius:50%;object-fit:cover;">'
        : '<div style="width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#EDE9F7,#DDD4EF);display:flex;align-items:center;justify-content:center;font-size:28px;">👤</div>';

      return '<div class="page-content">' +
        '<button onclick="App.navigate(\'adminScanner\')" style="background:none;border:none;font-size:18px;color:var(--clay-text-light);cursor:pointer;padding:0;margin-bottom:16px;font-weight:700;">🔄 สแกนใหม่</button>' +
        '<div style="background:linear-gradient(135deg,#4ECB71,#5BA4F5);border-radius:24px;padding:16px;margin-bottom:16px;display:flex;align-items:center;gap:14px;box-shadow:0 6px 0 rgba(60,160,80,0.2);">' +
          av +
          '<div>' +
            '<div style="font-size:18px;font-weight:800;color:white;">' + App.esc(scanned.first_name) + ' ' + App.esc(scanned.last_name) + '</div>' +
            '<div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:3px;">' + App.esc(scanned.class_name) + ' · เลขที่ ' + App.esc(scanned.student_number) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="card" style="text-align:center;background:linear-gradient(145deg,#F8F3FF,#EEE8FF);">' +
          '<div style="font-size:13px;color:var(--clay-text-light);margin-bottom:6px;">คะแนนพิเศษปัจจุบัน</div>' +
          '<div style="font-size:36px;font-weight:800;color:var(--clay-purple-shadow);">' + bonus + '<span style="font-size:16px;color:var(--clay-text-light);">/100</span></div>' +
          '<div class="progress-bar-container" style="margin-top:10px;height:12px;"><div class="progress-bar-fill" style="width:' + bonus + '%;height:100%;border-radius:10px;background:linear-gradient(90deg,#4ECB71,#C084FC);"></div></div>' +
          (remaining <= 0 ? '<div style="margin-top:8px;font-size:13px;font-weight:800;color:var(--clay-red);">ได้รับคะแนนครบ 100 แล้ว!</div>' : '<div style="margin-top:6px;font-size:12px;color:var(--clay-text-light);">เพิ่มได้อีก ' + remaining + ' คะแนน</div>') +
        '</div>' +
        (remaining > 0 ? (
          '<div class="card">' +
            '<div style="font-weight:800;font-size:15px;color:var(--clay-text);margin-bottom:14px;">ใส่คะแนนที่จะให้ (สูงสุด ' + remaining + '):</div>' +
            '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">' +
              '<button onclick="var v=parseInt(document.getElementById(\'bonus-input\').value||0);if(v>1)document.getElementById(\'bonus-input\').value=v-1;" style="width:44px;height:44px;border-radius:50%;border:none;background:var(--clay-bg);box-shadow:0 4px 0 rgba(150,100,200,0.2);font-size:22px;font-weight:800;cursor:pointer;color:var(--clay-text);">−</button>' +
              '<input id="bonus-input" type="number" min="1" max="' + remaining + '" value="' + Math.min(this.state.pendingBonusPoints, remaining) + '" style="flex:1;text-align:center;font-size:32px;font-weight:800;color:var(--clay-purple-shadow);border:none;border-bottom:3px solid var(--clay-purple);background:transparent;outline:none;padding:8px 0;" oninput="App.state.pendingBonusPoints=Math.min(Math.max(parseInt(this.value)||1,1),' + remaining + ');this.value=App.state.pendingBonusPoints;">' +
              '<button onclick="var v=parseInt(document.getElementById(\'bonus-input\').value||0);if(v<' + remaining + ')document.getElementById(\'bonus-input\').value=v+1;" style="width:44px;height:44px;border-radius:50%;border:none;background:var(--clay-bg);box-shadow:0 4px 0 rgba(150,100,200,0.2);font-size:22px;font-weight:800;cursor:pointer;color:var(--clay-text);">+</button>' +
            '</div>' +
            '<button class="btn btn-primary" onclick="App.state.pendingBonusPoints=parseInt(document.getElementById(\'bonus-input\').value)||1;App.doGiveBonus();" style="font-size:15px;">✅ ยืนยันให้คะแนน</button>' +
            '<div id="bonus-give-status" style="text-align:center;font-size:13px;font-weight:700;margin-top:8px;"></div>' +
          '</div>'
        ) : '') +
        '<button class="btn btn-outline" onclick="App.navigate(\'admin\')">กลับ Admin</button>' +
      '</div>';
    }

    // Scanner camera view
    return '<div style="position:relative;height:100vh;background:#1a1a2e;overflow:hidden;display:flex;flex-direction:column;">' +
      '<div style="padding:16px 20px;display:flex;align-items:center;gap:12px;z-index:10;">' +
        '<button onclick="App.navigate(\'admin\')" style="background:rgba(255,255,255,0.15);border:none;width:40px;height:40px;border-radius:50%;color:white;font-size:18px;cursor:pointer;">✕</button>' +
        '<div style="color:white;font-weight:800;font-size:18px;">สแกน QR Code นักเรียน</div>' +
      '</div>' +
      '<div style="flex:1;position:relative;display:flex;align-items:center;justify-content:center;">' +
        '<video id="qr-video" playsinline style="width:100%;height:100%;object-fit:cover;"></video>' +
        '<canvas id="qr-canvas" style="display:none;"></canvas>' +
        // Viewfinder overlay
        '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;">' +
          '<div style="width:240px;height:240px;position:relative;">' +
            '<div style="position:absolute;top:0;left:0;width:50px;height:50px;border-top:4px solid #4ECB71;border-left:4px solid #4ECB71;border-radius:4px 0 0 0;"></div>' +
            '<div style="position:absolute;top:0;right:0;width:50px;height:50px;border-top:4px solid #4ECB71;border-right:4px solid #4ECB71;border-radius:0 4px 0 0;"></div>' +
            '<div style="position:absolute;bottom:0;left:0;width:50px;height:50px;border-bottom:4px solid #4ECB71;border-left:4px solid #4ECB71;border-radius:0 0 0 4px;"></div>' +
            '<div style="position:absolute;bottom:0;right:0;width:50px;height:50px;border-bottom:4px solid #4ECB71;border-right:4px solid #4ECB71;border-radius:0 0 4px 0;"></div>' +
          '</div>' +
        '</div>' +
        // Scan line animation
        '<div style="position:absolute;width:240px;height:3px;background:linear-gradient(90deg,transparent,#4ECB71,transparent);animation:scanline 2s linear infinite;pointer-events:none;"></div>' +
      '</div>' +
      '<div id="scanner-status" style="color:white;text-align:center;padding:20px;font-size:14px;font-weight:600;">📷 วางQR Code ไว้ในกรอบ</div>' +
      '<style>@keyframes scanline{0%{top:30%}50%{top:70%}100%{top:30%}}.qr-scan-line{position:absolute;}</style>' +
    '</div>';
  },

  /* ===== ADMIN VIEWS ===== */

  viewAdmin: function() {
    return '<div class="page-content">' +
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">' +
        '<h2 class="text-title" style="color:var(--bear-brown); margin:0;">&#x1F6E0;&#xFE0F; Admin Dashboard</h2>' +
        '<button class="btn btn-danger" style="width:auto; padding:8px 16px; margin:0; font-size:12px;" onclick="App.state.user=null; App.navigate(\'login\')">ออกจากระบบ</button>' +
      '</div>' +
      
      '<h3 style="color:var(--duo-text-light); font-size:14px; margin-top:0;">ดูแอปแบบนักเรียน</h3>' +
      '<div class="card action-card" style="border-color:var(--clay-blue); border-bottom-width:4px; margin-bottom:16px; cursor:pointer;" onclick="App.toggleStudentMode()">' +
        '<div style="display:flex; align-items:center; gap:12px;">' +
          '<div style="font-size:32px;">👀</div>' +
          '<div style="flex:1;">' +
            '<h3 style="margin:0; font-size:16px; color:var(--clay-blue-shadow);">เข้าโหมดนักเรียน</h3>' +
            '<p style="margin:4px 0 0 0; font-size:12px; color:var(--duo-text-light);">เห็นและเรียนได้เหมือนนักเรียนจริง สลับกลับได้ที่แถบด้านบน</p>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<h3 style="color:var(--duo-text-light); font-size:14px;">ประกาศถึงนักเรียน</h3>' +
      '<div class="card action-card" style="border-color:var(--clay-purple); border-bottom-width:4px; margin-bottom:16px; cursor:pointer;" onclick="App.navigate(\'adminAnnounce\')">' +
        '<div style="display:flex; align-items:center; gap:12px;">' +
          '<div style="font-size:32px;">📣</div>' +
          '<div style="flex:1;">' +
            '<h3 style="margin:0; font-size:16px; color:var(--clay-purple-shadow);">สร้างการ์ดประกาศ</h3>' +
            '<p style="margin:4px 0 0 0; font-size:12px; color:var(--duo-text-light);">ใส่รูปและข้อความ เด้งให้นักเรียนเห็นตอนเข้าระบบ</p>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<h3 style="color:var(--duo-text-light); font-size:14px;">จัดการผู้เรียน</h3>' +
      '<div class="card action-card" style="border-color:var(--duo-green); border-bottom-width:4px; margin-bottom:16px; cursor:pointer;" onclick="App.navigate(\'adminExport\')">' +
        '<div style="display:flex; align-items:center; gap:12px;">' +
          '<div style="font-size:32px;">&#x1F4CA;</div>' +
          '<div style="flex:1;">' +
            '<h3 style="margin:0; font-size:16px; color:var(--duo-green-shadow);">ดาวน์โหลดคะแนน (Excel/CSV)</h3>' +
            '<p style="margin:4px 0 0 0; font-size:12px; color:var(--duo-text-light);">โหลดข้อมูลคะแนนแยกตามห้องเรียน</p>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<h3 style="color:var(--duo-text-light); font-size:14px;">สแกนให้คะแนนพิเศษ</h3>' +
      '<div class="card action-card" style="border-color:#4ECB71; border-bottom-width:4px; margin-bottom:16px; cursor:pointer;" onclick="App.navigate(\'adminScanner\')">' +
        '<div style="display:flex; align-items:center; gap:12px;">' +
          '<div style="font-size:32px;">📷</div>' +
          '<div style="flex:1;">' +
            '<h3 style="margin:0; font-size:16px; color:#2a8a4a;">สแกน QR Code (คะแนนพิเศษ)</h3>' +
            '<p style="margin:4px 0 0 0; font-size:12px; color:var(--duo-text-light);">สแกน QR ของนักเรียนเพื่อให้คะแนนสูงสุด 100 คะแนน</p>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<h3 style="color:var(--duo-text-light); font-size:14px;">จัดการเนื้อหาและข้อสอบ</h3>' +
      '<div class="card action-card" style="border-color:var(--duo-blue); border-bottom-width:4px; margin-bottom:16px; cursor:pointer;" onclick="App.navigate(\'adminQuizBuilder\')">' +
        '<div style="display:flex; align-items:center; gap:12px;">' +
          '<div style="font-size:32px;">&#x1F4DD;</div>' +
          '<div style="flex:1;">' +
            '<h3 style="margin:0; font-size:16px; color:var(--duo-blue-shadow);">สร้างข้อสอบ (Quiz Builder)</h3>' +
            '<p style="margin:4px 0 0 0; font-size:12px; color:var(--duo-text-light);">เพิ่มข้อสอบใหม่แบบง่ายๆ เหมือน Google Form</p>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<h3 style="color:var(--duo-text-light); font-size:14px;">ฐานข้อมูลระบบทั้งหมด (Advanced)</h3>' +
      '<div class="card action-card" style="border-color:var(--bear-orange); border-bottom-width:4px; cursor:pointer;" onclick="App.navigate(\'adminDB\')">' +
        '<div style="display:flex; align-items:center; gap:12px;">' +
          '<div style="font-size:32px;">&#x1F5C4;&#xFE0F;</div>' +
          '<div style="flex:1;">' +
            '<h3 style="margin:0; font-size:16px; color:var(--bear-brown);">แก้ไขตารางข้อมูลทั้งหมด</h3>' +
            '<p style="margin:4px 0 0 0; font-size:12px; color:var(--duo-text-light);">จัดการ Database ดิบโดยตรง (Users, Modules, etc.)</p>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  },

  /* ===== ADMIN: จัดการประกาศ ===== */

  // ย่อ+ครอบรูปให้เป็น 3:4 พอดีการ์ด แล้วแปลงเป็น JPEG ขนาดเล็กก่อนเก็บลงฐานข้อมูล
  onAnnounceImageChosen: function(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { alert('ไฟล์ใหญ่เกินไป (จำกัด 12MB)'); return; }
    var self = this;
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        var W = 600, H = 800; // 3:4
        var c = document.createElement('canvas');
        c.width = W; c.height = H;
        var ctx = c.getContext('2d');
        // ครอบรูปแบบ cover: เต็มกรอบ ไม่บิดสัดส่วน
        var s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        var dw = img.naturalWidth * s, dh = img.naturalHeight * s;
        ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
        self.state.announceAdmin.image = c.toDataURL('image/jpeg', 0.82);
        self.render(true);
      };
      img.onerror = function() { alert('เปิดไฟล์รูปไม่สำเร็จ ลองไฟล์อื่นนะครับ'); };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  clearAnnounceImage: function() {
    this.state.announceAdmin.image = null;
    this.render(true);
  },

  submitAnnouncement: function() {
    var self = this;
    var a = this.state.announceAdmin;
    if (a.busy) return;
    var title = (document.getElementById('an-title') || {}).value || '';
    var content = (document.getElementById('an-content') || {}).value || '';
    if (!title.trim()) { alert('กรุณาใส่หัวข้อประกาศ'); return; }
    a.busy = true; this.render(true);
    google.script.run.withSuccessHandler(function(res) {
      a.busy = false;
      if (res && res.success) { self.toast('📣 ประกาศแล้ว! นักเรียนจะเห็นตอนเข้าระบบ'); self.navigate('adminAnnounce'); }
      else { alert((res && res.message) || 'บันทึกไม่สำเร็จ'); self.render(true); }
    }).withFailureHandler(function(e) {
      a.busy = false; alert('Error: ' + e.message); self.render(true);
    }).adminCreateAnnouncement(title, content, a.image, self.state.user.FirstName);
  },

  toggleAnnouncement: function(id, active) {
    var self = this;
    google.script.run.withSuccessHandler(function() { self.navigate('adminAnnounce'); })
      .withFailureHandler(function(e) { alert('Error: ' + e.message); })
      .adminSetAnnouncementActive(id, active);
  },

  removeAnnouncement: function(id) {
    if (!confirm('ลบประกาศนี้ถาวร?')) return;
    var self = this;
    google.script.run.withSuccessHandler(function() { self.toast('ลบแล้ว'); self.navigate('adminAnnounce'); })
      .withFailureHandler(function(e) { alert('Error: ' + e.message); })
      .adminDeleteAnnouncement(id);
  },

  viewAdminAnnounce: function() {
    var self = this;
    var a = this.state.announceAdmin;

    var preview = a.image
      ? '<div style="position:relative; width:150px; aspect-ratio:3/4; border-radius:16px; overflow:hidden; box-shadow:0 5px 0 rgba(150,100,200,0.2); flex-shrink:0;">' +
          '<img src="' + a.image + '" style="width:100%; height:100%; object-fit:cover;">' +
          '<button onclick="App.clearAnnounceImage()" style="position:absolute; top:6px; right:6px; width:28px; height:28px; min-height:0; margin:0; padding:0; border:none; border-radius:50%; background:rgba(255,255,255,0.95); color:#3D2B5C; font-size:14px; font-weight:800; line-height:1; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,0.25);">✕</button>' +
        '</div>'
      : '<label style="width:150px; aspect-ratio:3/4; border-radius:16px; border:2px dashed rgba(150,100,200,0.4); background:var(--clay-bg); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; cursor:pointer; flex-shrink:0; text-align:center; padding:8px;">' +
          '<div style="font-size:30px;">🖼️</div>' +
          '<div style="font-size:11px; font-weight:700; color:var(--clay-text-light); line-height:1.5;">แตะเพื่อเลือกรูป<br>(ย่อเป็น 3:4 ให้อัตโนมัติ)</div>' +
          '<input type="file" accept="image/*" onchange="App.onAnnounceImageChosen(this)" style="display:none;">' +
        '</label>';

    var listHtml = !a.loaded
      ? '<div class="loader" style="height:auto; padding:24px 0;"><div class="loader-text">กำลังโหลด...</div></div>'
      : (a.items.length === 0
        ? '<div class="card" style="text-align:center; background:linear-gradient(145deg,#F8F3FF,#EEE8FF);"><div style="font-size:13px; color:var(--clay-text-light); font-weight:700;">ยังไม่เคยสร้างประกาศ</div></div>'
        : a.items.map(function(it) {
            var on = !!it.active;
            return '<div class="card" style="display:flex; gap:12px; align-items:center; padding:12px;">' +
              (it.image
                ? '<img src="' + it.image + '" style="width:48px; aspect-ratio:3/4; object-fit:cover; border-radius:10px; flex-shrink:0;">'
                : '<div style="width:48px; aspect-ratio:3/4; border-radius:10px; background:linear-gradient(145deg,#FF8C42,#C084FC); display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0;">📣</div>') +
              '<div style="flex:1; min-width:0;">' +
                '<div style="font-weight:800; font-size:14px; color:var(--clay-text); line-height:1.5;">' + self.esc(it.title) + '</div>' +
                '<div style="font-size:11px; color:var(--clay-text-light); margin-top:2px;">' + self.timeAgo(it.created_at) + (on ? ' · <b style="color:var(--clay-green-shadow);">กำลังแสดง</b>' : ' · ปิดอยู่') + '</div>' +
              '</div>' +
              '<button onclick="App.toggleAnnouncement(' + it.id + ',' + (!on) + ')" style="min-height:0; margin:0; padding:7px 11px; border:none; border-radius:11px; font-size:11px; font-weight:800; cursor:pointer; background:' + (on ? 'var(--clay-gray)' : 'var(--clay-green)') + '; color:' + (on ? 'var(--clay-text)' : 'white') + ';">' + (on ? 'ปิด' : 'แสดง') + '</button>' +
              '<button onclick="App.removeAnnouncement(' + it.id + ')" style="min-height:0; margin:0; padding:7px 10px; border:none; border-radius:11px; font-size:11px; font-weight:800; cursor:pointer; background:#FFE0E0; color:var(--clay-red-shadow);">ลบ</button>' +
            '</div>';
          }).join(''));

    return '<div class="page-content">' +
      '<button onclick="App.navigate(\'admin\')" style="background:none; border:none; font-size:18px; color:var(--clay-text-light); cursor:pointer; padding:0; margin-bottom:16px; font-weight:700;">&#x2190; กลับ</button>' +
      '<h2 class="text-title" style="color:var(--bear-brown); margin-top:0;">📣 ประกาศถึงนักเรียน</h2>' +
      '<p style="font-size:13px; color:var(--clay-text-light); margin-top:0; line-height:1.7;">การ์ดจะเด้งทุกครั้งที่นักเรียนเข้าระบบ<br><b>เปิดพร้อมกันได้หลายอัน</b> — นักเรียนต้องแตะหรือปัดดูให้ครบทุกใบ ช่องติ๊ก “ไม่ต้องแสดงอีกวันนี้” จะโผล่เมื่อถึงใบสุดท้ายเท่านั้น<br><b>รูปคือตัวประกาศ</b> — ข้อความบนการ์ดมาจากรูปที่อัปโหลด</p>' +

      '<div class="card">' +
        '<div style="display:flex; gap:14px; align-items:flex-start;">' +
          preview +
          '<div style="flex:1; min-width:0;">' +
            '<label style="display:block; font-weight:800; margin-bottom:2px; font-size:13px;">ชื่อประกาศ</label>' +
            '<div style="font-size:11px; color:var(--clay-text-light); margin-bottom:6px; line-height:1.5;">ใช้จำในระบบเท่านั้น ไม่แสดงบนการ์ด</div>' +
            '<input type="text" id="an-title" class="input-field" maxlength="120" placeholder="เช่น ประกาศสอบกลางภาค">' +
            '<label style="display:block; font-weight:800; margin:10px 0 2px; font-size:13px;">ข้อความสำรอง (ไม่บังคับ)</label>' +
            '<div style="font-size:11px; color:var(--clay-text-light); margin-bottom:6px; line-height:1.5;">แสดงเฉพาะกรณีไม่ได้ใส่รูป</div>' +
            '<textarea id="an-content" class="input-field" maxlength="500" style="height:74px; resize:vertical; margin-bottom:0;" placeholder="ข้อความประกาศ (ถ้าไม่ใส่รูป)"></textarea>' +
          '</div>' +
        '</div>' +
        '<button class="btn btn-primary" style="margin:14px 0 0;" onclick="App.submitAnnouncement()">' + (a.busy ? 'กำลังบันทึก...' : '📣 ประกาศเลย') + '</button>' +
      '</div>' +

      '<div style="font-weight:800; font-size:14px; color:var(--clay-text-light); margin:18px 4px 10px;">ประกาศทั้งหมด</div>' +
      listHtml +
    '</div>';
  },

  viewAdminExport: function() {
    return '<div class="page-content">' +
      '<button onclick="App.navigate(\'admin\')" style="background:none; border:none; font-size:18px; color:var(--duo-text-light); cursor:pointer; padding:0; margin-bottom:16px; font-weight:700;">&#x2190; กลับ</button>' +
      '<h2 class="text-title" style="color:var(--bear-brown); margin-top:0;">&#x1F4CA; ดาวน์โหลดคะแนน (CSV)</h2>' +
      '<div class="card">' +
        '<p style="font-size:14px; color:var(--duo-text-light); margin-top:0;">เลือกห้องเรียนที่ต้องการดาวน์โหลดข้อมูลคะแนน ระบบจะสร้างไฟล์ CSV ที่สามารถเปิดด้วย Excel ได้ทันที</p>' +
        '<label style="display:block; font-weight:bold; margin-bottom:8px; font-size:14px;">เลือกห้องเรียน:</label>' +
        '<select id="export-class" class="input-field" style="margin-bottom:16px;">' +
          '<option value="ALL">ทุกห้อง (ALL)</option>' +
          this.classOptionsHtml() +
        '</select>' +
        '<button class="btn btn-primary" onclick="App.adminDownloadCSV()">ดาวน์โหลดไฟล์</button>' +
        '<div id="export-status" style="margin-top:12px; font-size:13px; font-weight:bold; color:var(--duo-blue); text-align:center;"></div>' +
      '</div>' +
    '</div>';
  },

  viewAdminQuizBuilder: function() {
    return '<div class="page-content">' +
      '<button onclick="App.navigate(\'admin\')" style="background:none; border:none; font-size:18px; color:var(--duo-text-light); cursor:pointer; padding:0; margin-bottom:16px; font-weight:700;">&#x2190; กลับ</button>' +
      '<h2 class="text-title" style="color:var(--bear-brown); margin-top:0;">&#x1F4DD; สร้างข้อสอบ (Quiz Builder)</h2>' +
      '<div class="card" style="border-top: 8px solid var(--duo-blue);">' +
        '<label style="display:block; font-weight:bold; margin-bottom:8px; font-size:14px;">โจทย์ข้อสอบ:</label>' +
        '<textarea id="qb-text" class="input-field" style="height:80px; resize:vertical;" placeholder="พิมพ์โจทย์คำถาม..."></textarea>' +
        
        '<label style="display:block; font-weight:bold; margin:16px 0 8px; font-size:14px;">คำตอบตัวเลือก (กดเลือกข้อที่ถูกต้อง):</label>' +
        
        '<div style="display:flex; align-items:center; margin-bottom:8px;">' +
          '<input type="radio" name="qb-correct" value="1" style="width:20px; height:20px; margin-right:8px;" checked>' +
          '<input type="text" id="qb-opt1" class="input-field" style="margin:0;" placeholder="ตัวเลือกที่ 1">' +
        '</div>' +
        '<div style="display:flex; align-items:center; margin-bottom:8px;">' +
          '<input type="radio" name="qb-correct" value="2" style="width:20px; height:20px; margin-right:8px;">' +
          '<input type="text" id="qb-opt2" class="input-field" style="margin:0;" placeholder="ตัวเลือกที่ 2">' +
        '</div>' +
        '<div style="display:flex; align-items:center; margin-bottom:8px;">' +
          '<input type="radio" name="qb-correct" value="3" style="width:20px; height:20px; margin-right:8px;">' +
          '<input type="text" id="qb-opt3" class="input-field" style="margin:0;" placeholder="ตัวเลือกที่ 3">' +
        '</div>' +
        '<div style="display:flex; align-items:center; margin-bottom:16px;">' +
          '<input type="radio" name="qb-correct" value="4" style="width:20px; height:20px; margin-right:8px;">' +
          '<input type="text" id="qb-opt4" class="input-field" style="margin:0;" placeholder="ตัวเลือกที่ 4">' +
        '</div>' +

        '<label style="display:block; font-weight:bold; margin-bottom:8px; font-size:14px;">คำอธิบายเฉลย (ไม่บังคับ):</label>' +
        '<input type="text" id="qb-exp" class="input-field" placeholder="อธิบายสั้นๆ ทำไมถึงตอบข้อนี้">' +

        '<label style="display:block; font-weight:bold; margin-bottom:8px; font-size:14px;">Module ID (เพื่อจัดกลุ่มข้อสอบ):</label>' +
        '<input type="number" id="qb-mod" class="input-field" value="1">' +
        
        '<button class="btn btn-primary" onclick="App.adminSaveQuizBuilder()" style="margin-top:16px;">บันทึกข้อสอบเข้าสู่ระบบ</button>' +
        '<div id="qb-status" style="margin-top:12px; font-size:13px; font-weight:bold; color:var(--duo-green); text-align:center;"></div>' +
      '</div>' +
    '</div>';
  },

  viewAdminDB: function() {
    var tables = this.state.admin.tables || [];
    if (tables.length === 0) return '<div class="loader">กำลังโหลดตารางข้อมูล...</div>';
    
    var listHtml = '';
    for (var i = 0; i < tables.length; i++) {
      listHtml += '<div class="card action-card" style="border-color:var(--bear-brown); border-left:5px solid var(--bear-orange); cursor:pointer; display:flex; justify-content:space-between; align-items:center;" onclick="App.navigate(\'adminTable\', \'' + tables[i] + '\')">' +
        '<div style="font-size:16px; font-weight:bold; color:var(--bear-brown);">' + tables[i] + '</div>' +
        '<div style="font-size:20px; color:var(--bear-orange);">&#x276F;</div>' +
      '</div>';
    }

    return '<div class="page-content">' +
      '<button onclick="App.navigate(\'admin\')" style="background:none; border:none; font-size:18px; color:var(--duo-text-light); cursor:pointer; padding:0; margin-bottom:16px; font-weight:700;">&#x2190; กลับ</button>' +
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">' +
        '<h2 class="text-title" style="color:var(--bear-brown); margin:0;">&#x1F5C4;&#xFE0F; Database Editor</h2>' +
      '</div>' +
      '<p style="font-size:13px; color:var(--duo-text-light);">เลือกตารางที่ต้องการจัดการโดยตรง (โหมดขั้นสูง)</p>' +
      listHtml +
    '</div>';
  },

  viewAdminTable: function() {
    var tName = this.state.admin.currentTable;
    var headers = this.state.admin.headers || [];
    var data = this.state.admin.data || [];
    var editingRow = this.state.admin.editingRow;

    if (headers.length === 0) return '<div class="loader">กำลังโหลดข้อมูล...</div>';

    var thHtml = '';
    for (var i = 0; i < headers.length; i++) {
      thHtml += '<th style="padding:10px; background:var(--bear-orange); color:white; text-align:left; border:1px solid #ccc; font-size:13px; min-width:120px;">' + headers[i] + '</th>';
    }
    thHtml += '<th style="padding:10px; background:var(--bear-brown); color:white; text-align:center; border:1px solid #ccc; font-size:13px; min-width:140px;">จัดการ</th>';

    var trHtml = '';
    for (var r = 0; r < data.length; r++) {
      var row = data[r];
      var isEditing = (r === editingRow);
      var tdHtml = '';
      
      for (var c = 0; c < headers.length; c++) {
        var raw = row[headers[c]];
        var val = (raw === null || raw === undefined) ? '' : raw; // keep 0/false, don't blank them
        var safe = App.esc(val);
        if (isEditing) {
          tdHtml += '<td style="padding:4px; border:1px solid #ccc;"><input type="text" id="edit-' + r + '-' + headers[c] + '" value="' + safe + '" style="width:100%; box-sizing:border-box; padding:6px; border:1px solid var(--bear-orange); border-radius:4px;"></td>';
        } else {
          tdHtml += '<td style="padding:10px; border:1px solid #ccc; font-size:13px; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + safe + '">' + safe + '</td>';
        }
      }
      
      var actionHtml = '';
      if (isEditing) {
        actionHtml = '<button onclick="App.adminSaveRow(' + r + ')" style="background:var(--duo-green); color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; margin-right:4px;">บันทึก</button>' +
                     '<button onclick="App.adminCancelEdit()" style="background:var(--duo-gray-shadow); color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">ยกเลิก</button>';
      } else {
        actionHtml = '<button onclick="App.state.admin.editingRow=' + r + '; App.render();" style="background:var(--duo-blue); color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; margin-right:4px;">แก้ไข</button>' +
                     '<button onclick="App.adminDeleteRow(' + r + ')" style="background:var(--duo-red); color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">ลบ</button>';
      }
      tdHtml += '<td style="padding:4px; border:1px solid #ccc; text-align:center;">' + actionHtml + '</td>';
      
      trHtml += '<tr>' + tdHtml + '</tr>';
    }

    // New Row Input
    var newTdHtml = '';
    for (var c = 0; c < headers.length; c++) {
      var ph = c === 0 ? '(Auto)' : headers[c];
      newTdHtml += '<td style="padding:4px; border:1px solid #ccc;"><input type="text" id="new-' + headers[c] + '" placeholder="' + ph + '" style="width:100%; box-sizing:border-box; padding:6px; border:1px solid var(--duo-green); border-radius:4px;"></td>';
    }
    newTdHtml += '<td style="padding:4px; border:1px solid #ccc; text-align:center;"><button onclick="App.adminInsertRow()" style="background:var(--bear-orange); color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; width:100%; font-weight:bold;">+ เพิ่มข้อมูล</button></td>';
    trHtml += '<tr style="background:#f9f9f9;">' + newTdHtml + '</tr>';

    return '<div class="page-content" style="padding: 10px;">' +
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">' +
        '<button onclick="App.navigate(\'admin\')" style="background:none; border:none; font-size:16px; font-weight:bold; color:var(--duo-text-light); cursor:pointer;">&#x2190; กลับ</button>' +
        '<h2 style="margin:0; font-size:18px; color:var(--bear-brown);">ตาราง: ' + tName + '</h2>' +
      '</div>' +
      '<div style="width:100%; overflow-x:auto; background:white; border-radius:8px; border:2px solid var(--duo-gray);">' +
        '<table style="width:100%; border-collapse:collapse;">' +
          '<thead><tr>' + thHtml + '</tr></thead>' +
          '<tbody>' + trHtml + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  },

  /* ===== BOTTOM NAV ===== */

  bottomNav: function(activeTab) {
    var qrSvg = '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="1" y="1" width="9" height="9" rx="1.5"/><rect x="3" y="3" width="5" height="5" rx="0.5" fill="var(--clay-bg)"/><rect x="5" y="5" width="1" height="1" fill="currentColor"/>' +
      '<rect x="14" y="1" width="9" height="9" rx="1.5"/><rect x="16" y="3" width="5" height="5" rx="0.5" fill="var(--clay-bg)"/><rect x="18" y="5" width="1" height="1" fill="currentColor"/>' +
      '<rect x="1" y="14" width="9" height="9" rx="1.5"/><rect x="3" y="16" width="5" height="5" rx="0.5" fill="var(--clay-bg)"/><rect x="5" y="18" width="1" height="1" fill="currentColor"/>' +
      '<rect x="14" y="14" width="2" height="2"/><rect x="18" y="14" width="2" height="2"/><rect x="22" y="14" width="1" height="2"/>' +
      '<rect x="14" y="18" width="2" height="2"/><rect x="18" y="18" width="4" height="2"/><rect x="14" y="22" width="2" height="1"/><rect x="18" y="21" width="5" height="2"/>' +
      '</svg>';
    var tabs = [
      { id:'home',     icon:'&#x1F3E0;', label:'หน้าหลัก', route:'dashboard' },
      { id:'lessons',  icon:'&#x1F4DA;', label:'บทเรียน',  route:'lessons' },
      { id:'activity', icon:'&#x26A1;',  label:'กิจกรรม',  route:'activity' },
      { id:'bonus',    icon: qrSvg,      label:'QR คะแนน', route:'bonusQR', isSvg: true },
      { id:'profile',  icon:'&#x1F43E;', label:'โปรไฟล์',  route:'profile' }
    ];
    var navHtml = '';
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      var cls = activeTab === tab.id ? 'nav-item active' : 'nav-item';
      var iconHtml = tab.isSvg
        ? '<div class="nav-icon" style="display:flex;align-items:center;justify-content:center;">' + tab.icon + '</div>'
        : '<div class="nav-icon">' + tab.icon + '</div>';
      navHtml += '<div class="' + cls + '" title="' + tab.label + '" onclick="App.navigate(\'' + tab.route + '\')">' +
        '<div class="nav-icon-wrap">' + iconHtml + '</div>' +
        '<div class="nav-dot"></div>' +
      '</div>';
    }
    return '<div class="bottom-nav">' + navHtml + '</div>';
  },

  /* ===== CONTROLLERS ===== */

  logout: function() {
    this.state.user = null;
    this.state.dataLoaded = false;
    // ออกจากระบบแล้วรีเซ็ตโหมด ครั้งหน้าแอดมินล็อกอินจะเข้าแดชบอร์ดครูตามปกติ
    this.state.studentMode = false;
    localStorage.removeItem('lms_student_mode');
    localStorage.removeItem('lms_user');
    this.navigate('login');
  },

  handleLogin: function() {
    var user = document.getElementById('username').value;
    var pass = document.getElementById('password').value;
    if (!user || !pass) { alert('กรุณากรอกข้อมูลให้ครบ'); return; }
    var el = document.querySelector('.app-container');
    if (el) el.style.opacity = '0.6';
    google.script.run
      .withSuccessHandler(function(response) {
        if (el) el.style.opacity = '1';
        if (response.success) {
          App.state.user = response.user;
          localStorage.setItem('lms_user', JSON.stringify(response.user));
          if (response.user.Role === 'Admin' && !App.state.studentMode) {
            App.navigate('admin');
          } else {
            App.afterAuth();
          }
        } else { alert(response.message); }
      })
      .withFailureHandler(function(error) {
        if (el) el.style.opacity = '1';
        alert('Error: ' + error.message);
      })
      .loginUser(user, pass);
  },

  handleRegister: function() {
    var formData = {
      prefix: document.getElementById('reg-prefix').value,
      firstname: document.getElementById('reg-firstname').value,
      lastname: document.getElementById('reg-lastname').value,
      className: document.getElementById('reg-class').value,
      number: document.getElementById('reg-number').value,
      studentId: document.getElementById('reg-studentid').value,
      username: document.getElementById('reg-username').value,
      password: document.getElementById('reg-password').value,
      confirmPassword: document.getElementById('reg-confirm-password').value
    };
    if (!formData.className) { alert('กรุณาเลือกห้องเรียน'); return; }
    if (formData.password !== formData.confirmPassword) { alert('รหัสผ่านไม่ตรงกัน'); return; }
    var el = document.querySelector('.app-container');
    if (el) el.style.opacity = '0.6';
    google.script.run
      .withSuccessHandler(function(response) {
        if (el) el.style.opacity = '1';
        if (response.success) { alert('สมัครสำเร็จ!'); App.navigate('login'); }
        else { alert(response.message); }
      })
      .withFailureHandler(function(error) { if (el) el.style.opacity = '1'; alert('Error: ' + error.message); })
      .registerStudent(formData);
  },

  handleProfileUpload: function(event) {
    var file = event.target.files[0];
    if (!file) return;
    var statusEl = document.getElementById('upload-status');
    if (statusEl) statusEl.innerText = 'กำลังอัปโหลด...';
    var reader = new FileReader();
    reader.onload = function(e) {
      google.script.run
        .withSuccessHandler(function(res) {
          if (res.success) { App.state.user.ProfileImage = res.url; if (statusEl) statusEl.innerText = 'สำเร็จ!'; App.render(); }
          else { if (statusEl) statusEl.innerText = 'Error: ' + res.message; }
        })
        .uploadProfileImage(App.state.user.UserID, e.target.result, file.name);
    };
    reader.readAsDataURL(file);
  },

  answerQuiz: function(btnElem, optIdx) {
    var qState = this.state.quiz;
    var q = qState.questions[qState.currentIndex];
    // optIdx indexes the shuffled options rendered in viewQuiz; resolve back to
    // the exact original option text so comparison with correctAnswer is exact.
    var selectedOpt = (q._shuffled && q._shuffled[optIdx] !== undefined) ? q._shuffled[optIdx] : optIdx;
    var isCorrect = selectedOpt === q.correctAnswer;
    var allBtns = document.querySelectorAll('.quiz-option');
    for (var i = 0; i < allBtns.length; i++) { allBtns[i].classList.remove('correct', 'incorrect'); }
    var feedbackEl = document.getElementById('quiz-feedback');
    var footerEl = document.getElementById('quiz-footer');
    var nextBtn = document.getElementById('quiz-next-btn');
    if (isCorrect) {
      qState.score++;
      this.celebrate(18);
      btnElem.classList.add('correct');
      feedbackEl.innerHTML = '<div style="display:flex; align-items:center; gap:8px;"><span style="font-size:24px;">' + this.bear + '</span><div><h3 style="margin:0; color:var(--duo-green-shadow); font-size:16px;">ถูกต้อง!</h3><p style="margin:4px 0 0 0; font-size:13px; color:var(--duo-green-shadow);">' + this.esc(q.explanation) + '</p></div></div>';
      footerEl.style.backgroundColor = '#d7ffb8';
      nextBtn.className = 'btn btn-primary';
    } else {
      btnElem.classList.add('incorrect');
      feedbackEl.innerHTML = '<div style="display:flex; align-items:center; gap:8px;"><span style="font-size:24px;">' + this.bear + '</span><div><h3 style="margin:0; color:var(--duo-red-shadow); font-size:16px;">คำตอบที่ถูกต้อง:</h3><p style="margin:4px 0 0 0; font-weight:800; font-size:15px; color:var(--duo-red-shadow);">' + this.esc(q.correctAnswer) + '</p><p style="margin:4px 0 0 0; font-size:12px; color:var(--duo-red-shadow);">' + this.esc(q.explanation) + '</p></div></div>';
      footerEl.style.backgroundColor = '#ffdfe0';
      nextBtn.className = 'btn btn-danger';
    }
    feedbackEl.style.display = 'block';
    document.getElementById('quiz-options').style.pointerEvents = 'none';
    nextBtn.removeAttribute('disabled');
    nextBtn.innerText = 'ถัดไป';
    nextBtn.onclick = function() { App.nextQuizQuestion(); };
  },

  nextQuizQuestion: function() {
    var self = this;
    this.state.quiz.currentIndex++;
    if (this.state.quiz.currentIndex >= this.state.quiz.questions.length) {
      var isDailyQuest = this.state.quiz.moduleId === 'Daily';
      var effectiveType = isDailyQuest ? 'Daily' : (this.state.quiz.quizType || 'Quiz');
      var effectiveRef = isDailyQuest ? null : Number(this.state.quiz.moduleId);
      var potentialXp = this.state.quiz.score * 10;
      this.state.quiz.submitted = false;
      google.script.run.withSuccessHandler(function(res) {
        var dup = res && res.alreadyDone;
        self.state.quiz.alreadyDone = !!dup;
        self.state.quiz.awarded = dup ? 0 : potentialXp;
        self.state.quiz.submitted = true;
        if (!dup) self.celebrate(60);
        self.render(true);
      }).withFailureHandler(function() {
        self.state.quiz.submitted = true; self.state.quiz.awarded = 0; self.render(true);
      }).submitQuizScore(this.state.user.UserID, effectiveType, effectiveRef, this.state.quiz.score, this.state.quiz.questions.length, 0);
    }
    this.render(true);
  },

  nextFlashcard: function() {
    var self = this;
    this.state.flashcards.currentIndex++;
    if (this.state.flashcards.currentIndex >= this.state.flashcards.cards.length) {
      this.state.flashcards.submitted = false;
      google.script.run.withSuccessHandler(function(res) {
        var dup = res && res.alreadyDone;
        self.state.flashcards.alreadyDone = !!dup;
        self.state.flashcards.awarded = dup ? 0 : 20;
        self.state.flashcards.submitted = true;
        if (!dup) self.celebrate(50);
        self.render(true);
      }).withFailureHandler(function() {
        self.state.flashcards.submitted = true; self.state.flashcards.awarded = 0; self.render(true);
      }).submitQuizScore(this.state.user.UserID, 'Flashcards', Number(this.state.flashcards.moduleId), 2, 2, 0);
    }
    this.render(true);
  },

  /* ===== ADMIN CONTROLLERS ===== */

  adminCancelEdit: function() {
    this.state.admin.editingRow = -1;
    this.render(true);
  },

  adminSaveRow: function(rowIndex) {
    var headers = this.state.admin.headers;
    var rowData = this.state.admin.data[rowIndex];
    var updatedData = {};
    for (var i = 0; i < headers.length; i++) {
      var el = document.getElementById('edit-' + rowIndex + '-' + headers[i]);
      if (el) updatedData[headers[i]] = el.value;
    }
    
    var tName = this.state.admin.currentTable;
    var idCol = headers[0];
    var idVal = rowData[idCol];
    
    var elContainer = document.querySelector('.page-content');
    if (elContainer) elContainer.style.opacity = '0.5';

    google.script.run
      .withSuccessHandler(function(res) {
        if (res.success) {
          App.navigate('adminTable', tName); // Reload
        } else {
          alert('Error: ' + res.message);
          if (elContainer) elContainer.style.opacity = '1';
        }
      })
      .withFailureHandler(function(e) { alert('Error: '+e.message); if(elContainer) elContainer.style.opacity='1'; })
      .adminUpdateRow(tName, idCol, idVal, updatedData);
  },

  adminInsertRow: function() {
    var headers = this.state.admin.headers;
    var newData = {};
    for (var i = 0; i < headers.length; i++) {
      var el = document.getElementById('new-' + headers[i]);
      if (el) newData[headers[i]] = el.value;
    }
    
    var tName = this.state.admin.currentTable;
    var elContainer = document.querySelector('.page-content');
    if (elContainer) elContainer.style.opacity = '0.5';

    google.script.run
      .withSuccessHandler(function(res) {
        if (res.success) {
          App.navigate('adminTable', tName); // Reload
        } else {
          alert('Error: ' + res.message);
          if (elContainer) elContainer.style.opacity = '1';
        }
      })
      .withFailureHandler(function(e) { alert('Error: '+e.message); if(elContainer) elContainer.style.opacity='1'; })
      .adminInsertRow(tName, newData);
  },

  adminDeleteRow: function(rowIndex) {
    if (!confirm('ยืนยันการลบข้อมูลนี้?')) return;
    
    var headers = this.state.admin.headers;
    var rowData = this.state.admin.data[rowIndex];
    var tName = this.state.admin.currentTable;
    var idCol = headers[0];
    var idVal = rowData[idCol];
    
    var elContainer = document.querySelector('.page-content');
    if (elContainer) elContainer.style.opacity = '0.5';

    google.script.run
      .withSuccessHandler(function(res) {
        if (res.success) {
          App.navigate('adminTable', tName); // Reload
        } else {
          alert('Error: ' + res.message);
          if (elContainer) elContainer.style.opacity = '1';
        }
      })
      .withFailureHandler(function(e) { alert('Error: '+e.message); if(elContainer) elContainer.style.opacity='1'; })
      .adminDeleteRow(tName, idCol, idVal);
  },

  adminDownloadCSV: function() {
    var cls = document.getElementById('export-class').value;
    var st = document.getElementById('export-status');
    st.innerHTML = 'กำลังดึงข้อมูล... กรุณารอสักครู่';
    
    google.script.run
      .withSuccessHandler(function(res) {
        if (res.success) {
          st.innerHTML = 'ดึงข้อมูลสำเร็จ! กำลังดาวน์โหลด...';
          // Create Blob and Download
          var blob = new Blob(["\ufeff" + res.csvData], { type: 'text/csv;charset=utf-8;' });
          var link = document.createElement("a");
          var url = URL.createObjectURL(blob);
          link.setAttribute("href", url);
          link.setAttribute("download", res.filename);
          link.style.visibility = 'hidden';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          st.innerHTML = '<span style="color:var(--duo-red);">' + res.message + '</span>';
        }
      })
      .withFailureHandler(function(e) {
        st.innerHTML = '<span style="color:var(--duo-red);">Error: ' + e.message + '</span>';
      })
      .adminExportScoresCSV(cls);
  },

  /* ===== QR CODE CONTROLLERS ===== */

  initBonusQR: function() {
    var canvas = document.getElementById('bonus-qr-canvas');
    if (!canvas) return;
    var uid = String(this.state.user.UserID);
    QRCode.toCanvas(canvas, uid, {
      width: 220,
      margin: 2,
      color: { dark: '#3D2B5C', light: '#FFFFFF' },
      errorCorrectionLevel: 'M'
    }, function(err) {
      if (err) console.error('QR error:', err);
    });
  },

  initQRScanner: function() {
    var self = this;
    var video = document.getElementById('qr-video');
    var canvas = document.getElementById('qr-canvas');
    if (!video || !canvas) return;

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(function(stream) {
        self.state.scannerStream = stream;
        video.srcObject = stream;
        video.setAttribute('playsinline', true);
        video.play();

        var ctx = canvas.getContext('2d');
        function tick() {
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            var code = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' });
            if (code && code.data) {
              self.onQRScanned(code.data);
              return;
            }
          }
          self.state.scannerAnimFrame = requestAnimationFrame(tick);
        }
        self.state.scannerAnimFrame = requestAnimationFrame(tick);
      })
      .catch(function(err) {
        var st = document.getElementById('scanner-status');
        if (st) st.innerText = '❌ ไม่สามารถเข้าถึงกล้องได้: ' + err.message;
      });
  },

  stopQRScanner: function() {
    if (this.state.scannerStream) {
      this.state.scannerStream.getTracks().forEach(function(t) { t.stop(); });
      this.state.scannerStream = null;
    }
    if (this.state.scannerAnimFrame) {
      cancelAnimationFrame(this.state.scannerAnimFrame);
      this.state.scannerAnimFrame = null;
    }
  },

  onQRScanned: function(data) {
    var self = this;
    this.stopQRScanner();
    var userId = (data || '').trim();
    if (!userId) {
      var st = document.getElementById('scanner-status');
      if (st) st.innerText = '❌ QR Code ไม่ถูกต้อง กรุณาสแกนใหม่';
      return;
    }
    var st = document.getElementById('scanner-status');
    if (st) st.innerText = '🔍 กำลังค้นหาข้อมูล...';

    google.script.run
      .withSuccessHandler(function(res) {
        if (res.success) {
          self.state.scannedUser = res.user;
          self.state.scannedUserBonus = res.currentBonus;
          self.state.pendingBonusPoints = 10;
          self.render();
        } else {
          if (st) st.innerText = '❌ ' + (res.message || 'ไม่พบผู้เรียน');
          // Restart scanner after 2s
          setTimeout(function() { self.initQRScanner(); }, 2000);
        }
      })
      .withFailureHandler(function(e) {
        if (st) st.innerText = '❌ Error: ' + e.message;
      })
      .adminScanGetUser(userId);
  },

  doGiveBonus: function() {
    var self = this;
    var targetUser = this.state.scannedUser;
    var pts = this.state.pendingBonusPoints;
    if (!targetUser) return;

    var btn = document.querySelector('.btn-primary');
    if (btn) { btn.disabled = true; btn.innerText = 'กำลังบันทึก...'; }

    google.script.run
      .withSuccessHandler(function(res) {
        var st = document.getElementById('bonus-give-status');
        if (res.success) {
          if (st) {
            st.style.color = 'var(--clay-green-shadow)';
            st.innerText = '✅ ให้คะแนน +' + res.given + ' สำเร็จ! (รวม ' + res.newTotal + '/100)';
          }
          self.state.scannedUserBonus = res.newTotal;
          setTimeout(function() { self.render(); }, 1500);
        } else {
          if (st) { st.style.color = 'var(--clay-red)'; st.innerText = '❌ ' + res.message; }
          if (btn) { btn.disabled = false; btn.innerText = '✅ ให้คะแนน'; }
        }
      })
      .withFailureHandler(function(e) {
        var st = document.getElementById('bonus-give-status');
        if (st) { st.style.color = 'var(--clay-red)'; st.innerText = '❌ Error: ' + e.message; }
        // Re-enable the button so the teacher can retry after a transient failure.
        if (btn) { btn.disabled = false; btn.innerText = '✅ ให้คะแนน'; }
      })
      .adminGiveBonus(targetUser.id, pts, self.state.user ? self.state.user.UserID : 0);
  },

  // ===== ENGLISH TGAT COURSE =====

  viewEnglishCourse: function() {
    var u = this.state.user;
    var ec = this.state.englishCourse;
    var level = u.EnglishLevel;
    var levelMeta = {
      A1: { label: '🔴 Starter', th: 'เริ่มต้น', color: '#C62828', light: '#FFEBEE', tip: 'ปูพื้นฐาน Grammar + Core Vocab' },
      A2: { label: '🟡 Builder', th: 'พัฒนา', color: '#F57F17', light: '#FFF8E1', tip: 'เสริม Grammar + ขยาย Vocab' },
      B1: { label: '🟢 Booster', th: 'ขั้นสูง', color: '#2E7D32', light: '#E8F5E9', tip: 'เจาะโจทย์ข้อสอบ + ยกระดับ' },
      B2: { label: '🟢 Booster', th: 'ขั้นสูง', color: '#2E7D32', light: '#E8F5E9', tip: 'Mock Test + Error Log' }
    };
    var lm = levelMeta[level] || { label: '⚪ ยังไม่ได้วัดระดับ', th: '', color: '#666', light: '#F5F5F5', tip: 'ทำ Placement Test ก่อนเริ่มเรียน' };
    var totalMaxExp = 300;
    var expPct = Math.min(100, Math.round((ec.exp / totalMaxExp) * 100));

    var header = '<div style="background:linear-gradient(135deg,#1565C0,#2E7D32); padding:24px 20px 28px; margin:-16px -16px 20px; position:relative; overflow:hidden;">' +
      '<div style="position:absolute; top:-20px; right:-20px; width:100px; height:100px; background:rgba(255,255,255,0.06); border-radius:50%;"></div>' +
      '<div style="position:absolute; bottom:-30px; left:30%; width:120px; height:120px; background:rgba(255,255,255,0.04); border-radius:50%;"></div>' +
      '<div style="display:flex; align-items:center; gap:12px; margin-bottom:14px;">' +
        '<button onclick="App.navigate(\'dashboard\')" style="background:rgba(255,255,255,0.18); border:none; border-radius:50%; width:36px; height:36px; font-size:18px; cursor:pointer; color:white; display:flex; align-items:center; justify-content:center;">←</button>' +
        '<div>' +
          '<div style="font-size:11px; color:rgba(255,255,255,0.7); font-weight:700; letter-spacing:1px;">ENGLISH TGAT / A-LEVEL</div>' +
          '<div style="font-size:20px; font-weight:900; color:white; line-height:1.5;">📗 คอร์สภาษาอังกฤษ</div>' +
        '</div>' +
      '</div>' +
      '<div style="background:rgba(255,255,255,0.12); border-radius:16px; padding:14px 16px;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
          '<div style="color:white; font-weight:800; font-size:13px;">⚡ EXP สะสม</div>' +
          '<div style="color:white; font-weight:900; font-size:16px;">' + ec.exp + '<span style="font-size:11px; font-weight:600; opacity:0.7;"> / ' + totalMaxExp + '</span></div>' +
        '</div>' +
        '<div style="height:10px; background:rgba(255,255,255,0.2); border-radius:10px; overflow:hidden;">' +
          '<div style="width:' + expPct + '%; height:100%; background:linear-gradient(90deg,#69F0AE,#FFEB3B); border-radius:10px; transition:width 0.6s;"></div>' +
        '</div>' +
      '</div>' +
    '</div>';

    var placementBanner = '';
    if (!u.PlacementDone) {
      placementBanner = '<div class="card" style="background:linear-gradient(145deg,#FFF9C4,#FFF3A0); border:2px dashed #F9A825; margin-bottom:16px; text-align:center; padding:20px 16px;">' +
        '<div style="font-size:36px; margin-bottom:8px;">📋</div>' +
        '<div style="font-weight:800; font-size:15px; color:#E65100; margin-bottom:6px;">ทำ Placement Test ก่อนเลย!</div>' +
        '<div style="font-size:12px; color:#795548; margin-bottom:14px;">วัดระดับภาษา (20 ข้อ) เพื่อจัดหลักสูตรให้เหมาะกับตัวเอง + รับ 50 XP</div>' +
        '<button class="btn btn-primary" style="font-size:13px; margin:0;" onclick="App.navigate(\'placementTest\')">🎯 เริ่มวัดระดับ</button>' +
      '</div>';
    } else {
      placementBanner = '<div class="card" style="background:' + lm.light + '; border:2px solid ' + lm.color + '44; margin-bottom:16px; padding:14px 16px;">' +
        '<div style="display:flex; align-items:center; gap:12px;">' +
          '<div style="font-size:32px;">🎯</div>' +
          '<div style="flex:1;">' +
            '<div style="font-size:11px; font-weight:800; color:' + lm.color + '; letter-spacing:1px; text-transform:uppercase;">CEFR Level: ' + (level || '?') + '</div>' +
            '<div style="font-weight:900; font-size:16px; color:' + lm.color + '; margin:2px 0;">' + lm.label + '</div>' +
            '<div style="font-size:12px; color:#666;">' + lm.tip + '</div>' +
          '</div>' +
          '<button onclick="App.navigate(\'placementTest\')" style="background:' + lm.color + '; color:white; border:none; border-radius:12px; padding:8px 12px; font-size:11px; font-weight:700; cursor:pointer; font-family:var(--font-main);">ทำใหม่</button>' +
        '</div>' +
      '</div>';
    }

    var self = this;
    var modulesHtml = this.ENGLISH_MODULES.map(function(m) {
      var prog = ec.progress['english_' + m.id];
      var bestScore = prog ? prog.score : 0;
      var bestPct = prog ? Math.round((prog.score / prog.maxScore) * 100) : 0;
      var done = !!prog;
      var badge = done
        ? (bestPct >= 80 ? '🌟 ' + bestPct + '%' : '✅ ' + bestPct + '%')
        : '';
      return '<div class="card action-card" style="background:linear-gradient(145deg,' + m.light + ',#FFFFFF); box-shadow:0 6px 0 ' + m.shadow + ',0 10px 20px ' + m.shadow + '; margin-bottom:12px; padding:18px 16px;" onclick="App.navigate(\'englishModuleQuiz\',\'' + m.id + '\')">' +
        '<div style="display:flex; align-items:center; gap:14px;">' +
          '<div style="width:50px; height:50px; border-radius:14px; background:' + m.color + '; display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0; box-shadow:0 4px 0 ' + m.shadow + ';">' + m.emoji + '</div>' +
          '<div style="flex:1; min-width:0;">' +
            '<div style="font-weight:900; font-size:14px; color:' + m.color + ';">' + m.title + '</div>' +
            '<div style="font-size:11px; color:var(--clay-text-light); margin:2px 0 6px;">' + m.desc + '</div>' +
            (done
              ? '<div style="height:6px; background:rgba(0,0,0,0.08); border-radius:6px; overflow:hidden;"><div style="width:' + bestPct + '%; height:100%; border-radius:6px; background:' + m.color + ';"></div></div>'
              : '<div style="font-size:11px; color:' + m.color + '; font-weight:700;">⚡ ' + m.exp + ' EXP</div>') +
          '</div>' +
          '<div style="text-align:right; flex-shrink:0;">' +
            (done ? '<div style="font-size:12px; font-weight:800; color:' + m.color + ';">' + badge + '</div>' : '<div style="font-size:20px;">▶</div>') +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    var badgesData = [
      { emoji: '🌟', label: 'Grammar Star', cond: (ec.progress['english_grammar'] && Math.round((ec.progress['english_grammar'].score/ec.progress['english_grammar'].maxScore)*100) >= 80) },
      { emoji: '📖', label: 'Vocab Hunter', cond: !!(ec.progress['english_vocab']) },
      { emoji: '🔍', label: 'Error Detective', cond: (ec.progress['english_reading'] && Math.round((ec.progress['english_reading'].score/ec.progress['english_reading'].maxScore)*100) >= 80) },
      { emoji: '🏅', label: 'Mock Master', cond: ec.exp >= 210 }
    ];
    var badgesHtml = '<div class="card" style="padding:14px 16px; margin-bottom:16px;">' +
      '<div style="font-weight:800; font-size:13px; color:var(--clay-text); margin-bottom:12px;">🏆 Badge ที่ได้รับ</div>' +
      '<div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px;">' +
      badgesData.map(function(b) {
        return '<div style="text-align:center; opacity:' + (b.cond ? '1' : '0.3') + ';">' +
          '<div style="font-size:28px;">' + b.emoji + '</div>' +
          '<div style="font-size:10px; font-weight:700; color:var(--clay-text-light); margin-top:2px; line-height:1.5;">' + b.label + '</div>' +
        '</div>';
      }).join('') +
      '</div></div>';

    var loading = !ec.loaded
      ? '<div style="text-align:center; padding:20px; color:var(--clay-text-light);">⏳ กำลังโหลด...</div>'
      : '';

    return '<div class="page-content">' + header + loading + placementBanner +
      '<div style="font-weight:800; font-size:14px; color:var(--clay-text); margin-bottom:10px;">📚 บทเรียน (3 โมดูล)</div>' +
      modulesHtml + badgesHtml + '</div>';
  },

  viewEnglishModuleQuiz: function() {
    var eq = this.state.englishQuiz;
    var mod = null;
    for (var i = 0; i < this.ENGLISH_MODULES.length; i++) {
      if (this.ENGLISH_MODULES[i].id === eq.moduleId) { mod = this.ENGLISH_MODULES[i]; break; }
    }
    if (!mod) return '<div class="page-content"><div class="card">ไม่พบโมดูล</div></div>';

    if (eq.submitted) return this._englishQuizResult(mod, eq);

    var total = eq.questions.length;
    if (total === 0) return '<div class="page-content"><div class="card" style="text-align:center; padding:30px;">⏳ กำลังโหลดคำถาม...</div></div>';

    var q = eq.questions[eq.currentIndex];
    if (!q) return '<div class="page-content"><div class="card">ไม่พบคำถาม</div></div>';
    var pct = Math.round(((eq.currentIndex) / total) * 100);
    var self = this;
    var alreadyAnswered = eq.answers[eq.currentIndex] !== undefined;

    var optsHtml = q.opts.map(function(opt, i) {
      var ans = eq.answers[eq.currentIndex];
      var picked = alreadyAnswered && ans === i;
      var correct = alreadyAnswered && i === q.ans;
      var wrong = alreadyAnswered && picked && i !== q.ans;
      var bg = correct ? 'background:#E8F5E9; border-color:#4CAF50;'
               : wrong ? 'background:#FFEBEE; border-color:#F44336;'
               : picked ? 'background:#E3F2FD; border-color:#2196F3;'
               : '';
      var letter = ['A', 'B', 'C', 'D'][i];
      return '<button onclick="App.englishModuleAnswer(' + i + ')" style="width:100%; text-align:left; display:flex; align-items:center; gap:12px; padding:13px 14px; ' + bg + ' border:2px solid rgba(0,0,0,0.10); border-radius:14px; cursor:pointer; font-family:var(--font-main); margin-bottom:8px; transition:all 0.15s;">' +
        '<div style="width:30px; height:30px; border-radius:50%; background:' + mod.color + '; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:12px; color:white; flex-shrink:0;">' + letter + '</div>' +
        '<span style="font-size:14px; font-weight:600; color:var(--clay-text);">' + self.esc(opt) + '</span>' +
        (correct ? '<span style="margin-left:auto; font-size:16px;">✅</span>' : wrong ? '<span style="margin-left:auto; font-size:16px;">❌</span>' : '') +
      '</button>';
    }).join('');

    var explainHtml = alreadyAnswered
      ? '<div style="background:' + mod.light + '; border-left:4px solid ' + mod.color + '; border-radius:10px; padding:12px 14px; margin-bottom:16px; font-size:13px; color:var(--clay-text); line-height:1.5;"><b>💡 คำอธิบาย:</b> ' + this.esc(q.explain) + '</div>'
      : '';

    var nextBtn = alreadyAnswered
      ? (eq.currentIndex < total - 1
          ? '<button class="btn btn-primary" style="margin:0;" onclick="App.englishModuleNext()">ถัดไป →</button>'
          : '<button class="btn btn-primary" style="margin:0;" onclick="App.submitEnglishModuleQuiz()">🏁 ดูผล</button>')
      : '';

    return '<div class="page-content">' +
      '<div style="display:flex; align-items:center; gap:12px; margin-bottom:14px;">' +
        '<button onclick="App.navigate(\'englishCourse\')" style="background:' + mod.light + '; border:none; border-radius:50%; width:36px; height:36px; font-size:16px; cursor:pointer; color:' + mod.color + ';">←</button>' +
        '<div style="flex:1;">' +
          '<div style="font-size:11px; color:var(--clay-text-light); font-weight:700;">' + mod.emoji + ' ' + mod.title + '</div>' +
          '<div style="font-size:13px; font-weight:800; color:' + mod.color + ';">ข้อ ' + (eq.currentIndex + 1) + ' / ' + total + '</div>' +
        '</div>' +
        '<div style="font-size:13px; font-weight:800; color:' + mod.color + ';">' + pct + '%</div>' +
      '</div>' +
      '<div style="height:8px; background:rgba(0,0,0,0.08); border-radius:8px; overflow:hidden; margin-bottom:20px;">' +
        '<div style="width:' + pct + '%; height:100%; background:' + mod.color + '; border-radius:8px; transition:width 0.4s;"></div>' +
      '</div>' +
      '<div class="card" style="background:' + mod.light + '; border:none; padding:18px 20px; margin-bottom:16px;">' +
        '<div style="font-size:15px; font-weight:800; color:var(--clay-text); line-height:1.6;">' + this.esc(q.q) + '</div>' +
      '</div>' +
      optsHtml + explainHtml + nextBtn +
    '</div>';
  },

  _englishQuizResult: function(mod, eq) {
    var correct = 0;
    for (var i = 0; i < eq.questions.length; i++) {
      if (eq.answers[i] === eq.questions[i].ans) correct++;
    }
    var total = eq.questions.length;
    var pct = Math.round((correct / total) * 100);
    var grade = pct >= 80 ? { emoji: '🌟', label: 'ยอดเยี่ยม!', color: '#2E7D32' }
              : pct >= 60 ? { emoji: '👍', label: 'ดีมาก!', color: '#1565C0' }
              : pct >= 40 ? { emoji: '📘', label: 'พยายามต่อไป!', color: '#F57F17' }
              : { emoji: '💪', label: 'ลองใหม่อีกครั้ง!', color: '#C62828' };
    return '<div class="page-content">' +
      '<div style="text-align:center; padding:30px 16px 20px;">' +
        '<div style="font-size:72px; margin-bottom:10px; animation:mascot-bounce 1.5s ease infinite;">' + grade.emoji + '</div>' +
        '<div style="font-size:22px; font-weight:900; color:' + grade.color + '; margin-bottom:4px;">' + grade.label + '</div>' +
        '<div style="font-size:14px; color:var(--clay-text-light);">คุณทำได้ ' + correct + '/' + total + ' ข้อ</div>' +
      '</div>' +
      '<div style="background:' + mod.light + '; border:2px solid ' + mod.color + '; border-radius:20px; padding:20px; text-align:center; margin-bottom:16px;">' +
        '<div style="font-size:11px; font-weight:800; color:' + mod.color + '; letter-spacing:2px; margin-bottom:6px;">' + mod.emoji + ' ' + mod.title.toUpperCase() + '</div>' +
        '<div style="font-size:52px; font-weight:900; color:' + mod.color + '; line-height:1;">' + pct + '<span style="font-size:22px;">%</span></div>' +
        '<div style="font-size:13px; color:var(--clay-text-light); margin-top:6px;">EXP ที่ได้: <b style="color:' + mod.color + ';">+' + eq.awarded + '</b></div>' +
      '</div>' +
      '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:16px;">' +
        '<button class="btn" style="background:' + mod.light + '; color:' + mod.color + '; border:2px solid ' + mod.color + '44; font-size:13px; margin:0;" onclick="App.navigate(\'englishModuleQuiz\',\'' + eq.moduleId + '\')">🔄 ทำอีกครั้ง</button>' +
        '<button class="btn btn-primary" style="font-size:13px; margin:0;" onclick="App.navigate(\'englishCourse\')">📚 กลับคอร์ส</button>' +
      '</div>' +
    '</div>';
  },

  englishModuleAnswer: function(optIdx) {
    var eq = this.state.englishQuiz;
    if (eq.answers[eq.currentIndex] !== undefined) return;
    eq.answers[eq.currentIndex] = optIdx;
    this.render(true);
  },

  englishModuleNext: function() {
    var eq = this.state.englishQuiz;
    if (eq.currentIndex < eq.questions.length - 1) {
      eq.currentIndex++;
      this.render(true);
    }
  },

  submitEnglishModuleQuiz: function() {
    var self = this;
    var eq = this.state.englishQuiz;
    var correct = 0;
    for (var i = 0; i < eq.questions.length; i++) {
      if (eq.answers[i] === eq.questions[i].ans) correct++;
    }
    var total = eq.questions.length;
    var score = correct * 10;
    var maxScore = total * 10;
    eq.submitted = true;
    eq.awarded = score;
    this.render(true);
    if (score > 0) {
      this.celebrate(correct >= total * 0.8 ? 60 : 30);
    }
    google.script.run
      .withSuccessHandler(function() {
        self.state.englishCourse = Object.assign({}, self.state.englishCourse, { loaded: false });
      })
      .withFailureHandler(function() {})
      .submitEnglishScore(self.state.user.UserID, eq.moduleId, score, maxScore);
  },

  adminSaveQuizBuilder: function() {
    var txt = document.getElementById('qb-text').value.trim();
    if (!txt) return alert('กรุณาพิมพ์โจทย์');
    
    var opt1 = document.getElementById('qb-opt1').value.trim();
    var opt2 = document.getElementById('qb-opt2').value.trim();
    var opt3 = document.getElementById('qb-opt3').value.trim();
    var opt4 = document.getElementById('qb-opt4').value.trim();
    if (!opt1 || !opt2 || !opt3 || !opt4) return alert('กรุณาใส่ตัวเลือกให้ครบ 4 ข้อ');
    
    var radios = document.getElementsByName('qb-correct');
    var correctIdx = 1;
    for (var i = 0; i < radios.length; i++) {
      if (radios[i].checked) { correctIdx = parseInt(radios[i].value); break; }
    }
    
    var correctAns = document.getElementById('qb-opt' + correctIdx).value.trim();
    var exp = document.getElementById('qb-exp').value.trim();
    var mid = document.getElementById('qb-mod').value;
    
    var st = document.getElementById('qb-status');
    st.innerHTML = 'กำลังบันทึก...';

    google.script.run
      .withSuccessHandler(function(res) {
        if (res.success) {
          st.innerHTML = 'บันทึกเรียบร้อย! สามารถเพิ่มข้อต่อไปได้เลย';
          document.getElementById('qb-text').value = '';
          document.getElementById('qb-opt1').value = '';
          document.getElementById('qb-opt2').value = '';
          document.getElementById('qb-opt3').value = '';
          document.getElementById('qb-opt4').value = '';
          document.getElementById('qb-exp').value = '';
          radios[0].checked = true;
        } else {
          st.innerHTML = '<span style="color:var(--duo-red);">Error: ' + res.message + '</span>';
        }
      })
      .withFailureHandler(function(e) {
        st.innerHTML = '<span style="color:var(--duo-red);">Error: ' + e.message + '</span>';
      })
      .adminAddQuiz(mid, txt, opt1, opt2, opt3, opt4, correctAns, exp);
  }
};

window.App = App;

/* Boot */
(function() {
  function boot() {
    var el = document.getElementById('app');
    if (el) {
      try { App.init(); }
      catch(e) { el.innerHTML = '<div style="color:red;padding:20px;font-size:14px;"><b>Error:</b> ' + e.message + '</div>'; }
    } else { setTimeout(boot, 100); }
  }
  boot();
})();

