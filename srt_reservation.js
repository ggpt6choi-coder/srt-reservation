require('dotenv').config();
const { chromium } = require('playwright');

// OS 감지
const isMac = process.platform === 'darwin';
const selectAllKey = isMac ? 'Meta+A' : 'Control+A';

async function run() {
    // 환경변수로 headless 모드 제어 (CI 환경에서는 true)
    const isHeadless = true;

    const browser = await chromium.launch({ headless: isHeadless });
    const context = await browser.newContext(); // 화면 녹화 대신 Tracing 사용

    const page = await context.newPage();

    const { SRT_ID, SRT_PW, DEPARTURE, ARRIVAL, DATE, TIME } = process.env;

    if (!SRT_ID || !SRT_PW || !DEPARTURE || !ARRIVAL || !DATE || !TIME) {
        console.error('.env 파일을 확인하세요. 모든 필드가 필요합니다.');
        await browser.close();
        return;
    }

    try {
        // 1. 로그인
        console.log('로그인 페이지로 이동 중...');
        await page.goto('https://etk.srail.kr/cmc/01/selectLoginForm.do?pageId=TK0701000000');

        console.log('로그인 시도 중...');
        await page.fill('#srchDvNm01', SRT_ID);
        await page.fill('#hmpgPwdCphd01', SRT_PW);
        await page.click('.loginSubmit');

        // 로그인 성공 대기
        try {
            await page.waitForSelector('text=로그아웃', { timeout: 5000 });
            console.log('로그인 성공.');
        } catch (e) {
            console.log('로그인 확인 시간 초과. 메인 페이지 또는 오류 확인 중...');
        }

        // 2. 열차 조회
        console.log('조회 페이지로 이동 중...');
        await page.goto('https://etk.srail.kr/hpg/hra/01/selectScheduleList.do?pageId=TK0101010000');
        await page.waitForLoadState('networkidle');

        // 출발역 선택
        console.log(`출발역 선택: ${DEPARTURE}`);
        await page.click('#dptRsStnCdNm');
        await page.keyboard.press(selectAllKey);
        await page.keyboard.press('Backspace');
        await page.keyboard.type(DEPARTURE);
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);

        // 도착역 선택
        console.log(`도착역 선택: ${ARRIVAL}`);
        await page.click('#arvRsStnCdNm');
        await page.keyboard.press(selectAllKey);
        await page.keyboard.press('Backspace');
        await page.keyboard.type(ARRIVAL);
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);

        // 날짜 선택
        console.log(`날짜 설정: ${DATE}`);
        try {
            await page.selectOption('#dptDt', { value: DATE });
            console.log('날짜 선택 완료.');
        } catch (e) {
            console.error('날짜 선택 실패:', e);
        }

        // 시간 선택
        console.log(`시간 선택: ${TIME}`);
        const hour = TIME.substring(0, 2);
        const timeValue = `${hour}0000`;

        console.log(`시간 값으로 선택 시도: ${timeValue}`);
        try {
            await page.selectOption('#dptTm', { value: timeValue });
        } catch (e) {
            console.log(`값 ${timeValue}로 선택 실패. 라벨 ${hour}로 재시도...`);
            try {
                await page.selectOption('#dptTm', { label: hour });
            } catch (e2) {
                console.error('시간 선택 실패:', e2);
            }
        }

        // 3. 예약 반복 루프
        while (true) {
            console.log('조회하기 클릭...');
            await page.click('#search_top_tag > input');
            await page.waitForLoadState('networkidle');

            console.log('결과 확인 중...');
            const rowSelector = '#result-form > fieldset > div.tbl_wrap.th_thead > table > tbody > tr';
            await page.waitForSelector(rowSelector);

            const rows = await page.$$(rowSelector);
            let targetRow = null;
            let targetRowIndex = -1;

            // 원하는 출발 시간의 열차 찾기
            for (let i = 0; i < rows.length; i++) {
                try {
                    const row = rows[i];
                    const departureTimeEl = await row.$('td:nth-child(4) em');
                    if (departureTimeEl) {
                        const departureTime = await departureTimeEl.textContent();
                        if (departureTime && departureTime.trim() === process.env.DEPART_TIME) {
                            targetRowIndex = i;
                            break;
                        }
                    }
                } catch (e) {
                    // 페이지 네비게이션으로 인한 오류 무시
                    console.log('요소 접근 중 오류 발생, 다음 시도에서 재확인합니다.');
                    break;
                }
            }

            if (targetRowIndex !== -1) {
                console.log(`${process.env.DEPART_TIME} 출발 열차 발견. 예약 가능 여부 확인 중...`);

                // Tracing 시작 (스냅샷, 스크린샷 포함)
                await context.tracing.start({ screenshots: true, snapshots: true });

                // 인덱스로 다시 요소 가져오기 (페이지가 변경될 수 있으므로)
                const currentRows = await page.$$(rowSelector);
                targetRow = currentRows[targetRowIndex];

                // 일반실 확인 (7번째 열)
                const reserveBtn = await targetRow.$('td:nth-child(7) a');
                const reserveText = reserveBtn ? await reserveBtn.textContent() : '';

                if (reserveText.includes('예약하기')) {
                    console.log('좌석 예약 가능! 예약 시도 중...');

                    // 팝업 메시지 감지용 변수
                    let dialogMessage = null;
                    const dialogHandler = async dialog => {
                        dialogMessage = dialog.message();
                        console.log(`팝업 감지: ${dialogMessage}`);
                        await dialog.accept();
                    };
                    page.on('dialog', dialogHandler);

                    await reserveBtn.click();

                    // 클릭 후 잠시 대기
                    await page.waitForTimeout(2000);

                    // 리스너 제거
                    page.removeListener('dialog', dialogHandler);

                    // 1. 실패 팝업 확인
                    if (dialogMessage && (dialogMessage.includes('잔여석없음') || dialogMessage.includes('매진') || dialogMessage.includes('오류'))) {
                        console.log(`❌ 예약 실패 (팝업): ${dialogMessage}`);
                        continue; // 루프 계속
                    }

                    // 2. 페이지 이동 확인
                    const currentUrl = page.url();
                    if (currentUrl.includes('selectListDtl.do') || currentUrl.includes('confirmReservationInfo.do')) {
                        console.log('🥳 예약 성공! 결제 페이지로 이동했습니다.');
                        console.log('브라우저에서 결제를 완료하세요.');

                        // 성공 시 Trace 저장
                        const tracePath = `./traces/success_${Date.now()}.zip`;
                        await context.tracing.stop({ path: tracePath });
                        console.log(`✅ 예약 성공 순간이 녹화되었습니다: ${tracePath}`);
                        console.log('확인 방법: npx playwright show-trace ' + tracePath);

                        break;
                    } else {
                        console.log(`⚠️ 예약 확인 실패: 페이지가 이동하지 않음. (URL: ${currentUrl})`);
                        if (dialogMessage) console.log(`마지막 팝업 메시지: ${dialogMessage}`);
                        // 재시도
                        await context.tracing.stop(); // 실패 시 저장하지 않음
                    }
                } else if (reserveText.includes('매진')) {
                    console.log('매진 상태. 재시도 중...');
                } else {
                    console.log(`상태: ${reserveText}. 재시도 중...`);
                }

                // 루프 돌면서 Tracing이 켜져있을 수 있으므로 안전하게 중지 (저장 X)
                try { await context.tracing.stop(); } catch (e) { }

            } else {
                console.log(`${process.env.DEPART_TIME} 출발 열차를 찾을 수 없습니다. 재시도 중...`);
            }

            // 재시도 전 대기
            await page.waitForTimeout(500);
        }

        // 종료
        console.log('브라우저를 종료합니다.');
        await page.close();
        await context.close();
        await browser.close();

    } catch (e) {
        console.error('오류 발생:', e);
        await page.screenshot({ path: 'error.png' });
    }
}

run();
