import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase + Claude config ─────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || "",
  import.meta.env.VITE_SUPABASE_ANON || ""
);
const ANTH_KEY = import.meta.env.VITE_ANTHROPIC_KEY || "";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function getCalendarDays(yr,mo){const f=new Date(yr,mo,1).getDay(),tot=new Date(yr,mo+1,0).getDate(),d=[];for(let i=0;i<f;i++)d.push(null);for(let i=1;i<=tot;i++)d.push(i);return d;}
function dateKey(y,m,d){return`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;}
function today(){const d=new Date();return{year:d.getFullYear(),month:d.getMonth(),day:d.getDate()};}
function daysUntil(due){const n=new Date();n.setHours(0,0,0,0);return Math.ceil((new Date(due+"T00:00:00")-n)/86400000);}
function urgencyColor(d,T){return d<0?T.danger:d<=3?T.warning:d<=7?T.caution:T.success;}
function rmpToInternal(r){return Math.round(Math.min(5,Math.max(1,r||3)));}
function hexToRgb(hex){try{const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return`${r},${g},${b}`;}catch{return"99,102,241";}}

// ─── Constants ────────────────────────────────────────────────────────────────
const UNIVERSITIES=[
  {id:"utd",name:"UT Dallas",abbr:"UTD",primary:"#C75B12",secondary:"#154734",accent:"#F5A623",logo:"🔱"},
  {id:"harvard",name:"Harvard University",abbr:"HBS",primary:"#A51C30",secondary:"#1E1E1E",accent:"#C0A060",logo:"🎓"},
  {id:"wharton",name:"Wharton / UPenn",abbr:"PENN",primary:"#011F5B",secondary:"#990000",accent:"#C0A060",logo:"🦅"},
  {id:"mit",name:"MIT Sloan",abbr:"MIT",primary:"#750014",secondary:"#8A8B8C",accent:"#A31F34",logo:"⚙️"},
  {id:"stanford",name:"Stanford GSB",abbr:"GSB",primary:"#8C1515",secondary:"#4D4F53",accent:"#B6B1A9",logo:"🌲"},
  {id:"chicago",name:"U Chicago Booth",abbr:"BOOTH",primary:"#800000",secondary:"#767676",accent:"#FFA500",logo:"🏛"},
  {id:"kellogg",name:"Northwestern Kellogg",abbr:"KSM",primary:"#4E2A84",secondary:"#716C6B",accent:"#B6ACD1",logo:"🐾"},
  {id:"ross",name:"U Michigan Ross",abbr:"ROSS",primary:"#00274C",secondary:"#FFCB05",accent:"#FFCB05",logo:"〽️"},
  {id:"fuqua",name:"Duke Fuqua",abbr:"FUQUA",primary:"#012169",secondary:"#C84E00",accent:"#E89923",logo:"👿"},
  {id:"tuck",name:"Dartmouth Tuck",abbr:"TUCK",primary:"#00693E",secondary:"#12312B",accent:"#64A70B",logo:"🌲"},
  {id:"mccombs",name:"UT Austin McCombs",abbr:"UTSB",primary:"#BF5700",secondary:"#333F48",accent:"#F8971F",logo:"🤘"},
  {id:"cox",name:"SMU Cox",abbr:"SMU",primary:"#CC0035",secondary:"#354CA1",accent:"#F5A623",logo:"🐎"},
  {id:"neeley",name:"TCU Neeley",abbr:"TCU",primary:"#4D1979",secondary:"#A3A9AC",accent:"#C9B765",logo:"🐸"},
  {id:"olin",name:"Wash U Olin",abbr:"OLIN",primary:"#A51417",secondary:"#101820",accent:"#C69214",logo:"🐻"},
  {id:"custom",name:"Other / Custom",abbr:"MY",primary:"#6366f1",secondary:"#0ea5e9",accent:"#f59e0b",logo:"🎓"},
];
const DEGREE_LEVELS=[
  {id:"associates",label:"Associate's Degree",icon:"📗"},
  {id:"bachelors",label:"Bachelor's Degree",icon:"📘"},
  {id:"graduate",label:"Graduate / Master's",icon:"📙"},
  {id:"doctoral",label:"Doctoral / DBA / PhD",icon:"📕"},
  {id:"postdoc",label:"Post-Doctoral",icon:"🎖"},
  {id:"certificate",label:"Certificate Program",icon:"📜"},
];
const SPORTS_LIST=["Football","Basketball","Baseball","Softball","Soccer","Volleyball","Tennis","Golf","Swimming","Track & Field","Cross Country","Wrestling","Gymnastics","Lacrosse","Field Hockey","Ice Hockey","Rowing","Other"];
const GREEK_ORGS=["Alpha Delta Pi","Alpha Kappa Alpha","Alpha Phi","Chi Omega","Delta Delta Delta","Delta Gamma","Delta Sigma Theta","Gamma Phi Beta","Kappa Alpha Theta","Kappa Delta","Kappa Kappa Gamma","Pi Beta Phi","Sigma Gamma Rho","Zeta Phi Beta","Zeta Tau Alpha","Alpha Epsilon Pi","Alpha Phi Alpha","Beta Theta Pi","Delta Tau Delta","Kappa Alpha Order","Kappa Alpha Psi","Lambda Chi Alpha","Omega Psi Phi","Phi Beta Sigma","Phi Delta Theta","Pi Kappa Alpha","Pi Kappa Phi","Sigma Alpha Epsilon","Sigma Chi","Sigma Nu","Sigma Phi Epsilon","Tau Kappa Epsilon","Other"];

// ─── Claude API ───────────────────────────────────────────────────────────────
async function callClaudeJSON(system,user,maxT=1500){
  const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":ANTH_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:maxT,system,messages:[{role:"user",content:user}]})});
  const data=await res.json();
  const text=data.content?.map(b=>b.text||"").join("")||"";
  return JSON.parse(text.replace(/```json[\s\S]*?```|```/g,"").trim());
}
async function callClaudeChat(messages){
  const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":ANTH_KEY,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages})});
  const data=await res.json();
  return data.content?.map(b=>b.text||"").join("")||"Sorry, I could not respond.";
}

// ─── Theme ────────────────────────────────────────────────────────────────────
function buildTheme(primary,dark){
  const p=primary||"#6366f1";
  if(dark)return{bg:"#0f0f13",sidebar:"#0d0d15",card:"#16161f",border:"#1e1e2e",border2:"#2a2a38",text:"#e8e3d8",muted:"#7a7590",faint:"#4a4560",inputBg:"#0f0f13",chatBg:"#12121a",aiBubble:"#16161f",userBubble:"#1e1e40",scrollThumb:"#3a3a4a",overlay:"rgba(0,0,0,.75)",hoverBg:"#1a1a28",subcard:"#0f0f18",accent:p,danger:"#ef4444",warning:"#f97316",caution:"#eab308",success:"#22c55e"};
  return{bg:"#f8f7f4",sidebar:"#fff",card:"#fff",border:"#e5e3dc",border2:"#d1cfc7",text:"#1a1820",muted:"#6b6880",faint:"#9a97a8",inputBg:"#f5f4f1",chatBg:"#f0efe9",aiBubble:"#fff",userBubble:`rgba(${hexToRgb(p)},.1)`,scrollThumb:"#c4c2bc",overlay:"rgba(0,0,0,.4)",hoverBg:"#f0efe9",subcard:"#f5f4f0",accent:p,danger:"#dc2626",warning:"#ea580c",caution:"#ca8a04",success:"#16a34a"};
}

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
function AuthScreen({onAuth}){
  const[mode,setMode]=useState("login");
  const[email,setEmail]=useState("");
  const[password,setPassword]=useState("");
  const[name,setName]=useState("");
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState("");
  const[success,setSuccess]=useState("");
  async function submit(){
    setError("");setSuccess("");setLoading(true);
    if(mode==="signup"){
      const{error:e}=await supabase.auth.signUp({email,password,options:{data:{full_name:name}}});
      if(e)setError(e.message);
      else setSuccess("Account created! Check your email to confirm, then sign in.");
    }else{
      const{data,error:e}=await supabase.auth.signInWithPassword({email,password});
      if(e)setError(e.message);
      else onAuth(data.user);
    }
    setLoading(false);
  }
  const inp={width:"100%",background:"#0f0f13",border:"1px solid #2a2a38",borderRadius:8,padding:"10px 13px",color:"#e8e3d8",fontSize:14,outline:"none",fontFamily:"inherit",marginBottom:2};
  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#0f0f13 0%,#1a1a2e 100%)",fontFamily:"Georgia,serif"}}>
      <div style={{width:"min(90vw,420px)",padding:"40px 36px",background:"#16161f",borderRadius:20,border:"1px solid #2a2a38",boxShadow:"0 24px 80px rgba(0,0,0,.6)"}}>
        <div style={{textAlign:"center",marginBottom:30}}>
          <div style={{fontSize:44,marginBottom:10}}>🎓</div>
          <div style={{fontSize:26,fontWeight:700,color:"#e8e3d8"}}>ProPlanner</div>
          <div style={{fontSize:13,color:"#7a7590",marginTop:5}}>Your personalized academic planner</div>
        </div>
        <div style={{display:"flex",background:"#0f0f13",borderRadius:10,padding:3,marginBottom:24,border:"1px solid #2a2a38"}}>
          {["login","signup"].map(m=>(
            <button key={m} onClick={()=>{setMode(m);setError("");setSuccess("");}} style={{flex:1,padding:"9px",borderRadius:7,border:"none",background:mode===m?"#6366f1":"transparent",color:mode===m?"#fff":"#7a7590",fontSize:13,fontWeight:mode===m?600:400,cursor:"pointer",fontFamily:"inherit",transition:"all .2s"}}>
              {m==="login"?"Sign In":"Create Account"}
            </button>
          ))}
        </div>
        {mode==="signup"&&<div style={{marginBottom:14}}><div style={{fontSize:11,color:"#7a7590",marginBottom:5}}>Full Name</div><input value={name} onChange={e=>setName(e.target.value)} placeholder="Your full name" style={inp}/></div>}
        <div style={{marginBottom:14}}><div style={{fontSize:11,color:"#7a7590",marginBottom:5}}>Email</div><input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="you@university.edu" style={inp}/></div>
        <div style={{marginBottom:22}}><div style={{fontSize:11,color:"#7a7590",marginBottom:5}}>Password</div><input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&submit()} style={inp}/></div>
        {error&&<div style={{fontSize:12,color:"#ef4444",background:"rgba(239,68,68,.1)",padding:"9px 13px",borderRadius:8,marginBottom:14,border:"1px solid rgba(239,68,68,.3)"}}>{error}</div>}
        {success&&<div style={{fontSize:12,color:"#22c55e",background:"rgba(34,197,94,.1)",padding:"9px 13px",borderRadius:8,marginBottom:14,border:"1px solid rgba(34,197,94,.3)"}}>{success}</div>}
        <button onClick={submit} disabled={loading||!email||!password} style={{width:"100%",background:"#6366f1",color:"#fff",border:"none",borderRadius:10,padding:"13px",fontSize:15,fontWeight:600,cursor:"pointer",opacity:loading||!email||!password?0.6:1,fontFamily:"inherit",transition:"all .2s"}}>
          {loading?"Please wait...":mode==="login"?"Sign In →":"Create Account →"}
        </button>
        {mode==="login"&&<div style={{textAlign:"center",marginTop:16,fontSize:12,color:"#7a7590"}}>No account? <span onClick={()=>setMode("signup")} style={{color:"#6366f1",cursor:"pointer"}}>Sign up free</span></div>}
      </div>
    </div>
  );
}

// ─── ONBOARDING WIZARD ────────────────────────────────────────────────────────
function Onboarding({user,onComplete}){
  const[step,setStep]=useState(1);
  const TOTAL=6;
  const[p,setP]=useState({full_name:user.user_metadata?.full_name||"",degree_level:"",university:"utd",university_abbr:"UTD",university_primary:"#C75B12",is_athlete:null,sports:[],is_greek:null,greek_org:"",is_working_professional:null});
  const[saving,setSaving]=useState(false);
  function toggleSport(s){setP(x=>({...x,sports:x.sports.includes(s)?x.sports.filter(i=>i!==s):[...x.sports,s]}));}
  async function finish(){
    setSaving(true);
    const{error}=await supabase.from("profiles").upsert({id:user.id,...p,onboarding_complete:true});
    if(!error)onComplete({...p,onboarding_complete:true});
    else{alert("Error saving profile. Please try again.");setSaving(false);}
  }
  const wrap=ch=>(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#0f0f13,#1a1a2e)",fontFamily:"Georgia,serif",padding:16}}>
      <div style={{width:"min(92vw,500px)",padding:"36px 30px",background:"#16161f",borderRadius:20,border:"1px solid #2a2a38",boxShadow:"0 24px 80px rgba(0,0,0,.6)"}}>
        <div style={{display:"flex",gap:5,justifyContent:"center",marginBottom:26}}>
          {Array.from({length:TOTAL}).map((_,i)=><div key={i} style={{width:i+1===step?20:7,height:7,borderRadius:4,background:i+1<=step?"#6366f1":"#2a2a38",transition:"all .3s"}}/>)}
        </div>
        {ch}
      </div>
    </div>
  );
  const nextBtn=(label,disabled,action)=>(
    <button onClick={action||(()=>setStep(s=>s+1))} disabled={disabled||saving} style={{width:"100%",background:"#6366f1",color:"#fff",border:"none",borderRadius:10,padding:"12px",fontSize:14,fontWeight:600,cursor:disabled?"not-allowed":"pointer",marginTop:20,opacity:disabled?0.5:1,fontFamily:"inherit",transition:"all .2s"}}>
      {saving?"Saving...":label||"Continue →"}
    </button>
  );
  const yesno=(val,onChange)=>(
    <div style={{display:"flex",gap:10,marginTop:16}}>
      {["Yes","No"].map(o=>(
        <button key={o} onClick={()=>onChange(o==="Yes")} style={{flex:1,padding:"12px",borderRadius:10,border:`2px solid ${val===(o==="Yes")?"#6366f1":"#2a2a38"}`,background:val===(o==="Yes")?"rgba(99,102,241,.12)":"transparent",color:val===(o==="Yes")?"#a5b4fc":"#7a7590",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all .2s"}}>
          {o==="Yes"?"✓ Yes":"✗ No"}
        </button>
      ))}
    </div>
  );
  const inp={width:"100%",background:"#0f0f13",border:"1px solid #2a2a38",borderRadius:8,padding:"9px 12px",color:"#e8e3d8",fontSize:14,outline:"none",fontFamily:"inherit"};

  if(step===1)return wrap(<>
    <div style={{fontSize:10,letterSpacing:3,color:"#6366f1",textTransform:"uppercase",marginBottom:8}}>Welcome</div>
    <h2 style={{fontSize:22,fontWeight:700,color:"#e8e3d8",marginBottom:6}}>Hi {p.full_name.split(" ")[0]||"there"}! 👋</h2>
    <p style={{fontSize:13,color:"#7a7590",lineHeight:1.7,marginBottom:20}}>Let us set up your planner. A few quick questions so we build a schedule that actually fits your life — not just your classes.</p>
    <div style={{marginBottom:10}}><div style={{fontSize:11,color:"#7a7590",marginBottom:5}}>Your name</div><input value={p.full_name} onChange={e=>setP(x=>({...x,full_name:e.target.value}))} placeholder="Full name" style={inp}/></div>
    {nextBtn("Let us go →",!p.full_name)}
  </>);

  if(step===2)return wrap(<>
    <div style={{fontSize:10,letterSpacing:3,color:"#6366f1",textTransform:"uppercase",marginBottom:8}}>Step 1 of 5</div>
    <h2 style={{fontSize:20,fontWeight:700,color:"#e8e3d8",marginBottom:5}}>What are you studying for?</h2>
    <p style={{fontSize:12,color:"#7a7590",marginBottom:16,lineHeight:1.6}}>This calibrates your study load and scheduling intensity.</p>
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {DEGREE_LEVELS.map(d=>(
        <div key={d.id} onClick={()=>setP(x=>({...x,degree_level:d.id}))} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:10,border:`2px solid ${p.degree_level===d.id?"#6366f1":"#2a2a38"}`,background:p.degree_level===d.id?"rgba(99,102,241,.1)":"transparent",cursor:"pointer",transition:"all .2s"}}>
          <span style={{fontSize:20}}>{d.icon}</span>
          <span style={{fontSize:14,color:"#e8e3d8",fontWeight:p.degree_level===d.id?600:400}}>{d.label}</span>
          {p.degree_level===d.id&&<span style={{marginLeft:"auto",color:"#6366f1",fontSize:16}}>✓</span>}
        </div>
      ))}
    </div>
    {nextBtn("Continue →",!p.degree_level)}
  </>);

  if(step===3)return wrap(<>
    <div style={{fontSize:10,letterSpacing:3,color:"#6366f1",textTransform:"uppercase",marginBottom:8}}>Step 2 of 5</div>
    <h2 style={{fontSize:20,fontWeight:700,color:"#e8e3d8",marginBottom:5}}>Your University</h2>
    <p style={{fontSize:12,color:"#7a7590",marginBottom:14,lineHeight:1.6}}>We will theme the app in your school's official colors.</p>
    <div style={{maxHeight:320,overflowY:"auto",display:"flex",flexDirection:"column",gap:6,paddingRight:4}}>
      {UNIVERSITIES.map(u=>(
        <div key={u.id} onClick={()=>setP(x=>({...x,university:u.id,university_abbr:u.abbr,university_primary:u.primary}))} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:9,border:`2px solid ${p.university===u.id?u.primary:"#2a2a38"}`,background:p.university===u.id?`rgba(${hexToRgb(u.primary)},.12)`:"transparent",cursor:"pointer",transition:"all .2s"}}>
          <div style={{width:26,height:26,borderRadius:6,background:u.primary,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>{u.logo}</div>
          <span style={{fontSize:13,color:"#e8e3d8",flex:1,fontWeight:p.university===u.id?600:400}}>{u.name}</span>
          <div style={{display:"flex",gap:3}}>{[u.primary,u.secondary,u.accent].map((c,i)=><div key={i} style={{width:10,height:10,borderRadius:2,background:c}}/>)}</div>
        </div>
      ))}
    </div>
    {nextBtn("Continue →")}
  </>);

  if(step===4)return wrap(<>
    <div style={{fontSize:10,letterSpacing:3,color:"#6366f1",textTransform:"uppercase",marginBottom:8}}>Step 3 of 5</div>
    <h2 style={{fontSize:20,fontWeight:700,color:"#e8e3d8",marginBottom:5}}>Are you a student-athlete?</h2>
    <p style={{fontSize:12,color:"#7a7590",lineHeight:1.6}}>We will block practice and game times so study sessions never conflict.</p>
    {yesno(p.is_athlete,v=>setP(x=>({...x,is_athlete:v,sports:v?x.sports:[]})))}
    {p.is_athlete&&<>
      <p style={{fontSize:12,color:"#7a7590",marginTop:16,marginBottom:10,fontWeight:600}}>Which sport(s)? Select all that apply:</p>
      <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
        {SPORTS_LIST.map(s=>(
          <button key={s} onClick={()=>toggleSport(s)} style={{padding:"5px 11px",borderRadius:20,border:`1px solid ${p.sports.includes(s)?"#6366f1":"#2a2a38"}`,background:p.sports.includes(s)?"rgba(99,102,241,.15)":"transparent",color:p.sports.includes(s)?"#a5b4fc":"#7a7590",fontSize:12,cursor:"pointer",fontFamily:"inherit",transition:"all .2s"}}>
            {s}
          </button>
        ))}
      </div>
    </>}
    {p.is_athlete!==null&&nextBtn("Continue →",p.is_athlete&&p.sports.length===0)}
  </>);

  if(step===5)return wrap(<>
    <div style={{fontSize:10,letterSpacing:3,color:"#6366f1",textTransform:"uppercase",marginBottom:8}}>Step 4 of 5</div>
    <h2 style={{fontSize:20,fontWeight:700,color:"#e8e3d8",marginBottom:5}}>Greek Life?</h2>
    <p style={{fontSize:12,color:"#7a7590",lineHeight:1.6}}>We will account for chapter meetings, philanthropy events, and other commitments.</p>
    {yesno(p.is_greek,v=>setP(x=>({...x,is_greek:v,greek_org:v?x.greek_org:""})))}
    {p.is_greek&&<>
      <p style={{fontSize:12,color:"#7a7590",marginTop:16,marginBottom:8,fontWeight:600}}>Which organization?</p>
      <select value={p.greek_org} onChange={e=>setP(x=>({...x,greek_org:e.target.value}))} style={{width:"100%",background:"#0f0f13",border:"1px solid #2a2a38",borderRadius:8,padding:"10px 12px",color:"#e8e3d8",fontSize:13,outline:"none",fontFamily:"inherit"}}>
        <option value="">Select organization...</option>
        {GREEK_ORGS.map(g=><option key={g} value={g}>{g}</option>)}
      </select>
    </>}
    {p.is_greek!==null&&nextBtn("Continue →",p.is_greek&&!p.greek_org)}
  </>);

  if(step===6)return wrap(<>
    <div style={{fontSize:10,letterSpacing:3,color:"#6366f1",textTransform:"uppercase",marginBottom:8}}>Step 5 of 5</div>
    <h2 style={{fontSize:20,fontWeight:700,color:"#e8e3d8",marginBottom:5}}>Working professional?</h2>
    <p style={{fontSize:12,color:"#7a7590",lineHeight:1.6}}>We will build your work schedule day-by-day so study sessions only land in your free time.</p>
    {yesno(p.is_working_professional,v=>setP(x=>({...x,is_working_professional:v})))}
    {p.is_working_professional!==null&&<>
      <div style={{marginTop:20,padding:16,background:"rgba(99,102,241,.08)",borderRadius:10,border:"1px solid rgba(99,102,241,.2)"}}>
        <div style={{fontSize:13,color:"#a5b4fc",fontWeight:600,marginBottom:6}}>Almost done!</div>
        <div style={{fontSize:12,color:"#7a7590",lineHeight:1.7}}>
          {p.is_working_professional?"After setup, configure your exact work hours day-by-day under My Schedule.":"Your schedule will be optimized around your classes and activities."}
          {p.is_athlete&&<div style={{marginTop:4}}>🏅 We will add blocks for your {p.sports.join(", ")} schedule.</div>}
          {p.is_greek&&<div style={{marginTop:4}}>🏛 We will add blocks for {p.greek_org} activities.</div>}
        </div>
      </div>
      {nextBtn("Launch ProPlanner 🚀",false,finish)}
    </>}
  </>);

  return null;
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function ProPlanner(){
  const t=today();

  // Auth state
  const[authUser,setAuthUser]=useState(null);
  const[authLoading,setAuthLoading]=useState(true);
  const[profile,setProfile]=useState(null);

  // UI state
  const[view,setView]=useState("dashboard");
  const[dark,setDark]=useState(()=>window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);
  const[sidebarOpen,setSidebar]=useState(()=>window.innerWidth>768);
  const[chatOpen,setChatOpen]=useState(false);

  // Data state — all loaded from Supabase per user
  const[courses,setCourses]=useState([]);
  const[assignments,setAssignments]=useState([]);
  const[studyBlocks,setStudyBlocks]=useState([]);
  const[milestones,setMilestones]=useState([]);
  const[scheduleBlocks,setScheduleBlocks]=useState([]);  // practice, greek, work events
  const[travelDates,setTravelDates]=useState([]);
  const[energyLog,setEnergyLog]=useState([]);
  const[workSched,setWorkSched]=useState({
    Sun:{work:false,start:"",end:""},
    Mon:{work:true,start:"08:00",end:"18:00"},
    Tue:{work:true,start:"08:00",end:"18:00"},
    Wed:{work:true,start:"08:00",end:"18:00"},
    Thu:{work:true,start:"08:00",end:"18:00"},
    Fri:{work:true,start:"08:00",end:"17:00"},
    Sat:{work:false,start:"",end:""},
  });

  // Modal state
  const[showAddAssign,setShowAddAssign]=useState(false);
  const[showAddCourse,setShowAddCourse]=useState(false);
  const[showAddMilestone,setShowAddMilestone]=useState(false);
  const[showAddTravel,setShowAddTravel]=useState(false);
  const[showAddBlock,setShowAddBlock]=useState(false);
  const[uploading,setUploading]=useState(false);
  const[uploadMsg,setUploadMsg]=useState("");
  const[notification,setNotification]=useState("");
  const[newAssign,setNewAssign]=useState({courseId:"",title:"",due:"",type:"paper",estHours:4});
  const[newCourse,setNewCourse]=useState({name:"",difficulty:3,color:"#6366f1",professor:""});
  const[newMilestone,setNewMilestone]=useState({title:"",due:"",notes:""});
  const[newTravel,setNewTravel]=useState({start:"",end:"",label:""});
  const[newBlock,setNewBlock]=useState({label:"",block_type:"sport",days_of_week:["Mon"],start_time:"15:00",end_time:"17:00",date_specific:""});

  // Flashcard state
  const[showFlashModal,setShowFlashModal]=useState(null);
  const[flashGenerating,setFlashGenerating]=useState(false);
  const[flashContext,setFlashContext]=useState("");
  const[activeCard,setActiveCard]=useState(0);
  const[cardFlipped,setCardFlipped]=useState(false);
  const[studyMode,setStudyMode]=useState(false);

  // RMP state
  const[rmpSearching,setRmpSearching]=useState({});
  const[rmpResults,setRmpResults]=useState({});

  // Chat state
  const[chatMessages,setChatMessages]=useState([{role:"assistant",content:"Hi! I am your ProPlanner AI assistant. I know your schedule, courses, and commitments. Ask me anything!"}]);
  const[chatInput,setChatInput]=useState("");
  const[chatLoading,setChatLoading]=useState(false);
  const chatEndRef=useRef(null);

  // Calendar state
  const[calYear,setCalYear]=useState(t.year);
  const[calMonth,setCalMonth]=useState(t.month);
  const[selectedDay,setSelectedDay]=useState(t.day); // default to today

  // Confirmation modal state
  const[confirmModal,setConfirmModal]=useState(null); // {message, onConfirm, detail}
  // Dissertation state
  const[showReflection,setShowReflection]=useState(false);
  const[weeklyReflection,setWeeklyReflection]=useState("");

  const uni=UNIVERSITIES.find(u=>u.id===profile?.university)||UNIVERSITIES[0];
  const T=buildTheme(profile?.university_primary||"#6366f1",dark);
  const rgb=hexToRgb(T.accent);

  // ── Auth setup ─────────────────────────────────────────────────────────────
  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      setAuthUser(session?.user||null);
      setAuthLoading(false);
    });
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>{
      setAuthUser(session?.user||null);
      if(!session)setProfile(null);
    });
    return()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{if(authUser)loadProfile();},[authUser]);
  useEffect(()=>{if(profile?.onboarding_complete)loadAllData();},[profile?.id]);
  useEffect(()=>{generateStudyBlocks();},[assignments,courses,workSched,travelDates,scheduleBlocks]);
  useEffect(()=>{chatEndRef.current?.scrollIntoView({behavior:"smooth"});},[chatMessages,chatOpen]);

  async function loadProfile(){
    const{data}=await supabase.from("profiles").select("*").eq("id",authUser.id).single();
    if(data){setProfile(data);if(data.dark_mode!==undefined)setDark(data.dark_mode);}
    else setProfile({id:authUser.id,onboarding_complete:false});
  }

  async function loadAllData(){
    const uid=authUser.id;
    const[c,a,m,sb,td,el]=await Promise.all([
      supabase.from("courses").select("*").eq("user_id",uid).order("created_at"),
      supabase.from("assignments").select("*").eq("user_id",uid).order("created_at"),
      supabase.from("milestones").select("*").eq("user_id",uid).order("due_date"),
      supabase.from("schedule_blocks").select("*").eq("user_id",uid),
      supabase.from("travel_dates").select("*").eq("user_id",uid),
      supabase.from("energy_log").select("*").eq("user_id",uid),
    ]);
    if(c.data)setCourses(c.data.map(x=>({...x,rmpData:x.rmp_data})));
    if(a.data)setAssignments(a.data.map(x=>({...x,courseId:x.course_id,due:x.due_date,estHours:x.est_hours,flashcards:x.flashcards||[]})));
    if(m.data)setMilestones(m.data.map(x=>({...x,due:x.due_date})));
    if(sb.data)setScheduleBlocks(sb.data);
    if(td.data)setTravelDates(td.data.map(x=>({...x,start:x.start_date,end:x.end_date})));
    if(el.data)setEnergyLog(el.data.map(x=>({date:x.log_date,level:x.level})));
  }

  function notify(msg){setNotification(msg);setTimeout(()=>setNotification(""),3500);}
  function confirm(message,onConfirm,detail=""){setConfirmModal({message,onConfirm,detail});}

  // ── Study scheduler (respects work, sports, greek, travel) ─────────────────
  function getStudyWindow(dateStr){
    const dayName=DAYS_SHORT[new Date(dateStr+"T00:00:00").getDay()];
    // Blocked by travel
    if(travelDates.some(tr=>dateStr>=tr.start&&dateStr<=tr.end))return{available:false,slot:"Traveling"};
    const dayBlocks=scheduleBlocks.filter(b=>b.day_of_week===dayName||b.date_specific===dateStr);
    const ws=workSched[dayName];
    // Calculate free hours in the day
    // Day = 7am to 10pm = 15 usable hours
    let blockedHours=0;
    if(ws?.work){
      const startH=parseInt(ws.start?.split(":")[0]||8);
      const endH=parseInt(ws.end?.split(":")[0]||18);
      blockedHours+=Math.max(0,endH-startH);
    }
    dayBlocks.forEach(b=>{
      const bStart=parseInt(b.start_time?.split(":")[0]||15);
      const bEnd=parseInt(b.end_time?.split(":")[0]||17);
      blockedHours+=Math.max(0,bEnd-bStart);
    });
    // Need at least 2 free hours to study
    if(blockedHours>=13)return{available:false,slot:"Day fully booked"};
    // Determine best study slot
    if(!ws?.work&&dayBlocks.length===0)return{available:true,slot:"All day — pick your best time"};
    if(ws?.work){
      const workEnd=parseInt(ws.end?.split(":")[0]||18);
      // Check if morning before work is free (before 8am start = unlikely, so evening default)
      const workStart=parseInt(ws.start?.split(":")[0]||8);
      if(workStart>=9){
        return{available:true,slot:`Morning before work or Evening after ${workEnd}:00`};
      }
      return{available:true,slot:`Evening after ${workEnd}:00`};
    }
    // Activity blocks only — study around them
    const latestBlock=dayBlocks.reduce((max,b)=>{
      const h=parseInt(b.end_time?.split(":")[0]||17);return h>max?h:max;
    },0);
    const earliestBlock=dayBlocks.reduce((min,b)=>{
      const h=parseInt(b.start_time?.split(":")[0]||15);return h<min?h:min;
    },24);
    if(earliestBlock>=12)return{available:true,slot:`Morning (before ${earliestBlock}:00)`};
    return{available:true,slot:`After ${latestBlock}:00`};
  }

  function generateStudyBlocks(){
    const blocks=[];
    // Track how many study sessions are placed per date (max 2 per day across all assignments)
    const dailyCount={};
    const pendingAssignments=assignments.filter(a=>!a.done&&daysUntil(a.due)>=0).sort((a,b)=>new Date(a.due)-new Date(b.due));
    pendingAssignments.forEach(assign=>{
      const course=courses.find(c=>c.id===assign.courseId);
      const diff=course?.rmpData?Math.round((course.difficulty+rmpToInternal(course.rmpData.avgDifficulty))/2):course?.difficulty||3;
      // Calculate sessions needed: estHours adjusted by difficulty, in 2-hr sessions
      const adjustedHours=assign.estHours*(diff/3);
      const sessions=Math.ceil(adjustedHours/2);
      let placed=0;
      let checkDay=new Date();
      checkDay.setHours(0,0,0,0);
      const dueDay=new Date(assign.due+"T00:00:00");
      // Try to spread sessions evenly — start from today and work forward
      while(placed<sessions&&checkDay<dueDay){
        const dateStr=checkDay.toISOString().slice(0,10);
        const win=getStudyWindow(dateStr);
        const alreadyOnDay=dailyCount[dateStr]||0;
        // Place a block if: day is available, this assignment not already on this day, max 2 sessions per day
        if(win.available&&!blocks.find(b=>b.date===dateStr&&b.assignId===assign.id)&&alreadyOnDay<2){
          blocks.push({
            id:`${assign.id}-${dateStr}`,
            assignId:assign.id,
            courseId:assign.courseId,
            title:`Study: ${assign.title}`,
            date:dateStr,
            slot:win.slot,
            hours:2,
            color:course?.color||T.accent,
          });
          dailyCount[dateStr]=(dailyCount[dateStr]||0)+1;
          placed++;
        }
        checkDay.setDate(checkDay.getDate()+1);
      }
    });
    setStudyBlocks(blocks);
  }

  // ── CRUD — all saved to Supabase ───────────────────────────────────────────
  async function addCourse(){
    if(!newCourse.name)return notify("Enter a course name.");
    const{data,error}=await supabase.from("courses").insert({user_id:authUser.id,name:newCourse.name,difficulty:newCourse.difficulty,color:newCourse.color,professor:newCourse.professor||""}).select().single();
    if(error)return notify("Error saving course.");
    setCourses(p=>[...p,{...data,rmpData:null}]);
    setShowAddCourse(false);setNewCourse({name:"",difficulty:3,color:"#6366f1",professor:""});notify("Course added!");
  }

  async function deleteCourse(id){
    confirm("Drop this course?",()=>doDeleteCourse(id),`This will also permanently remove all assignments for this course.`);return;
    await supabase.from("courses").delete().eq("id",id);
    await supabase.from("assignments").delete().eq("course_id",id);
    setCourses(p=>p.filter(c=>c.id!==id));
    setAssignments(p=>p.filter(a=>a.courseId!==id));
    notify("Course dropped.");
  }

  async function addAssignment(){
    if(!newAssign.title||!newAssign.due)return notify("Fill in title and due date.");
    const cid=newAssign.courseId||courses[0]?.id;
    if(!cid)return notify("Add a course first.");
    const{data,error}=await supabase.from("assignments").insert({user_id:authUser.id,course_id:cid,title:newAssign.title,due_date:newAssign.due,type:newAssign.type,est_hours:newAssign.estHours,done:false,topics:"",flashcards:[]}).select().single();
    if(error)return notify("Error saving.");
    setAssignments(p=>[...p,{...data,courseId:data.course_id,due:data.due_date,estHours:data.est_hours,flashcards:[]}]);
    setShowAddAssign(false);setNewAssign({courseId:courses[0]?.id||"",title:"",due:"",type:"paper",estHours:4});notify("Assignment added!");
  }

  async function deleteAssignment(id){
    confirm("Delete this assignment?",()=>doDeleteAssignment(id));return;
    await supabase.from("assignments").delete().eq("id",id);
    setAssignments(p=>p.filter(a=>a.id!==id));notify("Deleted.");
  }

  async function toggleDone(id){
    const a=assignments.find(x=>x.id===id);if(!a)return;
    await supabase.from("assignments").update({done:!a.done}).eq("id",id);
    setAssignments(p=>p.map(x=>x.id===id?{...x,done:!x.done}:x));
  }

  async function addMilestone(){
    if(!newMilestone.title||!newMilestone.due)return notify("Fill title and date.");
    const{data}=await supabase.from("milestones").insert({user_id:authUser.id,title:newMilestone.title,due_date:newMilestone.due,notes:newMilestone.notes,done:false}).select().single();
    setMilestones(p=>[...p,{...data,due:data.due_date}]);
    setShowAddMilestone(false);setNewMilestone({title:"",due:"",notes:""});notify("Milestone added!");
  }

  async function toggleMilestoneDone(id){
    const m=milestones.find(x=>x.id===id);if(!m)return;
    await supabase.from("milestones").update({done:!m.done}).eq("id",id);
    setMilestones(p=>p.map(x=>x.id===id?{...x,done:!x.done}:x));
  }

  async function addScheduleBlock(){
    if(!newBlock.label)return notify("Add a label.");
    const daysToAdd=newBlock.date_specific?[""]:(newBlock.days_of_week||["Mon"]);
    const rows=daysToAdd.map(day=>({
      user_id:authUser.id,
      label:newBlock.label,
      block_type:newBlock.block_type,
      day_of_week:day||"Mon",
      start_time:newBlock.start_time,
      end_time:newBlock.end_time,
      date_specific:newBlock.date_specific||"",
    }));
    const{data,error}=await supabase.from("schedule_blocks").insert(rows).select();
    if(error)return notify("Error saving block.");
    setScheduleBlocks(p=>[...p,...(data||[])]);
    setShowAddBlock(false);
    setNewBlock({label:"",block_type:"sport",days_of_week:["Mon"],start_time:"15:00",end_time:"17:00",date_specific:""});
    notify(`Block added for ${daysToAdd.length} day${daysToAdd.length>1?"s":""}!`);
  }

  async function deleteScheduleBlock(id){
    await supabase.from("schedule_blocks").delete().eq("id",id);
    setScheduleBlocks(p=>p.filter(x=>x.id!==id));notify("Block removed.");
  }

  async function addTravel(){
    if(!newTravel.start||!newTravel.end)return notify("Enter start and end dates.");
    const{data}=await supabase.from("travel_dates").insert({user_id:authUser.id,label:newTravel.label,start_date:newTravel.start,end_date:newTravel.end}).select().single();
    setTravelDates(p=>[...p,{...data,start:data.start_date,end:data.end_date}]);
    setShowAddTravel(false);setNewTravel({start:"",end:"",label:""});notify("Dates blocked!");
  }

  async function deleteTravel(id){
    await supabase.from("travel_dates").delete().eq("id",id);
    setTravelDates(p=>p.filter(x=>x.id!==id));
  }

  async function logEnergy(level){
    const k=dateKey(t.year,t.month,t.day);
    await supabase.from("energy_log").upsert({user_id:authUser.id,log_date:k,level},{onConflict:"user_id,log_date"});
    setEnergyLog(p=>[...p.filter(e=>e.date!==k),{date:k,level}]);
  }

  // ── Syllabus import ────────────────────────────────────────────────────────
  async function handleSyllabusUpload(e){
    const file=e.target.files[0];if(!file)return;
    setUploading(true);setUploadMsg("Reading file...");
    const isPDF=file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf");
    try{
      let result;
      if(isPDF){
        setUploadMsg("Converting PDF...");
        // Read PDF as base64
        const base64=await new Promise((res,rej)=>{
          const r=new FileReader();
          r.onload=()=>res(r.result.split(",")[1]);
          r.onerror=()=>rej(new Error("Could not read file"));
          r.readAsDataURL(file);
        });
        setUploadMsg("Sending PDF to AI...");
        // Check key is present before calling
        const apiKey=import.meta.env.VITE_ANTHROPIC_KEY||"";
        if(!apiKey){throw new Error("API key not found. Check VITE_ANTHROPIC_KEY in Vercel environment variables.");}
        const resp=await fetch("https://api.anthropic.com/v1/messages",{
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "x-api-key":apiKey,
            "anthropic-version":"2023-06-01",
            "anthropic-dangerous-direct-browser-access":"true"
          },
          body:JSON.stringify({
            model:"claude-sonnet-4-20250514",
            max_tokens:2000,
            messages:[{
              role:"user",
              content:[
                {type:"document",source:{type:"base64",media_type:"application/pdf",data:base64}},
                {type:"text",text:`You are parsing an academic course syllabus. Extract the course name, professor name, and ALL assignments/exams/deliverables with their due dates.

Return ONLY a valid JSON object — no explanation, no markdown, no backticks. Just raw JSON:
{
  "courseName": "full course name and number",
  "professorName": "professor full name or empty string",
  "difficulty": 3,
  "assignments": [
    {
      "title": "assignment name",
      "due": "YYYY-MM-DD",
      "type": "paper",
      "estHours": 4,
      "topics": "key topics covered"
    }
  ]
}

For type use one of: paper, exam, case, homework, project, discussion.
For difficulty use 1-5 (doctoral courses are typically 4-5).
Assume year ${new Date().getFullYear()} when no year is specified.
If a due date is unclear, make your best guess based on context.
Return ONLY the JSON object, nothing else.`}
              ]
            }]
          })
        });
        if(!resp.ok){
          const errText=await resp.text();
          throw new Error(`API error ${resp.status}: ${errText}`);
        }
        const data=await resp.json();
        if(data.error){throw new Error(`Claude error: ${data.error.message}`);}
        const rawText=data.content?.map(b=>b.text||"").join("")||"";
        setUploadMsg("Parsing results...");
        // Clean up response and parse JSON
        const cleaned=rawText.replace(/```json[\s\S]*?```/g,"").replace(/```[\s\S]*?```/g,"").trim();
        // Find the JSON object in the response
        const jsonMatch=cleaned.match(/\{[\s\S]*\}/);
        if(!jsonMatch){throw new Error(`No JSON found in response: ${cleaned.slice(0,200)}`);}
        result=JSON.parse(jsonMatch[0]);
      }else{
        // Plain text file
        setUploadMsg("Reading text...");
        const text=await file.text();
        setUploadMsg("Analyzing with AI...");
        result=await callClaudeJSON(
          `Parse this academic syllabus. Return ONLY valid JSON: {"courseName":"","professorName":"","difficulty":1-5,"assignments":[{"title":"","due":"YYYY-MM-DD","type":"paper|exam|case|homework|project|discussion","estHours":1,"topics":""}]}. Assume year ${new Date().getFullYear()}.`,
          text.slice(0,3500)
        );
      }
      // Save course if new
      setUploadMsg("Saving course...");
      let cid=courses.find(c=>c.name===result.courseName)?.id;
      if(!cid){
        const cols=["#6366f1","#0ea5e9","#ec4899","#10b981","#f59e0b","#8b5cf6"];
        const{data:cd,error:ce}=await supabase.from("courses").insert({
          user_id:authUser.id,
          name:result.courseName||"New Course",
          difficulty:result.difficulty||3,
          color:cols[courses.length%cols.length],
          professor:result.professorName||""
        }).select().single();
        if(ce)throw new Error(`Course save error: ${ce.message}`);
        if(cd){setCourses(p=>[...p,{...cd,rmpData:null}]);cid=cd.id;}
      }
      // Save assignments
      setUploadMsg("Saving assignments...");
      const rows=(result.assignments||[]).map(a=>({
        user_id:authUser.id,course_id:cid,
        title:a.title||"Untitled",
        due_date:a.due||new Date().toISOString().slice(0,10),
        type:a.type||"paper",
        est_hours:a.estHours||4,
        done:false,topics:a.topics||"",flashcards:[]
      }));
      if(rows.length===0){
        setUploadMsg("No assignments found in syllabus.");
        setUploading(false);
        return;
      }
      const{data:ad,error:ae}=await supabase.from("assignments").insert(rows).select();
      if(ae)throw new Error(`Assignment save error: ${ae.message}`);
      if(ad)setAssignments(p=>[...p,...ad.map(x=>({...x,courseId:x.course_id,due:x.due_date,estHours:x.est_hours,flashcards:[]}))]);
      setUploadMsg(`✓ Imported ${rows.length} assignments from ${result.courseName}`);
      notify(`Syllabus imported! ${rows.length} assignments added.`);
    }catch(err){
      console.error("Syllabus upload error:",err);
      // Show the actual error message on screen so we can debug
      setUploadMsg(`Error: ${err.message||"Unknown error"}`);
    }
    setUploading(false);
  }

  // ── RMP ───────────────────────────────────────────────────────────────────
  async function handleRmpSearch(cid,profName){
    if(!profName?.trim())return notify("Enter a professor name first.");
    setRmpSearching(s=>({...s,[cid]:true}));
    try{
      const res=await fetch("https://www.ratemyprofessors.com/graphql",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Basic dGVzdDp0ZXN0"},body:JSON.stringify({query:`query{search:newSearch{teachers(query:"${profName}",first:5){edges{node{id,firstName,lastName,avgRating,avgDifficulty,numRatings,wouldTakeAgainPercent,department,school{name}}}}}}`,variables:{}})});
      const data=await res.json();
      const teachers=data?.data?.search?.teachers?.edges?.map(e=>e.node)||[];
      setRmpResults(r=>({...r,[cid]:teachers.length>0?teachers:"notfound"}));
    }catch{setRmpResults(r=>({...r,[cid]:"notfound"}));}
    setRmpSearching(s=>({...s,[cid]:false}));
  }

  async function applyRmp(cid,rmp){
    const c=courses.find(x=>x.id===cid);
    const blended=Math.round(((c?.difficulty||3)+rmpToInternal(rmp.avgDifficulty))/2);
    await supabase.from("courses").update({rmp_data:rmp,difficulty:blended}).eq("id",cid);
    setCourses(p=>p.map(c=>c.id!==cid?c:{...c,rmpData:rmp,difficulty:blended}));
    setRmpResults(r=>({...r,[cid]:[]}));notify("RMP data applied — difficulty recalibrated!");
  }

  // ── Flashcards ─────────────────────────────────────────────────────────────
  async function generateFlashcards(aid){
    const a=assignments.find(x=>x.id===aid);const course=courses.find(c=>c.id===a?.courseId);
    if(!a)return;setFlashGenerating(true);
    try{
      const result=await callClaudeJSON('Generate academic flashcards. Return ONLY valid JSON: {"flashcards":[{"front":"","back":"","category":"concept|formula|framework|application|definition"}]}',`Course: ${course?.name}\nAssignment: "${a.title}" (${a.type})\n${a.topics?"Topics: "+a.topics:""}\n${flashContext?"Context: "+flashContext:""}\nGenerate 12-16 high-quality flashcards.`,2000);
      const cards=(result.flashcards||[]).map((c,i)=>({...c,id:i,mastered:false}));
      await supabase.from("assignments").update({flashcards:cards}).eq("id",aid);
      setAssignments(p=>p.map(x=>x.id===aid?{...x,flashcards:cards}:x));
      setActiveCard(0);setCardFlipped(false);setStudyMode(true);notify(`${cards.length} flashcards generated!`);
    }catch{notify("Flashcard generation failed. Try adding more context.");}
    setFlashGenerating(false);setFlashContext("");
  }

  async function toggleMastered(aid,cid){
    const a=assignments.find(x=>x.id===aid);if(!a)return;
    const updated=a.flashcards.map(c=>c.id===cid?{...c,mastered:!c.mastered}:c);
    await supabase.from("assignments").update({flashcards:updated}).eq("id",aid);
    setAssignments(p=>p.map(x=>x.id===aid?{...x,flashcards:updated}:x));
  }

  // ── AI Chat ────────────────────────────────────────────────────────────────
  async function sendChat(override){
    const text=(override||chatInput).trim();if(!text||chatLoading)return;
    const ctx=`You are an academic planner AI for ${profile?.full_name||"a student"} at ${uni.name}.
Degree: ${profile?.degree_level}. ${profile?.is_athlete?"Athlete: "+profile.sports?.join(", ")+".":""} ${profile?.is_greek?"Greek: "+profile.greek_org+".":""} ${profile?.is_working_professional?"Working professional.":""}
Courses: ${JSON.stringify(courses.map(c=>({name:c.name,difficulty:c.difficulty,rmp:c.rmpData?{rating:c.rmpData.avgRating,difficulty:c.rmpData.avgDifficulty}:null})))}
Pending assignments: ${JSON.stringify(assignments.filter(a=>!a.done).map(a=>({title:a.title,due:a.due,type:a.type,daysLeft:daysUntil(a.due),course:courses.find(c=>c.id===a.courseId)?.name})))}
Milestones: ${JSON.stringify(milestones.filter(m=>!m.done).map(m=>({title:m.title,due:m.due,daysLeft:daysUntil(m.due)})))}
Today: ${new Date().toDateString()}. Be concise, encouraging, and practical.`;
    const userMsg={role:"user",content:text};
    const hist=[...chatMessages,userMsg];
    setChatMessages(hist);setChatInput("");setChatLoading(true);
    const api=[{role:"user",content:`[CTX]\n${ctx}\n[/CTX]\nAcknowledge briefly.`},{role:"assistant",content:"Got it — full context loaded."}, ...hist.filter((_,i)=>i>0)];
    try{const r=await callClaudeChat(api);setChatMessages(p=>[...p,{role:"assistant",content:r}]);}
    catch{setChatMessages(p=>[...p,{role:"assistant",content:"Connection issue. Please try again."}]);}
    setChatLoading(false);
  }

  // ── Calendar ───────────────────────────────────────────────────────────────
  function getEventsForDay(y,m,d){
    const k=dateKey(y,m,d);const dayName=DAYS_SHORT[new Date(y,m,d).getDay()];
    return{asgn:assignments.filter(a=>a.due===k),study:studyBlocks.filter(b=>b.date===k),travel:travelDates.find(tr=>k>=tr.start&&k<=tr.end),milestone:milestones.find(ms=>ms.due===k),blocks:scheduleBlocks.filter(b=>b.day_of_week===dayName||b.date_specific===k)};
  }
  function prevMonth(){calMonth===0?(setCalYear(y=>y-1),setCalMonth(11)):setCalMonth(m=>m-1);}
  function nextMonth(){calMonth===11?(setCalYear(y=>y+1),setCalMonth(0)):setCalMonth(m=>m+1);}

  // ── Derived values ─────────────────────────────────────────────────────────
  const upcoming=assignments.filter(a=>!a.done).sort((a,b)=>new Date(a.due)-new Date(b.due)).slice(0,5);
  const overdue=assignments.filter(a=>!a.done&&daysUntil(a.due)<0);
  const todayStudy=studyBlocks.filter(b=>b.date===dateKey(t.year,t.month,t.day));
  const nextMilestone=milestones.filter(m=>!m.done).sort((a,b)=>new Date(a.due)-new Date(b.due))[0];
  const calDays=getCalendarDays(calYear,calMonth);
  const todayEnergy=energyLog.find(e=>e.date===dateKey(t.year,t.month,t.day))?.level;

  const NAV=[
    {id:"dashboard",icon:"◈",label:"Dashboard"},
    {id:"calendar",icon:"◷",label:"Calendar"},
    {id:"assignments",icon:"◉",label:"Assignments"},
    {id:"courses",icon:"◎",label:"Courses"},
    {id:"schedule",icon:"⊞",label:"My Schedule"},
    {id:"dissertation",icon:"⬟",label:["doctoral","postdoc"].includes(profile?.degree_level)?"Dissertation":["graduate"].includes(profile?.degree_level)?"Thesis / Capstone":"Major Project"},
    {id:"flashcards",icon:"⬡",label:"Flashcards"},
    {id:"settings",icon:"◌",label:"Settings"},
  ];

  // ── Global CSS ─────────────────────────────────────────────────────────────
  const css=`
    *{box-sizing:border-box;margin:0;padding:0;}
    ::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-thumb{background:${T.scrollThumb};border-radius:3px;}
    input,select,textarea{font-family:inherit;}button{cursor:pointer;font-family:inherit;}
    .fi{animation:fi .25s ease;}@keyframes fi{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
    .card{background:${T.card};border:1px solid ${T.border};border-radius:12px;padding:18px;transition:background .25s,border .25s;}
    .bp{background:${T.accent};color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;transition:all .2s;}.bp:hover{filter:brightness(1.1);}
    .bg2{background:transparent;color:${T.muted};border:1px solid ${T.border2};border-radius:8px;padding:7px 13px;font-size:12px;transition:all .2s;}.bg2:hover{border-color:${T.accent};color:${T.text};}
    .tag{display:inline-block;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;}
    .ifield{background:${T.inputBg};border:1px solid ${T.border2};border-radius:8px;padding:8px 12px;color:${T.text};font-size:13px;width:100%;outline:none;transition:border-color .2s;}.ifield:focus{border-color:${T.accent};}
    .mo{position:fixed;inset:0;background:${T.overlay};display:flex;align-items:center;justify-content:center;z-index:200;}
    .md{background:${T.card};border:1px solid ${T.border2};border-radius:16px;padding:24px;width:min(93vw,480px);max-height:90vh;overflow-y:auto;}
    .nb{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:8px;border:1px solid transparent;font-size:13px;text-align:left;transition:all .2s;width:100%;background:transparent;}.nb:hover{background:${T.hoverBg};}
    .flip-card{perspective:800px;width:100%;height:195px;cursor:pointer;}
    .flip-inner{position:relative;width:100%;height:100%;transition:transform .5s;transform-style:preserve-3d;}
    .flip-inner.flipped{transform:rotateY(180deg);}
    .flip-face{position:absolute;inset:0;backface-visibility:hidden;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center;}
    .flip-back{transform:rotateY(180deg);}
    @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
    .prog-bar{background:${T.border};border-radius:4px;height:5px;overflow:hidden;}
    .prog-fill{height:100%;border-radius:4px;transition:width .4s;}
    .del-btn{background:transparent;border:1px solid ${T.border2};border-radius:6px;padding:3px 8px;font-size:11px;color:${T.danger};cursor:pointer;transition:all .2s;}.del-btn:hover{background:rgba(239,68,68,.08);border-color:${T.danger};}
    @media(max-width:768px){
      aside{position:fixed!important;top:0;left:0;bottom:0;z-index:100;box-shadow:4px 0 20px rgba(0,0,0,.3);}
      main{padding:14px 16px!important;}
    }
    .stat-card:hover{transform:translateY(-2px);box-shadow:0 4px 16px rgba(${accentRgb},.2);cursor:pointer;}
    .stat-card{transition:transform .2s,box-shadow .2s;}
  `;

  // ── Auth / onboarding gates ─────────────────────────────────────────────────
  if(authLoading)return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0f0f13",fontFamily:"Georgia,serif"}}>
      <div style={{textAlign:"center"}}><div style={{fontSize:40,marginBottom:16}}>🎓</div><div style={{color:"#7a7590",fontSize:14}}>Loading ProPlanner...</div></div>
    </div>
  );

  if(!authUser)return(
    <AuthScreen onAuth={u=>{
      setAuthUser(u);
      supabase.from("profiles").select("*").eq("id",u.id).single().then(({data})=>{
        if(data)setProfile(data);
        else setProfile({id:u.id,onboarding_complete:false});
      });
    }}/>
  );

  if(!profile||!profile.onboarding_complete)return(
    <Onboarding user={authUser} onComplete={p=>{setProfile(p);loadAllData();}}/>
  );

  // ─── MAIN APP RENDER ───────────────────────────────────────────────────────
  return(
    <div style={{fontFamily:"'Georgia','Times New Roman',serif",height:"100vh",display:"flex",flexDirection:"column",background:T.bg,color:T.text,transition:"background .25s,color .25s"}}>
      <style>{css}</style>

      {/* Toast notification */}
      {notification&&<div style={{position:"fixed",top:16,right:16,background:T.success,color:"#fff",padding:"10px 18px",borderRadius:10,zIndex:999,fontSize:13,boxShadow:`0 4px 20px rgba(${hexToRgb(T.success)},.4)`,animation:"fi .3s ease"}}>{notification}</div>}

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>

        {/* ═══ SIDEBAR ═══ */}
        {/* Mobile overlay */}
        {sidebarOpen&&<div onClick={()=>setSidebar(false)} style={{display:"none","@media(max-width:768px)":{display:"block"},position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:99}}/>}
        <aside style={{width:sidebarOpen?226:58,background:T.sidebar,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden",transition:"width .25s ease",position:"relative",zIndex:100}}>
          <div style={{padding:"14px 9px 12px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:sidebarOpen?"space-between":"center",background:`linear-gradient(135deg,rgba(${rgb},.12),rgba(${rgb},.04))`}}>
            {sidebarOpen&&<div style={{overflow:"hidden",marginRight:5}}>
              <div style={{fontSize:9,letterSpacing:3,color:T.accent,textTransform:"uppercase",fontWeight:700,whiteSpace:"nowrap"}}>{uni.abbr} · {profile.full_name?.split(" ")[0]}</div>
              <div style={{fontSize:17,fontWeight:700,color:T.text,whiteSpace:"nowrap"}}>{uni.logo} ProPlanner</div>
            </div>}
            <button onClick={()=>setSidebar(o=>!o)} style={{background:"transparent",border:`1px solid ${T.border2}`,borderRadius:7,width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",color:T.muted,fontSize:11,flexShrink:0}}>{sidebarOpen?"←":"→"}</button>
          </div>
          <nav style={{flex:1,padding:"9px 6px",display:"flex",flexDirection:"column",gap:2,overflowY:"auto"}}>
            {NAV.map(item=>{
              const badge=item.id==="assignments"?overdue.length:item.id==="calendar"&&todayStudy.length>0?todayStudy.length:0;
              return(
              <button key={item.id} onClick={()=>setView(item.id)} title={item.label} className="nb" style={{background:view===item.id?`rgba(${rgb},.12)`:"transparent",border:`1px solid ${view===item.id?T.accent:"transparent"}`,color:view===item.id?T.accent:T.muted,justifyContent:sidebarOpen?"flex-start":"center",position:"relative"}}>
                <span style={{fontSize:16,flexShrink:0}}>{item.icon}</span>
                {sidebarOpen&&<span style={{whiteSpace:"nowrap",overflow:"hidden",flex:1}}>{item.label}</span>}
                {badge>0&&<span style={{background:T.danger,color:"#fff",borderRadius:10,fontSize:9,fontWeight:700,padding:"1px 5px",minWidth:16,textAlign:"center",flexShrink:0}}>{badge}</span>}
              </button>
              );
            })}
          </nav>
          {overdue.length>0&&<div style={{margin:"0 6px 6px",background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",borderRadius:8,padding:"7px 8px",overflow:"hidden"}}>
            <div style={{fontSize:10,color:T.danger,fontWeight:700,whiteSpace:"nowrap"}}>⚠ {sidebarOpen?"OVERDUE":overdue.length}</div>
            {sidebarOpen&&<div style={{fontSize:11,color:T.danger,opacity:.8}}>{overdue.length} item{overdue.length>1?"s":""}</div>}
          </div>}
          {nextMilestone&&sidebarOpen&&<div style={{margin:"0 6px 6px",background:`rgba(${rgb},.08)`,border:`1px solid rgba(${rgb},.2)`,borderRadius:8,padding:"7px 9px"}}>
            <div style={{fontSize:9,color:T.accent,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Next Milestone</div>
            <div style={{fontSize:11,fontWeight:600,marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{nextMilestone.title}</div>
            <div style={{fontSize:10,color:T.muted}}>{daysUntil(nextMilestone.due)}d away</div>
          </div>}
          <div style={{padding:"8px 6px",borderTop:`1px solid ${T.border}`,display:"flex",flexDirection:"column",gap:4}}>
            <button onClick={async()=>{const nd=!dark;setDark(nd);await supabase.from("profiles").update({dark_mode:nd}).eq("id",authUser.id);}} className="nb" style={{justifyContent:sidebarOpen?"flex-start":"center",color:T.muted,border:`1px solid ${T.border2}`,borderRadius:8,padding:"6px 9px"}}>
              <span style={{fontSize:14}}>{dark?"☀️":"🌙"}</span>
              {sidebarOpen&&<span style={{fontSize:12,whiteSpace:"nowrap"}}>{dark?"Light Mode":"Dark Mode"}</span>}
            </button>
            <button onClick={()=>setChatOpen(o=>!o)} className="nb" style={{justifyContent:sidebarOpen?"flex-start":"center",background:chatOpen?`rgba(${rgb},.12)`:"transparent",border:`1px solid ${chatOpen?T.accent:T.border2}`,borderRadius:8,padding:"6px 9px",color:chatOpen?T.accent:T.muted}}>
              <span style={{fontSize:14}}>🤖</span>
              {sidebarOpen&&<span style={{fontSize:12,whiteSpace:"nowrap"}}>AI Assistant</span>}
            </button>
            <button onClick={async()=>{await supabase.auth.signOut();setAuthUser(null);setProfile(null);setCourses([]);setAssignments([]);setMilestones([]);setScheduleBlocks([]);setTravelDates([]);setEnergyLog([]);}} className="nb" style={{justifyContent:sidebarOpen?"flex-start":"center",color:T.faint,borderRadius:8,padding:"6px 9px"}}>
              <span style={{fontSize:14}}>↩</span>
              {sidebarOpen&&<span style={{fontSize:12,whiteSpace:"nowrap"}}>Sign Out</span>}
            </button>
          </div>
        </aside>

        {/* ═══ MAIN CONTENT ═══ */}
        <main style={{flex:1,overflowY:"auto",padding:"22px 26px",minWidth:0}}>

          {/* ── DASHBOARD ── */}
          {view==="dashboard"&&(
            <div className="fi">
              <div style={{marginBottom:16,paddingBottom:14,borderBottom:`2px solid rgba(${rgb},.18)`}}>
                <div style={{fontSize:10,letterSpacing:3,color:T.accent,textTransform:"uppercase"}}>Welcome back, {profile.full_name?.split(" ")[0]}</div>
                <h1 style={{fontSize:25,fontWeight:700,marginTop:3}}>Your Academic Dashboard</h1>
                <div style={{color:T.muted,fontSize:12,marginTop:3}}>{MONTHS[t.month]} {t.day}, {t.year} · {uni.name} · {DEGREE_LEVELS.find(d=>d.id===profile.degree_level)?.label}</div>
                <div style={{display:"flex",gap:7,marginTop:7,flexWrap:"wrap"}}>
                  {profile.is_athlete&&profile.sports?.map(s=><span key={s} style={{fontSize:10,padding:"2px 8px",borderRadius:12,background:`rgba(${rgb},.1)`,color:T.accent,border:`1px solid rgba(${rgb},.25)`}}>🏅 {s}</span>)}
                  {profile.is_greek&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:12,background:`rgba(${rgb},.1)`,color:T.accent,border:`1px solid rgba(${rgb},.25)`}}>🏛 {profile.greek_org}</span>}
                  {profile.is_working_professional&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:12,background:`rgba(${rgb},.1)`,color:T.accent,border:`1px solid rgba(${rgb},.25)`}}>💼 Working Professional</span>}
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:10,marginBottom:14}}>
                {[{l:"Courses",v:courses.length,c:T.accent,nav:"courses"},{l:"Pending",v:assignments.filter(a=>!a.done).length,c:T.warning,nav:"assignments"},{l:"Study Hrs/Wk",v:studyBlocks.filter(b=>{const d=new Date(b.date),n=new Date();return d>=n&&(d-n)<7*86400000;}).length*2,c:"#0ea5e9",nav:"calendar"},{l:"Milestones",v:milestones.filter(m=>!m.done).length,c:"#a78bfa",nav:"dissertation"},{l:"Done",v:assignments.filter(a=>a.done).length,c:T.success,nav:"assignments"}].map(s=>(
                  <div key={s.l} className="card stat-card" onClick={()=>setView(s.nav)} title={`Go to ${s.nav}`} style={{textAlign:"center",borderTop:`2px solid ${s.c}`}}>
                    <div style={{fontSize:26,fontWeight:700,color:s.c}}>{s.v}</div>
                    <div style={{fontSize:9,color:T.muted,marginTop:2,letterSpacing:1,textTransform:"uppercase"}}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                <div className="card">
                  <div style={{fontSize:10,letterSpacing:2,color:T.accent,textTransform:"uppercase",marginBottom:9}}>Upcoming Deadlines</div>
                  {upcoming.length===0&&<div style={{color:T.faint,fontSize:13}}>All caught up! 🎉</div>}
                  {upcoming.map(a=>{const course=courses.find(c=>c.id===a.courseId);const days=daysUntil(a.due);return(
                    <div key={a.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:`1px solid ${T.border}`}}>
                      <div style={{width:3,height:26,borderRadius:2,background:course?.color||T.accent,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.title}</div>
                        <div style={{fontSize:10,color:T.muted}}>{course?.name?.split("–")[0].trim()}</div>
                      </div>
                      <div style={{fontSize:11,fontWeight:700,color:urgencyColor(days,T),flexShrink:0}}>{days<0?"Overdue":days===0?"Today!":`${days}d`}</div>
                    </div>
                  );})}
                </div>
                <div className="card">
                  <div style={{fontSize:10,letterSpacing:2,color:"#0ea5e9",textTransform:"uppercase",marginBottom:9}}>Today</div>
                  {todayStudy.length===0&&<div style={{color:T.faint,fontSize:12,marginBottom:8}}>No study sessions today.</div>}
                  {todayStudy.slice(0,3).map(b=>(
                    <div key={b.id} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 0",borderBottom:`1px solid ${T.border}`}}>
                      <div style={{width:24,height:24,borderRadius:6,background:b.color+"33",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>📚</div>
                      <div><div style={{fontSize:12,fontWeight:600}}>{b.title}</div><div style={{fontSize:10,color:T.muted}}>{b.slot}</div></div>
                    </div>
                  ))}
                  <div style={{marginTop:9,padding:9,background:T.subcard,borderRadius:8,border:`1px solid ${T.border2}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:6}}>
                      <div style={{fontSize:10,color:T.muted,letterSpacing:1,textTransform:"uppercase"}}>Today's Energy Level</div>
                      <span title="Log your energy daily. The AI uses this to suggest better study times and adapt your schedule." style={{fontSize:11,color:T.faint,cursor:"help"}}>ⓘ</span>
                    </div>
                    <div style={{display:"flex",gap:5}}>
                      {[1,2,3,4,5].map(lvl=>{const cols=["#ef4444","#f97316","#eab308","#84cc16","#22c55e"];const emojis=["😴","😓","😐","😊","🚀"];const active=todayEnergy===lvl;return(
                        <button key={lvl} onClick={()=>logEnergy(lvl)} style={{width:30,height:30,borderRadius:"50%",border:`2px solid ${active?cols[lvl-1]:T.border2}`,background:active?cols[lvl-1]+"33":"transparent",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{emojis[lvl-1]}</button>
                      );})}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div className="card" style={{borderLeft:`3px solid ${T.accent}`}}>
                  <div style={{fontSize:10,letterSpacing:2,color:T.accent,textTransform:"uppercase",marginBottom:7}}>{["doctoral","postdoc"].includes(profile?.degree_level)?"Dissertation Progress":["graduate"].includes(profile?.degree_level)?"Thesis Progress":"Major Project Progress"}</div>
                  {nextMilestone?(<>
                    <div style={{fontWeight:600,fontSize:13,marginBottom:2}}>{nextMilestone.title}</div>
                    <div style={{fontSize:11,color:T.muted,marginBottom:6}}>{nextMilestone.notes}</div>
                    <div className="prog-bar"><div className="prog-fill" style={{width:`${Math.round(milestones.filter(m=>m.done).length/Math.max(milestones.length,1)*100)}%`,background:T.accent}}/></div>
                    <div style={{fontSize:11,color:T.muted,marginTop:4}}>{milestones.filter(m=>m.done).length}/{milestones.length} milestones · {daysUntil(nextMilestone.due)}d to next</div>
                  </>):<div style={{color:T.faint,fontSize:12}}>Add milestones in the Dissertation tab.</div>}
                </div>
                <div className="card">
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                    <div style={{fontSize:10,letterSpacing:2,color:T.caution,textTransform:"uppercase"}}>Travel & Blackouts</div>
                    <button className="bg2" style={{fontSize:11}} onClick={()=>setShowAddTravel(true)}>+ Add</button>
                  </div>
                  {travelDates.length===0&&<div style={{color:T.faint,fontSize:12}}>No travel blocked.</div>}
                  {travelDates.map(tr=>(
                    <div key={tr.id} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 0",borderBottom:`1px solid ${T.border}`}}>
                      <span style={{fontSize:11,color:T.caution,flex:1}}>✈ {tr.label||"Travel"} ({tr.start} → {tr.end})</span>
                      <button className="del-btn" onClick={()=>deleteTravel(tr.id)}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{marginTop:12,padding:12,background:T.subcard,border:`1px dashed ${T.border2}`,borderRadius:10,display:"flex",alignItems:"center",gap:11}}>
                <div style={{fontSize:20}}>📄</div>
                <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>Import Syllabus</div><div style={{fontSize:11,color:T.muted}}>Upload .txt or PDF — AI extracts all assignments automatically</div></div>
                <label style={{cursor:"pointer"}}><input type="file" accept=".txt,.pdf,.docx" onChange={handleSyllabusUpload} style={{display:"none"}}/><span className="bp" style={{fontSize:12,padding:"6px 13px",display:"inline-block"}}>{uploading?"Analyzing...":"Upload"}</span></label>
                {uploadMsg&&<div style={{fontSize:11,color:T.success}}>{uploadMsg}</div>}
              </div>
            </div>
          )}

          {/* ── CALENDAR ── */}
          {view==="calendar"&&(
            <div className="fi">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <div><div style={{fontSize:10,letterSpacing:3,color:T.accent,textTransform:"uppercase"}}>Calendar</div><h1 style={{fontSize:22,fontWeight:700}}>{MONTHS[calMonth]} {calYear}</h1></div>
                <div style={{display:"flex",gap:6}}><button className="bg2" onClick={prevMonth}>←</button><button className="bg2" onClick={()=>{setCalYear(t.year);setCalMonth(t.month);setSelectedDay(t.day);}}>Today</button><button className="bg2" onClick={nextMonth}>→</button></div>
              </div>
              <div style={{display:"flex",gap:12,marginBottom:9,fontSize:11,color:T.muted,flexWrap:"wrap"}}>
                <span><span style={{display:"inline-block",width:8,height:8,borderRadius:2,background:T.accent,marginRight:4}}/>Due</span>
                <span><span style={{display:"inline-block",width:8,height:8,borderRadius:2,background:"#0ea5e9",marginRight:4}}/>Study</span>
                <span><span style={{display:"inline-block",width:8,height:8,borderRadius:2,background:"#a78bfa",marginRight:4}}/>Milestone</span>
                <span><span style={{display:"inline-block",width:8,height:8,borderRadius:2,background:T.caution,marginRight:4}}/>Travel</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:3}}>
                {DAYS_SHORT.map(d=><div key={d} style={{textAlign:"center",fontSize:10,color:T.faint,letterSpacing:1,textTransform:"uppercase",padding:"2px 0"}}>{d}</div>)}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
                {calDays.map((day,i)=>{
                  if(!day)return<div key={i}/>;
                  const{asgn,study,travel,milestone,blocks}=getEventsForDay(calYear,calMonth,day);
                  const isToday=calYear===t.year&&calMonth===t.month&&day===t.day;
                  const isSel=selectedDay===day;
                  return(
                    <div key={i} onClick={()=>setSelectedDay(isSel?null:day)} style={{minHeight:60,padding:4,borderRadius:7,cursor:"pointer",background:travel?(dark?"#1a1510":"#fff8ee"):isSel?(dark?"#1e1e35":"#ebebff"):isToday?(dark?"#16162a":"#f0f0ff"):(dark?"#12121a":T.card),border:`1px solid ${isToday?T.accent:T.border}`,transition:"all .15s"}}>
                      <div style={{fontSize:11,fontWeight:isToday?700:400,color:isToday?T.accent:T.text,marginBottom:1}}>{day}{travel&&"✈"}{blocks.length>0&&"⊞"}</div>
                      {milestone&&<div style={{fontSize:9,padding:"1px 3px",borderRadius:3,background:"rgba(167,139,250,.2)",color:"#a78bfa",marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>⬟{milestone.title}</div>}
                      {asgn.map(a=><div key={a.id} style={{fontSize:9,padding:"1px 3px",borderRadius:3,background:`rgba(${hexToRgb(courses.find(c=>c.id===a.courseId)?.color||T.accent)},.2)`,color:courses.find(c=>c.id===a.courseId)?.color||T.accent,marginBottom:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📌{a.title}</div>)}
                      {study.slice(0,1).map(b=><div key={b.id} style={{fontSize:9,padding:"1px 3px",borderRadius:3,background:"rgba(14,165,233,.15)",color:"#38bdf8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📚{b.title.replace("Study: ","")}</div>)}
                    </div>
                  );
                })}
              </div>
              {selectedDay&&(()=>{
                const{asgn,study,travel,milestone,blocks}=getEventsForDay(calYear,calMonth,selectedDay);
                return(
                  <div className="card fi" style={{marginTop:10}}>
                    <div style={{fontWeight:700,marginBottom:7}}>{MONTHS[calMonth]} {selectedDay}, {calYear}</div>
                    {travel&&<div style={{marginBottom:6,fontSize:12,color:T.caution}}>✈ {travel.label} — traveling</div>}
                    {milestone&&<div style={{padding:"6px 9px",background:"rgba(167,139,250,.08)",borderRadius:7,marginBottom:6,border:"1px solid rgba(167,139,250,.2)"}}><div style={{fontWeight:600,color:"#a78bfa",fontSize:12}}>⬟ {milestone.title}</div><div style={{fontSize:10,color:T.muted}}>{milestone.notes}</div></div>}
                    {blocks.map(b=><div key={b.id} style={{fontSize:11,color:T.muted,marginBottom:3}}>⊞ {b.label} ({b.start_time}–{b.end_time})</div>)}
                    {asgn.length===0&&study.length===0&&!travel&&!milestone&&blocks.length===0&&<div style={{color:T.faint}}>Nothing scheduled.</div>}
                    {asgn.map(a=>{const c=courses.find(x=>x.id===a.courseId);return(<div key={a.id} style={{display:"flex",gap:8,padding:"5px 0",borderBottom:`1px solid ${T.border}`,alignItems:"center"}}><span style={{color:c?.color,fontSize:12}}>📌</span><div style={{flex:1}}><div style={{fontWeight:600,fontSize:12}}>{a.title}</div><div style={{fontSize:10,color:T.muted}}>{c?.name}</div></div></div>);})}
                    {study.map(b=>(<div key={b.id} style={{display:"flex",gap:8,padding:"5px 0",borderBottom:`1px solid ${T.border}`}}><span style={{fontSize:12}}>📚</span><div><div style={{fontWeight:600,fontSize:12}}>{b.title}</div><div style={{fontSize:10,color:T.muted}}>{b.slot}</div></div></div>))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── ASSIGNMENTS ── */}
          {view==="assignments"&&(
            <div className="fi">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:13}}>
                <div><div style={{fontSize:10,letterSpacing:3,color:T.accent,textTransform:"uppercase"}}>Assignments</div><h1 style={{fontSize:22,fontWeight:700}}>All Assignments</h1></div>
                <div style={{display:"flex",gap:7}}>
                  <label style={{cursor:"pointer"}}><input type="file" accept=".txt,.pdf,.docx" onChange={handleSyllabusUpload} style={{display:"none"}}/><span className="bg2" style={{display:"inline-block"}}>📄 Upload Syllabus</span></label>
                  <button className="bp" onClick={()=>setShowAddAssign(true)}>+ Add</button>
                </div>
              </div>
              {courses.length===0&&(
                <div style={{textAlign:"center",padding:"40px 20px",color:T.muted}}>
                  <div style={{fontSize:48,marginBottom:14}}>📚</div>
                  <div style={{fontWeight:700,fontSize:16,marginBottom:8,color:T.text}}>No assignments yet</div>
                  <div style={{fontSize:13,marginBottom:20,lineHeight:1.6}}>Upload a syllabus and ProPlanner will automatically extract all your assignments, due dates, and topics.</div>
                  <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
                    <label style={{cursor:"pointer"}}><input type="file" accept=".txt,.pdf,.docx" onChange={handleSyllabusUpload} style={{display:"none"}}/><span className="bp" style={{display:"inline-block",padding:"9px 18px"}}>📄 Upload Syllabus</span></label>
                    <button className="bg2" onClick={()=>setShowAddCourse(true)}>+ Add Course Manually</button>
                  </div>
                </div>
              )}
              {courses.map(course=>{
                const ca=assignments.filter(a=>a.courseId===course.id);if(!ca.length)return null;
                return(<div key={course.id} style={{marginBottom:16}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7}}>
                    <div style={{width:10,height:10,borderRadius:3,background:course.color}}/>
                    <div style={{fontWeight:700,fontSize:13}}>{course.name}</div>
                    {course.rmpData&&<span style={{fontSize:10,color:T.caution}}>⭐{course.rmpData.avgRating?.toFixed(1)} 🔥{course.rmpData.avgDifficulty?.toFixed(1)}</span>}
                  </div>
                  {ca.sort((a,b)=>new Date(a.due)-new Date(b.due)).map(a=>{
                    const days=daysUntil(a.due);const sh=studyBlocks.filter(b=>b.assignId===a.id).length*2;const hasCards=a.flashcards?.length>0;
                    return(<div key={a.id} style={{display:"flex",alignItems:"center",gap:9,padding:"9px 11px",background:dark?"#12121a":T.card,border:`1px solid ${T.border}`,borderRadius:8,marginBottom:4,opacity:a.done?0.5:1,transition:"opacity .2s"}}>
                      <input type="checkbox" checked={a.done} onChange={()=>toggleDone(a.id)} style={{width:15,height:15,accentColor:course.color,cursor:"pointer"}}/>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,textDecoration:a.done?"line-through":"none",fontSize:13}}>{a.title}</div>
                        <div style={{fontSize:10,color:T.muted,marginTop:2}}>
                          <span className="tag" style={{background:course.color+"22",color:course.color,marginRight:6}}>{a.type}</span>
                          Est. {a.estHours}h · {sh}h study
                          {hasCards&&<span style={{marginLeft:7,color:"#a78bfa"}}>⬡ {a.flashcards.length} cards</span>}
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:5}}>
                        <button onClick={()=>{setShowFlashModal(a.id);setView("flashcards");}} style={{background:"transparent",border:`1px solid ${hasCards?"#a78bfa":T.border2}`,borderRadius:6,padding:"3px 7px",fontSize:11,color:hasCards?"#a78bfa":T.muted}}>{hasCards?"⬡ Cards":"⬡ Gen"}</button>
                        <button className="del-btn" onClick={()=>deleteAssignment(a.id)}>🗑</button>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:11,fontWeight:700,color:a.done?T.faint:urgencyColor(days,T)}}>{a.done?"Done":days<0?"Overdue":days===0?"Today!":`${days}d`}</div>
                          <div style={{fontSize:10,color:T.faint}}>{a.due}</div>
                        </div>
                      </div>
                    </div>);
                  })}
                </div>);
              })}
            </div>
          )}

          {/* ── COURSES ── */}
          {view==="courses"&&(
            <div className="fi">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:13}}>
                <div><div style={{fontSize:10,letterSpacing:3,color:T.accent,textTransform:"uppercase"}}>Enrolled</div><h1 style={{fontSize:22,fontWeight:700}}>Courses</h1></div>
                <button className="bp" onClick={()=>setShowAddCourse(true)}>+ Add Course</button>
              </div>
              {courses.length===0&&<div style={{color:T.faint,fontSize:13,padding:"20px",textAlign:"center"}}>No courses yet. Click Add Course or upload a syllabus to get started.</div>}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:12}}>
                {courses.map(c=>{
                  const total=assignments.filter(a=>a.courseId===c.id).length;
                  const done=assignments.filter(a=>a.courseId===c.id&&a.done).length;
                  const pct=total>0?Math.round(done/total*100):0;
                  const next=assignments.filter(a=>a.courseId===c.id&&!a.done).sort((a,b)=>new Date(a.due)-new Date(b.due))[0];
                  const rmp=c.rmpData;
                  return(<div key={c.id} className="card" style={{borderTop:`3px solid ${c.color}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:5}}>
                      <div style={{fontWeight:700,fontSize:14,flex:1,paddingRight:8}}>{c.name}</div>
                      <button className="del-btn" onClick={()=>deleteCourse(c.id)}>Drop 🗑</button>
                    </div>
                    {c.professor&&<div style={{fontSize:11,color:T.muted,marginBottom:8}}>👤 {c.professor}</div>}
                    {rmp?(
                      <div style={{background:T.subcard,borderRadius:8,padding:"8px 10px",marginBottom:8,border:`1px solid ${T.border2}`}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                          <div style={{fontSize:12,fontWeight:600}}>{rmp.firstName} {rmp.lastName}</div>
                          <a href={`https://www.ratemyprofessors.com/professor/${rmp.id}`} target="_blank" rel="noreferrer" style={{fontSize:10,color:T.accent,textDecoration:"none"}}>RMP →</a>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4,textAlign:"center"}}>
                          {[{label:"Rating",val:rmp.avgRating?.toFixed(1),color:rmp.avgRating>=4?T.success:rmp.avgRating>=3?T.caution:T.danger},{label:"Difficulty",val:rmp.avgDifficulty?.toFixed(1),color:rmp.avgDifficulty>=4?T.danger:rmp.avgDifficulty>=3?T.caution:T.success},{label:"Again%",val:Math.round(rmp.wouldTakeAgainPercent||0)+"%",color:T.success}].map(x=>(
                            <div key={x.label} style={{background:T.card,borderRadius:6,padding:"4px"}}><div style={{fontSize:13,fontWeight:700,color:x.color}}>{x.val}</div><div style={{fontSize:9,color:T.muted}}>{x.label}</div></div>
                          ))}
                        </div>
                        <div style={{fontSize:10,color:"#a78bfa",marginTop:5,textAlign:"center"}}>📊 Blended into study schedule</div>
                      </div>
                    ):(
                      <div style={{marginBottom:8}}>
                        <div style={{display:"flex",gap:5,marginBottom:5}}>
                          <input className="ifield" placeholder="Professor name..." value={c.professor||""} onChange={e=>setCourses(p=>p.map(x=>x.id===c.id?{...x,professor:e.target.value}:x))} style={{flex:1,fontSize:11,padding:"5px 8px"}}/>
                          <button className="bg2" style={{fontSize:11,whiteSpace:"nowrap"}} onClick={()=>handleRmpSearch(c.id,c.professor||"")}>{rmpSearching[c.id]?"...":"Search RMP"}</button>
                        </div>
                        <button className="bg2" style={{width:"100%",fontSize:11}} onClick={()=>window.open(`https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent((c.professor||c.name)+" "+uni.abbr)}`,"_blank")}>🔗 Open RateMyProfessors.com</button>
                        {rmpResults[c.id]&&rmpResults[c.id]!=="notfound"&&rmpResults[c.id].length>0&&(
                          <div style={{marginTop:5,display:"flex",flexDirection:"column",gap:4}}>
                            {rmpResults[c.id].map(prof=>(
                              <div key={prof.id} onClick={()=>applyRmp(c.id,prof)} style={{padding:"6px 9px",background:T.card,border:`1px solid ${T.border2}`,borderRadius:7,cursor:"pointer",transition:"border-color .2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.accent} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border2}>
                                <div style={{fontSize:12,fontWeight:600}}>{prof.firstName} {prof.lastName}</div>
                                <div style={{fontSize:10,color:T.muted}}>⭐{prof.avgRating?.toFixed(1)} 🔥{prof.avgDifficulty?.toFixed(1)} · {prof.numRatings} ratings</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {rmpResults[c.id]==="notfound"&&<div style={{marginTop:4,fontSize:11,color:T.warning,padding:"4px 8px",background:"rgba(245,158,11,.08)",borderRadius:6}}>Search blocked by browser security. Use the direct link above to find your professor, then manually enter their difficulty rating below.</div>}
                      </div>
                    )}
                    <div className="prog-bar" style={{marginBottom:5}}><div className="prog-fill" style={{width:`${pct}%`,background:c.color}}/></div>
                    <div style={{fontSize:10,color:T.muted,marginBottom:next?7:0}}>{done}/{total} complete · {"★".repeat(c.difficulty)}{"☆".repeat(5-c.difficulty)}</div>
                    {next&&<div style={{fontSize:11,padding:"5px 8px",background:T.subcard,borderRadius:6}}>Next: <span style={{color:c.color,fontWeight:600}}>{next.title}</span> · {daysUntil(next.due)}d</div>}
                  </div>);
                })}
              </div>
            </div>
          )}

          {/* ── MY SCHEDULE ── */}
          {view==="schedule"&&(
            <div className="fi">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:13}}>
                <div><div style={{fontSize:10,letterSpacing:3,color:T.accent,textTransform:"uppercase"}}>Time Blocks</div><h1 style={{fontSize:22,fontWeight:700}}>My Schedule</h1></div>
                <button className="bp" onClick={()=>setShowAddBlock(true)}>+ Add Block</button>
              </div>
              <div style={{fontSize:12,color:T.muted,marginBottom:12,padding:"10px 14px",background:T.subcard,borderRadius:9,border:`1px solid ${T.border2}`}}>
                These blocks tell ProPlanner when you are <strong>NOT</strong> available to study — practices, games, chapter meetings, work, etc. Study sessions are automatically placed around them.
              </div>

              {/* Work schedule — only shown for working professionals */}
              {profile.is_working_professional&&(
                <div className="card" style={{marginBottom:12}}>
                  <div style={{fontWeight:700,marginBottom:4}}>💼 Work Schedule</div>
                  <div style={{fontSize:12,color:T.muted,marginBottom:10}}>Toggle each day independently and set your exact work hours.</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5}}>
                    {DAYS_SHORT.map(day=>{const s=workSched[day];return(
                      <div key={day} style={{display:"flex",flexDirection:"column",gap:4,padding:"8px 5px",background:T.subcard,borderRadius:7,border:`1px solid ${s.work?T.accent:T.border2}`,transition:"border-color .2s"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <span style={{fontSize:10,fontWeight:700,color:s.work?T.accent:T.faint}}>{day}</span>
                          <button onClick={()=>setWorkSched(p=>({...p,[day]:{...p[day],work:!p[day].work}}))} style={{width:24,height:13,borderRadius:20,background:s.work?T.accent:T.border2,border:"none",position:"relative",cursor:"pointer",transition:"background .2s"}}>
                            <div style={{position:"absolute",top:1,left:s.work?11:1,width:11,height:11,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                          </button>
                        </div>
                        {s.work&&(<>
                          <input type="time" className="ifield" value={s.start} onChange={e=>setWorkSched(p=>({...p,[day]:{...p[day],start:e.target.value}}))} style={{fontSize:9,padding:"2px 4px",textAlign:"center"}}/>
                          <input type="time" className="ifield" value={s.end} onChange={e=>setWorkSched(p=>({...p,[day]:{...p[day],end:e.target.value}}))} style={{fontSize:9,padding:"2px 4px",textAlign:"center"}}/>
                        </>)}
                        {!s.work&&<div style={{fontSize:9,color:T.faint,textAlign:"center"}}>Free</div>}
                      </div>
                    );})}
                  </div>
                  <button className="bp" style={{marginTop:11,fontSize:12}} onClick={()=>{generateStudyBlocks();notify("Work schedule saved — study blocks recalculated!");}}>Save & Recalculate</button>
                </div>
              )}

              {/* Activity blocks — practice, greek, etc */}
              <div className="card" style={{marginBottom:12}}>
                <div style={{fontWeight:700,marginBottom:10}}>Activity Blocks</div>
                {scheduleBlocks.length===0&&<div style={{color:T.faint,fontSize:12,marginBottom:10}}>No activity blocks yet. Click Add Block to add practices, meetings, or events.</div>}
                {[
                  {type:"sport",icon:"🏅",label:"Sports / Practice / Games"},
                  {type:"greek",icon:"🏛",label:"Greek Life / Philanthropy"},
                  {type:"work",icon:"💼",label:"Work Events"},
                  {type:"other",icon:"📌",label:"Other Commitments"},
                ].map(cat=>{
                  const catBlocks=scheduleBlocks.filter(b=>b.block_type===cat.type);
                  if(!catBlocks.length)return null;
                  return(<div key={cat.type} style={{marginBottom:12}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:6}}>{cat.icon} {cat.label}</div>
                    {catBlocks.map(b=>(
                      <div key={b.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:dark?"#12121a":T.card,border:`1px solid ${T.border}`,borderRadius:8,marginBottom:4}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:12,fontWeight:600}}>{b.label}</div>
                          <div style={{fontSize:10,color:T.muted}}>{b.date_specific?`Date: ${b.date_specific}`:`Every ${b.day_of_week}`} · {b.start_time}–{b.end_time}</div>
                        </div>
                        <button className="del-btn" onClick={()=>deleteScheduleBlock(b.id)}>🗑</button>
                      </div>
                    ))}
                  </div>);
                })}
                <button className="bg2" style={{fontSize:11}} onClick={()=>setShowAddBlock(true)}>+ Add Activity Block</button>
              </div>

              {/* Travel / blackout dates */}
              <div className="card">
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9}}>
                  <div style={{fontWeight:700}}>✈ Travel & Blackout Dates</div>
                  <button className="bg2" style={{fontSize:11}} onClick={()=>setShowAddTravel(true)}>+ Add</button>
                </div>
                <div style={{fontSize:12,color:T.muted,marginBottom:9}}>Study sessions will not be scheduled on these dates.</div>
                {travelDates.length===0&&<div style={{color:T.faint,fontSize:12}}>No travel dates blocked.</div>}
                {travelDates.map(tr=>(
                  <div key={tr.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:`1px solid ${T.border}`}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:600}}>{tr.label||"Travel"}</div>
                      <div style={{fontSize:10,color:T.muted}}>{tr.start} → {tr.end}</div>
                    </div>
                    <button className="del-btn" onClick={()=>deleteTravel(tr.id)}>🗑</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── DISSERTATION ── */}
          {view==="dissertation"&&(
            <div className="fi">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:13}}>
                <div><div style={{fontSize:10,letterSpacing:3,color:T.accent,textTransform:"uppercase"}}>{["doctoral","postdoc"].includes(profile?.degree_level)?"Doctoral Journey":"Academic Journey"}</div><h1 style={{fontSize:22,fontWeight:700}}>{["doctoral","postdoc"].includes(profile?.degree_level)?"Dissertation Tracker":["graduate"].includes(profile?.degree_level)?"Thesis & Capstone Tracker":"Major Project Tracker"}</h1></div>
                <div style={{display:"flex",gap:7}}>
                  <button className="bg2" style={{fontSize:11}} onClick={()=>setShowReflection(r=>!r)}>📝 Weekly Reflection</button>
                  <button className="bp" onClick={()=>setShowAddMilestone(true)}>+ Milestone</button>
                </div>
              </div>
              <div className="card" style={{marginBottom:12,borderLeft:`3px solid ${T.accent}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontWeight:700}}>Overall Progress</div>
                  <div style={{fontSize:12,color:T.accent,fontWeight:600}}>{milestones.filter(m=>m.done).length}/{milestones.length} milestones</div>
                </div>
                <div className="prog-bar" style={{height:7,marginBottom:8}}><div className="prog-fill" style={{width:`${Math.round(milestones.filter(m=>m.done).length/Math.max(milestones.length,1)*100)}%`,background:T.accent}}/></div>
                <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                  {milestones.map((m,idx)=><div key={m.id} style={{display:"flex",alignItems:"center",gap:3,fontSize:11,color:m.done?T.success:idx===milestones.filter(x=>x.done).length?T.accent:T.faint}}><span>{m.done?"✓":idx===milestones.filter(x=>x.done).length?"→":"○"}</span><span>{m.title}</span></div>)}
                </div>
              </div>
              <div className="card">
                {milestones.length===0&&<div style={{color:T.faint,fontSize:13,textAlign:"center",padding:20}}>No milestones yet. Click + Milestone to build your doctoral timeline.</div>}
                {milestones.sort((a,b)=>new Date(a.due)-new Date(b.due)).map((m,idx)=>{
                  const days=daysUntil(m.due);const isNext=!m.done&&milestones.filter(x=>!x.done)[0]?.id===m.id;
                  return(<div key={m.id} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"9px 0",borderBottom:`1px solid ${T.border}`,opacity:m.done?0.6:1}}>
                    <div onClick={()=>toggleMilestoneDone(m.id)} style={{width:19,height:19,borderRadius:"50%",border:`2px solid ${m.done?T.success:isNext?T.accent:T.border2}`,background:m.done?T.success:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:10,color:"#fff",flexShrink:0,marginTop:1,transition:"all .2s"}}>{m.done?"✓":""}</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:13,textDecoration:m.done?"line-through":"none"}}>{m.title}</div>
                      {m.notes&&<div style={{fontSize:11,color:T.muted,marginTop:2}}>{m.notes}</div>}
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:11,fontWeight:700,color:m.done?T.success:urgencyColor(days,T)}}>{m.done?"Complete":days<0?"Overdue":days<=30?`${days}d`:`${Math.round(days/30)}mo`}</div>
                      {isNext&&<div style={{fontSize:9,color:T.accent,marginTop:1}}>← NEXT</div>}
                    </div>
                  </div>);
                })}
              </div>
              {showReflection&&(
                <div className="card fi" style={{marginTop:12,border:`1px solid rgba(${rgb},.25)`}}>
                  <div style={{fontWeight:700,marginBottom:8}}>📝 Weekly Reflection</div>
                  <div style={{fontSize:12,color:T.muted,marginBottom:10}}>Reflecting weekly improves doctoral outcomes. What did you accomplish? What is blocking you? What will you focus on next week?</div>
                  <textarea className="ifield" rows={4} placeholder="This week I made progress on... A challenge I am facing is... Next week I will focus on..." value={weeklyReflection} onChange={e=>setWeeklyReflection(e.target.value)} style={{resize:"vertical",fontSize:12,marginBottom:10}}/>
                  <div style={{display:"flex",gap:8}}>
                    <button className="bp" style={{fontSize:12}} onClick={async()=>{
                      try{
                        const r=await callClaudeChat([{role:"user",content:`As a doctoral advisor, give brief encouraging feedback on this weekly reflection from a DBA student:\n\n${weeklyReflection}`}]);
                        setChatMessages(p=>[...p,{role:"assistant",content:`📝 Reflection Feedback:\n\n${r}`}]);
                        setChatOpen(true);notify("Feedback ready in AI chat!");
                      }catch{notify("Could not generate feedback.");}
                    }}>Get AI Feedback</button>
                    <button className="bg2" style={{fontSize:12}} onClick={()=>setShowReflection(false)}>Close</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── FLASHCARDS ── */}
          {view==="flashcards"&&(
            <div className="fi">
              <div style={{marginBottom:13}}><div style={{fontSize:10,letterSpacing:3,color:"#a78bfa",textTransform:"uppercase"}}>Study Tools</div><h1 style={{fontSize:22,fontWeight:700}}>Flashcards</h1></div>
              {!showFlashModal&&(
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))",gap:11}}>
                  {assignments.filter(a=>!a.done).length===0&&(
                    <div style={{gridColumn:"1/-1",textAlign:"center",padding:"40px 20px",color:T.muted}}>
                      <div style={{fontSize:48,marginBottom:14}}>⬡</div>
                      <div style={{fontWeight:700,fontSize:16,marginBottom:8,color:T.text}}>No flashcard sets yet</div>
                      <div style={{fontSize:13,marginBottom:20,lineHeight:1.6,maxWidth:360,margin:"0 auto 20px"}}>Flashcards are generated from your assignments. Add courses and assignments first, then come back here to create AI-powered study cards for each one.</div>
                      <button className="bp" onClick={()=>setView("assignments")}>Go to Assignments →</button>
                    </div>
                  )}
                  {assignments.filter(a=>!a.done).map(a=>{
                    const course=courses.find(c=>c.id===a.courseId);const hasCards=a.flashcards?.length>0;const mastered=a.flashcards?.filter(c=>c.mastered).length||0;
                    return(<div key={a.id} onClick={()=>{setShowFlashModal(a.id);setStudyMode(hasCards);setActiveCard(0);setCardFlipped(false);}} style={{padding:"12px",background:dark?"#12121a":T.card,border:`2px solid ${T.border}`,borderRadius:10,cursor:"pointer",transition:"all .2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor="#a78bfa"} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
                      <div style={{display:"flex",gap:5,marginBottom:5,alignItems:"center"}}>
                        <div style={{width:7,height:7,borderRadius:2,background:course?.color||T.accent}}/>
                        <span className="tag" style={{background:(course?.color||T.accent)+"22",color:course?.color||T.accent}}>{a.type}</span>
                      </div>
                      <div style={{fontWeight:600,fontSize:12,marginBottom:2}}>{a.title}</div>
                      <div style={{fontSize:10,color:T.muted,marginBottom:7}}>{course?.name?.split("–")[0].trim()}</div>
                      {hasCards?<div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:11,color:"#a78bfa"}}>⬡ {a.flashcards.length}</span><div className="prog-bar" style={{flex:1}}><div className="prog-fill" style={{width:`${Math.round(mastered/a.flashcards.length*100)}%`,background:T.success}}/></div><span style={{fontSize:10,color:T.success}}>{mastered}/{a.flashcards.length}</span></div>
                      :<div style={{fontSize:10,color:T.faint}}>Click to generate →</div>}
                    </div>);
                  })}
                </div>
              )}
              {showFlashModal&&(()=>{
                const assign=assignments.find(a=>a.id===showFlashModal);
                const course=courses.find(c=>c.id===assign?.courseId);
                const cards=assign?.flashcards||[];
                const card=cards[activeCard];
                const mastered=cards.filter(c=>c.mastered).length;
                return(<div className="fi">
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                    <button className="bg2" onClick={()=>{setShowFlashModal(null);setStudyMode(false);setActiveCard(0);setCardFlipped(false);}}>← Back</button>
                    <div style={{flex:1}}><div style={{fontWeight:700,fontSize:13}}>{assign?.title}</div><div style={{fontSize:11,color:T.muted}}>{course?.name}</div></div>
                    {cards.length>0&&<div style={{fontSize:11,color:T.muted}}>{mastered}/{cards.length} mastered</div>}
                  </div>
                  {(!cards.length||!studyMode)&&(
                    <div className="card" style={{marginBottom:12}}>
                      <div style={{fontWeight:700,marginBottom:6}}>{cards.length?"Regenerate":"Generate"} Flashcards</div>
                      <div style={{fontSize:12,color:T.muted,marginBottom:9}}>Claude will create 12–16 flashcards for <strong>{assign?.title}</strong>. Paste notes or topics for better results.</div>
                      <textarea className="ifield" rows={3} placeholder="Optional: paste topics, lecture notes, or chapter titles..." value={flashContext} onChange={e=>setFlashContext(e.target.value)} style={{resize:"vertical",marginBottom:9,fontSize:12}}/>
                      <div style={{display:"flex",gap:8}}>
                        <button className="bp" onClick={()=>generateFlashcards(showFlashModal)} disabled={flashGenerating} style={{opacity:flashGenerating?0.6:1}}>{flashGenerating?"Generating...":"⬡ Generate Flashcards"}</button>
                        {cards.length>0&&<button className="bg2" onClick={()=>setStudyMode(true)}>Study existing →</button>}
                      </div>
                    </div>
                  )}
                  {cards.length>0&&studyMode&&(<div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                      <div className="prog-bar" style={{flex:1,height:6}}><div className="prog-fill" style={{width:`${Math.round(mastered/cards.length*100)}%`,background:T.success}}/></div>
                      <span style={{fontSize:11,color:T.muted,whiteSpace:"nowrap"}}>{Math.round(mastered/cards.length*100)}% mastered</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
                      <button className="bg2" onClick={()=>{setActiveCard(i=>Math.max(0,i-1));setCardFlipped(false);}}>←</button>
                      <span style={{fontSize:12,color:T.muted,flex:1,textAlign:"center"}}>{activeCard+1} / {cards.length}</span>
                      <button className="bg2" onClick={()=>{setActiveCard(i=>Math.min(cards.length-1,i+1));setCardFlipped(false);}}>→</button>
                    </div>
                    {card&&<div style={{textAlign:"center",marginBottom:6}}><span className="tag" style={{background:"rgba(167,139,250,.12)",color:"#a78bfa"}}>{card.category}</span></div>}
                    {card&&(<div className="flip-card" onClick={()=>setCardFlipped(f=>!f)}>
                      <div className={`flip-inner${cardFlipped?" flipped":""}`}>
                        <div className="flip-face" style={{background:dark?"#16162a":"#f0eeff",border:`2px solid ${cardFlipped?T.border2:T.accent}`,borderRadius:14}}>
                          <div style={{fontSize:9,letterSpacing:2,color:T.accent,textTransform:"uppercase",marginBottom:8}}>Question / Term</div>
                          <div style={{fontSize:15,fontWeight:600,lineHeight:1.45,color:T.text}}>{card.front}</div>
                          <div style={{fontSize:10,color:T.faint,marginTop:9}}>Tap to reveal answer</div>
                        </div>
                        <div className="flip-face flip-back" style={{background:dark?"#0f2016":"#f0fff4",border:`2px solid ${T.success}`,borderRadius:14}}>
                          <div style={{fontSize:9,letterSpacing:2,color:T.success,textTransform:"uppercase",marginBottom:8}}>Answer</div>
                          <div style={{fontSize:13,lineHeight:1.55,color:T.text}}>{card.back}</div>
                        </div>
                      </div>
                    </div>)}
                    {card&&cardFlipped&&(<div style={{display:"flex",gap:9,marginTop:11,justifyContent:"center"}}>
                      <button onClick={()=>{toggleMastered(showFlashModal,card.id);setCardFlipped(false);setActiveCard(i=>Math.min(cards.length-1,i+1));}} style={{background:card.mastered?"rgba(34,197,94,.12)":"rgba(34,197,94,.06)",border:`1px solid ${T.success}`,color:T.success,borderRadius:8,padding:"7px 16px",fontSize:12,cursor:"pointer"}}>{card.mastered?"✓ Mastered":"Mark Mastered"}</button>
                      <button onClick={()=>{setCardFlipped(false);setActiveCard(i=>Math.min(cards.length-1,i+1));}} style={{background:"rgba(239,68,68,.06)",border:"1px solid #ef4444",color:"#ef4444",borderRadius:8,padding:"7px 16px",fontSize:12,cursor:"pointer"}}>Need Practice</button>
                    </div>)}
                    <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:11}}>
                      {cards.map((c,i)=><div key={i} onClick={()=>{setActiveCard(i);setCardFlipped(false);}} style={{width:25,height:25,borderRadius:5,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600,background:c.mastered?"rgba(34,197,94,.15)":i===activeCard?`rgba(${rgb},.15)`:(dark?"#1a1a24":"#f0efe9"),border:`1px solid ${c.mastered?T.success:i===activeCard?T.accent:T.border2}`,color:c.mastered?T.success:i===activeCard?T.accent:T.muted}}>{i+1}</div>)}
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:10}}>
                      <button className="bg2" style={{fontSize:11}} onClick={()=>{setStudyMode(false);setFlashContext("");}}>⬡ Regenerate</button>
                      <button className="bg2" style={{fontSize:11}} onClick={()=>{setActiveCard(0);setCardFlipped(false);setAssignments(p=>p.map(a=>a.id===showFlashModal?{...a,flashcards:a.flashcards.map(c=>({...c,mastered:false}))}:a));notify("Progress reset!");}}>↺ Reset Progress</button>
                    </div>
                  </div>)}
                </div>);
              })()}
            </div>
          )}

          {/* ── SETTINGS ── */}
          {view==="settings"&&(
            <div className="fi">
              <div style={{marginBottom:13}}><div style={{fontSize:10,letterSpacing:3,color:T.accent,textTransform:"uppercase"}}>Preferences</div><h1 style={{fontSize:22,fontWeight:700}}>Settings</h1></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div className="card">
                  <div style={{fontWeight:700,marginBottom:10}}>Your Profile</div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Name</div><input className="ifield" value={profile.full_name||""} onChange={e=>setProfile(p=>({...p,full_name:e.target.value}))} style={{fontSize:12}}/></div>
                    {[["Degree",DEGREE_LEVELS.find(d=>d.id===profile.degree_level)?.label||"—"],["University",uni.name]].map(([k,v])=>(
                      <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${T.border}`,fontSize:12}}>
                        <span style={{color:T.muted}}>{k}</span><span style={{fontWeight:600}}>{v}</span>
                      </div>
                    ))}
                    <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Greek Org</div><input className="ifield" value={profile.greek_org||""} onChange={e=>setProfile(p=>({...p,greek_org:e.target.value}))} style={{fontSize:12}} placeholder="Organization name"/></div>
                    <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Working Professional</div>
                      <div style={{display:"flex",gap:8}}>
                        {["Yes","No"].map(o=><button key={o} onClick={()=>setProfile(p=>({...p,is_working_professional:o==="Yes"}))} style={{flex:1,padding:"6px",borderRadius:7,border:`1px solid ${(profile.is_working_professional&&o==="Yes")||(!profile.is_working_professional&&o==="No")?T.accent:T.border2}`,background:(profile.is_working_professional&&o==="Yes")||(!profile.is_working_professional&&o==="No")?`rgba(${rgb},.1)`:"transparent",color:(profile.is_working_professional&&o==="Yes")||(!profile.is_working_professional&&o==="No")?T.accent:T.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>{o}</button>)}
                      </div>
                    </div>
                    <button className="bp" style={{fontSize:12,marginTop:4}} onClick={async()=>{await supabase.from("profiles").update({full_name:profile.full_name,greek_org:profile.greek_org,is_working_professional:profile.is_working_professional}).eq("id",authUser.id);notify("Profile updated!");}}>Save Changes</button>
                  </div>
                </div>
                <div className="card">
                  <div style={{fontWeight:700,marginBottom:10}}>Appearance</div>
                  <div style={{display:"flex",gap:9,marginBottom:14}}>
                    {[{id:true,icon:"🌙",label:"Dark"},{id:false,icon:"☀️",label:"Light"}].map(opt=>(
                      <div key={String(opt.id)} onClick={async()=>{setDark(opt.id);await supabase.from("profiles").update({dark_mode:opt.id}).eq("id",authUser.id);}} style={{flex:1,padding:12,borderRadius:9,cursor:"pointer",border:`2px solid ${dark===opt.id?T.accent:T.border2}`,background:dark===opt.id?`rgba(${rgb},.1)`:"transparent",textAlign:"center",transition:"all .2s"}}>
                        <div style={{fontSize:20,marginBottom:4}}>{opt.icon}</div><div style={{fontWeight:600,fontSize:12}}>{opt.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{fontSize:12,color:T.muted}}>University theme is set during onboarding. Contact support to change it.</div>
                </div>
                <div className="card">
                  <div style={{fontWeight:700,marginBottom:10}}>Integrations (Coming Soon)</div>
                  {[{name:"SMS Reminders",icon:"📱",desc:"Text alerts for deadlines"},{name:"Outlook Calendar",icon:"📅",desc:"Sync via Microsoft Graph API"},{name:"Canvas / eLearning",icon:"📚",desc:"Auto-import assignments"},{name:"University Email",icon:"📧",desc:"Deadline reminders to inbox"}].map(item=>(
                    <div key={item.name} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:`1px solid ${T.border}`}}>
                      <span style={{fontSize:16}}>{item.icon}</span>
                      <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600}}>{item.name}</div><div style={{fontSize:10,color:T.muted}}>{item.desc}</div></div>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
                        <span style={{fontSize:9,background:`rgba(${rgb},.15)`,color:T.accent,padding:"1px 6px",borderRadius:8,border:`1px solid rgba(${rgb},.3)`,fontWeight:600,letterSpacing:.5}}>COMING SOON</span>
                        <button style={{background:"transparent",border:`1px solid ${T.border2}`,borderRadius:6,padding:"2px 8px",fontSize:10,color:T.faint,cursor:"pointer",fontFamily:"inherit"}} onClick={()=>notify(`${item.name} integration is coming in v2! We will notify you when it's ready.`)}>Notify Me</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="card">
                  <div style={{fontWeight:700,marginBottom:7}}>Syllabus Import</div>
                  <div style={{fontSize:12,color:T.muted,marginBottom:10}}>AI extracts all assignments, due dates, professor names, and topics automatically.</div>
                  <label style={{cursor:"pointer",display:"block"}}>
                    <input type="file" accept=".txt,.pdf,.docx" onChange={handleSyllabusUpload} style={{display:"none"}}/>
                    <div style={{border:`2px dashed ${T.border2}`,borderRadius:9,padding:18,textAlign:"center",transition:"border-color .2s"}}>
                      <div style={{fontSize:22,marginBottom:5}}>📄</div>
                      <div style={{fontSize:12,color:T.muted}}>{uploading?"Analyzing...":"Click to upload syllabus"}</div>
                      {uploadMsg&&<div style={{fontSize:11,marginTop:5,color:T.success}}>{uploadMsg}</div>}
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ═══ AI CHAT PANEL ═══ */}
        {chatOpen&&(
          <aside className="fi" style={{width:310,background:T.chatBg,borderLeft:`1px solid ${T.border}`,display:"flex",flexDirection:"column",flexShrink:0}}>
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",background:`linear-gradient(135deg,rgba(${rgb},.1),transparent)`}}>
              <div><div style={{fontWeight:700,fontSize:13}}>🤖 AI Study Assistant</div><div style={{fontSize:10,color:T.muted,marginTop:1}}>{uni.abbr} · Claude · Full context</div></div>
              <button onClick={()=>setChatOpen(false)} style={{background:"transparent",border:`1px solid ${T.border2}`,borderRadius:7,width:25,height:25,color:T.muted,fontSize:11}}>✕</button>
            </div>
            <div style={{padding:"7px 10px",borderBottom:`1px solid ${T.border}`,display:"flex",gap:4,flexWrap:"wrap"}}>
              {["Soonest deadline?","Study strategy","Prioritize my week","Dissertation advice","How am I doing?"].map(q=>(
                <button key={q} onClick={()=>sendChat(q)} style={{fontSize:10,padding:"2px 7px",borderRadius:20,background:dark?"#1e1e30":T.border,border:`1px solid ${T.border2}`,color:T.muted,cursor:"pointer"}}>{q}</button>
              ))}
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"11px 12px",display:"flex",flexDirection:"column",gap:10}}>
              {chatMessages.map((msg,i)=>(
                <div key={i} style={{display:"flex",flexDirection:"column",alignItems:msg.role==="user"?"flex-end":"flex-start"}}>
                  <div style={{maxWidth:"90%",padding:"8px 11px",borderRadius:msg.role==="user"?"14px 14px 4px 14px":"14px 14px 14px 4px",background:msg.role==="user"?T.userBubble:T.aiBubble,border:`1px solid ${T.border}`,fontSize:12,lineHeight:1.55,color:T.text,whiteSpace:"pre-wrap"}}>{msg.content}</div>
                  <div style={{fontSize:10,color:T.faint,marginTop:2,padding:"0 3px"}}>{msg.role==="user"?"You":"Claude"}</div>
                </div>
              ))}
              {chatLoading&&<div><div style={{padding:"8px 11px",borderRadius:"14px 14px 14px 4px",background:T.aiBubble,border:`1px solid ${T.border}`,fontSize:12,color:T.muted,animation:"pulse 1.2s infinite",display:"inline-block"}}>Thinking...</div></div>}
              <div ref={chatEndRef}/>
            </div>
            <div style={{padding:"9px 11px",borderTop:`1px solid ${T.border}`,display:"flex",gap:6}}>
              <input className="ifield" placeholder="Ask anything..." value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat();}}} style={{flex:1,fontSize:12}}/>
              <button onClick={()=>sendChat()} disabled={chatLoading||!chatInput.trim()} className="bp" style={{padding:"8px 11px",flexShrink:0,opacity:chatLoading||!chatInput.trim()?0.5:1}}>↑</button>
            </div>
          </aside>
        )}
      </div>

      {/* ═══ MODALS ═══ */}

      {showAddAssign&&(<div className="mo" onClick={()=>setShowAddAssign(false)}><div className="md fi" onClick={e=>e.stopPropagation()}>
        <div style={{fontWeight:700,fontSize:16,marginBottom:13}}>Add Assignment</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Course</div>
            <select className="ifield" value={newAssign.courseId} onChange={e=>setNewAssign(a=>({...a,courseId:e.target.value}))}>
              <option value="">Select course...</option>
              {courses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Title</div><input className="ifield" placeholder="Assignment title" value={newAssign.title} onChange={e=>setNewAssign(a=>({...a,title:e.target.value}))}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
            <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Due Date</div><input type="date" className="ifield" value={newAssign.due} onChange={e=>setNewAssign(a=>({...a,due:e.target.value}))}/></div>
            <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Type</div>
              <select className="ifield" value={newAssign.type} onChange={e=>setNewAssign(a=>({...a,type:e.target.value}))}>
                {["paper","exam","case","homework","project","discussion"].map(tp=><option key={tp}>{tp}</option>)}
              </select>
            </div>
          </div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Estimated Hours: {newAssign.estHours}</div><input type="range" min={1} max={30} value={newAssign.estHours} onChange={e=>setNewAssign(a=>({...a,estHours:+e.target.value}))} style={{width:"100%",accentColor:T.accent}}/></div>
          <div style={{display:"flex",gap:8,marginTop:4}}><button className="bg2" style={{flex:1}} onClick={()=>setShowAddAssign(false)}>Cancel</button><button className="bp" style={{flex:1}} onClick={addAssignment}>Add Assignment</button></div>
        </div>
      </div></div>)}

      {showAddCourse&&(<div className="mo" onClick={()=>setShowAddCourse(false)}><div className="md fi" onClick={e=>e.stopPropagation()}>
        <div style={{fontWeight:700,fontSize:16,marginBottom:13}}>Add Course</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Course Name</div><input className="ifield" placeholder="e.g. BCOM 6304 – Strategy" value={newCourse.name} onChange={e=>setNewCourse(c=>({...c,name:e.target.value}))}/></div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Professor (for RMP lookup)</div><input className="ifield" placeholder="Professor name" value={newCourse.professor} onChange={e=>setNewCourse(c=>({...c,professor:e.target.value}))}/></div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Difficulty: {newCourse.difficulty}/5</div><input type="range" min={1} max={5} value={newCourse.difficulty} onChange={e=>setNewCourse(c=>({...c,difficulty:+e.target.value}))} style={{width:"100%",accentColor:T.accent}}/></div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:6}}>Color</div><div style={{display:"flex",gap:7}}>{["#6366f1","#0ea5e9","#ec4899","#10b981","#f59e0b","#8b5cf6","#ef4444","#14b8a6","#f97316","#06b6d4","#84cc16","#a855f7"].map(col=><div key={col} onClick={()=>setNewCourse(c=>({...c,color:col}))} title={courses.some(x=>x.color===col)?"Already used by another course":col} style={{width:24,height:24,borderRadius:6,background:col,cursor:"pointer",border:newCourse.color===col?"3px solid #fff":"3px solid transparent",opacity:courses.some(x=>x.color===col)?.6:1}}/>)}</div></div>
          <div style={{display:"flex",gap:8,marginTop:4}}><button className="bg2" style={{flex:1}} onClick={()=>setShowAddCourse(false)}>Cancel</button><button className="bp" style={{flex:1}} onClick={addCourse}>Add Course</button></div>
        </div>
      </div></div>)}

      {showAddMilestone&&(<div className="mo" onClick={()=>setShowAddMilestone(false)}><div className="md fi" onClick={e=>e.stopPropagation()}>
        <div style={{fontWeight:700,fontSize:16,marginBottom:13}}>Add Dissertation Milestone</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Title</div><input className="ifield" placeholder="e.g. Proposal Defense" value={newMilestone.title} onChange={e=>setNewMilestone(m=>({...m,title:e.target.value}))}/></div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Target Date</div><input type="date" className="ifield" value={newMilestone.due} onChange={e=>setNewMilestone(m=>({...m,due:e.target.value}))}/></div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Notes</div><textarea className="ifield" rows={2} placeholder="Advisor requirements, committee notes..." value={newMilestone.notes} onChange={e=>setNewMilestone(m=>({...m,notes:e.target.value}))} style={{resize:"vertical"}}/></div>
          <div style={{display:"flex",gap:8,marginTop:4}}><button className="bg2" style={{flex:1}} onClick={()=>setShowAddMilestone(false)}>Cancel</button><button className="bp" style={{flex:1}} onClick={addMilestone}>Add Milestone</button></div>
        </div>
      </div></div>)}

      {showAddTravel&&(<div className="mo" onClick={()=>setShowAddTravel(false)}><div className="md fi" onClick={e=>e.stopPropagation()}>
        <div style={{fontWeight:700,fontSize:16,marginBottom:13}}>✈ Block Travel / Blackout Dates</div>
        <div style={{fontSize:12,color:T.muted,marginBottom:11}}>Study sessions will not be scheduled on these dates. Perfect for travel, conferences, or family commitments.</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Label</div><input className="ifield" placeholder="e.g. Business Trip to Chicago" value={newTravel.label} onChange={e=>setNewTravel(t=>({...t,label:e.target.value}))}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
            <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Start Date</div><input type="date" className="ifield" value={newTravel.start} onChange={e=>setNewTravel(t=>({...t,start:e.target.value}))}/></div>
            <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>End Date</div><input type="date" className="ifield" value={newTravel.end} onChange={e=>setNewTravel(t=>({...t,end:e.target.value}))}/></div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:4}}><button className="bg2" style={{flex:1}} onClick={()=>setShowAddTravel(false)}>Cancel</button><button className="bp" style={{flex:1}} onClick={addTravel}>Block Dates</button></div>
        </div>
      </div></div>)}

      {showAddBlock&&(<div className="mo" onClick={()=>setShowAddBlock(false)}><div className="md fi" onClick={e=>e.stopPropagation()}>
        <div style={{fontWeight:700,fontSize:16,marginBottom:13}}>Add Schedule Block</div>
        <div style={{fontSize:12,color:T.muted,marginBottom:11}}>Block time for practices, games, chapter meetings, philanthropic events, or any recurring commitment. Study sessions will be placed around these.</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Label</div><input className="ifield" placeholder="e.g. Basketball Practice" value={newBlock.label} onChange={e=>setNewBlock(b=>({...b,label:e.target.value}))}/></div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Type</div>
            <select className="ifield" value={newBlock.block_type} onChange={e=>setNewBlock(b=>({...b,block_type:e.target.value}))}>
              <option value="sport">🏅 Sport / Practice / Game Day</option>
              <option value="greek">🏛 Greek Life / Philanthropy / Meeting</option>
              <option value="work">💼 Work Event / Meeting</option>
              <option value="other">📌 Other Commitment</option>
            </select>
          </div>
          <div>
            <div style={{fontSize:11,color:T.muted,marginBottom:6}}>Recurring Days <span style={{color:T.faint}}>(tap to select multiple)</span></div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
              {DAYS_SHORT.map(d=>{
                const selected=(newBlock.days_of_week||[]).includes(d);
                return(
                  <button key={d} type="button" onClick={()=>{
                    const current=newBlock.days_of_week||[];
                    const updated=selected?current.filter(x=>x!==d):[...current,d];
                    setNewBlock(b=>({...b,days_of_week:updated.length>0?updated:current}));
                  }} style={{padding:"6px 12px",borderRadius:8,border:`2px solid ${selected?T.accent:T.border2}`,background:selected?`rgba(${rgb},.15)`:"transparent",color:selected?T.accent:T.muted,fontSize:12,fontWeight:selected?700:400,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>
                    {d}
                  </button>
                );
              })}
            </div>
            <div style={{fontSize:11,color:T.muted,marginBottom:3}}>— OR — Specific one-time date</div>
            <input type="date" className="ifield" value={newBlock.date_specific} onChange={e=>setNewBlock(b=>({...b,date_specific:e.target.value}))} style={{fontSize:12}}/>
            {newBlock.date_specific&&<div style={{fontSize:10,color:T.faint,marginTop:3}}>Specific date set — recurring days will be ignored for this block.</div>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
            <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Start Time</div><input type="time" className="ifield" value={newBlock.start_time} onChange={e=>setNewBlock(b=>({...b,start_time:e.target.value}))}/></div>
            <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>End Time</div><input type="time" className="ifield" value={newBlock.end_time} onChange={e=>setNewBlock(b=>({...b,end_time:e.target.value}))}/></div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:4}}><button className="bg2" style={{flex:1}} onClick={()=>setShowAddBlock(false)}>Cancel</button><button className="bp" style={{flex:1}} onClick={addScheduleBlock}>Add Block</button></div>
        </div>
      </div></div>)}


      {/* ═══ CONFIRM MODAL ═══ */}
      {confirmModal&&(
        <div className="mo" onClick={()=>setConfirmModal(null)}>
          <div className="md fi" onClick={e=>e.stopPropagation()} style={{maxWidth:380}}>
            <div style={{fontSize:20,marginBottom:12,textAlign:"center"}}>⚠️</div>
            <div style={{fontWeight:700,fontSize:16,marginBottom:8,textAlign:"center"}}>{confirmModal.message}</div>
            {confirmModal.detail&&<div style={{fontSize:12,color:T.muted,marginBottom:16,textAlign:"center",lineHeight:1.6,padding:"8px 12px",background:T.subcard,borderRadius:8}}>{confirmModal.detail}</div>}
            <div style={{display:"flex",gap:10,marginTop:8}}>
              <button className="bg2" style={{flex:1}} onClick={()=>setConfirmModal(null)}>Cancel</button>
              <button style={{flex:1,background:T.danger,color:"#fff",border:"none",borderRadius:8,padding:"9px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}} onClick={()=>{confirmModal.onConfirm();setConfirmModal(null);}}>Yes, Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
