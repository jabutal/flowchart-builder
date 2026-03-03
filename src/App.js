import { useState, useRef, useCallback, useEffect } from "react";

let _id = 3000;
const uid = () => `n${++_id}`;
const clone = o => JSON.parse(JSON.stringify(o));

// ── GitHub Gist API ────────────────────────────────────────────────────────────
const GIST_FILENAME = "flowchart-builder-data.json";
const LS_TOKEN  = "fc:gh_token";
const LS_GISTID = "fc:gist_id";

const gistHeaders = token => ({
  "Authorization": `token ${token}`,
  "Content-Type": "application/json",
  "Accept": "application/vnd.github.v3+json",
});

async function gistLoad(token, gistId) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, { headers: gistHeaders(token) });
  if (!res.ok) throw new Error("Failed to load gist");
  const data = await res.json();
  const content = data.files[GIST_FILENAME]?.content;
  return content ? JSON.parse(content) : null;
}

async function gistSave(token, gistId, charts) {
  const body = JSON.stringify({
    files: { [GIST_FILENAME]: { content: JSON.stringify(charts, null, 2) } }
  });
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH", headers: gistHeaders(token), body
  });
  if (!res.ok) throw new Error("Failed to save gist");
}

async function gistCreate(token, charts) {
  const body = JSON.stringify({
    description: "Flowchart Builder – saved data",
    public: false,
    files: { [GIST_FILENAME]: { content: JSON.stringify(charts, null, 2) } }
  });
  const res = await fetch("https://api.github.com/gists", {
    method: "POST", headers: gistHeaders(token), body
  });
  if (!res.ok) throw new Error("Failed to create gist");
  const data = await res.json();
  return data.id;
}

// Search user's gists for an existing flowchart-builder gist
async function gistFind(token) {
  let page = 1;
  while (true) {
    const res = await fetch(`https://api.github.com/gists?per_page=100&page=${page}`, { headers: gistHeaders(token) });
    if (!res.ok) throw new Error("Failed to list gists");
    const data = await res.json();
    if (data.length === 0) break;
    const found = data.find(g => g.files && g.files[GIST_FILENAME]);
    if (found) return found.id;
    if (data.length < 100) break;
    page++;
  }
  return null;
}

async function verifyToken(token) {
  const res = await fetch("https://api.github.com/user", { headers: gistHeaders(token) });
  if (!res.ok) throw new Error("Invalid token");
  const data = await res.json();
  return data.login;
}

// ── constants ──────────────────────────────────────────────────────────────────
const SCHEMES = {
  sharepoint:{ root:{bg:"#1e3a5f",text:"#fff",border:"#0f2240"}, dept:{bg:"#4a90d9",text:"#fff",border:"#2c6fad"}, sub:{bg:"#e8f0fe",text:"#1e3a5f",border:"#4a90d9"}, leaf:{bg:"#f8faff",text:"#2d3748",border:"#b3d4f5"} },
  green:     { root:{bg:"#1a4731",text:"#fff",border:"#0f2d1e"}, dept:{bg:"#27ae60",text:"#fff",border:"#1e8449"}, sub:{bg:"#eafaf1",text:"#1a4731",border:"#27ae60"}, leaf:{bg:"#f9fefe",text:"#2d3748",border:"#a9dfbf"} },
  purple:    { root:{bg:"#3b1f6e",text:"#fff",border:"#260f52"}, dept:{bg:"#8e44ad",text:"#fff",border:"#6c3483"}, sub:{bg:"#f5eef8",text:"#3b1f6e",border:"#8e44ad"}, leaf:{bg:"#fdfefe",text:"#2d3748",border:"#d7bde2"} },
  orange:    { root:{bg:"#7d3c0a",text:"#fff",border:"#5d2d07"}, dept:{bg:"#e67e22",text:"#fff",border:"#ca6f1e"}, sub:{bg:"#fef5e7",text:"#7d3c0a",border:"#e67e22"}, leaf:{bg:"#fffdf9",text:"#2d3748",border:"#fad7a0"} },
};
const SWATCHES = ["#1e3a5f","#4a90d9","#27ae60","#8e44ad","#e67e22","#e05a5a","#16a085","#2c3e50","#f39c12","#d35400","#7f8c8d","#1abc9c","#e8f0fe","#eafaf1","#f5eef8","#fef5e7","#ffffff","#f0f4fa","#2d3748","#000000"];
const NEXT_COLOR = { root:"dept", dept:"sub", sub:"leaf", leaf:"leaf" };
const NW = 148, NH = 42;
const TEMPLATES = [
  { label:"SharePoint Folders", icon:"🗂️", scheme:"sharepoint", desc:"OneDrive / SharePoint" },
  { label:"Project Workflow",   icon:"📋", scheme:"green",       desc:"Task & process flow" },
  { label:"Org Chart",          icon:"🏢", scheme:"purple",      desc:"Team structure" },
  { label:"Custom",             icon:"✨", scheme:"orange",      desc:"Blank canvas" },
];

const mkNode = (id,label,color,x,y,children=[]) => ({id,label,color,url:"",cc:null,x,y,children});
const SP_TREE = mkNode("root","Company SharePoint Root","root",40,340,[
  mkNode("sales","Sales","dept",260,120,[
    mkNode("s1","Leads & Prospects","sub",480,40),mkNode("s2","Proposals & Quotes","sub",480,110),
    mkNode("s3","Contracts","sub",480,180),
    mkNode("s4","Sales Reports","sub",480,250,[mkNode("s4a","Monthly","leaf",700,210),mkNode("s4b","Quarterly","leaf",700,260),mkNode("s4c","Annual","leaf",700,310)]),
    mkNode("s5","Templates","sub",480,340),
  ]),
  mkNode("projects","Projects","dept",260,420,[
    mkNode("p0","_Templates","sub",480,400,[mkNode("p0a","Project Charter","leaf",700,370),mkNode("p0b","Status Reports","leaf",700,420),mkNode("p0c","Meeting Notes","leaf",700,470)]),
    mkNode("p1","Active Projects","sub",480,500,[mkNode("p1a","2025-01 Alpha","leaf",700,530),mkNode("p1b","2025-02 Beta","leaf",700,580)]),
    mkNode("p2","Completed Projects","sub",480,600,[mkNode("p2a","2024 Archived","leaf",700,640)]),
  ]),
  mkNode("shared","Shared Resources","dept",260,700,[
    mkNode("r1","Company Templates","sub",480,700),
    mkNode("r2","Brand Assets","sub",480,770,[mkNode("r2a","Logos","leaf",700,740),mkNode("r2b","Style Guides","leaf",700,790)]),
    mkNode("r3","Policies & Procedures","sub",480,840),mkNode("r4","Training Materials","sub",480,910),
  ]),
]);
const DEFAULT_CHARTS = [
  {id:"sp1",name:"SharePoint Folder Structure",icon:"🗂️",scheme:"sharepoint",tree:clone(SP_TREE),createdAt:new Date().toLocaleDateString()},
];

// ── helpers ────────────────────────────────────────────────────────────────────
const flatten    = (n,a=[]) => { a.push(n); n.children.forEach(c=>flatten(c,a)); return a; };
const findNode   = (t,id)   => flatten(t).find(n=>n.id===id);
const findParent = (t,id)   => {
  if(t.children.some(c=>c.id===id)) return t;
  for(const c of t.children){const p=findParent(c,id);if(p)return p;}
  return null;
};
const contrastText = hex => {
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return (r*299+g*587+b*114)/1000>128?"#1e1e1e":"#ffffff";
};
const darken = (hex,amt=30) => {
  const f=n=>Math.max(0,Math.min(255,parseInt(hex.slice(n,n+2),16)-amt)).toString(16).padStart(2,"0");
  return `#${f(1)}${f(3)}${f(5)}`;
};
const nodeColors = (node,scheme) =>
  node.cc?{bg:node.cc,text:contrastText(node.cc),border:darken(node.cc)}:(scheme[node.color]||scheme.leaf);

// ── UI atoms ───────────────────────────────────────────────────────────────────
function Field({label,value,onChange,placeholder,autoFocus,type="text"}){
  return(
    <div style={{marginBottom:12}}>
      <label style={{fontSize:11,color:"#555",display:"block",marginBottom:4,fontWeight:600}}>{label}</label>
      <input autoFocus={autoFocus} value={value} placeholder={placeholder} type={type}
        onChange={e=>onChange(e.target.value)}
        style={{width:"100%",padding:"7px 10px",borderRadius:7,border:"1.5px solid #d0dcea",fontSize:13,boxSizing:"border-box",outline:"none"}}/>
    </div>
  );
}
function BtnRow({children}){return <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:10}}>{children}</div>;}
function Btn({v,onClick,children,disabled}){
  const S={primary:{background:"#4a90d9",color:"#fff",border:"none"},outline:{background:"#fff",color:"#4a90d9",border:"1.5px solid #4a90d9"},danger:{background:"#fff",color:"#e05a5a",border:"1.5px solid #e05a5a"},ghost:{background:"#fff",color:"#888",border:"1.5px solid #ccc"}};
  return <button onClick={onClick} disabled={disabled} style={{padding:"7px 14px",borderRadius:7,fontSize:12,cursor:disabled?"not-allowed":"pointer",fontWeight:600,opacity:disabled?0.6:1,...S[v]}}>{children}</button>;
}
function TBtn({onClick,children}){
  return <button onClick={onClick} style={{padding:"4px 10px",borderRadius:7,border:"1px solid #4a90d9",background:"transparent",color:"#a0c0e8",fontSize:12,cursor:"pointer",fontWeight:600}}>{children}</button>;
}
function Toast({msg,type="success"}){
  const bg = type==="error"?"#c0392b":type==="warning"?"#e67e22":"#1e3a5f";
  return msg?(
    <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:bg,color:"#fff",padding:"10px 22px",borderRadius:20,fontSize:13,boxShadow:"0 4px 20px #0004",zIndex:9999}}>
      {msg}
    </div>
  ):null;
}

// ── color picker ───────────────────────────────────────────────────────────────
function ColorPicker({current,onSelect,onReset}){
  const [hex,setHex]=useState(current||"#4a90d9");
  return(
    <div>
      <p style={{fontSize:11,fontWeight:600,color:"#888",textTransform:"uppercase",letterSpacing:1,margin:"0 0 8px"}}>Quick Swatches</p>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
        {SWATCHES.map(s=>(
          <div key={s} onClick={()=>onSelect(s)}
            style={{width:22,height:22,borderRadius:5,background:s,cursor:"pointer",flexShrink:0,boxSizing:"border-box",transition:"transform 0.1s",border:current===s?"3px solid #1e3a5f":"1.5px solid #ccc"}}
            onMouseEnter={e=>e.currentTarget.style.transform="scale(1.25)"}
            onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}/>
        ))}
      </div>
      <p style={{fontSize:11,fontWeight:600,color:"#888",textTransform:"uppercase",letterSpacing:1,margin:"0 0 6px"}}>Custom</p>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
        <input type="color" value={hex} onChange={e=>setHex(e.target.value)} style={{width:36,height:30,border:"1.5px solid #ccc",borderRadius:6,cursor:"pointer",padding:2}}/>
        <input value={hex} onChange={e=>setHex(e.target.value)} style={{flex:1,padding:"6px 8px",borderRadius:6,border:"1.5px solid #ccc",fontSize:12,outline:"none"}}/>
        <button onClick={()=>onSelect(hex)} style={{padding:"6px 12px",borderRadius:6,background:"#4a90d9",color:"#fff",border:"none",fontSize:12,cursor:"pointer",fontWeight:600}}>Apply</button>
      </div>
      {onReset&&<button onClick={onReset} style={{width:"100%",padding:"6px",borderRadius:6,background:"#f0f4fa",color:"#555",border:"1.5px solid #ccc",fontSize:12,cursor:"pointer"}}>↺ Reset to default</button>}
    </div>
  );
}

// ── mini preview ───────────────────────────────────────────────────────────────
function MiniPreview({chart}){
  const nodes=flatten(chart.tree).slice(0,10);
  const scheme=SCHEMES[chart.scheme]||SCHEMES.sharepoint;
  const xs=nodes.map(n=>n.x),ys=nodes.map(n=>n.y);
  const mnx=Math.min(...xs),mxx=Math.max(...xs)+NW,mny=Math.min(...ys),mxy=Math.max(...ys)+NH;
  const W=mxx-mnx||1,H=mxy-mny||1,sc=Math.min(220/W,90/H,1);
  return(
    <svg width="100%" height="100%" viewBox="-10 -5 240 100" style={{opacity:0.85}}>
      <g transform={`translate(${10+(220-W*sc)/2},${5+(90-H*sc)/2}) scale(${sc})`}>
        {nodes.map(n=>{const c=nodeColors(n,scheme);return<rect key={n.id} x={n.x-mnx} y={n.y-mny} width={NW} height={NH} rx={7} fill={c.bg} stroke={c.border} strokeWidth={2}/>;}) }
      </g>
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TOKEN SETUP SCREEN
// ══════════════════════════════════════════════════════════════════════════════
function TokenSetup({onConnect}){
  const [token,setToken]=useState("");
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");

  const connect=async()=>{
    if(!token.trim()){setErr("Please enter your token.");return;}
    setLoading(true);setErr("");
    try{
      const username=await verifyToken(token.trim());
      localStorage.setItem(LS_TOKEN,token.trim());
      onConnect(token.trim(),username);
    } catch(e){
      setErr("❌ Invalid token or no internet. Please check and try again.");
    } finally{setLoading(false);}
  };

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0f1e35,#1e3a5f)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Segoe UI',sans-serif",padding:24}}>
      <div style={{background:"#fff",borderRadius:16,padding:32,width:"100%",maxWidth:440,boxShadow:"0 8px 40px #0005"}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:40,marginBottom:8}}>🔑</div>
          <h2 style={{margin:"0 0 6px",color:"#1e3a5f",fontSize:22,fontWeight:800}}>Connect GitHub Gist</h2>
          <p style={{margin:0,color:"#777",fontSize:13}}>Your flowcharts will be saved to a private Gist on your GitHub account — surviving cache clears and working across devices.</p>
        </div>
        <Field label="GitHub Personal Access Token" value={token} onChange={setToken}
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" type="password" autoFocus/>
        {err&&<p style={{color:"#e05a5a",fontSize:12,margin:"-8px 0 12px"}}>{err}</p>}
        <div style={{background:"#f0f7ff",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:12,color:"#2c5282"}}>
          <b>How to get a token:</b><br/>
          1. Go to <b>github.com/settings/tokens</b><br/>
          2. Click <b>Generate new token (classic)</b><br/>
          3. Check only the <b>gist</b> scope ✅<br/>
          4. Click <b>Generate token</b> and copy it
        </div>
        <button onClick={connect} disabled={loading}
          style={{width:"100%",padding:"11px",borderRadius:9,background:"linear-gradient(135deg,#4a90d9,#27ae60)",color:"#fff",border:"none",fontSize:14,fontWeight:700,cursor:loading?"not-allowed":"pointer",opacity:loading?0.7:1}}>
          {loading?"Connecting...":"🔗 Connect & Continue"}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// EDITOR
// ══════════════════════════════════════════════════════════════════════════════
function Editor({chart,onBack,onSave}){
  const [tree,setTree]   = useState(()=>clone(chart.tree));
  const [modal,setModal] = useState(null);
  const [form,setForm]   = useState({label:"",url:""});
  const [tab,setTab]     = useState("info");
  const [vp,setVp]       = useState({x:60,y:40,scale:1});
  const [toast,setToast] = useState({msg:"",type:"success"});
  const [dirty,setDirty] = useState(false);
  const vpRef   = useRef(vp); vpRef.current=vp;
  const dragRef = useRef(null);
  const cvRef   = useRef();
  const autoRef = useRef(null);
  const onSaveRef = useRef(onSave); useEffect(()=>{onSaveRef.current=onSave;},[onSave]);
  const chartRef  = useRef(chart);  useEffect(()=>{chartRef.current=chart; },[chart]);
  const scheme  = SCHEMES[chart.scheme]||SCHEMES.sharepoint;

  const showToast=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast({msg:"",type:"success"}),2500);};

  useEffect(()=>{
    if(!dirty)return;
    clearTimeout(autoRef.current);
    autoRef.current=setTimeout(async()=>{
      try{
        await onSaveRef.current({...chartRef.current,tree},true);
        setDirty(false);
        showToast("Auto-saved to GitHub Gist ✓");
      } catch(e){ showToast("Auto-save failed — check connection","error"); }
    },1500);
    return()=>clearTimeout(autoRef.current);
  },[tree,dirty]);

  const mutate=fn=>{setTree(p=>{const t=fn(clone(p));return t;});setDirty(true);};

  const toWorld=useCallback((sx,sy)=>{
    const r=cvRef.current.getBoundingClientRect();
    return{x:(sx-r.left-vpRef.current.x)/vpRef.current.scale,y:(sy-r.top-vpRef.current.y)/vpRef.current.scale};
  },[]);
  const onWheel=useCallback(e=>{
    e.preventDefault();
    const f=e.deltaY<0?1.1:0.91,r=cvRef.current.getBoundingClientRect();
    const cx=e.clientX-r.left,cy=e.clientY-r.top;
    setVp(p=>{const s=Math.min(3,Math.max(0.2,p.scale*f));return{x:cx-(cx-p.x)*(s/p.scale),y:cy-(cy-p.y)*(s/p.scale),scale:s};});
  },[]);
  useEffect(()=>{const el=cvRef.current;el.addEventListener("wheel",onWheel,{passive:false});return()=>el.removeEventListener("wheel",onWheel);},[onWheel]);

  const onCanvasDown=useCallback(e=>{
    if(e.button!==0||e.target.closest(".ne"))return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current={type:"pan",sc:{x:e.clientX,y:e.clientY},sv:{...vpRef.current}};
  },[]);
  const onNodeDown=useCallback((e,id)=>{
    if(e.button!==0)return;e.stopPropagation();
    e.currentTarget.closest(".cv").setPointerCapture(e.pointerId);
    const w=toWorld(e.clientX,e.clientY),n=findNode(tree,id);
    dragRef.current={type:"node",id,sw:w,sxy:{x:n.x,y:n.y},moved:false};
  },[tree,toWorld]);
  const onMove=useCallback(e=>{
    const d=dragRef.current;if(!d)return;
    if(d.type==="pan"){setVp({...d.sv,x:d.sv.x+(e.clientX-d.sc.x),y:d.sv.y+(e.clientY-d.sc.y)});}
    else{
      const w=toWorld(e.clientX,e.clientY),dx=w.x-d.sw.x,dy=w.y-d.sw.y;
      if(Math.abs(dx)>2||Math.abs(dy)>2)d.moved=true;
      if(!d.moved)return;
      mutate(t=>{const n=findNode(t,d.id);if(n){n.x=d.sxy.x+dx;n.y=d.sxy.y+dy;}return t;});
    }
  },[toWorld]);
  const onUp=useCallback(()=>{dragRef.current=null;},[]);

  const openEdit=useCallback((e,id)=>{
    e.preventDefault();e.stopPropagation();
    const n=findNode(tree,id);setForm({label:n.label,url:n.url||""});setTab("info");setModal({id,mode:"edit"});
  },[tree]);
  const onUrlClick=useCallback((e,id)=>{
    e.stopPropagation();const n=findNode(tree,id);
    if(n.url){window.open(n.url,"_blank");return;}
    setForm({label:n.label,url:""});setModal({id,mode:"url"});
  },[tree]);
  const applyColor=(id,hex)=>mutate(t=>{const n=findNode(t,id);if(n)n.cc=hex;return t;});
  const resetColor=id=>mutate(t=>{const n=findNode(t,id);if(n)n.cc=null;return t;});

  const saveModal=()=>{
    const{id,mode}=modal;
    mutate(t=>{
      if(mode==="edit"||mode==="url"){const n=findNode(t,id);if(mode==="edit")n.label=form.label;n.url=form.url;}
      else if(mode==="add"){
        const par=findNode(t,id);
        const nn=mkNode(uid(),form.label,NEXT_COLOR[par.color]||"leaf",par.x+180,par.y+par.children.length*55);
        nn.url=form.url;par.children.push(nn);
      } else if(mode==="delete"){
        if(id===t.id)return t;
        const par=findParent(t,id);if(par)par.children=par.children.filter(c=>c.id!==id);
      }
      return t;
    });
    setModal(null);
  };

  const manualSave=async()=>{
    clearTimeout(autoRef.current);
    try{
      await onSaveRef.current({...chartRef.current,tree},false);
      setDirty(false);showToast("Saved to GitHub Gist ✓");
    } catch(e){ showToast("Save failed — check connection","error"); }
  };

  const allNodes=flatten(tree);
  const edges=[];
  const be=n=>n.children.forEach(c=>{edges.push({from:n.id,to:c.id});be(c);});be(tree);
  const mNode=modal?findNode(tree,modal.id):null;

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100vh",fontFamily:"'Segoe UI',sans-serif"}}>
      <div style={{background:"#1e3a5f",padding:"10px 16px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <button onClick={onBack} style={{background:"transparent",border:"1px solid #4a90d9",color:"#a0c0e8",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:12,fontWeight:600}}>← Back</button>
        <span style={{color:"#fff",fontWeight:700,fontSize:15}}>{chart.icon} {chart.name}</span>
        {dirty&&<span style={{fontSize:11,color:"#f39c12",background:"#f39c1222",borderRadius:6,padding:"2px 8px"}}>● Unsaved</span>}
        <span style={{color:"#a0c0e8",fontSize:11,flex:1}}>Scroll=Zoom · Hold+Drag=Pan · Drag=Move · Right-click=Edit</span>
        <span style={{color:"#a0c0e8",fontSize:12}}>{Math.round(vp.scale*100)}%</span>
        <TBtn onClick={()=>setVp(v=>({...v,scale:Math.min(3,v.scale*1.15)}))}>＋</TBtn>
        <TBtn onClick={()=>setVp(v=>({...v,scale:Math.max(0.2,v.scale*0.87)}))}>－</TBtn>
        <TBtn onClick={()=>setVp({x:60,y:40,scale:1})}>⟳</TBtn>
        <button onClick={manualSave} style={{background:"#27ae60",border:"none",color:"#fff",borderRadius:7,padding:"5px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>💾 Save</button>
      </div>
      <div ref={cvRef} className="cv" onPointerDown={onCanvasDown} onPointerMove={onMove} onPointerUp={onUp}
        style={{flex:1,overflow:"hidden",position:"relative",cursor:"grab",userSelect:"none",background:"#f0f4fa"}}>
        <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
          <defs><pattern id="dg" x={vp.x%(20*vp.scale)} y={vp.y%(20*vp.scale)} width={20*vp.scale} height={20*vp.scale} patternUnits="userSpaceOnUse"><circle cx={1} cy={1} r={1} fill="#c5d5e8"/></pattern></defs>
          <rect width="100%" height="100%" fill="url(#dg)"/>
        </svg>
        <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",overflow:"visible"}}>
          <defs>
            <filter id="sh"><feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.13"/></filter>
            <marker id="ar" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3z" fill="#4a90d9" opacity="0.55"/></marker>
          </defs>
          <g transform={`translate(${vp.x},${vp.y}) scale(${vp.scale})`}>
            {edges.map(({from,to})=>{
              const fn=findNode(tree,from),tn=findNode(tree,to);if(!fn||!tn)return null;
              const sx=fn.x+NW,sy=fn.y+NH/2,ex=tn.x,ey=tn.y+NH/2,mx=(sx+ex)/2;
              return<path key={`${from}-${to}`} d={`M${sx},${sy} C${mx},${sy} ${mx},${ey} ${ex},${ey}`} fill="none" stroke="#4a90d9" strokeWidth={1.6} strokeOpacity={0.45} markerEnd="url(#ar)"/>;
            })}
            {allNodes.map(node=>{
              const c=nodeColors(node,scheme);
              return(
                <g key={node.id} className="ne" onPointerDown={e=>onNodeDown(e,node.id)} onContextMenu={e=>openEdit(e,node.id)} style={{cursor:"grab"}}>
                  <rect x={node.x+2} y={node.y+3} width={NW} height={NH} rx={9} fill="#00000012"/>
                  <rect x={node.x} y={node.y} width={NW} height={NH} rx={9} fill={c.bg} stroke={c.border} strokeWidth={1.8} filter={node.color==="root"||node.color==="dept"?"url(#sh)":"none"}/>
                  {node.cc&&<circle cx={node.x+10} cy={node.y+10} r={4} fill="#fff" stroke={c.border} strokeWidth={1.5}/>}
                  <foreignObject x={node.x+8} y={node.y+2} width={NW-42} height={NH-4}>
                    <div xmlns="http://www.w3.org/1999/xhtml" style={{height:NH-4,display:"flex",alignItems:"center",fontSize:node.color==="root"?12:11,fontWeight:node.color==="root"||node.color==="dept"?700:500,color:c.text,lineHeight:1.25,overflow:"hidden",fontFamily:"'Segoe UI',sans-serif",pointerEvents:"none",wordBreak:"break-word"}}>
                      📁 {node.label}
                    </div>
                  </foreignObject>
                  <g onPointerDown={e=>e.stopPropagation()} onClick={e=>onUrlClick(e,node.id)} style={{cursor:"pointer"}}>
                    <rect x={node.x+NW-30} y={node.y+8} width={24} height={24} rx={6} fill={node.url?"#4a90d9":"#e8f0fe"} stroke={node.url?"#2c6fad":"#b3d4f5"} strokeWidth={1}/>
                    <text x={node.x+NW-18} y={node.y+24} textAnchor="middle" fontSize={13} style={{pointerEvents:"none"}}>{node.url?"🔗":"➕"}</text>
                  </g>
                </g>
              );
            })}
          </g>
        </svg>
        <div style={{position:"absolute",bottom:12,right:12,background:"#1e3a5fcc",color:"#cde",fontSize:11,borderRadius:8,padding:"6px 12px",pointerEvents:"none"}}>
          🖱️ Scroll=Zoom · Hold+Drag=Pan · Right-click=Edit
        </div>
        <div style={{position:"absolute",top:12,right:12,background:"#1e3a5fcc",color:"#a0c0e8",fontSize:11,borderRadius:8,padding:"4px 10px",pointerEvents:"none"}}>
          ☁️ GitHub Gist sync on
        </div>
      </div>
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#0007",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}} onClick={()=>setModal(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:14,padding:24,width:400,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 8px 40px #0004"}}>
            {(modal.mode==="edit"||modal.mode==="url")&&<>
              <h3 style={{margin:"0 0 14px",color:"#1e3a5f",fontSize:16}}>✏️ Edit Node</h3>
              <div style={{display:"flex",borderBottom:"2px solid #e8f0fe",marginBottom:14}}>
                {["info","color"].map(t=>(
                  <button key={t} onClick={()=>setTab(t)} style={{padding:"6px 18px",border:"none",borderBottom:tab===t?"2px solid #4a90d9":"2px solid transparent",background:"transparent",color:tab===t?"#4a90d9":"#888",fontWeight:600,fontSize:13,cursor:"pointer",marginBottom:-2}}>
                    {t==="info"?"📝 Info":"🎨 Color"}
                  </button>
                ))}
              </div>
              {tab==="info"&&<>
                <Field label="Folder Name" value={form.label} onChange={v=>setForm(f=>({...f,label:v}))} autoFocus/>
                <Field label="SharePoint / OneDrive URL" value={form.url} onChange={v=>setForm(f=>({...f,url:v}))} placeholder="https://yourcompany.sharepoint.com/..."/>
                <BtnRow>
                  <Btn v="danger" onClick={()=>setModal({id:modal.id,mode:"delete"})}>🗑</Btn>
                  <Btn v="outline" onClick={()=>{setForm({label:"New Folder",url:""});setModal({id:modal.id,mode:"add"});}}>＋ Child</Btn>
                  <Btn v="primary" onClick={saveModal}>Save</Btn>
                </BtnRow>
              </>}
              {tab==="color"&&<>
                {mNode&&(()=>{const c=nodeColors(mNode,scheme);return(
                  <div style={{marginBottom:14,display:"flex",justifyContent:"center"}}>
                    <div style={{width:NW,height:NH,borderRadius:9,background:c.bg,border:`2px solid ${c.border}`,display:"flex",alignItems:"center",paddingLeft:10,fontSize:12,fontWeight:700,color:c.text,boxShadow:"0 2px 8px #0002"}}>
                      📁 {mNode.label}
                    </div>
                  </div>
                );})()}
                <ColorPicker current={mNode?.cc||""} onSelect={h=>applyColor(modal.id,h)} onReset={()=>resetColor(modal.id)}/>
                <BtnRow><Btn v="ghost" onClick={()=>setModal(null)}>Close</Btn></BtnRow>
              </>}
            </>}
            {modal.mode==="add"&&<>
              <h3 style={{margin:"0 0 14px",color:"#1e3a5f",fontSize:16}}>➕ Add Sub-folder</h3>
              <Field label="Folder Name" value={form.label} onChange={v=>setForm(f=>({...f,label:v}))} autoFocus/>
              <Field label="URL (optional)" value={form.url} onChange={v=>setForm(f=>({...f,url:v}))} placeholder="https://..."/>
              <BtnRow><Btn v="ghost" onClick={()=>setModal(null)}>Cancel</Btn><Btn v="primary" onClick={saveModal}>Add</Btn></BtnRow>
            </>}
            {modal.mode==="delete"&&<>
              <h3 style={{margin:"0 0 10px",color:"#e05a5a",fontSize:16}}>🗑 Delete Node?</h3>
              <p style={{color:"#555",fontSize:13,margin:"0 0 20px"}}>Remove <b>{findNode(tree,modal.id)?.label}</b> and all its children?</p>
              <BtnRow><Btn v="ghost" onClick={()=>setModal(null)}>Cancel</Btn><Btn v="danger" onClick={saveModal}>Delete</Btn></BtnRow>
            </>}
          </div>
        </div>
      )}
      <Toast msg={toast.msg} type={toast.type}/>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// LANDING PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function App(){
  const [charts,     setCharts]     = useState(null);
  const [activeId,   setActiveId]   = useState(null);
  const [showNew,    setShowNew]    = useState(false);
  const [newName,    setNewName]    = useState("");
  const [tmpl,       setTmpl]       = useState(TEMPLATES[0]);
  const [search,     setSearch]     = useState("");
  const [delId,      setDelId]      = useState(null);
  const [toast,      setToast]      = useState({msg:"",type:"success"});
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal,  setRenameVal]  = useState("");
  const [token,      setToken]      = useState(()=>localStorage.getItem(LS_TOKEN)||"");
  const [gistId,     setGistId]     = useState(()=>localStorage.getItem(LS_GISTID)||"");
  const [username,   setUsername]   = useState("");
  const [syncing,    setSyncing]    = useState(false);

  const showToast=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast({msg:"",type:"success"}),2500);};

  // ── initial load ─────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!token){setCharts(DEFAULT_CHARTS);return;}
    (async()=>{
      setSyncing(true);
      try{
        const user=await verifyToken(token);
        setUsername(user);
        let gid=gistId;
        // If no gistId in localStorage, search GitHub for existing gist
        if(!gid){
          gid = await gistFind(token);
          if(gid){
            localStorage.setItem(LS_GISTID,gid);
            setGistId(gid);
          }
        }
        if(gid){
          const saved=await gistLoad(token,gid);
          setCharts(saved||DEFAULT_CHARTS);
        } else {
          const newGid=await gistCreate(token,DEFAULT_CHARTS);
          localStorage.setItem(LS_GISTID,newGid);
          setGistId(newGid);
          setCharts(DEFAULT_CHARTS);
        }
      } catch(e){
        setCharts(DEFAULT_CHARTS);
        showToast("Could not connect to GitHub Gist — using local fallback","warning");
      } finally{setSyncing(false);}
    })();
  },[token]);

  const handleConnect=async(tok,user)=>{
    setToken(tok);setUsername(user);
    setSyncing(true);
    try{
      // First try to find an existing gist before creating a new one
      let gid = await gistFind(tok);
      if(gid){
        localStorage.setItem(LS_GISTID,gid);
        setGistId(gid);
        const saved = await gistLoad(tok,gid);
        setCharts(saved||DEFAULT_CHARTS);
        showToast("Restored your flowcharts from GitHub Gist ✓");
      } else {
        gid = await gistCreate(tok,DEFAULT_CHARTS);
        localStorage.setItem(LS_GISTID,gid);
        setGistId(gid);
        setCharts(DEFAULT_CHARTS);
        showToast("New Gist created & connected ✓");
      }
    } catch(e){ showToast("Connected but couldn't sync Gist","error"); }
    finally{setSyncing(false);}
  };

  const handleSave=useCallback(async(updated,silent=false)=>{
    setCharts(p=>{
      const next=p.map(c=>c.id===updated.id?updated:c);
      const tok=localStorage.getItem(LS_TOKEN);
      const gid=localStorage.getItem(LS_GISTID);
      if(tok&&gid) gistSave(tok,gid,next).catch(()=>{});
      return next;
    });
    if(!silent) showToast("Saved to GitHub Gist ✓");
  },[]);

  const commitRename=()=>{
    if(!renameVal.trim()){setRenamingId(null);return;}
    setCharts(p=>{
      const next=p.map(c=>c.id===renamingId?{...c,name:renameVal.trim()}:c);
      const tok=localStorage.getItem(LS_TOKEN);
      const gid=localStorage.getItem(LS_GISTID);
      if(tok&&gid) gistSave(tok,gid,next).catch(()=>{});
      return next;
    });
    setRenamingId(null);
    showToast("Renamed ✓");
  };

  const disconnect=()=>{
    localStorage.removeItem(LS_TOKEN);localStorage.removeItem(LS_GISTID);
    setToken("");setGistId("");setUsername("");
    showToast("Disconnected from GitHub Gist");
  };

  if(!token) return <TokenSetup onConnect={handleConnect}/>;

  if(charts===null||syncing) return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0f1e35,#1e3a5f)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Segoe UI',sans-serif"}}>
      <div style={{textAlign:"center",color:"#a0c0e8"}}>
        <div style={{fontSize:40,marginBottom:12}}>☁️</div>
        <div style={{fontSize:16,fontWeight:600}}>Syncing with GitHub Gist...</div>
      </div>
    </div>
  );

  const active=charts.find(c=>c.id===activeId);
  if(active) return <Editor chart={active} onBack={()=>setActiveId(null)} onSave={handleSave}/>;

  const filtered=charts.filter(c=>c.name.toLowerCase().includes(search.toLowerCase()));

  const createChart=()=>{
    if(!newName.trim())return;
    const nc={id:uid(),name:newName.trim(),icon:tmpl.icon,scheme:tmpl.scheme,
      tree:mkNode(uid(),"Start","root",80,200),createdAt:new Date().toLocaleDateString()};
    setCharts(p=>{
      const next=[...p,nc];
      const tok=localStorage.getItem(LS_TOKEN),gid=localStorage.getItem(LS_GISTID);
      if(tok&&gid) gistSave(tok,gid,next).catch(()=>{});
      return next;
    });
    setActiveId(nc.id);setShowNew(false);setNewName("");
  };

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0f1e35 0%,#1e3a5f 50%,#1a4a7a 100%)",fontFamily:"'Segoe UI',sans-serif"}}>
      {/* hero */}
      <div style={{padding:"40px 32px 24px",textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:8}}>🗺️</div>
        <h1 style={{color:"#fff",margin:"0 0 6px",fontSize:30,fontWeight:800,letterSpacing:-1}}>Flowchart Builder</h1>
        <p style={{color:"#a0c0e8",margin:"0 0 4px",fontSize:14}}>Create, organize, and navigate interactive flowcharts for your team</p>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:24}}>
          <span style={{color:"#27ae60",fontSize:12}}>☁️ Synced to GitHub Gist as <b style={{color:"#4a90d9"}}>@{username}</b></span>
          <button onClick={disconnect} style={{background:"transparent",border:"1px solid #2c5282",color:"#7090b0",borderRadius:6,padding:"2px 8px",fontSize:11,cursor:"pointer"}}>Disconnect</button>
        </div>
        <button onClick={()=>setShowNew(true)}
          style={{background:"linear-gradient(135deg,#4a90d9,#27ae60)",border:"none",color:"#fff",borderRadius:12,padding:"12px 32px",fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 20px #4a90d955"}}>
          ＋ New Flowchart
        </button>
      </div>

      {/* grid */}
      <div style={{maxWidth:960,margin:"0 auto",padding:"0 24px 48px"}}>
        <div style={{marginBottom:20,display:"flex",alignItems:"center",gap:12}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search flowcharts..."
            style={{flex:1,padding:"10px 16px",borderRadius:10,border:"1.5px solid #2c5282",background:"#162d4e",color:"#fff",fontSize:13,outline:"none"}}/>
          <span style={{color:"#a0c0e8",fontSize:13}}>{filtered.length} chart{filtered.length!==1?"s":""}</span>
        </div>

        {filtered.length===0
          ?<div style={{textAlign:"center",color:"#a0c0e8",padding:60,fontSize:15}}>No flowcharts found. Create one!</div>
          :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:20}}>
            {filtered.map(chart=>(
              <div key={chart.id}
                style={{background:"linear-gradient(145deg,#1e3a5f,#162d4e)",borderRadius:16,border:"1.5px solid #2c5282",overflow:"hidden",cursor:"pointer",transition:"transform 0.15s,box-shadow 0.15s",boxShadow:"0 4px 20px #00000033"}}
                onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.boxShadow="0 8px 32px #00000055";}}
                onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="0 4px 20px #00000033";}}>
                <div onClick={()=>setActiveId(chart.id)} style={{height:110,background:SCHEMES[chart.scheme].root.bg,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>
                  <MiniPreview chart={chart}/>
                  <div style={{position:"absolute",bottom:8,right:10,background:"#ffffff22",borderRadius:6,padding:"2px 8px",fontSize:11,color:"#fff",fontWeight:600}}>Open →</div>
                </div>
                <div style={{padding:"14px 16px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontSize:18}}>{chart.icon}</span>
                    <div style={{display:"flex",gap:4}}>
                      <button onClick={e=>{e.stopPropagation();setRenamingId(chart.id);setRenameVal(chart.name);}}
                        style={{background:"transparent",border:"none",color:"#a0c0e8",cursor:"pointer",fontSize:14}} title="Rename">✎</button>
                      <button onClick={e=>{e.stopPropagation();setDelId(chart.id);}}
                        style={{background:"transparent",border:"none",color:"#e05a5a",cursor:"pointer",fontSize:14}} title="Delete">🗑</button>
                    </div>
                  </div>
                  {renamingId===chart.id?(
                    <div onClick={e=>e.stopPropagation()} style={{marginBottom:4}}>
                      <input autoFocus value={renameVal} onChange={e=>setRenameVal(e.target.value)}
                        onKeyDown={e=>{if(e.key==="Enter")commitRename();if(e.key==="Escape")setRenamingId(null);}}
                        style={{width:"100%",padding:"5px 8px",borderRadius:6,border:"1.5px solid #4a90d9",background:"#0f2240",color:"#fff",fontSize:13,boxSizing:"border-box",outline:"none"}}/>
                      <div style={{display:"flex",gap:6,marginTop:5}}>
                        <button onClick={commitRename} style={{flex:1,padding:"4px",borderRadius:6,background:"#4a90d9",color:"#fff",border:"none",fontSize:11,cursor:"pointer",fontWeight:600}}>✓ Save</button>
                        <button onClick={()=>setRenamingId(null)} style={{flex:1,padding:"4px",borderRadius:6,background:"transparent",color:"#a0c0e8",border:"1px solid #2c5282",fontSize:11,cursor:"pointer"}}>Cancel</button>
                      </div>
                    </div>
                  ):(
                    <div style={{color:"#fff",fontWeight:700,fontSize:14,marginBottom:4}}>{chart.name}</div>
                  )}
                  <div style={{color:"#7090b0",fontSize:11}}>Created {chart.createdAt} · {flatten(chart.tree).length} nodes</div>
                  <div style={{marginTop:8,display:"flex",gap:6,alignItems:"center"}}>
                    <span style={{background:SCHEMES[chart.scheme].dept.bg,color:SCHEMES[chart.scheme].dept.text,fontSize:10,borderRadius:6,padding:"2px 8px",fontWeight:600}}>{chart.scheme}</span>
                    <span style={{color:"#27ae60",fontSize:10}}>☁️ gist synced</span>
                  </div>
                </div>
              </div>
            ))}
            <div onClick={()=>setShowNew(true)}
              style={{background:"transparent",borderRadius:16,border:"2px dashed #2c5282",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",minHeight:220,color:"#4a90d9"}}
              onMouseEnter={e=>{e.currentTarget.style.background="#1e3a5f55";e.currentTarget.style.borderColor="#4a90d9";}}
              onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor="#2c5282";}}>
              <div style={{fontSize:36,marginBottom:8}}>＋</div>
              <div style={{fontWeight:700,fontSize:14}}>New Flowchart</div>
            </div>
          </div>
        }
      </div>

      {/* new chart modal */}
      {showNew&&(
        <div style={{position:"fixed",inset:0,background:"#0008",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}} onClick={()=>setShowNew(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:28,width:420,boxShadow:"0 8px 40px #0005"}}>
            <h3 style={{margin:"0 0 20px",color:"#1e3a5f",fontSize:18}}>🆕 New Flowchart</h3>
            <Field label="Chart Name" value={newName} onChange={setNewName} autoFocus placeholder="e.g. Q3 Project Plan"/>
            <div style={{marginBottom:18}}>
              <label style={{fontSize:11,color:"#555",display:"block",marginBottom:8,fontWeight:600}}>Template</label>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {TEMPLATES.map(t=>(
                  <div key={t.label} onClick={()=>setTmpl(t)}
                    style={{padding:"10px 12px",borderRadius:10,cursor:"pointer",border:`2px solid ${tmpl.label===t.label?"#4a90d9":"#e0e8f0"}`,background:tmpl.label===t.label?"#e8f0fe":"#f9fafb",transition:"all 0.1s"}}>
                    <div style={{fontSize:20,marginBottom:2}}>{t.icon}</div>
                    <div style={{fontSize:12,fontWeight:700,color:"#1e3a5f"}}>{t.label}</div>
                    <div style={{fontSize:11,color:"#888"}}>{t.desc}</div>
                  </div>
                ))}
              </div>
            </div>
            <BtnRow><Btn v="ghost" onClick={()=>setShowNew(false)}>Cancel</Btn><Btn v="primary" onClick={createChart}>Create →</Btn></BtnRow>
          </div>
        </div>
      )}

      {/* delete confirm */}
      {delId&&(
        <div style={{position:"fixed",inset:0,background:"#0008",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}} onClick={()=>setDelId(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:14,padding:24,width:360,boxShadow:"0 8px 40px #0004"}}>
            <h3 style={{margin:"0 0 10px",color:"#e05a5a",fontSize:16}}>🗑 Delete Flowchart?</h3>
            <p style={{color:"#555",fontSize:13,margin:"0 0 20px"}}>Remove <b>{charts.find(c=>c.id===delId)?.name}</b>? This cannot be undone.</p>
            <BtnRow>
              <Btn v="ghost" onClick={()=>setDelId(null)}>Cancel</Btn>
              <Btn v="danger" onClick={()=>{
                setCharts(p=>{
                  const next=p.filter(c=>c.id!==delId);
                  const tok=localStorage.getItem(LS_TOKEN),gid=localStorage.getItem(LS_GISTID);
                  if(tok&&gid) gistSave(tok,gid,next).catch(()=>{});
                  return next;
                });
                setDelId(null);
              }}>Delete</Btn>
            </BtnRow>
          </div>
        </div>
      )}
      <Toast msg={toast.msg} type={toast.type}/>
    </div>
  );
}