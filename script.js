// HTML要素を取得
const stepCountElement = document.getElementById('step-count');
const startButton = document.getElementById('start-button');
const stopButton = document.getElementById('stop-button');

// 変数の初期設定
let steps = 0;
let isCounting = false;
let lastAcceleration = { x: 0, y: 0, z: 0 };

// ★調整ポイント★ 誤判定を防ぐための閾値 (定数として定義)
const THRESHOLD = 10.0; 
// センサーノイズを滑らかにするための係数 (定数として定義)
const SMOOTHING_FACTOR = 0.8; 

// 歩数カウントを開始する関数
function startCounting() {
    if (isCounting) return;
    isCounting = true;
    steps = 0;
    // ★修正点★ lastAccelerationをリセットし、計測開始時のノイズを防止
    lastAcceleration = { x: 0, y: 0, z: 0 };
    stepCountElement.textContent = steps;

    // iOSの許可を求めるためのコード
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission().then(permissionState => {
            if (permissionState === 'granted') {
                window.addEventListener('devicemotion', handleMotion);
            } else {
                alert('センサーアクセスが拒否されました。設定を確認してください。');
                isCounting = false;
            }
        }).catch(console.error);
    } else {
        // Androidなど、許可が不要な環境向け
        window.addEventListener('devicemotion', handleMotion);
    }
    console.log('計測を開始しました');
}

// 歩数カウントを停止する関数
function stopCounting() {
    if (!isCounting) return;
    isCounting = false;
    window.removeEventListener('devicemotion', handleMotion);
    console.log('計測を停止しました');
}

// 動きのデータを処理する関数
function handleMotion(event) {
    const acceleration = event.accelerationIncludingGravity;

    // 現在の加速度と前回の加速度の差を計算
    const dx = acceleration.x - lastAcceleration.x;
    const dy = acceleration.y - lastAcceleration.y;
    const dz = acceleration.z - lastAcceleration.z;

    // 加速度の大きさ（ベクトルの長さ）を計算
    const magnitude = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // 閾値を超えたら歩数としてカウント
    if (magnitude > THRESHOLD) {
        steps++;
        stepCountElement.textContent = steps;
    }

    // 現在の加速度をローパスフィルタで滑らかにし、次のサイクルのために保存
    lastAcceleration = {
        x: lastAcceleration.x * SMOOTHING_FACTOR + acceleration.x * (1 - SMOOTHING_FACTOR),
        y: lastAcceleration.y * SMOOTHING_FACTOR + acceleration.y * (1 - SMOOTHING_FACTOR),
        z: lastAcceleration.z * SMOOTHING_FACTOR + acceleration.z * (1 - SMOOTHING_FACTOR),
    };
}

// ボタンにイベントリスナーを追加
startButton.addEventListener('click', startCounting);
stopButton.addEventListener('click', stopCounting);