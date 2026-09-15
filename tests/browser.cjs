const fs=require('node:fs'),path=require('node:path');
let playwright;try{playwright=require('playwright')}catch{playwright=require(path.join(process.env.CODEX_HOME||path.join(process.env.USERPROFILE||process.env.HOME,'.codex'),'skills/develop-web-game/node_modules/playwright'))}
const {chromium}=playwright;
const {spawn}=require('node:child_process');
const out=path.resolve(__dirname,'../../.visual-review/tabletop/chess/verification');fs.mkdirSync(out,{recursive:true});
const report={checks:[],errors:[],console:[],screenshots:[]};
const origin='http://127.0.0.1:5201/';
const startFen='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
function check(name,pass,data){report.checks.push({name,pass:!!pass,...(data===undefined?{}:{data})});if(!pass)throw new Error(name+' '+JSON.stringify(data));}
const state=page=>page.evaluate(()=>JSON.parse(render_game_to_text()));
async function shot(page,name){const p=path.join(out,name+'.png');await page.screenshot({path:p});report.screenshots.push(p);}
async function seed(page,game){await page.goto(origin);await page.evaluate(save=>{localStorage.clear();if(save)localStorage.setItem('mrbd_chess_v1',JSON.stringify(save));},game);await page.reload();}
async function begin(page,side='w',difficulty='intermediate'){await page.click('[data-action=play]');await page.click('[data-action=diff-'+difficulty+']');await page.click('[data-action=side-'+side+']');await page.waitForFunction(()=>JSON.parse(render_game_to_text()).screen==='game');}
async function move(page,from,to){await page.click('[data-sq='+from+']');await page.click('[data-sq='+to+']');}
async function aiDone(page){await page.waitForFunction(()=>{const s=JSON.parse(render_game_to_text());return s.screen==='over'||(!s.thinking&&s.turn===s.human)},{},{timeout:20000});}
(async()=>{let server;try{await fetch(origin)}catch{server=spawn(process.execPath,[path.resolve(__dirname,'../scripts/serve.cjs')],{windowsHide:true,stdio:'ignore'});for(let i=0;i<30;i++){try{await fetch(origin);break}catch{await new Promise(r=>setTimeout(r,100))}}}const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
 const context=await browser.newContext({viewport:{width:600,height:600},reducedMotion:'reduce'});
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.console.push(m.text())});
 await seed(page,null);await page.waitForTimeout(150);await shot(page,'after-menu');
 check('Meta capable tag present',await page.locator('meta[name=mrbd-web-app-capable]').getAttribute('content')==='yes');
 check('new game initially focused',(await state(page)).focus==='play');
 await page.evaluate(()=>document.activeElement.click());check('pinch click opens difficulty',(await state(page)).screen==='difficulty');
 check('difficulty focuses choice rather than Back',(await state(page)).focus==='diff-beginner');await shot(page,'after-difficulty');
 await page.evaluate(()=>document.activeElement.click());check('side focuses White',(await state(page)).focus==='side-w');await shot(page,'after-side');
 await page.evaluate(()=>document.activeElement.click());await page.waitForTimeout(100);
 check('pinch-only menu path starts valid game',(await state(page)).fen===startFen);
 await page.evaluate(()=>document.activeElement.click());check('focused board pinch selects e2',(await state(page)).selected==='e2');
 await shot(page,'after-selected');
 check('selected piece has two distinct legal markers',await page.locator('.dot').count()===2&&await page.locator('.sq.selected').count()===1);
 await page.click('[data-sq=e5]');check('invalid destination preserves selection',(await state(page)).selected==='e2'&&(await state(page)).fen===startFen);
 await page.keyboard.press('Backspace');check('Back cancels selection before pausing',(await state(page)).selected===null&&(await state(page)).modal===null);
 await page.keyboard.press('Escape');check('Back again opens pause',(await state(page)).modal==='pause');
  check('undo disabled before any human move',await page.locator('[data-action=undo]').isDisabled());
  await page.click('[data-action=resign]');check('resign asks before ending a game',(await state(page)).modal==='resign'&&(await state(page)).fen===startFen);await page.keyboard.press('Escape');check('Back cancels resignation and returns to pause',(await state(page)).modal==='pause'&&(await state(page)).fen===startFen);
 for(let i=0;i<9;i++)await page.keyboard.press('Tab');
 check('Tab remains trapped in pause',await page.evaluate(()=>document.querySelector('#pause').contains(document.activeElement)));
 await page.keyboard.press('Escape');
 await page.click('[data-sq=e8]');await page.keyboard.press('ArrowUp');check('D-pad reaches Menu above board',(await state(page)).focus==='open-pause');
 await page.evaluate(()=>document.activeElement.click());check('focused Menu pinch opens pause',(await state(page)).modal==='pause');
 await shot(page,'after-pause');await page.click('[data-action=resume]');
 await move(page,'e2','e4');await page.click('[data-action=open-pause]');const paused=(await state(page)).fen;await page.waitForTimeout(800);
 check('pause cancels a pending computer turn without changing board',(await state(page)).fen===paused&&!(await state(page)).thinking);
 await page.click('[data-action=undo]');check('undo pending AI restores initial position',(await state(page)).fen===startFen);
 await move(page,'e2','e4');await aiDone(page);check('real AI makes exactly one reply',(await state(page)).fen.split(' ')[5]==='2'&&(await state(page)).turn==='w');
 await shot(page,'after-game');const played=(await state(page)).fen;
 await page.reload();check('reload offers Continue',await page.locator('#continue-btn').isVisible());await page.click('#continue-btn');check('Continue restores exact position',(await state(page)).fen===played);
 await page.click('[data-action=open-pause]');await page.click('[data-action=new-game]');await page.click('[data-action=back]');check('cancelling new-game setup preserves existing game',(await state(page)).screen==='game'&&(await state(page)).fen===played);
 await page.click('[data-action=open-pause]');await page.click('[data-action=undo]');check('undo after reply removes both plies',(await state(page)).fen===startFen);
 await page.click('[data-sq=d2]');await page.evaluate(()=>history.back());await page.waitForTimeout(100);check('browser Back cancels selected piece within game',(await state(page)).screen==='game'&&(await state(page)).selected===null);
 await page.evaluate(()=>history.back());await page.waitForTimeout(100);check('browser Back then opens pause',(await state(page)).modal==='pause');await page.keyboard.press('Escape');
 await seed(page,null);await begin(page,'b');await aiDone(page);check('Black start gets a working computer opening',(await state(page)).turn==='b'&&(await state(page)).fen!==startFen);
 check('Black orientation places h1 at upper left',await page.locator('.sq').first().getAttribute('data-sq')==='h1');
 await page.locator('#board').focus();const cur=(await state(page)).cursor;await page.keyboard.press('ArrowRight');const after=(await state(page)).cursor;check('Black arrows follow screen direction',after.charCodeAt(0)===cur.charCodeAt(0)-1);
 await page.click('[data-action=open-pause]');check('Black cannot undo an opening before playing',await page.locator('[data-action=undo]').isDisabled());await page.click('[data-action=resume]');await shot(page,'after-black');
 await seed(page,{fen:'7k/P7/8/8/8/8/8/7K w - - 0 1',human:'w',difficulty:'intermediate'});await page.click('#continue-btn');await move(page,'a7','a8');check('promotion opens a choice without prematurely moving',(await state(page)).modal==='promotion'&&(await state(page)).fen.includes('P7'));
 await shot(page,'after-promotion');await page.keyboard.press('Escape');check('promotion Back returns unchanged board',(await state(page)).modal===null&&(await state(page)).fen.includes('P7'));
 await page.click('[data-sq=a8]');await page.click('[data-promote=n]');check('underpromotion to knight succeeds',JSON.parse(await page.evaluate(()=>localStorage.getItem('mrbd_chess_v1')))===null&&(await state(page)).screen==='over');
 await seed(page,{fen:'4k3/8/8/8/8/8/4r3/4K3 w - - 0 1',human:'w',difficulty:'intermediate'});await page.click('#continue-btn');check('check has visible symbol and text',await page.locator('.sq.check').count()===1&&(await state(page)).status.includes('Check'));await shot(page,'after-check');
 await seed(page,{fen:'4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1',human:'w',difficulty:'intermediate'});await page.click('#continue-btn');await page.click('[data-sq=e1]');check('castling targets visible',(await state(page)).legalTargets.includes('g1')&&(await state(page)).legalTargets.includes('c1'));await page.click('[data-sq=g1]');await page.click('[data-action=open-pause]');check('castling moves king and rook correctly',(await state(page)).fen.split(' ')[0].endsWith('R4RK1'));
 await seed(page,{fen:'7k/8/8/3pP3/8/8/8/K7 w - d6 0 1',human:'w',difficulty:'intermediate'});await page.click('#continue-btn');await page.click('[data-sq=e5]');check('en passant is a capture ring',await page.locator('[data-sq=d6] .dot.capture').count()===1);await page.click('[data-sq=d6]');await page.click('[data-action=open-pause]');check('en passant removes pawn from adjacent square',await page.locator('[data-sq=d5]').getAttribute('aria-label')==='d5, empty');
 await seed(page,null);await begin(page,'w','expert');await move(page,'e2','e4');await page.waitForTimeout(100);await page.click('[data-action=open-pause]');await page.click('[data-action=new-game]');await page.click('[data-action=diff-intermediate]');await page.click('[data-action=side-w]');await page.waitForTimeout(4000);check('late old engine result cannot mutate replacement game',(await state(page)).fen===startFen&&!(await state(page)).thinking);
 for(const viewport of [{width:390,height:844},{width:320,height:568},{width:844,height:390}]){await page.setViewportSize(viewport);await page.waitForTimeout(100);const b=await page.locator('#app').boundingBox();check(`board fits ${viewport.width}x${viewport.height}`,b.x>=-.5&&b.y>=-.5&&b.x+b.width<=viewport.width+.5&&b.y+b.height<=viewport.height+.5,b);await move(page,'e2','e4');await page.click('[data-action=open-pause]');await page.click('[data-action=undo]');check(`touch moves and undo at ${viewport.width}px`,(await state(page)).fen===startFen);await shot(page,'after-size-'+viewport.width)}
  await page.setViewportSize({width:600,height:600});await page.keyboard.press('f');await page.waitForTimeout(150);check('fullscreen opens',await page.evaluate(()=>!!document.fullscreenElement));await page.keyboard.press('f');await page.waitForTimeout(150);check('fullscreen closes',await page.evaluate(()=>!document.fullscreenElement));
  for(const width of [390,320]){
    const mobile=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});const m=await mobile.newPage();await m.goto(origin);await m.waitForTimeout(100);
    const bounds=()=>m.evaluate(()=>{const r=document.getElementById('app').getBoundingClientRect(),v=visualViewport;return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,w:v.width,h:v.height}});
    let box=await bounds();check(`real mobile ${width} menu stays in visual viewport`,box.left>=-.5&&box.top>=-.5&&box.right<=box.w+.5&&box.bottom<=box.h+.5,box);await shot(m,'after-mobile-menu-'+width);
    check(`real mobile ${width} menu has native readable text and touch size`,await m.locator('[data-action=play]').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16&&el.getBoundingClientRect().height>=44));
    await begin(m);box=await bounds();check(`real mobile ${width} board stays in visual viewport`,box.left>=-.5&&box.top>=-.5&&box.right<=box.w+.5&&box.bottom<=box.h+.5,box);await m.locator('[data-sq=e2]').tap();check(`real mobile ${width} tap selects piece`,(await state(m)).selected==='e2');await shot(m,'after-mobile-game-'+width);await mobile.close();
  }
  await page.click('[data-action=open-pause]');await page.click('[data-action=resign]');await page.click('[data-action=confirm-resign]');check('confirmed resignation ends game and clears Continue',(await state(page)).screen==='over'&&(await state(page)).fen===null);await page.click('#over [data-action=to-menu]');check('resigned game no longer offers Continue',!await page.locator('#continue-btn').isVisible());
  await seed(page,{fen:'7k/5Q2/6K1/8/8/8/8/8 w - - 0 1',human:'w',difficulty:'intermediate'});await page.click('#continue-btn');await move(page,'f7','g7');check('checkmate completes game with correct result',(await state(page)).screen==='over'&&await page.locator('#over-result').textContent()==='Checkmate'&&await page.locator('#over-detail').textContent()==='You win!');await shot(page,'after-checkmate');await page.click('[data-action=rematch]');check('rematch starts a fresh legal position',(await state(page)).fen===startFen);
  const faulty=await browser.newContext({viewport:{width:600,height:600}});await faulty.addInitScript(()=>{window.Worker=class{constructor(){throw new Error('Test-only worker failure')}}});const fault=await faulty.newPage();await fault.goto(origin);await begin(fault,'w','intermediate');await move(fault,'e2','e4');await aiDone(fault);check('unavailable engine falls back instead of stranding turn',(await state(fault)).turn==='w'&&(await state(fault)).fen.split(' ')[5]==='2');await faulty.close();
 check('no runtime errors',report.errors.length===0&&report.console.length===0,{errors:report.errors,console:report.console});
 report.metrics=await page.evaluate(()=>({canvasCount:document.querySelectorAll('canvas').length,canvasPixels:document.querySelector('canvas').width*document.querySelector('canvas').height,resources:performance.getEntriesByType('resource').map(r=>({name:r.name.split('/').pop(),bytes:r.transferSize})),domElements:document.querySelectorAll('*').length}));
 }catch(e){report.failure=e.stack;process.exitCode=1}finally{await browser.close();server?.kill();report.passed=report.checks.filter(c=>c.pass).length;report.failed=report.checks.filter(c=>!c.pass).length+(report.failure&&!report.checks.some(c=>!c.pass)?1:0);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,failed:report.failed,failure:report.failure}));}})();
