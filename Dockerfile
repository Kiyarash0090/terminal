# ── Stage 1: باینری آمادهٔ سرور Bot API محلی ──
# توجه: باینری telegram-bot-api از ایمیج آمادهٔ aiogram کپی می‌شود و
# TDLib از سورس کامپایل نمی‌شود تا بیلد Railway به سقف زمانی نرسد.
FROM aiogram/telegram-bot-api:10.5-linuxamd64 AS tgbotapi

FROM node:22-slim

WORKDIR /app

# Ensure pip doesn't complain about externally-managed-environment & prefers wheels
ENV PIP_BREAK_SYSTEM_PACKAGES=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_PREFER_BINARY=1 \
    BOT_API_BASE_URL="http://127.0.0.1:8081" \
    BOT_API_LOCAL="1" \
    BOT_API_MAX_UPLOAD_MB="2000"

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    ffmpeg \
    curl \
    unzip \
    ca-certificates \
    proxychains4 \
    tini \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install Xray-core (replacement for v2ray with xhttp, reality support)
RUN ARCH=$(dpkg --print-architecture) \
    && case "$ARCH" in \
        amd64) XRAY_ARCH="64" ;; \
        arm64) XRAY_ARCH="arm64-v8a" ;; \
        armhf) XRAY_ARCH="arm32-v7a" ;; \
        *)     XRAY_ARCH="64" ;; \
    esac \
    && (curl -fsSL "https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-${XRAY_ARCH}.zip" -o /tmp/xray.zip \
        || curl -fsSL "https://github.com/XTLS/Xray-core/releases/download/v26.3.27/Xray-linux-${XRAY_ARCH}.zip" -o /tmp/xray.zip) \
    && unzip -q /tmp/xray.zip -d /tmp/xray \
    && mv /tmp/xray/xray /usr/local/bin/xray \
    && chmod +x /usr/local/bin/xray \
    && ln -sf /usr/local/bin/xray /usr/local/bin/v2ray \
    && rm -rf /tmp/xray /tmp/xray.zip

# Install Deno
ENV DENO_INSTALL="/root/.deno"
ENV PATH="${DENO_INSTALL}/bin:${PATH}"
RUN curl -fsSL https://deno.land/install.sh | sh \
    && ln -sf /root/.deno/bin/deno /usr/local/bin/deno

# Copy Node dependency definitions and install
COPY package*.json ./
RUN npm install

# Copy source files
COPY . .

# Install Python requirements (root requirements.txt & telegram bot requirements)
RUN pip3 install --no-cache-dir --break-system-packages --prefer-binary -r requirements.txt || true
RUN if [ -f "telegram_bot/requirements.txt" ]; then pip3 install --no-cache-dir --break-system-packages --prefer-binary -r "telegram_bot/requirements.txt" || true; fi

# Copy proxychains configuration
RUN if [ -f "telegram_bot/proxychains.conf" ]; then \
      cp "telegram_bot/proxychains.conf" /etc/proxychains4.conf && \
      cp "telegram_bot/proxychains.conf" /etc/proxychains.conf; \
    elif [ -f "proxychains.conf" ]; then \
      cp proxychains.conf /etc/proxychains4.conf && \
      cp proxychains.conf /etc/proxychains.conf; \
    fi

# Clone and install bgutil-ytdlp-pot-provider plugin and server to /opt/bgutil
RUN git clone https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /opt/bgutil \
    && if [ -d "/opt/bgutil/server" ]; then cd /opt/bgutil/server && npm install && (npx tsc || true); fi \
    && (pip3 install --no-cache-dir --break-system-packages --prefer-binary bgutil-ytdlp-pot-provider yt-dlp || true) \
    && mkdir -p /root/.yt-dlp/plugins /root/yt-dlp-plugins /root/.config/yt-dlp \
    && echo '--extractor-args "youtubepot:provider=http://127.0.0.1:4416"' > /etc/yt-dlp.conf \
    && cp /etc/yt-dlp.conf /root/.config/yt-dlp/config

# باینری و کتابخانه‌های musl سرور Bot API محلی از stage قبل
# (در مسیر ایزوله کپی می‌شوند تا با glibc دبیان تداخل نداشته باشند)
COPY --from=tgbotapi /usr/local/bin/telegram-bot-api /usr/local/bin/telegram-bot-api
COPY --from=tgbotapi /lib/ /opt/tgbotapi/rootfs/lib/
COPY --from=tgbotapi /usr/lib/ /opt/tgbotapi/rootfs/usr/lib/
RUN ln -sf /opt/tgbotapi/rootfs/lib/ld-musl-x86_64.so.1 /lib/ld-musl-x86_64.so.1 \
    && printf "/opt/tgbotapi/rootfs/lib\n/opt/tgbotapi/rootfs/usr/lib\n" > /etc/ld-musl-x86_64.path \
    && ln -sf /etc/ssl/certs/ca-certificates.crt /etc/ssl/cert.pem \
    && telegram-bot-api --version

# ساخت دایرکتوری‌های مورد نیاز
# --dir و --temp-dir سرور Bot API باید از قبل وجود داشته باشند، وگرنه سرور بی‌صدا می‌میرد.
RUN mkdir -p downloads temp /opt/tgbotapi/data /opt/tgbotapi/temp

# Entrypoint: سرور Bot API محلی را در پس‌زمینه بالا می‌آورد و سپس برنامه اصلی را اجرا می‌کند
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && bash -n /usr/local/bin/docker-entrypoint.sh

RUN npm run build

EXPOSE 3000 8081

ENV PORT=3000
ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "start"]
