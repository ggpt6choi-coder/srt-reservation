const API_URL = window.location.origin;

let statusInterval = null;
let deferredPrompt = null;

// 히든 기능: 제목 더블클릭 시 회원번호 자동 입력
document.addEventListener('DOMContentLoaded', () => {
    const mainTitle = document.getElementById('mainTitle');
    if (mainTitle) {
        mainTitle.addEventListener('dblclick', () => {
            const srtIdInput = document.getElementById('srtId');
            if (srtIdInput) {
                srtIdInput.value = '2591441488';
                // 살짝 애니메이션 효과
                srtIdInput.style.backgroundColor = '#d1fae5';
                setTimeout(() => {
                    srtIdInput.style.backgroundColor = '';
                }, 500);
            }
        });
    }
});

// PWA 설치 프롬프트
window.addEventListener('beforeinstallprompt', (e) => {
    // 기본 설치 배너 방지
    e.preventDefault();
    deferredPrompt = e;

    // 이미 설치했거나 프롬프트를 거부한 적이 있으면 표시 안 함
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches;
    const promptDismissed = localStorage.getItem('installPromptDismissed');

    if (!isInstalled && !promptDismissed) {
        // 페이지 로드 후 3초 뒤에 설치 프롬프트 표시
        setTimeout(() => {
            showInstallPrompt();
        }, 3000);
    }
});

function showInstallPrompt() {
    if (!deferredPrompt) return;

    if (confirm('바탕화면에 설치하시겠습니까?\n\n홈 화면에 추가하면 앱처럼 편리하게 사용할 수 있습니다.')) {
        // 설치 프롬프트 표시
        deferredPrompt.prompt();

        // 사용자 선택 결과 확인
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('PWA 설치 완료');
            } else {
                console.log('PWA 설치 거부');
                localStorage.setItem('installPromptDismissed', 'true');
            }
            deferredPrompt = null;
        });
    } else {
        // 취소 누르면 다시 표시 안 함
        localStorage.setItem('installPromptDismissed', 'true');
    }
}

// 출발역/도착역 교환 버튼
document.getElementById('swapBtn').addEventListener('click', () => {
    const departureInput = document.getElementById('departure');
    const arrivalInput = document.getElementById('arrival');

    // 값 교환
    const temp = departureInput.value;
    departureInput.value = arrivalInput.value;
    arrivalInput.value = temp;
});

// 폼 제출
document.getElementById('reservationForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    // 날짜를 YYYYMMDD 형식으로 변환
    const dateInput = document.getElementById('date').value; // YYYY-MM-DD
    const dateFormatted = dateInput.replace(/-/g, ''); // YYYYMMDD

    // 원하는 출발 시간 파싱 및 검증
    const departTimeInput = document.getElementById('departTime').value.trim();

    // HH:MM 형식 검증 및 파싱
    const timeMatch = departTimeInput.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!timeMatch) {
        alert('출발 시간 형식이 올바르지 않습니다.\nHH:MM 형식으로 입력해주세요. (예: 10:20)');
        return;
    }

    // 시간과 분 추출 및 두 자리로 패딩
    let hour = timeMatch[1].padStart(2, '0');
    let minute = timeMatch[2].padStart(2, '0');

    // 유효성 검증
    if (parseInt(hour) > 23 || parseInt(minute) > 59) {
        alert('올바른 시간을 입력해주세요.\n시간: 00-23, 분: 00-59');
        return;
    }

    const departTime = `${hour}:${minute}`;
    const time = hour; // 시간대 (출발 시간대)

    const formData = {
        appPassword: document.getElementById('appPassword').value,
        srtId: document.getElementById('srtId').value,
        srtPw: document.getElementById('srtPw').value,
        departure: document.getElementById('departure').value,
        arrival: document.getElementById('arrival').value,
        date: dateFormatted,
        time: time, // 시간대 (HH)
        departTime: departTime // 원하는 출발 시간 (HH:MM)
    };

    try {
        const response = await fetch(`${API_URL}/api/reserve`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (response.ok) {
            alert('예약 작업이 시작되었습니다!');
            document.getElementById('startBtn').disabled = true;
            document.getElementById('cancelBtn').disabled = false;

            // 상태 폴링 시작
            startStatusPolling();
        } else {
            alert('오류: ' + data.error);
        }
    } catch (error) {
        alert('서버 연결 오류: ' + error.message);
    }
});

// 취소 버튼
document.getElementById('cancelBtn').addEventListener('click', async () => {
    if (!confirm('예약 작업을 취소하시겠습니까?')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/cancel`, {
            method: 'POST'
        });

        const data = await response.json();

        if (response.ok) {
            alert('예약 작업이 취소되었습니다.');
            document.getElementById('startBtn').disabled = false;
            document.getElementById('cancelBtn').disabled = true;
            stopStatusPolling();
        } else {
            alert('오류: ' + data.error);
        }
    } catch (error) {
        alert('서버 연결 오류: ' + error.message);
    }
});

// 상태 폴링 시작
function startStatusPolling() {
    if (statusInterval) return;

    statusInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_URL}/api/status`);
            const data = await response.json();

            updateStatus(data);
        } catch (error) {
            console.error('상태 조회 오류:', error);
        }
    }, 1000); // 1초마다 업데이트
}

// 상태 폴링 중지
function stopStatusPolling() {
    if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
    }
}

// 상태 업데이트
function updateStatus(data) {
    const statusDiv = document.getElementById('status');
    const logsDiv = document.getElementById('logs');

    // 상태 표시
    let statusClass = 'status-idle';
    if (data.isRunning) {
        statusClass = 'status-running';
    } else if (data.status.includes('완료')) {
        statusClass = 'status-success';
    } else if (data.status.includes('오류')) {
        statusClass = 'status-error';
    }

    statusDiv.innerHTML = `<div class="status-badge ${statusClass}">${data.status}</div>`;

    // 로그 표시
    if (data.logs && data.logs.length > 0) {
        logsDiv.innerHTML = data.logs
            .map(log => {
                // HTML 이스케이프 먼저 적용
                const escaped = escapeHtml(log);
                // [timestamp] 다음에 <br> 추가
                const formattedLog = escaped.replace(/\]/, ']<br>');
                return `<div class="log-entry">${formattedLog}</div>`;
            })
            .join('');

        // 자동 스크롤
        logsDiv.scrollTop = logsDiv.scrollHeight;
    } else {
        logsDiv.innerHTML = '<p class="log-empty">로그가 여기에 표시됩니다...</p>';
    }

    // 버튼 상태 업데이트
    if (!data.isRunning) {
        document.getElementById('startBtn').disabled = false;
        document.getElementById('cancelBtn').disabled = true;
        stopStatusPolling();
    }
}

// HTML 이스케이프
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// VAPID 키 변환 함수
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// 서비스 워커 등록 및 푸시 알림 설정
async function registerServiceWorker() {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker 등록 성공:', registration);

            const notifyBtn = document.getElementById('notifyBtn');
            const testNotifyToggle = document.getElementById('testNotifyToggle');
            const testNotifyCheckbox = document.getElementById('testNotifyCheckbox');

            // 항상 토글 표시
            testNotifyToggle.style.display = 'flex';

            // 실제 구독 상태 확인 후 토글 동기화
            const existingSubscription = await registration.pushManager.getSubscription();
            if (existingSubscription && Notification.permission === 'granted') {
                // 구독이 있으면 ON
                testNotifyCheckbox.checked = true;
                localStorage.setItem('testNotifyToggle', 'true');
            } else {
                // 구독이 없으면 OFF
                testNotifyCheckbox.checked = false;
                localStorage.setItem('testNotifyToggle', 'false');
            }

            // 토글 변경 이벤트
            testNotifyCheckbox.addEventListener('change', async (e) => {
                if (e.target.checked) {
                    // 권한 확인
                    if (Notification.permission === 'denied') {
                        alert('알림이 차단되어 있습니다.\n\n브라우저 설정에서 알림 권한을 허용해주세요:\n1. 주소창 왼쪽 자물쇠 아이콘 클릭\n2. "알림" 권한을 "허용"으로 변경\n3. 페이지 새로고침');
                        e.target.checked = false;
                        localStorage.setItem('testNotifyToggle', 'false');
                        return;
                    }

                    if (Notification.permission === 'default') {
                        // 권한 요청
                        const permission = await Notification.requestPermission();
                        if (permission !== 'granted') {
                            e.target.checked = false;
                            localStorage.setItem('testNotifyToggle', 'false');
                            return;
                        }
                        // 구독 등록
                        await subscribeUser(registration);
                    } else if (Notification.permission === 'granted') {
                        // 이미 권한이 있는 경우, 구독 확인 후 없으면 등록
                        const existingSubscription = await registration.pushManager.getSubscription();
                        if (!existingSubscription) {
                            await subscribeUser(registration);
                        }
                    }

                    // 테스트 알림 전송 (주석 처리)
                    try {
                        await fetch('/api/test-notification', { method: 'POST' });
                        alert('테스트 알림을 보냈습니다! (5초 내에 도착해야 합니다)');
                        localStorage.setItem('testNotifyToggle', 'true');
                    } catch (err) {
                        alert('테스트 알림 전송 실패: ' + err.message);
                        e.target.checked = false;
                        localStorage.setItem('testNotifyToggle', 'false');
                    }

                    // 구독 완료 메시지
                    localStorage.setItem('testNotifyToggle', 'true');
                } else {
                    // 토글 끄기
                    localStorage.setItem('testNotifyToggle', 'false');
                }
            });

        } catch (error) {
            console.error('Service Worker 등록 실패:', error);
        }
    }
}

// 사용자 구독 함수
async function subscribeUser(registration) {
    try {
        // 서버에서 VAPID 공개키 가져오기
        const response = await fetch('/api/vapid-key');
        const data = await response.json();
        const applicationServerKey = urlBase64ToUint8Array(data.publicKey);

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
        });

        console.log('User is subscribed:', subscription);

        // 서버에 구독 정보 전송
        await fetch('/api/subscribe', {
            method: 'POST',
            body: JSON.stringify(subscription),
            headers: {
                'Content-Type': 'application/json'
            }
        });

        alert('알림이 설정되었습니다! 예약 성공 시 알림을 받을 수 있습니다.');

    } catch (err) {
        console.log('Failed to subscribe the user: ', err);
        alert('알림 설정 실패: ' + err.message);
    }
}

// 구독 상태 확인
async function checkSubscription(registration) {
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
        console.log('User is already subscribed:', subscription);
        // 서버에 최신 구독 정보 전송 (갱신)
        await fetch('/api/subscribe', {
            method: 'POST',
            body: JSON.stringify(subscription),
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } else {
        // 권한은 있지만 구독이 없는 경우
        await subscribeUser(registration);
    }
}

// 페이지 로드 시 초기 상태 확인
window.addEventListener('load', async () => {
    // 서비스 워커 등록
    registerServiceWorker();

    try {
        const response = await fetch(`${API_URL}/api/status`);
        const data = await response.json();

        if (data.isRunning) {
            document.getElementById('startBtn').disabled = true;
            document.getElementById('cancelBtn').disabled = false;
            startStatusPolling();
        }

        updateStatus(data);
    } catch (error) {
        console.error('초기 상태 조회 오류:', error);
    }
});
