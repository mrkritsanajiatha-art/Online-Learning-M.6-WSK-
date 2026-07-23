/* ============================================================
   Engkrit M6 — ตัวกลางส่งอีเมล "ลืมรหัสผ่าน"
   ------------------------------------------------------------
   ทำไมต้องมีไฟล์นี้:
   แอปเป็นเว็บ static บน GitHub Pages ไม่มีเซิร์ฟเวอร์ของตัวเอง
   จึงส่งอีเมลเองไม่ได้ และห้ามเอา service key ของ Supabase ไปไว้
   ในหน้าเว็บเด็ดขาด (ใครก็เปิดดูได้) — สคริปต์นี้จึงทำหน้าที่เป็น
   "ห้องหลังบ้าน" ที่ถือ key แทน: รับแค่อีเมล ค้นบัญชีให้ แล้วส่งเมล

   สคริปต์นี้ไม่เกี่ยวกับโฟลเดอร์ gas-backup/ (ของเก่าที่เลิกใช้แล้ว)

   ============================================================
   วิธีติดตั้ง (ทำครั้งเดียว)
   ============================================================
   1. เปิด https://script.google.com → New project → ตั้งชื่อ
      "Engkrit M6 - Forgot Password" → วางโค้ดทั้งไฟล์นี้ทับ Code.gs

   2. ตั้งค่า Script Properties (Project Settings ⚙️ → Script Properties)
        SUPABASE_URL          = https://wzqfrimttfzzjizbxvcg.supabase.co
        SUPABASE_SERVICE_KEY  = legacy service_role key (JWT ยาว ขึ้นต้นด้วย "eyJ")
                                Supabase → Project Settings → API Keys
                                → แท็บ "Legacy API keys" → service_role → Reveal
      ⚠️ ต้องเป็นคีย์แบบ JWT เท่านั้น ตัวใหม่ที่ขึ้นต้นด้วย "sb_secret_" ใช้ไม่ได้
         (เหตุผลอยู่ที่คอมเมนต์ตรงตัวแปร SUPABASE_SERVICE_KEY ด้านล่าง)
      ⚠️ คีย์นี้มีสิทธิ์เต็มกับฐานข้อมูล ห้ามเอาไปวางในโค้ดฝั่งเว็บหรือใน repo
      💡 ถ้าตั้งค่าแล้วยังต่อไม่ได้ ให้เลือกฟังก์ชัน checkSetup แล้วกด Run
         จะบอกสาเหตุใน Execution log โดยไม่ต้อง deploy

   3. Deploy → New deployment → เลือก type "Web app"
        Execute as        : Me (อีเมลของครู — เมลจะส่งออกจากบัญชีนี้)
        Who has access    : Anyone            ← ต้องเป็น Anyone ไม่งั้นแอปเรียกไม่ได้
      → Authorize access (กด Advanced → Go to project ถ้าขึ้นเตือน)
      → คัดลอก URL ที่ลงท้ายด้วย /exec

   4. เอา URL ไปใส่ในไฟล์ .env ของแอป:  VITE_RESET_URL=<URL ที่ได้>
      (และเป็นค่า fallback ใน src/api.js เพราะ GitHub Actions ไม่ได้ตั้ง env ให้)

   หมายเหตุ: ถ้าแก้โค้ดในไฟล์นี้ ต้อง Deploy → Manage deployments → ✏️ →
   Version: New version → Deploy ทุกครั้ง ไม่งั้น URL เดิมจะยังรันโค้ดเก่า

   โควตา MailApp: บัญชี Gmail ทั่วไปส่งได้ ~100 ฉบับ/วัน
   (บัญชี Google Workspace ของโรงเรียน ~1,500 ฉบับ/วัน)
   ============================================================ */

// ตอบข้อความเดียวกันเสมอ ไม่ว่าอีเมลนั้นจะมีบัญชีอยู่จริงหรือไม่
// กันไม่ให้ใครใช้หน้านี้ไล่เดาว่าอีเมลไหนเป็นของนักเรียนในระบบ
var GENERIC_OK = 'ถ้าอีเมลนี้มีบัญชีอยู่ในระบบ เราส่งรหัสผ่านไปให้แล้ว กรุณาเช็คกล่องจดหมาย (รวมถึงโฟลเดอร์ Spam) 📧';

var MAX_PER_HOUR = 3; // ขอซ้ำได้กี่ครั้งต่ออีเมลต่อชั่วโมง

/* ⚠️ ต้องใช้ legacy service_role key (JWT ตัวยาวขึ้นต้นด้วย "eyJ") เท่านั้น
   คีย์รูปแบบใหม่ "sb_secret_..." ใช้กับ Apps Script ไม่ได้ — Supabase ปฏิเสธ
   ด้วย "Forbidden use of secret API key in browser" เพราะ UrlFetchApp ส่ง
   User-Agent ขึ้นต้นด้วย Mozilla/5.0 เลยถูกมองว่าเป็นเบราว์เซอร์ ทั้งที่รัน
   อยู่บนเซิร์ฟเวอร์ของ Google และ Apps Script ก็ไม่ยอมให้ทับ User-Agent ด้วย
   (ทดสอบแล้วทั้งสองแบบได้ 401 เหมือนกัน)                                     */

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action !== 'forgotPassword') return json({ success: false, message: 'ไม่รู้จักคำสั่งนี้' });

    var email = String(body.email || '').trim().toLowerCase();
    if (!isEmail(email)) return json({ success: false, message: 'รูปแบบอีเมลไม่ถูกต้อง' });

    if (!underRateLimit(email)) {
      return json({ success: false, message: 'ขอรหัสถี่เกินไป กรุณารออีก 1 ชั่วโมงแล้วลองใหม่ ⏳' });
    }

    var accounts = findAccounts(email);
    if (accounts.length) sendPasswordMail(email, accounts);

    // เจอหรือไม่เจอก็ตอบเหมือนกัน
    return json({ success: true, message: GENERIC_OK });
  } catch (err) {
    return json({ success: false, message: 'ระบบส่งเมลขัดข้อง: ' + err });
  }
}

// เปิด URL ด้วยเบราว์เซอร์ตรงๆ จะเจอข้อความนี้ ใช้เช็คว่า deploy ติดแล้ว
function doGet() {
  return json({ success: true, message: 'Engkrit M6 forgot-password service is running.' });
}

/* ============================================================
   ตรวจสอบการตั้งค่า — ใช้ตอนต่อ Supabase ไม่ผ่าน
   วิธีใช้: เลือกฟังก์ชัน checkSetup ในแถบด้านบนของ editor → กด Run
           → ดูผลที่ Execution log ด้านล่าง
   รันในหน้า editor ใช้โค้ดล่าสุดเสมอ ไม่ต้อง deploy ใหม่
   (ไม่พิมพ์คีย์เต็ม พิมพ์แค่หัวกับความยาว พอให้รู้ว่าวางถูกตัวไหม)
   ============================================================ */
function checkSetup() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getKeys();
  var url = props.getProperty('SUPABASE_URL');
  var key = props.getProperty('SUPABASE_SERVICE_KEY');

  Logger.log('Property ที่มีอยู่: ' + JSON.stringify(all));
  Logger.log('SUPABASE_URL = ' + JSON.stringify(url));
  if (!key) {
    Logger.log('❌ ไม่พบ SUPABASE_SERVICE_KEY — เช็คว่าสะกดชื่อตรงและกด Save แล้ว');
    return;
  }
  Logger.log('SUPABASE_SERVICE_KEY: ขึ้นต้นด้วย "' + key.slice(0, 10) + '" ยาว ' + key.length + ' ตัวอักษร');
  if (key !== key.trim()) Logger.log('⚠️ คีย์มีช่องว่าง/ขึ้นบรรทัดใหม่ติดมาด้วย — ให้ลบออก');
  if (key.indexOf('sb_secret_') === 0) {
    Logger.log('❌ คีย์รูปแบบใหม่ (sb_secret_) ใช้กับ Apps Script ไม่ได้');
    Logger.log('   ต้องใช้ legacy service_role key (JWT ขึ้นต้นด้วย eyJ)');
    Logger.log('   หาได้ที่ Supabase → Project Settings → API Keys → แท็บ Legacy API keys');
  } else if (key.indexOf('publishable') !== -1 || key.indexOf('sb_') === 0) {
    Logger.log('⚠️ นี่ไม่ใช่ service_role key — ตรวจว่าคัดลอกมาถูกช่อง');
  }

  var res = UrlFetchApp.fetch(url.replace(/\/+$/, '') + '/rest/v1/users?select=id&limit=1', {
    method: 'get',
    headers: { apikey: key, Authorization: 'Bearer ' + key },
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  Logger.log('ผลทดสอบต่อ Supabase: HTTP ' + code);
  if (code === 200) Logger.log('✅ ตั้งค่าถูกต้องแล้ว — deploy ใหม่ได้เลย');
  else Logger.log(res.getContentText().slice(0, 300));
}

/* ---------- Supabase ---------- */

function findAccounts(email) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('SUPABASE_URL');
  var key = props.getProperty('SUPABASE_SERVICE_KEY');
  if (!url || !key) throw 'ยังไม่ได้ตั้งค่า SUPABASE_URL / SUPABASE_SERVICE_KEY ใน Script Properties';

  // email เก็บเป็นตัวพิมพ์เล็กอยู่แล้ว แต่เทียบแบบ ilike กันเผื่อข้อมูลเก่าที่ครูกรอกเอง
  var endpoint = url.replace(/\/+$/, '') + '/rest/v1/users' +
    '?email=ilike.' + encodeURIComponent(email) +
    '&select=username,password_hash,first_name,last_name,class_name';

  var res = UrlFetchApp.fetch(endpoint, {
    method: 'get',
    headers: { apikey: key, Authorization: 'Bearer ' + key },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw 'Supabase ตอบกลับ ' + res.getResponseCode() + ' — ' + res.getContentText().slice(0, 200);
  }
  return JSON.parse(res.getContentText()) || [];
}

/* ---------- Mail ---------- */

function sendPasswordMail(email, accounts) {
  var name = accounts[0].first_name || 'นักเรียน';

  var rows = accounts.map(function(a) {
    return '<div style="background:#F6F1FF; border-radius:14px; padding:14px 16px; margin:10px 0;">' +
      availLine('ชื่อ', [a.first_name, a.last_name].filter(String).join(' ')) +
      availLine('ห้อง', a.class_name) +
      availLine('Username', a.username) +
      availLine('รหัสผ่าน', a.password_hash) +
      '</div>';
  }).join('');

  var multi = accounts.length > 1
    ? '<p style="font-size:13px; color:#7A6B95;">อีเมลนี้ผูกอยู่กับ ' + accounts.length + ' บัญชี จึงส่งมาให้ทั้งหมด</p>'
    : '';

  var html =
    '<div style="font-family:sans-serif; max-width:520px; margin:0 auto; color:#3D2B5C;">' +
      '<h2 style="margin:0 0 4px;">🐻 Engkrit M6</h2>' +
      '<p style="font-size:14px;">สวัสดี ' + escapeHtml(name) + ' — นี่คือข้อมูลเข้าสู่ระบบของเธอตามที่ขอมานะ</p>' +
      multi + rows +
      '<p style="font-size:13px; color:#7A6B95; line-height:1.8;">' +
        '• ถ้าไม่ได้เป็นคนขอรหัสนี้ ให้รีบเข้าไปเปลี่ยนรหัสผ่านในหน้าโปรไฟล์ แล้วบอกคุณครู<br>' +
        '• อย่าส่งต่ออีเมลฉบับนี้ให้ใคร' +
      '</p>' +
      '<p style="font-size:12px; color:#A99BC0;">ส่งอัตโนมัติจากระบบ Engkrit M6 — ไม่ต้องตอบกลับอีเมลนี้</p>' +
    '</div>';

  MailApp.sendEmail({
    to: email,
    subject: '🐻 รหัสผ่าน Engkrit M6 ของเธอ',
    htmlBody: html,
    body: accounts.map(function(a) {
      return 'Username: ' + a.username + '\nรหัสผ่าน: ' + a.password_hash;
    }).join('\n\n'),
    name: 'Engkrit M6'
  });
}

function availLine(label, value) {
  if (!value) return '';
  return '<div style="font-size:14px; line-height:2;"><b>' + label + ':</b> ' + escapeHtml(String(value)) + '</div>';
}

/* ---------- Helpers ---------- */

// นับจำนวนครั้งต่ออีเมลด้วย CacheService (หมดอายุเองใน 1 ชม.)
function underRateLimit(email) {
  var cache = CacheService.getScriptCache();
  var key = 'fp_' + Utilities.base64Encode(email);
  var n = parseInt(cache.get(key) || '0', 10) + 1;
  if (n > MAX_PER_HOUR) return false;
  cache.put(key, String(n), 3600);
  return true;
}

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function escapeHtml(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
