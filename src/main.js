import * as api from './api.js';
import QRCode from 'qrcode';
import jsQR from 'jsqr';

window.google = {
  script: {
    run: new Proxy({}, {
      get: function(target, prop) {
        if (prop === 'withSuccessHandler') {
          return function(successHandler) {
            return new Proxy({}, {
              get: function(target2, prop2) {
                if (prop2 === 'withFailureHandler') {
                  return function(failureHandler) {
                    return new Proxy({}, {
                      get: function(target3, prop3) {
                        return async function(...args) {
                          try {
                            const res = await api[prop3](...args);
                            successHandler(res);
                          } catch (e) {
                            failureHandler(e);
                          }
                        }
                      }
                    });
                  }
                }
                return async function(...args) {
                  try {
                    const res = await api[prop2](...args);
                    successHandler(res);
                  } catch (e) {
                    console.error(e);
                  }
                }
              }
            });
          }
        }
        return async function(...args) {
          await api[prop](...args);
        }
      }
    })
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
    leaderboardClasses: [],
    completedModules: [],
    streakInfo: null,
    community: { titles: [], feed: [], loaded: false },
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
    wordBridge: { puzzleIndex: 0, slots: [], pool: [], checked: false, correctTotal: 0, totalSlots: 0, finished: false, awarded: 0, alreadyDone: false, started: false }
  },

  // ===== WORD BRIDGE PUZZLES =====
  // แต่ละโจทย์: เรียงคำศัพท์ให้ต่อกันเป็นเรื่องราว/ขั้นตอน จากต้นทาง -> ปลายทาง
  // chain = ลำดับคำที่ถูกต้อง, decoys = คำลวง (จากคำศัพท์อื่น)
  wordBridgePuzzles: [
    {
      start: '🌙 นอนดึก', end: '😷 ขาดเรียน',
      chain: ['oversleep', 'under the weather', 'absent'],
      decoys: ['priority', 'nail it'],
      why: 'นอนดึก → oversleep (ตื่นสาย) → under the weather (รู้สึกไม่สบาย) → absent (ขาดเรียน)'
    },
    {
      start: '🤔 เริ่มวางแผนชีวิต', end: '🎯 ลงมือทำ',
      chain: ['consider / weigh', 'vision / aspiration', 'priority', 'objective / goal'],
      decoys: ['eliminate', 'adapt / adaptable'],
      why: 'พิจารณา (consider/weigh) → มีวิสัยทัศน์ (vision/aspiration) → จัดลำดับความสำคัญ (priority) → ตั้งเป้าหมาย (objective/goal)'
    },
    {
      start: '📚 เตรียมแข่งสุนทรพจน์', end: '🏆 คว้าชัยชนะ',
      chain: ['brush up on', 'common sense', 'adapt / adaptable', 'nail it'],
      decoys: ['oversleep', 'recyclable'],
      why: 'ทบทวน (brush up on) → ใช้สามัญสำนึก (common sense) → ปรับตัว (adapt) → ทำได้ยอดเยี่ยม (nail it)'
    },
    {
      start: '🌍 ปัญหาขยะพลาสติก', end: '♻️ โลกสะอาดขึ้น',
      chain: ['alternative', 'green packaging', 'recyclable', 'eliminate'],
      decoys: ['by then', 'turn in / submit'],
      why: 'หาทางเลือก (alternative) → บรรจุภัณฑ์รักษ์โลก (green packaging) → รีไซเคิลได้ (recyclable) → กำจัดขยะ (eliminate)'
    },
    {
      start: '💭 คิดจะทำโปรเจกต์', end: '✅ ทำสำเร็จ',
      chain: ['decide to + V', 'agree to + V', 'keep + V-ing', 'finish + V-ing'],
      decoys: ['avoid + V-ing', 'under the weather'],
      why: 'ตัดสินใจ (decide to) → ตกลงร่วมกัน (agree to) → ทำต่อเนื่อง (keep V-ing) → ทำเสร็จ (finish V-ing)'
    }
  ],

  bear: '&#x1F43B;',
  bearHappy: '&#x1F43B;',
  bearStar: '&#x2B50;',

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
      if (this.state.user.Role === 'Admin') this.navigate('admin');
      else this.afterAuth();
    } else {
      this.render();
    }
  },

  afterAuth: function() {
    // Record login → real streak + daily bonus, then open dashboard
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
      self.navigate('dashboard');
    }).withFailureHandler(function() { self.navigate('dashboard'); }).recordLogin(this.state.user.UserID);
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

    // Show loading
    var el = document.getElementById('app');
    if (el && route !== 'login' && route !== 'register') {
      el.innerHTML = '<div class="loader"><div class="loader-bear">' + this.bear + '</div><div class="loader-text">กำลังโหลด...</div></div>' + this.bottomNav(route === 'dashboard' ? 'home' : route);
    }

    if (route === 'dashboard') {
      // Always refresh bonus score for the home page
      google.script.run.withSuccessHandler(function(res) {
        if (res.success) self.state.bonusScore = { total: res.total, history: res.history };
        if (self.state.currentRoute === 'dashboard') self.render();
      }).withFailureHandler(function() {}).getBonusScore(this.state.user.UserID);
      if (!this.state.dataLoaded) {
        // First load: fetch everything in one call
        google.script.run.withSuccessHandler(function(res) {
          if (res.success) {
            if (res.dashboard) self.state.dashboardData = res.dashboard;
            if (res.modules) self.state.modules = res.modules;
            self.state.dataLoaded = true;
          }
          self.render();
        }).withFailureHandler(function(e) { self.render(); }).getAppData(self.state.user.UserID);
      } else {
        // Subsequent loads: just refresh dashboard
        google.script.run.withSuccessHandler(function(res) {
          if (res.success) self.state.dashboardData = res.data;
          self.render();
        }).withFailureHandler(function(e) { self.render(); }).getDashboardData(self.state.user.UserID);
      }
    } else if (route === 'lessons') {
      // Refresh unlock progress every time
      google.script.run.withSuccessHandler(function(res) {
        if (res.success) self.state.completedModules = res.data;
        if (self.state.currentRoute === 'lessons') self.render();
      }).withFailureHandler(function() {}).getCompletedModules(this.state.user.UserID);
      if (!this.state.modules) {
        google.script.run.withSuccessHandler(function(res) {
          self.state.modules = res;
          self.render();
        }).withFailureHandler(function(e) { self.render(); }).getModules();
      } else {
        this.render();
      }
    } else if (route === 'leaderboard') {
      google.script.run.withSuccessHandler(function(res) {
        if (res.success) { self.state.leaderboard = res.data; self.state.leaderboardClasses = res.classes || []; }
        self.render();
      }).withFailureHandler(function(e) { self.render(); }).getLeaderboard(self.state.leaderboardFilter || null);
    } else if (route === 'dailyQuest') {
      this.state.quiz.moduleId = 'Daily';
      this.state.quiz.currentIndex = 0;
      this.state.quiz.score = 0;
      this.state.quiz.submitted = false; this.state.quiz.awarded = 0; this.state.quiz.alreadyDone = false;
      google.script.run.withSuccessHandler(function(res) {
        if (res.success) self.state.quiz.questions = res.data;
        self.render();
      }).withFailureHandler(function(e) { self.render(); }).getDailyQuest();
    } else if (route === 'quiz') {
      // params can be plain number "5" or "moduleId|quizType" e.g. "5|PreTest"
      var paramStr = String(params || '1');
      var parts = paramStr.split('|');
      var mId = parts[0] || 1;
      var qType = parts[1] || null;
      this.state.quiz.moduleId = mId;
      this.state.quiz.quizType = qType;
      this.state.quiz.currentIndex = 0;
      this.state.quiz.score = 0;
      this.state.quiz.submitted = false; this.state.quiz.awarded = 0; this.state.quiz.alreadyDone = false;
      google.script.run.withSuccessHandler(function(res) {
        if (res.success) self.state.quiz.questions = res.data;
        self.render();
      }).withFailureHandler(function(e) { self.render(); }).getQuizQuestions(mId, qType);
    } else if (route === 'lesson') {
      this.state.currentModuleId = params || 1;
      this.state.currentRoute = 'lesson';
      this.render();
    } else if (route === 'flashcards') {
      var fmId = params || 1;
      this.state.flashcards.moduleId = fmId;
      this.state.flashcards.currentIndex = 0;
      this.state.flashcards.submitted = false; this.state.flashcards.awarded = 0; this.state.flashcards.alreadyDone = false;
      google.script.run.withSuccessHandler(function(res) {
        if (res.success) self.state.flashcards.cards = res.data;
        self.render();
      }).withFailureHandler(function(e) { self.render(); }).getFlashcards(fmId);
    } else if (route === 'admin') {
      this.render();
    } else if (route === 'adminDB') {
      google.script.run.withSuccessHandler(function(res) {
        if (res.success) self.state.admin.tables = res.data;
        self.render();
      }).withFailureHandler(function(e) { self.render(); }).adminGetTables();
    } else if (route === 'adminExport') {
      this.render();
    } else if (route === 'bonusQR') {
      google.script.run.withSuccessHandler(function(res) {
        if (res.success) self.state.bonusScore = { total: res.total, history: res.history };
        self.render();
      }).withFailureHandler(function() { self.render(); }).getBonusScore(self.state.user.UserID);
    } else if (route === 'community') {
      this.state.community.loaded = false;
      this.render();
      google.script.run.withSuccessHandler(function(res) {
        if (res && res.success) self.state.community = { titles: res.titles, feed: res.feed, loaded: true };
        else self.state.community.loaded = true;
        if (self.state.currentRoute === 'community') self.render();
      }).withFailureHandler(function() { self.state.community.loaded = true; self.render(); }).getCommunityData();
    } else if (route === 'wordBridge') {
      this.initWordBridge();
      this.render();
    } else if (route === 'adminScanner') {
      this.state.scannedUser = null;
      this.render();
    } else if (route === 'adminQuizBuilder') {
      this.render();
    } else if (route === 'adminTable') {
      var tName = params;
      this.state.admin.currentTable = tName;
      this.state.admin.editingRow = -1;
      google.script.run.withSuccessHandler(function(res) {
        if (res.success) {
          self.state.admin.headers = res.headers;
          self.state.admin.data = res.data;
        }
        self.render();
      }).withFailureHandler(function(e) { self.render(); }).adminGetTableData(tName);
    } else {
      this.render();
    }
  },

  render: function() {
    var el = document.getElementById('app');
    if (!el) return;
    var html = '';
    var r = this.state.currentRoute;

    if (r === 'login') { html = this.viewLogin(); }
    else if (r === 'register') { html = this.viewRegister(); }
    else if (r === 'dashboard') { html = this.viewDashboard() + this.bottomNav('home'); }
    else if (r === 'lessons') { html = this.viewLessons() + this.bottomNav('lessons'); }
    else if (r === 'moduleDetail') { html = this.viewModuleDetail(); }
    else if (r === 'lesson') { html = this.viewLesson(); }
    else if (r === 'quiz' || r === 'dailyQuest') { html = this.viewQuiz(); }
    else if (r === 'flashcards') { html = this.viewFlashcards(); }
    else if (r === 'profile') { html = this.viewProfile() + this.bottomNav('profile'); }
    else if (r === 'profileEdit') { html = this.viewProfileEdit() + this.bottomNav('profile'); }
    else if (r === 'leaderboard') { html = this.viewLeaderboard() + this.bottomNav('home'); }
    else if (r === 'guide') { html = this.viewGuide() + this.bottomNav('profile'); }
    else if (r === 'bonusQR') { html = this.viewBonusQR() + this.bottomNav('bonus'); }
    else if (r === 'wordBridge') { html = this.viewWordBridge() + this.bottomNav('home'); }
    else if (r === 'community') { html = this.viewCommunity() + this.bottomNav('home'); }
    else if (r === 'admin') { html = this.viewAdmin(); }
    else if (r === 'adminScanner') { html = this.viewAdminScanner(); }
    else if (r === 'adminDB') { html = this.viewAdminDB(); }
    else if (r === 'adminTable') { html = this.viewAdminTable(); }
    else if (r === 'adminExport') { html = this.viewAdminExport(); }
    else if (r === 'adminQuizBuilder') { html = this.viewAdminQuizBuilder(); }
    else { html = '<div class="loader">Page not found</div>'; }

    el.innerHTML = html;
    this.postRender();
  },

  postRender: function() {
    var r = this.state.currentRoute;
    if (r === 'bonusQR') this.initBonusQR();
    else if (r === 'adminScanner') this.initQRScanner();
    else if (r === 'profileEdit' && this.state.cropperOpen) this.initCropper();
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
      '<div class="text-center" style="margin-bottom: 28px;">' +
        '<div class="mascot-bounce" style="font-size: 90px; filter: drop-shadow(0 10px 0 rgba(200,140,80,0.3)); display:inline-block;">' + this.bear + '</div>' +
        '<h1 class="text-title" style="background: linear-gradient(135deg, var(--bear-brown), var(--clay-purple)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-size: 28px; margin-bottom: 6px;">เรียนรู้พิชิตบทเรียน</h1>' +
        '<div style="display:inline-block; background:linear-gradient(135deg,#FFE0CC,#EED5FF); border-radius:20px; padding:6px 18px; font-size:14px; font-weight:800; color:var(--bear-brown); box-shadow:0 4px 0 rgba(200,140,80,0.2);">ชั้น ม.6 (ว.ส.ค.69) 🐾</div>' +
      '</div>' +
      '<div class="card" style="padding: 20px;">' +
        '<input type="text" class="input-field" placeholder="👤 Username (รหัสนักเรียน)" id="username">' +
        '<input type="password" class="input-field" placeholder="🔒 Password" id="password">' +
        '<button class="btn btn-primary" onclick="App.handleLogin()">🐻 เข้าสู่ระบบ</button>' +
        '<button class="btn btn-outline" onclick="App.navigate(\'register\')">สมัครสมาชิกใหม่</button>' +
      '</div>' +
      '<div style="margin-top: 20px; text-align: center; font-size: 11px; color: var(--clay-text-light);">' +
        '<b>พัฒนาโดย:</b> ครูกฤษณะ เจี๊ยะทา &nbsp;|&nbsp; <b>เนื้อหา:</b> ครูจิตสุภา คำโหงษ์' +
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
        '<input type="text" class="input-field" placeholder="ห้อง (เช่น ม.6/1)" id="reg-class">' +
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

  viewDashboard: function() {
    var u = this.state.user;
    var d = this.state.dashboardData;

    return '<div class="page-content">' +
      // Clay header greeting
      '<div style="background:linear-gradient(135deg,#FF8C42,#C084FC); border-radius:28px; padding:16px 20px; margin-bottom:18px; box-shadow:0 8px 0 rgba(160,80,200,0.2),0 14px 28px rgba(160,80,200,0.15); display:flex; gap:12px; align-items:center;">' +
        '<div class="mascot-bounce" style="font-size:52px; filter:drop-shadow(0 4px 0 rgba(0,0,0,0.15)); flex-shrink:0;">' + this.bear + '</div>' +
        '<div>' +
          '<div style="font-size:18px; font-weight:800; color:white;">สวัสดี ' + u.FirstName + '! 🐾</div>' +
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
      // Bonus score (คะแนนพิเศษ)
      '<div class="card action-card" style="background:linear-gradient(145deg,#F8F3FF,#EEE0FF); box-shadow:0 6px 0 rgba(160,80,200,0.2),0 10px 20px rgba(160,80,200,0.10); margin-bottom:16px; cursor:pointer; padding:16px;" onclick="App.navigate(\'bonusQR\')">' +
        '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">' +
          '<div style="font-weight:800; font-size:15px; color:var(--clay-purple-shadow);">⭐ คะแนนพิเศษ</div>' +
          '<div style="font-weight:800; font-size:18px; color:var(--clay-purple-shadow);">' + this.state.bonusScore.total + '<span style="font-size:13px; color:var(--clay-text-light);">/100</span></div>' +
        '</div>' +
        '<div class="progress-bar-container" style="margin:0; height:12px;"><div class="progress-bar-fill" style="width:' + this.state.bonusScore.total + '%; height:100%; border-radius:10px; background:linear-gradient(90deg,#4ECB71,#C084FC);"></div></div>' +
        '<div style="font-size:11px; color:var(--clay-text-light); margin-top:6px; text-align:right;">แตะเพื่อดู QR รับคะแนนจากคุณครู 🎫</div>' +
      '</div>' +
      // Quick Actions
      '<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">' +
        '<div class="card action-card" style="background:linear-gradient(145deg,#FFF3E0,#FFE8CC); box-shadow:0 6px 0 rgba(200,140,80,0.2),0 10px 20px rgba(200,140,80,0.10); text-align:center; padding:20px 12px;" onclick="App.navigate(\'lessons\')">' +
          '<div style="font-size:38px;">📚</div>' +
          '<div style="font-weight:800; font-size:14px; color:var(--bear-brown); margin-top:8px;">เริ่มเรียน</div>' +
          '<div style="font-size:11px; color:var(--clay-text-light); margin-top:4px;">4 โมดูล</div>' +
        '</div>' +
        '<div class="card action-card" style="background:linear-gradient(145deg,#FFF9D0,#FFF0A0); box-shadow:0 6px 0 rgba(180,160,60,0.2),0 10px 20px rgba(180,160,60,0.10); text-align:center; padding:20px 12px;" onclick="App.navigate(\'leaderboard\')">' +
          '<div style="font-size:38px;">🏆</div>' +
          '<div style="font-weight:800; font-size:14px; color:var(--clay-yellow-shadow); margin-top:8px;">อันดับ</div>' +
          '<div style="font-size:11px; color:var(--clay-text-light); margin-top:4px;">Leaderboard</div>' +
        '</div>' +
      '</div>' +
      // Bear recommendation
      '<div class="card" style="background:linear-gradient(145deg,#F8F3FF,#EEE8FF); box-shadow:0 6px 0 rgba(160,100,220,0.2),0 10px 20px rgba(160,100,220,0.10);">' +
        '<div style="display:flex; gap:12px; align-items:center; margin-bottom:12px;">' +
          '<div style="font-size:36px;">' + this.bear + '</div>' +
          '<div>' +
            '<div style="font-weight:800; font-size:15px; color:var(--clay-purple-shadow);">🐾 พี่หมีน้อยแนะนำ</div>' +
            '<div style="font-size:13px; color:var(--clay-text-light); margin-top:4px;">ทบทวน <b style="color:var(--clay-text);">' + d.recommendation.weakness + '</b> นะ!</div>' +
          '</div>' +
        '</div>' +
        '<button class="btn btn-primary" style="margin-bottom:0; font-size:13px;" onclick="App.navigate(\'quiz\', ' + d.recommendation.module + ')">ฝึกเลย! ⚡</button>' +
      '</div>' +
      // Daily Quest
      '<div class="card action-card" style="background:linear-gradient(145deg,#E0EEFF,#CCE0FF); box-shadow:0 6px 0 rgba(60,130,220,0.2),0 10px 20px rgba(60,130,220,0.10); margin-top:4px; cursor:pointer;" onclick="App.navigate(\'dailyQuest\')">' +
        '<div style="display:flex; align-items:center; gap:12px;">' +
          '<div style="font-size:40px;">' + this.bear + '</div>' +
          '<div style="flex:1;">' +
            '<div style="font-weight:800; font-size:15px; color:var(--clay-blue-shadow);">⭐ แบบฝึกหัดประจำวัน</div>' +
            '<div style="font-size:12px; color:var(--clay-text-light); margin-top:4px;">ทำโจทย์สุ่ม 10 ข้อเพื่อรับ XP พิเศษ!</div>' +
          '</div>' +
          '<div style="width:36px; height:36px; border-radius:50%; background:white; box-shadow:0 4px 0 rgba(60,130,220,0.2); display:flex; align-items:center; justify-content:center; font-size:16px; color:var(--clay-blue);">▶</div>' +
        '</div>' +
      '</div>' +
      // Word Bridge Game
      '<div class="card action-card" style="background:linear-gradient(145deg,#FCE0FF,#EFD0FF); box-shadow:0 6px 0 rgba(160,80,200,0.2),0 10px 20px rgba(160,80,200,0.10); margin-top:12px; cursor:pointer;" onclick="App.navigate(\'wordBridge\')">' +
        '<div style="display:flex; align-items:center; gap:12px;">' +
          '<div style="font-size:40px;">🌉</div>' +
          '<div style="flex:1;">' +
            '<div style="font-weight:800; font-size:15px; color:var(--clay-purple-shadow);">🔗 เกมสะพานคำ (Word Bridge)</div>' +
            '<div style="font-size:12px; color:var(--clay-text-light); margin-top:4px;">เรียงคำศัพท์เชื่อมต้นทางถึงปลายทาง รับ EXP สูงสุด 100!</div>' +
          '</div>' +
          '<div style="width:36px; height:36px; border-radius:50%; background:white; box-shadow:0 4px 0 rgba(160,80,200,0.2); display:flex; align-items:center; justify-content:center; font-size:16px; color:var(--clay-purple);">▶</div>' +
        '</div>' +
      '</div>' +
      // Community
      '<div class="card action-card" style="background:linear-gradient(145deg,#E0F7FA,#C8EEF5); box-shadow:0 6px 0 rgba(60,170,200,0.2),0 10px 20px rgba(60,170,200,0.10); margin-top:12px; cursor:pointer;" onclick="App.navigate(\'community\')">' +
        '<div style="display:flex; align-items:center; gap:12px;">' +
          '<div style="font-size:40px;">🌟</div>' +
          '<div style="flex:1;">' +
            '<div style="font-weight:800; font-size:15px; color:#0E7C8B;">🌟 ชุมชนนักเรียน</div>' +
            '<div style="font-size:12px; color:var(--clay-text-light); margin-top:4px;">ดูตำแหน่งพิเศษ + ความเคลื่อนไหวของเพื่อนๆ ทั้งระดับ</div>' +
          '</div>' +
          '<div style="width:36px; height:36px; border-radius:50%; background:white; box-shadow:0 4px 0 rgba(60,170,200,0.2); display:flex; align-items:center; justify-content:center; font-size:16px; color:#0E7C8B;">▶</div>' +
        '</div>' +
      '</div>' +
    '</div>';
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

  viewCommunity: function() {
    var c = this.state.community;
    var myId = this.state.user ? this.state.user.UserID : null;

    if (!c.loaded) {
      return '<div class="page-content">' + this.communityHeader() +
        '<div class="loader" style="height:auto; padding:40px 0;"><div class="loader-bear">' + this.bear + '</div><div class="loader-text">กำลังโหลดชุมชน...</div></div>' +
      '</div>';
    }

    // Special titles
    var titlesHtml = '';
    for (var i = 0; i < c.titles.length; i++) {
      var t = c.titles[i];
      var has = t.holderId;
      var mine = myId && t.holderId === myId;
      titlesHtml += '<div style="flex:0 0 auto; width:140px; background:' + (mine ? 'linear-gradient(145deg,#FFF3E0,#FFE0CC)' : 'var(--clay-white)') + '; border-radius:18px; padding:14px; box-shadow:0 5px 0 rgba(150,100,200,0.12),0 8px 16px rgba(150,100,200,0.08);' + (mine ? 'border:2px solid var(--bear-orange);' : '') + '">' +
        '<div style="font-size:30px; text-align:center;">' + t.emoji + '</div>' +
        '<div style="font-weight:800; font-size:12px; text-align:center; color:var(--clay-text); margin-top:4px;">' + t.label + '</div>' +
        '<div style="font-size:10px; text-align:center; color:var(--clay-text-light); margin-bottom:6px;">' + t.desc + '</div>' +
        (has
          ? '<div style="font-size:11px; font-weight:800; text-align:center; color:var(--clay-purple-shadow); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + t.holderName + '</div><div style="font-size:10px; text-align:center; color:var(--bear-orange); font-weight:800;">' + t.value + ' ' + t.unit + (mine ? ' · คุณ! 🎉' : '') + '</div>'
          : '<div style="font-size:10px; text-align:center; color:var(--clay-text-light);">ยังไม่มีเจ้าของ</div>') +
      '</div>';
    }

    // Feed
    var feedHtml = '';
    if (c.feed.length === 0) {
      feedHtml = '<p class="text-center" style="color:var(--clay-text-light); font-weight:700; padding:20px 0;">ยังไม่มีความเคลื่อนไหว</p>';
    } else {
      for (var f = 0; f < c.feed.length; f++) {
        var it = c.feed[f];
        var av = it.img ? '<img src="' + it.img + '" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;">' : '<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#EDE9F7,#DDD4EF);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">👤</div>';
        feedHtml += '<div style="display:flex; align-items:center; gap:12px; background:var(--clay-white); border-radius:16px; padding:12px 14px; margin-bottom:8px; box-shadow:0 4px 0 rgba(150,100,200,0.10),0 6px 12px rgba(150,100,200,0.06);">' +
          av +
          '<div style="flex:1; min-width:0;">' +
            '<div style="font-size:13px; color:var(--clay-text);"><b>' + it.name + '</b> <span style="color:var(--clay-text-light); font-size:11px;">' + (it.cls || '') + '</span></div>' +
            '<div style="font-size:13px; color:var(--clay-text); margin-top:2px;">' + it.emoji + ' ' + it.text + '</div>' +
          '</div>' +
          '<div style="font-size:10px; color:var(--clay-text-light); flex-shrink:0; text-align:right;">' + this.timeAgo(it.at) + '</div>' +
        '</div>';
      }
    }

    return '<div class="page-content">' + this.communityHeader() +
      '<div style="font-weight:800; font-size:15px; color:var(--clay-text); margin:4px 0 10px;">🏅 ตำแหน่งพิเศษประจำระดับ</div>' +
      '<div style="display:flex; gap:10px; overflow-x:auto; padding-bottom:8px; margin-bottom:16px; -webkit-overflow-scrolling:touch;">' + titlesHtml + '</div>' +
      '<div style="font-weight:800; font-size:15px; color:var(--clay-text); margin:4px 0 10px;">📣 ความเคลื่อนไหวล่าสุด</div>' +
      feedHtml +
    '</div>';
  },

  communityHeader: function() {
    return '<div style="background:linear-gradient(135deg,#26C6DA,#5BA4F5); border-radius:24px; padding:18px 20px; margin-bottom:16px; box-shadow:0 8px 0 rgba(40,150,180,0.2),0 14px 28px rgba(40,150,180,0.15); display:flex; align-items:center; gap:12px;">' +
      '<div style="font-size:36px; filter:drop-shadow(0 4px 0 rgba(0,0,0,0.12));">🌟</div>' +
      '<div style="flex:1;"><div style="font-size:18px; font-weight:800; color:white;">ชุมชนนักเรียน</div>' +
      '<div style="font-size:12px; color:rgba(255,255,255,0.9);">มาเชียร์กันให้เก่งขึ้นทั้งระดับ! 🎉</div></div>' +
      '<button onclick="App.navigate(\'dashboard\')" style="background:rgba(255,255,255,0.25); border:none; width:34px; height:34px; border-radius:50%; font-size:16px; cursor:pointer; color:white;">✕</button>' +
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
    var icons = ['&#x1F4D6;', '&#x1F4DD;', '&#x1F4AC;', '&#x1F9E0;'];
    var bgColors = [
      'linear-gradient(135deg, #e8f5e9, #c8e6c9)',
      'linear-gradient(135deg, #e3f2fd, #bbdefb)',
      'linear-gradient(135deg, #fce4ec, #f8bbd0)',
      'linear-gradient(135deg, #fff3e0, #ffe0b2)'
    ];
    var borderColors = ['var(--duo-green)', 'var(--duo-blue)', 'var(--duo-red)', 'var(--bear-orange)'];
    var shadowColors = ['var(--duo-green-shadow)', 'var(--duo-blue-shadow)', 'var(--duo-red-shadow)', 'var(--bear-brown)'];

    var mods = this.state.modules;
    var modulesHtml = '';

    if (mods && mods.length > 0) {
      var completed = this.state.completedModules || [];
      for (var i = 0; i < mods.length; i++) {
        var m = mods[i];
        var idx = i % 4;
        // Progressive unlock: first unit open; others unlock when previous unit's Post-Test is done
        var prevDone = i === 0 || completed.indexOf(mods[i - 1].id) >= 0;
        var isDone = completed.indexOf(m.id) >= 0;
        var unitNo = i + 1; // display starts at Unit 1, not the DB id
        var statusIcon = isDone
          ? '<div style="width:32px; height:32px; border-radius:50%; background:linear-gradient(135deg,#4ECB71,#35AA57); box-shadow:0 3px 0 rgba(53,170,87,0.3); display:flex; align-items:center; justify-content:center; font-size:16px; color:white;">✓</div>'
          : '<div style="width:32px; height:32px; border-radius:50%; background:white; box-shadow:0 3px 0 rgba(0,0,0,0.08); display:flex; align-items:center; justify-content:center; font-size:14px; color:var(--clay-text-light);">›</div>';

        if (!prevDone) {
          // LOCKED unit
          modulesHtml += '<div class="card module-card" style="background:linear-gradient(145deg,#EFEAF7,#E2DCEF); box-shadow:0 6px 0 rgba(150,130,180,0.2),0 10px 20px rgba(100,60,160,0.06); cursor:not-allowed; opacity:0.75;" onclick="App.lockedUnitHint(' + unitNo + ')">' +
            '<div style="display:flex; align-items:center; gap:16px;">' +
              '<div style="width:56px; height:56px; border-radius:18px; background:rgba(255,255,255,0.7); display:flex; align-items:center; justify-content:center; font-size:26px; flex-shrink:0;">🔒</div>' +
              '<div style="flex:1;">' +
                '<div style="font-weight:800; font-size:16px; color:var(--clay-text-light);">Unit ' + unitNo + ': ' + m.title + '</div>' +
                '<div style="margin-top:4px; font-size:12px; color:var(--clay-text-light);">เรียน Unit ' + (unitNo - 1) + ' ให้จบก่อน (ทำ Post-Test) เพื่อปลดล็อก 🔑</div>' +
              '</div>' +
            '</div>' +
          '</div>';
        } else {
          modulesHtml += '<div class="card module-card" style="background:' + bgColors[idx] + '; box-shadow:0 6px 0 ' + shadowColors[idx].replace('var(--clay-green-shadow)','rgba(53,170,87,0.3)').replace('var(--clay-blue-shadow)','rgba(61,135,224,0.3)').replace('var(--clay-red-shadow)','rgba(224,72,72,0.3)').replace('var(--bear-brown)','rgba(124,79,42,0.3)') + ',0 10px 20px rgba(100,60,160,0.10); cursor:pointer;" onclick="App.showModuleDetail(' + m.id + ', ' + i + ')">' +
            '<div style="display:flex; align-items:center; gap:16px;">' +
              '<div style="width:56px; height:56px; border-radius:18px; background:white; box-shadow:0 4px 0 rgba(0,0,0,0.08); display:flex; align-items:center; justify-content:center; font-size:28px; flex-shrink:0;">' + icons[idx] + '</div>' +
              '<div style="flex:1;">' +
                '<div style="font-weight:800; font-size:16px; color:var(--clay-text);">Unit ' + unitNo + ': ' + m.title + (isDone ? ' <span style="font-size:11px; color:var(--clay-green-shadow);">เรียนจบแล้ว</span>' : '') + '</div>' +
                '<div style="margin-top:4px; font-size:12px; color:var(--clay-text-light);">' + (m.desc || '') + '</div>' +
              '</div>' +
              statusIcon +
            '</div>' +
          '</div>';
        }
      }
    } else {
      modulesHtml = '<div class="loader"><div class="loader-bear">' + this.bear + '</div><div class="loader-text">กำลังโหลดบทเรียน...</div></div>';
    }

    return '<div class="page-content">' +
      '<div style="background:linear-gradient(135deg,#5BA4F5,#C084FC); border-radius:28px; padding:16px 20px; margin-bottom:18px; box-shadow:0 8px 0 rgba(100,80,200,0.2),0 14px 28px rgba(100,80,200,0.15); display:flex; align-items:center; gap:12px;">' +
        '<div style="font-size:40px; filter:drop-shadow(0 4px 0 rgba(0,0,0,0.15));">' + this.bear + '</div>' +
        '<div>' +
          '<div style="font-size:18px; font-weight:800; color:white;">เส้นทางการเรียนรู้</div>' +
          '<div style="font-size:12px; color:rgba(255,255,255,0.85); margin-top:4px;">เลือกโมดูลที่อยากเรียนได้เลยนะ! 📚</div>' +
        '</div>' +
      '</div>' +
      modulesHtml +
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

    var optionsHtml = '';
    for (var i = 0; i < shuffledOptions.length; i++) {
      var safeOpt = shuffledOptions[i].replace(/'/g, "\\'").replace(/\n/g, ' ');
      optionsHtml += '<button class="btn quiz-option" onclick="App.answerQuiz(this, \'' + safeOpt + '\')">' + shuffledOptions[i] + '</button>';
    }

    // Context box for conversation/reading questions
    var contextHtml = '';
    if (q.context) {
      var formattedCtx = q.context.replace(/\n/g, '<br>');
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
        '<div class="speech-bubble" style="flex:1; font-size:15px; font-weight:600; line-height:1.5; white-space:pre-line;">' + q.text + '</div>' +
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
    this.navigate('leaderboard');
  },

  viewLeaderboard: function() {
    var lb = this.state.leaderboard;
    var myId = this.state.user ? this.state.user.UserID : null;
    var listHtml = '';
    for (var i = 0; i < lb.length; i++) {
      var s = lb[i];
      var medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '<span style="font-weight:800; font-size:15px; color:var(--clay-text-light);">' + (i + 1) + '</span>';
      var av = s.profileImage ? '<img src="' + s.profileImage + '" style="width:44px;height:44px;border-radius:50%;object-fit:cover;box-shadow:0 3px 0 rgba(0,0,0,0.1);">' : '<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#EDE9F7,#DDD4EF);display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 3px 0 rgba(150,100,200,0.2);">👤</div>';
      var isMe = myId && s.id === myId;
      var itemStyle = isMe
        ? 'background:linear-gradient(145deg,#FFF3E0,#FFE8CC); border-radius:20px; box-shadow:0 5px 0 rgba(200,140,80,0.2),0 8px 16px rgba(200,140,80,0.10); padding:12px 14px; margin-bottom:8px; border:2px solid var(--bear-orange);'
        : 'background:var(--clay-white); border-radius:18px; box-shadow:0 4px 0 rgba(150,100,200,0.12),0 6px 12px rgba(150,100,200,0.08); padding:10px 14px; margin-bottom:8px;';
      listHtml += '<div style="display:flex; justify-content:space-between; align-items:center; ' + itemStyle + '">' +
        '<div style="display:flex; align-items:center; gap:12px; min-width:0;">' +
          '<div style="width:28px; text-align:center; font-size:20px; flex-shrink:0;">' + medal + '</div>' + av +
          '<div style="min-width:0;"><div style="font-weight:700; font-size:14px; color:var(--clay-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + s.name + (isMe ? ' <span style="color:var(--bear-orange); font-size:11px;">(คุณ)</span>' : '') + '</div>' +
            '<div style="font-size:12px; color:var(--clay-text-light);">' + (s.className || '-') + '</div></div>' +
        '</div>' +
        '<div style="background:linear-gradient(135deg,#FF8C42,#C084FC); border-radius:12px; padding:6px 12px; font-weight:800; color:white; font-size:13px; box-shadow:0 3px 0 rgba(160,80,200,0.2); flex-shrink:0;">' + s.xp + ' XP</div>' +
      '</div>';
    }
    if (!listHtml) listHtml = '<p class="text-center" style="font-weight:bold; color:var(--clay-text-light); padding:20px 0;">ยังไม่มีข้อมูล</p>';

    // Filter dropdown
    var cur = this.state.leaderboardFilter || '';
    var optionsHtml = '<option value=""' + (cur === '' ? ' selected' : '') + '>🌐 ทั้งระดับ (ทุกห้อง)</option>';
    var classes = this.state.leaderboardClasses || [];
    for (var c = 0; c < classes.length; c++) {
      optionsHtml += '<option value="' + classes[c] + '"' + (cur === classes[c] ? ' selected' : '') + '>🏫 ' + classes[c] + '</option>';
    }

    return '<div class="page-content" style="padding:0;">' +
      '<div style="background:linear-gradient(135deg,#FF8C42,#C084FC); border-radius:0 0 28px 28px; padding:20px; box-shadow:0 8px 0 rgba(160,80,200,0.2),0 14px 28px rgba(160,80,200,0.15); margin-bottom:16px;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">' +
          '<div style="display:flex; align-items:center; gap:10px;">' +
            '<div style="font-size:32px; filter:drop-shadow(0 4px 0 rgba(0,0,0,0.15));">' + this.bear + '</div>' +
            '<div><div style="font-size:20px; font-weight:800; color:white;">🏆 Leaderboard</div>' +
            '<div style="font-size:12px; color:rgba(255,255,255,0.85);">' + lb.length + ' คน' + (cur ? ' · ' + cur : ' · ทั้งระดับ') + '</div></div>' +
          '</div>' +
          '<button onclick="App.navigate(\'dashboard\')" style="background:rgba(255,255,255,0.25); border:none; width:36px; height:36px; border-radius:50%; font-size:18px; cursor:pointer; color:white; display:flex; align-items:center; justify-content:center;">✕</button>' +
        '</div>' +
        '<select onchange="App.setLeaderboardFilter(this.value)" style="width:100%; padding:12px 16px; border:none; border-radius:16px; font-family:var(--font-main); font-weight:700; font-size:14px; color:var(--clay-text); background:rgba(255,255,255,0.95); box-shadow:inset 0 2px 6px rgba(0,0,0,0.08); -webkit-appearance:none; appearance:none; cursor:pointer;">' + optionsHtml + '</select>' +
      '</div>' +
      '<div style="padding:0 16px;">' + listHtml + '</div>' +
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
        '<div style="font-weight:800; font-size:22px; color:white;">' + u.FirstName + ' ' + u.LastName + '</div>' +
        '<div style="font-size:13px; color:rgba(255,255,255,0.85); margin-top:4px;">' + (u.Class || '-') + ' เลขที่ ' + (u.Number || '-') + '</div>' +
        '<button onclick="App.openProfileEdit()" style="margin-top:12px; background:rgba(255,255,255,0.95); border:none; border-radius:14px; padding:8px 18px; font-family:var(--font-main); font-weight:800; font-size:13px; color:var(--clay-purple-shadow); cursor:pointer; box-shadow:0 3px 0 rgba(0,0,0,0.12);">✏️ แก้ไขโปรไฟล์</button>' +
      '</div>' +
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
      // name fields
      '<div class="card">' +
        '<div style="font-weight:800; font-size:14px; color:var(--clay-text); margin-bottom:8px;">ชื่อ</div>' +
        '<input id="edit-firstname" class="input-field" style="margin-bottom:14px;" value="' + (u.FirstName || '').replace(/"/g,'&quot;') + '" placeholder="ชื่อ">' +
        '<div style="font-weight:800; font-size:14px; color:var(--clay-text); margin-bottom:8px;">นามสกุล</div>' +
        '<input id="edit-lastname" class="input-field" style="margin-bottom:0;" value="' + (u.LastName || '').replace(/"/g,'&quot;') + '" placeholder="นามสกุล">' +
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
        self.render();
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
    this.render();
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
    this.render();
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
    var fn = document.getElementById('edit-firstname').value.trim();
    var ln = document.getElementById('edit-lastname').value.trim();
    var st = document.getElementById('profile-save-status');
    if (!fn) { if (st) { st.style.color = 'var(--clay-red)'; st.innerText = 'กรุณากรอกชื่อ'; } return; }
    if (st) { st.style.color = 'var(--clay-text-light)'; st.innerText = 'กำลังบันทึก... ⏳'; }
    var newAvatar = this.state.editAvatar;

    var doneName = false, doneImg = !newAvatar;
    var finish = function() {
      if (!doneName || !doneImg) return;
      self.state.user.FirstName = fn; self.state.user.LastName = ln;
      if (newAvatar) self.state.user.ProfileImage = newAvatar;
      localStorage.setItem('lms_user', JSON.stringify(self.state.user));
      self.state.editAvatar = null;
      self.navigate('profile');
    };
    google.script.run.withSuccessHandler(function(res) {
      if (!res.success) { if (st) { st.style.color = 'var(--clay-red)'; st.innerText = res.message || 'บันทึกชื่อไม่สำเร็จ'; } return; }
      doneName = true; finish();
    }).withFailureHandler(function(e){ if(st){st.style.color='var(--clay-red)'; st.innerText='Error: '+e.message;} }).updateProfileName(this.state.user.UserID, fn, ln);

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
        '<div style="font-size:18px;font-weight:800;color:white;">' + u.FirstName + ' ' + u.LastName + '</div>' +
        '<div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">' + u.Class + ' · เลขที่ ' + u.Number + '</div>' +
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
            '<div style="font-size:18px;font-weight:800;color:white;">' + scanned.first_name + ' ' + scanned.last_name + '</div>' +
            '<div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:3px;">' + scanned.class_name + ' · เลขที่ ' + scanned.student_number + '</div>' +
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
      
      '<h3 style="color:var(--duo-text-light); font-size:14px; margin-top:0;">จัดการผู้เรียน</h3>' +
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

  viewAdminExport: function() {
    return '<div class="page-content">' +
      '<button onclick="App.navigate(\'admin\')" style="background:none; border:none; font-size:18px; color:var(--duo-text-light); cursor:pointer; padding:0; margin-bottom:16px; font-weight:700;">&#x2190; กลับ</button>' +
      '<h2 class="text-title" style="color:var(--bear-brown); margin-top:0;">&#x1F4CA; ดาวน์โหลดคะแนน (CSV)</h2>' +
      '<div class="card">' +
        '<p style="font-size:14px; color:var(--duo-text-light); margin-top:0;">เลือกห้องเรียนที่ต้องการดาวน์โหลดข้อมูลคะแนน ระบบจะสร้างไฟล์ CSV ที่สามารถเปิดด้วย Excel ได้ทันที</p>' +
        '<label style="display:block; font-weight:bold; margin-bottom:8px; font-size:14px;">เลือกห้องเรียน:</label>' +
        '<select id="export-class" class="input-field" style="margin-bottom:16px;">' +
          '<option value="ALL">ทุกห้อง (ALL)</option>' +
          '<option value="ม.6/1">ม.6/1</option>' +
          '<option value="ม.6/2">ม.6/2</option>' +
          '<option value="ม.6/3">ม.6/3</option>' +
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
        var val = row[headers[c]] || '';
        if (isEditing) {
          tdHtml += '<td style="padding:4px; border:1px solid #ccc;"><input type="text" id="edit-' + r + '-' + headers[c] + '" value="' + val + '" style="width:100%; box-sizing:border-box; padding:6px; border:1px solid var(--bear-orange); border-radius:4px;"></td>';
        } else {
          tdHtml += '<td style="padding:10px; border:1px solid #ccc; font-size:13px; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="' + val + '">' + val + '</td>';
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
    var tabs = [
      { id:'home',    icon:'&#x1F3E0;', label:'หน้าหลัก', route:'dashboard' },
      { id:'lessons', icon:'&#x1F4DA;', label:'บทเรียน',  route:'lessons' },
      { id:'bonus',   icon:'&#x1F3AB;', label:'QR คะแนน', route:'bonusQR' },
      { id:'profile', icon:'&#x1F43E;', label:'โปรไฟล์',  route:'profile' }
    ];
    var navHtml = '';
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      var cls = activeTab === tab.id ? 'nav-item active' : 'nav-item';
      navHtml += '<div class="' + cls + '" onclick="App.navigate(\'' + tab.route + '\')">' +
        '<div class="nav-icon-wrap"><div class="nav-icon">' + tab.icon + '</div></div>' +
        '<div class="nav-label">' + tab.label + '</div>' +
      '</div>';
    }
    return '<div class="bottom-nav">' + navHtml + '</div>';
  },

  /* ===== CONTROLLERS ===== */

  logout: function() {
    this.state.user = null;
    this.state.dataLoaded = false;
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
          if (response.user.Role === 'Admin') {
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

  answerQuiz: function(btnElem, selectedOpt) {
    var qState = this.state.quiz;
    var q = qState.questions[qState.currentIndex];
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
      feedbackEl.innerHTML = '<div style="display:flex; align-items:center; gap:8px;"><span style="font-size:24px;">' + this.bear + '</span><div><h3 style="margin:0; color:var(--duo-green-shadow); font-size:16px;">ถูกต้อง!</h3><p style="margin:4px 0 0 0; font-size:13px; color:var(--duo-green-shadow);">' + q.explanation + '</p></div></div>';
      footerEl.style.backgroundColor = '#d7ffb8';
      nextBtn.className = 'btn btn-primary';
    } else {
      btnElem.classList.add('incorrect');
      feedbackEl.innerHTML = '<div style="display:flex; align-items:center; gap:8px;"><span style="font-size:24px;">' + this.bear + '</span><div><h3 style="margin:0; color:var(--duo-red-shadow); font-size:16px;">คำตอบที่ถูกต้อง:</h3><p style="margin:4px 0 0 0; font-weight:800; font-size:15px; color:var(--duo-red-shadow);">' + q.correctAnswer + '</p><p style="margin:4px 0 0 0; font-size:12px; color:var(--duo-red-shadow);">' + q.explanation + '</p></div></div>';
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
        self.render();
      }).withFailureHandler(function() {
        self.state.quiz.submitted = true; self.state.quiz.awarded = potentialXp; self.render();
      }).submitQuizScore(this.state.user.UserID, effectiveType, effectiveRef, this.state.quiz.score, this.state.quiz.questions.length, 0);
    }
    this.render();
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
        self.render();
      }).withFailureHandler(function() {
        self.state.flashcards.submitted = true; self.state.flashcards.awarded = 20; self.render();
      }).submitQuizScore(this.state.user.UserID, 'Flashcards', Number(this.state.flashcards.moduleId), 2, 2, 0);
    }
    this.render();
  },

  /* ===== ADMIN CONTROLLERS ===== */

  adminCancelEdit: function() {
    this.state.admin.editingRow = -1;
    this.render();
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
        if (st) st.innerText = '❌ Error: ' + e.message;
      })
      .adminGiveBonus(targetUser.id, pts, self.state.user ? self.state.user.UserID : 0);
  },

  /* ===== WORD BRIDGE GAME ===== */

  initWordBridge: function() {
    var wb = this.state.wordBridge;
    // Reset progress and check if already played (one-time EXP)
    wb.puzzleIndex = 0;
    wb.checked = false;
    wb.correctTotal = 0;
    wb.finished = false;
    wb.awarded = 0;
    wb.started = false;
    // total slots across all puzzles
    var total = 0;
    for (var i = 0; i < this.wordBridgePuzzles.length; i++) total += this.wordBridgePuzzles[i].chain.length;
    wb.totalSlots = total;
    this.wbLoadPuzzle(0);
    // check completion status
    var self = this;
    google.script.run.withSuccessHandler(function(res) {
      if (res && res.played) { self.state.wordBridge.alreadyDone = true; if (self.state.currentRoute === 'wordBridge') self.render(); }
      else { self.state.wordBridge.alreadyDone = false; }
    }).withFailureHandler(function(){}).getGameStatus(this.state.user.UserID, 'WordBridge');
  },

  wbLoadPuzzle: function(idx) {
    var wb = this.state.wordBridge;
    var p = this.wordBridgePuzzles[idx];
    wb.checked = false;
    wb.slots = new Array(p.chain.length).fill(null);
    // pool = chain + decoys, shuffled
    var pool = p.chain.concat(p.decoys || []);
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    wb.pool = pool.map(function(w) { return { word: w, used: false }; });
  },

  wbPlaceWord: function(poolIdx) {
    var wb = this.state.wordBridge;
    if (wb.checked) return;
    var item = wb.pool[poolIdx];
    if (!item || item.used) return;
    // find first empty slot
    var empty = wb.slots.indexOf(null);
    if (empty === -1) return;
    wb.slots[empty] = poolIdx;
    item.used = true;
    this.render();
  },

  wbRemoveSlot: function(slotIdx) {
    var wb = this.state.wordBridge;
    if (wb.checked) return;
    var poolIdx = wb.slots[slotIdx];
    if (poolIdx === null || poolIdx === undefined) return;
    wb.pool[poolIdx].used = false;
    wb.slots[slotIdx] = null;
    this.render();
  },

  wbCheck: function() {
    var wb = this.state.wordBridge;
    var p = this.wordBridgePuzzles[wb.puzzleIndex];
    if (wb.slots.indexOf(null) !== -1) return; // not full
    var correct = 0;
    for (var i = 0; i < p.chain.length; i++) {
      var placedWord = wb.pool[wb.slots[i]].word;
      if (placedWord === p.chain[i]) correct++;
    }
    wb.correctTotal += correct;
    wb.checked = true;
    this.render();
  },

  wbNext: function() {
    var wb = this.state.wordBridge;
    if (wb.puzzleIndex < this.wordBridgePuzzles.length - 1) {
      wb.puzzleIndex++;
      this.wbLoadPuzzle(wb.puzzleIndex);
      this.render();
    } else {
      // finished — compute EXP and submit (one-time)
      wb.finished = true;
      var self2 = this; setTimeout(function() { self2.celebrate(70); }, 200);
      var exp = Math.round((wb.correctTotal / wb.totalSlots) * 100);
      if (exp > 100) exp = 100;
      var self = this;
      google.script.run.withSuccessHandler(function(res) {
        wb.awarded = res && !res.alreadyDone ? res.awarded : 0;
        wb.alreadyDone = res ? res.alreadyDone : false;
        self.render();
      }).withFailureHandler(function() { self.render(); }).submitGameScore(this.state.user.UserID, 'WordBridge', exp);
      this.render();
    }
  },

  viewWordBridge: function() {
    var wb = this.state.wordBridge;

    // ----- Results screen -----
    if (wb.finished) {
      var exp = Math.round((wb.correctTotal / wb.totalSlots) * 100);
      if (exp > 100) exp = 100;
      var note = wb.alreadyDone
        ? '<div style="font-size:12px; color:var(--clay-text-light); margin-top:8px;">* คุณเคยเล่นเกมนี้แล้ว จึงไม่ได้รับ EXP เพิ่ม (เล่นซ้ำเพื่อฝึกได้)</div>'
        : '<div style="font-size:12px; color:var(--clay-text-light); margin-top:8px;">* ได้รับ EXP จากเกมนี้ครั้งแรกครั้งเดียว</div>';
      return '<div class="page-content" style="display:flex; flex-direction:column; justify-content:center; align-items:center;">' +
        '<div class="mascot-bounce" style="font-size:72px; margin-bottom:12px;">' + this.bear + '</div>' +
        '<div style="font-size:34px; margin-bottom:6px;">🌉</div>' +
        '<h2 class="text-title" style="color:var(--clay-purple-shadow);">สร้างสะพานครบแล้ว!</h2>' +
        '<div class="card" style="width:100%; text-align:center; margin:16px 0;">' +
          '<p style="font-size:18px; font-weight:800; color:var(--clay-text); margin:0 0 8px 0;">เชื่อมถูก: ' + wb.correctTotal + ' / ' + wb.totalSlots + '</p>' +
          '<div style="font-size:26px; font-weight:800; color:var(--bear-orange);">' + (wb.awarded > 0 ? '+' + wb.awarded + ' EXP' : (exp + ' คะแนน')) + '</div>' +
          note +
        '</div>' +
        '<button class="btn btn-primary" style="margin-bottom:8px;" onclick="App.navigate(\'wordBridge\')">เล่นอีกครั้ง 🔄</button>' +
        '<button class="btn btn-outline" onclick="App.navigate(\'dashboard\')">กลับหน้าหลัก</button>' +
      '</div>';
    }

    // ----- Intro screen -----
    if (!wb.started) {
      var doneBadge = wb.alreadyDone
        ? '<div style="background:linear-gradient(135deg,#E8F5E9,#C8E6C9); border-radius:14px; padding:10px 14px; font-size:12px; font-weight:700; color:var(--clay-green-shadow); margin-bottom:14px;">✅ คุณเคยรับ EXP จากเกมนี้แล้ว — เล่นซ้ำเพื่อฝึกได้แต่ไม่ได้ EXP เพิ่ม</div>'
        : '<div style="background:linear-gradient(135deg,#FFF3E0,#FFE8CC); border-radius:14px; padding:10px 14px; font-size:12px; font-weight:700; color:var(--bear-brown); margin-bottom:14px;">⚡ เล่นจบรับ EXP สูงสุด 100 (ครั้งแรกครั้งเดียว)</div>';
      return '<div class="page-content">' +
        '<button onclick="App.navigate(\'dashboard\')" style="background:none; border:none; font-size:18px; color:var(--clay-text-light); cursor:pointer; padding:0; margin-bottom:16px; font-weight:700;">&#x2190; กลับ</button>' +
        '<div style="background:linear-gradient(135deg,#C084FC,#5BA4F5); border-radius:24px; padding:24px; margin-bottom:16px; text-align:center; box-shadow:0 8px 0 rgba(120,80,200,0.2),0 14px 28px rgba(120,80,200,0.12);">' +
          '<div style="font-size:56px; margin-bottom:6px;">🌉</div>' +
          '<h2 style="margin:0 0 6px 0; color:white; font-size:22px; font-weight:800;">เกมสะพานคำ</h2>' +
          '<p style="margin:0; font-size:13px; color:rgba(255,255,255,0.9);">Word Bridge — เชื่อมคำด้วยคำศัพท์ของเรา</p>' +
        '</div>' +
        doneBadge +
        '<div class="card">' +
          '<div style="font-weight:800; font-size:15px; color:var(--clay-text); margin-bottom:10px;">📖 วิธีเล่น</div>' +
          '<div style="font-size:13px; color:var(--clay-text-light); line-height:1.8;">' +
            '1️⃣ แต่ละด่านมีคำ <b>ต้นทาง</b> และ <b>ปลายทาง</b><br>' +
            '2️⃣ แตะคำศัพท์ด้านล่างมาเรียงเป็น <b>สะพาน</b> เชื่อมต้นทาง→ปลายทางให้เป็นเรื่องราว/ขั้นตอนที่ถูกต้อง<br>' +
            '3️⃣ แตะช่องที่วางแล้วเพื่อเอาคำออก<br>' +
            '4️⃣ กด <b>ตรวจสะพาน</b> ระบบจะนับช่องที่ถูก ยิ่งถูกมาก EXP ยิ่งสูง (สูงสุด 100)' +
          '</div>' +
        '</div>' +
        '<button class="btn btn-primary" onclick="App.state.wordBridge.started=true; App.render();">เริ่มเล่น! 🚀</button>' +
      '</div>';
    }

    // ----- Play screen -----
    var p = this.wordBridgePuzzles[wb.puzzleIndex];
    var progressPct = (wb.puzzleIndex / this.wordBridgePuzzles.length) * 100;

    // slots
    var slotsHtml = '';
    for (var i = 0; i < wb.slots.length; i++) {
      var poolIdx = wb.slots[i];
      var filled = poolIdx !== null && poolIdx !== undefined;
      var label = filled ? wb.pool[poolIdx].word : '?';
      var slotStyle, txtColor;
      if (wb.checked && filled) {
        var ok = wb.pool[poolIdx].word === p.chain[i];
        slotStyle = ok ? 'background:linear-gradient(145deg,#E8F5E9,#C8E6C9); border:2px solid var(--clay-green);' : 'background:linear-gradient(145deg,#FFE0E0,#FFD0D0); border:2px solid var(--clay-red);';
        txtColor = ok ? 'var(--clay-green-shadow)' : 'var(--clay-red-shadow)';
        label = (ok ? '✓ ' : '✗ ') + wb.pool[poolIdx].word;
      } else if (filled) {
        slotStyle = 'background:linear-gradient(145deg,#F8F3FF,#EEE8FF); border:2px solid var(--clay-purple);';
        txtColor = 'var(--clay-purple-shadow)';
      } else {
        slotStyle = 'background:rgba(255,255,255,0.5); border:2px dashed var(--clay-text-light);';
        txtColor = 'var(--clay-text-light)';
      }
      slotsHtml += '<div onclick="App.wbRemoveSlot(' + i + ')" style="' + slotStyle + ' border-radius:14px; padding:12px 10px; text-align:center; font-weight:800; font-size:13px; color:' + txtColor + '; cursor:pointer; min-height:20px; display:flex; align-items:center; justify-content:center;">' + label + '</div>';
      if (i < wb.slots.length - 1) slotsHtml += '<div style="text-align:center; color:var(--clay-purple); font-size:16px;">↓</div>';
    }

    // pool
    var poolHtml = '';
    for (var k = 0; k < wb.pool.length; k++) {
      var it = wb.pool[k];
      var ps = it.used ? 'opacity:0.35; pointer-events:none; background:var(--clay-bg);' : 'background:white; box-shadow:0 4px 0 rgba(150,100,200,0.2);';
      poolHtml += '<div onclick="App.wbPlaceWord(' + k + ')" style="' + ps + ' border-radius:14px; padding:10px 14px; font-weight:800; font-size:13px; color:var(--clay-text); cursor:pointer;">' + it.word + '</div>';
    }

    var allFilled = wb.slots.indexOf(null) === -1;
    var footerBtn;
    if (wb.checked) {
      footerBtn = '<div id="wb-why" style="background:linear-gradient(145deg,#F0F8FF,#E3F2FD); border-radius:14px; padding:12px; font-size:12px; color:var(--clay-text); line-height:1.6; margin-bottom:10px; border-left:4px solid var(--clay-blue);"><b>เฉลย:</b> ' + p.why + '</div>' +
        '<button class="btn btn-primary" onclick="App.wbNext()">' + (wb.puzzleIndex < this.wordBridgePuzzles.length - 1 ? 'ด่านถัดไป →' : 'ดูผลคะแนน 🏁') + '</button>';
    } else {
      footerBtn = '<button class="btn btn-primary" ' + (allFilled ? '' : 'disabled') + ' onclick="App.wbCheck()">ตรวจสะพาน 🔍</button>';
    }

    return '<div class="page-content" style="padding-bottom:20px;">' +
      '<div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">' +
        '<button onclick="App.navigate(\'dashboard\')" style="background:none; border:none; font-size:22px; color:var(--clay-text-light); font-weight:800; cursor:pointer;">&#x2715;</button>' +
        '<div class="progress-bar-container" style="margin:0; flex:1;"><div class="progress-bar-fill" style="width:' + progressPct + '%; background:linear-gradient(90deg,#C084FC,#5BA4F5);"></div></div>' +
        '<span style="font-size:13px; font-weight:700; color:var(--clay-text-light);">' + (wb.puzzleIndex + 1) + '/' + this.wordBridgePuzzles.length + '</span>' +
      '</div>' +
      // start tile
      '<div style="background:linear-gradient(135deg,#4ECB71,#3DB87A); border-radius:16px; padding:14px; text-align:center; font-weight:800; font-size:15px; color:white; box-shadow:0 5px 0 rgba(53,170,87,0.3); margin-bottom:6px;">🟢 ' + p.start + '</div>' +
      '<div style="text-align:center; color:var(--clay-purple); font-size:16px;">↓</div>' +
      // slots
      '<div style="display:flex; flex-direction:column; gap:4px; margin-bottom:6px;">' + slotsHtml + '</div>' +
      '<div style="text-align:center; color:var(--clay-purple); font-size:16px;">↓</div>' +
      // end tile
      '<div style="background:linear-gradient(135deg,#FF8C42,#F57C00); border-radius:16px; padding:14px; text-align:center; font-weight:800; font-size:15px; color:white; box-shadow:0 5px 0 rgba(200,120,40,0.3); margin-bottom:16px;">🟠 ' + p.end + '</div>' +
      // pool
      '<div style="font-size:13px; font-weight:700; color:var(--clay-text-light); margin-bottom:8px;">แตะคำศัพท์มาเรียงเป็นสะพาน:</div>' +
      '<div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;">' + poolHtml + '</div>' +
      footerBtn +
    '</div>';
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
    
    var newData = {
      'QuizID': '', // Auto
      'ModuleID': mid,
      'QuestionText': txt,
      'Option1': opt1,
      'Option2': opt2,
      'Option3': opt3,
      'Option4': opt4,
      'CorrectAnswer': correctAns,
      'Explanation': exp
    };
    
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
      .adminInsertRow('QuizBank', newData);
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

