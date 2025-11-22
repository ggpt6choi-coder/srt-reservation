const express = require('express');
const cors = require('cors');
const path = require('path');
const { chromium } = require('playwright');

// Railway 환경 감지 (RAILWAY_STATIC_URL은 Railway에서 자동 설정됨)
const isRailway = process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_ENVIRONMENT;

// 로컬 개발 시에만 dotenv 사용
if (!isRailway) {
    try {
        require('dotenv').config();
        console.log('✅ .env 파일 로드됨 (로컬 개발 모드)');
    } catch (e) {
        console.log('⚠️ .env 파일 없음');
    }
} else {
    console.log('🚂 Railway 환경 감지 - 환경변수 직접 사용');
}

const app = express();
const PORT = process.env.PORT || 3000;

// 디버깅: 모든 환경변수 확인
console.log('=== 환경변수 디버깅 ===');
console.log('Railway 환경:', !!isRailway);
console.log('RAILWAY_STATIC_URL:', process.env.RAILWAY_STATIC_URL ? '설정됨' : '없음');
console.log('RAILWAY_ENVIRONMENT:', process.env.RAILWAY_ENVIRONMENT ? '설정됨' : '없음');
console.log('NODE_ENV:', process.env.NODE_ENV || '없음');
console.log('모든 TELEGRAM 관련 환경변수:');
Object.keys(process.env).forEach(key => {
    if (key.includes('TELEGRAM')) {
        console.log(`  ${key}: ${process.env[key] ? '설정됨' : '없음'}`);
    }
});
console.log('======================');

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
    const logEntry = {
        timestamp: Date.now(),
        message: `[${timestamp}]\n${message}`
    };
    reservationJob.logs.push(logEntry);
    console.log(logEntry.message);

    // 최근 1시간 로그만 유지
    const oneHourAgo = Date.now() - 3600000; // 1시간 = 3600000ms
    reservationJob.logs = reservationJob.logs.filter(log => log.timestamp > oneHourAgo);
}

// 텔레그램 메시지 전송 함수
async function sendTelegramMessage(message) {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    // 디버깅: 환경변수 확인
    console.log('=== 텔레그램 환경변수 확인 ===');
    console.log('TELEGRAM_BOT_TOKEN 존재:', !!TELEGRAM_BOT_TOKEN);
    console.log('TELEGRAM_CHAT_ID 존재:', !!TELEGRAM_CHAT_ID);
    if (TELEGRAM_BOT_TOKEN) console.log('BOT_TOKEN 길이:', TELEGRAM_BOT_TOKEN.length);
    if (TELEGRAM_CHAT_ID) console.log('CHAT_ID 길이:', TELEGRAM_CHAT_ID.length);

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log('❌ 텔레그램 환경변수가 설정되지 않았습니다.');
        console.log('Railway Variables에서 TELEGRAM_BOT_TOKEN과 TELEGRAM_CHAT_ID를 설정해주세요.');
        return;
    }

    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });

        if (response.ok) {
            console.log('텔레그램 메시지 전송 성공');
        } else {
            console.log('텔레그램 메시지 전송 실패:', await response.text());
        }
    } catch (error) {
        console.log('텔레그램 전송 오류:', error.message);
    }
}

// 예약 실행 함수
async function runReservation(config) {
    const { srtId, srtPw, departure, arrival, date, time, departTime } = config;

    try {
        reservationJob.isRunning = true;
        reservationJob.status = '브라우저 시작 중...';
        addLog('예약 프로세스 시작');

        const isHeadless = false;
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

        // 2. 열차 조회 페이지
        reservationJob.status = '조회 페이지 이동 중...';
        addLog('조회 페이지로 이동');
        await page.goto('https://etk.srail.kr/hpg/hra/01/selectScheduleList.do?pageId=TK0101010000');
        await page.waitForTimeout(2000); // 페이지 로딩 대기
        addLog('조회 페이지 로딩 완료');

        try {
            addLog('로그인 상태 확인 중...');

            // 모든 a 태그의 텍스트 확인
            const headerSelector = '#wrap > div.header.header-e > div.global.clear > div';
            const linkTexts = await page.$$eval(`${headerSelector} a`, links =>
                links.map(link => link.innerText.trim())
            );

            addLog(`헤더 링크 텍스트: ${JSON.stringify(linkTexts)}`);

            // '로그인' 텍스트가 있으면 로그인 실패
            if (linkTexts.some(text => text.includes('로그인'))) {
                throw new Error('로그인 실패 - 로그인 버튼이 여전히 존재함');
            }

            addLog('✅ 로그인 성공');
        } catch (e) {
            addLog('❌ 로그인 실패: 회원번호 또는 비밀번호를 확인해주세요.');
            reservationJob.status = '로그인 실패';

            // 텔레그램 알림 전송
            await sendTelegramMessage(
                `❌ <b>SRT 로그인 실패</b>\n\n` +
                `회원번호 또는 비밀번호를 확인해주세요.\n\n` +
                `예약이 중단되었습니다.`
            );

            // 브라우저 종료
            reservationJob.isRunning = false;
            if (reservationJob.browser) await reservationJob.browser.close();
            return;
        }

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

                    // 재시도
                    addLog('다시 시도합니다...');
                    await page.waitForTimeout(3000);
                    continue;
                }

                const rows = await page.$$(rowSelector);
                addLog(`${rows.length}개의 열차 발견`);

                let targetRowIndex = -1;

                // 원하는 출발 시간의 열차 찾기
                addLog(`찾는 시간: "${departTime}"`);
                for (let i = 0; i < rows.length; i++) {
                    try {
                        const row = rows[i];
                        const departureTimeEl = await row.$('td:nth-child(4) em');
                        if (departureTimeEl) {
                            const departureTime = await departureTimeEl.textContent();
                            addLog(`열차 #${i + 1} 출발시간: "${departureTime ? departureTime.trim() : 'null'}"`);
                            if (departureTime && departureTime.trim() === departTime) {
                                targetRowIndex = i;
                                addLog(`✅ 매칭 성공! 열차 #${i + 1}`);
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

                        addLog('🥳예약이 완료! SRT 앱에서 결제를 완료해주세요.');
                        reservationJob.status = '🥳예약 완료! SRT 앱에서 결제를 완료하세요.';

                        // 텔레그램 알림 전송
                        await sendTelegramMessage(
                            `🎉 <b>SRT 예약 완료!</b>\n\n` +
                            `출발: ${departure} → ${arrival}\n` +
                            `날짜: ${date}\n` +
                            `시간: ${departTime}\n\n` +
                            `SRT 앱에서 결제를 완료해주세요! 💳`
                        );

                        // 예약 완료 후 브라우저 종료
                        reservationJob.isRunning = false;

                        // 잠시 대기 후 브라우저 종료
                        await page.waitForTimeout(2000);

                        try {
                            if (reservationJob.page) await reservationJob.page.close();
                            if (reservationJob.context) await reservationJob.context.close();
                            if (reservationJob.browser) await reservationJob.browser.close();
                            addLog('브라우저 종료 완료');
                        } catch (closeError) {
                            addLog('브라우저 종료 중 오류: ' + closeError.message);
                        }

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

                // 다음 조회 전 대기 (서버 부담 감소)
                await page.waitForTimeout(5000);

            } catch (loopError) {
                addLog(`루프 오류: ${loopError.message}`);
                addLog('3초 후 재시도...');
                await page.waitForTimeout(3000);
            }
        }
    } catch (e) {
        addLog('오류 발생: ' + e.message);
        reservationJob.status = '오류 발생: ' + e.message;

        // 텔레그램 알림 전송
        await sendTelegramMessage(
            `⚠️ <b>SRT 예약 오류</b>\n\n` +
            `오류 메시지: ${e.message}\n\n` +
            `다시 시도해주세요.`
        );

        // 페이지 상태 로그
        if (reservationJob.page) {
            try {
                const currentUrl = await reservationJob.page.url();
                addLog(`오류 발생 시 URL: ${currentUrl}`);
            } catch (err) {
                // URL 가져오기 실패 무시
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

    const { appPassword, srtId, srtPw, departure, arrival, date, time, departTime } = req.body;

    // 앱 비밀번호 검증
    const correctPassword = "5392";

    // if (!correctPassword) {
    //     return res.status(500).json({ error: '서버 설정 오류: APP_PASSWORD 환경변수가 설정되지 않았습니다.' });
    // }

    if (appPassword !== correctPassword) {
        return res.status(401).json({
            error: '앱 비밀번호가 올바르지 않습니다.',
        });
    }

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
        logs: reservationJob.logs.map(log => log.message) // 메시지만 추출
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
