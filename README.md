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

## 환경 변수

Railway 배포 시 자동으로 `HEADLESS=true`가 설정됩니다.

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
