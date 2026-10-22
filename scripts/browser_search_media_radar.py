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
           "RESEND_API_KEY": " ", "RADAR_CRON_SECRET": " "}
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
        if kind == "brands":
            if self.fail_brands:
                route.fulfill(status=503, json={"error": "Fixture unavailable"})
                return
            rows = [{"code": "1", "name": "Toyota", "searchName": "Toyota"}, {"code": "2", "name": "Honda", "searchName": "Honda"},
                    {"code": "3", "name": "Audi"}, {"code": "4", "name": "AUDI"},
                    {"code": "5", "name": "VW - VolksWagen", "searchName": "Volkswagen"}]
            rows += [{"code": str(100 + i), "name": f"Marca fixture {i:02}"} for i in range(25)]
        elif kind == "models":
            if query.get("brand") == ["1"] and self.hold_model:
                self.pending_models.append(route)
                return
            rows = [{"code": "family:civic", "name": "Civic", "searchName": "Civic", "versions": [{"code": "20", "name": "Civic EX 2.0"}]}] if query.get("brand") == ["2"] else [{"code": "family:corolla", "name": "Corolla", "searchName": "Corolla", "versions": [{"code": "10", "name": "Corolla XEi 2.0"}]}]
            if query.get("brand") == ["5"]:
                rows = [{"code": "family:golf", "name": "Golf", "searchName": "Golf", "versions": [{"code": "50", "name": "Golf Highline 1.4 TSI"}]}]
        else:
            if query.get("state") == ["SP"] and self.hold_city:
                self.pending_cities.append(route)
                return
            names = {"PR": "Curitiba", "SP": "São Paulo", "SC": "Florianópolis"}
            rows = [{"code": "1", "name": names.get(query.get("state", ["PR"])[0], "Cidade fixture")}]
        route.fulfill(json=rows)


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
                      observedAt=timestamp(), elapsedMs=1, creditsReserved=0, total=7, partial=True,
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
    city = page.get_by_role("combobox", name="Cidade", exact=True)
    model_requests = sum(kind == "models" for kind, _ in catalog.requests)
    run_requests = len(searches.requests)
    brand.fill("to")
    assert sum(kind == "models" for kind, _ in catalog.requests) == model_requests
    expect(page.get_by_role("option", name="Toyota", exact=True)).to_be_visible()
    brand.press("ArrowDown")
    assert brand.get_attribute("aria-activedescendant")
    brand.press("Enter")
    expect(brand).to_have_value("Toyota")
    model.click()
    expect(page.get_by_role("option", name="Corolla", exact=True)).to_be_visible()
    model.press("ArrowDown")
    model.press("Enter")
    expect(model).to_have_value("Corolla")
    assert sum(kind == "models" for kind, _ in catalog.requests) == model_requests + 1
    assert len(searches.requests) == run_requests
    city.fill("Curitiba")
    page.get_by_role("button", name="Salvar critérios sem consultar", exact=True).click()
    expect(page.get_by_role("status").filter(has_text="Critérios salvos. Nenhuma consulta realizada.")).to_be_visible()
    saved = searches.saved_payloads[-1]
    assert saved["brand"] == "Toyota" and saved["model"] == "Corolla"
    assert saved["catalog"]["provider"] == "fipe" and saved["catalog"]["brandCode"] == "1"
    assert saved["catalog"]["modelGroup"] == "family:corolla"
    assert not saved["catalog"].get("modelCode"), "A grouped family is not a FIPE version ID"
    assert saved.get("version", "") == "", "A FIPE description must not become a strict version filter"
    assert len(searches.requests) == run_requests
    saved_selector = page.get_by_role("combobox", name="Retomar uma busca", exact=True)
    expect(saved_selector).not_to_have_value("")
    grouped_id = saved_selector.input_value()
    assert grouped_id
    page.goto(BASE + "/buscar?busca=" + grouped_id)
    expect(model).to_have_value("Corolla")
    expect(page.get_by_text("Entrada manual confirmada.", exact=False)).to_have_count(0)
    page.get_by_role("button", name="Salvar critérios sem consultar", exact=True).click()
    expect(page.get_by_role("status").filter(has_text="Critérios salvos. Nenhuma consulta realizada.")).to_be_visible()
    assert searches.saved_payloads[-1]["catalog"]["modelGroup"] == "family:corolla"

    # A real catalog brand plus a manually confirmed model must stay mixed after
    # reload; restoring the brand must not invent a family selection for the text.
    manual_text(page, model, "Corolla texto manual")
    page.get_by_role("button", name="Salvar critérios sem consultar", exact=True).click()
    expect(page.get_by_role("status").filter(has_text="Critérios salvos. Nenhuma consulta realizada.")).to_be_visible()
    saved = searches.saved_payloads[-1]
    assert saved["catalog"]["brandCode"] == "1" and not saved["catalog"].get("modelGroup")
    expect(saved_selector).not_to_have_value(grouped_id)
    expect(saved_selector).not_to_have_value("")
    manual_id = saved_selector.input_value()
    assert manual_id and manual_id != grouped_id
    page.goto(BASE + "/buscar?busca=" + manual_id)
    expect(model).to_have_value("Corolla texto manual")
    expect(page.get_by_text("Entrada manual confirmada.", exact=False)).to_be_visible()
    page.get_by_role("button", name="Salvar critérios sem consultar", exact=True).click()
    expect(page.get_by_role("status").filter(has_text="Critérios salvos. Nenhuma consulta realizada.")).to_be_visible()
    assert searches.saved_payloads[-1]["model"] == "Corolla texto manual"
    assert searches.saved_payloads[-1]["catalog"]["brandCode"] == "1"
    assert not searches.saved_payloads[-1]["catalog"].get("modelGroup")
    assert len(searches.requests) == run_requests
    page.locator('input[name="version"]').fill("XEi")
    brand.fill("Honda")
    expect(model).to_have_value("")
    expect(page.locator('input[name="version"]')).to_have_value("")
    city.fill("Curitiba")
    page.locator('select[name="state"]').select_option("SP")
    expect(city).to_have_value("")
    city.click()
    expect(page.get_by_role("option", name="São Paulo", exact=True)).to_be_visible()
    city.press("Escape")
    expect(city).to_have_attribute("aria-expanded", "false")
    # Resolve an older request after a newer one; only the new options may render.
    # Start fresh so a valid cached Toyota catalog cannot satisfy this check.
    page.goto(BASE + "/buscar")
    expect(page.get_by_role("button", name="Buscar agora", exact=True)).to_be_enabled()
    catalog.hold_model = True
    choose(page, brand, "Toyota")
    page.wait_for_function("document.querySelector('[name=model]').value === ''")
    model.click()
    expect(page.get_by_text("Carregando opções…", exact=True)).to_be_visible()
    assert catalog.pending_models
    choose(page, brand, "Honda")
    model.click()
    expect(page.get_by_role("option", name="Civic", exact=True)).to_be_visible()
    for route in catalog.pending_models:
        route.fulfill(json=[{"code": "family:old", "name": "RESPOSTA ANTIGA TOYOTA", "searchName": "RESPOSTA ANTIGA TOYOTA", "versions": []}])
    catalog.hold_model = False
    expect(page.get_by_role("option", name="RESPOSTA ANTIGA TOYOTA")).to_have_count(0)
    expect(page.get_by_role("option", name="Civic", exact=True)).to_be_visible()
    page.locator('select[name="state"]').select_option("PR")
    catalog.hold_city = True
    page.locator('select[name="state"]').select_option("SP")
    city.click()
    expect(page.get_by_text("Carregando opções…", exact=True)).to_be_visible()
    assert catalog.pending_cities
    page.locator('select[name="state"]').select_option("SC")
    city.click()
    expect(page.get_by_role("option", name="Florianópolis", exact=True)).to_be_visible()
    for route in catalog.pending_cities:
        route.fulfill(json=[{"code": "old", "name": "RESPOSTA ANTIGA SP"}])
    catalog.hold_city = False
    expect(page.get_by_role("option", name="RESPOSTA ANTIGA SP")).to_have_count(0)
    expect(page.get_by_role("option", name="Florianópolis", exact=True)).to_be_visible()
    # A missing catalog still permits saving manually typed criteria, without keys.
    catalog.fail_brands = True
    page.reload()
    expect(page.get_by_role("button", name="Buscar agora", exact=True)).to_be_enabled()
    brand.click()
    expect(page.get_by_text("Catálogo indisponível. Digite manualmente.", exact=False)).to_be_visible()
    manual_text(page, brand, "Marca manual")
    manual_text(page, model, "Modelo manual")
    city.fill("Curitiba")
    page.get_by_role("button", name="Salvar critérios sem consultar", exact=True).click()
    expect(page.get_by_role("status").filter(has_text="Critérios salvos. Nenhuma consulta realizada.")).to_be_visible()
    assert not searches.saved_payloads[-1].get("catalog"), "Manual text must not retain a catalog identity"
    assert len(searches.requests) == run_requests
    catalog.fail_brands = False
    # Catalog labels, query text and provenance are separate even for aliases.
    page.goto(BASE + "/buscar")
    choose(page, brand, "VW - VolksWagen", "VW")
    expect(brand).to_have_value("Volkswagen")
    choose(page, model, "Golf")
    city.fill("Curitiba")
    page.get_by_role("button", name="Salvar critérios sem consultar", exact=True).click()
    expect(page.get_by_role("status").filter(has_text="Critérios salvos. Nenhuma consulta realizada.")).to_be_visible()
    saved = searches.saved_payloads[-1]
    assert saved["brand"] == "Volkswagen" and saved["model"] == "Golf"
    assert saved["catalog"]["brandName"] == "VW - VolksWagen"
    assert saved["catalog"]["modelGroup"] == "family:golf"
    assert not saved["catalog"].get("modelCode")


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
            manual_text(page, page.get_by_role("combobox", name="Cidade", exact=True), "Londrina")
        elif changed == "yearMin":
            page.get_by_role("spinbutton", name="Ano-modelo de", exact=True).fill("2020")
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
                checks.append("grouped catalog keyboard, short query/provenance, grouped versus manual model identity after reload, dependent clearing, out-of-order responses, explicit manual save without credentials")
                search_failure_checks(page, searches)
                checks.append("loading/HTTP/source failure preserve input and results; total failure/interruption after partial failure recover each source separately on reload; empty differs from unavailable")
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

                mobile = setup_context(browser, OfflineCatalog(), errors,
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
                touch.locator('input[name="version"]').tap()
                touch.locator('input[name="version"]').fill("XEi")
                touch.get_by_role("combobox", name="Cidade", exact=True).tap()
                touch.get_by_role("combobox", name="Cidade", exact=True).fill("Curitiba")
                touch.get_by_role("option", name="Curitiba", exact=True).tap()
                touch.locator(".advanced-filters > summary:visible").tap()
                mobile_budget = touch.get_by_role("spinbutton", name="Orçamento máximo (R$)", exact=True)
                mobile_budget.tap()
                mobile_budget.fill("110000")
                expect(mobile_budget).to_have_value("110000")
                assert touch.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "mobile search overflow"
                touch.evaluate("window.scrollTo(0,0)")
                touch.screenshot(path=str(ARTIFACTS / "04-busca-touch.png"), full_page=True)
                touch.goto(BASE + "/salvos")
                expect(touch.get_by_role("checkbox", name="Comparar este anúncio")).to_have_count(4)
                assert touch.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "mobile saved overflow"
                touch.screenshot(path=str(ARTIFACTS / "05-salvos-touch.png"), full_page=True)
                checks.append("390px touch brand/model/version/city/budget controls, sticky actions and mobile search/saved layout")

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
                      "limitations": ["Offline grouped catalog and photo fixtures; short query/provenance checked, but no live provider delivery or FIPE/OLX mapping proof.",
                                      "Scheduler disabled; no external cron or actual notification was created.",
                                      "Keyboard scroll tested at CSS zoom 200%; responsive reflow at 720px/DPR2. No physical mobile device or browser UI zoom.",
                                      "CSS zoom keeps desktop media queries; measured width is recorded above. The 720px reflow has no overflow."]}
            (ARTIFACTS / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
            print(json.dumps(report, indent=2, ensure_ascii=False))
        finally:
            stop_server(process)


if __name__ == "__main__":
    main()
