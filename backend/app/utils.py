import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import emails  # type: ignore
import jwt
from jinja2 import Template
from jwt.exceptions import InvalidTokenError

from app.core import security
from app.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class EmailData:
    html_content: str
    subject: str


def render_email_template(*, template_name: str, context: dict[str, Any]) -> str:
    template_str = (
        Path(__file__).parent / "email-templates" / "build" / template_name
    ).read_text()
    html_content = Template(template_str).render(context)
    return html_content


def send_email(
    *,
    email_to: str,
    subject: str = "",
    html_content: str = "",
) -> None:
    assert settings.emails_enabled, "no provided configuration for email variables"
    message = emails.Message(
        subject=subject,
        html=html_content,
        mail_from=(settings.EMAILS_FROM_NAME, settings.EMAILS_FROM_EMAIL),
    )
    smtp_options = {"host": settings.SMTP_HOST, "port": settings.SMTP_PORT}
    if settings.SMTP_TLS:
        smtp_options["tls"] = True
    elif settings.SMTP_SSL:
        smtp_options["ssl"] = True
    if settings.SMTP_USER:
        smtp_options["user"] = settings.SMTP_USER
    if settings.SMTP_PASSWORD:
        smtp_options["password"] = settings.SMTP_PASSWORD
    response = message.send(to=email_to, smtp=smtp_options)
    logger.info(f"send email result: {response}")


def generate_test_email(email_to: str) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Test email"
    html_content = render_email_template(
        template_name="test_email.html",
        context={"project_name": settings.PROJECT_NAME, "email": email_to},
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_reset_password_email(email_to: str, email: str, token: str) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Password recovery for user {email}"
    link = f"{settings.FRONTEND_HOST}/reset-password?token={token}"
    html_content = render_email_template(
        template_name="reset_password.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "username": email,
            "email": email_to,
            "valid_hours": settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS,
            "link": link,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_new_account_email(
    email_to: str, username: str, password: str
) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - New account for user {username}"
    html_content = render_email_template(
        template_name="new_account.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "username": username,
            "password": password,
            "email": email_to,
            "link": settings.FRONTEND_HOST,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_password_reset_token(email: str) -> str:
    delta = timedelta(hours=settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS)
    now = datetime.now(timezone.utc)
    expires = now + delta
    exp = expires.timestamp()
    encoded_jwt = jwt.encode(
        {"exp": exp, "nbf": now, "sub": email},
        settings.SECRET_KEY,
        algorithm=security.ALGORITHM,
    )
    return encoded_jwt


def verify_password_reset_token(token: str) -> str | None:
    try:
        decoded_token = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        return str(decoded_token["sub"])
    except InvalidTokenError:
        return None


def validate_pdf_integrity(file_content: bytes) -> Optional[str]:
    """
    Validate PDF file integrity - check if file can be opened and read
    
    Args:
        file_content: The PDF file content as bytes
        
    Returns:
        None if PDF is valid, error message string if invalid
    """
    try:
        import PyPDF2
        import io
        
        # Create a BytesIO object from the file content
        pdf_stream = io.BytesIO(file_content)
        
        # Try to read the PDF using PyPDF2
        pdf_reader = PyPDF2.PdfReader(pdf_stream)
        
        # Check if PDF has pages
        if len(pdf_reader.pages) == 0:
            return "PDF file appears to be empty or corrupted (no pages found)."
        
        # Try to read text from first page to ensure file is not corrupted
        try:
            first_page = pdf_reader.pages[0]
            # Attempt to extract text (this will fail if PDF is corrupted)
            _ = first_page.extract_text()
        except Exception as page_error:
            return f"PDF file appears to be corrupted or cannot be read: {str(page_error)}"
            
        # Reset stream for further use
        pdf_stream.seek(0)
        
        return None  # PDF is valid
        
    except ImportError:
        # Fallback to PyPDFLoader if PyPDF2 is not available
        try:
            import tempfile
            import os
            from langchain_community.document_loaders import PyPDFLoader
            
            # Create a temporary file to test PDF loading
            with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
                temp_file.write(file_content)
                temp_file_path = temp_file.name
            
            try:
                # Try to load the PDF using PyPDFLoader
                loader = PyPDFLoader(temp_file_path)
                docs = loader.load()
                
                if not docs or len(docs) == 0:
                    return "PDF file appears to be empty or corrupted (no content found)."
                    
                return None  # PDF is valid
                    
            finally:
                # Clean up temporary file
                if os.path.exists(temp_file_path):
                    os.unlink(temp_file_path)
                    
        except Exception as loader_error:
            return f"PDF file appears to be corrupted or cannot be read: {str(loader_error)}"
    except Exception as pdf_error:
        return f"PDF file appears to be corrupted or cannot be read: {str(pdf_error)}"
