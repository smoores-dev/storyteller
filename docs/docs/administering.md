---
sidebar_position: 5
---

# Administering Storyteller

Congrats, you're now a server admin! Luckily, the Storyteller backend is pretty
straightforward to administer, but there are a few things worth keeping in mind.

## Setting up the admin user

When you first run the Storyteller backend, the web interface will prompt you to
create an admin user. This user will be saved in the database and given all
permissions in the system.

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
