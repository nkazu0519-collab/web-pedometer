// HTML要素を取得
const stepCountElement = document.getElementById('step-count');
const startButton = document.getElementById('start-button');
const stopButton = document.getElementById('stop-button');

// 変数の初期設定
let steps = 0;
let isCounting = false;
let lastStepTime = 0; // 前回の歩数記録時刻
let gravity = { x: 0, y: 0, z: 0};

// 定数（チューニング用）
const THRESHOLD = 10.0; // 歩数判定の閾値（最適値）
const STEP_INTERVAL = 400; // 歩行感覚の最小時間(ms)
const ALPHA = 0.9; // 重力成分を抽出するフィルタ係数
const QUEST_GOAL = 100; // クエスト目標値 (100歩)
const GOAL_BAR_WIDTH = 100; // 進捗バーの最大幅 (100%)

// Local Storageのキー
const STORAGE_KEY_STEPS = 'pedometerSteps';
const STORAGE_KEY_DATE = 'pedometerDate';

// Local Storage1の日付処理 (YYYY-MM-DD形式)
function getToday() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    // 修正済み: テンプレートリテラルを使用
    return `${year}-${month}-${day}`; 
}

// 進行状況をLocal Storageに保存する関数
function saveProgress() {
    const today = getToday();
    localStorage.setItem(STORAGE_KEY_STEPS, steps.toString());
    localStorage.setItem(STORAGE_KEY_DATE, today);
    console.log(`進行状況を保存しました。歩数: ${steps}, 日付: ${today}`);
}

// 歩数カウントを開始する関数
function startCounting() {
    if (isCounting) return;

    // センサー非対応端末チェック
    if (!('DeviceMotionEvent' in window)) {
        alert('お使いの端末では歩数計機能が利用できません。');
        return;
    }

    isCounting = true;

    // データ読み込みと日付リセットのロジック
    const today = getToday();
    const lastSaveDate = localStorage.getItem(STORAGE_KEY_DATE);
    const savedSteps = localStorage.getItem(STORAGE_KEY_STEPS);

    // 日付チェック
    if (lastSaveDate !== today) {
        steps = 0;
        localStorage.setItem(STORAGE_KEY_DATE, today);
    } else if (savedSteps !== null) {
        steps = parseInt(savedSteps, 10) || 0;
    }

    gravity = { x: 0, y: 0, z: 0 };
    lastStepTime = 0;
    stepCountElement.textContent = steps;
    
    // 計測開始時に進捗バーを更新して初期状態を反映
    updateProgress(); 
    checkMission();

    // iOSの許可を求めるためのコード
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission().then(permissionState => {
            if (permissionState === 'granted') {
                window.addEventListener('devicemotion', handleMotion);
            } else {
                alert('センサーアクセスが拒否されました。iPhoneの設定で「モーションと方向のアクセス」を有効にしてください。');
                isCounting = false;
            }
        }).catch(console.error);
    } else {
        window.addEventListener('devicemotion', handleMotion);
    }
    console.log('計測を開始しました');
}

// 歩数カウントを停止する関数
function stopCounting() {
    if (!isCounting) return;
    isCounting = false;
    window.removeEventListener('devicemotion', handleMotion);
    saveProgress();
    console.log('計測を停止しました');
}

// 動きのデータを処理する関数
function handleMotion(event) {
    const a = event.accelerationIncludingGravity;
    if (!a) return; 

    // --- 重力成分の分離 ---
    gravity.x = ALPHA * gravity.x + (1 - ALPHA) * a.x;
    gravity.y = ALPHA * gravity.y + (1 - ALPHA) * a.y;
    gravity.z = ALPHA * gravity.z + (1 - ALPHA) * a.z;

    // --- 重力を除いた純粋な加速度 ---
    const linearAcceleration = {
        x: a.x - gravity.x,
        y: a.y - gravity.y,
        z: a.z - gravity.z
    };

    // --- ベクトルの大きさ（動きの強さ） ---
    const magnitude = Math.sqrt(
        linearAcceleration.x ** 2 +
        linearAcceleration.y ** 2 +
        linearAcceleration.z ** 2
    );

    // --- 歩数判定 ---
    const now = Date.now();
    if (magnitude > THRESHOLD && now - lastStepTime > STEP_INTERVAL) {
        steps++;
        stepCountElement.textContent = steps;
        lastStepTime = now;

        checkMission();
        updateProgress();
    }
}

// 進捗バーとカスタムバーを更新
function updateProgress() {
    // 1. 標準プログレスバーの更新
    const progress = document.getElementById("progress");
    if (progress) {
        progress.value = steps;
        progress.max = QUEST_GOAL;
    }
    
    // 2. カスタム進捗バーの更新 (クエスト内の細いバー)
    const progressBarFill = document.getElementById("quest-progress-fill-1");
    if (progressBarFill) {
        let progressPercent = Math.min(steps / QUEST_GOAL, 1) * GOAL_BAR_WIDTH;
        progressBarFill.style.width = progressPercent + '%';
    }
}

function checkMission() {
    const questItem = document.getElementById("quest1");
    const msg = document.getElementById("message");
    // 達成チェックマーク要素の取得
    const questCheck = document.getElementById("quest-check-1"); 

    if (steps >= QUEST_GOAL) {
        if (!questItem.classList.contains('completed')) {
            // 達成時処理 (初回達成時のみ実行)
            questItem.classList.add('completed');
            // チェックマークの不透明度を100%にして表示
            if (questCheck) {
                 questCheck.style.opacity = 1; 
            }
            msg.textContent = "やったね！クエスト達成！";
        }
    } else {
        msg.textContent = ""; 
    }
}

// ボタンとウィンドウイベントにリスナーを追加
startButton.addEventListener('click', startCounting);
stopButton.addEventListener('click', stopCounting);
window.addEventListener('beforeunload', saveProgress);