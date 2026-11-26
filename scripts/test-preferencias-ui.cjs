const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const puppeteer = require('puppeteer-core');
const root = path.resolve(__dirname, '..');
const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
async function main() {
 const db=new Client(JSON.parse(fs.readFileSync(path.join(root,'.local/database.json'),'utf8'))); await db.connect();
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 let user;
 try {
 const page=await browser.newPage(); await page.goto(base+'/portal-paciente');
 const created=await page.evaluate(async()=> (await fetch('/api/local',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'signup',payload:{email:'prefs-'+Date.now()+'@teste.local',password:'TestePaciente2026',options:{data:{nome:'Teste preferencias',consentimento_lgpd_em:new Date().toISOString()}}}})})).json());
 assert.equal(created.error,null); user=created.data.user;
 await db.query("update public.pacientes set celular='11987654321',data_nascimento='1990-01-01',cadastro_completo_em=now() where user_id=$1",[user.id]);
 await page.setViewport({width:1440,height:1000});await page.goto(base+'/paciente/agendar',{waitUntil:'networkidle2'});
 await page.click('#booking-specialty');
 const search=await page.$('input[type="search"]');await search.type('cardio');
 const first=await page.$('#booking-specialty-options button:not([disabled])');assert(first);await first.click();
 await page.waitForSelector('#booking-professional');await page.click('#booking-professional');
 const options=await page.$$('#booking-professional-options button');assert(options.length>=2);const name=await options[1].$eval('strong',e=>e.textContent);await options[1].click();
 assert(!(await page.$('section[aria-label="Resultado da pesquisa"]')));
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Pesquisar disponibilidade')&&!b.disabled));
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Pesquisar disponibilidade')).click());
 await page.waitForSelector('button[data-slot-id]');
 assert((await page.$eval('section[aria-label="Resultado da pesquisa"]',e=>e.textContent)).includes(name));
 const slots=await page.$$('button[data-slot-id]');assert(slots.length>2);await slots[2].click();
 await page.waitForSelector('#booking-review');assert(await page.$('input[name="agenda_id"]'));
 await new Promise(r=>setTimeout(r,350));
 await page.screenshot({path:path.join(root,'.local/preview-paciente/resultados-desktop.png'),fullPage:true});
 for(const width of [360,390,768]){await page.setViewport({width,height:844});await new Promise(r=>setTimeout(r,150));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 await page.setViewport({width:390,height:844});await page.screenshot({path:path.join(root,'.local/preview-paciente/resultados-celular.png'),fullPage:true});
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Alterar pesquisa')).click());

 await page.click('#booking-specialty');await page.type('input[type="search"]','derma');await page.click('#booking-specialty-options button:not([disabled])');
 assert(!(await page.$('section[aria-label="Resultado da pesquisa"]')));assert((await page.$eval('#booking-professional',e=>e.textContent)).includes('Sem prefer'));
 await page.click('#booking-date');
 const today=await page.$eval('button[aria-current="date"]',e=>e.dataset.date);
 const past=await page.$$eval('#booking-date-panel button[data-date]',els=>els.filter(e=>e.dataset.date<document.querySelector('button[aria-current="date"]').dataset.date).map(e=>e.disabled));assert(past.every(Boolean));
 assert(await page.$eval('button[aria-label="M\u00eas anterior"]',e=>e.disabled));
 await page.click('button[aria-label="Pr\u00f3ximo m\u00eas"]');
 const nextMonthDay=await page.$eval('#booking-date-panel button[data-date]:not([disabled])',e=>e.dataset.date);assert(nextMonthDay>today);
 await page.click('#booking-day-'+nextMonthDay);assert.equal(await page.$eval('input[name="a_partir_de"]',e=>e.value),nextMonthDay);assert(!(await page.$('#booking-date-panel')));
 await page.click('#booking-date');assert(await page.$eval('#booking-day-'+nextMonthDay,e=>e.getAttribute('aria-pressed')==='true'));
 await page.click('button[aria-label="M\u00eas anterior"]');
 await page.focus('#booking-day-'+today);await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
 assert.notEqual(await page.$eval('input[name="a_partir_de"]',e=>e.value),'');
 await page.click('#booking-date');await page.evaluate(()=>[...document.querySelectorAll('#booking-date-panel button')].find(b=>b.textContent.includes('Sem prefer')).click());
 assert.equal(await page.$eval('input[name="a_partir_de"]',e=>e.value),'');
 await page.click('#booking-date');
 await new Promise(r=>setTimeout(r,250));await page.screenshot({path:path.join(root,'.local/preview-paciente/calendario-desktop.png'),fullPage:true});
 for(const width of [360,390,768]){await page.setViewport({width,height:844});await new Promise(r=>setTimeout(r,150));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 await page.setViewport({width:390,height:844});await page.screenshot({path:path.join(root,'.local/preview-paciente/preferencias-celular.png'),fullPage:true});
 console.log('OK: busca, preferencias, calendario, datas passadas bloqueadas, troca de mes, teclado, selecao e limpeza da data, telas 360/390/768/1440px.');
 }finally{if(user)await db.query('delete from auth.users where id=$1',[user.id]);await browser.close();await db.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
