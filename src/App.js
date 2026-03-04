import { useState, useRef, useCallback, useEffect } from "react";

// ─── id generators ────────────────────────────────────────────────────────────
let _seq = 5000;
const nid = () => `n${++_seq}`;
const eid = () => `e${++_seq}`;
const cln = o => JSON.parse(JSON.stringify(o));

// ─── Gist helpers ─────────────────────────────────────────────────────────────
const GF   = "fcb-data.json";
const TGF  = "fcb-team.json";
const LT   = "fc:tok";
const LG   = "fc:gid";
const LTT  = "fc:ttok";
const LTG  = "fc:tgid";

const gh = t => ({ Authorization:`token ${t}`, "Content-Type":"application/json", Accept:"application/vnd.github.v3+json" });
const gGET   = (u,t)   => fetch(u,{headers:gh(t)}).then(r=>{if(!r.ok)throw r;return r.json();});
const gPOST  = (u,t,b) => fetch(u,{method:"POST", headers:gh(t),body:JSON.stringify(b)}).then(r=>{if(!r.ok)throw r;return r.json();});
const gPATCH = (u,t,b) => fetch(u,{method:"PATCH",headers:gh(t),body:JSON.stringify(b)}).then(r=>{if(!r.ok)throw r;return r.json();});

const whoami    = t   => gGET("https://api.github.com/user",t).then(d=>d.login);
const readGist  = async(t,id,f)=>{ const d=await gGET(`https://api.github.com/gists/${id}`,t); const c=d.files[f]?.content; return c?JSON.parse(c):null; };
const writeGist = (t,id,f,v) => gPATCH(`https://api.github.com/gists/${id}`,t,{files:{[f]:{content:JSON.stringify(v,null,2)}}});
const makeGist  = async(t,f,v,desc)=>{ const d=await gPOST("https://api.github.com/gists",t,{description:desc,public:false,files:{[f]:{content:JSON.stringify(v,null,2)}}}); return d.id; };
const findGist  = async(t,f)=>{
  for(let p=1;;p++){
    const d=await gGET(`https://api.github.com/gists?per_page=100&page=${p}`,t);
    if(!d.length) return null;
    const hit=d.find(g=>g.files?.[f]); if(hit) return hit.id;
    if(d.length<100) return null;
  }
};
const ensureGist = async(t,lsKey,f,def,desc)=>{
  let id=localStorage.getItem(lsKey);
  if(!id){ id=await findGist(t,f); if(id) localStorage.setItem(lsKey,id); }
  if(!id){ id=await makeGist(t,f,def,desc); localStorage.setItem(lsKey,id); }
  const data=await readGist(t,id,f);
  return { id, data:data||def };
};

// ─── shape library ────────────────────────────────────────────────────────────
const SHAPES = {
  rect:          { label:"Rectangle",     icon:"▭" },
  rounded:       { label:"Rounded Rect",  icon:"▢" },
  diamond:       { label:"Diamond",       icon:"◇" },
  parallelogram: { label:"Parallelogram", icon:"▱" },
  cylinder:      { label:"Cylinder",      icon:"⬭" },
  oval:          { label:"Oval / Circle", icon:"◯" },
  hexagon:       { label:"Hexagon",       icon:"⬡" },
  document:      { label:"Document",      icon:"🗋" },
};

function ShapePath({ shape="rect", x, y, w, h, fill, stroke, sw=1.8, fid }) {
  const F = fid ? `url(#${fid})` : "none";
  const cx=x+w/2, cy=y+h/2;
  switch (shape) {
    case "rounded":       return <rect x={x} y={y} width={w} height={h} rx={12} fill={fill} stroke={stroke} strokeWidth={sw} filter={F}/>;
    case "diamond":       return <polygon points={`${cx},${y} ${x+w},${cy} ${cx},${y+h} ${x},${cy}`} fill={fill} stroke={stroke} strokeWidth={sw} filter={F}/>;
    case "parallelogram": { const sk=14; return <polygon points={`${x+sk},${y} ${x+w},${y} ${x+w-sk},${y+h} ${x},${y+h}`} fill={fill} stroke={stroke} strokeWidth={sw} filter={F}/>; }
    case "cylinder":      { const ry=8; return <g filter={F}><path d={`M${x},${y+ry} Q${x},${y} ${cx},${y} Q${x+w},${y} ${x+w},${y+ry} L${x+w},${y+h-ry} Q${x+w},${y+h} ${cx},${y+h} Q${x},${y+h} ${x},${y+h-ry} Z`} fill={fill} stroke={stroke} strokeWidth={sw}/><ellipse cx={cx} cy={y+ry} rx={w/2} ry={ry} fill={fill} stroke={stroke} strokeWidth={sw}/></g>; }
    case "oval":          return <ellipse cx={cx} cy={cy} rx={w/2} ry={h/2} fill={fill} stroke={stroke} strokeWidth={sw} filter={F}/>;
    case "hexagon":       { const r=h/2, s=w/2-r*0.3; return <polygon points={`${cx-s},${y} ${cx+s},${y} ${x+w},${cy} ${cx+s},${y+h} ${cx-s},${y+h} ${x},${cy}`} fill={fill} stroke={stroke} strokeWidth={sw} filter={F}/>; }
    case "document":      { const wv=8; return <path d={`M${x},${y} L${x+w},${y} L${x+w},${y+h-wv} Q${x+w*0.75},${y+h+wv} ${cx},${y+h-wv} Q${x+w*0.25},${y+h-wv*3} ${x},${y+h-wv} Z`} fill={fill} stroke={stroke} strokeWidth={sw} filter={F}/>; }
    default:              return <rect x={x} y={y} width={w} height={h} rx={6} fill={fill} stroke={stroke} strokeWidth={sw} filter={F}/>;
  }
}

// ─── layout constants ─────────────────────────────────────────────────────────
const NW=148, NH=48;
const SIDES=["top","bottom","left","right"];
const TI = {
  rect:          {x:8, y:2,  w:NW-42,h:NH-4},
  rounded:       {x:12,y:2,  w:NW-46,h:NH-4},
  diamond:       {x:22,y:6,  w:NW-50,h:NH-12},
  parallelogram: {x:20,y:2,  w:NW-54,h:NH-4},
  cylinder:      {x:8, y:10, w:NW-42,h:NH-16},
  oval:          {x:18,y:6,  w:NW-52,h:NH-12},
  hexagon:       {x:20,y:4,  w:NW-54,h:NH-8},
  document:      {x:8, y:2,  w:NW-42,h:NH-10},
};

function hpos(node, side) {
  const {x,y}=node;
  if(side==="top")    return {x:x+NW/2, y};
  if(side==="bottom") return {x:x+NW/2, y:y+NH};
  if(side==="left")   return {x,        y:y+NH/2};
  return                     {x:x+NW,   y:y+NH/2};
}

// ─── color scheme ─────────────────────────────────────────────────────────────
const SCHEMES = {
  sharepoint:{ root:{bg:"#1e3a5f",text:"#fff",border:"#0f2240"}, dept:{bg:"#4a90d9",text:"#fff",border:"#2c6fad"}, sub:{bg:"#e8f0fe",text:"#1e3a5f",border:"#4a90d9"}, leaf:{bg:"#f8faff",text:"#2d3748",border:"#b3d4f5"} },
  green:     { root:{bg:"#1a4731",text:"#fff",border:"#0f2d1e"}, dept:{bg:"#27ae60",text:"#fff",border:"#1e8449"}, sub:{bg:"#eafaf1",text:"#1a4731",border:"#27ae60"}, leaf:{bg:"#f9fefe",text:"#2d3748",border:"#a9dfbf"} },
  purple:    { root:{bg:"#3b1f6e",text:"#fff",border:"#260f52"}, dept:{bg:"#8e44ad",text:"#fff",border:"#6c3483"}, sub:{bg:"#f5eef8",text:"#3b1f6e",border:"#8e44ad"}, leaf:{bg:"#fdfefe",text:"#2d3748",border:"#d7bde2"} },
  orange:    { root:{bg:"#7d3c0a",text:"#fff",border:"#5d2d07"}, dept:{bg:"#e67e22",text:"#fff",border:"#ca6f1e"}, sub:{bg:"#fef5e7",text:"#7d3c0a",border:"#e67e22"}, leaf:{bg:"#fffdf9",text:"#2d3748",border:"#fad7a0"} },
};
const SWATCHES=["#1e3a5f","#4a90d9","#27ae60","#8e44ad","#e67e22","#e05a5a","#16a085","#2c3e50","#f39c12","#d35400","#7f8c8d","#1abc9c","#e8f0fe","#eafaf1","#f5eef8","#fef5e7","#ffffff","#f0f4fa","#2d3748","#000000"];
const TEMPLATES=[{label:"Blank",icon:"✨",scheme:"sharepoint",desc:"Empty canvas"},{label:"Workflow",icon:"📋",scheme:"green",desc:"Task flow"},{label:"Org Chart",icon:"🏢",scheme:"purple",desc:"Team structure"},{label:"Decisions",icon:"🔀",scheme:"orange",desc:"Yes / No tree"}];
const TC=[{bg:"#dbeafe",text:"#1e40af",border:"#93c5fd"},{bg:"#dcfce7",text:"#166534",border:"#86efac"},{bg:"#fce7f3",text:"#9d174d",border:"#f9a8d4"},{bg:"#fef9c3",text:"#854d0e",border:"#fde047"},{bg:"#ede9fe",text:"#5b21b6",border:"#c4b5fd"},{bg:"#ffedd5",text:"#9a3412",border:"#fdba74"},{bg:"#e0f2fe",text:"#0c4a6e",border:"#7dd3fc"},{bg:"#f1f5f9",text:"#334155",border:"#cbd5e1"}];
const tc = t => TC[Math.abs([...t].reduce((a,c)=>a+c.charCodeAt(0),0))%TC.length];

const ct = hex => { const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return (r*299+g*587+b*114)/1000>128?"#1e1e1e":"#fff"; };
const dk = (hex,a=30) => { const f=n=>Math.max(0,Math.min(255,parseInt(hex.slice(n,n+2),16)-a)).toString(16).padStart(2,"0"); return `#${f(1)}${f(3)}${f(5)}`; };
const nc = (node,scheme) => node.cc ? {bg:node.cc,text:ct(node.cc),border:dk(node.cc)} : (scheme.sub||scheme.leaf);

const mkNode = (lbl,x,y,shape="rect") => ({id:nid(),label:lbl,shape,x,y,cc:null,url:""});

// ─── default data ─────────────────────────────────────────────────────────────
const SN = [mkNode("Start",100,160,"oval"),mkNode("Process",340,160,"rect"),mkNode("Decision",580,160,"diamond"),mkNode("End",820,160,"oval")];
const SE = [
  {id:eid(),from:SN[0].id,fs:"right",to:SN[1].id,ts:"left", label:""},
  {id:eid(),from:SN[1].id,fs:"right",to:SN[2].id,ts:"left", label:""},
  {id:eid(),from:SN[2].id,fs:"right",to:SN[3].id,ts:"left", label:"Yes"},
];
const D_MY   = [{id:"c1",name:"Sample Flowchart",icon:"📋",scheme:"green",nodes:cln(SN),edges:cln(SE),tags:[],createdAt:new Date().toLocaleDateString(),owner:"me"}];
const D_TEAM = [];

// ─── tiny UI atoms ────────────────────────────────────────────────────────────
function Fld({label,value,onChange,placeholder,autoFocus,type="text",hint}){
  return(<div style={{marginBottom:12}}><label style={{fontSize:11,color:"#555",display:"block",marginBottom:4,fontWeight:600}}>{label}</label><input autoFocus={autoFocus} value={value} placeholder={placeholder} type={type} onChange={e=>onChange(e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:7,border:"1.5px solid #d0dcea",fontSize:13,boxSizing:"border-box",outline:"none"}}/>{hint&&<p style={{fontSize:11,color:"#888",margin:"4px 0 0"}}>{hint}</p>}</div>);
}
function BR({children}){return <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:10}}>{children}</div>;}
function B({v,onClick,children,disabled}){
  const S={primary:{background:"#4a90d9",color:"#fff",border:"none"},outline:{background:"#fff",color:"#4a90d9",border:"1.5px solid #4a90d9"},danger:{background:"#fff",color:"#e05a5a",border:"1.5px solid #e05a5a"},ghost:{background:"#fff",color:"#888",border:"1.5px solid #ccc"},team:{background:"#8e44ad",color:"#fff",border:"none"},move:{background:"#16a085",color:"#fff",border:"none"},dup:{background:"#f39c12",color:"#fff",border:"none"}};
  return <button onClick={onClick} disabled={!!disabled} style={{padding:"7px 14px",borderRadius:7,fontSize:12,cursor:disabled?"not-allowed":"pointer",fontWeight:600,opacity:disabled?0.6:1,...S[v]}}>{children}</button>;
}
function TB({onClick,children}){return <button onClick={onClick} style={{padding:"4px 10px",borderRadius:7,border:"1px solid #4a90d9",background:"transparent",color:"#a0c0e8",fontSize:12,cursor:"pointer",fontWeight:600}}>{children}</button>;}
function Toasty({msg,type}){if(!msg)return null;const bg={error:"#c0392b",warning:"#e67e22",team:"#8e44ad",move:"#16a085",dup:"#f39c12"}[type]||"#1e3a5f";return <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:bg,color:"#fff",padding:"10px 22px",borderRadius:20,fontSize:13,boxShadow:"0 4px 20px #0004",zIndex:9999,whiteSpace:"nowrap"}}>{msg}</div>;}
function TagBadge({tag,onRemove}){const c=tc(tag);return <span style={{display:"inline-flex",alignItems:"center",gap:4,background:c.bg,color:c.text,border:`1px solid ${c.border}`,borderRadius:12,padding:"2px 8px",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}># {tag}{onRemove&&<span onClick={e=>{e.stopPropagation();onRemove(tag);}} style={{cursor:"pointer",fontSize:12,opacity:0.7}}>×</span>}</span>;}
function TagEditor({tags=[],onChange}){
  const [inp,setInp]=useState("");
  const add=()=>{const t=inp.trim().toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"");if(!t||tags.includes(t))return;onChange([...tags,t]);setInp("");};
  return(<div><label style={{fontSize:11,color:"#555",display:"block",marginBottom:6,fontWeight:600}}>Tags</label><div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8,minHeight:28}}>{tags.map(t=><TagBadge key={t} tag={t} onRemove={x=>onChange(tags.filter(y=>y!==x))}/>)}{!tags.length&&<span style={{color:"#aaa",fontSize:12}}>No tags yet</span>}</div><div style={{display:"flex",gap:6}}><input value={inp} onChange={e=>setInp(e.target.value)} onKeyDown={e=>{if(["Enter",","," "].includes(e.key)){e.preventDefault();add();}}} placeholder="Add tag…" style={{flex:1,padding:"6px 10px",borderRadius:7,border:"1.5px solid #d0dcea",fontSize:12,outline:"none"}}/><button onClick={add} style={{padding:"6px 12px",borderRadius:7,background:"#4a90d9",color:"#fff",border:"none",fontSize:12,cursor:"pointer",fontWeight:600}}>＋</button></div></div>);
}
function ColPick({current,onSelect,onReset}){
  const [hex,setHex]=useState(current||"#4a90d9");
  return(<div><p style={{fontSize:11,fontWeight:600,color:"#888",textTransform:"uppercase",letterSpacing:1,margin:"0 0 8px"}}>Swatches</p><div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>{SWATCHES.map(s=><div key={s} onClick={()=>onSelect(s)} style={{width:22,height:22,borderRadius:5,background:s,cursor:"pointer",flexShrink:0,boxSizing:"border-box",transition:"transform .1s",border:current===s?"3px solid #1e3a5f":"1.5px solid #ccc"}} onMouseEnter={e=>e.currentTarget.style.transform="scale(1.25)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}/>)}</div><div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}><input type="color" value={hex} onChange={e=>setHex(e.target.value)} style={{width:36,height:30,border:"1.5px solid #ccc",borderRadius:6,cursor:"pointer",padding:2}}/><input value={hex} onChange={e=>setHex(e.target.value)} style={{flex:1,padding:"6px 8px",borderRadius:6,border:"1.5px solid #ccc",fontSize:12,outline:"none"}}/><button onClick={()=>onSelect(hex)} style={{padding:"6px 12px",borderRadius:6,background:"#4a90d9",color:"#fff",border:"none",fontSize:12,cursor:"pointer",fontWeight:600}}>Apply</button></div>{onReset&&<button onClick={onReset} style={{width:"100%",padding:"6px",borderRadius:6,background:"#f0f4fa",color:"#555",border:"1.5px solid #ccc",fontSize:12,cursor:"pointer"}}>↺ Reset</button>}</div>);
}
function ShapePick({current,onChange}){
  return(<div><label style={{fontSize:11,color:"#555",display:"block",marginBottom:8,fontWeight:600}}>Shape</label><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>{Object.entries(SHAPES).map(([k,{label,icon}])=><div key={k} onClick={()=>onChange(k)} style={{padding:"8px 4px",borderRadius:8,border:`2px solid ${current===k?"#4a90d9":"#e0e8f0"}`,background:current===k?"#e8f0fe":"#f9fafb",cursor:"pointer",textAlign:"center"}}><div style={{fontSize:18,marginBottom:2}}>{icon}</div><div style={{fontSize:9,color:"#555",fontWeight:600,lineHeight:1.2}}>{label}</div></div>)}</div></div>);
}
function Mini({chart}){
  const nodes=(chart.nodes||[]).slice(0,8), scheme=SCHEMES[chart.scheme]||SCHEMES.sharepoint;
  if(!nodes.length)return null;
  const xs=nodes.map(n=>n.x),ys=nodes.map(n=>n.y);
  const mnx=Math.min(...xs),mxx=Math.max(...xs)+NW,mny=Math.min(...ys),mxy=Math.max(...ys)+NH;
  const W=mxx-mnx||1,H=mxy-mny||1,sc=Math.min(220/W,90/H,1);
  return(<svg width="100%" height="100%" viewBox="-10 -5 240 100" style={{opacity:.85}}><g transform={`translate(${10+(220-W*sc)/2},${5+(90-H*sc)/2}) scale(${sc})`}>{nodes.map(n=>{const c=nc(n,scheme);return<ShapePath key={n.id} shape={n.shape||"rect"} x={n.x-mnx} y={n.y-mny} w={NW} h={NH} fill={c.bg} stroke={c.border} sw={2}/>;})}</g></svg>);
}

// ─── token setup ──────────────────────────────────────────────────────────────
function Setup({onConnect}){
  const [tok,setTok]=useState(""),[ tt,setTt]=useState(""),[ busy,setBusy]=useState(false),[err,setErr]=useState(""),[st,setSt]=useState(false);
  const go=async()=>{if(!tok.trim()){setErr("Enter your PAT.");return;}setBusy(true);setErr("");try{const u=await whoami(tok.trim());localStorage.setItem(LT,tok.trim());if(tt.trim()){try{await whoami(tt.trim());localStorage.setItem(LTT,tt.trim());}catch(_){}}onConnect(tok.trim(),u);}catch(_){setErr("❌ Invalid token.");}finally{setBusy(false);}};
  return(<div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0f1e35,#1e3a5f)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Segoe UI',sans-serif",padding:24}}><div style={{background:"#fff",borderRadius:16,padding:32,width:"100%",maxWidth:460,boxShadow:"0 8px 40px #0005"}}><div style={{textAlign:"center",marginBottom:24}}><div style={{fontSize:40,marginBottom:8}}>🔑</div><h2 style={{margin:"0 0 6px",color:"#1e3a5f",fontSize:22,fontWeight:800}}>Connect Your Account</h2><p style={{margin:0,color:"#777",fontSize:13}}>Charts saved to your private GitHub Gist.</p></div><Fld label="Personal Access Token" value={tok} onChange={setTok} type="password" autoFocus hint="Needs 'gist' scope" placeholder="ghp_..."/>{err&&<p style={{color:"#e05a5a",fontSize:12,margin:"-8px 0 12px"}}>{err}</p>}<div style={{background:"#f0f7ff",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:"#2c5282"}}><b>Get a token:</b> github.com/settings/tokens → Generate new token (classic) → check <b>gist</b></div><div style={{borderTop:"1px solid #e8f0fe",paddingTop:14,marginBottom:14}}><button onClick={()=>setSt(v=>!v)} style={{background:"transparent",border:"none",color:"#8e44ad",fontSize:13,cursor:"pointer",fontWeight:600,padding:0}}>{st?"▼":"▶"} 🟣 Team Space (optional)</button>{st&&<div style={{marginTop:12}}><Fld label="Team PAT" value={tt} onChange={setTt} type="password" hint="Ask your admin." placeholder="ghp_team_..."/></div>}</div><button onClick={go} disabled={busy} style={{width:"100%",padding:"11px",borderRadius:9,background:"linear-gradient(135deg,#4a90d9,#27ae60)",color:"#fff",border:"none",fontSize:14,fontWeight:700,cursor:busy?"not-allowed":"pointer",opacity:busy?.7:1}}>{busy?"Connecting...":"🔗 Connect & Continue"}</button></div></div>);
}

// ─── context menu ─────────────────────────────────────────────────────────────
function CtxMenu({x,y,node,onClose,onEdit,onDup,onDel,onShape}){
  const [ss,setSs]=useState(false);
  const ref=useRef();
  useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))onClose();};window.addEventListener("pointerdown",h);return()=>window.removeEventListener("pointerdown",h);},[onClose]);
  const vw=window.innerWidth,vh=window.innerHeight;
  const mw=190,cx2=Math.min(x,vw-mw-8),cy2=Math.min(y,vh-240);
  const sw=218,sx=cx2+mw+sw<vw?cx2+mw:cx2-sw,sy=Math.min(cy2+90,vh-295);
  const row=(icon,lbl,fn,danger=false)=><button key={lbl} onClick={()=>{fn();onClose();}} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"8px 14px",border:"none",background:"transparent",cursor:"pointer",fontSize:12,color:danger?"#e05a5a":"#2d3748",textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=danger?"#fff5f5":"#f0f7ff"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{icon} {lbl}</button>;
  return(<>
    <div ref={ref} onPointerDown={e=>e.stopPropagation()} style={{position:"fixed",left:cx2,top:cy2,background:"#fff",borderRadius:10,boxShadow:"0 4px 24px #0003",zIndex:1000,minWidth:mw,overflow:"hidden",border:"1px solid #e0e8f0"}}>
      <div style={{padding:"8px 12px",background:"#f0f7ff",borderBottom:"1px solid #e0e8f0",fontSize:12,fontWeight:700,color:"#1e3a5f",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📁 {node.label}</div>
      {row("✏️","Edit / Rename",onEdit)}
      {row("⧉","Duplicate Node",onDup)}
      <button onClick={()=>setSs(v=>!v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"8px 14px",border:"none",background:ss?"#e8f0fe":"transparent",cursor:"pointer",fontSize:12,color:"#2d3748"}} onMouseEnter={e=>e.currentTarget.style.background="#f0f7ff"} onMouseLeave={e=>e.currentTarget.style.background=ss?"#e8f0fe":"transparent"}><span>🔷 Change Shape</span><span style={{fontSize:10,color:"#4a90d9"}}>{ss?"◀":"▶"}</span></button>
      <div style={{borderTop:"1px solid #fee2e2"}}>{row("🗑️","Delete Node",onDel,true)}</div>
    </div>
    {ss&&<div onPointerDown={e=>e.stopPropagation()} style={{position:"fixed",left:sx,top:sy,background:"#fff",borderRadius:12,boxShadow:"0 6px 28px #0004",border:"1px solid #e0e8f0",padding:10,zIndex:1001,width:sw}}>
      <div style={{fontSize:11,fontWeight:700,color:"#1e3a5f",marginBottom:8,paddingBottom:6,borderBottom:"1px solid #e8f0fe"}}>🔷 Select Shape</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>{Object.entries(SHAPES).map(([k,{label,icon}])=><button key={k} onClick={()=>{onShape(k);onClose();}} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"8px 4px",border:`2px solid ${(node.shape||"rect")===k?"#4a90d9":"#e0e8f0"}`,borderRadius:8,background:(node.shape||"rect")===k?"#e8f0fe":"#fafafa",cursor:"pointer"}} onMouseEnter={e=>{if((node.shape||"rect")!==k)e.currentTarget.style.background="#f0f7ff";}} onMouseLeave={e=>{if((node.shape||"rect")!==k)e.currentTarget.style.background="#fafafa";}}><span style={{fontSize:20,marginBottom:3}}>{icon}</span><span style={{fontSize:9,color:"#555",fontWeight:600,lineHeight:1.2}}>{label}</span></button>)}</div>
    </div>}
  </>);
}

// ══════════════════════════════════════════════════════════════════════════════
// EDITOR
// ══════════════════════════════════════════════════════════════════════════════
function Editor({chart,onBack,onSave,isTeam}){
  const [nodes,setNodes] = useState(()=>cln(chart.nodes||[]));
  const [edges,setEdges] = useState(()=>cln(chart.edges||[]));
  const [selN,setSelN]   = useState(null);
  const [selE,setSelE]   = useState(null);
  const [hovN,setHovN]   = useState(null);
  const [modal,setModal] = useState(null);
  const [ctx,setCtx]     = useState(null);
  const [form,setForm]   = useState({label:"",url:""});
  const [tab,setTab]     = useState("info");
  const [vp,setVp]       = useState({x:60,y:80,scale:1});
  const [toast,setToast] = useState({msg:"",type:""});
  const [dirty,setDirty] = useState(false);
  const [conn,setConn]   = useState(null);
  const [mouse,setMouse] = useState({x:0,y:0});

  const vpR   = useRef(vp);  vpR.current=vp;
  const drag  = useRef(null);
  const cvR   = useRef();
  const autoR = useRef(null);
  const savR  = useRef(onSave); useEffect(()=>{savR.current=onSave;},[onSave]);
  const chrR  = useRef(chart);  useEffect(()=>{chrR.current=chart;},[chart]);
  const scheme= SCHEMES[chart.scheme]||SCHEMES.green;
  const accent= isTeam?"#8e44ad":"#4a90d9";

  const t2=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast({msg:"",type:""}),2500);};

  useEffect(()=>{
    if(!dirty)return;
    clearTimeout(autoR.current);
    autoR.current=setTimeout(async()=>{
      try{ await savR.current({...chrR.current,nodes,edges},true); setDirty(false); t2("Auto-saved ✓",isTeam?"team":"success"); }
      catch(_){ t2("Auto-save failed","error"); }
    },1500);
    return()=>clearTimeout(autoR.current);
  },[nodes,edges,dirty]);

  const mN=fn=>{setNodes(p=>{const n=fn(cln(p));return n;});setDirty(true);};
  const mE=fn=>{setEdges(p=>{const n=fn(cln(p));return n;});setDirty(true);};

  const toW=useCallback((sx,sy)=>{
    const r=cvR.current.getBoundingClientRect();
    return{x:(sx-r.left-vpR.current.x)/vpR.current.scale,y:(sy-r.top-vpR.current.y)/vpR.current.scale};
  },[]);

  const onWheel=useCallback(e=>{
    e.preventDefault();
    const f=e.deltaY<0?1.1:0.91,r=cvR.current.getBoundingClientRect();
    const cx=e.clientX-r.left,cy=e.clientY-r.top;
    setVp(p=>{const s=Math.min(3,Math.max(0.15,p.scale*f));return{x:cx-(cx-p.x)*(s/p.scale),y:cy-(cy-p.y)*(s/p.scale),scale:s};});
  },[]);
  useEffect(()=>{const el=cvR.current;el.addEventListener("wheel",onWheel,{passive:false});return()=>el.removeEventListener("wheel",onWheel);},[onWheel]);

  const onCvDown=useCallback(e=>{
    if(e.button!==0||e.target.closest(".ne,.he,.el"))return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelN(null);setSelE(null);setConn(null);
    drag.current={type:"pan",sc:{x:e.clientX,y:e.clientY},sv:{...vpR.current}};
  },[]);

  const onNDown=useCallback((e,id)=>{
    if(e.button!==0)return; e.stopPropagation();
    e.currentTarget.closest(".cv").setPointerCapture(e.pointerId);
    setSelN(id);setSelE(null);
    const w=toW(e.clientX,e.clientY),nd=nodes.find(n=>n.id===id);
    drag.current={type:"node",id,sw:w,sxy:{x:nd.x,y:nd.y},moved:false};
  },[nodes,toW]);

  const onHDown=useCallback((e,nodeId,side)=>{
    e.stopPropagation();
    e.currentTarget.closest(".cv").setPointerCapture(e.pointerId);
    const nd=nodes.find(n=>n.id===nodeId);
    setConn({nodeId,side,...hpos(nd,side)});
    drag.current={type:"conn"};
  },[nodes]);

  const onPMove=useCallback(e=>{
    const w=toW(e.clientX,e.clientY); setMouse(w);
    const d=drag.current; if(!d)return;
    if(d.type==="pan") setVp({...d.sv,x:d.sv.x+(e.clientX-d.sc.x),y:d.sv.y+(e.clientY-d.sc.y)});
    else if(d.type==="node"){
      const dx=w.x-d.sw.x,dy=w.y-d.sw.y;
      if(Math.abs(dx)>2||Math.abs(dy)>2)d.moved=true;
      if(!d.moved)return;
      mN(ns=>{const n=ns.find(x=>x.id===d.id);if(n){n.x=d.sxy.x+dx;n.y=d.sxy.y+dy;}return ns;});
    }
  },[toW]);

  const onPUp=useCallback(e=>{
    if(drag.current?.type==="conn"&&conn){
      const w=toW(e.clientX,e.clientY);
      let hit=null;
      for(const nd of nodes){
        if(nd.id===conn.nodeId)continue;
        for(const side of SIDES){
          const hp=hpos(nd,side);
          if(Math.abs(hp.x-w.x)<16&&Math.abs(hp.y-w.y)<16){hit={nodeId:nd.id,side};break;}
        }
        if(hit)break;
      }
      if(hit){ mE(es=>[...es,{id:eid(),from:conn.nodeId,fs:conn.side,to:hit.nodeId,ts:hit.side,label:""}]); t2("Edge connected ✓"); }
      setConn(null);
    }
    drag.current=null;
  },[conn,nodes,toW]);

  const epth=useCallback(edge=>{
    const fn=nodes.find(n=>n.id===edge.from),tn=nodes.find(n=>n.id===edge.to);
    if(!fn||!tn)return null;
    const s=hpos(fn,edge.fs||"right"),t=hpos(tn,edge.ts||"left");
    const g=Math.max(50,Math.abs(t.x-s.x)*.45,Math.abs(t.y-s.y)*.45);
    let c1x=s.x,c1y=s.y,c2x=t.x,c2y=t.y;
    const fs=edge.fs||"right",ts2=edge.ts||"left";
    if(fs==="right")c1x+=g; else if(fs==="left")c1x-=g; else if(fs==="bottom")c1y+=g; else c1y-=g;
    if(ts2==="left")c2x-=g; else if(ts2==="right")c2x+=g; else if(ts2==="top")c2y-=g; else c2y+=g;
    return{d:`M${s.x},${s.y} C${c1x},${c1y} ${c2x},${c2y} ${t.x},${t.y}`,mx:(s.x+t.x)/2,my:(s.y+t.y)/2};
  },[nodes]);

  const addNode=()=>{const nd=mkNode("New Node",120+Math.random()*280,120+Math.random()*180);mN(ns=>[...ns,nd]);setSelN(nd.id);setForm({label:"New Node",url:""});setTab("info");setModal({type:"node",id:nd.id});};
  const openNEdit=id=>{const nd=nodes.find(n=>n.id===id);setForm({label:nd.label,url:nd.url||""});setTab("info");setModal({type:"node",id});};
  const openEEdit=id=>{const ed=edges.find(e=>e.id===id);setForm({label:ed.label||""});setModal({type:"edge",id});};
  const saveModal=()=>{if(modal.type==="node")mN(ns=>ns.map(n=>n.id===modal.id?{...n,label:form.label,url:form.url}:n));else mE(es=>es.map(e=>e.id===modal.id?{...e,label:form.label}:e));setModal(null);};
  const delN=id=>{mN(ns=>ns.filter(n=>n.id!==id));mE(es=>es.filter(e=>e.from!==id&&e.to!==id));setSelN(null);};
  const delE=id=>{mE(es=>es.filter(e=>e.id!==id));setSelE(null);};
  const dupN=id=>{const nd=nodes.find(n=>n.id===id);if(!nd)return;mN(ns=>[...ns,{...cln(nd),id:nid(),x:nd.x+30,y:nd.y+30}]);t2("Duplicated ✓","dup");};
  const mNode=modal?.type==="node"?nodes.find(n=>n.id===modal.id):null;
  const prevLine=conn?(()=>{const nd=nodes.find(n=>n.id===conn.nodeId);if(!nd)return null;const hp=hpos(nd,conn.side);return`M${hp.x},${hp.y} L${mouse.x},${mouse.y}`;})():null;

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100vh",fontFamily:"'Segoe UI',sans-serif"}}>
      {/* toolbar */}
      <div style={{background:isTeam?"#2d0a4e":"#1e3a5f",padding:"10px 16px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <button onClick={onBack} style={{background:"transparent",border:`1px solid ${accent}`,color:"#a0c0e8",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:12,fontWeight:600}}>← Back</button>
        <span style={{color:isTeam?"#d7a8ff":"#fff",fontSize:11,fontWeight:700}}>{isTeam?"🟣":"👤"}</span>
        <span style={{color:"#fff",fontWeight:700,fontSize:15}}>{chart.icon} {chart.name}</span>
        {dirty&&<span style={{fontSize:11,color:"#f39c12",background:"#f39c1222",borderRadius:6,padding:"2px 8px"}}>● Unsaved</span>}
        <span style={{color:"#a0c0e8",fontSize:11,flex:1}}>Scroll=Zoom · Drag=Pan · Hover→drag handle=Connect · Right-click=Options</span>
        <button onClick={addNode} style={{background:accent,border:"none",color:"#fff",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:12,fontWeight:600}}>＋ Node</button>
        <span style={{color:"#a0c0e8",fontSize:12}}>{Math.round(vp.scale*100)}%</span>
        <TB onClick={()=>setVp(v=>({...v,scale:Math.min(3,v.scale*1.15)}))}>＋</TB>
        <TB onClick={()=>setVp(v=>({...v,scale:Math.max(0.15,v.scale*.87)}))}>－</TB>
        <TB onClick={()=>setVp({x:60,y:80,scale:1})}>⟳</TB>
        <button onClick={async()=>{clearTimeout(autoR.current);try{await savR.current({...chrR.current,nodes,edges},false);setDirty(false);t2("Saved ✓",isTeam?"team":"success");}catch(_){t2("Save failed","error");}}} style={{background:isTeam?"#8e44ad":"#27ae60",border:"none",color:"#fff",borderRadius:7,padding:"5px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>💾 Save</button>
      </div>

      {/* canvas */}
      <div ref={cvR} className="cv" onPointerDown={onCvDown} onPointerMove={onPMove} onPointerUp={onPUp}
        style={{flex:1,overflow:"hidden",position:"relative",cursor:conn?"crosshair":"grab",userSelect:"none",background:"#f0f4fa"}}>
        <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
          <defs><pattern id="dg2" x={vp.x%(20*vp.scale)} y={vp.y%(20*vp.scale)} width={20*vp.scale} height={20*vp.scale} patternUnits="userSpaceOnUse"><circle cx={1} cy={1} r={1} fill="#c5d5e8"/></pattern></defs>
          <rect width="100%" height="100%" fill="url(#dg2)"/>
        </svg>
        <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",overflow:"visible"}}>
          <defs>
            <filter id="ds"><feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity=".15"/></filter>
            <marker id="ma"  markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3z" fill={accent} opacity=".85"/></marker>
            <marker id="mr"  markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3z" fill="#e05a5a"/></marker>
            <marker id="mpr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3z" fill="#f39c12"/></marker>
          </defs>
          <g transform={`translate(${vp.x},${vp.y}) scale(${vp.scale})`}>

            {/* edges */}
            {edges.map(edge=>{
              const ep=epth(edge); if(!ep)return null;
              const sel=selE===edge.id;
              return(<g key={edge.id} onClick={e=>{e.stopPropagation();setSelE(edge.id);setSelN(null);}}>
                <path d={ep.d} fill="none" stroke="transparent" strokeWidth={14} style={{cursor:"pointer"}}/>
                <path d={ep.d} fill="none" stroke={sel?"#e05a5a":accent} strokeWidth={sel?2.5:1.8} strokeOpacity={sel?1:.65} strokeDasharray={sel?"7,3":"none"} markerEnd={sel?"url(#mr)":"url(#ma)"}/>
                <g className="el" onClick={e=>{e.stopPropagation();openEEdit(edge.id);}} style={{cursor:"pointer"}}>
                  <rect x={ep.mx-32} y={ep.my-12} width={64} height={24} rx={7} fill={sel?"#fff0f0":"#fff"} stroke={sel?"#e05a5a":accent} strokeWidth={1.2}/>
                  <text x={ep.mx} y={ep.my+4} textAnchor="middle" fontSize={11} fill={sel?"#e05a5a":"#2d3748"} fontWeight={600} style={{pointerEvents:"none"}}>{edge.label||"＋ label"}</text>
                </g>
                {sel&&<g onClick={e=>{e.stopPropagation();delE(edge.id);}} style={{cursor:"pointer"}}><circle cx={ep.mx+40} cy={ep.my-12} r={10} fill="#e05a5a"/><text x={ep.mx+40} y={ep.my-8} textAnchor="middle" fontSize={12} fill="#fff" style={{pointerEvents:"none"}}>✕</text></g>}
              </g>);
            })}

            {/* preview */}
            {prevLine&&<path d={prevLine} fill="none" stroke="#f39c12" strokeWidth={2.5} strokeDasharray="7,4" markerEnd="url(#mpr)" opacity=".85}"/>}

            {/* nodes */}
            {nodes.map(node=>{
              const c=nc(node,scheme),sh=node.shape||"rect",ti=TI[sh]||TI.rect;
              const sel=selN===node.id,showH=sel||hovN===node.id||!!conn;
              return(<g key={node.id} className="ne" onPointerDown={e=>onNDown(e,node.id)} onContextMenu={e=>{e.preventDefault();e.stopPropagation();setCtx({x:e.clientX,y:e.clientY,nodeId:node.id});}} onPointerEnter={()=>setHovN(node.id)} onPointerLeave={()=>setHovN(null)} style={{cursor:"grab"}}>
                {sel&&<ShapePath shape={sh} x={node.x-5} y={node.y-5} w={NW+10} h={NH+10} fill="none" stroke={accent} sw={2.5}/>}
                <ShapePath shape={sh} x={node.x+2} y={node.y+3} w={NW} h={NH} fill="#00000010" stroke="none" sw={0}/>
                <ShapePath shape={sh} x={node.x} y={node.y} w={NW} h={NH} fill={c.bg} stroke={c.border} sw={sel?2.5:1.8} fid={sel?"ds":null}/>
                {node.cc&&<circle cx={node.x+10} cy={node.y+10} r={4} fill="#fff" stroke={c.border} strokeWidth={1.5}/>}
                <foreignObject x={node.x+ti.x} y={node.y+ti.y} width={ti.w} height={ti.h}>
                  <div xmlns="http://www.w3.org/1999/xhtml" style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center",fontSize:11,fontWeight:600,color:c.text,lineHeight:1.25,overflow:"hidden",fontFamily:"'Segoe UI',sans-serif",pointerEvents:"none",wordBreak:"break-word"}}>{node.label}</div>
                </foreignObject>
                {node.url&&<g onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();window.open(node.url,"_blank");}} style={{cursor:"pointer"}}><rect x={node.x+NW-26} y={node.y+4} width={20} height={16} rx={4} fill={accent} opacity={.9}/><text x={node.x+NW-16} y={node.y+15} textAnchor="middle" fontSize={10} fill="#fff" style={{pointerEvents:"none"}}>🔗</text></g>}
                {showH&&SIDES.map(side=>{const hp=hpos(node,side);return(<g key={side} className="he" onPointerDown={e=>{e.stopPropagation();onHDown(e,node.id,side);}} style={{cursor:"crosshair"}}><circle cx={hp.x} cy={hp.y} r={12} fill="transparent"/><circle cx={hp.x} cy={hp.y} r={6} fill="#fff" stroke={accent} strokeWidth={2} style={{filter:`drop-shadow(0 0 4px ${accent}99)`}}/><circle cx={hp.x} cy={hp.y} r={3} fill={accent}/></g>);})}
              </g>);
            })}
          </g>
        </svg>
        <div style={{position:"absolute",bottom:12,right:12,background:"#1e3a5fcc",color:"#cde",fontSize:11,borderRadius:8,padding:"6px 12px",pointerEvents:"none",lineHeight:1.6}}>{conn?"🟠 Release on a handle to connect · ESC to cancel":"🔵 Hover node → drag handle · Click edge to label/delete"}</div>
        {conn&&<div tabIndex={0} style={{position:"absolute",inset:0,outline:"none"}} autoFocus onKeyDown={e=>{if(e.key==="Escape"){setConn(null);drag.current=null;}}}/>}
      </div>

      {ctx&&nodes.find(n=>n.id===ctx.nodeId)&&<CtxMenu x={ctx.x} y={ctx.y} node={nodes.find(n=>n.id===ctx.nodeId)} onClose={()=>setCtx(null)} onEdit={()=>openNEdit(ctx.nodeId)} onDup={()=>dupN(ctx.nodeId)} onDel={()=>delN(ctx.nodeId)} onShape={s=>mN(ns=>ns.map(n=>n.id===ctx.nodeId?{...n,shape:s}:n))}/>}

      {modal&&<div style={{position:"fixed",inset:0,background:"#0007",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}} onClick={()=>setModal(null)}>
        <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:14,padding:24,width:420,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 8px 40px #0004"}}>
          {modal.type==="edge"&&<><h3 style={{margin:"0 0 14px",color:"#1e3a5f",fontSize:16}}>➡️ Edge Label</h3><Fld label="Label" value={form.label} onChange={v=>setForm(f=>({...f,label:v}))} placeholder="e.g. Yes, No…" autoFocus/><BR><B v="danger" onClick={()=>{delE(modal.id);setModal(null);}}>🗑 Delete</B><B v="ghost" onClick={()=>setModal(null)}>Cancel</B><B v="primary" onClick={saveModal}>Save</B></BR></>}
          {modal.type==="node"&&<>
            <h3 style={{margin:"0 0 14px",color:"#1e3a5f",fontSize:16}}>✏️ Edit Node</h3>
            <div style={{display:"flex",borderBottom:"2px solid #e8f0fe",marginBottom:14}}>{["info","shape","color"].map(t=><button key={t} onClick={()=>setTab(t)} style={{padding:"6px 14px",border:"none",borderBottom:tab===t?`2px solid ${accent}`:"2px solid transparent",background:"transparent",color:tab===t?accent:"#888",fontWeight:600,fontSize:12,cursor:"pointer",marginBottom:-2,textTransform:"capitalize"}}>{t==="info"?"📝 Info":t==="shape"?"🔷 Shape":"🎨 Color"}</button>)}</div>
            {tab==="info"&&<><Fld label="Label" value={form.label} onChange={v=>setForm(f=>({...f,label:v}))} autoFocus/><Fld label="URL" value={form.url||""} onChange={v=>setForm(f=>({...f,url:v}))} placeholder="https://..."/><BR><B v="danger" onClick={()=>{delN(modal.id);setModal(null);}}>🗑</B><B v="dup" onClick={()=>{dupN(modal.id);setModal(null);}}>⧉ Dup</B><B v="ghost" onClick={()=>setModal(null)}>Cancel</B><B v="primary" onClick={saveModal}>Save</B></BR></>}
            {tab==="shape"&&<><ShapePick current={mNode?.shape||"rect"} onChange={s=>mN(ns=>ns.map(n=>n.id===modal.id?{...n,shape:s}:n))}/><BR><B v="ghost" onClick={()=>setModal(null)}>Close</B></BR></>}
            {tab==="color"&&<>{mNode&&(()=>{const c=nc(mNode,scheme);return<div style={{marginBottom:14,display:"flex",justifyContent:"center"}}><div style={{width:NW,height:NH,borderRadius:9,background:c.bg,border:`2px solid ${c.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:c.text}}>{mNode.label}</div></div>;})()}<ColPick current={mNode?.cc||""} onSelect={cc=>mN(ns=>ns.map(n=>n.id===modal.id?{...n,cc}:n))} onReset={()=>mN(ns=>ns.map(n=>n.id===modal.id?{...n,cc:null}:n))}/><BR><B v="ghost" onClick={()=>setModal(null)}>Close</B></BR></>}
          </>}
        </div>
      </div>}
      <Toasty msg={toast.msg} type={toast.type}/>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD MODAL
// ══════════════════════════════════════════════════════════════════════════════
function CardModal({chart,isTeam,hasTeam,onClose,onMeta,onMove,onDel,onDup}){
  const [name,setName]=useState(chart.name),[tags,setTags]=useState(chart.tags||[]),[tab,setTab]=useState("info");
  const save=()=>{onMeta(chart.id,name,tags);onClose();};
  return(<div style={{position:"fixed",inset:0,background:"#0007",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}} onClick={onClose}><div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:14,padding:24,width:420,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 8px 40px #0004"}}>
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}><span style={{fontSize:22}}>{chart.icon}</span><h3 style={{margin:0,color:"#1e3a5f",fontSize:16,flex:1}}>{chart.name}</h3><span style={{fontSize:11,background:isTeam?"#ede9fe":"#e8f0fe",color:isTeam?"#8e44ad":"#4a90d9",borderRadius:6,padding:"2px 8px",fontWeight:600}}>{isTeam?"🟣 Team":"👤 My"}</span></div>
    <div style={{display:"flex",borderBottom:"2px solid #e8f0fe",marginBottom:14}}>{["info","tags","move"].map(t=><button key={t} onClick={()=>setTab(t)} style={{padding:"6px 14px",border:"none",borderBottom:tab===t?"2px solid #4a90d9":"2px solid transparent",background:"transparent",color:tab===t?"#4a90d9":"#888",fontWeight:600,fontSize:12,cursor:"pointer",marginBottom:-2}}>{t==="info"?"📝 Info":t==="tags"?"🏷️ Tags":"🔀 Move"}</button>)}</div>
    {tab==="info"&&<><Fld label="Name" value={name} onChange={setName} autoFocus/><BR><B v="danger" onClick={()=>{onDel(chart.id,isTeam);onClose();}}>🗑 Delete</B><B v="dup" onClick={()=>{onDup(chart.id,isTeam);onClose();}}>⧉ Dup</B><B v="ghost" onClick={onClose}>Cancel</B><B v="primary" onClick={save}>Save</B></BR></>}
    {tab==="tags"&&<><TagEditor tags={tags} onChange={setTags}/><BR><B v="ghost" onClick={onClose}>Cancel</B><B v="primary" onClick={save}>Save Tags</B></BR></>}
    {tab==="move"&&<div>{isTeam?<><div style={{background:"#f0f7ff",borderRadius:8,padding:"12px 14px",marginBottom:14,fontSize:13,color:"#2c5282"}}><b>Move to My Space</b><br/><span style={{fontSize:12,color:"#555"}}>Removes from team.</span></div><BR><B v="ghost" onClick={onClose}>Cancel</B><B v="move" onClick={()=>{onMove(chart,true);onClose();}}>👤 Move to My</B></BR></>:hasTeam?<><div style={{background:"#f5eef8",borderRadius:8,padding:"12px 14px",marginBottom:14,fontSize:13,color:"#5b21b6"}}><b>Move to Team Space</b><br/><span style={{fontSize:12,color:"#555"}}>Shares with team.</span></div><BR><B v="ghost" onClick={onClose}>Cancel</B><B v="team" onClick={()=>{onMove(chart,false);onClose();}}>🟣 Move to Team</B></BR></>:<div style={{textAlign:"center",padding:"20px 0",color:"#888",fontSize:13}}><div style={{fontSize:32,marginBottom:8}}>🟣</div>Connect a Team Space first.</div>}</div>}
  </div></div>);
}

// ══════════════════════════════════════════════════════════════════════════════
// LANDING
// ══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [myC,setMyC]   = useState(null);
  const [tmC,setTmC]   = useState(null);
  const [act,setAct]   = useState(null);
  const [tab,setTab]   = useState("my");
  const [sNew,setSNew] = useState(false);
  const [nName,setNName]=useState("");
  const [tmpl,setTmpl] = useState(TEMPLATES[0]);
  const [srch,setSrch] = useState("");
  const [tagF,setTagF] = useState(null);
  const [cMod,setCMod] = useState(null);
  const [toast,setToast]=useState({msg:"",type:""});
  const [tok,setTok]   = useState(()=>localStorage.getItem(LT)||"");
  const [ttok,setTtok] = useState(()=>localStorage.getItem(LTT)||"");
  const [user,setUser] = useState("");
  const [busy,setBusy] = useState(false);
  const [tSetup,setTSetup]=useState(false);
  const [newTT,setNewTT]=useState("");

  const t2=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast({msg:"",type:""}),2500);};

  const getOrCreate=useCallback(async(t,isT,def,desc)=>{
    const lk=isT?LTG:LG, gf=isT?TGF:GF;
    let id=localStorage.getItem(lk);
    if(!id){id=await findGist(t,gf);if(id)localStorage.setItem(lk,id);}
    if(!id){id=await makeGist(t,gf,def,desc);localStorage.setItem(lk,id);}
    const data=await readGist(t,id,gf);
    return{id,data:data||def};
  },[]);

  useEffect(()=>{
    if(!tok){setMyC(D_MY);setTmC([]);return;}
    (async()=>{setBusy(true);try{const u=await whoami(tok);setUser(u);const{data:md}=await getOrCreate(tok,false,D_MY,"FCB – My Charts");setMyC(md);if(ttok){try{const{data:td}=await getOrCreate(ttok,true,[],"FCB – Team Charts");setTmC(td);}catch(_){setTmC([]);}}else setTmC([]);}catch(_){setMyC(D_MY);setTmC([]);t2("Could not sync","warning");}finally{setBusy(false);}})();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tok]);

  const pMy  =n=>{const t=localStorage.getItem(LT), g=localStorage.getItem(LG);  if(t&&g)writeGist(t,g,GF, n).catch(()=>{});};
  const pTm  =n=>{const t=localStorage.getItem(LTT),g=localStorage.getItem(LTG); if(t&&g)writeGist(t,g,TGF,n).catch(()=>{});};
  const saveMy  =useCallback(async(u,s=false)=>{setMyC(p=>{const n=p.map(c=>c.id===u.id?u:c);pMy(n);return n;});if(!s)t2("Saved ✓");},[]);
  const saveTm  =useCallback(async(u,s=false)=>{setTmC(p=>{const n=p.map(c=>c.id===u.id?u:c);pTm(n);return n;});if(!s)t2("Saved to Team ✓","team");},[]);
  const saveMeta=(id,name,tags,isT)=>{if(isT){setTmC(p=>{const n=p.map(c=>c.id===id?{...c,name,tags}:c);pTm(n);return n;});}else{setMyC(p=>{const n=p.map(c=>c.id===id?{...c,name,tags}:c);pMy(n);return n;});}};
  const delC=(id,isT)=>{if(isT){setTmC(p=>{const n=p.filter(c=>c.id!==id);pTm(n);return n;});}else{setMyC(p=>{const n=p.filter(c=>c.id!==id);pMy(n);return n;});}t2("Deleted");};
  const dupC=(id,isT)=>{const src=(isT?tmC:myC).find(c=>c.id===id);if(!src)return;const d={...cln(src),id:nid(),name:src.name+" (copy)",createdAt:new Date().toLocaleDateString()};if(isT){setTmC(p=>{const n=[...p,d];pTm(n);return n;});}else{setMyC(p=>{const n=[...p,d];pMy(n);return n;});}t2("Duplicated ✓","dup");};
  const moveC=(chart,fromT)=>{const m={...chart,owner:fromT?user:"me"};if(fromT){setTmC(p=>{const n=p.filter(c=>c.id!==chart.id);pTm(n);return n;});setMyC(p=>{const n=[...p,m];pMy(n);return n;});t2("Moved to My ✓","move");setTab("my");}else{setMyC(p=>{const n=p.filter(c=>c.id!==chart.id);pMy(n);return n;});setTmC(p=>{const n=[...(p||[]),m];pTm(n);return n;});t2("Moved to Team ✓","move");setTab("team");}};
  const connTeam=async()=>{if(!newTT.trim())return;setBusy(true);try{await whoami(newTT.trim());localStorage.setItem(LTT,newTT.trim());setTtok(newTT.trim());const{data}=await getOrCreate(newTT.trim(),true,[],"FCB – Team Charts");setTmC(data);setTSetup(false);setNewTT("");t2("Team connected ✓","team");}catch(_){t2("Invalid team token","error");}finally{setBusy(false);}};
  const disc=()=>{[LT,LG,LTT,LTG].forEach(k=>localStorage.removeItem(k));setTok("");setTtok("");setUser("");};

  if(!tok) return <Setup onConnect={(t,u)=>{setTok(t);setUser(u);}}/>;
  if(myC===null||busy) return(<div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0f1e35,#1e3a5f)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Segoe UI',sans-serif"}}><div style={{textAlign:"center",color:"#a0c0e8"}}><div style={{fontSize:40,marginBottom:12}}>☁️</div><div style={{fontSize:16,fontWeight:600}}>Syncing…</div></div></div>);
  if(act) return <Editor chart={act.chart} isTeam={act.isTeam} onBack={()=>setAct(null)} onSave={act.isTeam?saveTm:saveMy}/>;

  const charts=tab==="my"?myC:(tmC||[]);
  const allTags=[...new Set(charts.flatMap(c=>c.tags||[]))].sort();
  const filtered=charts.filter(c=>c.name.toLowerCase().includes(srch.toLowerCase())&&(!tagF||(c.tags||[]).includes(tagF)));
  const hasTeam=!!ttok;

  const createChart=()=>{
    if(!nName.trim())return;
    const isT=tab==="team";
    const nc={id:nid(),name:nName.trim(),icon:tmpl.icon,scheme:tmpl.scheme,nodes:[mkNode("Start",100,160,"oval")],edges:[],tags:[],createdAt:new Date().toLocaleDateString(),owner:isT?user:"me"};
    if(isT){setTmC(p=>{const n=[...(p||[]),nc];pTm(n);return n;});}else{setMyC(p=>{const n=[...p,nc];pMy(n);return n;});}
    setAct({chart:nc,isTeam:isT});setSNew(false);setNName("");
  };

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0f1e35 0%,#1e3a5f 50%,#1a4a7a 100%)",fontFamily:"'Segoe UI',sans-serif"}}>
      <div style={{padding:"36px 32px 20px",textAlign:"center"}}>
        <div style={{fontSize:44,marginBottom:6}}>🗺️</div>
        <h1 style={{color:"#fff",margin:"0 0 6px",fontSize:28,fontWeight:800,letterSpacing:-1}}>Flowchart Builder</h1>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:20,flexWrap:"wrap"}}>
          <span style={{color:"#27ae60",fontSize:12}}>👤 <b style={{color:"#4a90d9"}}>@{user}</b></span>
          {hasTeam&&<span style={{color:"#d7a8ff",fontSize:12}}>🟣 Team connected</span>}
          <button onClick={disc} style={{background:"transparent",border:"1px solid #2c5282",color:"#7090b0",borderRadius:6,padding:"2px 8px",fontSize:11,cursor:"pointer"}}>Disconnect</button>
        </div>
        <button onClick={()=>setSNew(true)} style={{background:tab==="team"?"linear-gradient(135deg,#8e44ad,#6c3483)":"linear-gradient(135deg,#4a90d9,#27ae60)",border:"none",color:"#fff",borderRadius:12,padding:"10px 28px",fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 20px #0003"}}>＋ New {tab==="team"?"Team":"My"} Flowchart</button>
      </div>

      <div style={{maxWidth:960,margin:"0 auto",padding:"0 24px"}}>
        <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:"2px solid #2c5282"}}>
          {[{key:"my",label:"👤 My Flowcharts",cnt:myC?.length||0},{key:"team",label:"🟣 Team Space",cnt:tmC?.length||0}].map(t=>(
            <button key={t.key} onClick={()=>{setTab(t.key);setSrch("");setTagF(null);}} style={{padding:"10px 20px",border:"none",borderBottom:tab===t.key?(t.key==="team"?"3px solid #8e44ad":"3px solid #4a90d9"):"3px solid transparent",background:"transparent",color:tab===t.key?"#fff":"#7090b0",fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:-2}}>
              {t.label}<span style={{fontSize:11,background:"#ffffff18",borderRadius:10,padding:"1px 7px",marginLeft:4}}>{t.cnt}</span>
            </button>
          ))}
        </div>

        {tab==="team"&&!hasTeam&&<div style={{background:"#2d0a4e",borderRadius:12,border:"1.5px solid #8e44ad",padding:"18px 22px",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><div style={{color:"#d7a8ff",fontWeight:700,fontSize:14,marginBottom:4}}>🟣 Connect Team Space</div><div style={{color:"#a87fd4",fontSize:12}}>Ask your admin for the Team PAT.</div></div><button onClick={()=>setTSetup(true)} style={{background:"#8e44ad",border:"none",color:"#fff",borderRadius:8,padding:"8px 18px",fontSize:13,cursor:"pointer",fontWeight:700}}>Connect →</button></div>}

        <div style={{marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
            <input value={srch} onChange={e=>setSrch(e.target.value)} placeholder="🔍 Search…" style={{flex:1,padding:"10px 16px",borderRadius:10,border:"1.5px solid #2c5282",background:"#162d4e",color:"#fff",fontSize:13,outline:"none"}}/>
            <span style={{color:"#a0c0e8",fontSize:13}}>{filtered.length} chart{filtered.length!==1?"s":""}</span>
          </div>
          {allTags.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}><span style={{color:"#7090b0",fontSize:11,fontWeight:600}}>Filter:</span><button onClick={()=>setTagF(null)} style={{padding:"2px 10px",borderRadius:12,border:"1.5px solid #2c5282",background:!tagF?"#4a90d9":"transparent",color:!tagF?"#fff":"#7090b0",fontSize:11,cursor:"pointer",fontWeight:600}}>All</button>{allTags.map(t=>{const c=tc(t);return<button key={t} onClick={()=>setTagF(tagF===t?null:t)} style={{padding:"2px 10px",borderRadius:12,border:`1.5px solid ${tagF===t?c.border:"#2c5282"}`,background:tagF===t?c.bg:"transparent",color:tagF===t?c.text:"#7090b0",fontSize:11,cursor:"pointer",fontWeight:600}}>#{t}</button>;})}</div>}
        </div>

        {filtered.length===0&&!(tab==="team"&&!hasTeam)
          ?<div style={{textAlign:"center",color:"#a0c0e8",padding:48,fontSize:15}}>{tagF?`No #${tagF} charts.`:tab==="team"?"No team charts yet.":"No charts found."}</div>
          :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:20,paddingBottom:48}}>
            {filtered.map(chart=>{
              const isT=tab==="team",ac=isT?"#8e44ad":"#4a90d9";
              return(<div key={chart.id} style={{background:isT?"linear-gradient(145deg,#2d0a4e,#1a0633)":"linear-gradient(145deg,#1e3a5f,#162d4e)",borderRadius:16,border:`1.5px solid ${isT?"#6c3483":"#2c5282"}`,overflow:"hidden",cursor:"pointer",transition:"transform .15s,box-shadow .15s",boxShadow:"0 4px 20px #00000033"}} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.boxShadow="0 8px 32px #00000055";}} onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="0 4px 20px #00000033";}}>
                <div onClick={()=>setAct({chart,isTeam:isT})} style={{height:100,background:SCHEMES[chart.scheme].root.bg,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>
                  <Mini chart={chart}/>
                  {chart.owner&&chart.owner!=="me"&&<div style={{position:"absolute",top:6,left:8,background:"#00000055",borderRadius:6,padding:"2px 7px",fontSize:10,color:"#fff"}}>by {chart.owner}</div>}
                  <div style={{position:"absolute",bottom:6,right:8,background:"#ffffff22",borderRadius:6,padding:"2px 7px",fontSize:11,color:"#fff",fontWeight:600}}>Open →</div>
                </div>
                <div style={{padding:"12px 14px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{color:"#fff",fontWeight:700,fontSize:14,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{chart.icon} {chart.name}</span>
                    <button onClick={e=>{e.stopPropagation();setCMod({chart,isTeam:isT});}} style={{background:"transparent",border:`1px solid ${ac}`,color:"#a0c0e8",cursor:"pointer",fontSize:11,borderRadius:6,padding:"2px 8px",flexShrink:0,marginLeft:6}}>⚙️</button>
                  </div>
                  {(chart.tags||[]).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>{(chart.tags||[]).map(t=><TagBadge key={t} tag={t}/>)}</div>}
                  <div style={{color:"#7090b0",fontSize:11}}>{chart.createdAt} · {(chart.nodes||[]).length} nodes · {(chart.edges||[]).length} edges</div>
                  <div style={{marginTop:6,display:"flex",gap:6}}><span style={{background:SCHEMES[chart.scheme].dept.bg,color:SCHEMES[chart.scheme].dept.text,fontSize:10,borderRadius:6,padding:"2px 8px",fontWeight:600}}>{chart.scheme}</span><span style={{color:isT?"#d7a8ff":"#27ae60",fontSize:10}}>{isT?"🟣 team":"☁️ gist"}</span></div>
                </div>
              </div>);
            })}
            <div onClick={()=>setSNew(true)} style={{background:"transparent",borderRadius:16,border:`2px dashed ${tab==="team"?"#6c3483":"#2c5282"}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",minHeight:200,color:tab==="team"?"#8e44ad":"#4a90d9"}} onMouseEnter={e=>{e.currentTarget.style.background=tab==="team"?"#2d0a4e55":"#1e3a5f55";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}><div style={{fontSize:32,marginBottom:6}}>＋</div><div style={{fontWeight:700,fontSize:13}}>New {tab==="team"?"Team":"My"} Chart</div></div>
          </div>
        }
      </div>

      {cMod&&<CardModal chart={cMod.chart} isTeam={cMod.isTeam} hasTeam={hasTeam} onClose={()=>setCMod(null)} onMeta={(id,n,t)=>saveMeta(id,n,t,cMod.isTeam)} onMove={moveC} onDel={delC} onDup={dupC}/>}

      {sNew&&<div style={{position:"fixed",inset:0,background:"#0008",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}} onClick={()=>setSNew(false)}><div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:28,width:420,boxShadow:"0 8px 40px #0005"}}><h3 style={{margin:"0 0 4px",color:"#1e3a5f",fontSize:18}}>🆕 New Flowchart</h3><p style={{margin:"0 0 16px",fontSize:12,color:tab==="team"?"#8e44ad":"#4a90d9",fontWeight:600}}>{tab==="team"?"🟣 Team Space":"👤 My Space"}</p><Fld label="Name" value={nName} onChange={setNName} autoFocus placeholder="e.g. Q3 Flow"/><div style={{marginBottom:18}}><label style={{fontSize:11,color:"#555",display:"block",marginBottom:8,fontWeight:600}}>Template</label><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{TEMPLATES.map(t=><div key={t.label} onClick={()=>setTmpl(t)} style={{padding:"10px 12px",borderRadius:10,cursor:"pointer",border:`2px solid ${tmpl.label===t.label?"#4a90d9":"#e0e8f0"}`,background:tmpl.label===t.label?"#e8f0fe":"#f9fafb"}}><div style={{fontSize:20,marginBottom:2}}>{t.icon}</div><div style={{fontSize:12,fontWeight:700,color:"#1e3a5f"}}>{t.label}</div><div style={{fontSize:11,color:"#888"}}>{t.desc}</div></div>)}</div></div><BR><B v="ghost" onClick={()=>setSNew(false)}>Cancel</B><B v="primary" onClick={createChart}>Create →</B></BR></div></div>}

      {tSetup&&<div style={{position:"fixed",inset:0,background:"#0008",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}} onClick={()=>setTSetup(false)}><div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:28,width:420,boxShadow:"0 8px 40px #0005"}}><h3 style={{margin:"0 0 8px",color:"#8e44ad",fontSize:18}}>🟣 Connect Team Space</h3><p style={{margin:"0 0 16px",color:"#666",fontSize:13}}>Enter the shared Team PAT from your admin.</p><Fld label="Team PAT" value={newTT} onChange={setNewTT} type="password" autoFocus placeholder="ghp_team_..."/><BR><B v="ghost" onClick={()=>setTSetup(false)}>Cancel</B><B v="team" onClick={connTeam}>Connect →</B></BR></div></div>}

      <Toasty msg={toast.msg} type={toast.type}/>
    </div>
  );
}