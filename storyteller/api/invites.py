import smtplib
from email.message import EmailMessage

from .database import get_setting


def send_invite(email: str, key: str):
    library_name = get_setting("library_name")
    web_url = get_setting("web_url")
    smtp_from = get_setting("smtp_from")
    smtp_host = get_setting("smtp_host")
    smtp_port = get_setting("smtp_port")
    smtp_username = get_setting("smtp_username")
    smtp_password = get_setting("smtp_password")

    msg = EmailMessage()
    msg.set_content(
        f"""
Hello!

You've been invited to the {library_name} Storyteller library.

You can accept your invite by following this link:

{web_url}/invites/{key}
"""
    )

    msg["Subject"] = f"Invited to {library_name} Storyteller library!"
    msg["From"] = smtp_from
    msg["To"] = email

    client = smtplib.SMTP(smtp_host, smtp_port)

    if smtp_username is not None and smtp_password is not None:
        client.login(smtp_username, smtp_password)

    try:
        client.send_message(msg)
    finally:
        client.quit()
