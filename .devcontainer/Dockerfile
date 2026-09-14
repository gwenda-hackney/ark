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

# Bitwarden CLI — npm run env:pull (EU vault → repo-root .env)
RUN npm install -g @bitwarden/cli@2026.8.0 --allow-scripts=core-js

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
