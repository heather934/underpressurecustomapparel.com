"""Minimal Google Drive client: OAuth (desktop-app flow), folder listing,
and download -- just enough to find MTR PDFs under a shared Drive folder by
Heat Number and pull them down locally.
"""
from __future__ import annotations

import io
import re
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

DEFAULT_TOKEN_PATH = Path.home() / ".mtr_merger" / "token.json"
DEFAULT_CLIENT_SECRET_PATH = Path.home() / ".mtr_merger" / "client_secret.json"

_FOLDER_ID_RE = re.compile(r"/folders/([a-zA-Z0-9_-]+)")


def _escape_query_literal(value: str) -> str:
    """Escapes a value for use inside a single-quoted Drive API query literal."""
    return value.replace("\\", "\\\\").replace("'", "\\'")


def extract_folder_id(folder_url_or_id: str) -> str:
    """Accepts either a raw Drive folder ID or a full folder URL."""
    match = _FOLDER_ID_RE.search(folder_url_or_id)
    if match:
        return match.group(1)
    return folder_url_or_id.strip()


def get_credentials(client_secret_path: Path = DEFAULT_CLIENT_SECRET_PATH,
                      token_path: Path = DEFAULT_TOKEN_PATH) -> Credentials:
    """Runs the OAuth desktop-app flow the first time, then reuses/refreshes
    the cached token on every later run. See the README for how to create
    client_secret.json in Google Cloud Console.
    """
    creds = None
    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not client_secret_path.exists():
                raise FileNotFoundError(
                    f"No Google OAuth client secret found at {client_secret_path}. "
                    "Download it from Google Cloud Console (APIs & Services > "
                    "Credentials > OAuth client ID > Desktop app) and save it there. "
                    "See README.md."
                )
            flow = InstalledAppFlow.from_client_secrets_file(str(client_secret_path), SCOPES)
            creds = flow.run_local_server(port=0)
        token_path.parent.mkdir(parents=True, exist_ok=True)
        token_path.write_text(creds.to_json())

    return creds


class DriveClient:
    def __init__(self, credentials: Credentials):
        self.service = build("drive", "v3", credentials=credentials)

    def list_pdfs_under_folder(self, folder_id: str) -> list[dict]:
        """Recursively walks folder_id (and subfolders) and returns every
        PDF file's metadata dict ({'id', 'name', ...}).
        """
        pdfs: list[dict] = []
        to_visit = [folder_id]
        while to_visit:
            current = to_visit.pop()
            page_token = None
            while True:
                response = self.service.files().list(
                    q=f"'{current}' in parents and trashed = false",
                    corpora="allDrives",
                    includeItemsFromAllDrives=True,
                    supportsAllDrives=True,
                    fields="nextPageToken, files(id, name, mimeType)",
                    pageToken=page_token,
                    pageSize=200,
                ).execute()
                for f in response.get("files", []):
                    if f["mimeType"] == "application/vnd.google-apps.folder":
                        to_visit.append(f["id"])
                    elif f["mimeType"] == "application/pdf":
                        pdfs.append(f)
                page_token = response.get("nextPageToken")
                if not page_token:
                    break
        return pdfs

    def find_files_for_heat(self, folder_id: str, heat_number: str,
                              all_pdfs: list[dict] | None = None) -> list[dict]:
        """Matches PDFs under folder_id whose filename contains heat_number,
        falling back to Drive's full-text search (which also OCRs scanned
        PDFs) for anything not caught by filename alone.
        """
        heat_upper = heat_number.upper()
        pdfs = all_pdfs if all_pdfs is not None else self.list_pdfs_under_folder(folder_id)
        by_name = [f for f in pdfs if heat_upper in f["name"].upper()]
        if by_name:
            return by_name

        matches = []
        page_token = None
        while True:
            response = self.service.files().list(
                q=(f"'{folder_id}' in parents and trashed = false "
                    f"and fullText contains '{_escape_query_literal(heat_number)}'"),
                corpora="allDrives",
                includeItemsFromAllDrives=True,
                supportsAllDrives=True,
                fields="nextPageToken, files(id, name, mimeType)",
                pageToken=page_token,
                pageSize=200,
            ).execute()
            matches.extend(f for f in response.get("files", [])
                            if f["mimeType"] == "application/pdf")
            page_token = response.get("nextPageToken")
            if not page_token:
                break
        return matches

    def download_file(self, file_id: str, dest_path: Path) -> Path:
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        request = self.service.files().get_media(fileId=file_id, supportsAllDrives=True)
        with io.FileIO(dest_path, "wb") as fh:
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
        return dest_path
