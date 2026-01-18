FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Install dependencies required by Playwright Chromium and sqlite3 build.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     ca-certificates \
     curl \
     python3 \
     python3-pip \
     default-jre-headless \
     build-essential \
  && rm -rf /var/lib/apt/lists/*

COPY rootfs /app

RUN npm install --omit=dev \
  && npx playwright install --with-deps chromium

RUN pip3 install --no-cache-dir garth

# Fetch Garmin FIT SDK (jar is used at runtime).
RUN mkdir -p /opt/fit-sdk \
  && curl -L -o /opt/fit-sdk/FitSDKRelease.zip https://developer.garmin.com/downloads/fit/sdk/FitSDKRelease_21.188.00.zip \
  && python3 -c "import zipfile; zf=zipfile.ZipFile('/opt/fit-sdk/FitSDKRelease.zip'); zf.extractall('/opt/fit-sdk'); zf.close()" \
  && rm /opt/fit-sdk/FitSDKRelease.zip

CMD ["node", "/app/app.js"]
