import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
const pdf=await PDFDocument.create();pdf.addPage();
const bytes=Buffer.from(await pdf.save());
const file=name=>({name,mimeType:'application/pdf',buffer:bytes});
async function openForm(page,index=0){
  await page.goto('/');await expect(page.locator('.job-card')).toHaveCount(4);
  await page.getByRole('button',{name:'Ver detalhes'}).nth(index).click();
  await page.getByRole('button',{name:'Candidatar-me',exact:true}).click();
  await expect(page.getByRole('button',{name:'Submeter candidatura'})).toBeVisible();
}
async function fill(page,email='candidate@example.org'){
  await page.getByLabel('Nome completo').fill('Candidato de Teste');
  await page.getByLabel('Endereço de e-mail').fill(email);await page.getByLabel('Número de telefone').fill('+258 841234567');
  await page.getByLabel('Distrito pretendido').selectOption('Massangena');
  await page.locator('#cv').setInputFiles(file('cv.pdf'));await page.locator('#letter').setInputFiles(file('carta.pdf'));
  await page.locator('#certificates').setInputFiles([file('certificado1.pdf'),file('certificado2.pdf')]);
  for(let i=0;i<3;i++){await page.locator(`#ref-name-${i}`).fill(`Referência ${i+1}`);await page.locator(`#ref-org-${i}`).fill('Organização / cargo');await page.locator(`#ref-contact-${i}`).fill(`ref${i}@example.org`)}
  await page.getByRole('checkbox').check();
}
test.beforeEach(async({request})=>{await request.post('/__test/reset',{data:{}})});

test('fluxo React → API → SMTP simulado com todos os anexos',async({page,request})=>{
  await openForm(page);await fill(page);
  const sent=page.waitForRequest(request=>request.url().endsWith('/api/v1/applications'));
  await page.getByRole('button',{name:'Submeter candidatura'}).click();
  const req=await sent;expect(req.headers()['content-type']).toContain('multipart/form-data; boundary=');expect(req.headers()['idempotency-key']).toMatch(/^[\da-f-]{36}$/);
  await expect(page.getByRole('status')).toContainText('Candidatura aceite pelo serviço de e-mail');
  const state=await (await request.get('/__test/state')).json();expect(state.messages).toHaveLength(1);const message=state.messages[0];
  expect(message.subject).toBe('Candidatura – Técnico/a de Campo – Massangena');expect(message.text).toContain('Referência 3');expect(message.attachments).toHaveLength(4);
  for(const attachment of message.attachments) expect(attachment.base64).toBe(bytes.toString('base64'));
  await expect.poll(async()=>(await(await request.get('/__test/state')).json()).temporaryFiles.length).toBe(0);
});

for(const [index,title,subject] of [[1,'Técnicos/as de Infraestruturas Comunitárias','Candidatura – Técnico/a de Infraestruturas – Massangena'],[2,'Pontos Focais de Género, Protecção e PEAAS','Candidatura – Ponto Focal de Género, Protecção e PEAAS – Massangena'],[3,'Supervisor/a Distrital','Supervisor(a) Distrital – Massangena']]){
  test(`vaga e distrito: ${title}`,async({page,request})=>{await openForm(page,index);await expect(page.getByLabel('Vaga seleccionada')).toHaveValue(title);
    const options=await page.getByLabel('Distrito pretendido').locator('option').allTextContents();expect(options).toEqual(index===3?['Massangena']:['Seleccione o distrito','Guijá','Mapai','Massangena']);
    await fill(page);await page.getByRole('button',{name:'Submeter candidatura'}).click();await expect(page.getByRole('status')).toContainText('Candidatura aceite');
    const state=await(await request.get('/__test/state')).json();expect(state.messages[0].subject).toBe(subject);
  });
}

test('obrigatoriedade impede pedido HTTP e mantém os dados editáveis',async({page})=>{let posts=0;await page.route('**/api/v1/applications',()=>posts++);await openForm(page);await page.getByRole('button',{name:'Submeter candidatura'}).click();await expect(page.getByRole('status')).toContainText('Verifique os campos');await expect(page.locator('#name')).toHaveAttribute('aria-invalid','true');expect(posts).toBe(0)});

test('duplo clique, progresso e fecho bloqueado durante o pedido',async({page,request})=>{
  let release;const gate=new Promise(resolve=>release=resolve);let posts=0;
  await page.route('**/api/v1/applications',async route=>{posts++;await gate;await route.continue()});
  await openForm(page);await fill(page);await page.getByRole('button',{name:'Submeter candidatura'}).evaluate(button=>{button.click();button.click()});
  await expect(page.getByRole('button',{name:'A enviar…'})).toBeDisabled();await expect(page.getByRole('button',{name:'Fechar janela'})).toBeDisabled();await expect(page.locator('form')).toHaveAttribute('aria-busy','true');
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeVisible();release();await expect(page.getByRole('status')).toContainText('Candidatura aceite');expect(posts).toBe(1);expect((await(await request.get('/__test/state')).json()).messages).toHaveLength(1);
});

for(const [status,code] of [[400,'INVALID_FORM'],[403,'ORIGIN_DENIED'],[409,'DUPLICATE_APPLICATION'],[410,'DEADLINE_PASSED'],[502,'EMAIL_FAILED'],[503,'APPLICATIONS_DISABLED']]){
  test(`erro HTTP ${status} apresenta mensagem sem sucesso falso`,async({page})=>{
    await page.route('**/api/v1/applications',route=>route.fulfill({status,json:{code,message:`Erro de teste ${status}`}}));
    await openForm(page);await fill(page);await page.getByRole('button',{name:'Submeter candidatura'}).click();await expect(page.getByRole('status')).toContainText(`Erro de teste ${status}`);await expect(page.getByRole('status')).not.toContainText('Candidatura aceite');await expect(page.getByLabel('Nome completo')).toHaveValue('Candidato de Teste');
    if([409,410].includes(status)) await expect(page.locator('button[type=submit]')).toBeDisabled();
  });
}

test('resposta 503 HTML é distinguida de uma falha de ligação',async({page})=>{await page.route('**/api/v1/applications',route=>route.fulfill({status:503,contentType:'text/html',body:'<html>Unavailable</html>'}));await openForm(page);await fill(page);await page.getByRole('button',{name:'Submeter candidatura'}).click();await expect(page.getByRole('status')).toContainText('serviço de candidaturas está indisponível');await expect(page.getByRole('status')).not.toContainText('ligação foi interrompida')});

test('falha SMTP simulada atravessa o backend sem confirmação falsa',async({page,request})=>{await openForm(page);await fill(page,'smtp-fail@example.org');await page.getByRole('button',{name:'Submeter candidatura'}).click();await expect(page.getByRole('status')).toContainText('Não foi possível enviar');expect((await(await request.get('/__test/state')).json()).messages).toHaveLength(0)});

test('repetir após resposta perdida mantém chave e não duplica e-mail',async({page,request})=>{
  const keys=[];let first=true;
  await page.route('**/api/v1/applications',async route=>{keys.push(route.request().headers()['idempotency-key']);if(first){first=false;await route.fetch();await route.abort('connectionreset')}else await route.continue()});
  await openForm(page);await fill(page);await page.getByRole('button',{name:'Submeter candidatura'}).click();await expect(page.getByRole('status')).toContainText('não foi possível confirmar');await page.getByRole('button',{name:'Submeter candidatura'}).click();await expect(page.getByRole('status')).toContainText('Candidatura aceite');expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);expect((await(await request.get('/__test/state')).json()).messages).toHaveLength(1);
});

test('encerramento automático com formulário aberto',async({page})=>{await page.clock.install({time:new Date('2026-11-17T10:00:00Z')});await openForm(page);await page.clock.fastForward(4*24*3600000);await expect(page.getByRole('button',{name:'Candidaturas encerradas'})).toBeDisabled();await expect(page.getByRole('checkbox')).toBeDisabled()});

test('configuração indisponível impede submissão',async({page})=>{await page.route('**/api/v1/config',route=>route.fulfill({status:503,json:{message:'offline'}}));await page.goto('/');await page.getByRole('button',{name:'Ver detalhes'}).first().click();await page.getByRole('button',{name:'Candidatar-me',exact:true}).click();await expect(page.getByLabel('Distrito da candidatura por e-mail')).toBeVisible();await expect(page.locator('button[type=submit]')).toHaveCount(0)});

test('foco não alcança honeypot e inclui a política de privacidade',async({page})=>{await openForm(page);await page.locator('button[type=submit]').focus();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Fechar janela'})).toBeFocused();await page.getByRole('button',{name:'Voltar aos detalhes'}).focus();await page.keyboard.press('Shift+Tab');await expect(page.getByRole('checkbox')).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(page.locator('.privacy-draft summary')).toBeFocused()});

for(const [width,height] of [[360,800],[390,844],[768,1024],[1440,900]]){
  test(`responsividade ${width}x${height}`,async({page})=>{await page.setViewportSize({width,height});await page.goto('/');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/landing-${width}.png`,fullPage:true});
    await openForm(page);await fill(page);
    await page.getByRole('dialog').evaluate(el=>el.scrollTop=0);await page.screenshot({path:`test-results/form-top-${width}.png`});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const bounds=await page.getByRole('dialog').boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);
    const overflow=await page.getByRole('dialog').evaluate(el=>el.scrollWidth>el.clientWidth);expect(overflow).toBe(false);
    await page.locator('button[type=submit]').scrollIntoViewIfNeeded();await expect(page.locator('button[type=submit]')).toBeInViewport();
    await page.screenshot({path:`test-results/form-${width}.png`});
  });
}

test('configuração malformada não abre envio nem quebra a página',async({page})=>{
  await page.route('**/api/v1/config',route=>route.fulfill({json:{available:true,jobs:[{id:'campo',deadlineAt:'invalido'}],limits:{},serverNow:'invalido',formToken:'x'}}));
  await page.goto('/');await page.getByRole('button',{name:'Ver detalhes'}).first().click();await page.getByRole('button',{name:'Candidatar-me',exact:true}).click();await expect(page.getByLabel('Distrito da candidatura por e-mail')).toBeVisible();await expect(page.locator('button[type=submit]')).toHaveCount(0);
});

test('candidaturas desactivadas na configuração não fazem POST',async({page})=>{
  let posts=0;await page.route('**/api/v1/applications',()=>posts++);
  await page.route('**/api/v1/config',async route=>{const response=await route.fetch();const data=await response.json();await route.fulfill({json:{...data,available:false,privacyApproved:false,privacyText:'',message:'Candidaturas bloqueadas para teste.'}})});
  await page.goto('/');await page.getByRole('button',{name:'Ver detalhes'}).first().click();await page.getByRole('button',{name:'Candidatar-me',exact:true}).click();await expect(page.getByLabel('Distrito da candidatura por e-mail')).toBeVisible();await page.getByLabel('Distrito da candidatura por e-mail').selectOption('Mapai');await expect(page.getByRole('link',{name:'Enviar candidatura por e-mail'})).toHaveAttribute('href',/^mailto:recrutamentoprotege1@gmail\.com\?/);expect(posts).toBe(0);
});

test('encerramento no servidor prevalece sobre configuração antiga no navegador',async({page,request})=>{
  await request.post('/__test/reset',{data:{now:'2026-11-20T23:59:00+02:00'}});
  await openForm(page);await fill(page);await request.post('/__test/reset',{data:{now:'2026-11-21T00:00:00+02:00'}});
  await page.getByRole('button',{name:'Submeter candidatura'}).click();await expect(page.getByRole('status')).toContainText('Candidaturas encerradas');await expect(page.getByRole('button',{name:'Candidaturas encerradas'})).toBeDisabled();expect((await(await request.get('/__test/state')).json()).messages).toHaveLength(0);
});

test('nova janela da mesma candidatura recebe 409 real sem duplicar e-mail',async({page,request})=>{
  await openForm(page);await fill(page);await page.getByRole('button',{name:'Submeter candidatura'}).click();await expect(page.getByRole('status')).toContainText('Candidatura aceite');await page.getByRole('button',{name:'Fechar janela'}).click();
  await page.getByRole('button',{name:'Ver detalhes'}).first().click();await page.getByRole('button',{name:'Candidatar-me',exact:true}).click();await expect(page.getByRole('button',{name:'Submeter candidatura'})).toBeVisible();await fill(page);await page.getByRole('button',{name:'Submeter candidatura'}).click();await expect(page.getByRole('status')).toContainText('Já existe uma candidatura');await expect(page.locator('button[type=submit]')).toBeDisabled();expect((await(await request.get('/__test/state')).json()).messages).toHaveLength(1);
});

test('resposta 200 sem confirmação válida não mostra sucesso',async({page})=>{
  await page.route('**/api/v1/applications',route=>route.fulfill({status:200,json:{status:'queued'}}));await openForm(page);await fill(page);await page.getByRole('button',{name:'Submeter candidatura'}).click();await expect(page.getByRole('status')).toContainText('não devolveu uma confirmação válida');
});

for(const [index,district,subject] of [[0,'Guijá','Candidatura – Técnico/a de Campo – Guijá'],[1,'Mapai','Candidatura – Técnico/a de Infraestruturas – Mapai'],[2,'Massangena','Candidatura – Ponto Focal de Género, Protecção e PEAAS – Massangena'],[3,'Massangena','Supervisor(a) Distrital – Massangena']]) {
  test(`candidatura directa por e-mail: vaga ${index+1}`,async({page})=>{
    await page.route('**/api/v1/config',async route=>{const response=await route.fetch();await route.fulfill({json:{...await response.json(),available:false}})});
    await page.goto('/');await page.getByRole('button',{name:'Ver detalhes'}).nth(index).click();await page.getByRole('button',{name:'Candidatar-me',exact:true}).click();
    const select=page.getByLabel('Distrito da candidatura por e-mail');await expect(select).toBeVisible();
    if(index===3) await expect(select.locator('option')).toHaveCount(1);
    else {await expect(page.getByRole('button',{name:'Seleccione o distrito para continuar'})).toBeDisabled();await select.selectOption(district)}
    const link=page.getByRole('link',{name:'Enviar candidatura por e-mail'});const href=await link.getAttribute('href');
    const url=new URL(href);expect(url.protocol).toBe('mailto:');expect(url.pathname).toBe('recrutamentoprotege1@gmail.com');expect(url.searchParams.get('subject')).toBe(subject);expect(url.searchParams.get('body')).toContain(`Distrito pretendido: ${district}`);expect(url.searchParams.get('body')).toContain('Referências profissionais');
    await expect(page.getByText('Os ficheiros não são anexados automaticamente.',{exact:false})).toBeVisible();await expect(page.locator('button[type=submit]')).toHaveCount(0);
  });
}
