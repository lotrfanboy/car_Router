"""Production UI regression using an isolated SQLite DB and offline catalogs/media.

Run after `npm run build`: python scripts/browser_search_media_radar.py
No provider calls or e-mails are made. This proves persistence and rendering of
fixture media, not delivery of photos or model names by a live provider.
"""

import base64
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import time
from datetime import datetime, timezone
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


class CheckResults(list):
    def append(self, item):
        super().append(item)
        print("PASS: " + item, flush=True)


def seed(db_path):
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
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


def start_server(db_path, log):
    env = {**os.environ, "DATABASE_URL": "file:" + str(db_path), "GECKO_API_KEY": " ",
           "REEF_API_KEY": " ", "REEF_FREE_TRIAL": "false", "RADAR_SCHEDULER_ENABLED": "false",
           "RESEND_API_KEY": " ", "RADAR_CRON_SECRET": " "}
    process = subprocess.Popen(["node", "node_modules/next/dist/bin/next", "start", "--hostname",
                                "127.0.0.1", "--port", "3159"], cwd=REPO, env=env,
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

    def route(self, route):
        query = parse_qs(urlparse(route.request.url).query)
        kind = query.get("type", [""])[0]
        if kind == "brands":
            if self.fail_brands:
                route.fulfill(status=503, json={"error": "Fixture unavailable"})
                return
            rows = [{"code": "1", "name": "Toyota"}, {"code": "2", "name": "Honda"},
                    {"code": "3", "name": "Audi"}, {"code": "4", "name": "AUDI"}]
            rows += [{"code": str(100 + i), "name": f"Marca fixture {i:02}"} for i in range(25)]
        elif kind == "models":
            if query.get("brand") == ["1"] and self.hold_model:
                self.pending_models.append(route)
                return
            rows = [{"code": "20", "name": "Civic EX 2.0"}] if query.get("brand") == ["2"] else [{"code": "10", "name": "Corolla XEi 2.0"}]
        else:
            if query.get("state") == ["SP"] and self.hold_city:
                self.pending_cities.append(route)
                return
            names = {"PR": "Curitiba", "SP": "São Paulo", "SC": "Florianópolis"}
            rows = [{"code": "1", "name": names.get(query.get("state", ["PR"])[0], "Cidade fixture")}]
        route.fulfill(json=rows)


def setup_context(browser, catalog, errors, **options):
    context = browser.new_context(**options)
    # All browser requests stay local except the explicit fixture below.
    context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(BASE) else route.abort())
    context.route("**/api/search-options?*", catalog.route)
    context.route(MEDIA, lambda route: route.fulfill(content_type="image/png", body=PNG))
    context.route("https://media.example.test/missing.png", lambda route: route.fulfill(status=404))
    context.on("page", lambda page: page.on("pageerror", lambda error: errors.append(str(error))))
    return context


def loaded_photo(page):
    image = page.locator(f'img[src="{MEDIA}"]')
    image.scroll_into_view_if_needed()
    expect(image).to_be_visible()
    expect(image).to_have_js_property("complete", True)
    assert image.evaluate("image => image.naturalWidth") > 0


def catalog_checks(page, catalog):
    page.goto(BASE + "/buscar")
    expect(page.get_by_role("button", name="Buscar agora", exact=True)).to_be_enabled()
    brand = page.get_by_role("combobox", name="Marca", exact=True)
    model = page.get_by_role("combobox", name="Modelo/versão FIPE", exact=True)
    city = page.get_by_role("combobox", name="Cidade", exact=True)
    brand.fill("to")
    expect(page.get_by_role("option", name="Toyota", exact=True)).to_be_visible()
    brand.press("ArrowDown")
    assert brand.get_attribute("aria-activedescendant")
    brand.press("Enter")
    expect(brand).to_have_value("Toyota")
    model.click()
    expect(page.get_by_role("option", name="Corolla XEi 2.0", exact=True)).to_be_visible()
    model.press("ArrowDown")
    model.press("Enter")
    expect(model).to_have_value("Corolla XEi 2.0")
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
    catalog.hold_model = True
    brand.fill("Toyota")
    page.wait_for_function("document.querySelector('[name=model]').value === ''")
    model.click()
    expect(page.get_by_text("Carregando opções…", exact=True)).to_be_visible()
    assert catalog.pending_models
    brand.fill("Honda")
    model.click()
    expect(page.get_by_role("option", name="Civic EX 2.0", exact=True)).to_be_visible()
    for route in catalog.pending_models:
        route.fulfill(json=[{"code": "old", "name": "RESPOSTA ANTIGA TOYOTA"}])
    catalog.hold_model = False
    expect(page.get_by_role("option", name="RESPOSTA ANTIGA TOYOTA")).to_have_count(0)
    expect(page.get_by_role("option", name="Civic EX 2.0", exact=True)).to_be_visible()
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
    brand.fill("Marca manual")
    model.fill("Modelo manual")
    city.fill("Curitiba")
    page.get_by_role("button", name="Salvar critérios sem consultar", exact=True).click()
    expect(page.get_by_text("Critérios salvos. Nenhuma consulta realizada.", exact=True)).to_be_visible()
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


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="car-router-search-ui-") as folder, open(ARTIFACTS / "server.log", "w") as log:
        db_path = Path(folder) / "test.db"
        seed(db_path)
        process = start_server(db_path, log)
        errors = []
        checks = CheckResults()
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
                catalog = OfflineCatalog()
                context = setup_context(browser, catalog, errors, viewport={"width": 1440, "height": 1000})
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

                catalog_checks(page, catalog)
                checks.append("combobox keyboard, dependent clearing, out-of-order responses, manual save without credentials")
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
                touch.get_by_role("combobox", name="Modelo/versão FIPE", exact=True).tap()
                touch.get_by_role("option", name="Corolla XEi 2.0", exact=True).tap()
                expect(touch.get_by_role("combobox", name="Modelo/versão FIPE", exact=True)).to_have_value("Corolla XEi 2.0")
                assert touch.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "mobile search overflow"
                touch.screenshot(path=str(ARTIFACTS / "04-busca-touch.png"), full_page=True)
                touch.goto(BASE + "/salvos")
                expect(touch.get_by_role("checkbox", name="Comparar este anúncio")).to_have_count(4)
                assert touch.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "mobile saved overflow"
                touch.screenshot(path=str(ARTIFACTS / "05-salvos-touch.png"), full_page=True)
                checks.append("390px touch selection and mobile search/saved layout")

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
                browser.close()
            report = {"status": "passed", "checks": checks, "javascript_errors": errors,
                      "limitations": ["Offline catalog and photo fixtures; no live provider delivery or FIPE/OLX mapping proof.",
                                      "Scheduler disabled; no external cron or actual notification was created.",
                                      "Keyboard scroll tested at CSS zoom 200%; responsive reflow at 720px/DPR2. No physical mobile device or browser UI zoom.",
                                      "CSS zoom on the 1440px document keeps desktop media queries and overflows to 1676px; the 720px reflow has no overflow."]}
            (ARTIFACTS / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
            print(json.dumps(report, indent=2, ensure_ascii=False))
        finally:
            stop_server(process)


if __name__ == "__main__":
    main()
