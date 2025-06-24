# Securely Share Your Storyteller Server with Tailscale (Non-techie friendly!)

For those of you who want to access your Storyteller server away from home — and
maybe share with family — but want to do so safely, here are some basic
instructions for how to do it:

## Create a Tailnet

1.  Watch this video and follow these super easy instructions:
    https://tailscale.com/kb/1017/install
2.  Install Tailscale on the computer where your Storyteller server is located.
3.  Install Tailscale on any devices that you want to be able to connect to your
    server. (This includes other computers as well as your reading devices.)

## Give your Tailnet a cute name (Optional)

Go to the DNS tab and clicking the Rename Tailnet button.

## Enable HTTPS

This is required to use the Storyteller reader app on iOS.

### Enable the `tailscale` CLI (command line interface)

<details>
    <summary>Linux</summary>

Nothing to do! The `tailscale` CLI is the primary way to interact with Tailscale
on Linux.

</details>

<details>
    <summary>macOS</summary>

[Follow the instructions on the Tailscale docs](https://tailscale.com/kb/1080/cli?tab=macos#using-the-tailscale-cli)
for installing the CLI from the macOS app.

</details>

<details>
    <summary>Windows</summary>

You can access the CLI by executing the .exe from the Command Prompt.

</details>

### Configure the Tailscale server

In Terminal run:

```sh
tailscale serve --https=443 --bg 8001
```

The first time you run `tailscale serve`, you will be prompted to navigate to a
Tailscale URL to enable it:

```
Serve is not enabled on your tailnet. To enable,
visit: https://login.tailscale.com/f/serve?node=...
```

Paste the link into a brower and follow the instructions. Your terminal window
will update with something like this:

```
Success.
Available within your tailnet:

https://storyteller-server.lemur-dragon.ts.net/ |-- proxy
http://127.0.0.1:8001

Serve started and running in the background. To disable the proxy, run:
tailscale serve --https=443 off
```

## Update all your apps/bookmarks to use your Tailnet address for your server

You may have previously used a local IP address, such as
`http://192.168.1.xxx:8001`, to connect to your Storyteller server in a web
browser and the mobile apps. You should now update those URLs to the new
Tailscale URL, which was printed as a result of the `tailscale serve` command.
For example, `https://storyteller-server.lemur-dragon.ts.net/`.

You should now be able to connect to your Storyteller server to download books
and sync progress from any network in the world, from any device in your
Tailnet!

**Notes**:

- You must now use `https://`, not `http://` at the beginning of the URL (this
  is called the URL’s “scheme”).
- You no longer need to add the `:8001` to the end of the URL (this is called
  the URL’s “port”).

## **Bonus**: Sharing your Storyteller server with friends and family

### You need to

#### Invite them to your Tailnet.

1.  Go to the Tailscale Admin Console:
    https://login.tailscale.com/admin/machines
2.  Find the computer running your Storyteller server in the list and click it.
3.  Click “Share this device”.
4.  Enter your friend’s email.
5.  Hit “Send Invite”.

#### Invite them to your Storyteller server

1.  Go to Users.
2.  Click the “+Invite User” button and follow the instructions
3.  **_Tip_**: If you haven’t set up your email in Settings, you can just
    copy-paste the invite link that is generated and send it to them whichever
    way you want. Make sure that you yourself are viewing Storyteller from the
    Tailscale URL when you do this!

### Your friend needs to

#### Set up Tailscale

1. First, make a Tailscale account. They can use any identity provider.
2. Accept the device share invite (they’ll get a link in an email and see it in
   their Tailscale UI).
3. Install the Tailscale app on any device they wish to access Storyteller from.
4. Log in to their Tailscale account on each device.

#### Set up Storyteller

1. From a device with Tailscale installed and connected, open the Storyteller
   invite link.
2. Create a Storyteller account on your instance.
3. Install the Storyteller Reader mobile app
4. Configure the mobile app to use your Tailscale URL for the server.
5. **Read!!**
