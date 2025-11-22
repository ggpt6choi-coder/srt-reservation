# SRT 자동 예약 시스템

휴대폰에서도 사용 가능한 SRT 자동 예약 웹 애플리케이션입니다.

## 기능

- 🚄 SRT 열차 자동 예약
- 📱 모바일 친화적 웹 UI
- 🔄 매진 시 자동 재시도
- 📊 실시간 상태 및 로그 확인
- ☁️ Railway 클라우드 배포 지원

## 로컬 실행

```bash
# 의존성 설치
npm install

# 서버 시작
npm start
```

브라우저에서 `http://localhost:3000` 접속

## Railway 배포

1. GitHub 저장소 생성 및 코드 푸시
2. [Railway](https://railway.app) 가입
3. "New Project" → "Deploy from GitHub repo" 선택
4. 저장소 선택 및 배포
5. 생성된 URL로 접속

### Railway 환경변수 설정 (중요!)

Railway에서 환경변수를 설정하려면 **Railway CLI**를 사용해야 합니다:

```bash
# 1. Railway CLI 설치
brew install railway

# 2. Railway 로그인
railway login

# 3. 프로젝트 연결
railway link

# 4. 환경변수 설정 (핵심!)
railway variables --set "TELEGRAM_BOT_TOKEN=your_token" \
                  --set "TELEGRAM_CHAT_ID=your_chat_id" \
                  --set "APP_PASSWORD=your_password"
```

> **참고**: Railway Dashboard UI에서 Variables를 설정해도 Docker 컨테이너에 제대로 주입되지 않을 수 있습니다. Railway CLI를 사용하는 것이 가장 확실합니다.

## 환경 변수

Railway 배포 시 다음 환경변수를 설정해야 합니다:

- `TELEGRAM_BOT_TOKEN`: 텔레그램 봇 토큰 (예약 알림용)
- `TELEGRAM_CHAT_ID`: 텔레그램 채팅 ID
- `APP_PASSWORD`: 웹 UI 접근 비밀번호
- `HEADLESS`: 자동으로 `true`로 설정됨

## 사용 방법

1. 웹 UI에서 SRT 회원정보 입력
2. 출발역, 도착역, 날짜, 시간 입력
3. 원하는 출발 시간 입력 (예: 10:20)
4. "예약 시작" 버튼 클릭
5. 매진 시 자동으로 재시도하며 예약 가능 시 자동 예약

## 기술 스택

- **Backend**: Node.js, Express
- **Frontend**: HTML, CSS, JavaScript
- **Automation**: Playwright
- **Deployment**: Railway (Docker)

## 라이선스

MIT
