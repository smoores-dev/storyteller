-- per-book multidimensional ("JoJo") rating scores, stored as a json object
-- keyed by dimension id (see src/database/ratingDimensions.ts). nullable: a book
-- with only a plain star rating has no dimensions. the computed average is
-- written to the existing rating column, so display elsewhere is unchanged.
ALTER TABLE user_book_rating
ADD COLUMN dimensions TEXT;
