const API_URL = window.location.origin;

let statusInterval = null;
let deferredPrompt = null;

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

    const formData = {
        appPassword: document.getElementById('appPassword').value,
        srtId: document.getElementById('srtId').value,
        srtPw: document.getElementById('srtPw').value,
        departure: document.getElementById('departure').value,
        arrival: document.getElementById('arrival').value,
        date: dateFormatted,
        time: document.getElementById('time').value,
        departTime: document.getElementById('departTime').value
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
            .map(log => `<div class="log-entry">${escapeHtml(log)}</div>`)
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

// 페이지 로드 시 초기 상태 확인
window.addEventListener('load', async () => {
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
