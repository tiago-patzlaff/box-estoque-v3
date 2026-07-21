const App = {
    _token: null,

    init() {
        this._token = localStorage.getItem('token');
        this._setupOfflineSync();
        this._setupOnlineListener();
    },

    _authHeaders(extra = {}) {
        const h = { ...extra };
        if (this._token) h['Authorization'] = 'Bearer ' + this._token;
        return h;
    },

    _setupOnlineListener() {
        window.addEventListener('online', () => {
            this._removeOfflineBadge();
            this._syncPending();
        });
        window.addEventListener('offline', () => {
            this._showOfflineBadge();
        });
        if (!navigator.onLine) this._showOfflineBadge();
    },

    _showOfflineBadge() {
        if (document.getElementById('offline-badge')) return;
        const badge = document.createElement('div');
        badge.id = 'offline-badge';
        badge.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#e74c3c;color:#fff;text-align:center;padding:6px;font-size:13px;font-weight:700;';
        badge.textContent = 'Sem conexao — operacoes serao salvas localmente';
        document.body.appendChild(badge);
    },

    _removeOfflineBadge() {
        const b = document.getElementById('offline-badge');
        if (b) b.remove();
    },

    _getQueue() {
        try { return JSON.parse(localStorage.getItem('offline_queue') || '[]'); } catch { return []; }
    },

    _saveQueue(queue) {
        localStorage.setItem('offline_queue', JSON.stringify(queue));
        this._updatePendingBadge();
    },

    _updatePendingBadge() {
        const queue = this._getQueue();
        let badge = document.getElementById('pending-badge');
        if (queue.length === 0) {
            if (badge) badge.remove();
            return;
        }
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'pending-badge';
            badge.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;background:#f39c12;color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.3);';
            document.body.appendChild(badge);
        }
        badge.textContent = `${queue.length} operacao(oes) pendente(s)`;
    },

    async _syncPending() {
        const queue = this._getQueue();
        if (queue.length === 0) return;
        this.toast('Sincronizando operacoes pendentes...', 'info');
        let synced = 0;
        const failed = [];
        for (const item of queue) {
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (item.token) headers['Authorization'] = 'Bearer ' + item.token;
                const res = await fetch(item.url, {
                    method: item.method,
                    credentials: 'same-origin',
                    headers,
                    body: JSON.stringify(item.body)
                });
                if (res.ok) {
                    synced++;
                } else {
                    failed.push(item);
                }
            } catch {
                failed.push(item);
            }
        }
        this._saveQueue(failed);
        if (synced > 0) {
            this.toast(`${synced} operacao(oes) sincronizada(s)!`, 'success');
        }
        if (failed.length === 0 && synced > 0) {
            this.toast('Tudo sincronizado!', 'success');
        } else if (failed.length > 0) {
            this.toast(`${failed.length} operacao(oes) falhou — sera tentado novamente`, 'warning');
        }
    },

    async checkAuth() {
        try {
            const res = await fetch('api/check', {
                credentials: 'same-origin',
                headers: this._authHeaders()
            });
            const data = await res.json();
            if (!data.autenticado) { window.location.href = 'login.html'; return null; }
            localStorage.setItem('cached_user', JSON.stringify(data.usuario));
            return data.usuario;
        } catch (e) {
            if (!navigator.onLine) {
                const cached = localStorage.getItem('cached_user');
                if (cached) return JSON.parse(cached);
            }
            window.location.href = 'login.html';
            return null;
        }
    },

    async logout() {
        await fetch('api/logout', {
            method: 'POST',
            credentials: 'same-origin',
            headers: this._authHeaders()
        });
        localStorage.removeItem('token');
        localStorage.removeItem('cached_user');
        this._token = null;
        window.location.href = 'login.html';
    },

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    },

    toast(msg, type = 'success') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const t = document.createElement('div');
        t.className = `toast toast-${type}`;
        const icons = { success: '&#10003;', error: '&#10007;', warning: '&#9888;', info: '&#8505;' };
        t.innerHTML = `<span>${icons[type] || ''}</span> ${App.escapeHtml(msg)}`;
        container.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(100px)'; setTimeout(() => t.remove(), 300); }, 4000);
    },

    async apiFetch(url, options = {}) {
        try {
            const headers = this._authHeaders(options.headers || {});
            if (options.body && !headers['Content-Type']) {
                headers['Content-Type'] = 'application/json';
            }
            const res = await fetch(url, { credentials: 'same-origin', ...options, headers });
            const data = await res.json();
            if (res.status === 401) {
                localStorage.removeItem('token');
                this._token = null;
                window.location.href = 'login.html';
                return null;
            }
            return { ok: res.ok, status: res.status, data };
        } catch (e) {
            const method = (options.method || 'GET').toUpperCase();
            if (method !== 'GET' && options.body) {
                const queue = this._getQueue();
                queue.push({
                    url,
                    method,
                    body: JSON.parse(options.body),
                    token: this._token,
                    timestamp: Date.now()
                });
                this._saveQueue(queue);
                this.toast('Salvo offline — sera sincronizado quando voltar a internet', 'warning');
                return { ok: true, status: 0, data: { offline: true, mensagem: 'Operacao salva offline' } };
            }
            this.toast('Erro de conexao com o servidor', 'error');
            return { ok: false, status: 0, data: { erro: 'Erro de conexao' } };
        }
    },

    async apiGet(url) { return App.apiFetch(url); },

    async apiPost(url, body) {
        return App.apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
    },

    async apiPut(url, body) {
        return App.apiFetch(url, { method: 'PUT', body: JSON.stringify(body) });
    },

    async apiDelete(url) { return App.apiFetch(url, { method: 'DELETE' }); },

    formatDate(str) {
        if (!str) return '';
        return new Date(str).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    },

    async carregarProdutos(selectId, filtro) {
        let url = 'api/produtos';
        if (filtro) url += '?q=' + encodeURIComponent(filtro);
        const res = await App.apiGet(url);
        if (res && res.ok) {
            const data = Array.isArray(res.data) ? res.data : (res.data.produtos || []);
            localStorage.setItem('cached_produtos', JSON.stringify(data));
            return data;
        }
        if (!navigator.onLine) {
            try { return JSON.parse(localStorage.getItem('cached_produtos') || '[]'); } catch { return []; }
        }
        return [];
    },

    async carregarPosicoes() {
        const res = await App.apiGet('api/posicoes');
        if (res && res.ok) {
            localStorage.setItem('cached_posicoes', JSON.stringify(res.data));
            return res.data;
        }
        if (!navigator.onLine) {
            try { return JSON.parse(localStorage.getItem('cached_posicoes') || '{"posicoes":[]}'); } catch { return { posicoes: [] }; }
        }
        return { posicoes: [], resumo: {} };
    },

    renderUserHeader(usuario) {
        const initials = (usuario.nome || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        return `
            <div class="user-info">
                <div class="user-avatar">${App.escapeHtml(initials)}</div>
                <div>
                    <div class="user-name">${App.escapeHtml(usuario.nome)}</div>
                    <div class="user-perfil">${App.escapeHtml(usuario.perfil)}</div>
                </div>
            </div>
            <span class="user-badge" onclick="App.logout()" title="Sair da conta">Sair</span>
        `;
    },

    showModal(id) { document.getElementById(id)?.classList.add('open'); },
    hideModal(id) { document.getElementById(id)?.classList.remove('open'); },

    gerarCorUnica(nome, codigo) {
        const texto = (nome || '') + (codigo || '');
        let hash = 0;
        for (let i = 0; i < texto.length; i++) {
            const char = texto.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        hash = Math.abs(hash);

        const goldenAngle = 137.508;
        const hue = ((hash * goldenAngle) % 360 + 360) % 360;
        const s = 65 + (hash % 20);
        const l = 42 + (hash % 16);

        const h = hue / 360;
        const sN = s / 100;
        const lN = l / 100;

        let r, g, b;
        if (sN === 0) {
            r = g = b = lN;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = lN < 0.5 ? lN * (1 + sN) : lN + sN - lN * sN;
            const p = 2 * lN - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        const toHex = (c) => {
            const hex = Math.round(c * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };

        return '#' + toHex(r) + toHex(g) + toHex(b);
    },

    generateCsv(headers, rows, filename) {
        const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    },

    _setupOfflineSync() {
        this._updatePendingBadge();
        if (navigator.onLine) this._syncPending();
    }
};

App.init();
