FROM node:22-slim

WORKDIR /app

# Ensure pip doesn't complain about externally-managed-environment & prefers wheels
ENV PIP_BREAK_SYSTEM_PACKAGES=1
ENV PIP_NO_CACHE_DIR=1
ENV PIP_PREFER_BINARY=1

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



RUN npm run build

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "start"]
