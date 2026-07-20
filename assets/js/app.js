const App = {
    _token: null,

    init() {
        this._token = localStorage.getItem('token');
    },

    _authHeaders(extra = {}) {
        const h = { ...extra };
        if (this._token) h['Authorization'] = 'Bearer ' + this._token;
        return h;
    },

    async checkAuth() {
        try {
            const res = await fetch('api/check', {
                credentials: 'same-origin',
                headers: this._authHeaders()
            });
            const data = await res.json();
            if (!data.autenticado) { window.location.href = 'login.html'; return null; }
            return data.usuario;
        } catch (e) { window.location.href = 'login.html'; return null; }
    },

    async logout() {
        await fetch('api/logout', {
            method: 'POST',
            credentials: 'same-origin',
            headers: this._authHeaders()
        });
        localStorage.removeItem('token');
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
            App.toast('Erro de conexao com o servidor', 'error');
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
        if (res && res.ok) return res.data;
        return [];
    },

    async carregarPosicoes() {
        const res = await App.apiGet('api/posicoes');
        if (res && res.ok) return res.data;
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
    }
};

App.init();
