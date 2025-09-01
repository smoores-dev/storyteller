---
sidebar_position: 3
---

# Administering Storyteller

Congrats, you're now a server admin! Luckily, the Storyteller backend is pretty
straightforward to administer, but there are a few things worth keeping in mind.

## Setting up the admin user

When you first run the Storyteller backend, the web interface will prompt you to
create an admin user. This user will be saved in the database and given all
permissions in the system. After creating the admin user, you will be prompted
to sign in with your new username (or email address) and password.

## Inviting users

You may wish to invite additional users, such as family members, to your server.
Rather than sharing a username and password, you should set up separate accounts
for each user. Setting up separate accounts will allow you to grant specific
permissions to each user. Most likely, you'll want most users to have the "Basic
User" capabilities, which allows them to see the list of books on the server and
download individual books. You can also invite additional administrators, or
give users fine-grained permissions (for example, you may choose to give a user
the capability to add and align new books, but not to invite new users).

In the future, Storyteller will support "Collections" of books, so that
administrators can more selectively share their library with users.

### Manually sharing invite links

The easiest way to invite users is to simply copy the invite link that
Storyteller provides for you and share it with your intended user.

### Setting up email

If you'd like, you can connect Storyteller to an SMTP server. This will allow
Storyteller to send emails on your behalf, so that your users can receive unique
invitation links to set up their accounts.

The SMTP configuration lives on the "Settings" page of the web interface. You'll
need to provide the host, port, credentials, and "From" address, as well as the
library name (whatever you want to call it!) and web URL (the URL that your web
interface is accessible at) in order for Storyteller to send user invite emails.

If your email provider supports SMTP, you can simply follow their instructions
for configuring email in Storyteller. Otherwise, you can use a free SMTP relay
service, such as Sendgrid.

### Reseting a Password

If you need to reset a password for any user (including admins) you can do so by
running a script on the docker service supplying either the username or email of
the user you wish to reset. This can be done with:

```sh
# With a username
$ docker exec -it <container-name-or-id> scripts/reset-password.sh --username <username>

# With an email
$ docker exec -it <container-name-or-id> scripts/reset-password.sh --email <email>
```

## OAuth/OIDC configuration

If you don’t have any idea what OAuth or OIDC are, you can probably skip this
section!

### Setting the `AUTH_URL` environment variable

In order to use OAuth, you _must_ set the `AUTH_URL` environment variable in
your container. It should be set to your Storyteller server’s origin (scheme +
hostname), with the path `/api/v2/auth`. So if you access your Storyteller
instance at `https://storyteller.example.com`, then you should set `AUTH_URL` to
`https://storyteller.example.com/api/v2/auth`.

### Configuring a provider

If you’d like to set up an OAuth provider for Storyteller, you can do so in the
`Authentication Providers` section of the settings page.

Storyteller supports a large number of built-in providers, like Auth0, Keycloak,
etc. Since you’re self-hosting, though, you'll likely want to set up a custom
provider with a self-hosted auth service like Authelia.

Follow the guidelines for your chosen provider to obtain a client ID and client
secret. Set the callback URL in your provider’s settings to the one provided by
the Storyteller settings.

:::info Callback URLs

Your provider’s callback URL is tied to the provider’s name in the Storyteller
settings. If you change the provider’s name, don’t forget to update the callback
URL in the provider’s settings!

:::

### Linking accounts

Once you’ve configured a provider, you can link your existing account to your
profile from your provider. Navigate to the Account page on your Storyteller
instance, and click the “Link to &lt;Your provider&gt;” button. Follow the OAuth
flow and sign in with your provider. You will be redirected back to Storyteller,
and now you'll be able to sign in with OAuth in the future!

### Signing in with OAuth

After one or more OAuth/OIDC providers have been configured, the log in page
will display a log in option for each one. Clicking one of the buttons will
initiate the log in flow for that provider. You will still be able to log in
with your username and password if needed.

## Audio settings

### Max track length

Storyteller can automatically split tracks longer than a given length. This will
reduce the memory consumption of the transcription step. The default is 2 hours,
but shorter values will result in less memory usage during transcription.

Storyteller will use silence detection to attempt to split tracks between
sentences, so as to not interfere with transcription. In practice, this works
very well!

### Transcoding

Audio files are "encoded", usually with some amount of compression. Different
encoders will have different effects on audio — some are better for music,
others better for speech, etc. Storyteller supports three audio codecs: MP3, AAC
(typically used in MP4/M4A/M4B files), and OPUS. OPUS is particularly efficient
at compressing human speech, and can result in significantly smaller output
files.

As part of its audio pre-processing step, Storyteller can transcode your audio
files using any of these codecs. If you'd like to enable transcoding, go to the
Settings page of your Storyteller instance and set "Preferred audio codec".
Depending on your choice, you may be presented with a choice of bitrate as well.
Generally speaking, the defaults are reasonable, lower numbers mean lower
quality (and smaller files), and higher numbers mean higher quality (and larger
files).

Please note that enabling transcoding will significantly slow down the
pre-processing step! You can improve transcoding performance by increasing the
maximum simultaneous transcodes in the parallelization settings — the ideal
number is the number of cores that you have available for Storyteller to use,
minus 1.

## Transcription engine settings

As part of the alignment process, Storyteller attempts to transcribe the
audiobook narration to text (see
[/docs/how-it-works/the-algorithm](/docs/how-it-works/the-algorithm) for more
details).

This is by far the most resource-intensive phase of the process. By default,
Storyteller will attempt to run the transcription job locally, using your
server's hardware. If you prefer to run the task via a paid third-party service,
you set that with the "transcription engine" setting on the Settings page.

The available paid transcription services are:

- [Google Cloud Speech-to-text AI](https://cloud.google.com/speech-to-text)
- [Azure Cognitive Services](https://azure.microsoft.com/en-us/products/ai-services/speech-to-text/)
- [Amazon Transcribe](https://aws.amazon.com/transcribe/)
- [OpenAI Cloud Platform](https://platform.openai.com/)
- [DeepGram Speech to Text](https://deepgram.com/product/speech-to-text)

To use any of these services, you must first set up an account with the service
provider, and obtain any relevant API keys and configuration. You can then
configure Storyteller to use your account for transcription.

### Transcribing locally

The default transcription engine is `whisper.cpp`, which runs the open source
[whisper.cpp](https://github.com/ggerganov/whisper.cpp) project locally.

Storyteller clones and builds whisper.cpp at runtime. This means that it may
take several minutes before your first transcription task actually begins, while
whisper.cpp is being built, but it also means that you can control which
acceleration frameworks whisper.cpp is built with.

The available acceleration frameworks are:

- cuBLAS-11.8. This is a CUDA-based BLAS library. It requires a CUDA-enabled
  NVIDIA GPU. Specifically, this is for GPUs with CUDA 11; use cuBLAS-12.4 if
  you are running CUDA 12
- cuBLAS-12.4. Same as cuBLAS-11.8, but for CUDA 12.
- hipBLAS. This is an AMD-based BLAS library. It requires an AMD GPU that
  supports the ROCm computation framework, and for the AMD GPU drivers to be
  installed on the host
