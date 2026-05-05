UPDATE migration
SET
  name = '69_insert_disable_password_login_setting.sql'
WHERE
  name = '62_insert_disable_password_login_setting.sql';

DELETE FROM migration
WHERE
  name = '63_create_imported_path_table.sql';

UPDATE migration
SET
  name = '71_insert_auto_import_mode_setting.sql'
WHERE
  name = '64_insert_auto_import_mode_setting.sql';
