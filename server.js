const express = require('express');
const cors = require('cors');
const path = require('path');
const { chromium } = require('playwright');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 예약 작업 상태
let reservationJob = {
    isRunning: false,
    status: '대기 중',
    logs: [],
    browser: null,
    page: null,
    context: null
};

// OS 감지
const isMac = process.platform === 'darwin';
const selectAllKey = isMac ? 'Meta+A' : 'Control+A';

// 로그 추가 함수
function addLog(message) {
    const timestamp = new Date().toLocaleString('ko-KR');
    const logEntry = `[${timestamp}] ${message}`;
    reservationJob.logs.push(logEntry);
    console.log(logEntry);

    // 최대 100개 로그만 유지
    if (reservationJob.logs.length > 100) {
        reservationJob.logs.shift();
    }
}

// 예약 실행 함수
async function runReservation(config) {
    const { srtId, srtPw, departure, arrival, date, time, departTime } = config;

    try {
        reservationJob.isRunning = true;
        reservationJob.status = '브라우저 시작 중...';
        addLog('예약 프로세스 시작');

        const isHeadless = true;
        reservationJob.browser = await chromium.launch({ headless: isHeadless });
        reservationJob.context = await reservationJob.browser.newContext();
        reservationJob.page = await reservationJob.context.newPage();

        const page = reservationJob.page;

        // 기본 타임아웃 60초로 설정
        page.setDefaultTimeout(60000);

        // 1. 로그인
        reservationJob.status = '로그인 중...';
        addLog('로그인 페이지로 이동');
        await page.goto('https://etk.srail.kr/cmc/01/selectLoginForm.do?pageId=TK0701000000');

        await page.fill('#srchDvNm01', srtId);
        await page.fill('#hmpgPwdCphd01', srtPw);
        await page.click('.loginSubmit');

        try {
            await page.waitForSelector('text=로그아웃', { timeout: 5000 });
            addLog('로그인 성공');
        } catch (e) {
            addLog('로그인 확인 시간 초과');
        }

        // 2. 열차 조회 페이지
        reservationJob.status = '조회 페이지 이동 중...';
        addLog('조회 페이지로 이동');
        await page.goto('https://etk.srail.kr/hpg/hra/01/selectScheduleList.do?pageId=TK0101010000');
        await page.waitForLoadState('networkidle');

        // 출발역 선택
        addLog(`출발역 선택: ${departure}`);
        await page.click('#dptRsStnCdNm');
        await page.keyboard.press(selectAllKey);
        await page.keyboard.press('Backspace');
        await page.keyboard.type(departure);
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);

        // 도착역 선택
        addLog(`도착역 선택: ${arrival}`);
        await page.click('#arvRsStnCdNm');
        await page.keyboard.press(selectAllKey);
        await page.keyboard.press('Backspace');
        await page.keyboard.type(arrival);
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);

        // 날짜 선택
        addLog(`날짜 설정: ${date}`);
        try {
            await page.selectOption('#dptDt', { value: date });
            addLog('날짜 선택 완료');
        } catch (e) {
            addLog('날짜 선택 실패: ' + e.message);
        }

        // 시간 선택
        addLog(`시간 선택: ${time}`);
        const hour = time.substring(0, 2);
        const timeValue = `${hour}0000`;

        try {
            await page.selectOption('#dptTm', { value: timeValue });
        } catch (e) {
            try {
                await page.selectOption('#dptTm', { label: hour });
            } catch (e2) {
                addLog('시간 선택 실패: ' + e2.message);
            }
        }

        // 3. 예약 반복 루프
        reservationJob.status = `${departTime} 열차 검색 중...`;
        let attemptCount = 0;

        while (reservationJob.isRunning) {
            attemptCount++;
            addLog(`조회 시도 #${attemptCount}`);

            try {
                // 조회 버튼 클릭
                await page.click('#search_top_tag > input');
                addLog('조회 버튼 클릭 완료');

                // 페이지 로딩 대기 (여러 방법 시도)
                await Promise.race([
                    page.waitForLoadState('networkidle', { timeout: 30000 }),
                    page.waitForTimeout(5000) // 최소 5초 대기
                ]);

                addLog('페이지 로딩 대기 완료');

                // 추가 대기
                await page.waitForTimeout(2000);

                const rowSelector = '#result-form > fieldset > div.tbl_wrap.th_thead > table > tbody > tr';

                // 테이블이 나타날 때까지 대기 (에러 처리 추가)
                try {
                    await page.waitForSelector(rowSelector, { timeout: 30000 });
                    addLog('결과 테이블 발견');
                } catch (selectorError) {
                    addLog('결과 테이블을 찾을 수 없음. 페이지 상태 확인 중...');

                    // 현재 URL 확인
                    const currentUrl = page.url();
                    addLog(`현재 URL: ${currentUrl}`);

                    // 페이지 스크린샷 저장 (디버깅용)
                    try {
                        await page.screenshot({ path: `debug_${attemptCount}.png` });
                        addLog(`스크린샷 저장: debug_${attemptCount}.png`);
                    } catch (e) {
                        // 스크린샷 실패 무시
                    }

                    // 재시도
                    addLog('다시 시도합니다...');
                    await page.waitForTimeout(3000);
                    continue;
                }

                const rows = await page.$$(rowSelector);
                addLog(`${rows.length}개의 열차 발견`);

                let targetRowIndex = -1;

                // 원하는 출발 시간의 열차 찾기
                for (let i = 0; i < rows.length; i++) {
                    try {
                        const row = rows[i];
                        const departureTimeEl = await row.$('td:nth-child(4) em');
                        if (departureTimeEl) {
                            const departureTime = await departureTimeEl.textContent();
                            if (departureTime && departureTime.trim() === departTime) {
                                targetRowIndex = i;
                                break;
                            }
                        }
                    } catch (e) {
                        addLog('요소 접근 중 오류, 재시도');
                        break;
                    }
                }

                if (targetRowIndex !== -1) {
                    addLog(`${departTime} 출발 열차 발견`);

                    const currentRows = await page.$$(rowSelector);
                    const targetRow = currentRows[targetRowIndex];

                    const reserveBtn = await targetRow.$('td:nth-child(7) a');
                    const reserveText = reserveBtn ? await reserveBtn.textContent() : '';

                    if (reserveText.includes('예약하기')) {
                        addLog('좌석 예약 가능! 예약 시도 중...');
                        reservationJob.status = '예약 중...';

                        await reserveBtn.click();

                        page.on('dialog', async dialog => {
                            addLog(`팝업: ${dialog.message()}`);
                            await dialog.accept();
                        });

                        addLog('예약 버튼 클릭 완료');
                        reservationJob.status = '예약 완료! 브라우저에서 결제를 완료하세요.';

                        // 예약 성공 시 루프 종료하지 않고 브라우저 유지
                        break;
                    } else if (reserveText.includes('매진')) {
                        reservationJob.status = `매진 상태 (시도 #${attemptCount})`;
                        addLog('매진 상태, 재시도 중...');
                    } else {
                        addLog(`상태: ${reserveText}`);
                    }
                } else {
                    addLog(`${departTime} 열차를 찾을 수 없음`);
                }

                await page.waitForTimeout(1000);

            } catch (loopError) {
                addLog(`루프 오류: ${loopError.message}`);
                addLog('3초 후 재시도...');
                await page.waitForTimeout(3000);
            }
        }

    } catch (e) {
        addLog('오류 발생: ' + e.message);
        reservationJob.status = '오류 발생: ' + e.message;

        if (reservationJob.page) {
            try {
                await reservationJob.page.screenshot({ path: 'error.png' });
            } catch (err) {
                // 스크린샷 실패 무시
            }
        }
    }
}

// API 엔드포인트

// 예약 시작
app.post('/api/reserve', async (req, res) => {
    if (reservationJob.isRunning) {
        return res.status(400).json({ error: '이미 예약 작업이 실행 중입니다.' });
    }

    const { srtId, srtPw, departure, arrival, date, time, departTime } = req.body;

    if (!srtId || !srtPw || !departure || !arrival || !date || !time || !departTime) {
        return res.status(400).json({ error: '모든 필드를 입력해주세요.' });
    }

    // 로그 초기화
    reservationJob.logs = [];

    // 백그라운드에서 실행
    runReservation({ srtId, srtPw, departure, arrival, date, time, departTime });

    res.json({ message: '예약 작업이 시작되었습니다.' });
});

// 상태 확인
app.get('/api/status', (req, res) => {
    res.json({
        isRunning: reservationJob.isRunning,
        status: reservationJob.status,
        logs: reservationJob.logs
    });
});

// 예약 취소
app.post('/api/cancel', async (req, res) => {
    if (!reservationJob.isRunning) {
        return res.status(400).json({ error: '실행 중인 작업이 없습니다.' });
    }

    reservationJob.isRunning = false;
    reservationJob.status = '취소됨';
    addLog('사용자가 예약을 취소했습니다.');

    // 브라우저 종료
    try {
        if (reservationJob.page) await reservationJob.page.close();
        if (reservationJob.context) await reservationJob.context.close();
        if (reservationJob.browser) await reservationJob.browser.close();
    } catch (e) {
        // 종료 오류 무시
    }

    res.json({ message: '예약 작업이 취소되었습니다.' });
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`http://localhost:${PORT} 에서 접속하세요.`);
});
