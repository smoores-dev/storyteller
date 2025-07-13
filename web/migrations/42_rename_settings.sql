UPDATE settings
SET
  name = 'smtpHost'
WHERE
  name = 'smtp_host';

UPDATE settings
SET
  name = 'smtpPort'
WHERE
  name = 'smtp_port';

UPDATE settings
SET
  name = 'smtpUsername'
WHERE
  name = 'smtp_username';

UPDATE settings
SET
  name = 'smtpPassword'
WHERE
  name = 'smtp_password';

UPDATE settings
SET
  name = 'smtpFrom'
WHERE
  name = 'smtp_from';

UPDATE settings
SET
  name = 'libraryName'
WHERE
  name = 'library_name';

UPDATE settings
SET
  name = 'webUrl'
WHERE
  name = 'web_url';

UPDATE settings
SET
  name = 'smtpSsl'
WHERE
  name = 'smtp_ssl';

UPDATE settings
SET
  name = 'smtpRejectUnauthorized'
WHERE
  name = 'smtp_reject_unauthorized';

UPDATE settings
SET
  name = 'codec'
WHERE
  name = 'codec';

UPDATE settings
SET
  name = 'bitrate'
WHERE
  name = 'bitrate';

UPDATE settings
SET
  name = 'transcriptionEngine'
WHERE
  name = 'transcription_engine';

UPDATE settings
SET
  name = 'whisperBuild'
WHERE
  name = 'whisper_build';

UPDATE settings
SET
  name = 'whisperModel'
WHERE
  name = 'whisper_model';

UPDATE settings
SET
  name = 'googleCloudApiKey'
WHERE
  name = 'google_cloud_api_key';

UPDATE settings
SET
  name = 'azureSubscriptionKey'
WHERE
  name = 'azure_subscription_key';

UPDATE settings
SET
  name = 'azureServiceRegion'
WHERE
  name = 'azure_service_region';

UPDATE settings
SET
  name = 'amazonTranscribeRegion'
WHERE
  name = 'amazon_transcribe_region';

UPDATE settings
SET
  name = 'amazonTranscribeAccessKeyId'
WHERE
  name = 'amazon_transcribe_access_key_id';

UPDATE settings
SET
  name = 'amazonTranscribeSecretAccessKey'
WHERE
  name = 'amazon_transcribe_secret_access_key';

UPDATE settings
SET
  name = 'openAiApiKey'
WHERE
  name = 'open_ai_api_key';

UPDATE settings
SET
  name = 'openAiOrganization'
WHERE
  name = 'open_ai_organization';

UPDATE settings
SET
  name = 'openAiBaseUrl'
WHERE
  name = 'open_ai_base_url';

UPDATE settings
SET
  name = 'openAiModelName'
WHERE
  name = 'open_ai_model_name';

UPDATE settings
SET
  name = 'maxTrackLength'
WHERE
  name = 'max_track_length';

UPDATE settings
SET
  name = 'deepgramApiKey'
WHERE
  name = 'deepgram_api_key';

UPDATE settings
SET
  name = 'deepgramModel'
WHERE
  name = 'deepgram_model';

UPDATE settings
SET
  name = 'parallelTranscodes'
WHERE
  name = 'parallel_transcodes';

UPDATE settings
SET
  name = 'parallelTranscribes'
WHERE
  name = 'parallel_transcribes';

UPDATE settings
SET
  name = 'parallelWhisperBuild'
WHERE
  name = 'parallel_whisper_build';

UPDATE settings
SET
  name = 'authProviders'
WHERE
  name = 'auth_providers';

UPDATE settings
SET
  name = 'importPath'
WHERE
  name = 'import_path';
