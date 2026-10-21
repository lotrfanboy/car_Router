"""Optional browser QA: Python + Playwright + Chromium. Uses a temporary SQLite DB."""
import os
import json
import re
import socket
import subprocess
import tempfile
import time
from urllib.parse import parse_qs, urlsplit
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
with socket.socket() as reserved:
    reserved.bind(("127.0.0.1", 0))
    PORT = reserved.getsockname()[1]
BASE = f"http://127.0.0.1:{PORT}"
SHOTS = Path(os.environ.get("RADAR_SCREENSHOT_DIR", ROOT / "test-results" / "screenshots"))
SHOTS.mkdir(parents=True, exist_ok=True)
env = os.environ.copy()
# Browser QA never spends provider credits or makes live source queries.
# Nonempty whitespace is trimmed by secret(), preventing fallback to private files.
env.update({"GECKO_API_KEY": " ", "REEF_API_KEY": " ", "REEF_FREE_TRIAL": "false"})
checks = []
lab_metrics = []
with tempfile.TemporaryDirectory(prefix="radar-browser-") as temp:
    env["DATABASE_URL"] = "file:" + str(Path(temp) / "browser.db")
    subprocess.run(["node", "node_modules/prisma/build/index.js", "migrate", "deploy"], cwd=ROOT, env=env, check=True)
    log = open(Path(temp) / "server.log", "w+")
    server = subprocess.Popen(["node", "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", str(PORT)], cwd=ROOT, env=env, stdout=log, stderr=log)
    try:
        for _ in range(60):
            try:
                with socket.create_connection(("127.0.0.1", PORT), timeout=1):
                    break
            except OSError:
                time.sleep(1)
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"), args=["--no-sandbox"])
            page = browser.new_page(viewport={"width":1440,"height":1000}, device_scale_factor=1, timezone_id="America/Sao_Paulo")
            page.set_default_timeout(15000)
            page.add_init_script("""(() => {
              window.__radarLabMetrics = {lcpMs: null, cls: 0};
              try { new PerformanceObserver(list => {
                for (const e of list.getEntries()) window.__radarLabMetrics.lcpMs = e.startTime;
              }).observe({type: 'largest-contentful-paint', buffered: true}); } catch {}
              try { new PerformanceObserver(list => {
                for (const e of list.getEntries()) if (!e.hadRecentInput) window.__radarLabMetrics.cls += e.value;
              }).observe({type: 'layout-shift', buffered: true}); } catch {}
            })();""")
            page.context.route("https://example.org/**", lambda route: route.fulfill(status=200, content_type="text/plain", body="TEST ONLY — original listing fixture; not a real advertisement."))
            errors = []
            source_runs = []
            page.on("request", lambda request: source_runs.append(request.url) if re.search(r"/api/searches/[^/]+/run", request.url) else None)
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("response", lambda response: print("API ERROR", response.status, response.text()) if "/api/" in response.url and response.status >= 400 else None)
            def visit(path):
                page.goto(BASE + path)
                page.get_by_role("status").filter(has_text="Carregando seu radar").wait_for(state="hidden")
            def screenshot(name):
                page.evaluate("document.activeElement?.blur(); window.scrollTo({top: 0, left: 0, behavior: 'instant'});")
                page.wait_for_timeout(250)  # Let responsive navigation transitions settle.
                page.screenshot(path=str(SHOTS / name), full_page=True)
                print("SCREENSHOT", name, flush=True)
                lab_metrics.append({"screenshot": name, "url": page.url, "viewport": page.viewport_size, **page.evaluate("window.__radarLabMetrics || {}")})
            try:
                visit("/")
                page.get_by_role("heading", name="Seu radar começa aqui").wait_for()
                assert page.request.get(BASE + "/api/vehicles").json() == []
                checks.append("Empty initial database and truthful empty state")
                screenshot("01-dashboard-vazio.png")
                ids = []
                def create(brand, model, price, reference, city, state):
                    visit("/veiculos/novo")
                    for label, value in [("Marca",brand),("Modelo",model),("Versão","Registro de teste automatizado"),("Ano de fabricação","2020"),("Ano do modelo","2021"),("Quilometragem","50000"),("Preço anunciado",price),("Valor de referência",reference),("Cidade",city),("Origem do anúncio","Teste automatizado"),("Observações","Dados temporários exclusivos da verificação do produto.")]:
                        page.get_by_label(re.compile("^" + re.escape(label))).fill(value)
                    page.get_by_label("URL do anúncio original").fill("https://example.org/test-only/" + model.lower())
                    page.get_by_label(re.compile("^Estado")).select_option(state)
                    page.get_by_label(re.compile("^Combustível")).select_option("Flex")
                    page.get_by_label(re.compile("^Câmbio")).select_option("Automático")
                    page.get_by_role("button", name="Cadastrar veículo", exact=True).click()
                    page.wait_for_url(re.compile(r".*/veiculos/[^/]+$"))
                    try:
                        page.get_by_role("heading", name=model, exact=True).wait_for(timeout=10000)
                    except Exception:
                        print(page.locator("main").inner_text())
                        screenshot("debug-failure.png")
                        raise
                    ids.append(page.url.split("/")[-1])
                create("Toyota","Corolla","90000","100000","São Paulo","SP")
                page.get_by_text("10% abaixo").wait_for()
                page.get_by_role("button",name="Favoritar",exact=True).click()
                page.get_by_role("button",name="Favoritado",exact=True).wait_for()
                page.reload()
                page.get_by_role("button",name="Favoritado",exact=True).wait_for()
                page.get_by_role("heading", name="Trajetória do preço", exact=True).wait_for()
                page.locator('input[name="salePrice"]').fill("120000")
                expect(page.locator("[data-simulation-result]")).to_be_visible()
                before_simulation = page.locator("[data-simulation-result]").inner_text()
                page.locator('input[name="salePrice"]').fill("150000")
                expect(page.locator("[data-simulation-result]")).not_to_have_text(before_simulation)
                original = page.get_by_role("link", name="Abrir anúncio original", exact=False)
                assert "noopener" in (original.get_attribute("rel") or "")
                with page.expect_popup() as opened:
                    original.click()
                opened.value.wait_for_load_state()
                assert opened.value.url == "https://example.org/test-only/corolla"
                opened.value.close()
                checks.append("Details, persisted favorite, manual reference, simulator and original link")
                screenshot("02-detalhes-teste.png")
                create("Honda","Civic","110000","100000","Curitiba","PR")
                create("Volkswagen","Golf","95000","100000","São Paulo","SP")
                create("Toyota","Yaris","85000","90000","São Paulo","SP")
                # Verify persistence across an actual application process restart.
                server.terminate()
                server.wait(timeout=10)
                server = subprocess.Popen(["node", "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", str(PORT)], cwd=ROOT, env=env, stdout=log, stderr=log)
                for _ in range(30):
                    try:
                        with socket.create_connection(("127.0.0.1", PORT), timeout=1):
                            break
                    except OSError:
                        time.sleep(1)
                visit("/veiculos")
                expect(page.locator(".vehicle-card")).to_have_count(4)
                checks.append("CRUD and persistence after reload and server restart")
                page.get_by_label("Buscar veículos").press_sequentially("Corolla", delay=10)
                expect(page.get_by_label("Buscar veículos")).to_have_value("Corolla")
                expect(page.locator(".vehicle-card")).to_have_count(1)
                expect(page).to_have_url(re.compile(r"[?&]q=Corolla(?:&|$)"))
                assert parse_qs(urlsplit(page.url).query)["q"] == ["Corolla"]
                page.get_by_role("button",name="Limpar busca",exact=True).click()
                expect(page.locator(".vehicle-card")).to_have_count(4)
                checks.append("Rapid character entry stays synchronized with the URL")
                page.get_by_role("button",name="Filtros",exact=False).click()
                page.get_by_label("Buscar veículos").fill("sao")
                for label,value in [("Marca","Toyota"),("Modelo","Corolla"),("Ano mínimo","2020"),("Ano máximo","2021"),("Preço mínimo","85000"),("Preço máximo","95000"),("Km máxima","50000"),("Cidade","São"),("Origem","Teste")]:
                    page.get_by_label(re.compile("^" + re.escape(label))).fill(value)
                page.get_by_label(re.compile("^Estado")).select_option("SP")
                page.get_by_label("Somente favoritos").check()
                expect(page.get_by_label("Somente favoritos")).to_be_checked()
                expect(page.locator(".vehicle-card")).to_have_count(1)
                expect(page).to_have_url(re.compile(r"[?&]favorite=true(?:&|$)"))
                assert "?" in page.url, "Combined filters must persist in the URL"
                filtered_url = page.url
                page.reload()
                expect(page.locator(".vehicle-card")).to_have_count(1)
                assert page.url == filtered_url
                page.locator('.vehicle-card a[href^="/veiculos/"]').first.click()
                page.wait_for_url(BASE + "/veiculos/" + ids[0])
                page.go_back()
                expect(page.locator(".vehicle-card")).to_have_count(1)
                assert page.url == filtered_url
                checks.append("Combined filters, shareable URL, reload and back navigation")
                page.get_by_role("button",name="Salvar busca",exact=True).click()
                save_dialog = page.locator("dialog.saved-query-dialog")
                save_dialog.get_by_label("Nome da busca").fill("TEST ONLY — Corolla favorito")
                save_dialog.get_by_role("button",name="Salvar filtros",exact=True).click()
                expect(save_dialog).not_to_be_visible()
                queries = page.request.get(BASE + "/api/catalog-searches").json()
                assert len(queries) == 1
                assert "brand=Toyota" in queries[0]["query"]
                page.get_by_role("button",name="Visualização em lista").click()
                expect(page.locator(".compact-list .vehicle-card")).to_have_count(1)
                checks.append("Saved local filters and compact list preserve the result")
                page.get_by_role("button",name="Visualização em tabela").click()
                page.get_by_role("link",name="Toyota Corolla").wait_for()
                page.get_by_role("button",name="Limpar filtros").first.click()
                page.get_by_label("Ordenar veículos").select_option("priceAsc")
                assert "Toyota Yaris" in page.locator("tbody tr").first.inner_text()
                page.get_by_role("button",name="Visualização em cards").click()
                screenshot("03-catalogo-teste.png")
                for button in page.locator(".compare-toggle").all():
                    button.click()
                page.get_by_role("link",name="Comparar veículos",exact=True).click()
                page.get_by_role("heading",name="Comparador",exact=True).wait_for()
                expect(page.locator(".comparison-table thead th")).to_have_count(5)
                assert page.get_by_label("Adicionar veículo à comparação").is_disabled()
                before_rows = page.locator(".comparison-table tbody tr").count()
                page.get_by_label("Mostrar apenas diferenças").check()
                assert page.locator(".comparison-table tbody tr").count() < before_rows
                page.get_by_label("Mostrar apenas diferenças").uncheck()
                checks.append("Four-vehicle comparison, limit, differences and remove action")
                screenshot("04-comparacao-teste.png")
                page.get_by_role("button",name="Remover Golf da comparação").click()
                expect(page.locator(".comparison-table thead th")).to_have_count(4)
                visit("/mercado")
                expect(page.locator(".market-metrics article").first.locator("strong")).to_have_text("4")
                expect(page.locator(".market-metrics")).to_contain_text("92.500")
                market_form = page.locator(".market-filter-form")
                market_form.locator('[name="brand"]').select_option("Toyota")
                market_form.locator('[type="submit"]').click()
                expect(page.locator(".market-metrics article").first.locator("strong")).to_have_text("2")
                assert "brand=Toyota" in page.url
                with page.expect_download() as exported:
                    page.get_by_role("button",name="Exportar amostra",exact=False).click()
                exported.value.save_as(str(SHOTS / "test-only-filtered-market.csv"))
                csv = (SHOTS / "test-only-filtered-market.csv").read_text()
                assert "Toyota" in csv and "Honda" not in csv
                page.locator('.market-model-table tbody tr a[aria-label^="Ver anúncios"]').first.click()
                page.wait_for_url(re.compile(r".*/veiculos\?.*"))
                expect(page.locator(".vehicle-card")).to_have_count(1)
                visit("/mercado")
                screenshot("09-mercado-1440.png")
                page.set_viewport_size({"width":390,"height":1000})
                screenshot("10-mercado-390.png")
                page.set_viewport_size({"width":1440,"height":1000})
                checks.append("Market sample count, median, filters, CSV and drilldown")
                visit("/favoritos")
                expect(page.locator(".vehicle-card")).to_have_count(1)
                page.get_by_role("link",name="Abrir busca TEST ONLY — Corolla favorito",exact=True).click()
                expect(page).to_have_url(re.compile(r"/veiculos\?.*brand=Toyota(?:&|$)"))
                expect(page.locator(".vehicle-card")).to_have_count(1)
                assert "brand=Toyota" in page.url
                visit("/favoritos")
                page.get_by_role("button",name="Remover busca TEST ONLY — Corolla favorito",exact=True).click()
                expect(page.get_by_role("button",name="Remover busca TEST ONLY — Corolla favorito",exact=True)).to_have_count(0)
                assert page.request.get(BASE + "/api/catalog-searches").json() == []
                checks.append("Saved catalog search opens and removes from monitoring")
                page.get_by_role("button",name="Salvar busca",exact=True).click()
                monitor_dialog = page.locator("dialog.saved-query-dialog[open]")
                monitor_dialog.get_by_label("Nome da busca").fill("TEST ONLY — monitoramento")
                monitor_dialog.get_by_role("button",name="Salvar filtros",exact=True).click()
                expect(monitor_dialog).to_have_count(0)
                manager = page.locator(".saved-query-panel")
                expect(manager.get_by_role("link",name="Abrir busca TEST ONLY — monitoramento",exact=True)).to_have_count(1)
                page.locator(".saved-query-dropdown > summary").click()
                expect(page.locator(".saved-query-popover")).to_contain_text("TEST ONLY — monitoramento")
                manager.get_by_role("button",name="Remover busca TEST ONLY — monitoramento",exact=True).click()
                expect(manager.get_by_role("button",name="Remover busca TEST ONLY — monitoramento",exact=True)).to_have_count(0)
                expect(page.locator(".saved-query-popover")).not_to_contain_text("TEST ONLY — monitoramento")
                assert page.request.get(BASE + "/api/catalog-searches").json() == []
                checks.append("Favorites saved-search manager and dropdown update together without reload")
                visit("/veiculos/" + ids[0] + "/editar")
                page.get_by_label("Preço anunciado").fill("80000")
                page.get_by_role("button",name="Salvar alterações").click()
                page.wait_for_url(BASE+"/veiculos/"+ids[0])
                page.get_by_text("20% abaixo").wait_for()
                page.get_by_role("heading", name="Trajetória do preço", exact=True).wait_for()
                page.get_by_text("Ver todos os registros de preço", exact=True).click()
                history = page.request.get(BASE + "/api/vehicles/" + ids[0] + "/prices").json()
                assert len(history) == 2
                assert sorted(row["priceCents"] for row in history) == [8000000, 9000000]
                checks.append("Real price-change history and updated comparison")
                page.get_by_role("button",name="Excluir anúncio",exact=True).click()
                page.get_by_role("button",name="Cancelar",exact=True).click()
                assert not page.locator("dialog.delete-dialog").is_visible()
                page.get_by_role("button",name="Excluir anúncio",exact=True).click()
                page.locator("dialog.delete-dialog").get_by_role("button",name="Excluir anúncio",exact=True).click()
                page.wait_for_url(BASE+"/veiculos")
                expect(page.locator(".vehicle-card")).to_have_count(3)
                page.set_viewport_size({"width":390,"height":844})
                visit("/veiculos")
                screenshot("05-mobile-catalogo-teste.png")
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                page.get_by_role("button",name="Abrir menu").click()
                page.get_by_role("link",name="Visão geral",exact=True).click()
                page.get_by_role("heading",name="Visão geral",exact=True).wait_for()
                visit("/veiculos/novo")
                screenshot("06-mobile-cadastro.png")
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                # Saved searches do not invoke providers; keys are deliberately absent.
                page.set_viewport_size({"width":1440,"height":1000})
                visit("/buscar")
                page.get_by_role("heading",name="Buscar nos portais",exact=True).wait_for()
                discovery_form = page.locator(".discovery-form")
                for name, value in [("name","TEST ONLY — busca sem consulta"),("brand","Toyota"),("model","Corolla"),("city","São Paulo")]:
                    discovery_form.locator(f'[name="{name}"]').fill(value)
                discovery_form.locator('[name="state"]').select_option("SP")
                discovery_form.get_by_role("button",name="Salvar busca",exact=False).click()
                page.get_by_text("Busca salva. A consulta só começa ao clicar em Consultar agora.",exact=True).wait_for()
                saved = page.request.get(BASE + "/api/searches").json()
                assert len(saved["searches"]) == 1
                assert saved["searches"][0]["latest"] is None
                assert all(not item["configured"] for item in saved["integrations"])
                page.reload()
                expect(page.get_by_label("Buscas salvas")).to_contain_text("TEST ONLY — busca sem consulta")
                checks.append("Source unavailability and persisted search without provider calls")
                screenshot("07-buscas-sem-conexao.png")
                # Every major page must adapt without accidental page-level overflow.
                for width in [390, 768, 1280, 1440]:
                    page.set_viewport_size({"width":width,"height":1000})
                    for path in ["/", "/veiculos", "/mercado", "/comparar", "/favoritos", "/buscar", "/configuracoes", "/veiculos/novo", "/veiculos/" + ids[1]]:
                        visit(path)
                        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), f"Horizontal overflow at {width}px on {path}"
                    visit("/veiculos")
                    screenshot(f"08-radar-{width}.png")
                checks.append("Nine routes without page overflow at 390/768/1280/1440 pixels")
                visit("/")
                screenshot("11-dashboard-populado.png")
                # Simulated failure is isolated to this browser and then removed.
                page.route("**/api/vehicles", lambda route: route.abort("failed"))
                visit("/")
                expect(page.locator(".error-box[role=alert]")).to_contain_text("Não foi possível carregar seus anúncios.")
                page.unroute("**/api/vehicles")
                page.get_by_role("button",name=re.compile("Tentar novamente|Recarregar")).click()
                expect(page.locator(".error-box[role=alert]")).to_have_count(0)
                page.get_by_role("heading",name="Visão geral",exact=True).wait_for()
                expect(page.locator(".vehicle-card")).to_have_count(3)
                checks.append("API failure and working retry")
                pagination_ids = []
                for index in range(13):
                    response = page.request.post(BASE + "/api/vehicles", headers={"Origin": BASE}, data={"brand":"QA", "model":"Fixture de paginação", "manufactureYear":2020, "modelYear":2021, "mileage":50000, "priceCents":1000000 + index * 10000, "source":"QA pagination TEST ONLY"})
                    assert response.ok, response.text()
                    pagination_ids.append(response.json()["id"])
                visit("/veiculos?source=QA+pagination+TEST+ONLY&sort=priceAsc")
                expect(page.locator(".vehicle-card")).to_have_count(12)
                expect(page.locator(".vehicle-card").first).to_contain_text("Fixture de paginação")
                page.get_by_role("button",name="Próxima página",exact=True).click()
                expect(page).to_have_url(re.compile(r"[?&]page=2(?:&|$)"))
                expect(page.locator(".vehicle-card")).to_have_count(1)
                paging_query = parse_qs(urlsplit(page.url).query)
                assert paging_query["page"] == ["2"] and paging_query["sort"] == ["priceAsc"] and paging_query["source"] == ["QA pagination TEST ONLY"]
                expect(page.locator(".vehicle-card")).to_contain_text("11.200")
                page.get_by_role("button",name="Página anterior",exact=True).click()
                expect(page).not_to_have_url(re.compile(r"[?&]page=2(?:&|$)"))
                expect(page.locator(".vehicle-card")).to_have_count(12)
                for identity in pagination_ids:
                    response = page.request.delete(BASE + "/api/vehicles/" + identity, headers={"Origin":BASE})
                    assert response.ok, response.text()
                assert len(page.request.get(BASE + "/api/vehicles").json()) == 3
                checks.append("Real 13-record pagination preserves filters and sorting, then fixtures removed")
                # An explicit TEST ONLY image exercises the registered-image path.
                # Interception serves an SVG label locally; no photo or media is fetched.
                image_url = "https://example.org/radar-test-image.svg"
                broken_url = "https://example.org/radar-broken-image.svg"
                image_fixture = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#222"/><text x="320" y="180" text-anchor="middle" fill="white" font-size="32">TEST ONLY — IMAGE FIXTURE</text></svg>'
                page.route(image_url, lambda route: route.fulfill(status=200, content_type="image/svg+xml", body=image_fixture))
                original_vehicle = page.request.get(BASE + "/api/vehicles/" + ids[1]).json()
                response = page.request.put(BASE + "/api/vehicles/" + ids[1], headers={"Origin":BASE}, data={**original_vehicle, "imageUrl":image_url})
                assert response.ok, response.text()
                visit("/veiculos/" + ids[1])
                gallery = page.locator('section[aria-label="Imagem do anúncio"]')
                expect(gallery.locator(".vehicle-image img")).to_have_attribute("src", image_url)
                page.wait_for_function("document.querySelector('section[aria-label=\"Imagem do anúncio\"] img')?.naturalWidth > 0")
                expect(gallery.locator(".photo-origin")).to_have_text("Imagem informada · example.org")
                page.get_by_role("button",name="Ampliar fotografia do veículo",exact=True).click()
                photo_dialog = page.get_by_role("dialog",name="Fotografia ampliada do veículo",exact=True)
                expect(photo_dialog).to_be_visible()
                expect(photo_dialog.locator("img")).to_have_attribute("src", image_url)
                photo_dialog.get_by_role("button",name="Fechar fotografia",exact=True).click()
                expect(photo_dialog).not_to_be_visible()
                expect(page.get_by_role("button",name="Ampliar fotografia do veículo",exact=True)).to_be_focused()
                visit("/")
                expect(page.locator(".hero-vehicle img")).to_have_attribute("src", image_url)
                page.wait_for_function("document.querySelector('.hero-vehicle img')?.naturalWidth > 0")
                page.route(broken_url, lambda route: route.abort("failed"))
                response = page.request.put(BASE + "/api/vehicles/" + ids[1], headers={"Origin":BASE}, data={**original_vehicle, "imageUrl":broken_url})
                assert response.ok, response.text()
                visit("/veiculos/" + ids[1])
                expect(gallery.get_by_text("Imagem indisponível",exact=True)).to_be_visible()
                expect(gallery.locator(".vehicle-image img")).to_have_count(0)
                visit("/")
                expect(page.locator(".hero-vehicle").get_by_text("Imagem indisponível",exact=True)).to_be_visible()
                response = page.request.put(BASE + "/api/vehicles/" + ids[1], headers={"Origin":BASE}, data=original_vehicle)
                assert response.ok, response.text()
                page.unroute(image_url)
                page.unroute(broken_url)
                checks.append("Registered image loads with attribution, detail zoom restores focus, home uses registered image and broken URLs show honest fallback")
                visit("/veiculos/registro-inexistente")
                page.get_by_role("heading",name="Anúncio não encontrado").wait_for()
                assert not source_runs, "Opening or saving a search must not query external providers"
                assert not errors, errors
                (SHOTS / "validation-report.json").write_text(json.dumps({"checks": checks, "browserExceptions": errors, "externalSourceRuns": len(source_runs), "localLabMetrics": lab_metrics, "metricsLimit": "Local Chromium with synthetic test records. LCP/CLS observations only; no field Core Web Vitals or INP measurement.", "fixtures": "Temporary test-only records, removed with the SQLite database after execution"}, ensure_ascii=False, indent=2))
                browser.close()
                print("PASS: desktop/mobile, CRUD, persistence after reload and server restart, combined filters, sorting, favorites, 3/4 vehicle comparison, reference calculations, missing records, no browser exceptions.")
            except Exception as error:
                try:
                    screenshot("debug-failure.png")
                    print("FAILED PAGE", page.url, page.locator("main").inner_text()[:6000])
                except Exception:
                    pass
                (SHOTS / "validation-report.json").write_text(json.dumps({"status": "failed", "checks": checks, "error": str(error), "browserExceptions": errors}, ensure_ascii=False, indent=2))
                raise

    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
        log.close()
