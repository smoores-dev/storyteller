UPDATE settings SET value = 'true' WHERE name == 'smtp_ssl' AND (value == 1 OR value == '1');
UPDATE settings SET value = 'true' WHERE name == 'smtp_reject_unauthorized' AND (value == 1 OR value == '1');

UPDATE settings SET value = 'false' WHERE name == 'smtp_ssl' AND (value == 0 OR value == '0');
UPDATE settings SET value = 'false' WHERE name == 'smtp_reject_unauthorized' AND (value == 0 OR value == '0');
