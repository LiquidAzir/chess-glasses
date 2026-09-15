// Original sculpted Staunton artwork. Twelve small sprites are decoded once;
// the board is painted only when the position/orientation changes, never per frame.
const forms = {
 p: '<path d="M35 76Q43 67 43 49H57Q57 67 65 76Z"/><ellipse cx="50" cy="49" rx="14" ry="4"/><circle cx="50" cy="32" r="13"/><path class="shine" d="M43 25Q48 19 55 23"/>',
 r: '<path d="M32 76L36 39H64L68 76Z"/><path d="M28 22H38V31H45V21H55V31H62V22H72V41H28Z"/><path class="shade" d="M58 45L62 73H67L64 45Z"/><path class="line" d="M29 36H71M35 47H65M38 55H46M55 63H65"/>',
 n: '<path d="M28 76Q25 55 33 39Q38 30 47 25L48 12L57 23L64 15L66 30L80 42Q83 45 79 51L69 53L59 48Q51 52 54 61L69 76Z"/><path class="shade" d="M47 27Q27 46 31 74H38Q36 48 52 35Z"/><path class="line" d="M48 34Q36 46 37 67M60 39L70 43M60 49L69 51"/><circle cx="59" cy="34" r="2.7" fill="#101d26"/><circle cx="58" cy="33" r=".8" fill="#fff3d4"/>',
 b: '<path d="M32 76Q41 65 42 54H58Q59 65 68 76Z"/><ellipse cx="50" cy="55" rx="18" ry="4"/><path d="M50 18Q78 42 62 51Q50 57 38 51Q22 42 50 18Z"/><path d="M54 27L45 42" fill="none" stroke="#203844" stroke-width="5"/><circle cx="50" cy="15" r="4"/><path class="shine" d="M39 35Q34 42 39 46"/>',
 q: '<path d="M29 76Q40 66 40 46H60Q60 66 71 76Z"/><ellipse cx="50" cy="46" rx="19" ry="4"/><path d="M33 41L26 20L40 31L43 15L51 31L59 15L63 31L76 20L68 41Z"/><ellipse cx="50" cy="40" rx="19" ry="4"/><circle cx="26" cy="18" r="3.5"/><circle cx="43" cy="13" r="3.5"/><circle cx="59" cy="13" r="3.5"/><circle cx="76" cy="18" r="3.5"/><path class="line" d="M39 58H61M36 68H64"/>',
 k: '<path d="M30 76Q42 65 41 48H59Q58 65 70 76Z"/><ellipse cx="50" cy="48" rx="19" ry="4"/><path d="M34 42L30 30Q40 25 50 31Q60 25 70 30L66 42Z"/><ellipse cx="50" cy="42" rx="17" ry="4"/><path d="M46 8H54V15H61V22H54V31H46V22H39V15H46Z"/><path class="line" d="M40 58H60M36 68H64"/>',
};
const urls = new Map(), sprites = new Map();
function svg(type,color) {
 const white=color==='w',edge=white?'#59452e':'#b0cee0',dark=white?'#a08453':'#263e56',light=white?'#fff8db':'#7195b4',mid=white?'#e7d2a6':'#3b617f';
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="body"><stop stop-color="${dark}"/><stop offset=".26" stop-color="${light}"/><stop offset=".47" stop-color="${mid}"/><stop offset=".8" stop-color="${dark}"/><stop offset="1" stop-color="${light}"/></linearGradient><linearGradient id="rim" x2="0" y2="1"><stop stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs><style>.line{fill:none;stroke:${edge};stroke-width:1.5;opacity:.65}.shine{fill:none;stroke:${light};stroke-width:2.8;stroke-linecap:round}.shade{fill:${dark};stroke:none}</style><ellipse cx="53" cy="90" rx="35" ry="6" fill="#080d12" opacity=".55"/><g fill="url(#body)" stroke="${edge}" stroke-width="1.4" stroke-linejoin="round">${forms[type]||forms.p}<path d="M28 74H72L78 84Q79 90 50 91Q21 90 22 84Z"/><ellipse cx="50" cy="75" rx="23" ry="4" fill="url(#rim)"/><path d="M24 82Q49 89 76 82" fill="none" stroke="${light}" stroke-width="2"/><path d="M23 87Q49 93 77 87" fill="none" stroke="${edge}" stroke-width="1.4"/></g></svg>`;
}
function url(type,color){const key=type+color;if(!urls.has(key))urls.set(key,'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg(type,color)));return urls.get(key)}
export function pieceSvg(type,color){return `<img class="piece piece-${color==='w'?'white':'black'}" src="${url(type,color)}" width="100" height="100" alt="" draggable="false">`}
export const artReady=Promise.all(['w','b'].flatMap(color=>Object.keys(forms).map(type=>new Promise(resolve=>{const image=new Image();image.onload=()=>{sprites.set(type+color,image);resolve()};image.onerror=resolve;image.src=url(type,color)}))));
const base=document.createElement('canvas');base.width=500;base.height=500;
const c=base.getContext('2d');
const wood=c.createLinearGradient(0,0,500,500);wood.addColorStop(0,'#967347');wood.addColorStop(.08,'#372b23');wood.addColorStop(.94,'#55412d');wood.addColorStop(1,'#bd955b');c.fillStyle=wood;c.fillRect(0,0,500,500);
c.strokeStyle='#d7b877';c.lineWidth=1;c.strokeRect(3.5,3.5,493,493);c.strokeStyle='#131f21';c.lineWidth=4;c.strokeRect(12,12,476,476);
for(let r=0;r<8;r++)for(let f=0;f<8;f++){
 const x=14+f*59,y=14+r*59,light=(r+f)%2===0,g=c.createLinearGradient(x,y,x+59,y+59);
 g.addColorStop(0,light?'#d7c69f':'#466d6c');g.addColorStop(1,light?'#b9a47d':'#304e50');c.fillStyle=g;c.fillRect(x,y,59,59);
 c.fillStyle=light?'#fff4d017':'#b2ddd20d';for(let k=0;k<8;k++)c.fillRect(x+((k*19+r*7+f*13)%55),y,1,59);
 c.strokeStyle=light?'#fff1c53b':'#86b7aa22';c.strokeRect(x+.5,y+.5,58,58);
}
c.fillStyle='#e8ce91';for(const [x,y]of[[7,7],[493,7],[7,493],[493,493]]){c.beginPath();c.arc(x,y,1.7,0,Math.PI*2);c.fill()}
let painted='';
export function paintBoard(canvas,game,flipped){
 const key=game.fen()+flipped;if(key===painted&&canvas.dataset.painted)return;
 painted=key;canvas.dataset.painted='yes';
 const scale=Math.min(window.devicePixelRatio||1,2);canvas.width=500*scale;canvas.height=500*scale;
 const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.drawImage(base,0,0);
 ctx.font='9px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#f6dfaa';
 for(let i=0;i<8;i++){ctx.fillText(String.fromCharCode(97+(flipped?7-i:i)),43.5+i*59,493);ctx.fillText(String(flipped?i+1:8-i),7,43.5+i*59)}
 const board=game.board();for(let r=0;r<8;r++)for(let f=0;f<8;f++){const p=board[r][f];if(!p)continue;const image=sprites.get(p.type+p.color);if(image)ctx.drawImage(image,14+(flipped?7-f:f)*59,12+(flipped?7-r:r)*59,59,59)}
}
export function repaintArt(){painted=''}
