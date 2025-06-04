INSERT INTO
  account (user_id, type, provider, provider_account_id)
SELECT
  id,
  'credentials',
  'credentials',
  id
FROM
  user
WHERE
  user.invite_accepted is null;
