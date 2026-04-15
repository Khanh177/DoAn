# from sendgrid import SendGridAPIClient
# from sendgrid.helpers.mail import Mail, Email, To, Content
from asyncio.log import logger
import os
from dotenv import load_dotenv
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import smtplib
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Tìm thư mục backend
basedir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.abspath(os.path.join(basedir, "..", ".."))

# Load .env
load_dotenv(os.path.join(root_dir, ".env"))

# SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")
SMTP_EMAIL = os.getenv("SMTP_EMAIL")
SMTP_PASSWORD = os.getenv("SMTP_APP_PASSWORD")
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 465))

brand = "Golden Luxe"
support_email = os.getenv("SMTP_EMAIL")

def send_otp_email(to_email: str, otp: str):
    subject = "Xác thực OTP cho tài khoản Golden Luxe"

    html_content = f"""
    <!doctype html>
    <html lang="vi">
    <head>
        <meta charset="utf-8">
        <meta name="x-apple-disable-message-reformatting">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Xác thực OTP</title>
        <style>
        .preheader{{display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all}}
        @media (prefers-color-scheme: dark) {{
            body{{background:#0b0b0c!important;color:#e6e6e6!important}}
            .card{{background:#161617!important;border-color:#2a2a2b!important}}
            .muted{{color:#b5b5b7!important}}
        }}
        </style>
    </head>
    <body style="margin:0;padding:0;background:#f6f7f9;color:#111111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,'Apple Color Emoji','Segoe UI Emoji',sans-serif;">
        <span class="preheader">Mã OTP của bạn: {otp}. Hiệu lực 5 phút.</span>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:24px 12px;">
        <tr>
            <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;">
                <tr>
                <td style="padding:12px 0;text-align:center;font-weight:700;font-size:20px;letter-spacing:.3px;color:#111">
                    {brand}
                </td>
                </tr>
                <tr>
                <td class="card" style="background:#ffffff;border:1px solid #eceff3;border-radius:16px;padding:28px 24px;">
                    <h1 style="margin:0 0 8px;font-size:20px;line-height:1.35;">Xác thực đăng nhập</h1>
                    <p class="muted" style="margin:0 0 20px;color:#6b7280;font-size:14px;line-height:1.6;">Đây là mã OTP của bạn. Mã có hiệu lực trong 5 phút.</p>
                    <div style="text-align:center;margin:24px 0 18px;">
                    <div style="display:inline-block;font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:28px;letter-spacing:6px;background:#fff7e6;border:1px dashed #f1c14f;color:#8b6b00;border-radius:12px;padding:14px 18px;">
                        {otp}
                    </div>
                    </div>
                    <p style="margin:0 0 14px;font-size:14px;line-height:1.6;">Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email hoặc liên hệ hỗ trợ.</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:22px;">
                    <tr>
                        <td align="center">
                        <a href="#" style="display:inline-block;text-decoration:none;background:#d4af37;color:#111;font-weight:600;border-radius:10px;padding:12px 18px;">Tiếp tục</a>
                        </td>
                    </tr>
                    </table>
                </td>
                </tr>
                <tr>
                <td style="text-align:center;padding:16px 8px 0;color:#9aa1aa;font-size:12px;line-height:1.6;">
                    Cần hỗ trợ? Liên hệ {support_email}
                </td>
                </tr>
                <tr>
                <td style="text-align:center;padding:6px 8px 0;color:#c0c6cf;font-size:11px;">© {brand}. All rights reserved.</td>
                </tr>
            </table>
            </td>
        </tr>
        </table>
    </body>
    </html>
    """

    # message = Mail(
    #     from_email=Email("vanmay12344@gmail.com", "Gold Website"),
    #     to_emails=To(to_email),
    #     subject=subject,
    #     html_content=Content("text/html", html_content)
    # )

    # Tạo message MIME
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"Gold Website <{SMTP_EMAIL}>"
    msg["To"] = to_email

    msg.attach(MIMEText(html_content, "html"))

    try:
        # Kết nối an toàn qua SSL
        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT) as server:
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.sendmail(SMTP_EMAIL, to_email, msg.as_string())

        logger.info("Email OTP đã gửi tới %s", to_email)
        return True
    except Exception as e:
        logger.exception("Lỗi khi gửi email tới %s: %s", to_email, e)
        # Nếu muốn, ném exception để caller biết gửi thất bại
        raise

    # try:
    #     sg = SendGridAPIClient(SENDGRID_API_KEY)
    #     response = sg.send(message)

    #     if response.status_code == 202:
    #         print(f"Email đã được gửi thành công đến {to_email}")
    #     else:
    #         print(f"Lỗi khi gửi email: {response.status_code} - {response.body.decode()}")
    # except Exception as e:
    #     print(f"Lỗi khi gửi email: {e}")
    #     raise