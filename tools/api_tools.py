
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from urllib.parse import quote_plus
from core.config import Config

def get_map_distance(origin, destination):
    safe_origin = quote_plus(origin)
    safe_dest = quote_plus(destination)
    url = f"https://www.google.com/maps/dir/?api=1&origin={safe_origin}&destination={safe_dest}"
    summary = f"Directions from {origin} to {destination}."
    
    gmaps = Config.get_gmaps_client()
    if gmaps:
        try:
            result = gmaps.distance_matrix(origins=[origin], destinations=[destination], mode='driving')
            if result['status'] == 'OK':
                element = result['rows'][0]['elements'][0]
                if element['status'] == 'OK':
                    dist, dur = element['distance']['text'], element['duration']['text']
                    summary = f"Distance: {dist}, Time: {dur}."
        except Exception as e:
            summary = f"Opening route for {origin} to {destination}... (Distance calc failed: {str(e)})"
            
    return {"summary": summary, "url": url}

def send_email_logic(to_email, subject, message):
    user, pw = os.getenv("GMAIL_USER"), os.getenv("GMAIL_APP_PASSWORD")
    if pw:
        pw = pw.replace(" ", "")
    if not user or not pw:
        return "❌ Email credentials missing. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env"

    # Explicitly cast to str to satisfy type checkers after the check above
    username: str = str(user)
    password: str = str(pw)

    try:
        msg = MIMEMultipart()
        msg["From"] = username
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(message, "plain", "utf-8"))
        
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as server:
            server.ehlo()
            server.login(username, password)
            server.sendmail(username, [to_email], msg.as_string())
        print(f"[Email] ✅ Sent to {to_email}")
        return f"✅ Email sent to {to_email} successfully."
    except smtplib.SMTPAuthenticationError:
        return "❌ Email Error: Gmail authentication failed. Make sure you are using an App Password (not your regular Gmail password). Visit https://myaccount.google.com/apppasswords"
    except smtplib.SMTPRecipientsRefused:
        return f"❌ Email Error: The address '{to_email}' was rejected by the server. Please double-check the email address."
    except Exception as e:
        print(f"[Email] ❌ Error: {type(e).__name__}: {e}")
        return f"❌ Email Error: {type(e).__name__}: {e}"
