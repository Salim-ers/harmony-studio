// Environnement de test : aucune clé réelle, base locale dédiée.
process.env.SESSION_SECRET ||= 'test-secret-test-secret-test-secret-0123456789';
process.env.DATABASE_URL ||= 'postgresql://postgres@localhost:5432/harmony_test';
process.env.DATABASE_DRIVER ||= 'pg';
