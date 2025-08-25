CREATE INDEX idx_book_to_creator_book_role ON book_to_creator (book_uuid, role);

CREATE INDEX idx_book_to_series_book ON book_to_series (book_uuid);

CREATE INDEX idx_book_to_tag_book ON book_to_tag (book_uuid);

CREATE INDEX idx_book_to_status_book_user ON book_to_status (book_uuid, user_id);

CREATE INDEX idx_processing_task_book_updated ON processing_task (book_uuid, updated_at DESC);

CREATE INDEX idx_ebook_book ON ebook (book_uuid);

CREATE INDEX idx_audiobook_book ON audiobook (book_uuid);

CREATE INDEX idx_readaloud_book ON readaloud (book_uuid);
