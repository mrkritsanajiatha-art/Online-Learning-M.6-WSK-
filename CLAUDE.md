# สารบัญโปรเจค: เรียนรู้พิชิตบทเรียน (LMS ม.6)

> อ่านไฟล์นี้ก่อนเข้าแก้ไขเสมอ เพื่อประหยัด Token และแก้ตรงจุด

---

## โครงสร้างไฟล์

```
src/
  main.js        ← UI ทั้งหมด (2640 บรรทัด) — ดูสารบัญด้านล่าง
  api.js         ← ฟังก์ชัน Supabase ทั้งหมด
  style.css      ← CSS + CSS Variables (Claymorphism theme)
  supabaseClient.js ← config Supabase client
index.html       ← entry point (แค่โหลด main.js กับ style.css)
vite.config.js   ← build config
supabase_schema.sql ← schema ฐานข้อมูล
gas-backup/      ← ต้นฉบับ Google Apps Script (ไม่ใช้งานแล้ว)
```

---

## Routes และ View Functions (main.js)

| Route | View Function | บรรทัด |
|-------|--------------|--------|
| `login` | `viewLogin()` | 425 |
| `register` | `viewRegister()` | 444 |
| `dashboard` | `viewDashboard()` | 470 |
| `lessons` | `viewLessons()` | 970 |
| `moduleDetail` | `viewModuleDetail()` | 1048 |
| `lesson` | `viewLesson()` | 1111 |
| `quiz` / `dailyQuest` | `viewQuiz()` | 1123 |
| `flashcards` | `viewFlashcards()` | 1230 |
| `leaderboard` | `viewLeaderboard()` | 1282 |
| `profile` | `viewProfile()` | 1329 |
| `profileEdit` | `viewProfileEdit()` | 1413 |
| `guide` | `viewGuide()` | 948 |
| `bonusQR` | `viewBonusQR()` | 1624 |
| `wordBridge` | `viewWordBridge()` | 2454 |
| `community` | `viewCommunity()` | 666 |
| `storyCompose` | `viewStoryCompose()` | 791 |
| `storyView` | `viewStoryView()` | 843 |
| `showcaseCompose` | `viewShowcaseCompose()` | 890 |
| `weeklyGoal` | `viewWeeklyGoal()` | 601 |
| `admin` | `viewAdmin()` | 1748 |
| `adminScanner` | `viewAdminScanner()` | 1678 |
| `adminDB` | `viewAdminDB()` | 1859 |
| `adminTable` | `viewAdminTable()` | 1881 |
| `adminExport` | `viewAdminExport()` | 1801 |
| `adminQuizBuilder` | `viewAdminQuizBuilder()` | 1820 |

---

## สารบัญ main.js แบบละเอียด

### Core / Setup (บรรทัด 1–50)
- `1` — import api.js, QRCode, jsQR
- `5` — google.script.run Proxy (bridge เชื่อม api.js)

### App State (บรรทัด 50–120)
- `51` — `App.state` — ค่าเริ่มต้นทุกตัว
- `82` — `wordBridgePuzzles[]` — ข้อมูลโจทย์เกมสะพานคำ (5 ด่าน)
- `122` — `bear`, `bearHappy`, `bearStar` — emoji หมี
- `126` — `levelTiers[]` — ระดับ XP (Beginner→Master)

### Core Methods (บรรทัด 137–422)
- `137` — `levelInfo(xp)` — คำนวณ level/rank จาก XP
- `154` — `init()` — เริ่มแอป, ตรวจ localStorage
- `169` — `afterAuth()` — หลัง login สำเร็จ, บันทึก streak
- `187` — `toast(msg)` — แจ้งเตือน popup
- `196` — `navigate(route, params)` — เปลี่ยนหน้า + โหลดข้อมูล
- `354` — `render()` — วาด HTML ตาม route ปัจจุบัน
- `391` — `postRender()` — init QR/Cropper หลัง render
- `399` — `celebrate(amount)` — เอฟเฟกต์ confetti

### View: Dashboard & Home (บรรทัด 425–599)
- `425` — `viewLogin()` — หน้า login
- `444` — `viewRegister()` — หน้าสมัครสมาชิก
- `470` — `viewDashboard()` — หน้าหลัก (XP, Streak, Rank, quick actions)
- `574` — `dashWeeklyGoalCard()` — การ์ดเป้าหมายสัปดาห์ในหน้าหลัก

### View: Weekly Goal (บรรทัด 601–654)
- `601` — `viewWeeklyGoal()` — หน้าตั้งเป้าหมาย
- `642` — `wgSetType(t)` — เลือกประเภทเป้าหมาย
- `643` — `wgSetTarget(v)` — ตั้งตัวเลขเป้าหมาย
- `645` — `saveWeeklyGoal()` — บันทึกเป้าหมาย

### View: Community & Stories (บรรทัด 656–947)
- `656` — `timeAgo(iso)` — แปลงเวลาเป็น "x นาทีที่แล้ว"
- `666` — `viewCommunity()` — หน้าชุมชน (Stories, Titles, Showcase, Feed)
- `771` — `communityHeader()` — header ของหน้าชุมชน
- `791` — `viewStoryCompose()` — หน้าสร้าง Story
- `811` — `pickStoryTemplate(kind)` — เลือก template story
- `821` — `submitStory()` — โพสต์ story
- `832` — `openStory(id)` — เปิดดู story
- `843` — `viewStoryView()` — หน้าดู story + react
- `870` — `doReact(storyId, emoji)` — กด reaction
- `882` — `removeStory(id)` — ลบ story
- `890` — `viewShowcaseCompose()` — หน้าส่งผลงาน showcase
- `920` — `setShowcaseCat(c)` — เลือกประเภทผลงาน
- `922` — `submitShowcase()` — ส่งผลงาน
- `934` — `togglePin(id, pin)` — ครูปักหมุดผลงาน (Admin)
- `942` — `removeShowcase(id)` — ลบผลงาน

### View: Guide (บรรทัด 948–969)
- `948` — `viewGuide()` — หน้าคู่มือ/แนะนำแอป

### View: Lessons & Modules (บรรทัด 970–1122)
- `970` — `viewLessons()` — หน้ารายการบทเรียน (4 Unit cards)
- `1037` — `showModuleDetail(moduleId, idx)` — เปิดรายละเอียด module
- `1044` — `lockedUnitHint(unitNo)` — แสดงข้อความล็อก
- `1048` — `viewModuleDetail()` — หน้ารายละเอียด module (PreTest/Activity/PostTest)
- `1111` — `viewLesson()` — หน้าเนื้อหาบทเรียน

### View: Quiz & Flashcards (บรรทัด 1123–1281)
- `1123` — `viewQuiz()` — หน้าทำแบบทดสอบ (ใช้กับ quiz และ dailyQuest)
- `1230` — `viewFlashcards()` — หน้าท่องคำศัพท์ด้วย Flashcard

### View: Leaderboard (บรรทัด 1277–1328)
- `1277` — `setLeaderboardFilter(val)` — กรองตามห้อง
- `1282` — `viewLeaderboard()` — หน้าอันดับ

### View: Profile (บรรทัด 1329–1622)
- `1329` — `viewProfile()` — หน้าโปรไฟล์
- `1403` — `openProfileEdit()` — เปิดหน้าแก้โปรไฟล์
- `1410` — `esc(v)` — escape HTML (ใช้ทุกที่ที่แสดงข้อความ user)
- `1411` — `fieldLabel(t)` — สร้าง label สไตล์เดียวกัน
- `1413` — `viewProfileEdit()` — หน้าแก้ไขโปรไฟล์
- `1464` — `viewCropperModal()` — modal ครอปรูป avatar
- `1481` — `onAvatarFileChosen(input)` — เลือกรูปจากอุปกรณ์
- `1506` — `cropClamp()` — จำกัดขอบเขตการครอป
- `1515` — `cropApplyDom()` — apply การครอปไปยัง DOM
- `1521` — `cropZoom(val)` — ซูมรูปขณะครอป
- `1532` — `cropCancel()` — ยกเลิกครอป
- `1538` — `cropApply()` — ยืนยันครอป
- `1553` — `initCropper()` — เริ่ม cropper หลัง render
- `1583` — `saveProfile()` — บันทึกโปรไฟล์

### View: Bonus QR (บรรทัด 1624–1677)
- `1624` — `viewBonusQR()` — หน้าแสดง QR code รับคะแนนพิเศษ
- `2234` — `initBonusQR()` — สร้าง QR code จริง (ต้องทำหลัง render)

### View: Admin (บรรทัด 1678–1947)
- `1678` — `viewAdminScanner()` — หน้าสแกน QR ให้คะแนน (Admin)
- `1748` — `viewAdmin()` — หน้าหลัก Admin
- `1801` — `viewAdminExport()` — หน้า Export คะแนน CSV
- `1820` — `viewAdminQuizBuilder()` — หน้าเพิ่มคำถาม Quiz
- `1859` — `viewAdminDB()` — หน้าดูตาราง DB
- `1881` — `viewAdminTable()` — หน้าแก้ไขข้อมูลในตาราง

### UI Components (บรรทัด 1948–1977)
- `1948` — `bottomNav(activeTab)` — Bottom navigation bar (home/lessons/bonus/community/profile)
- `1971` — `logout()` — ออกจากระบบ

### Auth Handlers (บรรทัด 1978–2044)
- `1978` — `handleLogin()` — จัดการ login form
- `2004` — `handleRegister()` — จัดการ register form
- `2029` — `handleProfileUpload(event)` — upload รูปโปรไฟล์

### Quiz Logic (บรรทัด 2046–2118)
- `2046` — `answerQuiz(btnElem, selectedOpt)` — ตอบคำถาม quiz
- `2075` — `nextQuizQuestion()` — ไปข้อถัดไป / submit ผล

### Flashcard Logic (บรรทัด 2098–2118)
- `2098` — `nextFlashcard()` — พลิก flashcard / ข้ามไปใบถัดไป

### Admin DB Logic (บรรทัด 2119–2232)
- `2119` — `adminCancelEdit()` — ยกเลิกการแก้ไข row
- `2124` — `adminSaveRow(rowIndex)` — บันทึกการแก้ไข row
- `2153` — `adminInsertRow()` — เพิ่ม row ใหม่
- `2178` — `adminDeleteRow(rowIndex)` — ลบ row
- `2203` — `adminDownloadCSV()` — download CSV

### QR Scanner Logic (บรรทัด 2248–2357)
- `2248` — `initQRScanner()` — เปิดกล้องสแกน QR
- `2284` — `stopQRScanner()` — ปิดกล้อง
- `2295` — `onQRScanned(data)` — เมื่อสแกน QR ได้ข้อมูล
- `2326` — `doGiveBonus()` — ให้คะแนนพิเศษ

### Word Bridge Game (บรรทัด 2359–2567)
- `2359` — `initWordBridge()` — เริ่มต้นเกม
- `2381` — `wbLoadPuzzle(idx)` — โหลดโจทย์ด่าน idx
- `2395` — `wbPlaceWord(poolIdx)` — วางคำจาก pool ลงช่อง
- `2408` — `wbRemoveSlot(slotIdx)` — นำคำออกจากช่อง
- `2418` — `wbCheck()` — ตรวจคำตอบ
- `2432` — `wbNext()` — ไปด่านถัดไป
- `2454` — `viewWordBridge()` — render UI เกมสะพานคำ

### Admin Quiz Builder Logic (บรรทัด 2569–)
- `2569` — `adminSaveQuizBuilder()` — บันทึกคำถาม quiz ใหม่

---

## สารบัญ api.js

### Auth
| ฟังก์ชัน | บรรทัด | หน้าที่ |
|---------|--------|---------|
| `loginUser(username, password)` | 21 | ล็อกอิน |
| `registerStudent(userObj)` | 32 | สมัครสมาชิก |
| `recordLogin(userId)` | 437 | บันทึก login + คำนวณ streak |

### Dashboard & Data
| ฟังก์ชัน | บรรทัด | หน้าที่ |
|---------|--------|---------|
| `getAppData(userId)` | 51 | โหลดข้อมูลแรก (dashboard + modules) |
| `getDashboardData(userId)` | 62 | refresh dashboard data |
| `getModules()` | 67 | รายการ module ทั้งหมด |

### Quiz & Learning
| ฟังก์ชัน | บรรทัด | หน้าที่ |
|---------|--------|---------|
| `getDailyQuest()` | 88 | สุ่มคำถาม 10 ข้อ (9 vocab + 1 grammar) |
| `getQuizQuestions(moduleId, quizType)` | 128 | คำถามตาม module/type |
| `getFlashcards(moduleId)` | 349 | flashcard ตาม module |
| `getCompletedModules(userId)` | 339 | module ที่ผ่านแล้ว |
| `submitQuizScore(...)` | 360 | บันทึกคะแนน quiz |

### Weekly Goal
| ฟังก์ชัน | บรรทัด | หน้าที่ |
|---------|--------|---------|
| `getWeeklyGoal(userId)` | 171 | ดึงเป้าหมายสัปดาห์ |
| `setWeeklyGoal(userId, goalType, target)` | 188 | ตั้งเป้าหมาย |

### Community
| ฟังก์ชัน | บรรทัด | หน้าที่ |
|---------|--------|---------|
| `getCommunityData()` | 204 | ดึง titles, feed, stories, showcase |
| `postStory(userId, kind, content)` | 284 | โพสต์ story |
| `getStory(storyId, userId)` | 292 | ดู story + reactions |
| `reactStory(storyId, userId, emoji)` | 303 | กด reaction |
| `deleteStory(storyId, userId)` | 312 | ลบ story |
| `postShowcase(...)` | 317 | ส่งผลงาน |
| `adminPinShowcase(id, pinned)` | 328 | Admin ปักหมุดผลงาน |
| `deleteShowcase(id, userId)` | 334 | ลบผลงาน |

### Leaderboard
| ฟังก์ชัน | บรรทัด | หน้าที่ |
|---------|--------|---------|
| `getLeaderboard(className)` | 73 | อันดับ XP (กรองตามห้องได้) |

### Profile
| ฟังก์ชัน | บรรทัด | หน้าที่ |
|---------|--------|---------|
| `updateProfile(userId, f)` | 416 | บันทึกโปรไฟล์ทั้งหมด |
| `updateProfileName(userId, ...)` | 405 | แก้ชื่อ-นามสกุล |
| `uploadProfileImage(userId, base64Str)` | 398 | อัปโหลดรูป avatar |

### Bonus QR / Scanner
| ฟังก์ชัน | บรรทัด | หน้าที่ |
|---------|--------|---------|
| `getBonusScore(userId)` | 490 | ดูคะแนนพิเศษ + ประวัติ |
| `adminScanGetUser(userId)` | 501 | Admin: ดูข้อมูล user จาก QR |
| `adminGiveBonus(targetUserId, points, adminUserId)` | 513 | Admin: ให้คะแนนพิเศษ |

### Game
| ฟังก์ชัน | บรรทัด | หน้าที่ |
|---------|--------|---------|
| `getGameStatus(userId, gameKey)` | 529 | ตรวจว่าเล่น game แล้วหรือยัง |
| `submitGameScore(userId, gameKey, exp)` | 537 | บันทึก EXP จากเกม |

### Admin DB
| ฟังก์ชัน | บรรทัด | หน้าที่ |
|---------|--------|---------|
| `adminGetTables()` | 458 | รายการตาราง |
| `adminGetTableData(tableName)` | 462 | ข้อมูลในตาราง |
| `adminUpdateRow(...)` | 468 | แก้ไข row |
| `adminInsertRow(...)` | 473 | เพิ่ม row |
| `adminDeleteRow(...)` | 481 | ลบ row |
| `adminExportScoresCSV(className)` | 486 | export คะแนน |
| `adminAddQuiz(...)` | 552 | เพิ่มคำถาม quiz |

---

## สารบัญ style.css

| Section | บรรทัด |
|---------|--------|
| CSS Variables (สี, font, layout) | 1 |
| Reset | 34 |
| Claymorphism Card `.card` | 93 |
| Stat Cards `.stat-card` | 110 |
| Module Cards | 119 |
| Speech Bubble | 123 |
| Buttons `.btn`, `.btn-primary`, `.btn-outline` | 146 |
| Inputs `.input-field` | 194 |
| Bottom Navigation `.bottom-nav` | 216 |
| Typography `.text-title` | 265 |
| Loader `.loader` | 270 |
| Mascot Animations `.mascot-bounce` | 294 |
| Progress Bar `.progress-bar-container` | 306 |
| Quiz Options `.quiz-option` | 324 |
| Progress Ring | 350 |
| Clay Header Band | 374 |
| Clay Badge | 384 |
| Clay Pill | 398 |

---

## App State สำคัญ (ดูที่บรรทัด 51–83)

```js
App.state = {
  user,              // ข้อมูล user ที่ login อยู่ (null = ยังไม่ login)
  currentRoute,      // route ปัจจุบัน
  modules,           // รายการ module (cache)
  dashboardData,     // XP, streak, level, badges
  leaderboard,       // ข้อมูล leaderboard
  quiz,              // state ของ quiz (currentIndex, score, questions, ...)
  flashcards,        // state ของ flashcard
  admin,             // state ของหน้า Admin
  wordBridge,        // state ของเกมสะพานคำ
  community,         // state ของชุมชน (titles, feed, stories)
  bonusScore,        // คะแนนพิเศษ
  weeklyGoal,        // เป้าหมายสัปดาห์
  dataLoaded,        // flag ว่าโหลดข้อมูลแรกแล้วหรือยัง
  // ... อื่นๆ ดูที่บรรทัด 51–83
}
```

---

## วิธีเพิ่ม Route ใหม่

1. เพิ่มใน `navigate()` (บรรทัด 196) — โหลดข้อมูลก่อน render
2. เพิ่มใน `render()` (บรรทัด 354) — เลือก view ตาม route
3. สร้าง `viewXxx()` function ใหม่
4. เพิ่ม link ใน `bottomNav()` (บรรทัด 1948) ถ้าต้องการ

---

## CSS Variables หลักที่ใช้บ่อย

```css
--bear-brown     /* น้ำตาล (หัวข้อ) */
--bear-orange    /* ส้ม (primary) */
--clay-purple    /* ม่วง (accent) */
--clay-green     /* เขียว (success) */
--clay-red       /* แดง (error) */
--clay-blue      /* ฟ้า (info) */
--clay-text      /* สีตัวหนังสือหลัก #3D2B5C */
--clay-text-light /* สีตัวหนังสือรอง */
--clay-bg        /* พื้นหลัง #EFE6FF */
--clay-white     /* ขาว */
```
