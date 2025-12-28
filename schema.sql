-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    discord_id VARCHAR(255) UNIQUE NOT NULL,
    discord_username VARCHAR(255) NOT NULL,
    discord_avatar VARCHAR(255),
    discord_email VARCHAR(255),
    join_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_banned BOOLEAN DEFAULT FALSE,
    ban_reason TEXT,
    total_keys_generated INTEGER DEFAULT 0,
    is_admin BOOLEAN DEFAULT FALSE,
    is_whitelisted BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Keys Table
CREATE TABLE IF NOT EXISTS keys (
    id SERIAL PRIMARY KEY,
    key_string VARCHAR(255) UNIQUE NOT NULL,
    discord_id VARCHAR(255) REFERENCES users(discord_id),
    hwid VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    last_validated TIMESTAMP,
    validation_count INTEGER DEFAULT 0,
    ip_address VARCHAR(45),
    user_agent TEXT,
    script_name VARCHAR(255) DEFAULT 'default'
);

-- Pending Keys Table (for Linkvertise flow)
CREATE TABLE IF NOT EXISTS pending_keys (
    id SERIAL PRIMARY KEY,
    request_id VARCHAR(255) UNIQUE NOT NULL,
    discord_id VARCHAR(255) REFERENCES users(discord_id),
    hwid VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    linkvertise_token VARCHAR(255),
    ip_address VARCHAR(45)
);

-- Integration Settings Table
CREATE TABLE IF NOT EXISTS integration_settings (
    id SERIAL PRIMARY KEY,
    integration_type VARCHAR(50) NOT NULL,
    publisher_id VARCHAR(255),
    anti_bypass_token VARCHAR(255),
    api_key VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    webhook_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- HWID Bindings Table
CREATE TABLE IF NOT EXISTS hwid_bindings (
    id SERIAL PRIMARY KEY,
    discord_id VARCHAR(255) REFERENCES users(discord_id),
    hwid VARCHAR(255) NOT NULL,
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_banned BOOLEAN DEFAULT FALSE,
    UNIQUE(discord_id, hwid)
);

-- Analytics Table
CREATE TABLE IF NOT EXISTS analytics (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    discord_id VARCHAR(255),
    hwid VARCHAR(255),
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    discord_id VARCHAR(255) REFERENCES users(discord_id),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_keys_discord_id ON keys(discord_id);
CREATE INDEX idx_keys_hwid ON keys(hwid);
CREATE INDEX idx_keys_expires_at ON keys(expires_at);
CREATE INDEX idx_pending_keys_request_id ON pending_keys(request_id);
CREATE INDEX idx_analytics_created_at ON analytics(created_at);
CREATE INDEX idx_sessions_token ON sessions(session_token);

-- Insert default integration settings
INSERT INTO integration_settings (integration_type, is_active) 
VALUES ('linkvertise', true), ('lootlabs', false)
ON CONFLICT DO NOTHING;
