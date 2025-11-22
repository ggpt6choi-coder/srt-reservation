FROM node:18-slim

# Playwright 의존성 설치
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# package.json 복사 및 의존성 설치
COPY package*.json ./
RUN npm install

# Playwright 브라우저 설치
RUN npx playwright install chromium

# 앱 파일 복사
COPY . .

# 포트 설정
EXPOSE 3000

# 환경변수 설정 (Railway에서 자동 주입)
ENV HEADLESS=true

# 서버 시작
CMD ["npm", "start"]
