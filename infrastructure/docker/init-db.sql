-- Akihlee Database Initialization Script
-- Run on container startup to set up database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create audit schema for append-only logs
CREATE SCHEMA IF NOT EXISTS audit;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE akihlee_dev TO akihlee;
GRANT ALL ON SCHEMA public TO akihlee;
GRANT ALL ON SCHEMA audit TO akihlee;

-- Note: Tables will be created by Hibernate/JPA from entity classes
-- This script only sets up database-level configuration
