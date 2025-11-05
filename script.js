// HTML要素を取得
const stepCountElement = document.getElementById('step-count');
const startButton = document.getElementById('start-button');
const stopButton = document.getElementById('stop-button');
// ミッションを表示するコンテナを取得
const currentQuestContainer = document.getElementById('current-quest-container'); 
// ボーナスクエストのコンテナ
const bonusQuestList = document.getElementById('bonus-quests-list');

// 変数の初期設定
let steps = 0;
let isCounting = false;
let lastStepTime = 0; 
let gravity = { x: 0, y: 0, z: 0};
let currentMissionIndex = 0; // ★追加★ 現在進行中のミッションのインデックス

// 定数（チューニング用）
const THRESHOLD = 10.0; // 歩数判定の閾値（最適値）
const STEP_INTERVAL = 400; // 歩行感覚の最小時間(ms)
const ALPHA = 0.9; // 重力成分を抽出するフィルタ係数
// QUEST_GOALは不要になるため削除
const GOAL_BAR_WIDTH = 100; 
const TRANSITION_DELAY = 1500; // 達成メッセージ表示から次のミッションへの移行時間(ms)

// Local Storageのキー
const STORAGE_KEY_STEPS = 'pedometerSteps';
const STORAGE_KEY_DATE = 'pedometerDate';
const STORAGE_KEY_MISSION_INDEX = 'missionIndex'; // ミッションインデックス保存用
// 連続記録と週間合計の保存キー
const STORAGE_KEY_CONSECUTIVE_DAYS = 'consecutiveDays';
const STORAGE_KEY_WEEKLY_STEPS = 'weeklySteps';

// ★ミッションデータ配列 (難易度順)★
const MISSIONS = [
    { id: 1, goal: 100, text: '初級: 100歩達成', icon: '👟' },
    { id: 2, goal: 500, text: 'ウォーミングアップ: 500歩達成', icon: '🏃' },
    { id: 3, goal: 1000, text: '基礎訓練: 1,000歩達成', icon: '⛰️' },
    { id: 4, goal: 5000, text: 'デイリー目標: 5,000歩達成', icon: '🏅' },
    { id: 5, goal: 7777, text: 'シークレットボーナス: 7,777歩！', icon: '🎁' },
    // 必要に応じてミッションを追加してください
];

// ボーナスクエストのデータ定義
const BONUS_MISSIONS = [
    // 連続記録：5日連続で5000歩を達成
    { id: 101, type: 'consecutive', goal: 5, targetSteps: 5000, text: '連続記録チャレンジャー: 5日連続達成', icon: '🔥' },
    // 週間合計：1週間で35,000歩を達成
    { id: 102, type: 'weekly', goal: 35000, text: '週間長距離ランナー: 35,000歩達成', icon: '🗓️' },
    // スピードラン：100歩を1分以内 (この実装は少し複雑になるため、今回は連続/週間のみとします)
];

// ボーナスクエストの状態を保持する変数
let consecutiveDays = 0;
let weeklySteps = 0;

// Local Storage用の日付処理 (YYYY-MM-DD形式)
function getToday() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 進行状況をLocal Storageに保存する関数
function saveProgress() {
    const today = getToday();
    localStorage.setItem(STORAGE_KEY_STEPS, steps.toString());
    localStorage.setItem(STORAGE_KEY_DATE, today);
    // ミッションインデックスも保存
    localStorage.setItem(STORAGE_KEY_MISSION_INDEX, currentMissionIndex.toString()); 
    // ボーナスデータの保存
    localStorage.setItem(STORAGE_KEY_CONSECUTIVE_DAYS, consecutiveDays.toString());
    localStorage.setItem(STORAGE_KEY_WEEKLY_STEPS, weeklySteps.toString());
    
    console.log(`進行状況を保存しました。歩数: ${steps}, 日付: ${today}, ミッション: ${currentMissionIndex}`);
}

// ★現在のミッションをDOMに表示する関数★
function renderCurrentMission() {
    const mission = MISSIONS[currentMissionIndex];
    if (!mission) {
        currentQuestContainer.innerHTML = '<li class="quest-item completed"><div class="quest-content">🎉 全てのクエストをクリアしました！</div></li>';
        return;
    }

    // 動的にミッション要素を生成
    currentQuestContainer.innerHTML = `
        <li id="current-quest" class="quest-item" data-goal="${mission.goal}">
            <div class="quest-content">
                <span class="quest-icon">${mission.icon}</span> 
                <div class="quest-text-bar">
                    <span id="quest-description">${mission.text}</span>
                    <div class="custom-progress-bar">
                        <div id="quest-progress-fill" class="progress-fill"></div>
                    </div>
                </div>
            </div>
            <span id="quest-check" class="quest-check">✅</span>
        </li>
    `;
    
    // 表示更新
    document.getElementById("message").textContent = "";
    updateProgress(); 
}

// ボーナスミッションをDOMに表示する関数
function renderBonusMissions() {
    bonusQuestList.innerHTML = ''; // リストをクリア

    BONUS_MISSIONS.forEach(mission => {
        let statusText = '';
        let currentProgress = 0;

        if (mission.type === 'consecutive') {
            currentProgress = consecutiveDays;
            statusText = `${consecutiveDays}/${mission.goal} 日連続`;
        } else if (mission.type === 'weekly') {
            currentProgress = weeklySteps;
            statusText = `${weeklySteps.toLocaleString()}/${mission.goal.toLocaleString()} 歩`;
        }
        
        const isCompleted = currentProgress >= mission.goal;

        // ボーナスミッションのHTML構造
        const html = `
            <li id="bonus-quest-${mission.id}" class="quest-item ${isCompleted ? 'completed' : ''}">
                <div class="quest-content">
                    <span class="quest-icon">${mission.icon}</span> 
                    <div class="quest-text-bar">
                        <span id="bonus-description-${mission.id}">${mission.text}</span>
                        <span class="quest-status">${statusText}</span>
                    </div>
                </div>
                <span class="quest-check" style="opacity: ${isCompleted ? 1 : 0};">✅</span>
            </li>
        `;
        bonusQuestList.insertAdjacentHTML('beforeend', html);
    });
}

// ★次のミッションに進む関数★
function moveToNextMission() {
    // 達成メッセージを出す
    document.getElementById("message").textContent = `🎉 クエスト達成: ${MISSIONS[currentMissionIndex].text}！`;

    // インデックスを進める
    currentMissionIndex++;

    // 全ミッションをクリアしたかチェック
    if (currentMissionIndex < MISSIONS.length) {
        renderCurrentMission(); // 次のミッションがあればレンダリング
    } else {
        // 全クリア時の表示
        renderCurrentMission(); // 全クリアメッセージをレンダリング
    }
    
    saveProgress(); // 新しいインデックスを保存
}

// 歩数カウントを開始する関数
function startCounting() {
    if (isCounting) return;

    if (!('DeviceMotionEvent' in window)) {
        alert('お使いの端末では歩数計機能が利用できません。');
        return;
    }

    isCounting = true;

    // データ読み込みと日付リセットのロジック
    const today = getToday();
    const lastSaveDate = localStorage.getItem(STORAGE_KEY_DATE);
    const savedSteps = localStorage.getItem(STORAGE_KEY_STEPS);
    // ミッションインデックスの読み込み
    const savedMissionIndex = localStorage.getItem(STORAGE_KEY_MISSION_INDEX); 
    const savedConsecutiveDays = localStorage.getItem(STORAGE_KEY_CONSECUTIVE_DAYS);
const savedWeeklySteps = localStorage.getItem(STORAGE_KEY_WEEKLY_STEPS);

    // 日付チェック (歩数のみリセット)
    if (lastSaveDate !== today) {
        steps = 0;
        localStorage.setItem(STORAGE_KEY_DATE, today);

    // 連続記録の判定とリセット
    // 前日の歩数が目標を達成していなければ連続記録をリセット
    const lastDaySteps = parseInt(localStorage.getItem(STORAGE_KEY_STEPS) || '0', 10);
    const targetStepsForConsecutive = 5000; // 5000歩を連続達成の基準とする

    if (lastDaySteps >= targetStepsForConsecutive) {
        // 連続記録を1日追加
        consecutiveDays = parseInt(savedConsecutiveDays || '0', 10) + 1;
    } else {
        // 目標未達のためリセット
        consecutiveDays = 0;
    }
    
    } else if (savedSteps !== null) {
        steps = parseInt(savedSteps, 10) || 0;
    }
    
    // ミッションインデックスの読み込み
    if (savedMissionIndex !== null) {
        currentMissionIndex = parseInt(savedMissionIndex, 10) || 0;
    }
    // ボーナス変数の読み込み
    if (savedConsecutiveDays !== null) {
        consecutiveDays = parseInt(savedConsecutiveDays, 10) || 0;
    }
    if (savedWeeklySteps !== null) {
        weeklySteps = parseInt(savedWeeklySteps, 10) || 0;
    }

    gravity = { x: 0, y: 0, z: 0 };
    lastStepTime = 0;
    stepCountElement.textContent = steps;
    
    renderCurrentMission(); // 読み込んだミッションをレンダリング
    renderBonusMissions(); // ボーナスミッションのレンダリング

    // iOSの許可を求めるためのコード（変更なし）
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission().then(permissionState => {
            if (permissionState === 'granted') {
                window.addEventListener('devicemotion', handleMotion);
            } else {
                alert('センサーアクセスが拒否されました。iPhoneの設定を確認してください。');
                isCounting = false;
            }
        }).catch(console.error);
    } else {
        window.addEventListener('devicemotion', handleMotion);
    }
    console.log('計測を開始しました');
}

// 歩数カウントを停止する関数 (変更なし)
function stopCounting() {
    if (!isCounting) return;
    isCounting = false;
    window.removeEventListener('devicemotion', handleMotion);
    saveProgress();
    console.log('計測を停止しました');
}

// 動きのデータを処理する関数 (中身は省略)
function handleMotion(event) {
    // ... (前の回答の加速度センサーの処理ロジックをここに挿入) ...
    const a = event.accelerationIncludingGravity;
    if (!a) return; 

    // 重力成分の分離
    gravity.x = ALPHA * gravity.x + (1 - ALPHA) * a.x;
    gravity.y = ALPHA * gravity.y + (1 - ALPHA) * a.y;
    gravity.z = ALPHA * gravity.z + (1 - ALPHA) * a.z;

    // 重力を除いた純粋な加速度
    const linearAcceleration = {
        x: a.x - gravity.x,
        y: a.y - gravity.y,
        z: a.z - gravity.z
    };

    // ベクトルの大きさ
    const magnitude = Math.sqrt(
        linearAcceleration.x ** 2 +
        linearAcceleration.y ** 2 +
        linearAcceleration.z ** 2
    );

    // 歩数判定
    const now = Date.now();
    if (magnitude > THRESHOLD && now - lastStepTime > STEP_INTERVAL) {
        steps++;
        stepCountElement.textContent = steps;
        lastStepTime = now;

        // 週間合計も加算
        weeklySteps++;

        checkMission();
        updateProgress();

        // ボーナスミッションの再描画
        renderBonusMissions();
    }
}

// ★現在のミッションのみ進捗バーを更新★
function updateProgress() {
    const mission = MISSIONS[currentMissionIndex];
    if (!mission) return; 

    const progressBarFill = document.getElementById("quest-progress-fill");
    if (progressBarFill) {
        let progressPercent = Math.min(steps / mission.goal, 1) * GOAL_BAR_WIDTH;
        progressBarFill.style.width = progressPercent + '%';
    }
}

// ★現在のミッションの達成判定と次のミッションへの移行★
function checkMission() {
    const mission = MISSIONS[currentMissionIndex];
    if (!mission) return; 

    // 達成判定
    if (steps >= mission.goal) {
        const currentQuestElement = document.getElementById("current-quest");
        const questCheckElement = document.getElementById("quest-check");
        
        // 達成アニメーション
        if (currentQuestElement) currentQuestElement.classList.add('completed');
        if (questCheckElement) questCheckElement.style.opacity = 1;

        // 達成後、指定時間待って次のミッションに移行
        setTimeout(moveToNextMission, TRANSITION_DELAY); 
    }
}

// ボタンとウィンドウイベントにリスナーを追加
startButton.addEventListener('click', startCounting);
stopButton.addEventListener('click', stopCounting);
window.addEventListener('beforeunload', saveProgress);

// アプリ起動時の初期表示
document.addEventListener('DOMContentLoaded', () => {
    // 保存されていた歩数とミッションインデックスを読み込む
    const savedSteps = localStorage.getItem(STORAGE_KEY_STEPS);
    const savedMissionIndex = localStorage.getItem(STORAGE_KEY_MISSION_INDEX);
    if (savedSteps !== null) {
        steps = parseInt(savedSteps, 10) || 0;
        stepCountElement.textContent = steps;
    }
    if (savedMissionIndex !== null) {
        currentMissionIndex = parseInt(savedMissionIndex, 10) || 0;
    }
    renderCurrentMission(); // 最後に保存したミッションを表示
});