-- ============================================
-- QIIRAPOINTER — Supabase (PostgreSQL) Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable PostGIS for geo queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================
-- USERS TABLE
-- Mirrors Firebase Auth, extended with app data
-- ============================================
CREATE TABLE users (
  uid            TEXT PRIMARY KEY,  -- Firebase Auth UID
  email          TEXT UNIQUE NOT NULL,
  full_name      TEXT NOT NULL,
  phone_number   TEXT,
  role           TEXT NOT NULL CHECK (role IN ('client', 'vendor', 'admin')),
  is_verified    BOOLEAN DEFAULT false,
  is_suspended   BOOLEAN DEFAULT false,
  suspended_at   TIMESTAMPTZ,
  push_token     TEXT,
  push_token_updated_at TIMESTAMPTZ,
  profile_image  TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- VENDORS TABLE
-- One-to-one with users where role='vendor'
-- ============================================
CREATE TABLE vendors (
  uid                 TEXT PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
  business_name       TEXT,
  category            TEXT,
  description         TEXT,
  address             TEXT,
  services            TEXT,
  location            GEOGRAPHY(POINT, 4326),  -- PostGIS geo point
  business_image      TEXT,
  banner_image        TEXT,
  business_hours      JSONB,
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  is_active           BOOLEAN DEFAULT false,
  documents           TEXT[] DEFAULT '{}',       -- Array of Firebase Storage URLs
  payment_status      TEXT DEFAULT 'unpaid',
  payment_reference   TEXT,
  payment_amount      NUMERIC,
  paid_at             TIMESTAMPTZ,
  average_rating      NUMERIC(3,2) DEFAULT 0,
  total_reviews       INTEGER DEFAULT 0,
  rejection_reason    TEXT,
  verified_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- REVIEWS TABLE
-- ============================================
CREATE TABLE reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  vendor_id   TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FAVORITES TABLE
-- ============================================
CREATE TABLE favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  vendor_id   TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (client_id, vendor_id)  -- Prevent duplicates at DB level
);

-- ============================================
-- CONVERSATIONS TABLE
-- ============================================
CREATE TABLE conversations (
  id              TEXT PRIMARY KEY,  -- Deterministic ID: sorted uid pair e.g. "uid1_uid2"
  client_id       TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  vendor_id       TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  last_message    TEXT,
  last_message_at TIMESTAMPTZ,
  participant_names JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (client_id, vendor_id)
);

-- ============================================
-- MESSAGES TABLE
-- ============================================
CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       TEXT NOT NULL REFERENCES users(uid),
  text            TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_vendors_category ON vendors(category);
CREATE INDEX idx_vendors_status ON vendors(verification_status, is_active);
CREATE INDEX idx_vendors_location ON vendors USING GIST(location);
CREATE INDEX idx_reviews_vendor ON reviews(vendor_id);
CREATE INDEX idx_reviews_client ON reviews(client_id);
CREATE INDEX idx_favorites_client ON favorites(client_id);
CREATE INDEX idx_favorites_vendor ON favorites(vendor_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_conversations_client ON conversations(client_id);
CREATE INDEX idx_conversations_vendor ON conversations(vendor_id);

-- ============================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_vendors_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ENABLE REALTIME for chat tables
-- (Supabase-specific — enables WebSocket subscriptions)
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ============================================
-- POSTGIS GEO SEARCH FUNCTION (RPC)
-- ============================================
CREATE OR REPLACE FUNCTION search_vendors(
  lat double precision,
  lng double precision,
  radius_meters double precision,
  category_filter text DEFAULT NULL,
  search_filter text DEFAULT NULL
)
RETURNS TABLE (
  uid text,
  business_name text,
  category text,
  description text,
  address text,
  services text,
  location geography(Point, 4326),
  business_image text,
  banner_image text,
  business_hours jsonb,
  verification_status text,
  is_active boolean,
  documents text[],
  payment_status text,
  payment_reference text,
  payment_amount numeric,
  paid_at timestamptz,
  average_rating numeric(3,2),
  total_reviews integer,
  rejection_reason text,
  verified_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  distance_meters double precision
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.uid,
    v.business_name,
    v.category,
    v.description,
    v.address,
    v.services,
    v.location,
    v.business_image,
    v.banner_image,
    v.business_hours,
    v.verification_status,
    v.is_active,
    v.documents,
    v.payment_status,
    v.payment_reference,
    v.payment_amount,
    v.paid_at,
    v.average_rating,
    v.total_reviews,
    v.rejection_reason,
    v.verified_at,
    v.created_at,
    v.updated_at,
    ST_Distance(v.location, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) AS distance_meters
  FROM vendors v
  WHERE
    v.verification_status = 'approved'
    AND v.is_active = true
    AND (category_filter IS NULL OR category_filter = '' OR v.category = category_filter)
    AND (
      search_filter IS NULL OR search_filter = ''
      OR v.business_name ILIKE '%' || search_filter || '%'
      OR v.description ILIKE '%' || search_filter || '%'
    )
    AND (
      lat IS NULL OR lng IS NULL OR radius_meters IS NULL
      OR ST_DWithin(v.location, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, radius_meters)
    )
  ORDER BY distance_meters ASC;
END;
$$ LANGUAGE plpgsql;

