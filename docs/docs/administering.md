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
to sign in with your new username and password. Make sure you use your username,
not your email address!

## Inviting users

You may wish to invite additional users, such as family members, to your server.
Rather than sharing a username and password, you should set up separate accounts
for each user. Setting up separate accounts will allow you to grant specific
permissions to each user. Most likely, you'll want most users to have the "Basic
User" capabilities, which allows them to see the list of books on the server and
download individual books. You can also invite additional administrators, or
give users fine-grained permissions (for example, you may choose to give a user
the capability to add and synchronize new books, but not to invite new users).

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

## Audio settings

As part of its audio pre-processing step, Storyteller can transcode your audio
files using the [OPUS codec](https://opus-codec.org/). This encoding is
particularly efficient at compressing human speech, and can result in
significantly smaller output files.

If you'd like to enable OPUS transcoding, go to the Settings page of your
Storyteller instance and set "Preferred audio codec" to "OPUS", and then choose
a bitrate. The default will be 32 Kb/s, which is a nice balance of storage
savings and audio quality, but you can choose a higher bitrate for less
compression, or a lower one for more.

Please note that enabling OPUS transcoding will significantly slow down the
Pre-processing step!

## Transcription engine settings

As part of the synchronization process, Storyteller attempts to transcribe the
audiobook narration to text (see
[/docs/how-it-works/the-algorithm](/docs/how-it-works/the-algorithm) for more
details).

This is by far the most resource-intensive phase of the process. By default,
Storyteller will attempt to run the transcription job locally, using your
server's hardware. If you would prefer to run the task via a paid third-party
service, you set that with the "transcription engine" setting on the Settings
page.

The available paid transcription services are:

- [Google Cloud Speech-to-text AI](https://cloud.google.com/speech-to-text)
- [Azure Cognitive Services](https://azure.microsoft.com/en-us/products/ai-services/speech-to-text/)
- [Amazon Transcribe](https://aws.amazon.com/transcribe/)
- [OpenAI Cloud Platform](https://platform.openai.com/)

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

- OpenBLAS. This is a CPU-based BLAS library; this means that you can use it
  without a GPU. It's supported by most CPUs; if you're using your CPU, we
  recommend that you try out OpenBLAS, as it may have better performance than
  the default whisper.cpp build.
- cuBLAS-11.8. This is a CUDA-based BLAS library. It requires a CUDA-enabled
  NVIDIA GPU. Specifically, this is for GPUs with CUDA 11; use cuBLAS-12.4 if
  you are running CUDA 12
- cuBLAS-12.4. Same as cuBLAS-11.8, but for CUDA 12.
