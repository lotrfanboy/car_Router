"""Offline UI regression for the saved AUDI A4 catalog failure.

Run after npm run build: python scripts/browser_catalog_regression.py
The recovered search criteria are real; all listing responses are synthetic.
Uses a temporary SQLite database, real local read APIs, and no provider calls.
"""

import copy
import json
import os
from pathlib import Path
import re
import socket
import sqlite3
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse
import urllib.request

from playwright.sync_api import expect, sync_playwright


REPO = Path(__file__).resolve().parents[1]
ARTIFACTS = REPO / "test-results" / "catalog-regression"
FIXTURE = REPO / "tests" / "fixtures" / "failed-catalog-search.json"
WARNING = "Consulta por texto sem correspondência confirmada. Todos os filtros serão conferidos localmente."


def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def seed(db_path, saved):
    """Only this temporary database is written. Never changes the fixture."""
    now = timestamp()
    criteria = copy.deepcopy(saved["criteria"])
    selection = criteria["catalog"]
    common = dict(
        source="olx", brand=criteria["brand"], model=criteria["model"], version=None,
        modelYear=2020, priceCents=10000000, mileage=50000,
        city="Curitiba", state=criteria["state"], sellerType="private",
        observedAt=now, reasons=[],
        identity=dict(brandId=selection["brandCode"], modelId=selection["modelCode"]),
        catalogResolution=dict(model="confirmed", version="unresolved"),
    )
    rows = []
    for status in ("confirmed", "uncertain", "incompatible"):
        row = copy.deepcopy(common)
        row.update(externalId="fixture-" + status,
                   title="TESTE SINTÉTICO · " + status,
                   url="https://pr.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/test-only-" + status)
        if status == "uncertain":
            row.pop("identity")
            row["catalogResolution"]["model"] = "unresolved"
            row["reasons"] = ["Marca não classificada", "Modelo não classificado"]
        elif status == "incompatible":
            row["state"] = "SC"
            row["reasons"] = ["Fora da abrangência selecionada ou localização desconhecida"]
        rows.append(row)
    source = dict(source="olx", status="ok", message="Resposta sintética offline",
                  observedAt=now, elapsedMs=1, creditsReserved=0, total=3,
                  received=3, partial=False, normalizationDiscards={}, listings=rows,
                  applied=dict(remote=["marca/modelo (texto)", "estado/região"],
                               local=["marca", "modelo", "localização"],
                               mapping=dict(status="uncertain", message=WARNING)))
    with sqlite3.connect(db_path) as db:
        for migration in sorted((REPO / "prisma" / "sqlite" / "migrations").glob("*/migration.sql")):
            db.executescript(migration.read_text())
        db.execute(
            "INSERT INTO CatalogRevision(id,schemaVersion,sourceSha256,status,brandCount,modelCount,versionCount,evidenceCount,modelsWithoutVersion,createdAt,validatedAt,activatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (selection["revision"], "1", "a" * 64, "active", 1, 1, 0, 0, 1, now, now, now),
        )
        db.execute("INSERT INTO CatalogState(id,activeRevisionId,updatedAt) VALUES (?,?,?)",
                   ("vehicle-catalog", selection["revision"], now))
        db.execute("INSERT INTO CatalogBrand(revisionId,id,name,sourceIds,sourceLabels,identityDecisionIds) VALUES (?,?,?,?,?,?)",
                   (selection["revision"], selection["brandCode"], criteria["brand"], "[]", "[]", "[]"))
        db.execute("INSERT INTO CatalogModel(revisionId,id,brandId,name,sourceIds,sourceLabels,versionsPending,hasAcceptedVersions) VALUES (?,?,?,?,?,?,?,?)",
                   (selection["revision"], selection["modelCode"], selection["brandCode"], criteria["model"], "[]", "[]", 0, 0))
        for search_id, listings in (("fixture-mixed", rows), ("fixture-uncertain", [rows[1]])):
            current = {**source, "listings": listings, "total": len(listings), "received": len(listings)}
            db.execute("INSERT INTO SavedSearch(id,name,criteria,createdAt) VALUES (?,?,?,?)",
                       (search_id, criteria["name"], json.dumps(criteria), now))
            db.execute("INSERT INTO SearchRun(id,searchId,createdAt,result) VALUES (?,?,?,?)",
                       (search_id + "-run", search_id, now, json.dumps({"sources": [current]})))


def start_server(db_path, base, log):
    env = {**os.environ, "DATABASE_URL": "file:" + str(db_path),
           "PRISMA_SCHEMA": "prisma/sqlite/schema.prisma", "GECKO_API_KEY": " ",
           "REEF_API_KEY": " ", "REEF_FREE_TRIAL": "false", "RADAR_SCHEDULER_ENABLED": "false",
           "RESEND_API_KEY": " ", "RADAR_CRON_SECRET": " "}
    process = subprocess.Popen(
        ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", str(urlparse(base).port)],
        cwd=REPO, env=env, stdout=log, stderr=log,
    )
    for _ in range(100):
        try:
            if urllib.request.urlopen(base + "/buscar", timeout=1).status == 200:
                return process
        except Exception:
            if process.poll() is not None:
                raise RuntimeError("Local server exited; see catalog-regression/server.log")
            time.sleep(.2)
    stop_server(process)
    raise RuntimeError("Local server did not become ready")


def stop_server(process):
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


def check_page(page, base, width, artifacts):
    page.goto(base + "/buscar?busca=fixture-mixed")
    expect(page.get_by_role("combobox", name="Marca", exact=True)).to_have_value("AUDI")
    expect(page.get_by_role("combobox", name="Modelo", exact=True)).to_have_value("A4")
    source = page.locator(".source-results details")
    expect(source).to_have_count(1)
    expect(source).to_have_attribute("open", "")
    expect(source).to_contain_text("3 recebidos · 1 aprovados · 1 incertos · 1 incompatíveis · 0 descartados na normalização")
    expect(source.get_by_text(WARNING, exact=True)).to_be_visible()
    expect(page.get_by_text("Correspondência confirmada", exact=True)).to_have_count(1)
    uncertain = page.locator("details.previous-results").filter(has=page.locator("summary", has_text="1 resultado com correspondência incerta"))
    incompatible = page.locator("details.previous-results").filter(has=page.locator("summary", has_text="1 resultado incompatível com os filtros"))
    expect(uncertain).to_have_count(1)
    expect(incompatible).to_have_count(1)
    uncertain.locator("summary").click()
    incompatible.locator("summary").click()
    expect(uncertain.locator("article.listing-card")).to_have_count(1)
    expect(incompatible.locator("article.listing-card")).to_have_count(1)
    expect(page.locator("article.listing-card")).to_have_count(3)
    expect(uncertain.get_by_text("Correspondência incerta — confira os dados do anúncio", exact=True)).to_be_visible()
    expect(uncertain.get_by_text("Modelo não classificado", exact=True)).to_be_visible()
    expect(incompatible.get_by_text("Incompatível com os filtros selecionados", exact=True)).to_be_visible()
    expect(incompatible.get_by_text("Fora da abrangência selecionada ou localização desconhecida", exact=True)).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), f"Overflow at {width}px"
    page.screenshot(path=str(artifacts / f"{width}-mixed.png"), full_page=True)
    page.goto(base + "/buscar?busca=fixture-uncertain")
    expect(page.get_by_role("heading", name="Nenhuma correspondência confirmada neste recorte", exact=True)).to_be_visible()
    expect(page.get_by_text(re.compile("A falta de confirmação do catálogo não significa que o veículo não exista"))).to_be_visible()
    expect(page.get_by_text("Correspondência confirmada", exact=True)).to_have_count(0)
    expect(page.locator(".source-results")).to_contain_text("1 recebidos · 0 aprovados · 1 incertos · 0 incompatíveis")
    expect(page.get_by_role("heading", name="Busca indisponível", exact=True)).to_have_count(0)
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), f"Empty-state overflow at {width}px"
    page.screenshot(path=str(artifacts / f"{width}-uncertain.png"), full_page=True)


def main():
    saved = json.loads(FIXTURE.read_text())
    build_id = (REPO / ".next" / "BUILD_ID").read_text().strip()
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    errors, blocked_external, blocked_mutations, offline_city_requests = [], [], [], []
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        base = f"http://127.0.0.1:{sock.getsockname()[1]}"
    with tempfile.TemporaryDirectory(prefix="catalog-ui-") as temporary, (ARTIFACTS / "server.log").open("w") as log:
        db_path = Path(temporary) / "fixture.db"
        seed(db_path, saved)
        process = start_server(db_path, base, log)
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
                for width in (1440, 390):
                    context = browser.new_context(viewport={"width": width, "height": 900},
                                                  is_mobile=width == 390, has_touch=width == 390,
                                                  service_workers="block")
                    def offline(route):
                        request = route.request
                        parsed = urlparse(request.url)
                        if parsed.netloc != urlparse(base).netloc:
                            blocked_external.append(request.url)
                            return route.abort()
                        if request.method not in ("GET", "HEAD"):
                            blocked_mutations.append(request.url)
                            return route.abort()
                        if parsed.path == "/api/search-options" and parse_qs(parsed.query).get("type") == ["cities"]:
                            offline_city_requests.append(request.url)
                            return route.fulfill(json=[])
                        route.continue_()
                    context.route("**/*", offline)
                    page = context.new_page()
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    check_page(page, base, width, ARTIFACTS)
                    context.close()
                browser.close()
            assert not errors, errors
            assert not blocked_external, f"Unexpected external browser requests: {blocked_external}"
            assert not blocked_mutations, f"Unexpected mutation attempts: {blocked_mutations}"
            assert (REPO / ".next" / "BUILD_ID").read_text().strip() == build_id, "Build changed during validation"
            with sqlite3.connect(db_path) as db:
                assert db.execute("SELECT count(*) FROM ProviderSpend").fetchone()[0] == 0
                assert db.execute("SELECT count(*) FROM SearchRun").fetchone()[0] == 2
            report = dict(status="passed", completed_at=timestamp(), build_id=build_id,
                          criteria_source=str(FIXTURE.relative_to(REPO)),
                          viewports=[1440, 390], synthetic_listing_count=3, saved_scenarios=2,
                          checks=["saved AUDI A4 criteria restored through real local API",
                                  "confirmed, uncertain and incompatible counts and cards are disjoint",
                                  "source mapping warning and per-listing reasons visible",
                                  "no confirmed match distinguished from unavailable search",
                                  "desktop and touch mobile screenshots; no horizontal overflow"],
                          javascript_errors=errors, blocked_external_requests=blocked_external,
                          blocked_mutations=blocked_mutations, offline_city_requests=len(offline_city_requests),
                          provider_extractions=0, provider_spend_rows=0,
                          limitations=["Listings and their classification are synthetic, not proof of real provider coverage or equivalence.",
                                       "Recovered selection is real; history rendering uses a temporary SQLite database.",
                                       "No search execution, portal request, notification or production mutation was performed."])
            (ARTIFACTS / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
            print(json.dumps(report, ensure_ascii=False, indent=2))
        finally:
            stop_server(process)


if __name__ == "__main__":
    main()
