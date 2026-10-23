"""Offline radar UI checks after npm run build.

All radar/search API responses and mutations are intercepted in the browser.
Synthetic notices do not validate collection, scheduling or email delivery.
"""

import copy
import json
from pathlib import Path
import re
import socket
import sqlite3
import sys
import tempfile
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

sys.dont_write_bytecode = True
from browser_catalog_regression import REPO, start_server, stop_server, timestamp


ARTIFACTS = REPO / "test-results" / "radar-alerts"
CRITERIA = dict(
    name="TESTE ISOLADO · BMW 320i 2016+", brand="BMW", model="320i", version="",
    state="PR", city="", cities=[], locationMode="state", yearMin=2016,
    yearMax=None, priceMax=None, mileageMax=None, privateOnly=False,
    sources=["olx"], olxUrl="",
)


def fixtures():
    now = timestamp()
    listing = dict(source="olx", externalId="test-only", title="TESTE SINTÉTICO · BMW 320i",
                   url="https://pr.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/test-only",
                   priceCents=9000000, brand="BMW", model="320i", version=None,
                   modelYear=2016, city="Curitiba", state="PR", mileage=70000,
                   sellerType="private", observedAt=now, reasons=[])
    notices = []
    for index, kind in enumerate(("baseline", "new_listing", "price_drop")):
        notices.append(dict(id=f"notice-{index}", kind=kind, status="recorded",
                            matchStatus="confirmed" if kind == "new_listing" else "uncertain",
                            listing={**listing, "externalId": f"test-only-{index}"},
                            priceCents=9000000, previousPriceCents=9500000 if kind == "price_drop" else None,
                            createdAt=now, sentAt=None, channel="in_app"))
    current = dict(id="radar-current", searchId="saved-search", name="TESTE · Avisos no aplicativo",
                   minPercent=10, intervalHours=24, enabled=True, mode="new_listings",
                   channel="in_app", runsRemaining=1, state="success", missing=[],
                   lastRunAt=now, nextRunAt=now, criteria=copy.deepcopy(CRITERIA),
                   runs=[dict(id="run", status="ok", message="Execução sintética; nenhum portal consultado.",
                              startedAt=now, finishedAt=now)], notices=notices)
    legacy = dict(current, id="radar-legacy", name="TESTE · Radar antigo",
                  mode="discount", channel="email", runsRemaining=None,
                  state="pending", missing=["Canal de e-mail não configurado"], runs=[], notices=[])
    legacy["notices"] = [{**notices[0], "id": "notice-email-limit", "kind": "discount",
                          "status": "email_limited", "channel": "both"}]
    return [current, legacy]


def exercise(page, base, width, state, writes):
    page.goto(base + "/radares?busca=saved-search")
    expect(page.get_by_role("heading", name="Meus radares", exact=True)).to_be_visible()
    expect(page.get_by_role("combobox", name="O que acompanhar", exact=True)).to_have_value("new_listings")
    expect(page.get_by_role("combobox", name="Onde receber", exact=True)).to_have_value("in_app")
    expect(page.get_by_role("spinbutton", name="Execuções restantes", exact=True)).to_have_value("")
    expect(page.get_by_text(re.compile("E-mail não configurado. Você pode receber avisos aqui no aplicativo"))).to_be_visible()
    current = page.locator("article.radar-card").filter(has=page.get_by_role("heading", name="TESTE · Avisos no aplicativo", exact=True))
    expect(current).to_contain_text("Todas as versões · de 2016 · sem ano máximo · todo o estado de PR")
    expect(current.get_by_text("Encontrado na primeira consulta", exact=True)).to_be_visible()
    expect(current.get_by_text("Novo para este Radar", exact=True)).to_be_visible()
    expect(current.get_by_text("Preço caiu", exact=True)).to_be_visible()
    expect(current.get_by_text(re.compile("Já estava disponível quando o Radar consultou pela primeira vez"))).to_be_visible()
    expect(current.get_by_text(re.compile("A publicação pode ser anterior"))).to_be_visible()
    expect(current.get_by_text("Correspondência confirmada com os filtros.", exact=True)).to_have_count(1)
    expect(current.get_by_text(re.compile("^Correspondência incerta"))).to_have_count(2)
    expect(current.get_by_text(re.compile("^De R"))).to_contain_text("95.000,00")
    expect(current.get_by_text("Aviso registrado no aplicativo", exact=False)).to_have_count(3)
    legacy = page.locator("article.radar-card").filter(has=page.get_by_role("heading", name="TESTE · Radar antigo", exact=True))
    expect(legacy.get_by_text(re.compile("limite de 10 e-mails desta execução atingido. Sem reenvio automático"))).to_be_visible()
    legacy.get_by_role("button", name="Editar", exact=True).click()
    expect(page.get_by_role("combobox", name="O que acompanhar", exact=True)).to_have_value("discount")
    expect(page.get_by_role("combobox", name="Onde receber", exact=True)).to_have_value("email")
    expect(page.get_by_role("spinbutton", name="Percentual mínimo abaixo da média", exact=True)).to_have_value("10")
    expect(page.get_by_role("spinbutton", name="Execuções restantes", exact=True)).to_have_value("")
    expect(page.get_by_text(re.compile("O monitoramento por e-mail aguardará a configuração"))).to_be_visible()
    page.get_by_role("button", name="Cancelar edição", exact=True).click()
    expect(page.get_by_role("combobox", name="Onde receber", exact=True)).to_have_value("in_app")
    page.get_by_role("combobox", name="Onde receber", exact=True).select_option("both")
    expect(page.get_by_text("Os avisos ficarão no aplicativo. O e-mail aguarda configuração.", exact=True)).to_be_visible()
    page.get_by_role("combobox", name="Onde receber", exact=True).select_option("in_app")
    page.get_by_role("combobox", name="Busca", exact=True).select_option("saved-search")
    page.get_by_role("textbox", name="Nome do Radar", exact=True).fill(f"TESTE · Uma execução {width}")
    budget = page.get_by_role("spinbutton", name="Execuções restantes", exact=True)
    budget.fill("101")
    assert not budget.evaluate("el => el.checkValidity()"), "Budget must reject >100"
    budget.fill("1.5")
    assert not budget.evaluate("el => el.checkValidity()"), "Budget must reject fractions"
    budget.fill("1")
    page.get_by_role("button", name="Salvar Radar", exact=True).click()
    expect(page.get_by_text("Radar salvo. Confira o estado do monitoramento abaixo.", exact=True)).to_be_visible()
    assert writes[-1]["mode"] == "new_listings" and writes[-1]["channel"] == "in_app"
    assert writes[-1]["runsRemaining"] == 1 and writes[-1]["enabled"] is True
    created = page.locator("article.radar-card").filter(has=page.get_by_role("heading", name=f"TESTE · Uma execução {width}", exact=True))
    expect(created).to_contain_text("1 execução(ões) restante(s).")
    created.get_by_role("button", name="Editar", exact=True).click()
    budget.fill("0")
    page.get_by_role("button", name="Salvar Radar", exact=True).click()
    expect(created).to_contain_text("Limite de execuções atingido")
    expect(created.get_by_role("button", name="Ativar", exact=True)).to_be_disabled()
    page.reload()
    expect(created.get_by_role("button", name="Ativar", exact=True)).to_be_disabled()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), f"Overflow at {width}px"
    page.evaluate("document.activeElement?.blur()")
    page.screenshot(path=str(ARTIFACTS / f"{width}-radar-alerts.png"), full_page=True)
    assert len(state) == 3


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    build_id = (REPO / ".next" / "BUILD_ID").read_text().strip()
    errors, external, unexpected, writes = [], [], [], []
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        base = f"http://127.0.0.1:{sock.getsockname()[1]}"
    with tempfile.TemporaryDirectory(prefix="radar-alert-ui-") as temporary, (ARTIFACTS / "server.log").open("w") as log:
        db_path = Path(temporary) / "fixture.db"
        with sqlite3.connect(db_path) as database:
            for migration in sorted((REPO / "prisma" / "sqlite" / "migrations").glob("*/migration.sql")):
                database.executescript(migration.read_text())
        process = start_server(db_path, base, log)
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
                for width in (1440, 390):
                    state = fixtures()
                    context = browser.new_context(viewport={"width": width, "height": 900},
                                                  is_mobile=width == 390, has_touch=width == 390,
                                                  service_workers="block")
                    def offline(route):
                        request = route.request
                        parsed = urlparse(request.url)
                        if parsed.netloc != urlparse(base).netloc:
                            external.append(request.url)
                            return route.abort()
                        if parsed.path == "/api/searches" and request.method == "GET":
                            return route.fulfill(json=dict(searches=[dict(id="saved-search", criteria=CRITERIA)], integrations=[]))
                        if parsed.path == "/api/vehicles" and request.method == "GET":
                            return route.fulfill(json=[])
                        if parsed.path == "/api/radars" and request.method == "GET":
                            return route.fulfill(json=dict(radars=state, infrastructure=dict(scheduler=True, email=False, link=True, ready=True, missing=[], emailMissing=["E-mail não configurado"])))
                        if parsed.path.startswith("/api/radars") and request.method in ("POST", "PUT"):
                            body = request.post_data_json
                            writes.append(body)
                            row_id = parsed.path.rsplit("/", 1)[-1] if request.method == "PUT" else f"created-{width}"
                            value = dict(body, id=row_id, criteria=copy.deepcopy(CRITERIA), notices=[], runs=[],
                                         state="scheduled", missing=[], lastRunAt=None, nextRunAt=timestamp())
                            if body["runsRemaining"] == 0:
                                value.update(enabled=False, state="paused", nextRunAt=None)
                            state[:] = [value if row["id"] == row_id else row for row in state]
                            if request.method == "POST":
                                state.append(value)
                            return route.fulfill(json=value, status=200 if request.method == "PUT" else 201)
                        if parsed.path.startswith("/api/") or request.method not in ("GET", "HEAD"):
                            unexpected.append(request.url)
                            return route.abort()
                        route.continue_()
                    context.route("**/*", offline)
                    page = context.new_page()
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    exercise(page, base, width, state, writes)
                    context.close()
                browser.close()
            assert not errors, errors
            assert not external, external
            assert not unexpected, unexpected
            assert (REPO / ".next" / "BUILD_ID").read_text().strip() == build_id, "Build changed during test"
            report = dict(status="passed", completed_at=timestamp(), build_id=build_id,
                          viewports=[1440, 390], intercepted_radar_writes=len(writes),
                          javascript_errors=errors, external_requests=external, unexpected_requests=unexpected,
                          checks=["new defaults new_listings/in_app; legacy discount/email preserved when editing",
                                  "email absent leaves in-app available and both warns accurately",
                                  "integer execution budget 0..100; exhausted radar cannot reactivate without editing",
                                  "baseline distinguished from new-to-radar; price drops and uncertainty visible",
                                  "BMW 320i 2016+ has no upper year or version; mobile and desktop do not overflow"],
                          limitations=["All APIs intercepted with synthetic records; no evidence of scheduler, source collection or email delivery.",
                                       "No radar was persisted or executed; no production database, portal or notification was accessed."])
            (ARTIFACTS / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
            print(json.dumps(report, ensure_ascii=False, indent=2))
        finally:
            stop_server(process)


if __name__ == "__main__":
    main()
