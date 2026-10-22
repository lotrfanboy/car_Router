"""Production UI regression using an isolated SQLite DB and offline catalogs/media.

Run after `npm run build`: python scripts/browser_search_media_radar.py
No provider calls or e-mails are made. This proves persistence and rendering of
fixture media, not delivery of photos or model names by a live provider.
"""

import base64
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
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse
import urllib.request

from playwright.sync_api import expect, sync_playwright


REPO = Path(__file__).resolve().parents[1]
ARTIFACTS = REPO / "test-results" / "search-media-radar"
BASE = "http://127.0.0.1:3159"
TITLE = "TESTE ISOLADO · Toyota Corolla XEi"
MEDIA = "https://media.example.test/fixture.png"
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH1kAAAAASUVORK5CYII="
)
LEGACY_URL = "https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/estado-pr/curitiba-e-regiao?q=Toyota+Corolla"


def timestamp(offset=0):
    return (datetime.now(timezone.utc) + timedelta(seconds=offset)).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class CheckResults(list):
    def append(self, item):
        super().append(item)
        print("PASS: " + item, flush=True)


def seed(db_path):
    now = timestamp(-120)
    criteria = dict(name="TESTE ISOLADO · Corolla", brand="Toyota", model="Corolla",
                    version="XEi", city="Curitiba", state="PR", yearMin=2021,
                    yearMax=2021, priceMax=110000, mileageMax=70000,
                    privateOnly=False, sources=["olx"], olxUrl="")
    with sqlite3.connect(db_path) as db:
        for migration in sorted((REPO / "prisma" / "migrations").glob("*/migration.sql")):
            db.executescript(migration.read_text())
        rows = []
        for i in range(7):
            row = dict(source="olx", externalId=str(i),
                       url=f"https://pr.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/test-only-{i}",
                       title=TITLE, brand="Toyota", model="Corolla", version="XEi",
                       versionOrigin="explicit", modelYear=2021, mileage=50000 + i * 10,
                       city="Curitiba", state="PR", priceCents=10000000 if i == 0 else 13000000,
                       sellerType="private", observedAt=now,
                       reasons=[] if i == 0 else ["Preço fora do limite ou desconhecido"],
                       imageUrl=MEDIA if i == 0 else "https://media.example.test/missing.png" if i == 1 else None)
            rows.append(row)
            db.execute("INSERT INTO DiscoveredListing(id,source,externalId,payload,firstSeen,lastSeen) VALUES (?,?,?,?,?,?)",
                       (f"listing-{i}", "olx", str(i), json.dumps(row), now, now))
            db.execute("INSERT INTO ListingPrice(listingId,priceCents,observedAt) VALUES (?,?,?)",
                       (f"listing-{i}", row["priceCents"], now))
        db.execute("INSERT INTO SavedSearch(id,name,criteria,createdAt) VALUES (?,?,?,?)",
                   ("test-search", criteria["name"], json.dumps(criteria), now))
        result = dict(sources=[dict(source="olx", status="ok", message="Fixture offline",
                                   observedAt=now, elapsedMs=1, creditsReserved=0,
                                   total=7, partial=False, listings=rows)])
        db.execute("INSERT INTO SearchRun(id,searchId,createdAt,result) VALUES (?,?,?,?)",
                   ("test-run", "test-search", now, json.dumps(result)))
        scenarios = {
            "test-failure": ({**criteria, "priceMax": 109000}, result),
            "test-legacy": ({**criteria, "olxUrl": LEGACY_URL}, result),
            "test-empty": ({**criteria, "priceMax": 90000}, {"sources": [{**result["sources"][0], "listings": [], "partial": True}]}),
            "test-unavailable": ({**criteria, "priceMax": 80000}, {"sources": [{**result["sources"][0], "listings": [], "status": "unconfigured"}]}),
            "test-partial": ({**criteria, "sources": ["olx", "webmotors"]}, {"sources": [
                {**result["sources"][0], "partial": True},
                {**result["sources"][0], "source": "webmotors", "status": "error", "listings": []},
            ]}),
            "test-total-history": ({**criteria, "sources": ["olx", "webmotors"], "priceMax": 107000}, {"sources": [
                {**result["sources"][0], "status": "error", "listings": []},
                {**result["sources"][0], "source": "webmotors", "status": "error", "listings": []},
            ]}),
            "test-interrupted-history": ({**criteria, "sources": ["olx", "webmotors"], "priceMax": 106000}, {"sources": [], "interrupted": True}),
        }
        for search_id, (search_criteria, search_result) in scenarios.items():
            search_criteria = {**search_criteria, "name": "TESTE ISOLADO · " + search_id}
            db.execute("INSERT INTO SavedSearch(id,name,criteria,createdAt) VALUES (?,?,?,?)",
                       (search_id, search_criteria["name"], json.dumps(search_criteria), now))
            db.execute("INSERT INTO SearchRun(id,searchId,createdAt,result) VALUES (?,?,?,?)",
                       (search_id + "-run", search_id, now, json.dumps(search_result)))
        prior_webmotors = {**rows[0], "source": "webmotors", "externalId": "prior-webmotors", "imageUrl": None,
                          "title": "TESTE ISOLADO · Webmotors anterior", "observedAt": timestamp(-240),
                          "url": "https://www.webmotors.com.br/comprar/toyota/corolla/test-only"}
        prior_source = {**result["sources"][0], "source": "webmotors", "listings": [prior_webmotors], "observedAt": timestamp(-240)}
        db.execute("INSERT INTO SearchRun(id,searchId,createdAt,result) VALUES (?,?,?,?)",
                   ("partial-prior-webmotors", "test-partial", timestamp(-240), json.dumps({"sources": [prior_source]})))
        db.execute("INSERT INTO SearchRun(id,searchId,createdAt,result) VALUES (?,?,?,?)",
                   ("partial-interim-olx", "test-partial", timestamp(-180), json.dumps(result)))
        first_olx = {**rows[0], "externalId": "history-olx-first", "title": "TESTE ISOLADO · OLX rodada 1", "observedAt": timestamp(-240)}
        second_olx = {**rows[0], "externalId": "history-olx-second", "title": "TESTE ISOLADO · OLX rodada 2", "observedAt": timestamp(-180)}
        first_wm = {**prior_webmotors, "externalId": "history-wm-first", "title": "TESTE ISOLADO · Webmotors rodada 1"}
        first_run = {"sources": [
            {**result["sources"][0], "listings": [first_olx], "observedAt": timestamp(-240)},
            {**prior_source, "listings": [first_wm]},
        ]}
        second_run = {"sources": [
            {**result["sources"][0], "listings": [second_olx], "observedAt": timestamp(-180)},
            {**prior_source, "status": "error", "listings": [], "observedAt": timestamp(-180)},
        ]}
        for search_id in ("test-total-history", "test-interrupted-history"):
            for run_id, age, source_result in (("history-both-ok", -240, first_run), ("history-olx-ok-wm-error", -180, second_run)):
                db.execute("INSERT INTO SearchRun(id,searchId,createdAt,result) VALUES (?,?,?,?)",
                           (search_id + run_id, search_id, timestamp(age), json.dumps(source_result)))
    return rows


def start_server(db_path, log):
    env = {**os.environ, "DATABASE_URL": "file:" + str(db_path), "GECKO_API_KEY": " ",
           "REEF_API_KEY": " ", "REEF_FREE_TRIAL": "false", "RADAR_SCHEDULER_ENABLED": "false",
           "RESEND_API_KEY": " ", "RADAR_CRON_SECRET": " ",
           "VEHICLE_CATALOG_PATH": str(REPO / "tests/fixtures/vehicle-catalog.json")}
    process = subprocess.Popen(["node", "node_modules/next/dist/bin/next", "start", "--hostname",
                                "127.0.0.1", "--port", str(urlparse(BASE).port)], cwd=REPO, env=env,
                               stdout=log, stderr=log)
    for _ in range(100):
        try:
            if urllib.request.urlopen(BASE + "/buscar", timeout=1).status == 200:
                return process
        except Exception:
            if process.poll() is not None:
                raise RuntimeError("Server exited; inspect test-results/search-media-radar/server.log")
            time.sleep(.2)
    stop_server(process)
    raise RuntimeError("Server did not start")


def stop_server(process):
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


class OfflineCatalog:
    def __init__(self):
        self.hold_model = False
        self.hold_city = False
        self.pending_models = []
        self.pending_cities = []
        self.fail_brands = False
        self.requests = []

    def route(self, route):
        query = parse_qs(urlparse(route.request.url).query)
        kind = query.get("type", [""])[0]
        self.requests.append((kind, query))
        if kind == "brands" and self.fail_brands:
            return route.fulfill(status=503, json={"error": "Fixture unavailable"})
        if kind == "models" and query.get("brand") == ["wm:brand:35"] and self.hold_model:
            self.pending_models.append(route)
            return
        if kind == "cities":
            if query.get("state") == ["SP"] and self.hold_city:
                self.pending_cities.append(route)
                return
            names = {"PR": ["Curitiba", "Londrina"], "SP": ["São Paulo", "Campinas"], "SC": ["Florianópolis"]}
            rows = [{"code": str(i + 1), "name": name} for i, name in enumerate(names.get(query.get("state", ["PR"])[0], []))]
            return route.fulfill(json=rows)
        # The production route reads the test-only catalog on the isolated server.
        # Only keyboard stress-test entries are added here, never saved as data.
        response = route.fetch()
        rows = response.json()
        if kind == "brands" and response.ok:
            rows += [{"code": str(100 + i), "name": f"Marca fixture {i:02}"} for i in range(25)]
        route.fulfill(response=response, json=rows)


class OfflineSearch:
    """Only the paid execution boundary is simulated; persistence stays real."""

    def __init__(self, db_path, rows):
        self.db_path = db_path
        self.rows = rows
        self.available = False
        self.mode = "source_error"
        self.defer = False
        self.pending = []
        self.requests = []
        self.saved_payloads = []

    def searches(self, route):
        if route.request.method == "POST":
            self.saved_payloads.append(route.request.post_data_json)
            return route.continue_()
        response = route.fetch()
        data = response.json()
        if self.available:
            for integration in data["integrations"]:
                integration["configured"] = integration["source"] == "olx"
        return route.fulfill(response=response, json=data)

    def run(self, route):
        if self.defer:
            self.pending.append(route)
            return
        self.requests.append(route.request.url)
        if self.mode == "http_error":
            return route.fulfill(status=503, json={"error": "Falha HTTP controlada no teste."})
        if not self.available:
            return route.fulfill(status=409, json={"error": "Nenhuma fonte selecionada está configurada."})
        source = dict(source="olx", status="error" if self.mode == "source_error" else "ok",
                      message="Falha da fonte controlada no teste." if self.mode == "source_error" else "Consulta isolada de teste.",
                      observedAt=timestamp(), elapsedMs=1, creditsReserved=0, total=0 if self.mode == "empty" else 7, partial=self.mode != "empty",
                      received=0 if self.mode in ("source_error", "empty") else len(self.rows),
                      listings=[] if self.mode in ("source_error", "empty") else copy.deepcopy(self.rows))
        result = {"sources": [source]}
        search_id = urlparse(route.request.url).path.split("/")[3]
        run_id = "fixture-run-" + str(len(self.requests))
        now = timestamp()
        with sqlite3.connect(self.db_path) as db:
            db.execute("INSERT INTO SearchRun(id,searchId,createdAt,result) VALUES (?,?,?,?)",
                       (run_id, search_id, now, json.dumps(result)))
        return route.fulfill(json={**result, "id": run_id, "createdAt": now})


def setup_context(browser, catalog, errors, searches=None, **options):
    context = browser.new_context(**options)
    # All browser requests stay local except the explicit fixture below.
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(BASE) else route.abort())
    context.route("**/api/search-options?*", catalog.route)
    context.route(MEDIA, lambda route: route.fulfill(content_type="image/png", body=PNG))
    context.route("https://media.example.test/missing.png", lambda route: route.fulfill(status=404))
    if searches:
        context.route("**/api/searches", searches.searches)
        context.route("**/api/searches/*/run", searches.run)
    context.on("page", lambda page: page.on("pageerror", lambda error: errors.append(str(error))))
    return context


def loaded_photo(page):
    image = page.locator(f'img[src="{MEDIA}"]')
    image.scroll_into_view_if_needed()
    expect(image).to_be_visible()
    expect(image).to_have_js_property("complete", True)
    assert image.evaluate("image => image.naturalWidth") > 0


def choose(page, control, label, query=None):
    control.fill("")
    control.fill(query if query is not None else label)
    expect(page.get_by_role("option", name=label, exact=True)).to_be_visible()
    control.press("ArrowDown")
    control.press("Enter")


def manual_text(page, control, value):
    control.fill(value)
    if control.get_attribute("name") == "city":
        control.press("Escape")
    else:
        page.get_by_role("button", name=re.compile("^Usar texto digitado em ")).click()


def catalog_checks(page, catalog, searches):
    page.goto(BASE + "/buscar")
    expect(page.get_by_role("button", name="Buscar agora", exact=True)).to_be_enabled()
    brand = page.get_by_role("combobox", name="Marca", exact=True)
    model = page.get_by_role("combobox", name="Modelo", exact=True)
    city = page.get_by_role("combobox", name="Adicionar cidade", exact=True)
    year_min = page.get_by_role("textbox", name="Ano-modelo de", exact=True)
    year_max = page.get_by_role("textbox", name="Ano-modelo até", exact=True)
    save = page.get_by_role("button", name="Salvar critérios sem consultar", exact=True)
    run_requests = len(searches.requests)
    model_requests = sum(kind == "models" for kind, _ in catalog.requests)
    brand.fill("to")
    assert sum(kind == "models" for kind, _ in catalog.requests) == model_requests
    choose(page, brand, "Toyota")
    choose(page, model, "Corolla")
    versions = page.get_by_role("combobox", name=re.compile("^Versão"))
    expect(versions).to_have_value("")
    expect(versions.locator("option")).to_have_count(2)
    assert len(searches.requests) == run_requests
    version_id = versions.locator("option").nth(1).get_attribute("value")
    versions.select_option(version_id)
    # Years do not query or prune the catalogue, even outside this car's existence.
    request_count = len(catalog.requests)
    year_min.fill("1901")
    year_max.fill("2099")
    expect(versions).to_have_value(version_id)
    assert len(catalog.requests) == request_count
    choose(page, city, "Curitiba")
    choose(page, city, "Londrina")
    expect(page.get_by_role("button", name="Remover Curitiba", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="Remover Londrina", exact=True)).to_be_visible()
    save.click()
    expect(page.get_by_role("status").filter(has_text="Critérios salvos. Nenhuma consulta realizada.")).to_be_visible()
    saved = searches.saved_payloads[-1]
    assert saved["catalog"]["brandCode"] == "wm:brand:35"
    assert saved["catalog"]["modelCode"] == "wm:model:1"
    assert saved["catalog"]["versionCode"] == version_id
    assert saved["cities"] == ["Curitiba", "Londrina"] and saved["locationMode"] == "cities"
    assert saved["yearMin"] == 1901 and saved["yearMax"] == 2099
    selected = page.get_by_role("combobox", name="Retomar uma busca", exact=True)
    expect(selected).not_to_have_value("")
    expect(save).to_be_enabled()
    saved_id = selected.input_value()
    assert saved_id
    page.goto(BASE + "/buscar?busca=" + saved_id)
    expect(versions).to_have_value(version_id)
    expect(year_min).to_have_value("1901")
    expect(year_max).to_have_value("2099")
    expect(page.get_by_role("button", name="Remover Londrina", exact=True)).to_be_visible()
    page.get_by_role("button", name="Remover Curitiba", exact=True).click()
    save.click()
    expect(page.get_by_role("status").filter(has_text="Critérios salvos. Nenhuma consulta realizada.")).to_be_visible()
    assert searches.saved_payloads[-1]["cities"] == ["Londrina"]
    page.locator('select[name="state"]:visible').select_option("SP")
    expect(page.locator(".city-chips:visible button")).to_have_count(0)
    save.click()
    expect(page.get_by_role("status").filter(has_text="Critérios salvos. Nenhuma consulta realizada.")).to_be_visible()
    assert searches.saved_payloads[-1]["cities"] == [] and searches.saved_payloads[-1]["city"] == ""
    assert searches.saved_payloads[-1]["locationMode"] == "state"
    expect(selected).not_to_have_value("")
    expect(save).to_be_enabled()
    whole_state_id = selected.input_value()
    page.goto(BASE + "/buscar?busca=" + whole_state_id)
    expect(page.locator(".city-chips:visible")).to_contain_text("todo o estado de SP")
    expect(page.get_by_role("radio")).to_have_count(0)
    # Both invalid format and reversed interval reject without silently adjusting.
    before_saves = len(searches.saved_payloads)
    year_min.fill("20x0")
    save.click()
    expect(page.locator(".error-box[role=alert]:visible")).to_contain_text("quatro dígitos")
    expect(year_min).to_have_value("20x0")
    year_min.fill("2025")
    year_max.fill("2020")
    save.click()
    expect(page.locator(".error-box[role=alert]:visible")).to_contain_text("intervalo dos anos")
    expect(year_min).to_have_value("2025")
    expect(year_max).to_have_value("2020")
    assert len(searches.saved_payloads) == before_saves
    year_min.fill("")
    year_max.fill("")
    # Same hierarchy mechanics across four brands; similar names remain separate.
    for brand_name, model_name, sibling in [("Toyota", "Corolla", "Corolla Cross"), ("Honda", "Civic", "Civic Type R"), ("Volkswagen", "Golf", "Golf Variant"), ("Mercedes-Benz", "C180", "C180 Coupé")]:
        choose(page, brand, brand_name)
        expect(model).to_have_value("")
        expect(page.locator('[name="version"]:visible')).to_have_value("")
        choose(page, model, model_name)
        expect(versions).to_have_value("")
        expect(versions.locator("option")).to_have_count(2)
        versions.select_option(index=1)
        old_version = versions.input_value()
        choose(page, model, sibling)
        expect(versions).to_have_value("")
        expect(versions.locator("option")).to_have_count(2)
        assert versions.locator("option").nth(1).get_attribute("value") != old_version
    assert len(searches.requests) == run_requests
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "desktop overflow"
    for selector in ('select[name="state"]:visible', 'input[name="city"]:visible', 'input[name="yearMin"]:visible'):
        box = page.locator(selector).bounding_box()
        assert 32 <= box["height"] <= 56, (selector, box)
    page.screenshot(path=str(ARTIFACTS / "11-search-filters-desktop.png"), full_page=True)
    assert not any(kind == "years" for kind, _ in catalog.requests)
    # Incomplete city text cannot silently turn into an all-state search.
    city.fill("São")
    city.press("Escape")
    save.click()
    expect(page.locator(".error-box[role=alert]:visible")).to_contain_text("Selecione a cidade")
    city.fill("")
    # Resolve an older request after a newer one; only the new parent may render.
    page.goto(BASE + "/buscar")
    catalog.hold_model = True
    choose(page, brand, "Toyota")
    model.click()
    expect(page.get_by_text("Carregando opções…", exact=True)).to_be_visible()
    assert catalog.pending_models
    choose(page, brand, "Honda")
    model.click()
    expect(page.get_by_role("option", name="Civic", exact=True)).to_be_visible()
    for route in catalog.pending_models:
        route.fulfill(json=[{"code": "old", "name": "RESPOSTA ANTIGA TOYOTA"}])
    catalog.hold_model = False
    expect(page.get_by_role("option", name="RESPOSTA ANTIGA TOYOTA")).to_have_count(0)
    catalog.hold_city = True
    page.locator('select[name="state"]:visible').select_option("SP")
    city.click()
    expect(page.get_by_text("Carregando opções…", exact=True)).to_be_visible()
    assert catalog.pending_cities
    page.locator('select[name="state"]:visible').select_option("SC")
    city.click()
    expect(page.get_by_role("option", name="Florianópolis", exact=True)).to_be_visible()
    for route in catalog.pending_cities:
        route.fulfill(json=[{"code": "old", "name": "RESPOSTA ANTIGA SP"}])
    catalog.hold_city = False
    expect(page.get_by_role("option", name="RESPOSTA ANTIGA SP")).to_have_count(0)
    # Explicit temporary manual fallback never acquires a fabricated ID.
    catalog.fail_brands = True
    page.goto(BASE + "/buscar")
    brand.click()
    expect(page.get_by_text("Catálogo indisponível. Digite e confirme a entrada manual.", exact=False)).to_be_visible()
    manual_text(page, brand, "Marca manual")
    manual_text(page, model, "Modelo manual")
    page.locator('input[name="version"]:visible').fill("Versão manual")
    expect(page.get_by_text("Entrada manual confirmada, temporária", exact=False)).to_be_visible()
    save.click()
    expect(page.get_by_role("status").filter(has_text="Critérios salvos. Nenhuma consulta realizada.")).to_be_visible()
    assert not searches.saved_payloads[-1].get("catalog")
    assert len(searches.requests) == run_requests
    catalog.fail_brands = False


def long_keyboard_list(page):
    expect(page.get_by_role("button", name="Buscar agora", exact=True)).to_be_enabled()
    brand = page.get_by_role("combobox", name="Marca", exact=True)
    brand.fill("")
    brand.fill("Marca fixture")
    expect(page.get_by_role("listbox", name="Marca", exact=True).get_by_role("option")).to_have_count(25)
    scroll_y = page.evaluate("window.scrollY")
    for _ in range(22):
        brand.press("ArrowDown")
    active_id = brand.get_attribute("aria-activedescendant")
    expect(page.locator(f'[id="{active_id}"]')).to_contain_text("Marca fixture 21")
    assert brand.evaluate("""input => {
      const option = document.getElementById(input.getAttribute('aria-activedescendant'));
      const parent = option.closest('.search-combobox-popup');
      const a = option.getBoundingClientRect(), b = parent.getBoundingClientRect();
      return a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
    }"""), "active keyboard option is outside the scroll popup"
    assert page.evaluate("window.scrollY") == scroll_y, "arrow navigation moved the page"
    for _ in range(20):
        brand.press("ArrowUp")
    active_id = brand.get_attribute("aria-activedescendant")
    expect(page.locator(f'[id="{active_id}"]')).to_contain_text("Marca fixture 01")
    assert brand.evaluate("""input => {
      const option = document.getElementById(input.getAttribute('aria-activedescendant'));
      const parent = option.closest('.search-combobox-popup');
      const a = option.getBoundingClientRect(), b = parent.getBoundingClientRect();
      return a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
    }"""), "upward keyboard selection is outside the scroll popup"


def search_failure_checks(page, searches):
    searches.available = True
    page.goto(BASE + "/buscar?busca=test-failure")
    expect(page.get_by_role("heading", name="1 candidato", exact=True)).to_be_visible()
    budget = page.get_by_role("spinbutton", name="Orçamento máximo (R$)", exact=True)
    budget.fill("108000")
    expect(page.get_by_role("status").filter(has_text="Os filtros foram alterados")).to_be_visible()
    expect(page.get_by_text("Critérios aplicados:", exact=False)).to_contain_text("109000")
    searches.mode, searches.defer = "http_error", True
    page.get_by_role("button", name="Buscar agora", exact=True).click()
    expect(page.locator(".discovery-results:visible")).to_have_attribute("aria-busy", "true")
    expect(page.locator(".listing-card:visible")).to_have_count(1)
    page.screenshot(path=str(ARTIFACTS / "06-search-loading.png"), full_page=True)
    assert len(searches.pending) == 1
    searches.defer = False
    searches.run(searches.pending.pop())
    expect(page.get_by_role("alert").filter(has_text="Falha HTTP controlada")).to_be_visible()
    expect(budget).to_have_value("108000")
    expect(page.locator(".listing-card:visible")).to_have_count(1)
    page.screenshot(path=str(ARTIFACTS / "07-search-http-error.png"), full_page=True)

    searches.mode = "source_error"
    page.goto(BASE + "/buscar?busca=test-failure")
    expect(page.get_by_role("heading", name="1 candidato", exact=True)).to_be_visible()
    page.get_by_role("button", name="Buscar agora", exact=True).click()
    expect(page.locator(".source-results summary").filter(has_text=re.compile("Falh|falh"))).to_be_visible()
    expect(page.locator(".listing-card:visible")).to_have_count(1)
    page.reload()
    expect(page.locator(".listing-card:visible")).to_have_count(1)
    expect(page.get_by_text(re.compile("resultados anteriores", re.I)).first).to_be_visible()

    page.goto(BASE + "/buscar?busca=test-partial")
    expect(page.get_by_role("heading", name="1 candidato", exact=True)).to_be_visible()
    expect(page.locator(".listing-card:visible")).to_have_count(1)
    previous = page.locator(".previous-results:visible")
    expect(previous.locator("summary")).to_contain_text("Webmotors")
    previous.locator("summary").click()
    expect(page.get_by_text("TESTE ISOLADO · Webmotors anterior", exact=True)).to_be_visible()
    expect(page.locator(".listing-card:visible")).to_have_count(2)
    expect(page.get_by_role("heading", name="1 candidato", exact=True)).to_be_visible()
    page.screenshot(path=str(ARTIFACTS / "08-search-partial-history.png"), full_page=True)

    # Each source retains its own most recent success when a later total failure
    # or interruption follows a partial failure. OLX must come from run 2, while
    # Webmotors comes from run 1 in a separate group, never from a merged fake run.
    for search_id, screenshot_name in (("test-total-history", "09-search-total-history.png"), ("test-interrupted-history", "10-search-interrupted-history.png")):
        page.goto(BASE + "/buscar?busca=" + search_id)
        expect(page.get_by_text("TESTE ISOLADO · OLX rodada 2", exact=True)).to_be_visible()
        page.reload()
        expect(page.get_by_text("TESTE ISOLADO · OLX rodada 2", exact=True)).to_be_visible()
        expect(page.get_by_text("TESTE ISOLADO · OLX rodada 1", exact=True)).to_have_count(0)
        expect(page.locator(".listing-card:visible")).to_have_count(1)
        expect(page.get_by_role("heading", name="1 candidato", exact=True)).to_be_visible()
        previous = page.locator(".previous-results:visible")
        expect(previous).to_have_count(1)
        expect(previous.locator("summary")).to_contain_text("Webmotors")
        previous.locator("summary").click()
        expect(page.get_by_text("TESTE ISOLADO · Webmotors rodada 1", exact=True)).to_be_visible()
        expect(page.locator(".listing-card:visible")).to_have_count(2)
        expect(page.get_by_role("heading", name="1 candidato", exact=True)).to_be_visible()
        if search_id == "test-interrupted-history":
            expect(page.get_by_role("alert").filter(has_text="Consulta interrompida")).to_be_visible()
        page.screenshot(path=str(ARTIFACTS / screenshot_name), full_page=True)

    page.goto(BASE + "/buscar?busca=test-empty")
    expect(page.get_by_text("Nenhum candidato neste recorte", exact=True)).to_be_visible()
    expect(page.locator(".listing-card:visible")).to_have_count(0)
    expect(page.locator('option[value="discount"]')).to_have_count(0)
    page.goto(BASE + "/buscar?busca=test-unavailable")
    expect(page.get_by_text("Busca indisponível", exact=True)).to_be_visible()
    searches.available = False


def empty_search_checks(page, searches):
    searches.available, searches.mode = True, "empty"
    page.goto(BASE + "/buscar")
    choose(page, page.get_by_role("combobox", name="Marca", exact=True), "Toyota")
    choose(page, page.get_by_role("combobox", name="Modelo", exact=True), "Corolla")
    expect(page.get_by_role("combobox", name=re.compile("^Versão"))).to_have_value("")
    page.get_by_role("textbox", name="Ano-modelo de", exact=True).fill("1901")
    page.get_by_role("textbox", name="Ano-modelo até", exact=True).fill("1901")
    before = len(searches.requests)
    page.get_by_role("button", name="Buscar agora", exact=True).click()
    expect(page.get_by_role("heading", name="Nenhum candidato neste recorte", exact=True)).to_be_visible()
    assert len(searches.requests) == before + 1
    assert searches.saved_payloads[-1]["yearMin"] == searches.saved_payloads[-1]["yearMax"] == 1901
    expect(page.get_by_text("Critérios aplicados:", exact=False)).to_contain_text("Todas as versões")
    summary = page.locator(".source-results:visible summary")
    expect(summary).to_contain_text("Consultada")
    summary.click()
    expect(page.locator(".source-results:visible")).to_contain_text("0 recebidos · 0 aprovados · 0 descartados")
    expect(page.locator(".error-box:visible")).to_have_count(0)
    page.screenshot(path=str(ARTIFACTS / "12-search-empty-desktop.png"), full_page=True)
    searches.available = False


def legacy_url_checks(page, searches):
    before = len(searches.requests)
    page.goto(BASE + "/buscar?busca=test-legacy")
    expect(page.get_by_role("heading", name="1 candidato", exact=True)).to_be_visible()
    page.get_by_role("button", name="Salvar critérios sem consultar", exact=True).click()
    expect(page.get_by_role("status").filter(has_text="Critérios salvos. Nenhuma consulta realizada.")).to_be_visible()
    assert searches.saved_payloads[-1]["olxUrl"] == LEGACY_URL
    for changed in ("city", "yearMin", "model", "brand"):
        page.goto(BASE + "/buscar?busca=test-legacy")
        expect(page.get_by_role("heading", name="1 candidato", exact=True)).to_be_visible()
        if changed == "city":
            page.locator('select[name="state"]:visible').select_option("SP")
            choose(page, page.get_by_role("combobox", name="Adicionar cidade", exact=True), "São Paulo")
        elif changed == "yearMin":
            page.get_by_role("textbox", name="Ano-modelo de", exact=True).fill("2020")
        elif changed == "model":
            manual_text(page, page.get_by_role("combobox", name="Modelo", exact=True), "Yaris")
        else:
            choose(page, page.get_by_role("combobox", name="Marca", exact=True), "Honda")
            choose(page, page.get_by_role("combobox", name="Modelo", exact=True), "Civic")
        page.get_by_role("button", name="Salvar critérios sem consultar", exact=True).click()
        expect(page.get_by_role("status").filter(has_text="Critérios salvos. Nenhuma consulta realizada.")).to_be_visible()
        assert searches.saved_payloads[-1]["olxUrl"] == "", changed
    assert len(searches.requests) == before


def main():
    global BASE
    build_id = (REPO / ".next" / "BUILD_ID").read_text().strip()
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    (ARTIFACTS / "report.json").unlink(missing_ok=True)
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        BASE = f"http://127.0.0.1:{sock.getsockname()[1]}"
    with tempfile.TemporaryDirectory(prefix="car-router-search-ui-") as folder, open(ARTIFACTS / "server.log", "w") as log:
        db_path = Path(folder) / "test.db"
        rows = seed(db_path)
        process = start_server(db_path, log)
        errors = []
        checks = CheckResults()
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
                catalog = OfflineCatalog()
                searches = OfflineSearch(db_path, rows)
                context = setup_context(browser, catalog, errors, searches, viewport={"width": 1440, "height": 1000})
                page = context.new_page()
                page.goto(BASE + "/buscar?busca=test-search")
                expect(page.get_by_role("heading", name="1 candidato", exact=True)).to_be_visible()
                expect(page.get_by_text("23,1% abaixo da média", exact=True)).to_be_visible()
                loaded_photo(page)
                page.locator(".source-results:visible summary").click()
                expect(page.locator(".source-results:visible")).to_contain_text("7 recebidos · 1 aprovados · 6 descartados")
                expect(page.get_by_role("list", name="Descartes por motivo")).to_contain_text("Preço fora do limite ou desconhecido: 6")
                page.locator(".source-results:visible summary").click()
                page.get_by_role("button", name="Salvar", exact=True).click()
                expect(page.get_by_role("button", name="Salvo", exact=True)).to_be_visible()
                page.get_by_role("link", name="Conferir semelhantes", exact=True).click()
                expect(page.get_by_role("heading", name="6 anúncios na referência", exact=True)).to_be_visible()
                loaded_photo(page)
                page.get_by_role("button", name="Ver preços observados", exact=True).click()
                expect(page.get_by_role("heading", name="Histórico de preços", exact=True).locator("..").locator("li")).to_have_count(1)
                page.reload()
                loaded_photo(page)
                expect(page.get_by_role("button", name="Salvo", exact=True)).to_be_visible()
                page.get_by_role("link", name="← Voltar aos resultados", exact=True).click()
                expect(page.get_by_role("heading", name="1 candidato", exact=True)).to_be_visible()
                checks.append("saved photo and back navigation survive real API persistence/reload")

                # Save five via the real API to exercise limits with actual stored rows.
                for i in range(1, 5):
                    response = context.request.patch(BASE + f"/api/listings/olx/{i}", data={"saved": True})
                    assert response.ok
                page.goto(BASE + "/salvos")
                expect(page.get_by_role("checkbox", name="Comparar este anúncio")).to_have_count(5)
                charts = page.get_by_role("region", name="Gráficos dos anúncios salvos")
                expect(charts).to_contain_text("Amostra de 5 anúncios salvos; 5 com preço e 0 sem preço")
                expect(page.get_by_role("img", name="Foto indisponível para este anúncio")).to_have_count(4)
                loaded_photo(page)
                for checkbox in page.get_by_role("checkbox", name="Comparar este anúncio").all()[:4]:
                    checkbox.check()
                expect(page.get_by_role("checkbox", name="Comparar este anúncio").nth(4)).to_be_disabled()
                page.get_by_role("link", name="Comparar anúncios salvos", exact=True).click()
                expect(page.locator(".saved-compare-card")).to_have_count(4)
                expect(page.get_by_label("Adicionar anúncio à comparação")).to_be_disabled()
                page.reload()
                expect(page.locator(".saved-compare-card")).to_have_count(4)
                page.locator(".saved-compare-card h2 a").first.click()
                page.get_by_role("link", name="← Voltar à comparação", exact=True).click()
                expect(page.locator(".saved-compare-card")).to_have_count(4)
                page.get_by_role("button", name="Remover", exact=True).first.click()
                expect(page.locator(".saved-compare-card")).to_have_count(3)
                page.get_by_role("link", name="Voltar aos salvos", exact=True).click()
                expect(page.get_by_text("3/4 anúncios selecionados", exact=True)).to_be_visible()
                # Removing a saved item outside /salvos must not leave a phantom slot.
                chosen = page.get_by_role("checkbox", name="Comparar este anúncio").all()
                chosen_index = next(i for i, item in enumerate(chosen) if item.is_checked())
                chosen_path = page.locator(".listing-card h2 a").nth(chosen_index).get_attribute("href")
                page.goto(BASE + chosen_path)
                expect(page.get_by_role("link", name="← Voltar aos salvos", exact=True)).to_be_visible()
                page.get_by_role("button", name="Salvo", exact=True).click()
                expect(page.get_by_role("button", name="Salvar", exact=True)).to_be_visible()
                page.goto(BASE + "/comparar-anuncios")
                expect(page.locator(".saved-compare-card")).to_have_count(2)
                expect(page.get_by_label("Adicionar anúncio à comparação")).to_be_enabled()
                page.evaluate("localStorage.setItem('car-router-listing-comparison', JSON.stringify(['olx:stale1','olx:stale2','olx:stale3','olx:stale4']))")
                page.goto(BASE + "/salvos")
                expect(page.get_by_text("0/4 anúncios selecionados", exact=True)).to_be_visible()
                for checkbox in page.get_by_role("checkbox", name="Comparar este anúncio").all():
                    expect(checkbox).to_be_enabled()
                expect(page.get_by_role("region", name="Gráficos dos anúncios salvos")).to_contain_text("Amostra de 4 anúncios salvos")
                page.get_by_label("Relacionar com").select_option("mileage")
                expect(page.get_by_role("group", name="Preço por quilometragem", exact=True)).to_be_visible()
                page.screenshot(path=str(ARTIFACTS / "01-salvos-desktop.png"), full_page=True)
                checks.append("comparison limit, persistence, remove/back, stale IDs and saved-only charts")

                page.goto(BASE + "/anuncios/olx/0?busca=test-search")
                page.get_by_role("link", name="Criar alerta desta busca", exact=True).click()
                page.get_by_label("Nome do Radar").fill("TESTE ISOLADO · Meu Corolla")
                page.get_by_role("button", name="Salvar Radar", exact=True).click()
                expect(page.get_by_role("heading", name="TESTE ISOLADO · Meu Corolla", exact=True)).to_be_visible()
                expect(page.get_by_text("Configuração pendente", exact=True)).to_be_visible()
                page.reload()
                expect(page.get_by_text("Configuração pendente", exact=True)).to_be_visible()
                page.get_by_role("button", name="Pausar", exact=True).click()
                expect(page.get_by_text("Pausado", exact=True)).to_be_visible()
                page.get_by_role("button", name="Editar", exact=True).click()
                page.get_by_label("Nome do Radar").fill("TESTE ISOLADO · Editado")
                page.get_by_role("button", name="Salvar Radar", exact=True).click()
                expect(page.get_by_role("heading", name="TESTE ISOLADO · Editado", exact=True)).to_be_visible()
                page.get_by_role("button", name="Excluir", exact=True).click()
                page.get_by_role("button", name="Cancelar", exact=True).click()
                expect(page.get_by_role("heading", name="TESTE ISOLADO · Editado", exact=True)).to_be_visible()
                page.screenshot(path=str(ARTIFACTS / "02-radar-desktop.png"), full_page=True)
                checks.append("radar create/persist/pause/edit/cancel-delete and honest pending state")

                catalog_checks(page, catalog, searches)
                checks.append("real catalog route with fixture IDs across four brands, distinct similar models, versions optional, independent/invalid years, multi-city/state persistence, dependent clearing, out-of-order responses, temporary manual save")
                search_failure_checks(page, searches)
                checks.append("loading/HTTP/source failure preserve input and results; total failure/interruption after partial failure recover each source separately on reload; empty differs from unavailable")
                empty_search_checks(page, searches)
                checks.append("explicit Search accepts a nonexistent model/year combination; zero received is a successful result, criteria and totals shown")
                legacy_url_checks(page, searches)
                checks.append("untouched legacy OLX URL preserved; city/year/model/brand edits clear stale URL without provider calls")
                page.goto(BASE + "/buscar?busca=test-search")
                page.get_by_role("button", name="Buscar agora", exact=True).click()
                expect(page.get_by_role("alert").filter(has_text="Nenhuma fonte selecionada")).to_be_visible()
                expect(page.get_by_role("heading", name="1 candidato", exact=True)).to_be_visible()
                page.goto(BASE + "/buscar")
                page.keyboard.press("Tab")
                assert page.evaluate("document.activeElement.textContent").strip() == "Pular para o conteúdo"
                long_keyboard_list(page)
                page.evaluate("document.documentElement.style.zoom = '2'")
                long_keyboard_list(page)
                css_zoom_scroll_width = page.evaluate("document.documentElement.scrollWidth")
                page.evaluate("document.documentElement.style.zoom = '1'")
                # CSS zoom leaves media queries at 1440px. Browser zoom changes
                # the CSS viewport; separately exercise that reflow at 720px.
                zoom_context = setup_context(browser, OfflineCatalog(), errors,
                                             viewport={"width": 720, "height": 500}, device_scale_factor=2)
                zoom_page = zoom_context.new_page()
                zoom_page.goto(BASE + "/buscar")
                long_keyboard_list(zoom_page)
                zoom_page.get_by_role("combobox", name="Marca", exact=True).fill("to")
                expect(zoom_page.get_by_role("option", name="Toyota", exact=True)).to_be_visible()
                assert zoom_page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "720px reflow overflow"
                zoom_page.screenshot(path=str(ARTIFACTS / "03-busca-zoom-reflow.png"), full_page=True)
                zoom_context.close()
                checks.append("long-list keyboard scrolling at 100%/200% CSS zoom; 720px reflow at DPR2 and skip link")

                searches.available, searches.mode = True, "empty"
                mobile = setup_context(browser, OfflineCatalog(), errors, searches,
                                       viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
                touch = mobile.new_page()
                touch.goto(BASE + "/buscar")
                expect(touch.get_by_role("button", name="Buscar agora", exact=True)).to_be_enabled()
                touch.get_by_role("combobox", name="Marca", exact=True).tap()
                touch.get_by_role("combobox", name="Marca", exact=True).fill("to")
                touch.get_by_role("option", name="Toyota", exact=True).tap()
                expect(touch.get_by_role("combobox", name="Marca", exact=True)).to_have_value("Toyota")
                touch.get_by_role("combobox", name="Modelo", exact=True).tap()
                touch.get_by_role("option", name="Corolla", exact=True).tap()
                expect(touch.get_by_role("combobox", name="Modelo", exact=True)).to_have_value("Corolla")
                touch.get_by_role("textbox", name="Ano-modelo de", exact=True).fill("1901")
                touch.get_by_role("combobox", name=re.compile("^Versão")).select_option(index=1)
                touch.get_by_role("combobox", name="Adicionar cidade", exact=True).tap()
                touch.get_by_role("combobox", name="Adicionar cidade", exact=True).fill("Curitiba")
                touch.get_by_role("option", name="Curitiba", exact=True).tap()
                choose(touch, touch.get_by_role("combobox", name="Adicionar cidade", exact=True), "Londrina")
                touch.get_by_role("button", name="Remover Curitiba", exact=True).tap()
                expect(touch.get_by_role("button", name="Remover Londrina", exact=True)).to_be_visible()
                touch.locator(".advanced-filters > summary:visible").tap()
                mobile_budget = touch.get_by_role("spinbutton", name="Orçamento máximo (R$)", exact=True)
                mobile_budget.tap()
                mobile_budget.fill("110000")
                expect(mobile_budget).to_have_value("110000")
                assert touch.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "mobile search overflow"
                touch.evaluate("window.scrollTo(0,0)")
                touch.screenshot(path=str(ARTIFACTS / "04-busca-touch.png"), full_page=True)
                before_mobile = len(searches.requests)
                touch.get_by_role("button", name="Buscar agora", exact=True).tap()
                expect(touch.get_by_role("heading", name="Nenhum candidato neste recorte", exact=True)).to_be_visible()
                assert len(searches.requests) == before_mobile + 1
                expect(touch.get_by_role("combobox", name="Retomar uma busca", exact=True)).not_to_have_value("")
                mobile_id = touch.get_by_role("combobox", name="Retomar uma busca", exact=True).input_value()
                touch.goto(BASE + "/buscar?busca=" + mobile_id)
                expect(touch.get_by_role("textbox", name="Ano-modelo de", exact=True)).to_have_value("1901")
                expect(touch.get_by_role("button", name="Remover Londrina", exact=True)).to_be_visible()
                expect(touch.get_by_role("heading", name="Nenhum candidato neste recorte", exact=True)).to_be_visible()
                searches.available = False
                touch.goto(BASE + "/salvos")
                expect(touch.get_by_role("checkbox", name="Comparar este anúncio")).to_have_count(4)
                assert touch.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "mobile saved overflow"
                touch.screenshot(path=str(ARTIFACTS / "05-salvos-touch.png"), full_page=True)
                checks.append("390px touch brand/model/version/city chips/budget, explicit Search and saved query restoration, sticky actions and mobile search/saved layout")

                stop_server(process)
                process = start_server(db_path, log)
                page.goto(BASE + "/anuncios/olx/0")
                loaded_photo(page)
                expect(page.get_by_role("button", name="Salvo", exact=True)).to_be_visible()
                page.goto(BASE + "/salvos")
                expect(page.get_by_role("checkbox", name="Comparar este anúncio")).to_have_count(4)
                page.goto(BASE + "/radares")
                expect(page.get_by_role("heading", name="TESTE ISOLADO · Editado", exact=True)).to_be_visible()
                checks.append("saved media/listings/radar survive a real server restart")
                page.get_by_role("button", name="Excluir", exact=True).click()
                page.get_by_role("button", name="Confirmar exclusão", exact=True).click()
                expect(page.get_by_text("Radar excluído. Busca e anúncios preservados.", exact=True)).to_be_visible()
                page.reload()
                expect(page.get_by_role("heading", name="TESTE ISOLADO · Editado", exact=True)).to_have_count(0)
                assert len(context.request.get(BASE + "/api/listings").json()) == 4
                checks.append("radar deletion persists while saved listings remain")
                assert not errors, errors
                assert (REPO / ".next" / "BUILD_ID").read_text().strip() == build_id, "Build changed during browser validation; rerun against a stable build"
                browser.close()
            report = {"status": "passed", "checks": checks, "javascript_errors": errors,
                      "completed_at": timestamp(), "build_id": build_id,
                      "provider_extractions": 0, "intercepted_run_requests": len(searches.requests),
                      "css_zoom_200_scroll_width": css_zoom_scroll_width,
                      "limitations": ["Local production catalog route with synthetic test data and offline photo/response fixtures. No proof of live provider coverage or real cross-source mappings.",
                                      "Scheduler disabled; no external cron or actual notification was created.",
                                      "Keyboard scroll tested at CSS zoom 200%; responsive reflow at 720px/DPR2. No physical mobile device or browser UI zoom.",
                                      "CSS zoom keeps desktop media queries; measured width is recorded above. The 720px reflow has no overflow."]}
            (ARTIFACTS / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
            print(json.dumps(report, indent=2, ensure_ascii=False))
        finally:
            stop_server(process)


if __name__ == "__main__":
    main()
