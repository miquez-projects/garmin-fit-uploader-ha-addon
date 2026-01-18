FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Install dependencies required by Playwright Chromium and sqlite3 build.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     ca-certificates \
     curl \
     python3 \
     build-essential \
  && rm -rf /var/lib/apt/lists/*

COPY rootfs /

RUN npm install --omit=dev \
  && npx playwright install --with-deps chromium

# Fetch Garmin FIT SDK (jar is used at runtime).
RUN mkdir -p /opt/fit-sdk \
  && curl -L -o /opt/fit-sdk/FitSDKRelease.zip https://developer.garmin.com/downloads/fit/sdk/FitSDKRelease_21.188.00.zip \
  && unzip -q /opt/fit-sdk/FitSDKRelease.zip -d /opt/fit-sdk \
  && rm /opt/fit-sdk/FitSDKRelease.zip

CMD ["/run.sh"]
