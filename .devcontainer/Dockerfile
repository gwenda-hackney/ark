FROM node:24

# Shared Gwenda image: ark site toolchain + nest docs tools.
# Nest `.devcontainer/devcontainer.json` builds this file too.

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gh \
        jq \
        sudo \
        curl \
        python3 \
        python3-pip \
        python3-venv \
        imagemagick \
        ripgrep \
        fd-find \
        pandoc \
        poppler-utils \
        tesseract-ocr \
        csvkit \
        qpdf \
        unzip \
    && rm -rf /var/lib/apt/lists/* \
    && echo "node ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

RUN ln -sf "$(command -v fdfind)" /usr/local/bin/fd || true

RUN python3 -m pip install --break-system-packages --no-cache-dir \
        httpx \
        pyyaml \
        ruff \
        pandas \
        openpyxl \
        python-docx \
        pypdf \
        tabulate

# Bitwarden CLI — bw-unlock is the login for local secrets (docs/env.md)
RUN npm install -g @bitwarden/cli@2026.8.0 --allow-scripts=core-js

# Secrets Manager CLI — scripts/lib/load-env.mjs reads SM into memory. Script can also self-install.
RUN curl -sL -o /tmp/bws.zip \
      "https://github.com/bitwarden/sdk-sm/releases/download/bws-v2.1.0/bws-x86_64-unknown-linux-gnu-2.1.0.zip" \
    && unzip -o -j /tmp/bws.zip bws -d /usr/local/bin \
    && chmod 755 /usr/local/bin/bws \
    && rm -f /tmp/bws.zip \
    && bws --version

ARG USERNAME=node

RUN \
    mkdir -p /home/${USERNAME}/.config /home/${USERNAME}/.config/pnpm /home/${USERNAME}/.pnpm-store \
    && printf "store-dir=/home/${USERNAME}/.pnpm-store\n" > /home/${USERNAME}/.config/pnpm/rc \
    && chown -R ${USERNAME}:${USERNAME} /home/${USERNAME}/.config /home/${USERNAME}/.pnpm-store

RUN mkdir -p /src/node_modules /src/.forge /home/${USERNAME}/.npm \
    && chown -R ${USERNAME}:${USERNAME} /src/node_modules /src/.forge /home/${USERNAME}/.npm

RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
    && mkdir /commandhistory \
    && touch /commandhistory/.bash_history \
    && chown -R $USERNAME /commandhistory \
    && echo "$SNIPPET" >> "/home/$USERNAME/.bashrc"

RUN grep -qxF "alias python=python3" "/home/$USERNAME/.bashrc" \
    || echo "alias python=python3" >> "/home/$USERNAME/.bashrc"

# The Bitwarden session snippet (bw-unlock / bw-lock) is installed into
# ~/.bashrc by post-start.sh from bw-session.bashrc, on every start.
