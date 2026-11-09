from pathlib import Path

import pytest


@pytest.fixture
def db_path(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Aponta MINSKI_DB_PATH para um arquivo SQLite num diretório temporário."""
    caminho = tmp_path / "minski-teste.db"
    monkeypatch.setenv("MINSKI_DB_PATH", str(caminho))
    return caminho
