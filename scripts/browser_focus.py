"""Offline UI regression. Uses only isolated fixtures and a temporary database."""
import json, os, sqlite3, subprocess, tempfile, time, urllib.request
from pathlib import Path
from datetime import datetime, timezone, timedelta
from playwright.sync_api import sync_playwright

repo=Path(__file__).resolve().parents[1]
artifacts=repo/'test-results'/'focus'
artifacts.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='car-router-ui-') as folder:
 dbpath=Path(folder)/'test.db'
 conn=sqlite3.connect(dbpath)
 for migration in sorted((repo/'prisma'/'sqlite'/'migrations').glob('*/migration.sql')):
  conn.executescript(migration.read_text())
 now=datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
 criteria=dict(name='TESTE ISOLADO · Corolla',brand='Toyota',model='Corolla',version='XEi',city='Curitiba',state='PR',yearMin=2021,yearMax=2021,priceMax=110000,mileageMax=70000,privateOnly=False,sources=['olx'],olxUrl='')
 rows=[]
 for i in range(7):
  row=dict(source='olx',externalId=str(i),url=f'https://pr.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/test-only-{i}',title='TESTE ISOLADO · Toyota Corolla XEi',brand='Toyota',model='Corolla',version='XEi',versionOrigin='explicit',modelYear=2021,mileage=50000+i*10,city='Curitiba',state='PR',priceCents=10000000 if i==0 else 13000000,sellerType='private',observedAt=now,reasons=[] if i==0 else ['Preço fora do limite ou desconhecido'])
  rows.append(row)
  conn.execute('INSERT INTO DiscoveredListing(id,source,externalId,payload,firstSeen,lastSeen) VALUES (?,?,?,?,?,?)',(f'listing-{i}','olx',str(i),json.dumps(row),now,now))
  conn.execute('INSERT INTO ListingPrice(listingId,priceCents,observedAt) VALUES (?,?,?)',(f'listing-{i}',row['priceCents'],now))
 conn.execute('INSERT INTO SavedSearch(id,name,criteria,createdAt) VALUES (?,?,?,?)',('test-search',criteria['name'],json.dumps(criteria),now))
 result=dict(sources=[dict(source='olx',status='ok',message='Consulta isolada de teste. Nenhum fornecedor foi acessado.',observedAt=now,elapsedMs=1,creditsReserved=0,total=7,partial=False,listings=rows)])
 conn.execute('INSERT INTO SearchRun(id,searchId,createdAt,result) VALUES (?,?,?,?)',('test-run','test-search',now,json.dumps(result)))
 conn.commit();conn.close()
 env={**os.environ,'DATABASE_URL':'file:'+str(dbpath),'GECKO_API_KEY':' ','REEF_API_KEY':' ','REEF_FREE_TRIAL':'false','RADAR_SCHEDULER_ENABLED':'false','RESEND_API_KEY':' ','RADAR_CRON_SECRET':' '}
 log=open(artifacts/'server.log','w')
 server=subprocess.Popen(['node','node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3158'],cwd=repo,env=env,stdout=log,stderr=log)
 base='http://127.0.0.1:3158'
 try:
  for _ in range(90):
   try:
    if urllib.request.urlopen(base+'/buscar',timeout=1).status==200: break
   except Exception: time.sleep(.3)
  else: raise RuntimeError('Server did not start')
  with sync_playwright() as pw:
   browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
   page=browser.new_page(viewport={'width':1440,'height':1000})
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(base+'/buscar?busca=test-search');page.get_by_role('heading',name='1 candidato',exact=True).wait_for()
   assert page.get_by_text('23,1% abaixo da média',exact=True).count()==1
   assert page.get_by_text('R$ 130.000,00',exact=True).count()>=1
   page.screenshot(path=str(artifacts/'01-busca-teste.png'),full_page=True)
   page.get_by_role('button',name='Salvar',exact=True).click();page.get_by_role('button',name='Salvo',exact=True).wait_for()
   page.get_by_role('link',name='Conferir semelhantes',exact=True).click();page.get_by_role('heading',name='6 anúncios na referência',exact=True).wait_for()
   assert page.locator('tbody tr').count()==6
   page.get_by_role('button',name='Ver preços observados',exact=True).click()
   page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(artifacts/'02-detalhe-teste.png'),full_page=True)
   page.get_by_role('link',name='Criar alerta desta busca',exact=True).click();page.get_by_label('Nome do Radar').fill('TESTE ISOLADO · Meu Corolla');page.get_by_role('button',name='Salvar Radar',exact=True).click()
   page.get_by_role('heading',name='TESTE ISOLADO · Meu Corolla',exact=True).wait_for()
   assert page.get_by_text('Configuração pendente',exact=True).count()==1
   page.get_by_role('button',name='Pausar',exact=True).click();page.get_by_text('Pausado',exact=True).wait_for()
   page.get_by_role('button',name='Editar',exact=True).click();page.get_by_label('Nome do Radar').fill('TESTE ISOLADO · Editado');page.get_by_role('button',name='Salvar Radar',exact=True).click();page.get_by_role('heading',name='TESTE ISOLADO · Editado',exact=True).wait_for()
   page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(artifacts/'03-radar-teste.png'),full_page=True)
   page.get_by_role('button',name='Excluir',exact=True).click();page.get_by_role('button',name='Cancelar',exact=True).click();assert page.get_by_role('heading',name='TESTE ISOLADO · Editado',exact=True).count()==1
   page.goto(base+'/salvos');page.get_by_role('button',name='Salvo',exact=True).wait_for()
   page.reload();page.get_by_role('button',name='Salvo',exact=True).wait_for()
   # Failure is explicit; earlier observations and saved records remain.
   page.goto(base+'/buscar?busca=test-search');page.get_by_role('button',name='Buscar agora',exact=True).click();page.get_by_role('alert').filter(has_text='Nenhuma fonte selecionada').wait_for();page.get_by_role('heading',name='1 candidato',exact=True).wait_for()
   page.set_viewport_size({'width':390,'height':844})
   page.goto(base+'/buscar?busca=test-search');page.get_by_role('heading',name='1 candidato',exact=True).wait_for()
   assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'mobile overflow'
   page.screenshot(path=str(artifacts/'04-mobile-teste.png'),full_page=True)
   page.get_by_role('button',name='Abrir menu',exact=True).click();page.get_by_role('link',name='Salvos',exact=True).click();page.get_by_role('heading',name='Salvos',exact=True).wait_for()
   assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
   # Keyboard focus is visible and the skip link exists.
   page.goto(base+'/buscar');page.keyboard.press('Tab');assert page.evaluate('document.activeElement.textContent').strip()=='Pular para o conteúdo'
   assert not errors, errors
   browser.close()
  print('UI PASS: desktop/mobile, real API states with isolated fixtures, price explanation, save persistence, Radar create/pause/edit/cancel-delete, failure state, keyboard, no JS errors.')
 finally:
  server.terminate()
  try: server.wait(timeout=10)
  except subprocess.TimeoutExpired: server.kill();server.wait()
  log.close()
