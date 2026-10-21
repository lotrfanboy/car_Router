"""Optional browser QA: Python + Playwright + Chromium. Uses a temporary SQLite DB."""
import os
import re
import socket
import subprocess
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:3100"
SHOTS = ROOT / "docs" / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)
env = os.environ.copy()
with tempfile.TemporaryDirectory(prefix="radar-browser-") as temp:
    env["DATABASE_URL"] = "file:" + str(Path(temp) / "browser.db")
    subprocess.run(["node", "node_modules/prisma/build/index.js", "migrate", "deploy"], cwd=ROOT, env=env, check=True)
    log = open(Path(temp) / "server.log", "w+")
    server = subprocess.Popen(["node", "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3100"], cwd=ROOT, env=env, stdout=log, stderr=log)
    try:
        for _ in range(60):
            try:
                with socket.create_connection(("127.0.0.1", 3100), timeout=1):
                    break
            except OSError:
                time.sleep(1)
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"), args=["--no-sandbox"])
            page = browser.new_page(viewport={"width":1440,"height":1000}, device_scale_factor=1, timezone_id="America/Sao_Paulo")
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("response", lambda response: print("API ERROR", response.status, response.text()) if "/api/" in response.url and response.status >= 400 else None)
            def visit(path):
                page.goto(BASE + path)
                page.get_by_role("status").filter(has_text="Carregando seu radar").wait_for(state="hidden")
            def screenshot(name):
                page.screenshot(path=str(SHOTS / name), full_page=True)
            visit("/")
            page.get_by_role("heading", name="Seu radar começa aqui").wait_for()
            screenshot("01-dashboard-vazio.png")
            ids = []
            def create(brand, model, price, reference, city, state):
                visit("/veiculos/novo")
                for label, value in [("Marca",brand),("Modelo",model),("Versão","Registro de teste automatizado"),("Ano de fabricação","2020"),("Ano do modelo","2021"),("Quilometragem","50000"),("Preço anunciado",price),("Valor de referência",reference),("Cidade",city),("Origem do anúncio","Teste automatizado"),("Observações","Dados temporários exclusivos da verificação do produto.")]:
                    page.get_by_label(re.compile("^" + re.escape(label))).fill(value)
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
            screenshot("02-detalhes-teste.png")
            create("Honda","Civic","110000","100000","Curitiba","PR")
            create("Volkswagen","Golf","95000","100000","São Paulo","SP")
            # Verify persistence across an actual application process restart.
            server.terminate()
            server.wait(timeout=10)
            server = subprocess.Popen(["node", "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3100"], cwd=ROOT, env=env, stdout=log, stderr=log)
            for _ in range(30):
                try:
                    with socket.create_connection(("127.0.0.1", 3100), timeout=1):
                        break
                except OSError:
                    time.sleep(1)
            visit("/veiculos")
            assert page.locator(".vehicle-card").count() == 3
            page.get_by_role("button",name="Filtros",exact=False).click()
            page.get_by_label("Buscar veículos").fill("sao")
            for label,value in [("Marca","Toyota"),("Modelo","Corolla"),("Ano mínimo","2020"),("Ano máximo","2021"),("Preço mínimo","85000"),("Preço máximo","95000"),("Km máxima","50000"),("Cidade","São"),("Origem","Teste")]:
                page.get_by_label(re.compile("^" + re.escape(label))).fill(value)
            page.get_by_label(re.compile("^Estado")).select_option("SP")
            page.get_by_label("Somente favoritos").check()
            assert page.locator(".vehicle-card").count() == 1
            page.get_by_role("button",name="Visualização em tabela").click()
            page.get_by_role("link",name="Toyota Corolla").wait_for()
            page.get_by_role("button",name="Limpar filtros").click()
            page.get_by_label("Ordenar veículos").select_option("priceAsc")
            assert "Toyota Corolla" in page.locator("tbody tr").first.inner_text()
            page.get_by_role("button",name="Visualização em cards").click()
            screenshot("03-catalogo-teste.png")
            for button in page.locator(".compare-toggle").all():
                button.click()
            page.get_by_role("link",name="Comparar veículos",exact=True).click()
            page.get_by_role("heading",name="Comparador",exact=True).wait_for()
            assert page.locator(".comparison-table thead th").count() == 4
            assert page.get_by_label("Adicionar veículo à comparação").is_disabled()
            screenshot("04-comparacao-teste.png")
            page.get_by_role("button",name="Remover Golf da comparação").click()
            assert page.locator(".comparison-table thead th").count() == 3
            visit("/favoritos")
            assert page.locator(".vehicle-card").count() == 1
            visit("/veiculos/" + ids[0] + "/editar")
            page.get_by_label("Preço anunciado").fill("80000")
            page.get_by_role("button",name="Salvar alterações").click()
            page.wait_for_url(BASE+"/veiculos/"+ids[0])
            page.get_by_text("20% abaixo").wait_for()
            page.get_by_role("button",name="Excluir anúncio",exact=True).click()
            page.get_by_role("button",name="Cancelar",exact=True).click()
            assert not page.locator("dialog").is_visible()
            page.get_by_role("button",name="Excluir anúncio",exact=True).click()
            page.locator("dialog").get_by_role("button",name="Excluir anúncio",exact=True).click()
            page.wait_for_url(BASE+"/veiculos")
            assert page.locator(".vehicle-card").count() == 2
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
            visit("/veiculos/registro-inexistente")
            page.get_by_role("heading",name="Anúncio não encontrado").wait_for()
            assert not errors, errors
            browser.close()
            print("PASS: desktop/mobile, CRUD, persistence after reload and server restart, combined filters, sorting, favorites, 2/3 vehicle comparison, reference calculations, missing records, no browser exceptions.")
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
        log.close()
