CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    usuario VARCHAR(50) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    perfil VARCHAR(20) NOT NULL DEFAULT 'operador' CHECK (perfil IN ('admin','operador','visualizador')),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS produtos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(200) NOT NULL,
    codigo VARCHAR(50) NOT NULL UNIQUE,
    descricao TEXT,
    cor VARCHAR(7) DEFAULT '#667eea',
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posicoes (
    id SERIAL PRIMARY KEY,
    fileira INT NOT NULL,
    altura INT NOT NULL,
    produto_id INT REFERENCES produtos(id) ON DELETE SET NULL,
    quantidade INT NOT NULL DEFAULT 0,
    conferida BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (fileira, altura, produto_id)
);

CREATE TABLE IF NOT EXISTS movimentacoes (
    id SERIAL PRIMARY KEY,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('entrada','saida','transferencia')),
    produto_id INT NOT NULL REFERENCES produtos(id),
    fileira_origem INT NOT NULL,
    altura_origem INT NOT NULL,
    fileira_destino INT,
    altura_destino INT,
    quantidade INT NOT NULL,
    observacao TEXT,
    usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auditoria (
    id SERIAL PRIMARY KEY,
    usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
    acao VARCHAR(50) NOT NULL,
    detalhes TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_usuarios_updated') THEN
        CREATE TRIGGER trg_usuarios_updated BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_produtos_updated') THEN
        CREATE TRIGGER trg_produtos_updated BEFORE UPDATE ON produtos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
END $$;

INSERT INTO usuarios (nome, usuario, senha_hash, perfil)
VALUES ('Administrador', 'admin', '$2a$10$Pw/C9HTIU76Gsv0T1TSdWe8VYunPl3TeI5YdgIBdJ5JpWeHNsNwZe', 'admin')
ON CONFLICT (usuario) DO NOTHING;

INSERT INTO posicoes (fileira, altura, quantidade)
SELECT f, a, 0
FROM generate_series(1, 24) f
CROSS JOIN generate_series(1, 5) a
ON CONFLICT (fileira, altura, produto_id) DO NOTHING;
