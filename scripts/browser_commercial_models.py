"""Commercial-model UI regression against real local APIs and an isolated SQLite DB.

Run after npm run build. Source attributes are recovered observations; listings,
prices and locations in this UI fixture are synthetic. No provider request runs.
"""
import json
import re
from pathlib import Path
import socket
import sqlite3
import tempfile
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import expect, sync_playwright
from browser_catalog_regression import start_server, stop_server, timestamp

REPO = Path(__file__).resolve().parents[1]
ARTIFACTS = REPO / "test-results" / "commercial-models"


def seed(path):
    fixture = json.loads((REPO / "tests/fixtures/commercial-models.json").read_text())["catalog"]
    observations = json.loads((REPO / "src/data/source-model-observations.json").read_text())["observations"]
    brand = next(row for row in fixture["brands"] if row["name"] == "CHEVROLET")
    model = next(row for row in fixture["models"] if row["name"] == "Celta 2P")
    now = timestamp()
    criteria = dict(name="Celta antigo · 2 portas", brand=brand["name"], model=model["name"], version="",
                    state="SC", city="", cities=[], locationMode="state", yearMin=None, yearMax=None,
                    priceMax=None, mileageMax=None, privateOnly=False, sources=["olx", "webmotors"], olxUrl="",
                    catalog=dict(provider="carrouter", revision=fixture["revision"], brandCode=brand["id"],
                                 brandName=brand["name"], modelCode=model["id"], modelName=model["name"]))
    selected = [next(row for row in observations if row["source"] == "webmotors" and row["model"] == "CELTA"),
                next(row for row in observations if row["model"] == "CORSA"),
                next(row for row in observations if row["source"] == "olx" and "5P" in row["model"])]
    sources = []
    for source in ("olx", "webmotors"):
        listings = [dict(source=source, externalId="synthetic-" + row["externalId"], url=row["url"],
                         title="TESTE LOCAL · " + row["model"], brand=row["brand"], model=row["model"],
                         sourceModel=row["model"], version=row["version"], sourceIdentity=row["source_identity"],
                         original=dict(brand=row["brand"], model=row["model"], version=row["version"]),
                         modelYear=2006, state="SC", city="Blumenau", priceCents=1000000, mileage=100000,
                         sellerType="private", observedAt=now, reasons=["Modelo não classificado"],
                         versionOrigin="explicit" if row["version"] else "unknown")
                    for row in selected if row["source"] == source]
        if source == "webmotors":
            missing = dict(listings[0], externalId="synthetic-no-version",
                           url="https://www.webmotors.com.br/comprar/chevrolet/celta/test/900000001",
                           title="TESTE LOCAL · CELTA SEM VERSÃO", version=None, versionOrigin="unknown",
                           sourceIdentity={**listings[0]["sourceIdentity"], "versionId": None},
                           original={**listings[0]["original"], "version": None})
            listings.append(missing)
        sources.append(dict(source=source, status="ok", observedAt=now, elapsedMs=1, creditsReserved=0,
                            partial=False, total=len(listings), received=len(listings), message="Fixture local",
                            listings=listings))
    with sqlite3.connect(path) as db:
        for migration in sorted((REPO / "prisma/sqlite/migrations").glob("*/migration.sql")):
            db.executescript(migration.read_text())
        db.execute("INSERT INTO CatalogRevision(id,schemaVersion,sourceSha256,status,brandCount,modelCount,versionCount,evidenceCount,modelsWithoutVersion,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)",
                   (fixture["revision"], "1", "a" * 64, "active", len(fixture["brands"]), len(fixture["models"]), len(fixture["versions"]), 0, 0, now))
        db.execute("INSERT INTO CatalogState(id,activeRevisionId,updatedAt) VALUES (?,?,?)", ("vehicle-catalog", fixture["revision"], now))
        for row in fixture["brands"]:
            db.execute("INSERT INTO CatalogBrand(revisionId,id,name,sourceIds,sourceLabels,identityDecisionIds) VALUES (?,?,?,?,?,?)", (fixture["revision"], row["id"], row["name"], "[]", "[]", "[]"))
        for row in fixture["models"]:
            db.execute("INSERT INTO CatalogModel(revisionId,id,brandId,name,sourceIds,sourceLabels,versionsPending,hasAcceptedVersions) VALUES (?,?,?,?,?,?,?,?)", (fixture["revision"], row["id"], row["brandId"], row["name"], "[]", "[]", 0, 1))
        for row in fixture["versions"]:
            db.execute("INSERT INTO CatalogVersion(revisionId,id,modelId,name,engine,transmission,sourceIds,sourceLabels) VALUES (?,?,?,?,?,?,?,?)", (fixture["revision"], row["id"], row["modelId"], row["name"], row["engine"], row["transmission"], "[]", "[]"))
        db.execute("INSERT INTO SavedSearch(id,name,criteria,createdAt) VALUES (?,?,?,?)", ("legacy-celta", criteria["name"], json.dumps(criteria), now))
        db.execute("INSERT INTO SearchRun(id,searchId,createdAt,result) VALUES (?,?,?,?)", ("legacy-celta-run", "legacy-celta", now, json.dumps(dict(sources=sources))))


def check(page, base, width):
    page.goto(base + "/buscar?busca=legacy-celta")
    expect(page.get_by_role("combobox", name="Modelo", exact=True)).to_have_value("Celta")
    expect(page.locator('[name="configuration"], [name="version"]')).to_have_count(0)
    expect(page.locator("article.listing-card:visible")).to_have_count(3)
    expect(page.get_by_text("Correspondência confirmada", exact=True)).to_have_count(3)
    expect(page.get_by_text("Modelo não classificado", exact=True)).to_have_count(0)
    facet = page.get_by_role("combobox", name="Versão nos resultados", exact=True)
    expect(page.locator(".discovery-layout > .panel").get_by_role("combobox", name="Versão nos resultados", exact=True)).to_have_count(1)
    expect(page.locator(".discovery-results").get_by_role("combobox", name="Versão nos resultados", exact=True)).to_have_count(0)
    expect(facet).to_be_visible()
    model_box = page.get_by_role("combobox", name="Modelo", exact=True).bounding_box()
    facet_box = facet.bounding_box()
    year_box = page.locator('input[name="yearMin"]').bounding_box()
    assert model_box and facet_box and year_box and model_box["y"] < facet_box["y"] < year_box["y"]
    expect(facet).to_have_value("")
    expect(facet.locator("option:checked")).to_have_text("Todas as versões (4)")
    expect(facet.locator('option[value="olx-descriptions"]')).to_have_text("Descrições OLX (1)")
    assert facet.evaluate("element => new Set([...element.options].map(option => option.textContent)).size === element.options.length")
    page.wait_for_load_state("networkidle")
    requests = []
    listener = lambda request: requests.append(request.url)
    page.on("request", listener)
    facet.select_option(label="Não informada (1)")
    expect(page.locator("article.listing-card:visible")).to_have_count(1)
    expect(page.get_by_text("TESTE LOCAL · CELTA SEM VERSÃO", exact=True)).to_be_visible()
    facet.select_option("")
    expect(page.locator("article.listing-card:visible")).to_have_count(3)
    facet.select_option("olx-descriptions")
    description = page.get_by_role("combobox", name="Detalhar descrição OLX", exact=True)
    expect(description).to_be_visible()
    expect(page.locator("article.listing-card:visible")).to_have_count(1)
    description.select_option(index=1)
    expect(page.locator("article.listing-card:visible")).to_have_count(1)
    facet.select_option("")
    expect(description).to_have_count(0)
    page.wait_for_load_state("networkidle")
    page.remove_listener("request", listener)
    assert not requests, f"Changing the local facet issued HTTP requests: {requests}"
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), width
    page.screenshot(path=str(ARTIFACTS / f"{width}-restored.png"), full_page=True)
    field = page.get_by_role("combobox", name="Modelo", exact=True)
    field.fill("c")
    expect(page.get_by_role("option", name="Celta", exact=True)).to_have_count(1)
    expect(page.get_by_role("option", name="Camaro", exact=True)).to_have_count(1)
    expect(page.get_by_role("option", name="Celta 2P", exact=True)).to_have_count(0)
    expect(page.get_by_role("option", name="Camaro (2017)", exact=True)).to_have_count(0)
    page.get_by_role("option", name="Camaro", exact=True).click()
    expect(page.locator('[name="configuration"], [name="version"]')).to_have_count(0)
    with page.expect_response(lambda response: response.url == base + "/api/searches" and response.request.method == "POST") as saved:
        page.get_by_role("button", name="Salvar critérios sem consultar", exact=True).click()
    response = saved.value
    assert response.status == 201, response.text()
    criteria = response.request.post_data_json
    assert not criteria.get("version") and not criteria.get("doors") and not criteria.get("olxUrl"), criteria
    assert not any(key in criteria.get("catalog", {}) for key in ("versionCode", "versionName", "configurationCode", "configurationName")), criteria
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), width
    page.screenshot(path=str(ARTIFACTS / f"{width}-saved.png"), full_page=True)
    # Native snapshot brands absent from the technical fixture must also work.
    brand = page.get_by_role("combobox", name="Marca", exact=True)
    brand.fill("AUDI")
    page.get_by_role("option", name="AUDI", exact=True).click()
    field.fill("a3")
    expect(page.get_by_role("option", name="A3", exact=True)).to_have_count(1)
    expect(page.get_by_role("option", name="A3 Sportback", exact=True)).to_have_count(0)
    expect(page.get_by_role("option", name="A3 Spotback", exact=True)).to_have_count(0)
    field.fill("s3")
    expect(page.get_by_role("option", name="S3", exact=True)).to_have_count(1)
    expect(page.get_by_role("option", name="RS3", exact=True)).to_have_count(1)
    names = page.get_by_role("listbox", name="Modelo", exact=True).get_by_role("option").all_text_contents()
    assert len(names) == len(set(name.strip().casefold() for name in names)), names
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), width
    page.screenshot(path=str(ARTIFACTS / f"{width}-audi.png"), full_page=True)
    brand.fill("FORD")
    page.get_by_role("option", name="FORD", exact=True).click()
    field.fill("ka")
    expect(page.get_by_role("option", name=re.compile(r"^ka$", re.I))).to_have_count(1)
    expect(page.get_by_role("option", name=re.compile(r"^ka\s*\+$", re.I))).to_have_count(1)


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    errors, external, provider_attempts = [], [], []
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        base = f"http://127.0.0.1:{sock.getsockname()[1]}"
    with tempfile.TemporaryDirectory(prefix="commercial-ui-") as temporary, (ARTIFACTS / "server.log").open("w") as log:
        db_path = Path(temporary) / "test.db"
        seed(db_path)
        process = start_server(db_path, base, log)
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
                for width in (1440, 390):
                    context = browser.new_context(viewport=dict(width=width, height=900), is_mobile=width == 390, has_touch=width == 390)
                    def offline(route):
                        request = route.request
                        parsed = urlparse(request.url)
                        if parsed.netloc != urlparse(base).netloc:
                            external.append(request.url)
                            return route.abort()
                        if "/run" in parsed.path or parsed.path == "/api/radars/tick":
                            provider_attempts.append(request.url)
                            return route.abort()
                        if parsed.path == "/api/search-options" and parse_qs(parsed.query).get("type") == ["cities"]:
                            return route.fulfill(json=[])
                        route.continue_()
                    context.route("**/*", offline)
                    page = context.new_page()
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    check(page, base, width)
                    context.close()
                browser.close()
            assert not errors, errors
            assert not external, external
            assert not provider_attempts, provider_attempts
            with sqlite3.connect(db_path) as db:
                assert db.execute("SELECT count(*) FROM ProviderSpend").fetchone()[0] == 0
                assert db.execute("SELECT count(*) FROM SearchRun").fetchone()[0] == 1
                assert db.execute("SELECT count(*) FROM SavedSearch").fetchone()[0] == 2
            report = dict(status="passed", completed_at=timestamp(), viewports=[1440, 390],
                          checks=["legacy Celta 2P restored as the complete Celta model", "known source labels reclassified from history",
                                  "one commercial model per option", "no collection version or configuration inputs",
                                  "local version facet with counts and unknown values", "changing version sends zero HTTP requests",
                                  "saved request excludes version/configuration restrictions", "native Audi A3 unique and S3/RS3 separate",
                                  "native Ford KA and KA + remain separate",
                                  "no horizontal overflow or JavaScript errors"],
                          javascript_errors=errors, external_requests=external, provider_attempts=provider_attempts)
            (ARTIFACTS / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
            print(json.dumps(report, ensure_ascii=False, indent=2))
        finally:
            stop_server(process)


if __name__ == "__main__":
    main()
