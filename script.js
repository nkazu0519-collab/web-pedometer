/* ---------------------------
   定数 / 設定（調整しやすい）
   --------------------------- */
const CONFIG = {
  // 歩数判定: 大きいほどカウントしにくい（デバイス差あり）
  THRESHOLD: 4.0,
  // 人間の歩行では300〜700ms程度。小さめにすると誤検出が増える
  STEP_INTERVAL: 500
  ,
  // ローパスフィルタ（重力抽出）の係数（0〜1）
  ALPHA: 0.9,
  // ミッション切り替え時の演出待ち(ms)
  TRANSITION_DELAY: 1500,
  // 花火数（負荷を見て調整）
  FIREWORK_COUNT: 12,
  // デフォルト連続判定対象の前日目標（例: 100）
  DEFAULT_CONSECUTIVE_TARGET: 100,
};

/* ---------------------------
   LocalStorage キー（定義集）
   --------------------------- */
const KEYS = {
  STEPS: 'pedometerSteps',
  DATE: 'pedometerDate',
  MISSION_INDEX: 'missionIndex',
  CONSECUTIVE: 'consecutiveDays',
  WEEKLY_STEPS: 'weeklySteps',
  WEEK_NUMBER: 'pedometerWeekNumber', // 週番号保持用
};

/* ---------------------------
   グローバル状態（state オブジェクトで管理）
   --------------------------- */
const state = {
  steps: 0,
  isCounting: false,
  lastStepTime: 0,
  gravity: { x: 0, y: 0, z: 0 },
  missionIndex: 0,
  consecutiveDays: 0,
  weeklySteps: 0,
  missionCompletedLock: false, // ミッション完了の二重発火防止フラグ
  motionListenerRegistered: false, // devicemotion の登録状況
};

/* ---------------------------
   DOM 要素キャッシュ
   --------------------------- */
const $ = {
  stepCount: document.getElementById('step-count'),
  startBtn: document.getElementById('start-button'),
  stopBtn: document.getElementById('stop-button'),
  resetBtn: document.getElementById('reset-button'),
  currentQuestContainer: document.getElementById('current-quest-container'),
  bonusQuestList: document.getElementById('bonus-quests-list'),
  message: document.getElementById('message'),
  fireworksContainer: document.getElementById('fireworks-container'),
};

/* ---------------------------
   ミッション定義（必要に応じて追加）
   --------------------------- */
const MISSIONS = [
  { id: 1, goal: 100, text: '初級: 100歩達成', icon: '👟' },
  { id: 2, goal: 500, text: 'ウォーミングアップ: 500歩達成', icon: '🏃' },
  { id: 3, goal: 1000, text: '基礎訓練: 1,000歩達成', icon: '⛰️' },
  { id: 4, goal: 5000, text: 'デイリー目標: 5,000歩達成', icon: '🏅' },
  { id: 5, goal: 7777, text: 'シークレットボーナス: 7,777歩！', icon: '🎁' },
];

/* ---------------------------
   ボーナスクエスト定義
   --------------------------- */
const BONUS_MISSIONS = [
  { id: 101, type: 'consecutive', goal: 5, targetSteps: 100, text: '連続記録チャレンジャー: 5日連続達成', icon: '🔥' },
  { id: 102, type: 'weekly', goal: 35000, text: '週間長距離ランナー: 35,000歩達成', icon: '🗓️' },
];

/* ---------------------------
   ユーティリティ（日時・週番号）
   --------------------------- */
/** 今日の日付（YYYY-MM-DD）を返す */
function getTodayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 年・週番号を返す（ISO 週番号の簡易版） */
function getYearWeek() {
  const d = new Date();
  const year = d.getFullYear();

// 週の基準となる日付を作成 (UTC)
    const yearStart = new Date(Date.UTC(year, 0, 1));
    
    // 経過日数
    const days = Math.floor((d - yearStart) / (24 * 60 * 60 * 1000));
    
    // 簡易的な週番号（月曜日を週の始まりとするロジックに近づける）
    // 0:日, 1:月, 2:火, ...
    let dayOfWeek = d.getDay();
    if (dayOfWeek === 0) { // 日曜日を7とする
        dayOfWeek = 7;
    }

    // 今週の月曜日に戻るために何日引くか
    const daysSinceMonday = dayOfWeek - 1; 

    // 基準日からの通算日数を週番号に変換 (簡易版)
    // ここでは、日付が変われば確実に別の週番号になるように、現在のISO週番号の計算ロジックをシンプルにします。
    const weekNo = Math.floor((days + 7) / 7);

    // 週番号が年をまたぐ場合の処理は複雑なため、ここでは年と通算週番号を組み合わせます。
    return `${year}-W${String(weekNo).padStart(2, '0')}`;
}

/* ---------------------------
   状態の保存 / 読み込み
   - 保存は小まめに行う（visibilitychange もフック）
   --------------------------- */
function saveState() {
  try {
    localStorage.setItem(KEYS.STEPS, String(state.steps));
    localStorage.setItem(KEYS.DATE, getTodayISO());
    localStorage.setItem(KEYS.MISSION_INDEX, String(state.missionIndex));
    localStorage.setItem(KEYS.CONSECUTIVE, String(state.consecutiveDays));
    localStorage.setItem(KEYS.WEEKLY_STEPS, String(state.weeklySteps));
    localStorage.setItem(KEYS.WEEK_NUMBER, getYearWeek());
    // デバッグログ
    console.log('[saveState] 保存しました', {
      steps: state.steps,
      missionIndex: state.missionIndex,
      consecutiveDays: state.consecutiveDays,
      weeklySteps: state.weeklySteps,
    });
  } catch (e) {
    console.warn('localStorage への保存に失敗しました', e);
  }
}

/** 起動時に localStorage から状態を読み込む（必要な初期化もここで） */
/** 起動時に localStorage から状態を読み込む（必要な初期化もここで） */
function loadStateOnStart() {
    const savedSteps = parseInt(localStorage.getItem(KEYS.STEPS), 10);
    const savedDate = localStorage.getItem(KEYS.DATE);
    const savedMissionIndex = parseInt(localStorage.getItem(KEYS.MISSION_INDEX), 10);
    const savedConsecutive = parseInt(localStorage.getItem(KEYS.CONSECUTIVE), 10);
    const savedWeekly = parseInt(localStorage.getItem(KEYS.WEEKLY_STEPS), 10);
    const savedWeekNo = localStorage.getItem(KEYS.WEEK_NUMBER);
    const today = getTodayISO();
    const thisWeek = getYearWeek();

    // 週間リセット：週番号が変わっていたら weeklySteps を 0 にする
    if (savedWeekNo && savedWeekNo !== thisWeek) {
        state.weeklySteps = 0;
    } else {
        state.weeklySteps = Number.isFinite(savedWeekly) ? savedWeekly : 0;
    }

    // 日付が変わっていた場合は日次リセットと連続判定の評価
    if (savedDate && savedDate !== today) {
        const yesterdaySteps = Number.isFinite(savedSteps) ? savedSteps : 0;
        
        // 連続記録の計算
        if (yesterdaySteps >= CONFIG.DEFAULT_CONSECUTIVE_TARGET) {
            state.consecutiveDays = (Number.isFinite(savedConsecutive) ? savedConsecutive : 0) + 1;
        } else {
            state.consecutiveDays = 0;
        }
        
        // 歩数とミッションインデックスをリセット
        state.steps = 0;
        state.missionIndex = 0; // デイリークエストを最初のミッションに戻す
        
        // 日付を新しく保存（次回チェック用）
        localStorage.setItem(KEYS.DATE, today);
    } else {
        // 同じ日なら保存された歩数とインデックスを復元
        state.steps = Number.isFinite(savedSteps) ? savedSteps : 0;
        state.consecutiveDays = Number.isFinite(savedConsecutive) ? savedConsecutive : 0;
        // ミッションインデックスを復元（存在すれば）
        state.missionIndex = Number.isFinite(savedMissionIndex) ? savedMissionIndex : 0;
    }
}

/* ---------------------------
   レンダリング系関数（DOM を扱う部分）
   - innerHTML を多用せず、更新は最小化
   --------------------------- */

/** 現在のミッションを表示（シンプルに置換） */
function renderCurrentMission() {
  const mission = MISSIONS[state.missionIndex];
  $.currentQuestContainer.innerHTML = ''; // クリア

  if (!mission) {
    // 全ミッションクリア表示
    const li = document.createElement('li');
    li.className = 'quest-item completed';
    li.innerHTML = `<div class="quest-content">🎉 全てのクエストをクリアしました！</div>`;
    $.currentQuestContainer.appendChild(li);
    return;
  }

  // 要素を作って挿入（ID はユニークに管理）
  const li = document.createElement('li');
  li.className = 'quest-item';
  li.dataset.goal = mission.goal;

  const left = document.createElement('div');
  left.className = 'quest-content';

  const icon = document.createElement('span');
  icon.className = 'quest-icon';
  icon.textContent = mission.icon;

  const textBar = document.createElement('div');
  textBar.className = 'quest-text-bar';

  const desc = document.createElement('span');
  desc.className = 'quest-description';
  desc.textContent = mission.text;

  // 進捗バー（カスタム）
  const progressWrap = document.createElement('div');
  progressWrap.className = 'custom-progress-bar';
  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  fill.id = 'quest-progress-fill'; // 更新しやすくするため一意にする
  progressWrap.appendChild(fill);

  textBar.appendChild(desc);
  textBar.appendChild(progressWrap);

  left.appendChild(icon);
  left.appendChild(textBar);

  const check = document.createElement('span');
  check.className = 'quest-check';
  check.id = 'quest-check';
  check.textContent = '✅';
  check.style.opacity = '0';

  li.appendChild(left);
  li.appendChild(check);

  $.currentQuestContainer.appendChild(li);

  // メッセージクリア & 進捗更新
  $.message.textContent = '';
  updateProgress();
}

/** ボーナスクエスト一覧を描画 */
function renderBonusMissions() {
  $.bonusQuestList.innerHTML = '';
  BONUS_MISSIONS.forEach((m) => {
    const li = document.createElement('li');
    const progressText = m.type === 'consecutive'
      ? `${state.consecutiveDays}/${m.goal} 日連続`
      : `${state.weeklySteps.toLocaleString()}/${m.goal.toLocaleString()} 歩`;

    const isCompleted = (m.type === 'consecutive') ? (state.consecutiveDays >= m.goal) : (state.weeklySteps >= m.goal);

    li.id = `bonus-quest-${m.id}`;
    li.className = `quest-item ${isCompleted ? 'completed' : ''}`;

    li.innerHTML = `
      <div class="quest-content">
        <span class="quest-icon">${m.icon}</span>
        <div class="quest-text-bar">
          <span class="quest-description">${m.text}</span>
          <span class="quest-status">${progressText}</span>
        </div>
      </div>
      <span class="quest-check" style="opacity:${isCompleted ? 1 : 0}">✅</span>
    `;

    $.bonusQuestList.appendChild(li);
  });
}

/* ---------------------------
   進捗更新（ミッション用）
   - progress-fill の幅を更新
   --------------------------- */
function updateProgress() {
  const mission = MISSIONS[state.missionIndex];
  if (!mission) return;

  const fill = document.getElementById('quest-progress-fill');
  if (!fill) return;

  // パーセンテージを計算（0〜100）
  const percent = Math.min(state.steps / mission.goal, 1) * 100;
  fill.style.width = `${percent}%`;
}

/* ---------------------------
   ミッション完了処理ガード付き
   --------------------------- */
function onMissionAchieved() {
  if (state.missionCompletedLock) return; // 二重発火防止
  state.missionCompletedLock = true;

  // UI 更新（チェック表示・クラス追加）
  const currentLi = document.getElementById('current-quest') || $.currentQuestContainer.querySelector('.quest-item');
  const check = document.getElementById('quest-check');

  if (currentLi) currentLi.classList.add('completed');
  if (check) check.style.opacity = 1;

  // 花火演出
  launchFireworks();

  // メッセージ表示
  const mission = MISSIONS[state.missionIndex];
  if (mission) $.message.textContent = `🎉 クエスト達成: ${mission.text}！`;

  // 保存してから遷移
  saveState();

  // 一定時間後に次ミッションへ（ロック解除は moveToNextMission 内で行う）
  setTimeout(() => {
    moveToNextMission();
    state.missionCompletedLock = false;
  }, CONFIG.TRANSITION_DELAY);
}

/* ---------------------------
   次のミッションへ移動
   --------------------------- */
function moveToNextMission() {
  state.missionIndex++;
  // ミッションがなければクリア表示
  if (state.missionIndex >= MISSIONS.length) {
    state.missionIndex = MISSIONS.length; // 上限固定
    renderCurrentMission(); // 全クリア表示
  } else {
    renderCurrentMission();
  }
  saveState();
  renderBonusMissions();
}

/* ---------------------------
   センサー（DeviceMotion）処理
   - 重力分離、加速度ベクトル、大きさ判定
   - Z軸（上下）に少し重みを付けることで誤検出を減らす
   --------------------------- */
function handleMotion(event) {
  // accelerationIncludingGravity がない場合は終了
  const a = event.accelerationIncludingGravity;
  if (!a) return;

  // 重力分離（LPF）
  state.gravity.x = CONFIG.ALPHA * state.gravity.x + (1 - CONFIG.ALPHA) * a.x;
  state.gravity.y = CONFIG.ALPHA * state.gravity.y + (1 - CONFIG.ALPHA) * a.y;
  state.gravity.z = CONFIG.ALPHA * state.gravity.z + (1 - CONFIG.ALPHA) * a.z;

  // 重力除去（線形加速度）
  const lin = {
    x: a.x - state.gravity.x,
    y: a.y - state.gravity.y,
    z: a.z - state.gravity.z,
  };

  // Z に少し重みを付与（上下揺れを重視）
  const weightedMagnitude = Math.sqrt(
    lin.x * lin.x + lin.y * lin.y + (lin.z * 1.2) * (lin.z * 1.2)
  );

  const now = Date.now();
  if (weightedMagnitude > CONFIG.THRESHOLD && now - state.lastStepTime > CONFIG.STEP_INTERVAL) {
    // 歩数カウント
    state.steps++;
    state.lastStepTime = now;

    // 画面更新（数値）
    if ($.stepCount) $.stepCount.textContent = state.steps;

    // 週間合計に加算（週別管理は loadStateOnStart で実施）
    state.weeklySteps++;

    // 進捗更新とミッションチェック
    updateProgress();
    renderBonusMissions();

    // ミッション達成判定
    const mission = MISSIONS[state.missionIndex];
    if (mission && state.steps >= mission.goal) {
      onMissionAchieved();
    }
  }
}

/* ---------------------------
   計測を開始する（start）
   - iOS の permission に対応
   - 重複登録を防止
   --------------------------- */
function startCounting() {
  if (state.isCounting) return;
  if (!('DeviceMotionEvent' in window)) {
    alert('お使いの端末では歩数計のセンサーが利用できません。');
    return;
  }

  state.isCounting = true;

  enableNoSleep();

  // 初期読み込み（ローカルデータの反映）
  loadStateOnStart();
  $.stepCount && ($.stepCount.textContent = state.steps);
  renderCurrentMission();
  renderBonusMissions();

  // iOS の場合は user gesture 必須で permission を求める
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission().then(permissionState => {
      if (permissionState === 'granted') {
        registerMotionListener();
      } else {
        alert('センサーの利用が拒否されました。iPhone の設定で「モーションと方向」を有効にしてください。');
        state.isCounting = false;
      }
    }).catch(err => {
      console.error('DeviceMotion requestPermission error', err);
      state.isCounting = false;
    });
  } else {
    // Android 等：許可不要な環境
    registerMotionListener();
  }
}

/* ---------------------------
   計測を停止する（stop）
   --------------------------- */
function stopCounting() {
  if (!state.isCounting) return;
  state.isCounting = false;
  unregisterMotionListener();
  saveState();

  disableNoSleep();

  console.log('計測停止');
}

/* ---------------------------
   devicemotion の登録 / 解除（重複防止）
   --------------------------- */
function registerMotionListener() {
  if (state.motionListenerRegistered) return;
  window.addEventListener('devicemotion', handleMotion);
  state.motionListenerRegistered = true;
  console.log('devicemotion registered');
}

function unregisterMotionListener() {
  if (!state.motionListenerRegistered) return;
  window.removeEventListener('devicemotion', handleMotion);
  state.motionListenerRegistered = false;
  console.log('devicemotion unregistered');
}

/* ---------------------------
   リセット（全部リセット）
   - カウント中なら停止
   - ストレージも更新
   --------------------------- */
function resetAll() {
  if (state.isCounting) stopCounting();

  state.steps = 0;
  state.weeklySteps = 0;
  state.consecutiveDays = 0;
  state.missionIndex = 0;
  state.lastStepTime = 0;

  // UI 更新
  $.stepCount && ($.stepCount.textContent = state.steps);
  $.message && ($.message.textContent = '👣 データをリセットしました');

  // ローカルストレージを初期化
  localStorage.setItem(KEYS.STEPS, '0');
  localStorage.setItem(KEYS.WEEKLY_STEPS, '0');
  localStorage.setItem(KEYS.CONSECUTIVE, '0');
  localStorage.setItem(KEYS.MISSION_INDEX, '0');
  localStorage.setItem(KEYS.DATE, getTodayISO());
  localStorage.setItem(KEYS.WEEK_NUMBER, getYearWeek());

  renderCurrentMission();
  renderBonusMissions();
  saveState();
}

/* ---------------------------
   visibility / pagehide 対策
   - モバイルでは beforeunload が当てにならないため visibilitychange と pagehide で保存
   --------------------------- */
function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    saveState();
  }
}
window.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('pagehide', saveState);

/* ---------------------------
   花火（軽量アニメ） - 負荷に注意
   --------------------------- */
const FIREWORK_COLORS = ['#FF4500', '#FFD700', '#ADFF2F', '#1E90FF', '#FF69B4'];

function launchFireworks() {
  const container = document.getElementById('fireworks-container');
  if (!container) return;

  const count = CONFIG.FIREWORK_COUNT;
  for (let i = 0; i < count; i++) {
    const part = document.createElement('div');
    part.className = 'firework';

    const color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
    const size = Math.random() * 7 + 8; // px
    const x = Math.random() * window.innerWidth;
    const y = window.innerHeight * (0.3 + Math.random() * 0.4); // 中央付近

    part.style.backgroundColor = color;
    part.style.width = `${size}px`;
    part.style.height = `${size}px`;
    part.style.left = `${x}px`;
    part.style.top = `${y}px`;

    const duration = Math.random() * 2.0 + 2.0;
    part.style.animation = `explode ${duration}s ease-out forwards`;
    part.style.animationDelay = `${Math.random() * 1.0}s`;

    container.appendChild(part);

    // 演出後に削除
    setTimeout(() => {
      part.remove();
    }, (duration + 1.0) * 1000);
  }
}

/* ---------------------------
   初期セットアップ（イベントリスナ登録等）
   --------------------------- */
function initApp() {
  // DOMContentLoaded 呼び出し済みであれば即実行
  // すでに読み込み済みの場合は直接実行
  loadStateOnStart();
  $.stepCount && ($.stepCount.textContent = state.steps);
  renderCurrentMission();
  renderBonusMissions();

  // ボタンイベント
  $.startBtn && $.startBtn.addEventListener('click', startCounting);
  $.stopBtn && $.stopBtn.addEventListener('click', stopCounting);
  $.resetBtn && $.resetBtn.addEventListener('click', resetAll);

  // ページ離脱時に保存（補助）
  window.addEventListener('beforeunload', saveState);
}

/* ---------------------------
   App 起動
   --------------------------- */

/* ---------------------------
   スリープ防止機能 (Wake Lock & Video Hack)
   --------------------------- */
let wakeLock = null;
let noSleepVideo = null;

// スリープ防止を有効にする
async function enableNoSleep() {
  // 1. Wake Lock API (Android/PC向け)
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Wake Lock is active');
    } catch (err) {
      console.warn(`Wake Lock error: ${err.name}, ${err.message}`);
    }
  }

  // 2. Video Hack (iOS向けバックアップ)
  // 画面上に表示されない小さな動画を作成してループ再生する
  if (!noSleepVideo) {
    noSleepVideo = document.createElement('video');
    noSleepVideo.setAttribute('playsinline', '');
    noSleepVideo.setAttribute('no-fullscreen', '');
    noSleepVideo.setAttribute('loop', '');
    noSleepVideo.src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMQAAAAhmcmVlAAACQ21kYXQAAAGzABAHAAABthADAQAAAAZefX/AAAAC521vb3YAAABsbXZoZAAAAAB8JbCAfCWwgAAAA+gAAAAAAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAIGdHJhawAAAFx0a2hkAAAAAXwlsIB8JbCAAAAAAQAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAEAAAABAAAAAAAAAAAQAAbWRpYQAAACBtZGhkAAAAAHwlsIB8JbCAAAPoAAAAAAAAB5gAAAAAIGhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAAB2aWRlAAAAAAAAAAAAAVxtaW5mAAAAFHZtaGQAAAAAAAACAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAAEcc3RibAAAALhzdHNkAAAAAAAAAAEAAACobXA0dgAAAAAAAAABAAAAAQAAAAEAFgAAAAAD6AAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAG2VzZHMAAAAAA4CAgB8AAAAEgICAFEAvQAAAAAAAAAAAAAAANu4AABHjAACRxAAAAAAAFWF2Y0MBAAAAAAAAAAAAAAACAAOAggA4AAAAIAAAAAEAAAAAAAAAAAAAABRzdHRzAAAAAAAAAAEAAAAeAAAABHN0c2MAAAAAAAAAAQAAAAEAAAABAAAAFHN0c3oAAAAAAAAAEwAAAB4AAAAUc3RjbwAAAAAAAAABAAAALAAAAGB1ZHRhAAAAWGBteXQAAAAA1c3R5Mjg5NQAAbmV0d29yayBvZiBxdWFsaXR5IC0gd3d3Lm1ha2V5b3VlZnMub3JnIC0gY3JlYXRlZCBieSBiYWJlbCB4MjY0AA==';
    noSleepVideo.style.display = 'none'; // 見えないようにする
    document.body.appendChild(noSleepVideo);
  }
  noSleepVideo.play().catch(console.error);
}

// スリープ防止を解除する
function disableNoSleep() {
  // Wake Lock 解除
  if (wakeLock !== null) {
    wakeLock.release().then(() => {
      wakeLock = null;
      console.log('Wake Lock released');
    });
  }

  // Video 停止
  if (noSleepVideo) {
    noSleepVideo.pause();
  }
}

document.addEventListener('DOMContentLoaded', initApp);