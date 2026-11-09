CREATE TABLE IF NOT EXISTS event_log (
  seq             INTEGER PRIMARY KEY AUTOINCREMENT,
  token           TEXT    NOT NULL DEFAULT (lower(hex(randomblob(8)))),
  table_name      TEXT    NOT NULL,
  uuid            TEXT    NOT NULL,
  op              TEXT    NOT NULL,
  user_id         TEXT,
  book_uuid       TEXT,
  created_at      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE user_permission
ADD COLUMN epoch INTEGER NOT NULL DEFAULT 0;


DROP TRIGGER IF EXISTS book_update_trigger;

DROP TRIGGER IF EXISTS book_event_update_trigger;

CREATE TRIGGER book_event_update_trigger
AFTER UPDATE ON book
BEGIN
  UPDATE book
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('book', OLD.uuid, 'u', OLD.uuid);
END;

DROP TRIGGER IF EXISTS ebook_update_trigger;

DROP TRIGGER IF EXISTS ebook_event_insert_trigger;

CREATE TRIGGER ebook_event_insert_trigger
AFTER INSERT ON ebook
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('ebook', NEW.uuid, 'i', NEW.book_uuid);
END;

DROP TRIGGER IF EXISTS ebook_event_update_trigger;

CREATE TRIGGER ebook_event_update_trigger
AFTER UPDATE ON ebook
BEGIN
  UPDATE ebook
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('ebook', OLD.uuid, 'u', OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS ebook_event_delete_trigger;

CREATE TRIGGER ebook_event_delete_trigger
AFTER DELETE ON ebook
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('ebook', OLD.uuid, 'd', OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS audiobook_update_trigger;

DROP TRIGGER IF EXISTS audiobook_event_insert_trigger;

CREATE TRIGGER audiobook_event_insert_trigger
AFTER INSERT ON audiobook
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('audiobook', NEW.uuid, 'i', NEW.book_uuid);
END;

DROP TRIGGER IF EXISTS audiobook_event_update_trigger;

CREATE TRIGGER audiobook_event_update_trigger
AFTER UPDATE ON audiobook
BEGIN
  UPDATE audiobook
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('audiobook', OLD.uuid, 'u', OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS audiobook_event_delete_trigger;

CREATE TRIGGER audiobook_event_delete_trigger
AFTER DELETE ON audiobook
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('audiobook', OLD.uuid, 'd', OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS aligned_book_update_trigger;

DROP TRIGGER IF EXISTS readaloud_event_insert_trigger;

CREATE TRIGGER readaloud_event_insert_trigger
AFTER INSERT ON readaloud
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('readaloud', NEW.uuid, 'i', NEW.book_uuid);
END;

DROP TRIGGER IF EXISTS readaloud_event_update_trigger;

CREATE TRIGGER readaloud_event_update_trigger
AFTER UPDATE ON readaloud
BEGIN
  UPDATE readaloud
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('readaloud', OLD.uuid, 'u', OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS readaloud_event_delete_trigger;

CREATE TRIGGER readaloud_event_delete_trigger
AFTER DELETE ON readaloud
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('readaloud', OLD.uuid, 'd', OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS creator_update_trigger;

DROP TRIGGER IF EXISTS creator_event_insert_trigger;

CREATE TRIGGER creator_event_insert_trigger
AFTER INSERT ON creator
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('creator', NEW.uuid, 'i');
END;

DROP TRIGGER IF EXISTS creator_event_update_trigger;

CREATE TRIGGER creator_event_update_trigger
AFTER UPDATE ON creator
BEGIN
  UPDATE creator
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('creator', OLD.uuid, 'u');
END;

DROP TRIGGER IF EXISTS creator_event_delete_trigger;

CREATE TRIGGER creator_event_delete_trigger
AFTER DELETE ON creator
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('creator', OLD.uuid, 'd');
END;

DROP TRIGGER IF EXISTS tag_update_trigger;

DROP TRIGGER IF EXISTS tag_event_insert_trigger;

CREATE TRIGGER tag_event_insert_trigger
AFTER INSERT ON tag
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('tag', NEW.uuid, 'i');
END;

DROP TRIGGER IF EXISTS tag_event_update_trigger;

CREATE TRIGGER tag_event_update_trigger
AFTER UPDATE ON tag
BEGIN
  UPDATE tag
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('tag', OLD.uuid, 'u');
END;

DROP TRIGGER IF EXISTS tag_event_delete_trigger;

CREATE TRIGGER tag_event_delete_trigger
AFTER DELETE ON tag
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('tag', OLD.uuid, 'd');
END;

DROP TRIGGER IF EXISTS series_update_trigger;

DROP TRIGGER IF EXISTS series_event_insert_trigger;

CREATE TRIGGER series_event_insert_trigger
AFTER INSERT ON series
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('series', NEW.uuid, 'i');
END;

DROP TRIGGER IF EXISTS series_event_update_trigger;

CREATE TRIGGER series_event_update_trigger
AFTER UPDATE ON series
BEGIN
  UPDATE series
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('series', OLD.uuid, 'u');
END;

DROP TRIGGER IF EXISTS series_event_delete_trigger;

CREATE TRIGGER series_event_delete_trigger
AFTER DELETE ON series
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('series', OLD.uuid, 'd');
END;

DROP TRIGGER IF EXISTS identifier_update_trigger;

DROP TRIGGER IF EXISTS identifier_event_insert_trigger;

CREATE TRIGGER identifier_event_insert_trigger
AFTER INSERT ON identifier
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('identifier', NEW.uuid, 'i', NEW.book_uuid);
END;

DROP TRIGGER IF EXISTS identifier_event_update_trigger;

CREATE TRIGGER identifier_event_update_trigger
AFTER UPDATE ON identifier
BEGIN
  UPDATE identifier
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('identifier', OLD.uuid, 'u', OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS identifier_event_delete_trigger;

CREATE TRIGGER identifier_event_delete_trigger
AFTER DELETE ON identifier
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('identifier', OLD.uuid, 'd', OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS identifier_type_update_trigger;

DROP TRIGGER IF EXISTS identifier_type_event_insert_trigger;

CREATE TRIGGER identifier_type_event_insert_trigger
AFTER INSERT ON identifier_type
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('identifier_type', NEW.uuid, 'i');
END;

DROP TRIGGER IF EXISTS identifier_type_event_update_trigger;

CREATE TRIGGER identifier_type_event_update_trigger
AFTER UPDATE ON identifier_type
BEGIN
  UPDATE identifier_type
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('identifier_type', OLD.uuid, 'u');
END;

DROP TRIGGER IF EXISTS identifier_type_event_delete_trigger;

CREATE TRIGGER identifier_type_event_delete_trigger
AFTER DELETE ON identifier_type
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('identifier_type', OLD.uuid, 'd');
END;

DROP TRIGGER IF EXISTS status_update_trigger;

DROP TRIGGER IF EXISTS status_event_insert_trigger;

CREATE TRIGGER status_event_insert_trigger
AFTER INSERT ON status
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('status', NEW.uuid, 'i');
END;

DROP TRIGGER IF EXISTS status_event_update_trigger;

CREATE TRIGGER status_event_update_trigger
AFTER UPDATE ON status
BEGIN
  UPDATE status
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('status', OLD.uuid, 'u');
END;

DROP TRIGGER IF EXISTS status_event_delete_trigger;

CREATE TRIGGER status_event_delete_trigger
AFTER DELETE ON status
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('status', OLD.uuid, 'd');
END;

DROP TRIGGER IF EXISTS collection_update_trigger;

DROP TRIGGER IF EXISTS collection_event_insert_trigger;

CREATE TRIGGER collection_event_insert_trigger
AFTER INSERT ON collection
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('collection', NEW.uuid, 'i');
END;

DROP TRIGGER IF EXISTS collection_event_update_trigger;

CREATE TRIGGER collection_event_update_trigger
AFTER UPDATE ON collection
BEGIN
  UPDATE collection
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('collection', OLD.uuid, 'u');
END;

DROP TRIGGER IF EXISTS collection_event_delete_trigger;

CREATE TRIGGER collection_event_delete_trigger
AFTER DELETE ON collection
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('collection', OLD.uuid, 'd');
END;

DROP TRIGGER IF EXISTS collection_unpublish_event_trigger;

CREATE TRIGGER collection_unpublish_event_trigger
AFTER UPDATE OF public ON collection
WHEN OLD.public = 1 AND NEW.public = 0
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  -- Sentinel table name to indicate that a collection's
  -- public-ness has changed
  VALUES ('collection_access', NEW.uuid, 'd');
END;

DROP TRIGGER IF EXISTS collection_to_user_update_trigger;

DROP TRIGGER IF EXISTS collection_to_user_event_insert_trigger;

CREATE TRIGGER collection_to_user_event_insert_trigger
AFTER INSERT ON collection_to_user
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id)
  VALUES ('collection_to_user', NEW.uuid, 'i', NEW.user_id);
END;

DROP TRIGGER IF EXISTS collection_to_user_event_update_trigger;

CREATE TRIGGER collection_to_user_event_update_trigger
AFTER UPDATE ON collection_to_user
BEGIN
  UPDATE collection_to_user
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op, user_id)
  VALUES ('collection_to_user', OLD.uuid, 'u', OLD.user_id);
END;

DROP TRIGGER IF EXISTS collection_to_user_event_delete_trigger;

CREATE TRIGGER collection_to_user_event_delete_trigger
AFTER DELETE ON collection_to_user
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id)
  VALUES ('collection_to_user', OLD.uuid, 'd', OLD.user_id);
END;

DROP TRIGGER IF EXISTS shelf_update_trigger;

DROP TRIGGER IF EXISTS shelf_event_insert_trigger;

CREATE TRIGGER shelf_event_insert_trigger
AFTER INSERT ON shelf
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id)
  VALUES ('shelf', NEW.uuid, 'i', NEW.user_id);
END;

DROP TRIGGER IF EXISTS shelf_event_update_trigger;

CREATE TRIGGER shelf_event_update_trigger
AFTER UPDATE ON shelf
BEGIN
  UPDATE shelf
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op, user_id)
  VALUES ('shelf', OLD.uuid, 'u', OLD.user_id);
END;

DROP TRIGGER IF EXISTS shelf_event_delete_trigger;

CREATE TRIGGER shelf_event_delete_trigger
AFTER DELETE ON shelf
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id)
  VALUES ('shelf', OLD.uuid, 'd', OLD.user_id);
END;

DROP TRIGGER IF EXISTS home_section_update_trigger;

DROP TRIGGER IF EXISTS home_section_event_insert_trigger;

CREATE TRIGGER home_section_event_insert_trigger
AFTER INSERT ON home_section
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id)
  VALUES ('home_section', NEW.uuid, 'i', NEW.user_id);
END;

DROP TRIGGER IF EXISTS home_section_event_update_trigger;

CREATE TRIGGER home_section_event_update_trigger
AFTER UPDATE ON home_section
BEGIN
  UPDATE home_section
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op, user_id)
  VALUES ('home_section', OLD.uuid, 'u', OLD.user_id);
END;

DROP TRIGGER IF EXISTS home_section_event_delete_trigger;

CREATE TRIGGER home_section_event_delete_trigger
AFTER DELETE ON home_section
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id)
  VALUES ('home_section', OLD.uuid, 'd', OLD.user_id);
END;

DROP TRIGGER IF EXISTS sidebar_group_update_trigger;

DROP TRIGGER IF EXISTS sidebar_group_event_insert_trigger;

CREATE TRIGGER sidebar_group_event_insert_trigger
AFTER INSERT ON sidebar_group
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id)
  VALUES ('sidebar_group', NEW.uuid, 'i', NEW.user_id);
END;

DROP TRIGGER IF EXISTS sidebar_group_event_update_trigger;

CREATE TRIGGER sidebar_group_event_update_trigger
AFTER UPDATE ON sidebar_group
BEGIN
  UPDATE sidebar_group
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op, user_id)
  VALUES ('sidebar_group', OLD.uuid, 'u', OLD.user_id);
END;

DROP TRIGGER IF EXISTS sidebar_group_event_delete_trigger;

CREATE TRIGGER sidebar_group_event_delete_trigger
AFTER DELETE ON sidebar_group
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id)
  VALUES ('sidebar_group', OLD.uuid, 'd', OLD.user_id);
END;

DROP TRIGGER IF EXISTS sidebar_item_update_trigger;

DROP TRIGGER IF EXISTS sidebar_item_event_insert_trigger;

CREATE TRIGGER sidebar_item_event_insert_trigger
AFTER INSERT ON sidebar_item
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id)
  VALUES ('sidebar_item', NEW.uuid, 'i', NEW.user_id);
END;

DROP TRIGGER IF EXISTS sidebar_item_event_update_trigger;

CREATE TRIGGER sidebar_item_event_update_trigger
AFTER UPDATE ON sidebar_item
BEGIN
  UPDATE sidebar_item
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op, user_id)
  VALUES ('sidebar_item', OLD.uuid, 'u', OLD.user_id);
END;

DROP TRIGGER IF EXISTS sidebar_item_event_delete_trigger;

CREATE TRIGGER sidebar_item_event_delete_trigger
AFTER DELETE ON sidebar_item
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id)
  VALUES ('sidebar_item', OLD.uuid, 'd', OLD.user_id);
END;

DROP TRIGGER IF EXISTS progression_update_trigger;

DROP TRIGGER IF EXISTS progression_event_insert_trigger;

CREATE TRIGGER progression_event_insert_trigger
AFTER INSERT ON progression
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id, book_uuid)
  VALUES ('progression', NEW.uuid, 'i', NEW.user_id, NEW.book_uuid);
END;

DROP TRIGGER IF EXISTS progression_event_update_trigger;

CREATE TRIGGER progression_event_update_trigger
AFTER UPDATE ON progression
BEGIN
  UPDATE progression
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op, user_id, book_uuid)
  VALUES ('progression', OLD.uuid, 'u', OLD.user_id, OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS progression_event_delete_trigger;

CREATE TRIGGER progression_event_delete_trigger
AFTER DELETE ON progression
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id, book_uuid)
  VALUES ('progression', OLD.uuid, 'd', OLD.user_id, OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS user_book_rating_update_trigger;

DROP TRIGGER IF EXISTS user_book_rating_event_insert_trigger;

CREATE TRIGGER user_book_rating_event_insert_trigger
AFTER INSERT ON user_book_rating
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id, book_uuid)
  VALUES ('user_book_rating', NEW.uuid, 'i', NEW.user_id, NEW.book_uuid);
END;

DROP TRIGGER IF EXISTS user_book_rating_event_update_trigger;

CREATE TRIGGER user_book_rating_event_update_trigger
AFTER UPDATE ON user_book_rating
BEGIN
  UPDATE user_book_rating
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op, user_id, book_uuid)
  VALUES ('user_book_rating', OLD.uuid, 'u', OLD.user_id, OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS user_book_rating_event_delete_trigger;

CREATE TRIGGER user_book_rating_event_delete_trigger
AFTER DELETE ON user_book_rating
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id, book_uuid)
  VALUES ('user_book_rating', OLD.uuid, 'd', OLD.user_id, OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS user_settings_update_trigger;

DROP TRIGGER IF EXISTS user_settings_event_insert_trigger;

CREATE TRIGGER user_settings_event_insert_trigger
AFTER INSERT ON user_settings
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id)
  VALUES ('user_settings', NEW.uuid, 'i', NEW.user_id);
END;

DROP TRIGGER IF EXISTS user_settings_event_update_trigger;

CREATE TRIGGER user_settings_event_update_trigger
AFTER UPDATE ON user_settings
BEGIN
  UPDATE user_settings
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op, user_id)
  VALUES ('user_settings', OLD.uuid, 'u', OLD.user_id);
END;

DROP TRIGGER IF EXISTS user_settings_event_delete_trigger;

CREATE TRIGGER user_settings_event_delete_trigger
AFTER DELETE ON user_settings
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id)
  VALUES ('user_settings', OLD.uuid, 'd', OLD.user_id);
END;

DROP TRIGGER IF EXISTS external_data_update_trigger;

DROP TRIGGER IF EXISTS external_data_event_insert_trigger;

CREATE TRIGGER external_data_event_insert_trigger
AFTER INSERT ON external_data
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES (
    'external_data',
    NEW.uuid,
    'i',
    (SELECT book_uuid FROM identifier WHERE uuid = NEW.identifier_uuid)
  );
END;

DROP TRIGGER IF EXISTS external_data_event_update_trigger;

CREATE TRIGGER external_data_event_update_trigger
AFTER UPDATE ON external_data
BEGIN
  UPDATE external_data
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES (
    'external_data',
    OLD.uuid,
    'u',
    (SELECT book_uuid FROM identifier WHERE uuid = OLD.identifier_uuid)
  );
END;

DROP TRIGGER IF EXISTS external_data_event_delete_trigger;

CREATE TRIGGER external_data_event_delete_trigger
AFTER DELETE ON external_data
-- Skipped when the parent is already gone (FK cascade): the owner can't be
-- resolved, and clients delete children along with the parent.
WHEN EXISTS (SELECT 1 FROM identifier WHERE uuid = OLD.identifier_uuid)
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES (
    'external_data',
    OLD.uuid,
    'd',
    (SELECT book_uuid FROM identifier WHERE uuid = OLD.identifier_uuid)
  );
END;

DROP TRIGGER IF EXISTS image_update_trigger;

DROP TRIGGER IF EXISTS image_event_insert_trigger;

CREATE TRIGGER image_event_insert_trigger
AFTER INSERT ON image
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('image', NEW.uuid, 'i');
END;

DROP TRIGGER IF EXISTS image_event_update_trigger;

CREATE TRIGGER image_event_update_trigger
AFTER UPDATE ON image
BEGIN
  UPDATE image
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('image', OLD.uuid, 'u');
END;

DROP TRIGGER IF EXISTS image_event_delete_trigger;

CREATE TRIGGER image_event_delete_trigger
AFTER DELETE ON image
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('image', OLD.uuid, 'd');
END;

DROP TRIGGER IF EXISTS external_source_update_trigger;

DROP TRIGGER IF EXISTS external_source_event_insert_trigger;

CREATE TRIGGER external_source_event_insert_trigger
AFTER INSERT ON external_source
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('external_source', NEW.uuid, 'i');
END;

DROP TRIGGER IF EXISTS external_source_event_update_trigger;

CREATE TRIGGER external_source_event_update_trigger
AFTER UPDATE ON external_source
BEGIN
  UPDATE external_source
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('external_source', OLD.uuid, 'u');
END;

DROP TRIGGER IF EXISTS external_source_event_delete_trigger;

CREATE TRIGGER external_source_event_delete_trigger
AFTER DELETE ON external_source
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('external_source', OLD.uuid, 'd');
END;

DROP TRIGGER IF EXISTS book_to_creator_update_trigger;

DROP TRIGGER IF EXISTS book_to_creator_event_insert_trigger;

CREATE TRIGGER book_to_creator_event_insert_trigger
AFTER INSERT ON book_to_creator
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('book_to_creator', NEW.uuid, 'i', NEW.book_uuid);
END;

DROP TRIGGER IF EXISTS book_to_creator_event_update_trigger;

CREATE TRIGGER book_to_creator_event_update_trigger
AFTER UPDATE ON book_to_creator
BEGIN
  UPDATE book_to_creator
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('book_to_creator', OLD.uuid, 'u', OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS book_to_creator_event_delete_trigger;

CREATE TRIGGER book_to_creator_event_delete_trigger
AFTER DELETE ON book_to_creator
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('book_to_creator', OLD.uuid, 'd', OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS book_to_tag_update_trigger;

DROP TRIGGER IF EXISTS book_to_tag_event_insert_trigger;

CREATE TRIGGER book_to_tag_event_insert_trigger
AFTER INSERT ON book_to_tag
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('book_to_tag', NEW.uuid, 'i', NEW.book_uuid);
END;

DROP TRIGGER IF EXISTS book_to_tag_event_update_trigger;

CREATE TRIGGER book_to_tag_event_update_trigger
AFTER UPDATE ON book_to_tag
BEGIN
  UPDATE book_to_tag
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('book_to_tag', OLD.uuid, 'u', OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS book_to_tag_event_delete_trigger;

CREATE TRIGGER book_to_tag_event_delete_trigger
AFTER DELETE ON book_to_tag
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('book_to_tag', OLD.uuid, 'd', OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS book_to_series_update_trigger;

DROP TRIGGER IF EXISTS book_to_series_event_insert_trigger;

CREATE TRIGGER book_to_series_event_insert_trigger
AFTER INSERT ON book_to_series
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('book_to_series', NEW.uuid, 'i', NEW.book_uuid);
END;

DROP TRIGGER IF EXISTS book_to_series_event_update_trigger;

CREATE TRIGGER book_to_series_event_update_trigger
AFTER UPDATE ON book_to_series
BEGIN
  UPDATE book_to_series
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('book_to_series', OLD.uuid, 'u', OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS book_to_series_event_delete_trigger;

CREATE TRIGGER book_to_series_event_delete_trigger
AFTER DELETE ON book_to_series
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('book_to_series', OLD.uuid, 'd', OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS book_to_collection_update_trigger;

DROP TRIGGER IF EXISTS book_to_collection_event_insert_trigger;

CREATE TRIGGER book_to_collection_event_insert_trigger
AFTER INSERT ON book_to_collection
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('book_to_collection', NEW.uuid, 'i', NEW.book_uuid);
END;

DROP TRIGGER IF EXISTS book_to_collection_event_update_trigger;

CREATE TRIGGER book_to_collection_event_update_trigger
AFTER UPDATE ON book_to_collection
BEGIN
  UPDATE book_to_collection
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('book_to_collection', OLD.uuid, 'u', OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS book_to_collection_event_delete_trigger;

CREATE TRIGGER book_to_collection_event_delete_trigger
AFTER DELETE ON book_to_collection
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('book_to_collection', OLD.uuid, 'd', OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS book_to_status_update_trigger;

DROP TRIGGER IF EXISTS book_to_status_event_insert_trigger;

CREATE TRIGGER book_to_status_event_insert_trigger
AFTER INSERT ON book_to_status
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id, book_uuid)
  VALUES ('book_to_status', NEW.uuid, 'i', NEW.user_id, NEW.book_uuid);
END;

DROP TRIGGER IF EXISTS book_to_status_event_update_trigger;

CREATE TRIGGER book_to_status_event_update_trigger
AFTER UPDATE ON book_to_status
BEGIN
  UPDATE book_to_status
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op, user_id, book_uuid)
  VALUES ('book_to_status', OLD.uuid, 'u', OLD.user_id, OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS book_to_status_event_delete_trigger;

CREATE TRIGGER book_to_status_event_delete_trigger
AFTER DELETE ON book_to_status
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id, book_uuid)
  VALUES ('book_to_status', OLD.uuid, 'd', OLD.user_id, OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS shelf_book_update_trigger;

DROP TRIGGER IF EXISTS shelf_book_event_insert_trigger;

CREATE TRIGGER shelf_book_event_insert_trigger
AFTER INSERT ON shelf_book
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id, book_uuid)
  VALUES (
    'shelf_book',
    NEW.uuid,
    'i',
    (SELECT user_id FROM shelf WHERE uuid = NEW.shelf_uuid),
    NEW.book_uuid
  );
END;

DROP TRIGGER IF EXISTS shelf_book_event_update_trigger;

CREATE TRIGGER shelf_book_event_update_trigger
AFTER UPDATE ON shelf_book
BEGIN
  UPDATE shelf_book
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op, user_id, book_uuid)
  VALUES (
    'shelf_book',
    OLD.uuid,
    'u',
    (SELECT user_id FROM shelf WHERE uuid = OLD.shelf_uuid),
    OLD.book_uuid
  );
END;

DROP TRIGGER IF EXISTS shelf_book_event_delete_trigger;

CREATE TRIGGER shelf_book_event_delete_trigger
AFTER DELETE ON shelf_book
-- Skipped when the parent is already gone (FK cascade): the owner can't be
-- resolved, and clients delete children along with the parent.
WHEN EXISTS (SELECT 1 FROM shelf WHERE uuid = OLD.shelf_uuid)
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id, book_uuid)
  VALUES (
    'shelf_book',
    OLD.uuid,
    'd',
    (SELECT user_id FROM shelf WHERE uuid = OLD.shelf_uuid),
    OLD.book_uuid
  );
END;

DROP TRIGGER IF EXISTS shelf_filter_reference_update_trigger;

DROP TRIGGER IF EXISTS shelf_filter_reference_event_insert_trigger;

CREATE TRIGGER shelf_filter_reference_event_insert_trigger
AFTER INSERT ON shelf_filter_reference
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id)
  VALUES (
    'shelf_filter_reference',
    NEW.uuid,
    'i',
    (SELECT user_id FROM shelf WHERE uuid = NEW.shelf_uuid)
  );
END;

DROP TRIGGER IF EXISTS shelf_filter_reference_event_update_trigger;

CREATE TRIGGER shelf_filter_reference_event_update_trigger
AFTER UPDATE ON shelf_filter_reference
BEGIN
  UPDATE shelf_filter_reference
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op, user_id)
  VALUES (
    'shelf_filter_reference',
    OLD.uuid,
    'u',
    (SELECT user_id FROM shelf WHERE uuid = OLD.shelf_uuid)
  );
END;

DROP TRIGGER IF EXISTS shelf_filter_reference_event_delete_trigger;

CREATE TRIGGER shelf_filter_reference_event_delete_trigger
AFTER DELETE ON shelf_filter_reference
-- Skipped when the parent is already gone (FK cascade): the owner can't be
-- resolved, and clients delete children along with the parent.
WHEN EXISTS (SELECT 1 FROM shelf WHERE uuid = OLD.shelf_uuid)
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id)
  VALUES (
    'shelf_filter_reference',
    OLD.uuid,
    'd',
    (SELECT user_id FROM shelf WHERE uuid = OLD.shelf_uuid)
  );
END;

DROP TRIGGER IF EXISTS book_access_event_insert_trigger;

CREATE TRIGGER book_access_event_insert_trigger
AFTER INSERT ON book_access
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id, book_uuid)
  VALUES ('book_access', NEW.book_uuid, 'i', NEW.user_id, NEW.book_uuid);
END;

DROP TRIGGER IF EXISTS book_access_event_delete_trigger;

CREATE TRIGGER book_access_event_delete_trigger
AFTER DELETE ON book_access
BEGIN
  INSERT INTO event_log (table_name, uuid, op, user_id, book_uuid)
  VALUES ('book_access', OLD.book_uuid, 'd', OLD.user_id, OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS changelog_update_trigger;

DROP TRIGGER IF EXISTS changelog_event_insert_trigger;

CREATE TRIGGER changelog_event_insert_trigger
AFTER INSERT ON changelog
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('changelog', NEW.uuid, 'i');
END;

DROP TRIGGER IF EXISTS changelog_event_update_trigger;

CREATE TRIGGER changelog_event_update_trigger
AFTER UPDATE ON changelog
BEGIN
  UPDATE changelog
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('changelog', OLD.uuid, 'u');
END;

DROP TRIGGER IF EXISTS changelog_event_delete_trigger;

CREATE TRIGGER changelog_event_delete_trigger
AFTER DELETE ON changelog
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('changelog', OLD.uuid, 'd');
END;

DROP TRIGGER IF EXISTS job_update_trigger;

DROP TRIGGER IF EXISTS job_event_insert_trigger;

CREATE TRIGGER job_event_insert_trigger
AFTER INSERT ON job
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('job', NEW.uuid, 'i', NEW.book_uuid);
END;

DROP TRIGGER IF EXISTS job_event_update_trigger;

CREATE TRIGGER job_event_update_trigger
AFTER UPDATE ON job
BEGIN
  UPDATE job
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('job', OLD.uuid, 'u', OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS job_event_delete_trigger;

CREATE TRIGGER job_event_delete_trigger
AFTER DELETE ON job
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('job', OLD.uuid, 'd', OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS alignment_report_event_insert_trigger;

CREATE TRIGGER alignment_report_event_insert_trigger
AFTER INSERT ON alignment_report
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('alignment_report', NEW.uuid, 'i', NEW.book_uuid);
END;

DROP TRIGGER IF EXISTS alignment_report_event_update_trigger;

CREATE TRIGGER alignment_report_event_update_trigger
AFTER UPDATE ON alignment_report
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('alignment_report', OLD.uuid, 'u', OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS alignment_report_event_delete_trigger;

CREATE TRIGGER alignment_report_event_delete_trigger
AFTER DELETE ON alignment_report
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('alignment_report', OLD.uuid, 'd', OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS alignment_decision_event_insert_trigger;

CREATE TRIGGER alignment_decision_event_insert_trigger
AFTER INSERT ON alignment_decision
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('alignment_decision', NEW.uuid, 'i', NEW.book_uuid);
END;

DROP TRIGGER IF EXISTS alignment_decision_event_update_trigger;

CREATE TRIGGER alignment_decision_event_update_trigger
AFTER UPDATE ON alignment_decision
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('alignment_decision', OLD.uuid, 'u', OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS alignment_decision_event_delete_trigger;

CREATE TRIGGER alignment_decision_event_delete_trigger
AFTER DELETE ON alignment_decision
BEGIN
  INSERT INTO event_log (table_name, uuid, op, book_uuid)
  VALUES ('alignment_decision', OLD.uuid, 'd', OLD.book_uuid);
END;

DROP TRIGGER IF EXISTS settings_update_trigger;

DROP TRIGGER IF EXISTS settings_event_insert_trigger;

CREATE TRIGGER settings_event_insert_trigger
AFTER INSERT ON settings
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('settings', NEW.uuid, 'i');
END;

DROP TRIGGER IF EXISTS settings_event_update_trigger;

CREATE TRIGGER settings_event_update_trigger
AFTER UPDATE ON settings
BEGIN
  UPDATE settings
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('settings', OLD.uuid, 'u');
END;

DROP TRIGGER IF EXISTS settings_event_delete_trigger;

CREATE TRIGGER settings_event_delete_trigger
AFTER DELETE ON settings
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('settings', OLD.uuid, 'd');
END;

DROP TRIGGER IF EXISTS user_update_trigger;

DROP TRIGGER IF EXISTS user_event_insert_trigger;

CREATE TRIGGER user_event_insert_trigger
AFTER INSERT ON user
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('user', NEW.id, 'i');
END;

DROP TRIGGER IF EXISTS user_event_update_trigger;

CREATE TRIGGER user_event_update_trigger
AFTER UPDATE ON user
BEGIN
  UPDATE user
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = OLD.id;

  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('user', OLD.id, 'u');
END;

DROP TRIGGER IF EXISTS user_event_delete_trigger;

CREATE TRIGGER user_event_delete_trigger
AFTER DELETE ON user
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('user', OLD.id, 'd');
END;

DROP TRIGGER IF EXISTS user_permission_update_trigger;

DROP TRIGGER IF EXISTS user_permission_event_insert_trigger;

CREATE TRIGGER user_permission_event_insert_trigger
AFTER INSERT ON user_permission
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('user_permission', NEW.uuid, 'i');
END;

DROP TRIGGER IF EXISTS user_permission_event_update_trigger;

CREATE TRIGGER user_permission_event_update_trigger
AFTER UPDATE ON user_permission
BEGIN
  UPDATE user_permission
  SET updated_at = CURRENT_TIMESTAMP,
    epoch = epoch + 1
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('user_permission', OLD.uuid, 'u');
END;

DROP TRIGGER IF EXISTS user_permission_event_delete_trigger;

CREATE TRIGGER user_permission_event_delete_trigger
AFTER DELETE ON user_permission
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('user_permission', OLD.uuid, 'd');
END;

DROP TRIGGER IF EXISTS import_rule_update_trigger;

DROP TRIGGER IF EXISTS import_rule_event_insert_trigger;

CREATE TRIGGER import_rule_event_insert_trigger
AFTER INSERT ON import_rule
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('import_rule', NEW.uuid, 'i');
END;

DROP TRIGGER IF EXISTS import_rule_event_update_trigger;

CREATE TRIGGER import_rule_event_update_trigger
AFTER UPDATE ON import_rule
BEGIN
  UPDATE import_rule
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.uuid;

  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('import_rule', OLD.uuid, 'u');
END;

DROP TRIGGER IF EXISTS import_rule_event_delete_trigger;

CREATE TRIGGER import_rule_event_delete_trigger
AFTER DELETE ON import_rule
BEGIN
  INSERT INTO event_log (table_name, uuid, op)
  VALUES ('import_rule', OLD.uuid, 'd');
END;

DROP TRIGGER IF EXISTS import_rule_membership_insert_trigger;

CREATE TRIGGER import_rule_membership_insert_trigger
AFTER INSERT ON import_rule_to_collection
BEGIN
  UPDATE import_rule
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = NEW.import_rule_uuid;
END;

DROP TRIGGER IF EXISTS import_rule_membership_delete_trigger;

CREATE TRIGGER import_rule_membership_delete_trigger
AFTER DELETE ON import_rule_to_collection
BEGIN
  UPDATE import_rule
  SET updated_at = CURRENT_TIMESTAMP
  WHERE uuid = OLD.import_rule_uuid;
END;
