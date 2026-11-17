import { test, expect } from '@playwright/test';

test.beforeEach(async({page})=>{await page.clock.install({time:new Date('2026-11-17T10:00:00Z')})});
async function details(page,index=0){await page.goto('/');await expect(page.locator('.job-card')).toHaveCount(4);await page.getByRole('button',{name:'Ver detalhes'}).nth(index).click()}
async function apply(page,index=0){await details(page,index);await page.getByRole('button',{name:'Candidatar-me',exact:true}).click();await expect(page.getByLabel('Distrito da candidatura por e-mail')).toBeVisible()}

for(const [index,district,title,subject] of [
  [0,'Guijá','Técnicos/as de Campo','Candidatura – Técnico/a de Campo – Guijá'],
  [1,'Mapai','Técnicos/as de Infraestruturas Comunitárias','Candidatura – Técnico/a de Infraestruturas – Mapai'],
  [2,'Massangena','Pontos Focais de Género, Protecção e PEAAS','Candidatura – Ponto Focal de Género, Protecção e PEAAS – Massangena'],
  [3,'Massangena','Supervisor/a Distrital','Supervisor(a) Distrital – Massangena'],
]) {
  test(`candidatura por e-mail: ${title}`,async({page})=>{
    await apply(page,index);await expect(page.getByRole('dialog').getByRole('heading',{name:title,exact:true})).toBeVisible();
    const select=page.getByLabel('Distrito da candidatura por e-mail');
    expect(await select.locator('option').allTextContents()).toEqual(index===3?['Massangena']:['Seleccione o distrito','Guijá','Mapai','Massangena']);
    if(index!==3) {await expect(page.getByRole('button',{name:'Seleccione o distrito para continuar'})).toBeDisabled();await select.selectOption(district)}
    const link=page.getByRole('link',{name:'Enviar candidatura por e-mail'}),url=new URL(await link.getAttribute('href'));
    expect(url.protocol).toBe('mailto:');expect(url.pathname).toBe('recrutamentoprotege1@gmail.com');expect(url.searchParams.get('subject')).toBe(subject);expect(url.searchParams.get('body')).toContain(`Distrito pretendido: ${district}`);expect(url.searchParams.get('body')).toContain('Referências profissionais');
    await expect(link).toHaveCSS('background-color','rgb(255, 255, 255)');
    await expect(page.getByText('Os ficheiros não são anexados automaticamente.',{exact:false})).toBeVisible();await expect(page.locator('form,input[type=file]')).toHaveCount(0);
    await page.getByRole('button',{name:'Voltar aos detalhes'}).click();await expect(page.getByRole('heading',{name:'Principais responsabilidades'})).toBeVisible();
    await expect(page.getByText('Envie os documentos por e-mail para',{exact:false})).toBeVisible();
  });
}

test('página e candidatura funcionam sem pedidos à API',async({page})=>{
  const requests=[];page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url())});
  await apply(page);await page.getByLabel('Distrito da candidatura por e-mail').selectOption('Guijá');await expect(page.getByRole('link',{name:'Enviar candidatura por e-mail'})).toBeVisible();expect(requests).toEqual([]);
});
test('encerramento automático com janela de candidatura aberta',async({page})=>{
  await apply(page);await page.getByLabel('Distrito da candidatura por e-mail').selectOption('Mapai');await page.clock.fastForward(4*24*3600000);
  await expect(page.getByRole('button',{name:'Candidaturas encerradas'})).toBeDisabled();await expect(page.getByRole('link',{name:'Enviar candidatura por e-mail'})).toHaveCount(0);await expect(page.getByLabel('Distrito da candidatura por e-mail')).toBeDisabled();
});
test('vagas encerradas continuam consultáveis sem iniciar candidatura',async({page})=>{
  await page.clock.setFixedTime(new Date('2026-11-21T00:00:00+02:00'));await details(page);await expect(page.getByRole('button',{name:'Candidaturas encerradas'})).toBeDisabled();await expect(page.locator('.job-closed')).toHaveCount(4);await expect(page.getByText('Actualmente não existem vagas disponíveis.',{exact:false})).toBeVisible();
});
test('janela acessível: contenção de foco, Escape e retorno ao botão de origem',async({page})=>{
  await apply(page);await page.getByLabel('Distrito da candidatura por e-mail').selectOption('Guijá');await page.getByRole('link',{name:'Enviar candidatura por e-mail'}).focus();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Fechar janela'})).toBeFocused();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Ver detalhes'}).first()).toBeFocused();
});
test('menu móvel abre e fecha ao seleccionar vagas',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByRole('button',{name:'Abrir ou fechar menu'}).click();await expect(page.locator('nav')).toBeVisible();await page.locator('nav').getByRole('link',{name:'Vagas',exact:true}).click();await expect(page.locator('nav')).toBeHidden();
});
for(const [width,height] of [[360,800],[390,844],[768,1024],[1440,900]]) {
  test(`responsividade ${width}x${height}`,async({page})=>{
    await page.setViewportSize({width,height});await page.goto('/');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/landing-${width}.png`,fullPage:true});
    await apply(page);await page.getByLabel('Distrito da candidatura por e-mail').selectOption('Massangena');
    const bounds=await page.getByRole('dialog').boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);expect(await page.getByRole('dialog').evaluate(element=>element.scrollWidth>element.clientWidth)).toBe(false);
    await page.getByRole('link',{name:'Enviar candidatura por e-mail'}).scrollIntoViewIfNeeded();await expect(page.getByRole('link',{name:'Enviar candidatura por e-mail'})).toBeInViewport();await page.screenshot({path:`test-results/email-${width}.png`});
  });
}
