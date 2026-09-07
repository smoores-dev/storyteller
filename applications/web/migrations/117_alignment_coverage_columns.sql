ALTER TABLE alignment_report
ADD COLUMN confidence real;

ALTER TABLE alignment_report
ADD COLUMN sentence_coverage real;

ALTER TABLE alignment_report
ADD COLUMN audio_coverage real;
