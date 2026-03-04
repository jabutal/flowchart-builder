import { useState, useRef, useCallback, useEffect } from "react";

let _id = 3000;
const uid = () => `n${++_id}`;
const clone = o => JSON.parse(JSON.stringify(o));

// ── Gist API ───────────────────────────────────────────────────────────────────
const GIST_FILE="flowchart-builder-data.json", TEAM_GIST_FILE="flowchart-builder-team.json";
const LS_TOKEN="fc:token", LS_GIST_ID="fc:gist_id", LS_TEAM_TOKEN="fc:team_token", LS_TEAM_GIST_ID="fc:team_gist_id";
const hdrs=t=>({"Authorization":`token ${t}`,"Content-Type":"application/json","Accept":"application/vnd.github.v3+json"});
const apiGet=(url,t)=>fetch(url,{headers:hdrs(t)}).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();});
const apiPost=(url,t,b)=>fetch(url,{method:"POST",headers:hdrs(t),body:JSON.stringify(b)}).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();});
const apiPatch=(url,t,b)=>fetch(url,{method:"PATCH",headers:hdrs(t),body:JSON.stringify(b)}).then(r=>{if(!r.ok)throw new Error(r.status);return r.json();});
const verifyToken=t=>apiGet("https://api.github.com/user",t).then(d=>d.login);
const loadGist=async(t,id,file)=>{const d=await apiGet(`https://api.github.com/gists/${id}`,t);const c=d.files[file]?.content;return c?JSON.parse(c):null;};
const saveGist=(t,id,file,data)=>apiPatch(`https://api.github.com/gists/${id}`,t,{files:{[file]:{content:JSON.stringify(data,null,2)}}});
const createGist=async(t,file,data,desc)=>{const d=await apiPost("https://api.github.com/gists",t,{description:desc,public:false,files:{[file]:{content:JSON.stringify(data,null,2)}}});return d.id;};
const findGist=async(t,file)=>{let p=1;while(true){const d=await apiGet(`https://api.github.com/gists?per_page=100&page=${p}`,t);if(!d.length)break;const f=d.find(g=>g.files&&g.files[file]);if(f)return f.id;if(d.length<100)break;p++;}return null;};

// ── Shape definitions ──────────────────────────────────────────────────────────
const SHAPES = {
  rect:        { label:"Rectangle",          icon:"▭" },
  rounded:     { label:"Rounded Rect",       icon:"▢" },
  diamond:     { label:"Diamond",            icon:"◇" },
  parallelogram:{ label:"Parallelogram",     icon:"▱" },
  cylinder:    { label:"Cylinder (DB)",      icon:"⬭" },
  oval:        { label:"Circle / Oval",      icon:"◯" },
  hexagon:     { label:"Hexagon",            icon:"⬡" },
  document:    { label:"Document",           icon:"🗋" },
};

// Returns SVG path/element for a given shape
function ShapePath({ shape="rect", x, y, w, h, fill, stroke, strokeWidth=1.8, filter }) {
  const f = filter ? `url(#${filter})` : "none";
  switch(shape) {
    case "rounded":
      return <rect x={x} y={y} width={w} height={h} rx={12} fill={fill} stroke={stroke} strokeWidth={strokeWidth} filter={f}/>;
    case "diamond": {
      const cx=x+w/2, cy=y+h/2;
      return <polygon points={`${cx},${y} ${x+w},${cy} ${cx},${y+h} ${x},${cy}`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} filter={f}/>;
    }
    case "parallelogram": {
      const sk=14;
      return <polygon points={`${x+sk},${y} ${x+w},${y} ${x+w-sk},${y+h} ${x},${y+h}`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} filter={f}/>;
    }
    case "cylinder": {
      const ry=8, cx=x+w/2;
      return <g filter={f}>
        <path d={`M${x},${y+ry} Q${x},${y} ${cx},${y} Q${x+w},${y} ${x+w},${y+ry} L${x+w},${y+h-ry} Q${x+w},${y+h} ${cx},${y+h} Q${x},${y+h} ${x},${y+h-ry} Z`} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/>
        <ellipse cx={cx} cy={y+ry} rx={w/2} ry={ry} fill={fill} stroke={stroke} strokeWidth={strokeWidth}/>
      </g>;
    }
    case "oval":
      return <ellipse cx={x+w/2} cy={y+h/2} rx={w/2} ry={h/2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} filter={f}/>;
    case "hexagon": {
      const cx=x+w/2, cy=y+h/2, r=h/2, side=w/2-r*0.3;
      return <polygon points={`${cx-side},${y} ${cx+side},${y} ${x+w},${cy} ${cx+side},${y+h} ${cx-side},${y+h} ${x},${cy}`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} filter={f}/>;
    }
    case "document": {
      const wv=8;
      return <path d={`M${x},${y} L${x+w},${y} L${x+w},${y+h-wv} Q${x+w*0.75},${y+h+wv} ${x+w*0.5},${y+h-wv} Q${x+w*0.25},${y+h-wv*3} ${x},${y+h-wv} Z`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} filter={f}/>;
    }
    default:
      return <rect x={x} y={y} width={w} height={h} rx={6} fill={fill} stroke={stroke} strokeWidth={strokeWidth} filter={f}/>;
  }
}

// ── constants ──────────────────────────────────────────────────────────────────
const SCHEMES={
  sharepoint:{root:{bg:"#1e3a5f",text:"#fff",border:"#0f2240"},dept:{bg:"#4a90d9",text:"#fff",border:"#2c6fad"},sub:{bg:"#e8f0fe",text:"#1e3a5f",border:"#4a90d9"},leaf:{bg:"#f8faff",text:"#2d3748",border:"#b3d4f5"}},
  green:     {root:{bg:"#1a4731",text:"#fff",border:"#0f2d1e"},dept:{bg:"#27ae60",text:"#fff",border:"#1e8449"},sub:{bg:"#eafaf1",text:"#1a4731",border:"#27ae60"},leaf:{bg:"#f9fefe",text:"#2d3748",border:"#a9dfbf"}},
  purple:    {root:{bg:"#3b1f6e",text:"#fff",border:"#260f52"},dept:{bg:"#8e44ad",text:"#fff",border:"#6c3483"},sub:{bg:"#f5eef8",text:"#3b1f6e",border:"#8e44ad"},leaf:{bg:"#fdfefe",text:"#2d3748",border:"#d7bde2"}},
  orange:    {root:{bg:"#7d3c0a",text:"#fff",border:"#5d2d07"},dept:{bg:"#e67e22",text:"#fff",border:"#ca6f1e"},sub:{bg:"#fef5e7",text:"#7d3c0a",border:"#e67e22"},leaf:{bg:"#fffdf9",text:"#2d3748",border:"#fad7a0"}},
};
const SWATCHES=["#1e3a5f","#4a90d9","#27ae60","#8e44ad","#e67e22","#e05a5a","#16a085","#2c3e50","#f39c12","#d35400","#7f8c8d","#1abc9c","#e8f0fe","#eafaf1","#f5eef8","#fef5e7","#ffffff","#f0f4fa","#2d3748","#000000"];
const NEXT_COLOR={root:"dept",dept:"sub",sub:"leaf",leaf:"leaf"};
const NW=148,NH=48;
const TEMPLATES=[
  {label:"SharePoint Folders",icon:"🗂️",scheme:"sharepoint",desc:"OneDrive / SharePoint"},
  {label:"Project Workflow",  icon:"📋",scheme:"green",      desc:"Task & process flow"},
  {label:"Org Chart",         icon:"🏢",scheme:"purple",     desc:"Team structure"},
  {label:"Custom",            icon:"✨",scheme:"orange",     desc:"Blank canvas"},
];
const TAG_COLORS=[{bg:"#dbeafe",text:"#1e40af",border:"#93c5fd"},{bg:"#dcfce7",text:"#166534",border:"#86efac"},{bg:"#fce7f3",text:"#9d174d",border:"#f9a8d4"},{bg:"#fef9c3",text:"#854d0e",border:"#fde047"},{bg:"#ede9fe",text:"#5b21b6",border:"#c4b5fd"},{bg:"#ffedd5",text:"#9a3412",border:"#fdba74"},{bg:"#e0f2fe",text:"#0c4a6e",border:"#7dd3fc"},{bg:"#f1f5f9",text:"#334155",border:"#cbd5e1"}];
const tagColor=tag=>TAG_COLORS[Math.abs(tag.split("").reduce((a,c)=>a+c.charCodeAt(0),0))%TAG_COLORS.length];

const mkNode=(id,label,color,x,y,children=[])=>({id,label,color,url:"",cc:null,shape:"rect",x,y,children});
const SP_TREE=mkNode("root","Company SharePoint Root","root",40,340,[
  mkNode("sales","Sales","dept",260,120,[mkNode("s1","Leads & Prospects","sub",480,40),mkNode("s2","Proposals & Quotes","sub",480,110),mkNode("s3","Contracts","sub",480,180),mkNode("s4","Sales Reports","sub",480,250,[mkNode("s4a","Monthly","leaf",700,200),mkNode("s4b","Quarterly","leaf",700,260),mkNode("s4c","Annual","leaf",700,320)]),mkNode("s5","Templates","sub",480,350)]),
  mkNode("projects","Projects","dept",260,430,[mkNode("p0","_Templates","sub",480,410,[mkNode("p0a","Project Charter","leaf",700,370),mkNode("p0b","Status Reports","leaf",700,430),mkNode("p0c","Meeting Notes","leaf",700,490)]),mkNode("p1","Active Projects","sub",480,520,[mkNode("p1a","2025-01 Alpha","leaf",700,545),mkNode("p1b","2025-02 Beta","leaf",700,600)]),mkNode("p2","Completed","sub",480,640,[mkNode("p2a","2024 Archived","leaf",700,655)])]),
  mkNode("shared","Shared Resources","dept",260,720,[mkNode("r1","Company Templates","sub",480,720),mkNode("r2","Brand Assets","sub",480,790,[mkNode("r2a","Logos","leaf",700,760),mkNode("r2b","Style Guides","leaf",700,820)]),mkNode("r3","Policies & Procedures","sub",480,870),mkNode("r4","Training Materials","sub",480,940)]),
]);
const DEFAULT_MY=[{id:"sp1",name:"SharePoint Folder Structure",icon:"🗂️",scheme:"sharepoint",tree:clone(SP_TREE),createdAt:new Date().toLocaleDateString(),owner:"me",tags:[]}];
const DEFAULT_TEAM=[];

// ── tree helpers ───────────────────────────────────────────────────────────────
const flatten=(n,a=[])=>{a.push(n);n.children.forEach(c=>flatten(c,a));return a;};
const findNode=(t,id)=>flatten(t).find(n=>n.id===id);
const findParent=(t,id)=>{if(t.children.some(c=>c.id===id))return t;for(const c of t.children){const p=findParent(c,id);if(p)return p;}return null;};
const contrastText=hex=>{const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return(r*299+g*587+b*114)/1000>128?"#1e1e1e":"#ffffff";};
const darken=(hex,amt=30)=>{const f=n=>Math.max(0,Math.min(255,parseInt(hex.slice(n,n+2),16)-amt)).toString(16).padStart(2,"0");return`#${f(1)}${f(3)}${f(5)}`;};
const nodeColors=(node,scheme)=>node.cc?{bg:node.cc,text:contrastText(node.cc),border:darken(node.cc)}:(scheme[node.color]||scheme.leaf);

// deep duplicate a subtree with new IDs
function deepDuplicateNode(node, offsetX=20, offsetY=20) {
  return {
    ...clone(node),
    id: uid(),
    x: node.x + offsetX,
    y: node.y + offsetY,
    children: node.children.map(c => deepDuplicateNode(c, offsetX, offsetY))
  };
}

// ── UI atoms ───────────────────────────────────────────────────────────────────
function Field({label,value,onChange,placeholder,autoFocus,type="text",hint}){
  return(<div style={{marginBottom:12}}><label style={{fontSize:11,color:"#555",display:"block",marginBottom:4,fontWeight:600}}>{label}</label><input autoFocus={autoFocus} value={value} placeholder={placeholder} type={type} onChange={e=>onChange(e.target.value)} style={{width:"100%",padding:"7px 10px",borderRadius:7,border:"1.5px solid #d0dcea",fontSize:13,boxSizing:"border-box",outline:"none"}}/>{hint&&<p style={{fontSize:11,color:"#888",margin:"4px 0 0"}}>{hint}</p>}</div>);
}
function BtnRow({children}){return<div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:10}}>{children}</div>;}
function Btn({v,onClick,children,disabled}){
  const S={primary:{background:"#4a90d9",color:"#fff",border:"none"},outline:{background:"#fff",color:"#4a90d9",border:"1.5px solid #4a90d9"},danger:{background:"#fff",color:"#e05a5a",border:"1.5px solid #e05a5a"},ghost:{background:"#fff",color:"#888",border:"1.5px solid #ccc"},team:{background:"#8e44ad",color:"#fff",border:"none"},move:{background:"#16a085",color:"#fff",border:"none"},dup:{background:"#f39c12",color:"#fff",border:"none"}};
  return<button onClick={onClick} disabled={disabled} style={{padding:"7px 14px",borderRadius:7,fontSize:12,cursor:disabled?"not-allowed":"pointer",fontWeight:600,opacity:disabled?0.6:1,...S[v]}}>{children}</button>;
}
function TBtn({onClick,children}){return<button onClick={onClick} style={{padding:"4px 10px",borderRadius:7,border:"1px solid #4a90d9",background:"transparent",color:"#a0c0e8",fontSize:12,cursor:"pointer",fontWeight:600}}>{children}</button>;}
function Toast({msg,type="success"}){if(!msg)return null;const bg={error:"#c0392b",warning:"#e67e22",team:"#8e44ad",move:"#16a085",dup:"#f39c12",success:"#1e3a5f"}[type]||"#1e3a5f";return<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:bg,color:"#fff",padding:"10px 22px",borderRadius:20,fontSize:13,boxShadow:"0 4px 20px #0004",zIndex:9999,whiteSpace:"nowrap"}}>{msg}</div>;}
function TagBadge({tag,onRemove}){const c=tagColor(tag);return(<span style={{display:"inline-flex",alignItems:"center",gap:4,background:c.bg,color:c.text,border:`1px solid ${c.border}`,borderRadius:12,padding:"2px 8px",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}># {tag}{onRemove&&<span onClick={e=>{e.stopPropagation();onRemove(tag);}} style={{cursor:"pointer",fontSize:12,opacity:0.7}}>×</span>}</span>);}
function TagEditor({tags=[],onChange}){
  const [input,setInput]=useState("");
  const add=()=>{const t=input.trim().toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9\-]/g,"");if(!t||tags.includes(t))return;onChange([...tags,t]);setInput("");};
  return(<div><label style={{fontSize:11,color:"#555",display:"block",marginBottom:6,fontWeight:600}}>Tags</label><div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8,minHeight:28}}>{tags.map(t=><TagBadge key={t} tag={t} onRemove={tag=>onChange(tags.filter(x=>x!==tag))}/>)}{tags.length===0&&<span style={{color:"#aaa",fontSize:12}}>No tags yet</span>}</div><div style={{display:"flex",gap:6}}><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"||e.key===","||e.key===" "){e.preventDefault();add();}}} placeholder="Add tag (press Enter)" style={{flex:1,padding:"6px 10px",borderRadius:7,border:"1.5px solid #d0dcea",fontSize:12,outline:"none"}}/><button onClick={add} style={{padding:"6px 12px",borderRadius:7,background:"#4a90d9",color:"#fff",border:"none",fontSize:12,cursor:"pointer",fontWeight:600}}>＋</button></div><p style={{fontSize:11,color:"#aaa",margin:"4px 0 0"}}>Press Enter, comma, or space to add.</p></div>);
}

// ── Shape Picker ───────────────────────────────────────────────────────────────
function ShapePicker({current,onChange}){
  return(
    <div>
      <label style={{fontSize:11,color:"#555",display:"block",marginBottom:8,fontWeight:600}}>Node Shape</label>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
        {Object.entries(SHAPES).map(([key,{label,icon}])=>(
          <div key={key} onClick={()=>onChange(key)}
            style={{padding:"8px 4px",borderRadius:8,border:`2px solid ${current===key?"#4a90d9":"#e0e8f0"}`,background:current===key?"#e8f0fe":"#f9fafb",cursor:"pointer",textAlign:"center",transition:"all 0.1s"}}>
            <div style={{fontSize:18,marginBottom:2}}>{icon}</div>
            <div style={{fontSize:9,color:"#555",fontWeight:600,lineHeight:1.2}}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ColorPicker({current,onSelect,onReset}){
  const [hex,setHex]=useState(current||"#4a90d9");
  return(<div><p style={{fontSize:11,fontWeight:600,color:"#888",textTransform:"uppercase",letterSpacing:1,margin:"0 0 8px"}}>Quick Swatches</p><div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>{SWATCHES.map(s=><div key={s} onClick={()=>onSelect(s)} style={{width:22,height:22,borderRadius:5,background:s,cursor:"pointer",flexShrink:0,boxSizing:"border-box",transition:"transform 0.1s",border:current===s?"3px solid #1e3a5f":"1.5px solid #ccc"}} onMouseEnter={e=>e.currentTarget.style.transform="scale(1.25)"} onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}/>)}</div><div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}><input type="color" value={hex} onChange={e=>setHex(e.target.value)} style={{width:36,height:30,border:"1.5px solid #ccc",borderRadius:6,cursor:"pointer",padding:2}}/><input value={hex} onChange={e=>setHex(e.target.value)} style={{flex:1,padding:"6px 8px",borderRadius:6,border:"1.5px solid #ccc",fontSize:12,outline:"none"}}/><button onClick={()=>onSelect(hex)} style={{padding:"6px 12px",borderRadius:6,background:"#4a90d9",color:"#fff",border:"none",fontSize:12,cursor:"pointer",fontWeight:600}}>Apply</button></div>{onReset&&<button onClick={onReset} style={{width:"100%",padding:"6px",borderRadius:6,background:"#f0f4fa",color:"#555",border:"1.5px solid #ccc",fontSize:12,cursor:"pointer"}}>↺ Reset to default</button>}</div>);
}

function MiniPreview({chart}){
  const nodes=flatten(chart.tree).slice(0,10);
  const scheme=SCHEMES[chart.scheme]||SCHEMES.sharepoint;
  const xs=nodes.map(n=>n.x),ys=nodes.map(n=>n.y);
  const mnx=Math.min(...xs),mxx=Math.max(...xs)+NW,mny=Math.min(...ys),mxy=Math.max(...ys)+NH;
  const W=mxx-mnx||1,H=mxy-mny||1,sc=Math.min(220/W,90/H,1);
  return(<svg width="100%" height="100%" viewBox="-10 -5 240 100" style={{opacity:0.85}}><g transform={`translate(${10+(220-W*sc)/2},${5+(90-H*sc)/2}) scale(${sc})`}>{nodes.map(n=>{const c=nodeColors(n,scheme);return<ShapePicker key={n.id}/>;})}{nodes.map(n=>{const c=nodeColors(n,scheme);return<ShapePath key={n.id} shape={n.shape||"rect"} x={n.x-mnx} y={n.y-mny} w={NW} h={NH} fill={c.bg} stroke={c.border} strokeWidth={2}/>;})}</g></svg>);
}

// ── Token Setup ────────────────────────────────────────────────────────────────
function TokenSetup({onConnect}){
  const [token,setToken]=useState(""),[ teamToken,setTeamToken]=useState(""),[ loading,setLoading]=useState(false),[err,setErr]=useState(""),[showTeam,setShowTeam]=useState(false);
  const connect=async()=>{if(!token.trim()){setErr("Please enter your PAT.");return;}setLoading(true);setErr("");try{const u=await verifyToken(token.trim());localStorage.setItem(LS_TOKEN,token.trim());if(teamToken.trim()){try{await verifyToken(teamToken.trim());localStorage.setItem(LS_TEAM_TOKEN,teamToken.trim());}catch(e){}}onConnect(token.trim(),u);}catch(e){setErr("❌ Invalid token.");}finally{setLoading(false);}};
  return(<div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0f1e35,#1e3a5f)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Segoe UI',sans-serif",padding:24}}><div style={{background:"#fff",borderRadius:16,padding:32,width:"100%",maxWidth:460,boxShadow:"0 8px 40px #0005"}}><div style={{textAlign:"center",marginBottom:24}}><div style={{fontSize:40,marginBottom:8}}>🔑</div><h2 style={{margin:"0 0 6px",color:"#1e3a5f",fontSize:22,fontWeight:800}}>Connect Your Account</h2><p style={{margin:0,color:"#777",fontSize:13}}>Your flowcharts are saved to your own private GitHub Gist.</p></div><Field label="Your GitHub Personal Access Token" value={token} onChange={setToken} placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" type="password" autoFocus hint="Needs 'gist' scope only"/>{err&&<p style={{color:"#e05a5a",fontSize:12,margin:"-8px 0 12px"}}>{err}</p>}<div style={{background:"#f0f7ff",borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:"#2c5282"}}><b>How to get a token:</b> Go to <b>github.com/settings/tokens</b> → Generate new token (classic) → check <b>gist</b> scope only → Generate & copy</div><div style={{borderTop:"1px solid #e8f0fe",paddingTop:14,marginBottom:14}}><button onClick={()=>setShowTeam(v=>!v)} style={{background:"transparent",border:"none",color:"#8e44ad",fontSize:13,cursor:"pointer",fontWeight:600,padding:0}}>{showTeam?"▼":"▶"} 🟣 Connect Team Space (optional)</button>{showTeam&&<div style={{marginTop:12}}><Field label="Team GitHub PAT" value={teamToken} onChange={setTeamToken} placeholder="ghp_team_token_here" type="password" hint="Ask your team admin for this token."/></div>}</div><button onClick={connect} disabled={loading} style={{width:"100%",padding:"11px",borderRadius:9,background:"linear-gradient(135deg,#4a90d9,#27ae60)",color:"#fff",border:"none",fontSize:14,fontWeight:700,cursor:loading?"not-allowed":"pointer",opacity:loading?0.7:1}}>{loading?"Connecting...":"🔗 Connect & Continue"}</button></div></div>);
}

// ── Context Menu ───────────────────────────────────────────────────────────────
function ContextMenu({x,y,node,scheme,onClose,onEdit,onDuplicate,onDelete,onAddChild,onShapeChange}){
  const [showShapes,setShowShapes]=useState(false);
  const menuRef=useRef();

  // Close on outside click
  useEffect(()=>{
    const h=e=>{if(menuRef.current&&!menuRef.current.contains(e.target))onClose();};
    window.addEventListener("pointerdown",h);
    return()=>window.removeEventListener("pointerdown",h);
  },[onClose]);

  // Clamp menu to viewport
  const vw=window.innerWidth, vh=window.innerHeight;
  const mw=190, mh=220;
  const cx=Math.min(x, vw-mw-8);
  const cy=Math.min(y, vh-mh-8);

  // Shape panel: open right or left depending on space
  const shapeW=216, shapeH=260;
  const shapeOnRight=cx+mw+shapeW < vw;
  const shapeX=shapeOnRight ? cx+mw : cx-shapeW;
  const shapeY=Math.min(cy+120, vh-shapeH-8);

  const menuItem=(icon,label,action,danger=false)=>(
    <button key={label} onClick={()=>{action();onClose();}}
      style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"8px 14px",border:"none",background:"transparent",cursor:"pointer",fontSize:12,color:danger?"#e05a5a":"#2d3748",textAlign:"left"}}
      onMouseEnter={e=>e.currentTarget.style.background=danger?"#fff5f5":"#f0f7ff"}
      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      {icon} {label}
    </button>
  );

  return(
    <>
      {/* Main menu */}
      <div ref={menuRef} onPointerDown={e=>e.stopPropagation()}
        style={{position:"fixed",left:cx,top:cy,background:"#fff",borderRadius:10,boxShadow:"0 4px 24px #0003",zIndex:1000,minWidth:mw,overflow:"hidden",border:"1px solid #e0e8f0"}}>
        <div style={{padding:"8px 12px",background:"#f0f7ff",borderBottom:"1px solid #e0e8f0",fontSize:12,fontWeight:700,color:"#1e3a5f",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          📁 {node.label}
        </div>
        {menuItem("✏️","Edit / Rename",onEdit)}
        {menuItem("⧉","Duplicate Node",onDuplicate)}
        {menuItem("➕","Add Child",onAddChild)}
        <button
          onClick={()=>setShowShapes(v=>!v)}
          style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"8px 14px",border:"none",background:showShapes?"#e8f0fe":"transparent",cursor:"pointer",fontSize:12,color:"#2d3748"}}
          onMouseEnter={e=>e.currentTarget.style.background="#f0f7ff"}
          onMouseLeave={e=>e.currentTarget.style.background=showShapes?"#e8f0fe":"transparent"}>
          <span>🔷 Change Shape</span>
          <span style={{fontSize:10,color:"#4a90d9"}}>{showShapes?"◀":"▶"}</span>
        </button>
        <div style={{borderTop:"1px solid #fee2e2"}}>
          {menuItem("🗑️","Delete Node",onDelete,true)}
        </div>
      </div>

      {/* Shape panel — rendered as separate fixed overlay so it's never clipped */}
      {showShapes&&(
        <div onPointerDown={e=>e.stopPropagation()}
          style={{position:"fixed",left:shapeX,top:shapeY,background:"#fff",borderRadius:12,boxShadow:"0 6px 28px #0004",border:"1px solid #e0e8f0",padding:10,zIndex:1001,width:shapeW}}>
          <div style={{fontSize:11,fontWeight:700,color:"#1e3a5f",marginBottom:8,paddingBottom:6,borderBottom:"1px solid #e8f0fe"}}>🔷 Select Shape</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {Object.entries(SHAPES).map(([key,{label,icon}])=>(
              <button key={key} onClick={()=>{onShapeChange(key);onClose();}}
                style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"8px 4px",border:`2px solid ${(node.shape||"rect")===key?"#4a90d9":"#e0e8f0"}`,borderRadius:8,background:(node.shape||"rect")===key?"#e8f0fe":"#fafafa",cursor:"pointer",transition:"all 0.1s"}}
                onMouseEnter={e=>{if((node.shape||"rect")!==key)e.currentTarget.style.background="#f0f7ff";}}
                onMouseLeave={e=>{if((node.shape||"rect")!==key)e.currentTarget.style.background="#fafafa";}}>
                <span style={{fontSize:20,marginBottom:3}}>{icon}</span>
                <span style={{fontSize:9,color:"#555",fontWeight:600,textAlign:"center",lineHeight:1.2}}>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// EDITOR
// ══════════════════════════════════════════════════════════════════════════════
function Editor({chart,onBack,onSave,isTeam}){
  const [tree,setTree]     =useState(()=>clone(chart.tree));
  const [modal,setModal]   =useState(null);
  const [ctxMenu,setCtxMenu]=useState(null); // {x,y,nodeId}
  const [form,setForm]     =useState({label:"",url:""});
  const [tab,setTab]       =useState("info");
  const [vp,setVp]         =useState({x:60,y:40,scale:1});
  const [toast,setToast]   =useState({msg:"",type:"success"});
  const [dirty,setDirty]   =useState(false);
  const vpRef  =useRef(vp); vpRef.current=vp;
  const dragRef=useRef(null);
  const cvRef  =useRef();
  const autoRef=useRef(null);
  const onSaveRef=useRef(onSave); useEffect(()=>{onSaveRef.current=onSave;},[onSave]);
  const chartRef =useRef(chart);  useEffect(()=>{chartRef.current=chart; },[chart]);
  const scheme=SCHEMES[chart.scheme]||SCHEMES.sharepoint;
  const accent=isTeam?"#8e44ad":"#4a90d9";

  const showToast=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast({msg:"",type:"success"}),2500);};
  useEffect(()=>{if(!dirty)return;clearTimeout(autoRef.current);autoRef.current=setTimeout(async()=>{try{await onSaveRef.current({...chartRef.current,tree},true);setDirty(false);showToast(isTeam?"Auto-saved to Team ✓":"Auto-saved ✓",isTeam?"team":"success");}catch(e){showToast("Auto-save failed","error");}},1500);return()=>clearTimeout(autoRef.current);},[tree,dirty]);

  const mutate=fn=>{setTree(p=>fn(clone(p)));setDirty(true);};
  const toWorld=useCallback((sx,sy)=>{const r=cvRef.current.getBoundingClientRect();return{x:(sx-r.left-vpRef.current.x)/vpRef.current.scale,y:(sy-r.top-vpRef.current.y)/vpRef.current.scale};},[]);
  const onWheel=useCallback(e=>{e.preventDefault();const f=e.deltaY<0?1.1:0.91,r=cvRef.current.getBoundingClientRect();const cx=e.clientX-r.left,cy=e.clientY-r.top;setVp(p=>{const s=Math.min(3,Math.max(0.2,p.scale*f));return{x:cx-(cx-p.x)*(s/p.scale),y:cy-(cy-p.y)*(s/p.scale),scale:s};});},[]);
  useEffect(()=>{const el=cvRef.current;el.addEventListener("wheel",onWheel,{passive:false});return()=>el.removeEventListener("wheel",onWheel);},[onWheel]);
  const onCanvasDown=useCallback(e=>{if(e.button!==0||e.target.closest(".ne"))return;e.currentTarget.setPointerCapture(e.pointerId);dragRef.current={type:"pan",sc:{x:e.clientX,y:e.clientY},sv:{...vpRef.current}};},[]);
  const onNodeDown=useCallback((e,id)=>{if(e.button!==0)return;e.stopPropagation();e.currentTarget.closest(".cv").setPointerCapture(e.pointerId);const w=toWorld(e.clientX,e.clientY),n=findNode(tree,id);dragRef.current={type:"node",id,sw:w,sxy:{x:n.x,y:n.y},moved:false};},[tree,toWorld]);
  const onMove=useCallback(e=>{const d=dragRef.current;if(!d)return;if(d.type==="pan"){setVp({...d.sv,x:d.sv.x+(e.clientX-d.sc.x),y:d.sv.y+(e.clientY-d.sc.y)});}else{const w=toWorld(e.clientX,e.clientY),dx=w.x-d.sw.x,dy=w.y-d.sw.y;if(Math.abs(dx)>2||Math.abs(dy)>2)d.moved=true;if(!d.moved)return;mutate(t=>{const n=findNode(t,d.id);if(n){n.x=d.sxy.x+dx;n.y=d.sxy.y+dy;}return t;});}},[toWorld]);
  const onUp=useCallback(()=>{dragRef.current=null;},[]);

  const openContextMenu=useCallback((e,id)=>{
    e.preventDefault();e.stopPropagation();
    setCtxMenu({x:e.clientX,y:e.clientY,nodeId:id});
  },[]);

  const openEditModal=useCallback((id)=>{
    const n=findNode(tree,id);setForm({label:n.label,url:n.url||""});setTab("info");setModal({id,mode:"edit"});
  },[tree]);

  const duplicateNode=useCallback((id)=>{
    mutate(t=>{
      const par=findParent(t,id)||t;
      const orig=findNode(t,id);
      const dup=deepDuplicateNode(orig,30,30);
      par.children.push(dup);
      return t;
    });
    showToast("Node duplicated ✓","dup");
  },[]);

  const onUrlClick=useCallback((e,id)=>{e.stopPropagation();const n=findNode(tree,id);if(n.url){window.open(n.url,"_blank");return;}setForm({label:n.label,url:""});setModal({id,mode:"url"});},[tree]);
  const applyColor=(id,hex)=>mutate(t=>{const n=findNode(t,id);if(n)n.cc=hex;return t;});
  const resetColor=id=>mutate(t=>{const n=findNode(t,id);if(n)n.cc=null;return t;});
  const applyShape=(id,shape)=>mutate(t=>{const n=findNode(t,id);if(n)n.shape=shape;return t;});

  const saveModal=()=>{
    const{id,mode}=modal;
    mutate(t=>{
      if(mode==="edit"||mode==="url"){const n=findNode(t,id);if(mode==="edit")n.label=form.label;n.url=form.url;}
      else if(mode==="add"){const par=findNode(t,id);const nn=mkNode(uid(),form.label,NEXT_COLOR[par.color]||"leaf",par.x+180,par.y+par.children.length*55);nn.url=form.url;par.children.push(nn);}
      else if(mode==="delete"){if(id===t.id)return t;const par=findParent(t,id);if(par)par.children=par.children.filter(c=>c.id!==id);}
      return t;
    });
    setModal(null);
  };
  const manualSave=async()=>{clearTimeout(autoRef.current);try{await onSaveRef.current({...chartRef.current,tree},false);setDirty(false);showToast(isTeam?"Saved to Team ✓":"Saved ✓",isTeam?"team":"success");}catch(e){showToast("Save failed","error");}};

  const allNodes=flatten(tree);
  const edges=[];
  const be=n=>n.children.forEach(c=>{edges.push({from:n.id,to:c.id});be(c);});be(tree);
  const mNode=modal?findNode(tree,modal.id):null;
  const ctxNode=ctxMenu?findNode(tree,ctxMenu.nodeId):null;

  return(
    <div style={{display:"flex",flexDirection:"column",height:"100vh",fontFamily:"'Segoe UI',sans-serif"}}>
      <div style={{background:isTeam?"#2d0a4e":"#1e3a5f",padding:"10px 16px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <button onClick={onBack} style={{background:"transparent",border:`1px solid ${accent}`,color:"#a0c0e8",borderRadius:7,padding:"5px 12px",cursor:"pointer",fontSize:12,fontWeight:600}}>← Back</button>
        <span style={{color:isTeam?"#d7a8ff":"#fff",fontSize:11,fontWeight:700}}>{isTeam?"🟣 TEAM":"👤 MY"}</span>
        <span style={{color:"#fff",fontWeight:700,fontSize:15}}>{chart.icon} {chart.name}</span>
        {chart.tags?.map(t=><TagBadge key={t} tag={t}/>)}
        {dirty&&<span style={{fontSize:11,color:"#f39c12",background:"#f39c1222",borderRadius:6,padding:"2px 8px"}}>● Unsaved</span>}
        <span style={{color:"#a0c0e8",fontSize:11,flex:1}}>Scroll=Zoom · Drag=Pan · Right-click=Node menu</span>
        <span style={{color:"#a0c0e8",fontSize:12}}>{Math.round(vp.scale*100)}%</span>
        <TBtn onClick={()=>setVp(v=>({...v,scale:Math.min(3,v.scale*1.15)}))}>＋</TBtn>
        <TBtn onClick={()=>setVp(v=>({...v,scale:Math.max(0.2,v.scale*0.87)}))}>－</TBtn>
        <TBtn onClick={()=>setVp({x:60,y:40,scale:1})}>⟳</TBtn>
        <button onClick={manualSave} style={{background:isTeam?"#8e44ad":"#27ae60",border:"none",color:"#fff",borderRadius:7,padding:"5px 14px",cursor:"pointer",fontSize:12,fontWeight:700}}>💾 Save</button>
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
            <marker id="ar" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3z" fill={accent} opacity="0.55"/></marker>
          </defs>
          <g transform={`translate(${vp.x},${vp.y}) scale(${vp.scale})`}>
            {edges.map(({from,to})=>{const fn=findNode(tree,from),tn=findNode(tree,to);if(!fn||!tn)return null;const sx=fn.x+NW,sy=fn.y+NH/2,ex=tn.x,ey=tn.y+NH/2,mx=(sx+ex)/2;return<path key={`${from}-${to}`} d={`M${sx},${sy} C${mx},${sy} ${mx},${ey} ${ex},${ey}`} fill="none" stroke={accent} strokeWidth={1.6} strokeOpacity={0.45} markerEnd="url(#ar)"/>;}) }
            {allNodes.map(node=>{
              const c=nodeColors(node,scheme);
              const sh=node.shape||"rect";
              const isDiamond=sh==="diamond";
              const foW=isDiamond?NW-28:sh==="parallelogram"?NW-32:NW-42;
              const foX=isDiamond?node.x+14:sh==="parallelogram"?node.x+18:node.x+8;
              return(
                <g key={node.id} className="ne" onPointerDown={e=>onNodeDown(e,node.id)} onContextMenu={e=>openContextMenu(e,node.id)} style={{cursor:"grab"}}>
                  {/* shadow */}
                  <ShapePath shape={sh} x={node.x+2} y={node.y+3} w={NW} h={NH} fill="#00000012" stroke="none" strokeWidth={0}/>
                  {/* body */}
                  <ShapePath shape={sh} x={node.x} y={node.y} w={NW} h={NH} fill={c.bg} stroke={c.border} strokeWidth={1.8} filter={node.color==="root"||node.color==="dept"?"sh":null}/>
                  {node.cc&&<circle cx={node.x+10} cy={node.y+10} r={4} fill="#fff" stroke={c.border} strokeWidth={1.5}/>}
                  {/* shape label top-left */}
                  {sh!=="rect"&&<text x={node.x+4} y={node.y+NH-5} fontSize={8} fill={c.text} opacity={0.5}>{SHAPES[sh]?.icon}</text>}
                  <foreignObject x={foX} y={node.y+2} width={foW} height={NH-4}>
                    <div xmlns="http://www.w3.org/1999/xhtml" style={{height:NH-4,display:"flex",alignItems:"center",fontSize:node.color==="root"?12:11,fontWeight:node.color==="root"||node.color==="dept"?700:500,color:c.text,lineHeight:1.25,overflow:"hidden",fontFamily:"'Segoe UI',sans-serif",pointerEvents:"none",wordBreak:"break-word"}}>📁 {node.label}</div>
                  </foreignObject>
                  <g onPointerDown={e=>e.stopPropagation()} onClick={e=>onUrlClick(e,node.id)} style={{cursor:"pointer"}}>
                    <rect x={node.x+NW-30} y={node.y+8} width={24} height={24} rx={6} fill={node.url?accent:"#e8f0fe"} stroke={node.url?darken(accent):"#b3d4f5"} strokeWidth={1}/>
                    <text x={node.x+NW-18} y={node.y+24} textAnchor="middle" fontSize={13} style={{pointerEvents:"none"}}>{node.url?"🔗":"➕"}</text>
                  </g>
                </g>
              );
            })}
          </g>
        </svg>
        <div style={{position:"absolute",bottom:12,right:12,background:isTeam?"#2d0a4ecc":"#1e3a5fcc",color:"#cde",fontSize:11,borderRadius:8,padding:"6px 12px",pointerEvents:"none"}}>
          {isTeam?"🟣 Team":"👤 My"} · Right-click node for options
        </div>
      </div>

      {/* Context menu */}
      {ctxMenu&&ctxNode&&(
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} node={ctxNode} scheme={scheme}
          onClose={()=>setCtxMenu(null)}
          onEdit={()=>openEditModal(ctxMenu.nodeId)}
          onDuplicate={()=>duplicateNode(ctxMenu.nodeId)}
          onAddChild={()=>{setForm({label:"New Folder",url:""});setModal({id:ctxMenu.nodeId,mode:"add"});}}
          onDelete={()=>mutate(t=>{if(ctxMenu.nodeId===t.id)return t;const par=findParent(t,ctxMenu.nodeId);if(par)par.children=par.children.filter(c=>c.id!==ctxMenu.nodeId);return t;})}
          onShapeChange={shape=>applyShape(ctxMenu.nodeId,shape)}
        />
      )}

      {/* Edit modal */}
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"#0007",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}} onClick={()=>setModal(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:14,padding:24,width:420,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 8px 40px #0004"}}>
            {(modal.mode==="edit"||modal.mode==="url")&&<>
              <h3 style={{margin:"0 0 14px",color:"#1e3a5f",fontSize:16}}>✏️ Edit Node</h3>
              <div style={{display:"flex",borderBottom:"2px solid #e8f0fe",marginBottom:14}}>
                {["info","shape","color"].map(t=><button key={t} onClick={()=>setTab(t)} style={{padding:"6px 14px",border:"none",borderBottom:tab===t?`2px solid ${accent}`:"2px solid transparent",background:"transparent",color:tab===t?accent:"#888",fontWeight:600,fontSize:12,cursor:"pointer",marginBottom:-2,textTransform:"capitalize"}}>{t==="info"?"📝 Info":t==="shape"?"🔷 Shape":"🎨 Color"}</button>)}
              </div>
              {tab==="info"&&<><Field label="Folder Name" value={form.label} onChange={v=>setForm(f=>({...f,label:v}))} autoFocus/><Field label="URL" value={form.url} onChange={v=>setForm(f=>({...f,url:v}))} placeholder="https://..."/><BtnRow><Btn v="danger" onClick={()=>setModal({id:modal.id,mode:"delete"})}>🗑</Btn><Btn v="outline" onClick={()=>{setForm({label:"New Folder",url:""});setModal({id:modal.id,mode:"add"});}}>＋ Child</Btn><Btn v="dup" onClick={()=>{duplicateNode(modal.id);setModal(null);}}>⧉ Duplicate</Btn><Btn v="primary" onClick={saveModal}>Save</Btn></BtnRow></>}
              {tab==="shape"&&<><ShapePicker current={mNode?.shape||"rect"} onChange={s=>{applyShape(modal.id,s);}}/><BtnRow><Btn v="ghost" onClick={()=>setModal(null)}>Close</Btn></BtnRow></>}
              {tab==="color"&&<>{mNode&&(()=>{const c=nodeColors(mNode,scheme);return<div style={{marginBottom:14,display:"flex",justifyContent:"center"}}><div style={{width:NW,height:NH,borderRadius:9,background:c.bg,border:`2px solid ${c.border}`,display:"flex",alignItems:"center",paddingLeft:10,fontSize:12,fontWeight:700,color:c.text}}>📁 {mNode.label}</div></div>;})()}<ColorPicker current={mNode?.cc||""} onSelect={h=>applyColor(modal.id,h)} onReset={()=>resetColor(modal.id)}/><BtnRow><Btn v="ghost" onClick={()=>setModal(null)}>Close</Btn></BtnRow></>}
            </>}
            {modal.mode==="add"&&<><h3 style={{margin:"0 0 14px",color:"#1e3a5f",fontSize:16}}>➕ Add Child Node</h3><Field label="Label" value={form.label} onChange={v=>setForm(f=>({...f,label:v}))} autoFocus/><Field label="URL (optional)" value={form.url} onChange={v=>setForm(f=>({...f,url:v}))} placeholder="https://..."/><BtnRow><Btn v="ghost" onClick={()=>setModal(null)}>Cancel</Btn><Btn v="primary" onClick={saveModal}>Add</Btn></BtnRow></>}
            {modal.mode==="delete"&&<><h3 style={{margin:"0 0 10px",color:"#e05a5a",fontSize:16}}>🗑 Delete Node?</h3><p style={{color:"#555",fontSize:13,margin:"0 0 20px"}}>Remove <b>{findNode(tree,modal.id)?.label}</b> and all its children?</p><BtnRow><Btn v="ghost" onClick={()=>setModal(null)}>Cancel</Btn><Btn v="danger" onClick={saveModal}>Delete</Btn></BtnRow></>}
          </div>
        </div>
      )}
      <Toast msg={toast.msg} type={toast.type}/>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD ACTIONS MODAL
// ══════════════════════════════════════════════════════════════════════════════
function CardActionsModal({chart,isTeam,hasTeam,onClose,onTagsChange,onMove,onDelete,onRename,onDuplicate}){
  const [name,setName]=useState(chart.name);
  const [tags,setTags]=useState(chart.tags||[]);
  const [tab,setTab]=useState("info");
  const save=()=>{onRename(chart.id,name);onTagsChange(chart.id,tags);onClose();};
  return(
    <div style={{position:"fixed",inset:0,background:"#0007",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:14,padding:24,width:420,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 8px 40px #0004"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
          <span style={{fontSize:22}}>{chart.icon}</span>
          <h3 style={{margin:0,color:"#1e3a5f",fontSize:16,flex:1}}>{chart.name}</h3>
          <span style={{fontSize:11,background:isTeam?"#ede9fe":"#e8f0fe",color:isTeam?"#8e44ad":"#4a90d9",borderRadius:6,padding:"2px 8px",fontWeight:600}}>{isTeam?"🟣 Team":"👤 My"}</span>
        </div>
        <div style={{display:"flex",borderBottom:"2px solid #e8f0fe",marginBottom:14}}>
          {["info","tags","move"].map(t=><button key={t} onClick={()=>setTab(t)} style={{padding:"6px 14px",border:"none",borderBottom:tab===t?"2px solid #4a90d9":"2px solid transparent",background:"transparent",color:tab===t?"#4a90d9":"#888",fontWeight:600,fontSize:12,cursor:"pointer",marginBottom:-2,textTransform:"capitalize"}}>{t==="info"?"📝 Info":t==="tags"?"🏷️ Tags":"🔀 Move"}</button>)}
        </div>
        {tab==="info"&&<>
          <Field label="Chart Name" value={name} onChange={setName} autoFocus/>
          <BtnRow>
            <Btn v="danger" onClick={()=>{onDelete(chart.id,isTeam);onClose();}}>🗑 Delete</Btn>
            <Btn v="dup" onClick={()=>{onDuplicate(chart.id,isTeam);onClose();}}>⧉ Duplicate</Btn>
            <Btn v="ghost" onClick={onClose}>Cancel</Btn>
            <Btn v="primary" onClick={save}>Save</Btn>
          </BtnRow>
        </>}
        {tab==="tags"&&<><TagEditor tags={tags} onChange={setTags}/><BtnRow><Btn v="ghost" onClick={onClose}>Cancel</Btn><Btn v="primary" onClick={save}>Save Tags</Btn></BtnRow></>}
        {tab==="move"&&<div>
          {isTeam?(<><div style={{background:"#f0f7ff",borderRadius:8,padding:"12px 14px",marginBottom:14,fontSize:13,color:"#2c5282"}}><b>Move to My Space</b><br/><span style={{fontSize:12,color:"#555"}}>This chart will be removed from the Team Space and moved to your private space.</span></div><BtnRow><Btn v="ghost" onClick={onClose}>Cancel</Btn><Btn v="move" onClick={()=>{onMove(chart,true);onClose();}}>👤 Move to My Space</Btn></BtnRow></>)
          :hasTeam?(<><div style={{background:"#f5eef8",borderRadius:8,padding:"12px 14px",marginBottom:14,fontSize:13,color:"#5b21b6"}}><b>Move to Team Space</b><br/><span style={{fontSize:12,color:"#555"}}>This chart will be shared with everyone on the team.</span></div><BtnRow><Btn v="ghost" onClick={onClose}>Cancel</Btn><Btn v="team" onClick={()=>{onMove(chart,false);onClose();}}>🟣 Move to Team Space</Btn></BtnRow></>)
          :(<div style={{textAlign:"center",padding:"20px 0",color:"#888",fontSize:13}}><div style={{fontSize:32,marginBottom:8}}>🟣</div>Connect a Team Space first.</div>)}
        </div>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// LANDING
// ══════════════════════════════════════════════════════════════════════════════
export default function App(){
  const [myCharts,setMyCharts]=useState(null);
  const [teamCharts,setTeamCharts]=useState(null);
  const [activeChart,setActiveChart]=useState(null);
  const [activeTab,setActiveTab]=useState("my");
  const [showNew,setShowNew]=useState(false);
  const [newName,setNewName]=useState("");
  const [tmpl,setTmpl]=useState(TEMPLATES[0]);
  const [search,setSearch]=useState("");
  const [tagFilter,setTagFilter]=useState(null);
  const [cardModal,setCardModal]=useState(null);
  const [toast,setToast]=useState({msg:"",type:"success"});
  const [token,setToken]=useState(()=>localStorage.getItem(LS_TOKEN)||"");
  const [teamToken,setTeamToken]=useState(()=>localStorage.getItem(LS_TEAM_TOKEN)||"");
  const [username,setUsername]=useState("");
  const [syncing,setSyncing]=useState(false);
  const [showTeamSetup,setShowTeamSetup]=useState(false);
  const [newTeamToken,setNewTeamToken]=useState("");

  const showToast=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast({msg:"",type:"success"}),2500);};
  const getOrCreateGist=useCallback(async(tok,file,defaults,desc)=>{
    const lsKey=file==="my"?LS_GIST_ID:LS_TEAM_GIST_ID,gistFile=file==="my"?GIST_FILE:TEAM_GIST_FILE;
    let id=localStorage.getItem(lsKey);
    if(!id){id=await findGist(tok,gistFile);if(id)localStorage.setItem(lsKey,id);}
    if(!id){id=await createGist(tok,gistFile,defaults,desc);localStorage.setItem(lsKey,id);}
    const data=await loadGist(tok,id,gistFile);
    return{id,data:data||defaults};
  },[]);

  useEffect(()=>{
    if(!token){setMyCharts(DEFAULT_MY);setTeamCharts([]);return;}
    (async()=>{setSyncing(true);try{const user=await verifyToken(token);setUsername(user);const{data:md}=await getOrCreateGist(token,"my",DEFAULT_MY,"Flowchart Builder – My Charts");setMyCharts(md);if(teamToken){try{const{data:td}=await getOrCreateGist(teamToken,"team",[],"Flowchart Builder – Team Charts");setTeamCharts(td);}catch(e){setTeamCharts([]);}}else setTeamCharts([]);}catch(e){setMyCharts(DEFAULT_MY);setTeamCharts([]);showToast("Could not sync","warning");}finally{setSyncing(false);}})();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[token]);

  const persistMy  =next=>{const t=localStorage.getItem(LS_TOKEN),g=localStorage.getItem(LS_GIST_ID);if(t&&g)saveGist(t,g,GIST_FILE,next).catch(()=>{});};
  const persistTeam=next=>{const t=localStorage.getItem(LS_TEAM_TOKEN),g=localStorage.getItem(LS_TEAM_GIST_ID);if(t&&g)saveGist(t,g,TEAM_GIST_FILE,next).catch(()=>{});};
  const saveMyCharts  =useCallback(async(u,silent=false)=>{setMyCharts(p=>{const n=p.map(c=>c.id===u.id?u:c);persistMy(n);return n;});if(!silent)showToast("Saved ✓");},[]);
  const saveTeamCharts=useCallback(async(u,silent=false)=>{setTeamCharts(p=>{const n=p.map(c=>c.id===u.id?u:c);persistTeam(n);return n;});if(!silent)showToast("Saved to Team ✓","team");},[]);

  const updateTags=(id,tags,isTeam)=>{if(isTeam){setTeamCharts(p=>{const n=p.map(c=>c.id===id?{...c,tags}:c);persistTeam(n);return n;});}else{setMyCharts(p=>{const n=p.map(c=>c.id===id?{...c,tags}:c);persistMy(n);return n;});}showToast("Tags updated ✓");};
  const renameChart=(id,name,isTeam)=>{if(isTeam){setTeamCharts(p=>{const n=p.map(c=>c.id===id?{...c,name}:c);persistTeam(n);return n;});}else{setMyCharts(p=>{const n=p.map(c=>c.id===id?{...c,name}:c);persistMy(n);return n;});}};
  const deleteChart=(id,isTeam)=>{if(isTeam){setTeamCharts(p=>{const n=p.filter(c=>c.id!==id);persistTeam(n);return n;});}else{setMyCharts(p=>{const n=p.filter(c=>c.id!==id);persistMy(n);return n;});}showToast("Deleted");};

  const duplicateChart=(id,isTeam)=>{
    const src=(isTeam?teamCharts:myCharts).find(c=>c.id===id);
    if(!src)return;
    const dup={...clone(src),id:uid(),name:src.name+" (copy)",createdAt:new Date().toLocaleDateString()};
    if(isTeam){setTeamCharts(p=>{const n=[...p,dup];persistTeam(n);return n;});}
    else{setMyCharts(p=>{const n=[...p,dup];persistMy(n);return n;});}
    showToast("Flowchart duplicated ✓","dup");
  };

  const moveChart=(chart,fromTeam)=>{
    const moved={...chart,owner:fromTeam?username:"me"};
    if(fromTeam){setTeamCharts(p=>{const n=p.filter(c=>c.id!==chart.id);persistTeam(n);return n;});setMyCharts(p=>{const n=[...p,moved];persistMy(n);return n;});showToast("Moved to My Space ✓","move");setActiveTab("my");}
    else{setMyCharts(p=>{const n=p.filter(c=>c.id!==chart.id);persistMy(n);return n;});setTeamCharts(p=>{const n=[...(p||[]),moved];persistTeam(n);return n;});showToast("Moved to Team Space ✓","move");setActiveTab("team");}
  };

  const connectTeamSpace=async()=>{if(!newTeamToken.trim())return;setSyncing(true);try{await verifyToken(newTeamToken.trim());localStorage.setItem(LS_TEAM_TOKEN,newTeamToken.trim());setTeamToken(newTeamToken.trim());const{data}=await getOrCreateGist(newTeamToken.trim(),"team",[],"Flowchart Builder – Team Charts");setTeamCharts(data);setShowTeamSetup(false);setNewTeamToken("");showToast("Connected to Team Space ✓","team");}catch(e){showToast("Invalid team token","error");}finally{setSyncing(false);}};
  const disconnect=()=>{[LS_TOKEN,LS_GIST_ID,LS_TEAM_TOKEN,LS_TEAM_GIST_ID].forEach(k=>localStorage.removeItem(k));setToken("");setTeamToken("");setUsername("");};

  if(!token) return <TokenSetup onConnect={(tok,user)=>{setToken(tok);setUsername(user);}}/>;
  if(myCharts===null||syncing) return(<div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0f1e35,#1e3a5f)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Segoe UI',sans-serif"}}><div style={{textAlign:"center",color:"#a0c0e8"}}><div style={{fontSize:40,marginBottom:12}}>☁️</div><div style={{fontSize:16,fontWeight:600}}>Syncing with GitHub Gist...</div></div></div>);

  if(activeChart) return <Editor chart={activeChart.chart} isTeam={activeChart.isTeam} onBack={()=>setActiveChart(null)} onSave={activeChart.isTeam?saveTeamCharts:saveMyCharts}/>;

  const charts=(activeTab==="my"?myCharts:(teamCharts||[]));
  const allTags=[...new Set(charts.flatMap(c=>c.tags||[]))].sort();
  const filtered=charts.filter(c=>{const ms=c.name.toLowerCase().includes(search.toLowerCase());const mt=!tagFilter||(c.tags||[]).includes(tagFilter);return ms&&mt;});
  const hasTeam=!!teamToken;

  const createChart=()=>{
    if(!newName.trim())return;
    const isTeam=activeTab==="team";
    const nc={id:uid(),name:newName.trim(),icon:tmpl.icon,scheme:tmpl.scheme,tree:mkNode(uid(),"Start","root",80,200),createdAt:new Date().toLocaleDateString(),owner:isTeam?username:"me",tags:[]};
    if(isTeam){setTeamCharts(p=>{const n=[...(p||[]),nc];persistTeam(n);return n;});}else{setMyCharts(p=>{const n=[...p,nc];persistMy(n);return n;});}
    setActiveChart({chart:nc,isTeam});setShowNew(false);setNewName("");
  };

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0f1e35 0%,#1e3a5f 50%,#1a4a7a 100%)",fontFamily:"'Segoe UI',sans-serif"}}>
      <div style={{padding:"36px 32px 20px",textAlign:"center"}}>
        <div style={{fontSize:44,marginBottom:6}}>🗺️</div>
        <h1 style={{color:"#fff",margin:"0 0 6px",fontSize:28,fontWeight:800,letterSpacing:-1}}>Flowchart Builder</h1>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:20,flexWrap:"wrap"}}>
          <span style={{color:"#27ae60",fontSize:12}}>👤 <b style={{color:"#4a90d9"}}>@{username}</b></span>
          {hasTeam&&<span style={{color:"#d7a8ff",fontSize:12}}>🟣 Team connected</span>}
          <button onClick={disconnect} style={{background:"transparent",border:"1px solid #2c5282",color:"#7090b0",borderRadius:6,padding:"2px 8px",fontSize:11,cursor:"pointer"}}>Disconnect</button>
        </div>
        <button onClick={()=>setShowNew(true)} style={{background:activeTab==="team"?"linear-gradient(135deg,#8e44ad,#6c3483)":"linear-gradient(135deg,#4a90d9,#27ae60)",border:"none",color:"#fff",borderRadius:12,padding:"10px 28px",fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 20px #0003"}}>
          ＋ New {activeTab==="team"?"Team":"My"} Flowchart
        </button>
      </div>

      <div style={{maxWidth:960,margin:"0 auto",padding:"0 24px"}}>
        <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:"2px solid #2c5282"}}>
          {[{key:"my",label:"👤 My Flowcharts",count:myCharts?.length||0},{key:"team",label:"🟣 Team Space",count:teamCharts?.length||0}].map(t=>(
            <button key={t.key} onClick={()=>{setActiveTab(t.key);setSearch("");setTagFilter(null);}} style={{padding:"10px 20px",border:"none",borderBottom:activeTab===t.key?(t.key==="team"?"3px solid #8e44ad":"3px solid #4a90d9"):"3px solid transparent",background:"transparent",color:activeTab===t.key?"#fff":"#7090b0",fontWeight:700,fontSize:13,cursor:"pointer",marginBottom:-2}}>
              {t.label} <span style={{fontSize:11,background:"#ffffff18",borderRadius:10,padding:"1px 7px",marginLeft:4}}>{t.count}</span>
            </button>
          ))}
        </div>

        {activeTab==="team"&&!hasTeam&&(
          <div style={{background:"#2d0a4e",borderRadius:12,border:"1.5px solid #8e44ad",padding:"18px 22px",marginBottom:20,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
            <div><div style={{color:"#d7a8ff",fontWeight:700,fontSize:14,marginBottom:4}}>🟣 Connect Team Space</div><div style={{color:"#a87fd4",fontSize:12}}>Ask your team admin for the Team PAT.</div></div>
            <button onClick={()=>setShowTeamSetup(true)} style={{background:"#8e44ad",border:"none",color:"#fff",borderRadius:8,padding:"8px 18px",fontSize:13,cursor:"pointer",fontWeight:700}}>Connect →</button>
          </div>
        )}

        <div style={{marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search flowcharts..." style={{flex:1,padding:"10px 16px",borderRadius:10,border:"1.5px solid #2c5282",background:"#162d4e",color:"#fff",fontSize:13,outline:"none"}}/>
            <span style={{color:"#a0c0e8",fontSize:13}}>{filtered.length} chart{filtered.length!==1?"s":""}</span>
          </div>
          {allTags.length>0&&(
            <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
              <span style={{color:"#7090b0",fontSize:11,fontWeight:600}}>Filter:</span>
              <button onClick={()=>setTagFilter(null)} style={{padding:"2px 10px",borderRadius:12,border:"1.5px solid #2c5282",background:!tagFilter?"#4a90d9":"transparent",color:!tagFilter?"#fff":"#7090b0",fontSize:11,cursor:"pointer",fontWeight:600}}>All</button>
              {allTags.map(t=>{const c=tagColor(t);return(<button key={t} onClick={()=>setTagFilter(tagFilter===t?null:t)} style={{padding:"2px 10px",borderRadius:12,border:`1.5px solid ${tagFilter===t?c.border:"#2c5282"}`,background:tagFilter===t?c.bg:"transparent",color:tagFilter===t?c.text:"#7090b0",fontSize:11,cursor:"pointer",fontWeight:600}}>#{t}</button>);})}
            </div>
          )}
        </div>

        {filtered.length===0&&!(activeTab==="team"&&!hasTeam)
          ?<div style={{textAlign:"center",color:"#a0c0e8",padding:48,fontSize:15}}>{tagFilter?`No charts tagged #${tagFilter}.`:activeTab==="team"?"No team flowcharts yet.":"No flowcharts found."}</div>
          :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:20,paddingBottom:48}}>
            {filtered.map(chart=>{
              const isTeam=activeTab==="team", accent=isTeam?"#8e44ad":"#4a90d9";
              return(
                <div key={chart.id} style={{background:isTeam?"linear-gradient(145deg,#2d0a4e,#1a0633)":"linear-gradient(145deg,#1e3a5f,#162d4e)",borderRadius:16,border:`1.5px solid ${isTeam?"#6c3483":"#2c5282"}`,overflow:"hidden",cursor:"pointer",transition:"transform 0.15s,box-shadow 0.15s",boxShadow:"0 4px 20px #00000033"}}
                  onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.boxShadow="0 8px 32px #00000055";}}
                  onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="0 4px 20px #00000033";}}>
                  <div onClick={()=>setActiveChart({chart,isTeam})} style={{height:100,background:SCHEMES[chart.scheme].root.bg,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>
                    <MiniPreview chart={chart}/>
                    {chart.owner&&chart.owner!=="me"&&<div style={{position:"absolute",top:6,left:8,background:"#00000055",borderRadius:6,padding:"2px 7px",fontSize:10,color:"#fff"}}>by {chart.owner}</div>}
                    <div style={{position:"absolute",bottom:6,right:8,background:"#ffffff22",borderRadius:6,padding:"2px 7px",fontSize:11,color:"#fff",fontWeight:600}}>Open →</div>
                  </div>
                  <div style={{padding:"12px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                      <span style={{color:"#fff",fontWeight:700,fontSize:14,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{chart.icon} {chart.name}</span>
                      <button onClick={e=>{e.stopPropagation();setCardModal({chart,isTeam});}} style={{background:"transparent",border:`1px solid ${accent}`,color:"#a0c0e8",cursor:"pointer",fontSize:11,borderRadius:6,padding:"2px 8px",flexShrink:0,marginLeft:6}}>⚙️ Edit</button>
                    </div>
                    {(chart.tags||[]).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>{(chart.tags||[]).map(t=><TagBadge key={t} tag={t}/>)}</div>}
                    <div style={{color:"#7090b0",fontSize:11}}>{chart.createdAt} · {flatten(chart.tree).length} nodes</div>
                    <div style={{marginTop:6,display:"flex",gap:6,alignItems:"center"}}>
                      <span style={{background:SCHEMES[chart.scheme].dept.bg,color:SCHEMES[chart.scheme].dept.text,fontSize:10,borderRadius:6,padding:"2px 8px",fontWeight:600}}>{chart.scheme}</span>
                      <span style={{color:isTeam?"#d7a8ff":"#27ae60",fontSize:10}}>{isTeam?"🟣 team":"☁️ gist"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div onClick={()=>setShowNew(true)} style={{background:"transparent",borderRadius:16,border:`2px dashed ${activeTab==="team"?"#6c3483":"#2c5282"}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer",minHeight:200,color:activeTab==="team"?"#8e44ad":"#4a90d9"}} onMouseEnter={e=>{e.currentTarget.style.background=activeTab==="team"?"#2d0a4e55":"#1e3a5f55";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
              <div style={{fontSize:32,marginBottom:6}}>＋</div>
              <div style={{fontWeight:700,fontSize:13}}>New {activeTab==="team"?"Team":"My"} Chart</div>
            </div>
          </div>
        }
      </div>

      {cardModal&&<CardActionsModal chart={cardModal.chart} isTeam={cardModal.isTeam} hasTeam={hasTeam} onClose={()=>setCardModal(null)} onTagsChange={(id,tags)=>updateTags(id,tags,cardModal.isTeam)} onRename={(id,name)=>renameChart(id,name,cardModal.isTeam)} onMove={moveChart} onDelete={deleteChart} onDuplicate={duplicateChart}/>}

      {showNew&&(<div style={{position:"fixed",inset:0,background:"#0008",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}} onClick={()=>setShowNew(false)}><div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:28,width:420,boxShadow:"0 8px 40px #0005"}}><h3 style={{margin:"0 0 4px",color:"#1e3a5f",fontSize:18}}>🆕 New Flowchart</h3><p style={{margin:"0 0 16px",fontSize:12,color:activeTab==="team"?"#8e44ad":"#4a90d9",fontWeight:600}}>{activeTab==="team"?"🟣 Team Space":"👤 My Space"}</p><Field label="Chart Name" value={newName} onChange={setNewName} autoFocus placeholder="e.g. Q3 Project Plan"/><div style={{marginBottom:18}}><label style={{fontSize:11,color:"#555",display:"block",marginBottom:8,fontWeight:600}}>Template</label><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>{TEMPLATES.map(t=>(<div key={t.label} onClick={()=>setTmpl(t)} style={{padding:"10px 12px",borderRadius:10,cursor:"pointer",border:`2px solid ${tmpl.label===t.label?"#4a90d9":"#e0e8f0"}`,background:tmpl.label===t.label?"#e8f0fe":"#f9fafb",transition:"all 0.1s"}}><div style={{fontSize:20,marginBottom:2}}>{t.icon}</div><div style={{fontSize:12,fontWeight:700,color:"#1e3a5f"}}>{t.label}</div><div style={{fontSize:11,color:"#888"}}>{t.desc}</div></div>))}</div></div><BtnRow><Btn v="ghost" onClick={()=>setShowNew(false)}>Cancel</Btn><Btn v="primary" onClick={createChart}>Create →</Btn></BtnRow></div></div>)}

      {showTeamSetup&&(<div style={{position:"fixed",inset:0,background:"#0008",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999}} onClick={()=>setShowTeamSetup(false)}><div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:28,width:420,boxShadow:"0 8px 40px #0005"}}><h3 style={{margin:"0 0 8px",color:"#8e44ad",fontSize:18}}>🟣 Connect Team Space</h3><p style={{margin:"0 0 16px",color:"#666",fontSize:13}}>Ask your team admin for the shared Team PAT.</p><Field label="Team GitHub PAT" value={newTeamToken} onChange={setNewTeamToken} placeholder="ghp_team_token_here" type="password" autoFocus/><BtnRow><Btn v="ghost" onClick={()=>setShowTeamSetup(false)}>Cancel</Btn><Btn v="team" onClick={connectTeamSpace}>Connect Team →</Btn></BtnRow></div></div>)}

      <Toast msg={toast.msg} type={toast.type}/>
    </div>
  );
}