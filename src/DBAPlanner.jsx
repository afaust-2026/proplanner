import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase + Claude config ─────────────────────────────────────────────────
const SUPA_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON || "";
// Safely create client - if env vars missing show helpful error instead of crashing
const supabase = (SUPA_URL && SUPA_KEY)
  ? createClient(SUPA_URL, SUPA_KEY)
  : null;
// SECURITY: the Anthropic key NEVER lives in the browser. All Claude calls go
// through /api/claude/messages, which is a server-side proxy that holds the key.
// (See api/claude/messages.js and SECURITY_FIX_setup.md.)

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function getCalendarDays(yr,mo){const f=new Date(yr,mo,1).getDay(),tot=new Date(yr,mo+1,0).getDate(),d=[];for(let i=0;i<f;i++)d.push(null);for(let i=1;i<=tot;i++)d.push(i);return d;}
function dateKey(y,m,d){return`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;}
function today(){const d=new Date();return{year:d.getFullYear(),month:d.getMonth(),day:d.getDate()};}
function daysUntil(due){const n=new Date();n.setHours(0,0,0,0);return Math.ceil((new Date(due+"T00:00:00")-n)/86400000);}
function fmtDays(d){return d<0?`${Math.abs(d)}d overdue`:d===0?"Today":`${d}d`;}
function urgencyColor(d,T){return d<0?T.danger:d<=3?T.warning:d<=7?T.caution:T.success;}
function rmpToInternal(r){return Math.round(Math.min(5,Math.max(1,r||3)));}
function to12h(t){
  if(!t)return"";
  const[h,m]=t.split(":").map(Number);
  const ampm=h>=12?"PM":"AM";
  const h12=h%12||12;
  return m===0?`${h12} ${ampm}`:`${h12}:${String(m).padStart(2,"0")} ${ampm}`;
}
function hexToRgb(hex){try{const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return`${r},${g},${b}`;}catch{return"99,102,241";}}
function pctToGPA(pct){
  if(pct>=93)return 4.0;if(pct>=90)return 3.7;if(pct>=87)return 3.3;if(pct>=83)return 3.0;
  if(pct>=80)return 2.7;if(pct>=77)return 2.3;if(pct>=73)return 2.0;if(pct>=70)return 1.7;
  if(pct>=67)return 1.3;if(pct>=63)return 1.0;if(pct>=60)return 0.7;return 0.0;
}
function pctToLetterGrade(pct){
  if(pct>=93)return"A";if(pct>=90)return"A-";if(pct>=87)return"B+";if(pct>=83)return"B";
  if(pct>=80)return"B-";if(pct>=77)return"C+";if(pct>=73)return"C";if(pct>=70)return"C-";
  if(pct>=67)return"D+";if(pct>=63)return"D";if(pct>=60)return"D-";return"F";
}
function calcGPA(grades, courses, assignments){
  const byCourse={};
  grades.forEach(g=>{
    const a=(assignments||[]).find(x=>x.id===g.assignmentId);
    const weight=a&&a.weight!=null?Number(a.weight):null;
    if(!byCourse[g.courseId])byCourse[g.courseId]=[];
    byCourse[g.courseId].push({score:g.score,maxScore:g.maxScore,weight});
  });
  const gpas=Object.entries(byCourse).map(([cid,entries])=>{
    const anyWeighted=entries.some(e=>e.weight!=null&&e.weight>0);
    let pct=0;
    if(anyWeighted){
      let weightedTotal=0,weightSum=0;
      entries.forEach(e=>{
        if(e.weight==null||e.weight<=0)return;
        const itemPct=e.maxScore>0?(e.score/e.maxScore)*100:0;
        weightedTotal+=itemPct*e.weight;
        weightSum+=e.weight;
      });
      pct=weightSum>0?weightedTotal/weightSum:0;
    } else {
      const totalScore=entries.reduce((s,e)=>s+e.score,0);
      const totalMax=entries.reduce((s,e)=>s+e.maxScore,0);
      pct=totalMax>0?(totalScore/totalMax)*100:0;
    }
    return{courseId:cid,pct,gpa:pctToGPA(pct),weighted:anyWeighted};
  });
  const overall=gpas.length>0?gpas.reduce((s,g)=>s+g.gpa,0)/gpas.length:0;
  return{courseGrades:gpas,overall:Math.round(overall*100)/100};
}

// ─── Constants ────────────────────────────────────────────────────────────────
const UNIVERSITIES=[
  // ── Dallas / DFW ─────────────────────────────────────────────────────────
  {id:"utd",    name:"UT Dallas",             abbr:"UTD",  primary:"#C75B12",secondary:"#154734",accent:"#F5A623",logo:"☄️", mascot:"Temoc the Comet"},
  {id:"smu",    name:"SMU",                   abbr:"SMU",  primary:"#CC0035",secondary:"#354CA1",accent:"#F5A623",logo:"🐴", mascot:"Peruna the Mustang"},
  {id:"tcu",    name:"TCU",                   abbr:"TCU",  primary:"#4D1979",secondary:"#A3A9AC",accent:"#C9B765",logo:"🐸", mascot:"SuperFrog"},
  {id:"uta",    name:"UT Arlington",          abbr:"UTA",  primary:"#003087",secondary:"#FF8200",accent:"#FF8200",logo:"🦅", mascot:"Blaze the Maverick"},
  {id:"unt",    name:"UNT",                   abbr:"UNT",  primary:"#00853E",secondary:"#FFFFFF",accent:"#00853E",logo:"🦅", mascot:"Scrappy the Eagle"},
  {id:"dbu",    name:"Dallas Baptist Univ.",  abbr:"DBU",  primary:"#00205B",secondary:"#C8102E",accent:"#C8102E",logo:"🦁", mascot:"Patriot Lion"},
  // ── Austin ───────────────────────────────────────────────────────────────
  {id:"utaustin",name:"UT Austin",            abbr:"UT",   primary:"#BF5700",secondary:"#333F48",accent:"#F8971F",logo:"🤠", mascot:"Bevo the Longhorn"},
  {id:"txstate", name:"Texas State",          abbr:"TXST", primary:"#501214",secondary:"#8B8B00",accent:"#8B8B00",logo:"🐱", mascot:"Boko the Bobcat"},
  {id:"stedwards",name:"St. Edward's Univ.", abbr:"SEU",  primary:"#FFD100",secondary:"#002147",accent:"#002147",logo:"🌟", mascot:"Hilltoppers"},
  // ── Houston ──────────────────────────────────────────────────────────────
  {id:"uh",     name:"Univ. of Houston",      abbr:"UH",   primary:"#CC0000",secondary:"#666666",accent:"#CC0000",logo:"🐾", mascot:"Shasta the Cougar"},
  {id:"rice",   name:"Rice University",       abbr:"RICE", primary:"#00205B",secondary:"#7A99AC",accent:"#7A99AC",logo:"🦉", mascot:"Sammy the Owl"},
  {id:"tsu",    name:"Texas Southern Univ.",  abbr:"TSU",  primary:"#4B0082",secondary:"#C0965C",accent:"#C0965C",logo:"🐯", mascot:"Tom the Tiger"},
  {id:"uhd",    name:"UH-Downtown",           abbr:"UHD",  primary:"#CC0000",secondary:"#808080",accent:"#808080",logo:"🐾", mascot:"Gator"},
  // ── San Antonio ──────────────────────────────────────────────────────────
  {id:"utsa",   name:"UTSA",                  abbr:"UTSA", primary:"#F15A22",secondary:"#002A5C",accent:"#002A5C",logo:"🐦", mascot:"Rowdy the Roadrunner"},
  {id:"trinity",name:"Trinity University",    abbr:"TRU",  primary:"#840029",secondary:"#4E2B16",accent:"#4E2B16",logo:"🐯", mascot:"Triton the Tiger"},
  // ── Waco / Central TX ────────────────────────────────────────────────────
  {id:"baylor", name:"Baylor University",     abbr:"BU",   primary:"#003015",secondary:"#FFB81C",accent:"#FFB81C",logo:"🐻", mascot:"Joy & Judah the Bears"},
  {id:"umhb",   name:"Mary Hardin-Baylor",    abbr:"UMHB", primary:"#461D7C",secondary:"#FFB81C",accent:"#FFB81C",logo:"⚔️", mascot:"Crusaders"},
  // ── Lubbock / West TX ────────────────────────────────────────────────────
  {id:"ttu",    name:"Texas Tech",            abbr:"TTU",  primary:"#CC0000",secondary:"#000000",accent:"#CC0000",logo:"🤠", mascot:"Raider Red"},
  // ── College Station ──────────────────────────────────────────────────────
  {id:"tamu",   name:"Texas A&M",             abbr:"TAMU", primary:"#500000",secondary:"#FFFFFF",accent:"#500000",logo:"🐕", mascot:"Reveille the Collie"},
  // ── El Paso / South TX ───────────────────────────────────────────────────
  {id:"utep",   name:"UTEP",                  abbr:"UTEP", primary:"#FF8200",secondary:"#041E42",accent:"#041E42",logo:"⛏️", mascot:"Paydirt Pete the Miner"},
  // ── Custom ───────────────────────────────────────────────────────────────
  {id:"custom", name:"My School",             abbr:"MY",   primary:"#3b4a6b",secondary:"#5c6e9a",accent:"#4f87c5",logo:"🎓", mascot:""},
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
async function claudeProxy(payload){
  // POST to our server-side proxy. The user's Supabase JWT proves they are signed in.
  const{data:{session}}=await supabase.auth.getSession();
  const token=session?.access_token||"";
  if(!token)throw new Error("Not signed in. Please sign in to use AI features.");
  let res;
  try{
    res=await fetch("/api/claude/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},
      body:JSON.stringify(payload),
    });
  }catch(networkErr){
    throw new Error(`Network error reaching AI proxy: ${networkErr.message||networkErr}. Check your connection or try again.`);
  }
  // Read body as text first so we can include it verbatim in error messages
  const raw=await res.text();
  let data=null;
  try{data=raw?JSON.parse(raw):null;}catch(_){data=null;}
  if(!res.ok){
    const apiMsg=data?.error?.message;
    const detail=apiMsg||(raw?raw.slice(0,200):"(empty response)");
    throw new Error(`AI proxy returned ${res.status}: ${detail}`);
  }
  if(!data){
    throw new Error(`AI proxy returned 200 but the body was not JSON: ${raw.slice(0,200)}`);
  }
  return data;
}
async function callClaudeJSON(system,user,maxT=1500){
  const data=await claudeProxy({model:"claude-sonnet-4-20250514",max_tokens:maxT,system,messages:[{role:"user",content:user}]});
  const text=data.content?.map(b=>b.text||"").join("")||"";
  return JSON.parse(text.replace(/```json[\s\S]*?```|```/g,"").trim());
}
async function callClaudeChat(messages){
  const data=await claudeProxy({model:"claude-sonnet-4-20250514",max_tokens:1000,messages});
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
  const[mode,setMode]=useState("login"); // "login" | "signup" | "forgot" | "reset" | "mfa"
  const[email,setEmail]=useState("");
  const[password,setPassword]=useState("");
  const[confirmPassword,setConfirmPassword]=useState("");
  const[name,setName]=useState("");
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState("");
  const[success,setSuccess]=useState("");
  // Password visibility toggles (separate per field so they don't all reveal at once)
  const[showPwd,setShowPwd]=useState(false);
  const[showConfirmPwd,setShowConfirmPwd]=useState(false);
  // MFA challenge state — set after a successful password login if the user has TOTP enrolled
  const[mfaCode,setMfaCode]=useState("");
  const[mfaFactor,setMfaFactor]=useState(null); // {id, friendly_name}
  const[mfaChallenge,setMfaChallenge]=useState(null); // {id}

  // Check URL for password reset token on mount
  const[resetToken,setResetToken]=useState(null);
  const{useState:_,useEffect:ue}={useState,useEffect};

  // Handle Supabase password reset redirect
  // When user clicks the email link they land on the site with a hash token
  useEffect(()=>{
    const hash=window.location.hash;
    if(hash.includes("type=recovery")||hash.includes("access_token")){
      // Supabase puts the session in the URL hash after reset link click
      supabase.auth.getSession().then(({data:{session}})=>{
        if(session){setMode("reset");setResetToken(session.access_token);}
      });
      // Also handle the hash-based token from older Supabase versions
      const params=new URLSearchParams(hash.replace("#","?"));
      const token=params.get("access_token");
      const type=params.get("type");
      if(token&&type==="recovery"){setMode("reset");setResetToken(token);}
    }
  },[]);

  async function submit(){
    setError("");setSuccess("");setLoading(true);
    if(mode==="signup"){
      if(!name.trim()){setError("Please enter your name.");setLoading(false);return;}
      const{error:e}=await supabase.auth.signUp({email,password,options:{data:{full_name:name}}});
      if(e)setError(e.message);
      else{
        setSuccess("Account created! Check your email to confirm, then sign in.");
        // Best-effort: ping the admin notification endpoint so Angela gets an email.
        // If this fails, the user's signup still succeeds — we just swallow the error.
        try{
          fetch("/api/admin/notify-signup",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({email,name}),
            keepalive:true,
          }).catch(()=>{});
        }catch(_){}
      }
    }else if(mode==="forgot"){
      if(!email.trim()){setError("Please enter your email address.");setLoading(false);return;}
      const{error:e}=await supabase.auth.resetPasswordForEmail(email,{
        redirectTo:`${window.location.origin}`,
      });
      if(e)setError(e.message);
      else setSuccess("Check your email — we sent a password reset link. It expires in 1 hour.");
    }else if(mode==="reset"){
      if(password.length<6){setError("Password must be at least 6 characters.");setLoading(false);return;}
      if(password!==confirmPassword){setError("Passwords do not match.");setLoading(false);return;}
      const{error:e}=await supabase.auth.updateUser({password});
      if(e)setError(e.message);
      else{
        setSuccess("Password updated! Signing you in...");
        setTimeout(()=>{
          supabase.auth.getSession().then(({data:{session}})=>{
            if(session?.user)onAuth(session.user);
            else setMode("login");
          });
        },1500);
      }
    }else if(mode==="mfa"){
      // Verify the 6-digit TOTP code to elevate to aal2 and complete sign-in
      if(!mfaCode||mfaCode.length<6){setError("Enter the 6-digit code from your authenticator app.");setLoading(false);return;}
      try{
        const{data:v,error:ve}=await supabase.auth.mfa.verify({factorId:mfaFactor.id,challengeId:mfaChallenge.id,code:mfaCode.trim()});
        if(ve)throw ve;
        // verify returns a fresh session; pull current user and finish
        const{data:{session}}=await supabase.auth.getSession();
        if(session?.user)onAuth(session.user);
        else setError("Verified, but no session found. Please sign in again.");
      }catch(err){
        setError(err?.message||"Invalid code. Please try again.");
        setMfaCode("");
      }
    }else{
      // Standard email + password sign-in. After it succeeds, check if MFA is required.
      const{data,error:e}=await supabase.auth.signInWithPassword({email,password});
      if(e){setError(e.message);setLoading(false);return;}
      try{
        const{data:aal}=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if(aal?.nextLevel==="aal2"&&aal?.currentLevel!=="aal2"){
          // User has TOTP enrolled — fetch the factor and start a challenge
          const{data:factors}=await supabase.auth.mfa.listFactors();
          const verifiedTotp=(factors?.totp||[]).find(f=>f.status==="verified")||factors?.totp?.[0];
          if(verifiedTotp){
            const{data:ch,error:che}=await supabase.auth.mfa.challenge({factorId:verifiedTotp.id});
            if(che)throw che;
            setMfaFactor(verifiedTotp);
            setMfaChallenge(ch);
            setMode("mfa");
            setLoading(false);
            return;
          }
        }
        // No MFA needed — straight in
        onAuth(data.user);
      }catch(mfaErr){
        // If MFA check itself failed, surface the error but don't proceed with elevated session
        console.error("MFA check failed:",mfaErr);
        setError(mfaErr?.message||"Could not verify two-factor status. Please try again.");
      }
    }
    setLoading(false);
  }

  function switchMode(m){setMode(m);setError("");setSuccess("");setPassword("");setConfirmPassword("");}

  const inp={width:"100%",background:"#0f0f13",border:"1px solid #2a2a38",borderRadius:8,padding:"10px 13px",color:"#e8e3d8",fontSize:14,outline:"none",fontFamily:"inherit",marginBottom:2};
  const btnPrimary={width:"100%",background:"#6366f1",color:"#fff",border:"none",borderRadius:10,padding:"13px",fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all .2s"};

  // ── Reset password screen ──────────────────────────────────────────────────
  if(mode==="reset") return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#0f0f13 0%,#1a1a2e 100%)",fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{width:"min(92vw,420px)",padding:"clamp(24px,5vw,40px) clamp(18px,4vw,36px)",background:"#16161f",borderRadius:20,border:"1px solid #2a2a38",boxShadow:"0 24px 80px rgba(0,0,0,.6)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:40,marginBottom:10}}>🔐</div>
          <div style={{fontSize:22,fontWeight:700,color:"#e8e3d8"}}>Set New Password</div>
          <div style={{fontSize:12,color:"#7a7590",marginTop:5}}>Choose a strong password for your account</div>
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:"#7a7590",marginBottom:5}}>New Password</div>
          <div style={{position:"relative"}}>
            <input value={password} onChange={e=>setPassword(e.target.value)} type={showPwd?"text":"password"} placeholder="At least 6 characters" style={{...inp,paddingRight:42}} autoComplete="new-password"/>
            <button type="button" onClick={()=>setShowPwd(s=>!s)} aria-label={showPwd?"Hide password":"Show password"} style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:"transparent",border:"none",color:"#7a7590",cursor:"pointer",padding:"6px 8px",fontSize:16,lineHeight:1,fontFamily:"inherit"}}>{showPwd?"🙈":"👁"}</button>
          </div>
        </div>
        <div style={{marginBottom:22}}>
          <div style={{fontSize:11,color:"#7a7590",marginBottom:5}}>Confirm New Password</div>
          <div style={{position:"relative"}}>
            <input value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} type={showConfirmPwd?"text":"password"} placeholder="Repeat your new password" onKeyDown={e=>e.key==="Enter"&&submit()} style={{...inp,paddingRight:42}} autoComplete="new-password"/>
            <button type="button" onClick={()=>setShowConfirmPwd(s=>!s)} aria-label={showConfirmPwd?"Hide password":"Show password"} style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:"transparent",border:"none",color:"#7a7590",cursor:"pointer",padding:"6px 8px",fontSize:16,lineHeight:1,fontFamily:"inherit"}}>{showConfirmPwd?"🙈":"👁"}</button>
          </div>
        </div>
        {/* Password strength indicator */}
        {password.length>0&&(
          <div style={{marginBottom:14}}>
            <div style={{display:"flex",gap:4,marginBottom:4}}>
              {[1,2,3,4].map(i=>{
                const strength=password.length>=8&&/[A-Z]/.test(password)&&/[0-9]/.test(password)?4:password.length>=8?3:password.length>=6?2:1;
                return<div key={i} style={{flex:1,height:3,borderRadius:2,background:i<=strength?["","#ef4444","#f59e0b","#3b82f6","#22c55e"][strength]:"#2a2a38",transition:"background .3s"}}/>;
              })}
            </div>
            <div style={{fontSize:10,color:"#7a7590"}}>{password.length<6?"Too short":password.length<8?"Fair — add numbers or capitals":!/[0-9]/.test(password)?"Good — add a number for better security":"Strong password ✓"}</div>
          </div>
        )}
        {error&&<div style={{fontSize:12,color:"#ef4444",background:"rgba(239,68,68,.1)",padding:"9px 13px",borderRadius:8,marginBottom:14,border:"1px solid rgba(239,68,68,.3)"}}>{error}</div>}
        {success&&<div style={{fontSize:12,color:"#22c55e",background:"rgba(34,197,94,.1)",padding:"9px 13px",borderRadius:8,marginBottom:14,border:"1px solid rgba(34,197,94,.3)"}}>{success}</div>}
        <button onClick={submit} disabled={loading||!password||!confirmPassword} style={{...btnPrimary,opacity:loading||!password||!confirmPassword?0.6:1}}>
          {loading?"Updating password...":"Update Password →"}
        </button>
      </div>
    </div>
  );

  // ── Forgot password screen ──────────────────────────────────────────────────
  if(mode==="forgot") return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#0f0f13 0%,#1a1a2e 100%)",fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{width:"min(92vw,420px)",padding:"clamp(24px,5vw,40px) clamp(18px,4vw,36px)",background:"#16161f",borderRadius:20,border:"1px solid #2a2a38",boxShadow:"0 24px 80px rgba(0,0,0,.6)"}}>
        <button onClick={()=>switchMode("login")} style={{background:"transparent",border:"none",color:"#7a7590",fontSize:13,cursor:"pointer",fontFamily:"inherit",marginBottom:20,display:"flex",alignItems:"center",gap:5,padding:0}}>← Back to Sign In</button>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:40,marginBottom:10}}>📧</div>
          <div style={{fontSize:22,fontWeight:700,color:"#e8e3d8"}}>Reset Your Password</div>
          <div style={{fontSize:12,color:"#7a7590",marginTop:5,lineHeight:1.6}}>Enter your email address and we will send you a link to reset your password.</div>
        </div>
        <div style={{marginBottom:22}}><div style={{fontSize:11,color:"#7a7590",marginBottom:5}}>Email Address</div><input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="you@university.edu" onKeyDown={e=>e.key==="Enter"&&submit()} style={inp} autoFocus/></div>
        {error&&<div style={{fontSize:12,color:"#ef4444",background:"rgba(239,68,68,.1)",padding:"9px 13px",borderRadius:8,marginBottom:14,border:"1px solid rgba(239,68,68,.3)"}}>{error}</div>}
        {success&&(
          <div style={{marginBottom:14}}>
            <div style={{fontSize:12,color:"#22c55e",background:"rgba(34,197,94,.1)",padding:"12px 14px",borderRadius:8,border:"1px solid rgba(34,197,94,.3)",lineHeight:1.6}}>
              {success}
            </div>
            <div style={{fontSize:11,color:"#7a7590",marginTop:10,padding:"10px 12px",background:"#0f0f13",borderRadius:8,lineHeight:1.6}}>
              💡 <strong>Tip:</strong> Check your spam folder if you do not see the email within a few minutes. The link expires in 1 hour.
            </div>
          </div>
        )}
        {!success&&<button onClick={submit} disabled={loading||!email} style={{...btnPrimary,opacity:loading||!email?0.6:1}}>
          {loading?"Sending reset link...":"Send Reset Link →"}
        </button>}
        {success&&<button onClick={()=>switchMode("login")} style={{...btnPrimary,background:"transparent",border:"1px solid #2a2a38",color:"#7a7590"}}>Back to Sign In</button>}
      </div>
    </div>
  );

  // ── MFA challenge screen ───────────────────────────────────────────────────
  if(mode==="mfa") return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#0f0f13 0%,#1a1a2e 100%)",fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{width:"min(92vw,420px)",padding:"clamp(24px,5vw,40px) clamp(18px,4vw,36px)",background:"#16161f",borderRadius:20,border:"1px solid #2a2a38",boxShadow:"0 24px 80px rgba(0,0,0,.6)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:40,marginBottom:10}}>🔐</div>
          <div style={{fontSize:22,fontWeight:700,color:"#e8e3d8"}}>Two-Factor Authentication</div>
          <div style={{fontSize:12,color:"#7a7590",marginTop:6,lineHeight:1.6}}>Open your authenticator app and enter the 6-digit code for ProPlan Scholar.</div>
        </div>
        <div style={{marginBottom:18}}>
          <div style={{fontSize:11,color:"#7a7590",marginBottom:5}}>6-digit Code</div>
          <input
            value={mfaCode}
            onChange={e=>setMfaCode(e.target.value.replace(/\D/g,"").slice(0,6))}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            onKeyDown={e=>e.key==="Enter"&&submit()}
            style={{...inp,fontSize:22,letterSpacing:8,textAlign:"center",fontFamily:"'SF Mono','Monaco','Menlo',monospace"}}
            autoFocus/>
        </div>
        {error&&<div style={{fontSize:12,color:"#ef4444",background:"rgba(239,68,68,.1)",padding:"9px 13px",borderRadius:8,marginBottom:14,border:"1px solid rgba(239,68,68,.3)"}}>{error}</div>}
        <button onClick={submit} disabled={loading||mfaCode.length<6} style={{...btnPrimary,opacity:loading||mfaCode.length<6?0.6:1,marginBottom:10}}>
          {loading?"Verifying...":"Verify and Sign In →"}
        </button>
        <button onClick={()=>{setMode("login");setMfaCode("");setMfaFactor(null);setMfaChallenge(null);setError("");}} style={{width:"100%",background:"transparent",border:"none",color:"#7a7590",fontSize:12,cursor:"pointer",fontFamily:"inherit",padding:"6px"}}>← Back to sign in</button>
        <div style={{fontSize:11,color:"#7a7590",marginTop:18,textAlign:"center",lineHeight:1.6}}>
          Lost access to your authenticator? Contact <a href="mailto:hello@proplanscholar.com" style={{color:"#a78bfa",textDecoration:"none"}}>hello@proplanscholar.com</a> for help.
        </div>
      </div>
    </div>
  );

  // ── Login / Signup screen ──────────────────────────────────────────────────
  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#0f0f13 0%,#1a1a2e 100%)",fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{width:"min(92vw,420px)",padding:"clamp(24px,5vw,40px) clamp(18px,4vw,36px)",background:"#16161f",borderRadius:20,border:"1px solid #2a2a38",boxShadow:"0 24px 80px rgba(0,0,0,.6)"}}>
        <div style={{textAlign:"center",marginBottom:30}}>
          <div style={{fontSize:44,marginBottom:10}}>🎓</div>
          <div style={{fontSize:26,fontWeight:700,color:"#e8e3d8"}}>ProPlan Scholar</div>
          <div style={{fontSize:13,color:"#7a7590",marginTop:5}}>Your personalized academic planner</div>
        </div>
        <div style={{display:"flex",background:"#0f0f13",borderRadius:10,padding:3,marginBottom:24,border:"1px solid #2a2a38"}}>
          {["login","signup"].map(m=>(
            <button key={m} onClick={()=>switchMode(m)} style={{flex:1,padding:"9px",borderRadius:7,border:"none",background:mode===m?"#6366f1":"transparent",color:mode===m?"#fff":"#7a7590",fontSize:13,fontWeight:mode===m?600:400,cursor:"pointer",fontFamily:"inherit",transition:"all .2s"}}>
              {m==="login"?"Sign In":"Create Account"}
            </button>
          ))}
        </div>
        {mode==="signup"&&<div style={{marginBottom:14}}><div style={{fontSize:11,color:"#7a7590",marginBottom:5}}>Full Name</div><input value={name} onChange={e=>setName(e.target.value)} placeholder="Your full name" style={inp}/></div>}
        <div style={{marginBottom:14}}><div style={{fontSize:11,color:"#7a7590",marginBottom:5}}>Email</div><input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="you@university.edu" style={inp}/></div>
        <div style={{marginBottom:mode==="login"?8:22}}>
          <div style={{fontSize:11,color:"#7a7590",marginBottom:5}}>Password</div>
          <div style={{position:"relative"}}>
            <input value={password} onChange={e=>setPassword(e.target.value)} type={showPwd?"text":"password"} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&submit()} style={{...inp,paddingRight:42}} autoComplete={mode==="signup"?"new-password":"current-password"}/>
            <button type="button" onClick={()=>setShowPwd(s=>!s)} aria-label={showPwd?"Hide password":"Show password"} title={showPwd?"Hide password":"Show password"} style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",background:"transparent",border:"none",color:"#7a7590",cursor:"pointer",padding:"6px 8px",fontSize:16,lineHeight:1,fontFamily:"inherit"}}>{showPwd?"🙈":"👁"}</button>
          </div>
        </div>
        {/* Forgot password link — only on login */}
        {mode==="login"&&(
          <div style={{textAlign:"right",marginBottom:18}}>
            <span onClick={()=>switchMode("forgot")} style={{fontSize:12,color:"#6366f1",cursor:"pointer"}}>Forgot password?</span>
          </div>
        )}
        {error&&<div style={{fontSize:12,color:"#ef4444",background:"rgba(239,68,68,.1)",padding:"9px 13px",borderRadius:8,marginBottom:14,border:"1px solid rgba(239,68,68,.3)"}}>{error}</div>}
        {success&&<div style={{fontSize:12,color:"#22c55e",background:"rgba(34,197,94,.1)",padding:"9px 13px",borderRadius:8,marginBottom:14,border:"1px solid rgba(34,197,94,.3)"}}>{success}</div>}
        <button onClick={submit} disabled={loading||!email||!password} style={{...btnPrimary,opacity:loading||!email||!password?0.6:1}}>
          {loading?"Please wait...":mode==="login"?"Sign In →":"Create Account →"}
        </button>
        {mode==="login"&&<div style={{textAlign:"center",marginTop:16,fontSize:12,color:"#7a7590"}}>No account? <span onClick={()=>switchMode("signup")} style={{color:"#6366f1",cursor:"pointer"}}>Sign up free</span></div>}
        {mode==="signup"&&(
          <div>
            <div style={{textAlign:"center",marginTop:16,fontSize:12,color:"#7a7590"}}>Already have an account? <span onClick={()=>switchMode("login")} style={{color:"#6366f1",cursor:"pointer"}}>Sign in</span></div>
            <div style={{marginTop:16,padding:"12px 14px",background:"rgba(255,255,255,.04)",borderRadius:9,border:"1px solid rgba(255,255,255,.1)"}}>
              <div style={{fontSize:11,color:"#7a7590",lineHeight:1.7,textAlign:"center"}}>
                By creating an account you agree to our{" "}
                <a href="/terms" target="_blank" rel="noreferrer" style={{color:"#6366f1"}}>Terms of Service</a>
                {" "}and{" "}
                <a href="/privacy" target="_blank" rel="noreferrer" style={{color:"#6366f1"}}>Privacy Policy</a>.
              </div>
            </div>
            <div style={{marginTop:10,padding:"10px 14px",background:"rgba(199,91,18,.08)",borderRadius:9,border:"1px solid rgba(199,91,18,.2)"}}>
              <div style={{fontSize:11,color:"#d97706",lineHeight:1.6,textAlign:"center"}}>
                ⚠️ AI features are planning tools — not guarantees of academic outcomes. Always verify dates with your official syllabus.
              </div>
            </div>
          </div>
        )}
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
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#0f0f13,#1a1a2e)",fontFamily:"'Inter',system-ui,sans-serif",padding:16}}>
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
          <div style={{flex:1}}>
            <div style={{fontSize:13,color:"#e8e3d8",fontWeight:p.university===u.id?600:400}}>{u.name}</div>
            {u.mascot&&<div style={{fontSize:10,color:"#7a7590"}}>{u.mascot}</div>}
          </div>
          <div style={{display:"flex",gap:3}}>{[u.primary,u.secondary,u.accent].map((c,i)=><div key={i} style={{width:10,height:10,borderRadius:2,background:c}}/>)}</div>
        </div>
      ))}
    </div>
    {/* Custom school name input — shows when Other is selected */}
    {p.university==="custom"&&(
      <div style={{marginTop:12,padding:"12px 14px",background:"rgba(59,74,107,.15)",border:"1px solid rgba(59,74,107,.4)",borderRadius:10}}>
        <div style={{fontSize:11,color:"#7a7590",marginBottom:7}}>Enter your school name:</div>
        <input
          value={p.university_name||""}
          onChange={e=>setP(x=>({...x,university_name:e.target.value}))}
          placeholder="e.g. University of Texas at San Antonio"
          style={{width:"100%",background:"#0f0f13",border:"1px solid #2a2a38",borderRadius:8,padding:"10px 12px",color:"#e8e3d8",fontSize:14,outline:"none",fontFamily:"inherit"}}
          autoFocus
        />
        <div style={{fontSize:10,color:"#7a7590",marginTop:6}}>Your app will use a standard ProPlan Scholar theme.</div>
      </div>
    )}
    {nextBtn("Continue →", p.university==="custom"&&!p.university_name)}
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
      {nextBtn("Launch ProPlan Scholar 🚀",false,finish)}
    </>}
  </>);

  return null;
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function ProPlanScholar(){
  const t=today();

  // Auth state
  const[authUser,setAuthUser]=useState(null);
  const[authLoading,setAuthLoading]=useState(true);
  const[profile,setProfile]=useState(null);

  // UI state
  const[view,setView]=useState(()=>{
    // Read initial view from URL hash so deep links work
    const hash=window.location.hash.replace("#","");
    const validViews=["dashboard","calendar","assignments","courses","schedule","major-project","flashcards","analytics","settings"];
    return validViews.includes(hash)?hash:"dashboard";
  });
  const[dark,setDark]=useState(()=>window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);
  const[sidebarOpen,setSidebar]=useState(true);
  const[isMobile,setIsMobile]=useState(()=>typeof window!=="undefined"&&window.innerWidth<=768);
  const[installPrompt,setInstallPrompt]=useState(null); // PWA install prompt
  const[showInstallBanner,setShowInstallBanner]=useState(false);

  useEffect(()=>{
    function handleResize(){const mobile=window.innerWidth<=768;setIsMobile(mobile);if(mobile)setSidebar(false);}
    handleResize();
    window.addEventListener("resize",handleResize);
    // Listen for PWA install prompt (Android Chrome)
    function handleInstall(e){e.preventDefault();setInstallPrompt(e);setShowInstallBanner(true);}
    window.addEventListener("beforeinstallprompt",handleInstall);
    return()=>{window.removeEventListener("resize",handleResize);window.removeEventListener("beforeinstallprompt",handleInstall);};
  },[]);
  const[chatOpen,setChatOpen]=useState(false);

  // Data state — all loaded from Supabase per user
  const[courses,setCourses]=useState([]);
  const[assignments,setAssignments]=useState([]);
  const[studyBlocks,setStudyBlocks]=useState([]);
  const[completedStudy,setCompletedStudy]=useState({}); // {blockId: true}
  const[showTimeTracker,setShowTimeTracker]=useState(false);
  const[calToken,setCalToken]=useState(null);
  const[calCopied,setCalCopied]=useState(false);
  const[userPhone,setUserPhone]=useState(""); // for SMS reminders
  // Push notifications
  const[pushSupported,setPushSupported]=useState(false);
  const[pushPermission,setPushPermission]=useState(typeof Notification!=="undefined"?Notification.permission:"default");
  const[pushSubscribed,setPushSubscribed]=useState(false);
  const[pushBusy,setPushBusy]=useState(false);
  const[canvasUrl,setCanvasUrl]=useState(""); // Canvas LMS URL
  const[canvasToken,setCanvasToken]=useState(""); // Canvas API token
  const[canvasImporting,setCanvasImporting]=useState(false);
  const[integrationTab,setIntegrationTab]=useState("outlook"); // active integration tab
  const[trackerCategory,setTrackerCategory]=useState(null); // drill-down category
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
  const[loaderMsgIndex,setLoaderMsgIndex]=useState(0);
  const[isDragging,setIsDragging]=useState(false);
  const[showSyllabusViewer,setShowSyllabusViewer]=useState(null); // course object
  // MFA (Two-Factor Authentication) state for the Settings tile + enrollment modal
  const[mfaFactors,setMfaFactors]=useState([]); // existing factors from supabase.auth.mfa.listFactors()
  const[showMfaEnroll,setShowMfaEnroll]=useState(null); // {id, qr_code, secret} when mid-enrollment
  const[mfaEnrollCode,setMfaEnrollCode]=useState("");
  const[mfaBusy,setMfaBusy]=useState(false);
  const[feedbackText,setFeedbackText]=useState("");
  const[feedbackType,setFeedbackType]=useState("suggestion");
  const[feedbackSent,setFeedbackSent]=useState(false);
  const[feedbackSending,setFeedbackSending]=useState(false);
  const[notification,setNotification]=useState("");
  const[newAssign,setNewAssign]=useState({courseId:"",title:"",due:"",type:"",estHours:4});
  const[editAssign,setEditAssign]=useState(null); // holds assignment being edited
  const[newCourse,setNewCourse]=useState({name:"",difficulty:3,color:"#6366f1",professor:"",class_days:[],class_time:"",class_end_time:""});
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

  // RMP + ProPlan Scholar professor ratings state
  const[rmpResults,setRmpResults]=useState({});
  const[profRatings,setProfRatings]=useState([]); // community ratings from all users
  const[showRateModal,setShowRateModal]=useState(null); // {courseId, profName}
  const[showSearchProf,setShowSearchProf]=useState(null); // courseId searching community ratings
  const[newRating,setNewRating]=useState({quality:0,difficulty:0,workload:0,wouldTakeAgain:null,comment:""});
  const[profSearch,setProfSearch]=useState("");

  // Chat state
  const[chatMessages,setChatMessages]=useState([{role:"assistant",content:"Hi! I am your ProPlan Scholar AI assistant. I know your schedule, courses, and commitments. Ask me anything!"}]);
  const[chatInput,setChatInput]=useState("");
  const[chatLoading,setChatLoading]=useState(false);
  const chatEndRef=useRef(null);

  // Calendar state
  const[calYear,setCalYear]=useState(t.year);
  const[calMonth,setCalMonth]=useState(t.month);
  const[selectedDay,setSelectedDay]=useState(t.day);

  // Confirmation modal state
  const[confirmModal,setConfirmModal]=useState(null); // {message, onConfirm, detail}
  // Major Project state
  const[showReflection,setShowReflection]=useState(false);
  const[weeklyReflection,setWeeklyReflection]=useState("");

  // Grade tracking state
  const[grades,setGrades]=useState([]); // [{id, assignmentId, courseId, score, maxScore}]
  const[showGradeModal,setShowGradeModal]=useState(null); // assignment to grade
  const[gradeInput,setGradeInput]=useState({score:"",maxScore:100}); // controlled inputs for grade modal
  const[gpaTarget,setGpaTarget]=useState(null); // target GPA for what-if calculator

  // Focus timer state
  const[focusTimer,setFocusTimer]=useState(null); // {blockId, blockTitle, courseColor, startedAt, duration, remaining, isPaused, breakMode}
  const focusInterval=useRef(null);
  const mainRef=useRef(null);

  // Streak state
  const[studyStreak,setStudyStreak]=useState(0);
  const[longestStreak,setLongestStreak]=useState(0);

  const uniRaw=UNIVERSITIES.find(u=>u.id===profile?.university)||UNIVERSITIES[0];
  const uni={...uniRaw,name:profile?.university==="custom"&&profile?.university_name?profile.university_name:uniRaw.name,logo:profile?.university==="custom"?"🎓":uniRaw.logo};
  // Feature gating — plan is "free" until Stripe sets it to "pro"
  const isPro=profile?.plan==="pro";
  const FREE_SYLLABUS_LIMIT=2; // max syllabi imports per semester on free plan
  const syllabusCount=courses.filter(c=>c.imported_at).length; // count AI-imported courses
  const T=buildTheme(profile?.university_primary||"#6366f1",dark);
  const rgb=hexToRgb(T.accent);

  // ── Dynamic favicon + browser-chrome color — updates to school color ──────
  useEffect(()=>{
    const color=profile?.university_primary||"#C75B12";
    // 1) Re-skin the favicon SVG with the student's school color
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0e0e14"/><text x="32" y="50" text-anchor="middle" font-family="Georgia,serif" font-weight="bold" font-size="46" fill="${color}">P</text></svg>`;
    const blob=new Blob([svg],{type:"image/svg+xml"});
    const url=URL.createObjectURL(blob);
    let link=document.querySelector("link[rel='icon']");
    if(!link){link=document.createElement("link");link.rel="icon";document.head.appendChild(link);}
    link.type="image/svg+xml";
    link.href=url;
    // 2) Update <meta name="theme-color"> so the iPhone PWA status bar and
    //    Android Chrome browser bar take on the school color too.
    let themeMeta=document.querySelector("meta[name='theme-color']");
    if(!themeMeta){themeMeta=document.createElement("meta");themeMeta.name="theme-color";document.head.appendChild(themeMeta);}
    themeMeta.content=color;
    return()=>URL.revokeObjectURL(url);
  },[profile?.university_primary]);

  // ── Scroll to top on view change ──────────────────────────────────────────
  useEffect(()=>{
    if(mainRef.current)mainRef.current.scrollTop=0;
    window.scrollTo(0,0);
  },[view]);

  // ── Auth setup ─────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!supabase){setAuthLoading(false);return;}
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
  // Sync view to browser history so back/forward buttons work
  useEffect(()=>{
    if(!authUser||!profile?.onboarding_complete)return;
    const current=window.location.hash.replace("#","");
    if(current!==view){
      window.history.pushState({view},"",'#'+view);
    }
  },[view,authUser,profile?.onboarding_complete]);

  // Handle browser back/forward button
  useEffect(()=>{
    function onPopState(e){
      const hash=window.location.hash.replace("#","");
      const validViews=["dashboard","calendar","assignments","courses","schedule","major-project","flashcards","analytics","settings"];
      if(validViews.includes(hash))setView(hash);
      else setView("dashboard");
    }
    window.addEventListener("popstate",onPopState);
    return()=>window.removeEventListener("popstate",onPopState);
  },[]);

  // Reset transient UI state when navigating between views
  useEffect(()=>{
    setCourses(prev=>prev.map(c=>c._editSched?{...c,_editSched:false}:c));
  },[view]);

  useEffect(()=>{generateStudyBlocks();},[assignments,courses,workSched,travelDates,scheduleBlocks]);
  useEffect(()=>{chatEndRef.current?.scrollIntoView({behavior:"smooth"});},[chatMessages,chatOpen]);

  useEffect(()=>{
    // Calculate current streak: consecutive days with at least one completed study block
    const completedDates=new Set();
    studyBlocks.forEach(b=>{if(completedStudy[b.id])completedDates.add(b.date);});
    // Also count days where energy was logged as activity
    energyLog.forEach(e=>completedDates.add(e.date));
    const todayStr=dateKey(t.year,t.month,t.day);
    const yesterdayD=new Date();yesterdayD.setDate(yesterdayD.getDate()-1);
    const yesterdayStr=dateKey(yesterdayD.getFullYear(),yesterdayD.getMonth(),yesterdayD.getDate());

    let streak=0;
    // Start counting from today or yesterday
    let checkDate=new Date();
    if(!completedDates.has(todayStr)){
      // If nothing today, streak can still be alive if yesterday was active
      if(!completedDates.has(yesterdayStr)){setStudyStreak(0);return;}
      checkDate.setDate(checkDate.getDate()-1);
    }
    while(true){
      const ds=dateKey(checkDate.getFullYear(),checkDate.getMonth(),checkDate.getDate());
      if(completedDates.has(ds)){streak++;checkDate.setDate(checkDate.getDate()-1);}
      else break;
    }
    setStudyStreak(streak);
    setLongestStreak(prev=>Math.max(prev,streak));
  },[completedStudy,studyBlocks,energyLog]);

  async function loadProfile(){
    const{data}=await supabase.from("profiles").select("*").eq("id",authUser.id).single();
    if(data){setProfile(data);if(data.dark_mode!==undefined)setDark(data.dark_mode);if(data.phone)setUserPhone(data.phone);if(data.canvas_url)setCanvasUrl(data.canvas_url);if(data.work_schedule&&typeof data.work_schedule==='object')setWorkSched(ws=>({...ws,...data.work_schedule}));}
    else setProfile({id:authUser.id,onboarding_complete:false});
  }

  async function loadAllData(){
    const uid=authUser.id;
    const[c,a,m,sb,td,el,pr]=await Promise.all([
      supabase.from("courses").select("*").eq("user_id",uid).order("created_at"),
      supabase.from("assignments").select("*").eq("user_id",uid).order("created_at"),
      supabase.from("milestones").select("*").eq("user_id",uid).order("due_date"),
      supabase.from("schedule_blocks").select("*").eq("user_id",uid),
      supabase.from("travel_dates").select("*").eq("user_id",uid),
      supabase.from("energy_log").select("*").eq("user_id",uid),
      supabase.from("professor_ratings").select("*").order("created_at",{ascending:false}),
    ]);
    // Grades table loaded separately so a missing table doesn't break everything
    let gr={data:null};
    try{gr=await supabase.from("grades").select("*").eq("user_id",uid);}catch(e){/* grades table may not exist yet */}
    if(c.data)setCourses(c.data.map(x=>({...x,rmpData:x.rmp_data})));
    if(a.data)setAssignments(a.data.map(x=>({...x,courseId:x.course_id,due:x.due_date,estHours:x.est_hours,flashcards:x.flashcards||[]})));
    if(m.data)setMilestones(m.data.map(x=>({...x,due:x.due_date})));
    if(sb.data)setScheduleBlocks(sb.data);
    if(td.data)setTravelDates(td.data.map(x=>({...x,start:x.start_date,end:x.end_date})));
    if(el.data)setEnergyLog(el.data.map(x=>({date:x.log_date,level:x.level})));
    if(pr.data)setProfRatings(pr.data);
    if(gr.data)setGrades(gr.data.map(x=>({...x,assignmentId:x.assignment_id,courseId:x.course_id,maxScore:x.max_score})));
    // Load or create calendar token
    try{const{data:tokData}=await supabase.from("calendar_tokens").select("token").eq("user_id",uid).single();if(tokData?.token){setCalToken(tokData.token);}}catch(e){/* table may not exist yet, ignore */}
  }

  function notify(msg){setNotification(msg);setTimeout(()=>setNotification(""),3500);}

  // ── Feature gate helper ───────────────────────────────────────────────────
  function ProGate({feature,children}){
    if(isPro)return children;
    return(
      <div style={{padding:"16px",background:dark?"rgba(199,91,18,.08)":"rgba(199,91,18,.05)",border:`1px solid rgba(${rgb},.3)`,borderRadius:12,textAlign:"center"}}>
        <div style={{fontSize:20,marginBottom:8}}>🔒</div>
        <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>Pro Feature</div>
        <div style={{fontSize:12,color:T.muted,marginBottom:12}}>{feature} is available on the Pro plan.</div>
        <button className="bp" style={{fontSize:12,padding:"8px 20px"}} onClick={()=>notify("Stripe payments coming soon! You'll be able to upgrade for $5/month.")}>
          Upgrade to Pro — $5/mo
        </button>
      </div>
    );
  }
  function showConfirm(message,onConfirm,detail=""){setConfirmModal({message,onConfirm,detail});}

  // ── Study scheduler (respects work, sports, greek, travel) ─────────────────
  function getStudyWindow(dateStr){
    const dayName=DAYS_SHORT[new Date(dateStr+"T00:00:00").getDay()];

    // 1. Travel days — completely blocked
    if(travelDates.some(tr=>dateStr>=tr.start&&dateStr<=tr.end)){
      return{available:false,slot:"Traveling"};
    }

    // 2. Build a list of ALL committed time blocks for this day
    // including work schedule AND all activity blocks (sports, greek, work events)
    const committed=[]; // [{start:H, end:H, label}]

    const ws=workSched[dayName];
    if(ws?.work&&ws.start&&ws.end){
      const wStart=parseInt(ws.start.split(":")[0]);
      const wEnd=parseInt(ws.end.split(":")[0]);
      if(wEnd>wStart) committed.push({start:wStart,end:wEnd,label:"Work"});
    }

    // Activity blocks for this day (recurring by day name OR specific date)
    const dayBlocks=scheduleBlocks.filter(b=>
      b.day_of_week===dayName||b.date_specific===dateStr
    );
    dayBlocks.forEach(b=>{
      const bStart=parseInt((b.start_time||"15:00").split(":")[0]);
      const bEnd=parseInt((b.end_time||"17:00").split(":")[0]);
      if(bEnd>bStart) committed.push({start:bStart,end:bEnd,label:b.label||b.block_type});
    });

    // 3. Calculate total blocked hours
    const totalBlocked=committed.reduce((sum,c)=>sum+Math.max(0,c.end-c.start),0);

    // If 13+ hours blocked out of 15 usable (7am-10pm), skip this day
    if(totalBlocked>=13) return{available:false,slot:"Day fully booked"};

    // 4. Nothing committed — whole day free
    if(committed.length===0) return{available:true,slot:"All day — pick your best time"};

    // 5. Find the best study window by looking at gaps
    // Sort all committed blocks by start time
    const sorted=[...committed].sort((a,b)=>a.start-b.start);

    // Find the latest end time across ALL commitments
    const latestEnd=sorted.reduce((max,c)=>Math.max(max,c.end),0);
    // Find the earliest start time across ALL commitments
    const earliestStart=sorted.reduce((min,c)=>Math.min(min,c.start),24);

    // Check morning window: is there 2+ hours free before the first commitment?
    // Morning = 7am to first commitment start
    const morningFree=earliestStart-7;
    // Evening window: after the last commitment ends (up to 10pm = hour 22)
    const eveningFree=22-latestEnd;

    // Prefer evening (most common for students), but offer morning if it's substantial
    if(morningFree>=2&&eveningFree>=2){
      return{available:true,slot:`Morning before ${earliestStart}:00 or Evening after ${latestEnd}:00`};
    }
    if(morningFree>=2){
      return{available:true,slot:`Morning before ${earliestStart}:00`};
    }
    if(eveningFree>=2){
      return{available:true,slot:`Evening after ${latestEnd}:00`};
    }

    // Check midday gaps (between commitments)
    for(let i=0;i<sorted.length-1;i++){
      const gapStart=sorted[i].end;
      const gapEnd=sorted[i+1].start;
      if(gapEnd-gapStart>=2){
        return{available:true,slot:`Midday ${gapStart}:00–${gapEnd}:00`};
      }
    }

    // Less than 2 hours free anywhere — skip this day
    return{available:false,slot:"Day fully booked"};
  }

  function generateStudyBlocks(){
    const blocks=[];
    const dailyCount={};
    const dailyNextStart={};

    // ── Degree level multiplier ───────────────────────────────────────────────
    // Doctoral work requires significantly more preparation than undergraduate
    const degreeMult={
      associates:  0.8,
      undergrad:   1.0,
      graduate:    1.3,
      doctoral:    1.6,
      postdoc:     1.8,
    }[profile?.degree_level] || 1.0;

    // ── Assignment type multiplier ────────────────────────────────────────────
    // Exams need extra prep; discussions/homework need less
    function typeMult(type){
      const map={
        exam:        1.5, // all degree levels — exams always need more prep
        paper:       1.3,
        project:     1.2,
        case:        1.1,
        homework:    0.8,
        discussion:  0.7,
      };
      return map[type?.toLowerCase()] || 1.0;
    }

    const pendingAssignments=assignments.filter(a=>!a.done&&daysUntil(a.due)>=0).sort((a,b)=>new Date(a.due)-new Date(b.due));

    pendingAssignments.forEach(assign=>{
      const course=courses.find(c=>c.id===assign.courseId);
      const profStats=course?.professor?getProfStats(course.professor,uni.name):null;
      const diff=profStats?Math.round((course.difficulty+profStats.difficulty)/2):course?.rmpData?Math.round((course.difficulty+rmpToInternal(course.rmpData.avgDifficulty))/2):course?.difficulty||3;

      // Apply all three multipliers:
      // 1. Course difficulty (1-5 scale normalized to 1.0 at diff=3)
      // 2. Degree level (doctoral work needs more prep than undergrad)
      // 3. Assignment type (exams need more prep than discussions)
      const diffMult=diff/3;
      const assignTypeMult=typeMult(assign.type);
      const adjustedHours=assign.estHours * diffMult * degreeMult * assignTypeMult;
      const sessions=Math.ceil(adjustedHours/2);
      let placed=0;
      let checkDay=new Date();checkDay.setHours(0,0,0,0);
      const dueDay=new Date(assign.due+"T00:00:00");

      while(placed<sessions&&checkDay<dueDay){
        const dateStr=checkDay.toISOString().slice(0,10);
        const win=getStudyWindow(dateStr);
        const alreadyOnDay=dailyCount[dateStr]||0;

        if(win.available&&!blocks.find(b=>b.date===dateStr&&b.assignId===assign.id)&&alreadyOnDay<2){
          // Get the base start hour from the window
          let baseStartH=18; // default evening
          if(win.slot.includes("All day"))baseStartH=9;
          else if(win.slot.startsWith("Morning before")){
            const h=win.slot.match(/before (\d+)/);baseStartH=h?parseInt(h[1])-2:7;
          }else if(win.slot.startsWith("Midday")){
            const h=win.slot.match(/Midday (\d+):/);if(h)baseStartH=parseInt(h[1]);
          }else if(win.slot.includes("after")||win.slot.includes("After")){
            const h=win.slot.match(/after (\d+)/i);if(h)baseStartH=parseInt(h[1])+1;
          }else if(win.slot.includes("Morning")){baseStartH=8;}

          // Use the next available start for this day (no overlaps)
          // If this is the first session of the day, use the base; otherwise chain from last end
          const startH=Math.max(baseStartH,dailyNextStart[dateStr]||baseStartH);
          const endH=startH+2;

          // Don't schedule past 22:00 (10 PM)
          if(endH>22){checkDay.setDate(checkDay.getDate()+1);continue;}

          const studyStart=`${String(startH).padStart(2,"0")}:00`;
          const studyEnd=`${String(endH).padStart(2,"0")}:00`;

          blocks.push({
            id:`${assign.id}-${dateStr}`,
            assignId:assign.id,
            courseId:assign.courseId,
            title:assign.title, // just the assignment title, not "Study: ..."
            date:dateStr,
            slot:win.slot,
            startTime:studyStart,
            endTime:studyEnd,
            hours:2,
            color:course?.color||"#6366f1",
            completed:false,
          });
          // Advance the next available slot for this day
          dailyNextStart[dateStr]=endH;
          dailyCount[dateStr]=(dailyCount[dateStr]||0)+1;
          placed++;
        }
        checkDay.setDate(checkDay.getDate()+1);
      }
    });
    setStudyBlocks(blocks);
  }

  function toggleStudyComplete(blockId){
    const wasComplete=completedStudy[blockId];
    const updated={...completedStudy,[blockId]:!wasComplete};
    setCompletedStudy(updated);
    const block=studyBlocks.find(b=>b.id===blockId);
    if(block&&!wasComplete){
      const totalDoneHrs=Object.keys(updated).filter(k=>updated[k]).length*2;
      if(totalDoneHrs>=6){
        notify("🌿 Great work! You've studied "+totalDoneHrs+"h today. Remember to take a break, eat something, and move around.");
      } else if(totalDoneHrs>=4){
        notify("✓ "+totalDoneHrs+"h done! Consider a 15-min break to stay sharp.");
      } else {
        notify(`✓ Study session complete! (+${block.hours}h)`);
      }
    }
  }

  // ── CRUD — all saved to Supabase ───────────────────────────────────────────
  async function addCourse(){
    if(!newCourse.name)return notify("Enter a course name.");
    const{data,error}=await supabase.from("courses").insert({user_id:authUser.id,name:newCourse.name,difficulty:newCourse.difficulty,color:newCourse.color,professor:newCourse.professor||"",class_days:newCourse.class_days||[],class_time:newCourse.class_time||"",class_end_time:newCourse.class_end_time||""}).select().single();
    if(error)return notify("Error saving course.");
    setCourses(p=>[...p,{...data,rmpData:null}]);
    setShowAddCourse(false);setNewCourse({name:"",difficulty:3,color:"#6366f1",professor:"",class_days:[],class_time:"",class_end_time:""});notify("Course added!");
  }

  function deleteCourse(id){
    const count=assignments.filter(a=>a.courseId===id).length;
    showConfirm(
      "Drop this course?",
      async()=>{
        await supabase.from("assignments").delete().eq("course_id",id);
        await supabase.from("courses").delete().eq("id",id);
        setCourses(p=>p.filter(c=>c.id!==id));
        setAssignments(p=>p.filter(a=>a.courseId!==id));
        notify("Course dropped.");
      },
      count>0?`This will also permanently remove ${count} assignment${count>1?"s":""} for this course.`:"This action cannot be undone."
    );
  }

  async function addAssignment(){
    if(!newAssign.title||!newAssign.due)return notify("Fill in title and due date.");
    const cid=newAssign.courseId||courses[0]?.id;
    if(!cid)return notify("Add a course first.");
    const{data,error}=await supabase.from("assignments").insert({user_id:authUser.id,course_id:cid,title:newAssign.title,due_date:newAssign.due,type:newAssign.type,est_hours:newAssign.estHours,done:false,topics:newAssign.topics||"",flashcards:[]}).select().single();
    if(error)return notify("Error saving.");
    setAssignments(p=>[...p,{...data,courseId:data.course_id,due:data.due_date,estHours:data.est_hours,flashcards:[]}]);
    setShowAddAssign(false);setNewAssign({courseId:courses[0]?.id||"",title:"",due:"",type:"",estHours:4,topics:""});notify("Assignment added!");
  }

  async function saveEditAssignment(){
    if(!editAssign?.title||!editAssign?.due)return notify("Title and due date are required.");
    const{error}=await supabase.from("assignments").update({
      title:editAssign.title,
      due_date:editAssign.due,
      type:editAssign.type,
      est_hours:editAssign.estHours,
      course_id:editAssign.courseId,
      topics:editAssign.topics||"",
    }).eq("id",editAssign.id);
    if(error)return notify("Error saving changes.");
    setAssignments(p=>p.map(a=>a.id===editAssign.id?{...a,...editAssign,due:editAssign.due,estHours:editAssign.estHours,courseId:editAssign.courseId}:a));
    setEditAssign(null);notify("Assignment updated!");
  }

  function deleteAssignment(id){
    const a=assignments.find(x=>x.id===id);
    showConfirm(
      "Delete this assignment?",
      async()=>{
        await supabase.from("assignments").delete().eq("id",id);
        setAssignments(p=>p.filter(x=>x.id!==id));
        notify("Assignment deleted.");
      },
      a?`"${a.title}" will be permanently removed.`:""
    );
  }

  async function saveGrade(assignmentId, courseId, score, maxScore){
    if(score===""||score===null||isNaN(score)){notify("Please enter a score.");return;}
    if(!maxScore||isNaN(maxScore)||maxScore<=0){notify("Max score must be greater than 0.");return;}
    const numScore=Number(score);
    const numMax=Number(maxScore);
    const existing=grades.find(g=>g.assignmentId===assignmentId);
    try{
      if(existing){
        const{error}=await supabase.from("grades").update({score:numScore,max_score:numMax}).eq("id",existing.id);
        if(error)throw error;
        setGrades(p=>p.map(g=>g.id===existing.id?{...g,score:numScore,maxScore:numMax}:g));
      } else {
        const{data,error}=await supabase.from("grades").insert({user_id:authUser.id,assignment_id:assignmentId,course_id:courseId,score:numScore,max_score:numMax}).select().single();
        if(error)throw error;
        if(data)setGrades(p=>[...p,{...data,assignmentId:data.assignment_id,courseId:data.course_id,maxScore:data.max_score}]);
      }
      setShowGradeModal(null);
      notify("Grade saved!");
    }catch(err){
      console.error("saveGrade error:",err);
      notify(`Could not save grade: ${err.message||err}. ${err.message?.includes("does not exist")?"Run SUPABASE_MIGRATION_grades.sql in Supabase first.":""}`);
    }
  }

  async function deleteGrade(assignmentId){
    const existing=grades.find(g=>g.assignmentId===assignmentId);
    if(!existing){setShowGradeModal(null);return;}
    if(!confirm("Remove the recorded grade for this assignment?"))return;
    try{
      const{error}=await supabase.from("grades").delete().eq("id",existing.id);
      if(error)throw error;
      setGrades(p=>p.filter(g=>g.id!==existing.id));
      setShowGradeModal(null);
      notify("Grade removed.");
    }catch(err){
      console.error("deleteGrade error:",err);
      notify(`Could not remove grade: ${err.message||err}`);
    }
  }

  // Helper to map a percentage to a letter grade — matches the GPA scale used by calcGPA above
  function pctToLetter(pct){
    if(pct>=93)return"A";
    if(pct>=90)return"A-";
    if(pct>=87)return"B+";
    if(pct>=83)return"B";
    if(pct>=80)return"B-";
    if(pct>=77)return"C+";
    if(pct>=73)return"C";
    if(pct>=70)return"C-";
    if(pct>=67)return"D+";
    if(pct>=63)return"D";
    if(pct>=60)return"D-";
    return"F";
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

  function startFocus(block){
    if(focusInterval.current)clearInterval(focusInterval.current);
    const dur=25*60; // 25 minutes
    setFocusTimer({blockId:block.id,blockTitle:block.title,courseColor:block.color||T.accent,startedAt:Date.now(),duration:dur,remaining:dur,isPaused:false,breakMode:false});
    focusInterval.current=setInterval(()=>{
      setFocusTimer(prev=>{
        if(!prev||prev.isPaused)return prev;
        const rem=prev.remaining-1;
        if(rem<=0){
          clearInterval(focusInterval.current);
          if(!prev.breakMode){
            // Work session done → switch to break
            setTimeout(()=>notify("Focus session complete! Take a 5-minute break."),0);
            const breakDur=5*60;
            // Start break countdown
            focusInterval.current=setInterval(()=>{
              setFocusTimer(p=>{
                if(!p||p.isPaused)return p;
                const r=p.remaining-1;
                if(r<=0){
                  clearInterval(focusInterval.current);
                  setTimeout(()=>notify("Break's over! Ready for another round?"),0);
                  return{...p,remaining:0};
                }
                return{...p,remaining:r};
              });
            },1000);
            return{...prev,remaining:breakDur,breakMode:true,duration:breakDur};
          }
          return{...prev,remaining:0};
        }
        return{...prev,remaining:rem};
      });
    },1000);
  }
  function pauseFocus(){setFocusTimer(p=>p?{...p,isPaused:!p.isPaused}:null);}
  function stopFocus(){
    if(focusInterval.current)clearInterval(focusInterval.current);
    setFocusTimer(prev=>{
      if(prev)setCompletedStudy(p=>({...p,[prev.blockId]:true}));
      return null;
    });
    notify("Study session recorded!");
  }

  // ── Syllabus import ────────────────────────────────────────────────────────
  // Wrapper used by file <input> change handlers
  async function handleSyllabusUpload(e){
    const file=e.target.files[0];
    // Reset the input so the same file can be re-selected later
    try{e.target.value="";}catch{}
    if(!file)return;
    return processSyllabusFile(file);
  }

  // Core handler — accepts a File object directly (used by both file picker AND drag-and-drop)
  async function processSyllabusFile(file){
    if(!file)return;
    // Fast-fail if the user isn't signed in — the server proxy will reject anyway,
    // but checking here lets us avoid the loader flash and show a clearer message.
    const{data:{session:_sess}}=await supabase.auth.getSession();
    if(!_sess?.access_token){
      setUploadMsg("Please sign in to analyze a syllabus.");
      notify("You need to be signed in to analyze a syllabus.");
      return;
    }
    setUploading(true);setUploadMsg("Reading file...");
    const loaderStart=Date.now();
    const isPDF=file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf");
    // Always capture base64 of original file so we can save it for later viewing
    let originalB64="";
    try{
      originalB64=await new Promise((res,rej)=>{
        const r=new FileReader();
        r.onload=()=>res((r.result||"").toString().split(",")[1]||"");
        r.onerror=()=>rej(new Error("Could not read file"));
        r.readAsDataURL(file);
      });
    }catch(readErr){
      console.warn("Could not read original file as base64:",readErr);
    }
    let originalText="";
    try{
      let result;
      if(isPDF){
        setUploadMsg("Converting PDF...");
        // Re-use base64 (FileReader was already called above)
        const base64=originalB64;
        setUploadMsg("Sending PDF to AI...");
        // Goes through the server proxy — the Anthropic key never touches the browser.
        const data=await claudeProxy({
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
  "professorName": "professor full name or empty string (look in the header, instructor section, contact info, etc.)",
  "difficulty": 3,
  "classDays": ["Mon","Wed"],
  "classTime": "18:00",
  "classEndTime": "20:00",
  "assignments": [
    {
      "title": "assignment name",
      "due": "YYYY-MM-DD",
      "type": "paper",
      "estHours": 4,
      "topics": "key topics covered",
      "weight": 25
    }
  ]
}

For "weight": include this ONLY if the syllabus specifies grade weighting (e.g. "Final Exam = 25%", "Papers worth 40% of final grade"). Express as a number 0-100 representing the percentage that assignment contributes to the final course grade. If the syllabus says "All 5 homework assignments collectively worth 20%", split evenly (each homework weight=4). If the syllabus does NOT specify grade weighting, OMIT the weight field entirely.

For classDays use the days the class actually meets, from this list: Sun, Mon, Tue, Wed, Thu, Fri, Sat. If the syllabus says "MWF" use ["Mon","Wed","Fri"]; "TR" or "T/Th" means ["Tue","Thu"]. Leave classDays as an empty array [] if it's an asynchronous online course or the meeting schedule is not stated.
For classTime and classEndTime use 24-hour format like "13:30" or "18:00". Leave as empty string "" if not stated.
For type use one of: paper, exam, case, homework, project, discussion.
For difficulty use 1-5 (doctoral courses are typically 4-5).
For estHours, estimate the BASE hours to complete the assignment (not including study/review time — that is calculated separately):
  - Discussion posts: 1-2h
  - Homework/quizzes: 1-3h
  - Case studies: 2-4h
  - Projects: 4-10h
  - Papers/essays: 3-8h
  - Exams (base study time before multipliers): 2-4h
  - Doctoral dissertations/proposals: 8-20h
Assume year ${new Date().getFullYear()} when no year is specified.
If a due date is unclear, make your best guess based on context.
Return ONLY the JSON object, nothing else.`}
            ]
          }]
        });
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
        originalText=text;
        setUploadMsg("Analyzing with AI...");
        result=await callClaudeJSON(
          `Parse this academic syllabus. Return ONLY valid JSON: {"courseName":"","professorName":"","difficulty":1-5,"classDays":["Mon","Wed"],"classTime":"18:00","classEndTime":"20:00","assignments":[{"title":"","due":"YYYY-MM-DD","type":"paper|exam|case|homework|project|discussion","estHours":2,"topics":"key topics or description","weight":25}]}. For estHours use BASE completion time only: discussion=1-2h, homework=1-3h, case=2-4h, project=4-10h, paper=3-8h, exam=2-4h, doctoral dissertation=8-20h. For difficulty: 1=very easy, 3=average, 5=very hard (doctoral courses typically 4-5). classDays uses Mon/Tue/Wed/Thu/Fri/Sat/Sun. classTime 24hr format. For weight: include ONLY if syllabus specifies grade weighting (e.g. "Final = 25%"); express as 0-100 percentage; if a category like "all homework worth 20%" covers multiple assignments, split evenly. OMIT entirely when no weighting is specified. Assume year ${new Date().getFullYear()}.`,
          text.slice(0,3500)
        );
      }
      // Save course if new — or fill in any missing professor/class fields on an existing match
      setUploadMsg("Saving course...");
      const existingCourse=courses.find(c=>c.name===result.courseName);
      let cid=existingCourse?.id;
      const validClassDays=(result.classDays||[]).filter(d=>["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].includes(d));
      if(!cid){
        const cols=["#6366f1","#0ea5e9","#ec4899","#10b981","#f59e0b","#8b5cf6"];
        const{data:cd,error:ce}=await supabase.from("courses").insert({
          user_id:authUser.id,
          name:result.courseName||"New Course",
          difficulty:result.difficulty||3,
          color:cols[courses.length%cols.length],
          professor:result.professorName||"",
          class_days:validClassDays,
          class_time:result.classTime||"",
          class_end_time:result.classEndTime||"",
        }).select().single();
        if(ce)throw new Error(`Course save error: ${ce.message}`);
        if(cd){setCourses(p=>[...p,{...cd,rmpData:null}]);cid=cd.id;}
      }else{
        // Course already exists — only fill in fields that are currently EMPTY on the existing
        // course, so we never overwrite something Angela typed in by hand.
        const updates={};
        if(!existingCourse.professor && result.professorName) updates.professor=result.professorName;
        if((!existingCourse.class_days || existingCourse.class_days.length===0) && validClassDays.length>0) updates.class_days=validClassDays;
        if(!existingCourse.class_time && result.classTime) updates.class_time=result.classTime;
        if(!existingCourse.class_end_time && result.classEndTime) updates.class_end_time=result.classEndTime;
        if(Object.keys(updates).length>0){
          try{
            await supabase.from("courses").update(updates).eq("id",cid);
            setCourses(p=>p.map(x=>x.id===cid?{...x,...updates}:x));
          }catch(updErr){
            console.warn("Course field update failed (non-fatal):",updErr);
          }
        }
      }
      // Save the original syllabus file + parsed text on the course (best-effort —
      // requires the optional "syllabus_data" jsonb column. If the column is missing
      // we silently skip so the rest of the import still succeeds.)
      const syllabusBlob={
        filename:file.name,
        filetype:file.type||(isPDF?"application/pdf":"text/plain"),
        size:file.size,
        fileBase64:originalB64||"",
        parsedText:originalText||"",
        uploadedAt:new Date().toISOString(),
      };
      try{
        setUploadMsg("Saving syllabus...");
        const{error:syllErr}=await supabase.from("courses").update({syllabus_data:syllabusBlob}).eq("id",cid);
        if(syllErr){
          console.warn("Could not save syllabus to DB (column may not exist yet):",syllErr.message);
        }else{
          setCourses(p=>p.map(x=>x.id===cid?{...x,syllabus_data:syllabusBlob}:x));
        }
      }catch(syllSaveErr){
        console.warn("Syllabus save failed (non-fatal):",syllSaveErr);
      }
      // Save assignments
      setUploadMsg("Saving assignments...");
      const rows=(result.assignments||[]).map(a=>({
        user_id:authUser.id,course_id:cid,
        title:a.title||"Untitled",
        due_date:a.due||new Date().toISOString().slice(0,10),
        type:a.type||"paper",
        est_hours:a.estHours||4,
        done:false,topics:a.topics||"",flashcards:[],
        ...(a.weight!=null&&!isNaN(Number(a.weight))?{weight:Number(a.weight)}:{}),
      }));
      if(rows.length===0){
        setUploadMsg("No assignments found in this syllabus. Try uploading the original PDF instead of an exported copy, or add the assignments manually.");
        notify("No assignments found in syllabus.");
        // Still respect min-display so the books don't flash off too fast
        const _el=Date.now()-loaderStart;
        if(_el<1500)await new Promise(r=>setTimeout(r,1500-_el));
        setUploading(false);
        return;
      }
      const{data:ad,error:ae}=await supabase.from("assignments").insert(rows).select();
      if(ae)throw new Error(`Assignment save error: ${ae.message}`);
      if(ad)setAssignments(p=>[...p,...ad.map(x=>({...x,courseId:x.course_id,due:x.due_date,estHours:x.est_hours,flashcards:[],weight:x.weight}))]);
      setUploadMsg(`✓ Imported ${rows.length} assignments from ${result.courseName}`);
      notify(`Syllabus imported! ${rows.length} assignments added.`);
    }catch(err){
      console.error("Syllabus upload error:",err);
      // Show the actual error message inline AND as a toast so it's not missed
      const msg=err?.message||"Unknown error";
      setUploadMsg(`Error: ${msg}`);
      notify(`Syllabus upload failed: ${msg}`);
    }
    // Keep the books animation on screen for at least 1.5s so users actually see it,
    // even when the API or parsing finishes very fast (or errors out quickly).
    const elapsed=Date.now()-loaderStart;
    const minDisplay=1500;
    if(elapsed<minDisplay){
      await new Promise(r=>setTimeout(r,minDisplay-elapsed));
    }
    setUploading(false);
  }

  // Drag-and-drop entry point — accepts the dropped file and runs the same flow
  function handleSyllabusDrop(e){
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file=e.dataTransfer?.files?.[0];
    if(!file){notify("No file detected — please try again.");return;}
    const okExt=/\.(pdf|txt|docx)$/i.test(file.name);
    if(!okExt){notify("Please drop a .pdf, .txt, or .docx file.");return;}
    processSyllabusFile(file);
  }
  function handleSyllabusDragOver(e){
    e.preventDefault();
    e.stopPropagation();
    if(e.dataTransfer)e.dataTransfer.dropEffect="copy";
    setIsDragging(true);
  }
  function handleSyllabusDragLeave(e){
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  // Remove the saved syllabus from a course (keeps the course + assignments intact)
  async function deleteSavedSyllabus(courseId){
    if(!confirm("Remove the saved syllabus from this course? Your assignments will not be affected."))return;
    try{
      const{error}=await supabase.from("courses").update({syllabus_data:null}).eq("id",courseId);
      if(error)throw error;
      setCourses(p=>p.map(x=>x.id===courseId?{...x,syllabus_data:null}:x));
      setShowSyllabusViewer(null);
      notify("Syllabus removed.");
    }catch(err){
      console.error(err);
      notify(`Could not remove syllabus: ${err.message||err}`);
    }
  }

  // Trigger a download of the saved original file (PDF/DOCX/TXT)
  function downloadSavedSyllabus(course){
    const s=course?.syllabus_data;
    if(!s||!s.fileBase64){notify("Original file not available for this syllabus.");return;}
    try{
      const byteChars=atob(s.fileBase64);
      const bytes=new Uint8Array(byteChars.length);
      for(let i=0;i<byteChars.length;i++)bytes[i]=byteChars.charCodeAt(i);
      const blob=new Blob([bytes],{type:s.filetype||"application/octet-stream"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;a.download=s.filename||"syllabus";
      document.body.appendChild(a);a.click();
      setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},100);
    }catch(err){
      console.error("Download error:",err);
      notify("Could not download file.");
    }
  }

  // Rotate loader status messages while AI is working
  useEffect(()=>{
    if(!uploading){setLoaderMsgIndex(0);return;}
    const id=setInterval(()=>setLoaderMsgIndex(i=>i+1),2200);
    return()=>clearInterval(id);
  },[uploading]);

  // ── MFA (Two-Factor Authentication) ─────────────────────────────────────
  // Load this user's existing TOTP factors so we can show enabled/disabled state
  async function refreshMfaFactors(){
    try{
      const{data,error}=await supabase.auth.mfa.listFactors();
      if(error)throw error;
      setMfaFactors(data?.totp||[]);
    }catch(err){
      console.warn("Could not load MFA factors:",err);
    }
  }
  useEffect(()=>{if(authUser)refreshMfaFactors();},[authUser?.id]);

  // Begin enrollment: ask Supabase for a new TOTP factor + QR code
  async function startMfaEnroll(){
    setMfaBusy(true);
    try{
      const{data,error}=await supabase.auth.mfa.enroll({factorType:"totp",friendlyName:`ProPlan Scholar (${new Date().toLocaleDateString()})`});
      if(error)throw error;
      // data: { id, type:"totp", totp:{ qr_code:"<svg>...</svg>", secret:"...", uri:"..." } }
      setShowMfaEnroll({factorId:data.id,qrSvg:data.totp.qr_code,secret:data.totp.secret,uri:data.totp.uri});
      setMfaEnrollCode("");
    }catch(err){
      notify(`Could not start MFA enrollment: ${err.message||err}`);
    }finally{
      setMfaBusy(false);
    }
  }

  // Verify the 6-digit code to finish enrollment
  async function verifyMfaEnroll(){
    if(!showMfaEnroll||mfaEnrollCode.length<6)return;
    setMfaBusy(true);
    try{
      const{data:ch,error:che}=await supabase.auth.mfa.challenge({factorId:showMfaEnroll.factorId});
      if(che)throw che;
      const{error:ve}=await supabase.auth.mfa.verify({factorId:showMfaEnroll.factorId,challengeId:ch.id,code:mfaEnrollCode.trim()});
      if(ve)throw ve;
      setShowMfaEnroll(null);
      setMfaEnrollCode("");
      await refreshMfaFactors();
      notify("Two-factor authentication enabled!");
    }catch(err){
      notify(`Invalid code: ${err.message||"please try again"}`);
      setMfaEnrollCode("");
    }finally{
      setMfaBusy(false);
    }
  }

  async function cancelMfaEnroll(){
    if(showMfaEnroll){
      // Remove the unverified factor we just created so it doesn't linger
      try{await supabase.auth.mfa.unenroll({factorId:showMfaEnroll.factorId});}catch{}
    }
    setShowMfaEnroll(null);
    setMfaEnrollCode("");
  }

  async function disableMfa(factorId){
    if(!confirm("Disable two-factor authentication? Your account will be less secure."))return;
    setMfaBusy(true);
    try{
      const{error}=await supabase.auth.mfa.unenroll({factorId});
      if(error)throw error;
      await refreshMfaFactors();
      notify("Two-factor authentication disabled.");
    }catch(err){
      notify(`Could not disable MFA: ${err.message||err}`);
    }finally{
      setMfaBusy(false);
    }
  }

  // ── Push notifications ────────────────────────────────────────────────────
  // VAPID public key from Vercel env (matches the private key the cron uses)
  const VAPID_PUBLIC=import.meta.env.VITE_VAPID_PUBLIC_KEY||"";

  function urlB64ToUint8Array(base64String){
    const padding="=".repeat((4-base64String.length%4)%4);
    const base64=(base64String+padding).replace(/-/g,"+").replace(/_/g,"/");
    const raw=atob(base64);
    const out=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
    return out;
  }

  // Register the push service worker on app load (once auth is known)
  useEffect(()=>{
    if(typeof window==="undefined")return;
    const supported="serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setPushSupported(supported);
    if(!supported)return;
    setPushPermission(Notification.permission);
    (async()=>{
      try{
        const reg=await navigator.serviceWorker.register("/sw-push.js",{scope:"/"});
        await navigator.serviceWorker.ready;
        const existing=await reg.pushManager.getSubscription();
        setPushSubscribed(!!existing);
      }catch(e){
        console.warn("sw-push register failed:",e);
      }
    })();
  },[]);

  async function subscribePush(){
    if(!authUser){notify("Please sign in first.");return;}
    if(!VAPID_PUBLIC){notify("Push not configured (missing VAPID key).");return;}
    setPushBusy(true);
    try{
      const perm=await Notification.requestPermission();
      setPushPermission(perm);
      if(perm!=="granted"){notify("Notifications were blocked. Re-enable in browser settings to subscribe.");return;}
      const reg=await navigator.serviceWorker.ready;
      const sub=await reg.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:urlB64ToUint8Array(VAPID_PUBLIC),
      });
      const{data:{session}}=await supabase.auth.getSession();
      const token=session?.access_token||"";
      const resp=await fetch("/api/push/subscribe",{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
        body:JSON.stringify({subscription:sub.toJSON(),userAgent:navigator.userAgent}),
      });
      if(!resp.ok){const t=await resp.text();throw new Error(`Subscribe failed: ${resp.status} ${t}`);}
      setPushSubscribed(true);
      notify("Push notifications enabled!");
    }catch(err){
      console.error("subscribePush:",err);
      notify(`Could not enable push: ${err.message||err}`);
    }finally{
      setPushBusy(false);
    }
  }

  async function unsubscribePush(){
    setPushBusy(true);
    try{
      const reg=await navigator.serviceWorker.ready;
      const sub=await reg.pushManager.getSubscription();
      if(!sub){setPushSubscribed(false);return;}
      const endpoint=sub.endpoint;
      await sub.unsubscribe();
      const{data:{session}}=await supabase.auth.getSession();
      const token=session?.access_token||"";
      await fetch("/api/push/subscribe",{
        method:"DELETE",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
        body:JSON.stringify({endpoint}),
      });
      setPushSubscribed(false);
      notify("Push notifications disabled.");
    }catch(err){
      console.error("unsubscribePush:",err);
      notify(`Could not disable push: ${err.message||err}`);
    }finally{
      setPushBusy(false);
    }
  }

  function togglePushSubscription(){
    if(pushBusy)return;
    if(pushSubscribed)unsubscribePush();
    else subscribePush();
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

  // ── Calendar sync — client-side ICS generator ────────────────────────────────
  function buildICS(){
    const DAYS_SHORT_ICS={Sun:"SU",Mon:"MO",Tue:"TU",Wed:"WE",Thu:"TH",Fri:"FR",Sat:"SA"};
    const esc=(s)=>String(s||"").replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\n/g,"\\n");
    const icsDate=(d)=>d?d.replace(/-/g,""):"";
    const icsTime=(d,t)=>{if(!d)return"";if(!t)return icsDate(d);const[h,m]=t.split(":");return`${d.replace(/-/g,"")}T${String(h).padStart(2,"0")}${String(m).padStart(2,"0")}00`;};
    const stamp=()=>new Date().toISOString().replace(/[-:.]/g,"").slice(0,15)+"Z";
    const fold=(line)=>{if(line.length<=75)return line;let out="",i=0;while(i<line.length){if(i===0){out+=line.slice(0,75);i=75;}else{out+="\r\n "+line.slice(i,i+74);i+=74;}}return out;};

    const events=[];

    // Class sessions (recurring)
    courses.forEach(c=>{
      if(!c.class_days?.length)return;
      const byDay=c.class_days.map(d=>DAYS_SHORT_ICS[d]||d).join(",");
      const dNums={SU:0,MO:1,TU:2,WE:3,TH:4,FR:5,SA:6};
      const first=DAYS_SHORT_ICS[c.class_days[0]];
      let d=new Date();d.setHours(0,0,0,0);
      const target=dNums[first]??1;
      while(d.getDay()!==target)d.setDate(d.getDate()+1);
      const startDate=d.toISOString().slice(0,10);
      const st=c.class_time||"09:00";
      let et=c.class_end_time;
      if(!et){const[sh,sm]=st.split(":").map(Number);let eh=sh+1,em=sm+30;if(em>=60){eh++;em-=60;}et=`${String(eh).padStart(2,"0")}:${String(em).padStart(2,"0")}`;}
      const until=`${new Date().getFullYear()}1231T235959Z`;
      events.push(["BEGIN:VEVENT",`UID:class-${c.id}@proplanscholar.com`,`DTSTAMP:${stamp()}`,
        `DTSTART;TZID=America/Chicago:${icsTime(startDate,st)}`,
        `DTEND;TZID=America/Chicago:${icsTime(startDate,et)}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${until}`,
        `SUMMARY:🎓 ${esc(c.name)}`,
        c.professor?`DESCRIPTION:Professor: ${esc(c.professor)}`:`DESCRIPTION:${esc(c.name)}`,
        "CATEGORIES:CLASS","END:VEVENT"].join("\r\n"));
    });

    // Assignment due dates
    assignments.forEach(a=>{
      const aDue=a.due||a.due_date;if(!aDue)return;
      const c=courses.find(x=>x.id===a.courseId);
      events.push(["BEGIN:VEVENT",`UID:due-${a.id}@proplanscholar.com`,`DTSTAMP:${stamp()}`,
        `DTSTART;VALUE=DATE:${icsDate(aDue)}`,`DTEND;VALUE=DATE:${icsDate(aDue)}`,
        `SUMMARY:📌 ${esc(a.title)} — DUE`,
        `DESCRIPTION:Course: ${esc(c?.name||"")}\\nType: ${esc(a.type||"")}`,
        "CATEGORIES:ASSIGNMENT",a.done?"STATUS:COMPLETED":"STATUS:CONFIRMED",
        "END:VEVENT"].join("\r\n"));
    });

    // Study blocks (from already-calculated studyBlocks)
    studyBlocks.forEach(b=>{
      const c=courses.find(x=>x.id===b.courseId);
      events.push(["BEGIN:VEVENT",`UID:study-${b.id}@proplanscholar.com`,`DTSTAMP:${stamp()}`,
        `DTSTART;TZID=America/Chicago:${icsTime(b.date,b.startTime)}`,
        `DTEND;TZID=America/Chicago:${icsTime(b.date,b.endTime)}`,
        `SUMMARY:📚 Study: ${esc(b.title)}`,
        `DESCRIPTION:Course: ${esc(c?.name||"")}`,
        "CATEGORIES:STUDY","END:VEVENT"].join("\r\n"));
    });

    // Milestones
    milestones.forEach(m=>{
      if(!m.due)return;
      events.push(["BEGIN:VEVENT",`UID:ms-${m.id}@proplanscholar.com`,`DTSTAMP:${stamp()}`,
        `DTSTART;VALUE=DATE:${icsDate(m.due)}`,`DTEND;VALUE=DATE:${icsDate(m.due)}`,
        `SUMMARY:⬟ ${esc(m.title)}`,m.notes?`DESCRIPTION:${esc(m.notes)}`:"",
        "CATEGORIES:MILESTONE",m.done?"STATUS:COMPLETED":"STATUS:CONFIRMED",
        "END:VEVENT"].filter(Boolean).join("\r\n"));
    });

    // Travel/blackout dates
    travelDates.forEach(tr=>{
      const start=tr.start||tr.start_date;const end=tr.end||tr.end_date||start;
      if(!start)return;
      events.push(["BEGIN:VEVENT",`UID:travel-${tr.id}@proplanscholar.com`,`DTSTAMP:${stamp()}`,
        `DTSTART;VALUE=DATE:${icsDate(start)}`,`DTEND;VALUE=DATE:${icsDate(end)}`,
        `SUMMARY:✈️ ${esc(tr.label||"Blackout")}`,
        "CATEGORIES:TRAVEL","TRANSP:OPAQUE","END:VEVENT"].join("\r\n"));
    });

    const lines=[
      "BEGIN:VCALENDAR","VERSION:2.0",
      "PRODID:-//ProPlan Scholar//proplanscholar.com//EN",
      "CALSCALE:GREGORIAN","METHOD:PUBLISH",
      "X-WR-CALNAME:ProPlan Scholar",
      "X-WR-TIMEZONE:America/Chicago",
      ...events,
      "END:VCALENDAR"
    ].map(fold).join("\r\n");

    return lines;
  }

  function downloadICS(){
    const ics=buildICS();
    const blob=new Blob([ics],{type:"text/calendar;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download="proplan-scholar.ics";
    document.body.appendChild(a);a.click();
    document.body.removeChild(a);URL.revokeObjectURL(url);
    notify("Calendar file downloaded! Open it to add to your calendar app.");
  }

  // ── Canvas LMS import ────────────────────────────────────────────────────────
  async function importFromCanvas(){
    if(!canvasUrl||!canvasToken){notify("Please enter your Canvas URL and API token.");return;}
    setCanvasImporting(true);
    try{
      // Save canvas creds to profile
      await supabase.from("profiles").update({canvas_url:canvasUrl}).eq("id",authUser.id);
      notify("Canvas credentials saved! Contact support to enable full import.");
    }catch(e){notify("Error saving Canvas settings.");}
    setCanvasImporting(false);
  }

  // ── Save phone for SMS ────────────────────────────────────────────────────────
  async function savePhone(){
    if(!userPhone){notify("Please enter a phone number.");return;}
    await supabase.from("profiles").update({phone:userPhone}).eq("id",authUser.id);
    notify("Phone number saved!");
  }

  // Keep token functions for future server-side use
  async function generateCalToken(){
    const token=Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b=>b.toString(16).padStart(2,"0")).join("");
    try{await supabase.from("calendar_tokens").upsert({user_id:authUser.id,token,created_at:new Date().toISOString()},{onConflict:"user_id"});}catch(e){}
    setCalToken(token);
    notify("Calendar link ready!");
  }

  function copyCalUrl(){
    const url=`https://proplanscholar.com/api/calendar/${calToken}`;
    navigator.clipboard.writeText(url).then(()=>{setCalCopied(true);setTimeout(()=>setCalCopied(false),2500);});
  }

  // ── Professor Ratings (community) ────────────────────────────────────────────
  function getProfStats(profName,school){
    // Get all ratings for this professor at this school
    const key=profName?.toLowerCase().trim();
    const schoolKey=school?.toLowerCase().trim();
    const ratings=profRatings.filter(r=>
      r.prof_name?.toLowerCase().trim()===key&&
      (!schoolKey||r.school?.toLowerCase().trim()===schoolKey)
    );
    if(!ratings.length)return null;
    const avg=(arr)=>arr.reduce((s,x)=>s+x,0)/arr.length;
    return{
      count:ratings.length,
      quality:+avg(ratings.map(r=>r.quality)).toFixed(1),
      difficulty:+avg(ratings.map(r=>r.difficulty)).toFixed(1),
      workload:+avg(ratings.map(r=>r.workload)).toFixed(1),
      wouldTakeAgain:Math.round(ratings.filter(r=>r.would_take_again).length/ratings.length*100),
      comments:ratings.filter(r=>r.comment).map(r=>({text:r.comment,date:r.created_at?.slice(0,10)})).slice(0,5),
      ratings,
    };
  }

  async function submitProfRating(){
    if(!showRateModal)return;
    if(!newRating.quality||!newRating.difficulty||!newRating.workload)return notify("Please rate all three categories.");
    if(newRating.wouldTakeAgain===null)return notify("Please answer 'Would you take this professor again?'");
    const{error}=await supabase.from("professor_ratings").insert({
      user_id:authUser.id,
      prof_name:showRateModal.profName,
      school:uni.name,
      quality:newRating.quality,
      difficulty:newRating.difficulty,
      workload:newRating.workload,
      would_take_again:newRating.wouldTakeAgain,
      comment:newRating.comment||null,
      course_name:showRateModal.courseName||null,
    });
    if(error)return notify("Error saving rating.");
    // Reload ratings
    const{data}=await supabase.from("professor_ratings").select("*").order("created_at",{ascending:false});
    if(data)setProfRatings(data);
    // Update course difficulty with blended score
    const stats=getProfStats(showRateModal.profName,uni.name);
    if(stats&&showRateModal.courseId){
      const newDiff=Math.round((newRating.difficulty+(courses.find(c=>c.id===showRateModal.courseId)?.difficulty||3))/2);
      await supabase.from("courses").update({difficulty:newDiff}).eq("id",showRateModal.courseId);
      setCourses(p=>p.map(c=>c.id===showRateModal.courseId?{...c,difficulty:newDiff}:c));
    }
    setShowRateModal(null);
    setNewRating({quality:0,difficulty:0,workload:0,wouldTakeAgain:null,comment:""});
    notify("Rating submitted! Thank you for helping your peers. 🎓");
  }

  async function applyProfStats(courseId,stats,profName){
    // Apply community rating to course difficulty
    const blended=Math.round(((courses.find(c=>c.id===courseId)?.difficulty||3)+stats.difficulty)/2);
    await supabase.from("courses").update({difficulty:blended}).eq("id",courseId);
    setCourses(p=>p.map(c=>c.id!==courseId?c:{...c,difficulty:blended}));
    notify(`✓ Community ratings applied! Difficulty updated to ${blended}/5.`);
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
    const isToday=y===t.year&&m===t.month&&d===t.day;
    // Find courses that meet on this day
    const classTimes=courses.filter(c=>(c.class_days||[]).includes(dayName)&&c.class_days?.length>0);
    // Show assignments due on this date, plus overdue assignments on today's cell
    const dayAsgn=isToday
      ?assignments.filter(a=>a.due===k||(!a.done&&daysUntil(a.due)<0))
      :assignments.filter(a=>a.due===k);
    return{
      asgn:dayAsgn,
      study:studyBlocks.filter(b=>b.date===k),
      travel:travelDates.find(tr=>k>=tr.start&&k<=tr.end),
      milestone:milestones.find(ms=>ms.due===k),
      blocks:scheduleBlocks.filter(b=>b.day_of_week===dayName||b.date_specific===k),
      classes:classTimes,
    };
  }
  function prevMonth(){setSelectedDay(null);calMonth===0?(setCalYear(y=>y-1),setCalMonth(11)):setCalMonth(m=>m-1);}
  function nextMonth(){setSelectedDay(null);calMonth===11?(setCalYear(y=>y+1),setCalMonth(0)):setCalMonth(m=>m+1);}

  // ── Derived values ─────────────────────────────────────────────────────────
  // ── Time tracker calculations ──────────────────────────────────────────────
  const timeData=(() => {
    // Study hours: completed sessions
    const studyDone=Object.keys(completedStudy).filter(k=>completedStudy[k]).length*2;
    // Study scheduled (upcoming, not yet done)
    const studySched=studyBlocks.filter(b=>!completedStudy[b.id]&&daysUntil(b.date)>=0).length*2;

    // Class hours per week: sum all courses' class durations * days per week
    const classHrsWk=courses.reduce((sum,c)=>{
      if(!c.class_days?.length||!c.class_time)return sum;
      const start=parseInt((c.class_time||"09:00").split(":")[0]);
      const end=parseInt((c.class_end_time||"10:30").split(":")[0]);
      return sum+(Math.max(1,end-start)*c.class_days.length);
    },0);

    // Work hours per week
    const workHrsWk=Object.values(workSched).filter(d=>d.work).reduce((sum,d)=>{
      const s=parseInt((d.start||"08:00").split(":")[0]);
      const e=parseInt((d.end||"17:00").split(":")[0]);
      return sum+Math.max(0,e-s);
    },0);

    // Sports hours per week
    const sportsHrsWk=scheduleBlocks.filter(b=>b.block_type==="sport").reduce((sum,b)=>{
      const s=parseInt((b.start_time||"15:00").split(":")[0]);
      const e=parseInt((b.end_time||"17:00").split(":")[0]);
      return sum+Math.max(0,e-s);
    },0);

    // Greek life hours per week
    const greekHrsWk=scheduleBlocks.filter(b=>b.block_type==="greek").reduce((sum,b)=>{
      const s=parseInt((b.start_time||"18:00").split(":")[0]);
      const e=parseInt((b.end_time||"20:00").split(":")[0]);
      return sum+Math.max(0,e-s);
    },0);

    // Other blocks
    const otherHrsWk=scheduleBlocks.filter(b=>b.block_type==="other"||b.block_type==="work").reduce((sum,b)=>{
      const s=parseInt((b.start_time||"09:00").split(":")[0]);
      const e=parseInt((b.end_time||"10:00").split(":")[0]);
      return sum+Math.max(0,e-s);
    },0);

    const totalWk=classHrsWk+studySched+workHrsWk+sportsHrsWk+greekHrsWk+otherHrsWk;
    const freeHrs=Math.max(0,112-totalWk); // 16 waking hrs/day * 7 = 112

    // Wellness check: if total committed hrs > 80/wk, suggest a break
    const overloaded=totalWk>80;
    const strained=totalWk>65&&totalWk<=80;

    return{
      studyDone,studySched,classHrsWk,workHrsWk,sportsHrsWk,greekHrsWk,otherHrsWk,totalWk,freeHrs,overloaded,strained,
      breakdown:[
        {label:"Classes",hrs:classHrsWk,color:"#10b981",icon:"🎓",detail:courses.filter(c=>c.class_days?.length>0).map(c=>`${c.name}: ${c.class_days?.join(",")} ${to12h(c.class_time)||""}`)},
        {label:"Studying",hrs:studySched,color:"#0ea5e9",icon:"📚",detail:assignments.filter(a=>!a.done).slice(0,5).map(a=>`${a.title}: ${studyBlocks.filter(b=>b.assignId===a.id).length*2}h planned`)},
        {label:"Work",hrs:workHrsWk,color:"#f59e0b",icon:"💼",detail:Object.entries(workSched).filter(([,v])=>v.work).map(([day,v])=>`${day}: ${to12h(v.start)}–${to12h(v.end)}`)},
        {label:"Sports",hrs:sportsHrsWk,color:"#ef4444",icon:"🏅",detail:scheduleBlocks.filter(b=>b.block_type==="sport").map(b=>`${b.label}: ${b.day_of_week} ${to12h(b.start_time)}–${to12h(b.end_time)}`)},
        {label:"Greek Life",hrs:greekHrsWk,color:"#8b5cf6",icon:"🏛",detail:scheduleBlocks.filter(b=>b.block_type==="greek").map(b=>`${b.label}: ${b.day_of_week} ${to12h(b.start_time)}–${to12h(b.end_time)}`)},
        {label:"Other",hrs:otherHrsWk,color:"#6366f1",icon:"📌",detail:scheduleBlocks.filter(b=>b.block_type==="other").map(b=>`${b.label}: ${b.day_of_week}`)},
        {label:"Free Time",hrs:freeHrs,color:"#22c55e",icon:"😊",detail:["Time for rest, hobbies, and personal wellness"]},
      ].filter(x=>x.hrs>0),
    };
  })();

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
    {id:"major-project",icon:"⬟",label:["doctoral","postdoc"].includes(profile?.degree_level)?"Dissertation":["graduate"].includes(profile?.degree_level)?"Thesis / Capstone":"Major Project"},
    {id:"flashcards",icon:"⬡",label:"Flashcards"},
    {id:"analytics",icon:"◑",label:"Analytics"},
    {id:"settings",icon:"◌",label:"Settings"},
  ];

  // ── Global CSS ─────────────────────────────────────────────────────────────
  const css=`
  /* ── Reset & base ─────────────────────────────────────── */
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
  body,input,select,textarea{font-family:'Inter','Plus Jakarta Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased;}
  button{cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent;}
  input,select,textarea{font-size:16px!important;} /* prevent iOS zoom */

  /* ── Scrollbars ───────────────────────────────────────── */
  ::-webkit-scrollbar{width:4px;height:4px;}
  ::-webkit-scrollbar-track{background:transparent;}
  ::-webkit-scrollbar-thumb{background:${T.scrollThumb};border-radius:4px;}

  /* ── Animations ───────────────────────────────────────── */
  @keyframes fi{from{opacity:0;transform:translateY(-8px);}to{opacity:1;transform:translateY(0);}}
  @keyframes slideUp{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}
  @keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
  @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.5;}}
  @keyframes energyPop{0%{transform:scale(1);}40%{transform:scale(1.3);}100%{transform:scale(1);}}
  @keyframes fadeSlideIn{from{opacity:0;transform:translateX(-6px);}to{opacity:1;transform:translateX(0);}}
  /* Syllabus loader — books with flipping pages */
  @keyframes syl-flip{
    0%{transform:rotateY(0deg);}
    45%{transform:rotateY(-170deg);}
    50%{transform:rotateY(-180deg);}
    95%{transform:rotateY(-360deg);}
    100%{transform:rotateY(-360deg);}
  }
  @keyframes syl-bob{
    0%,100%{transform:translateY(0);}
    50%{transform:translateY(-3px);}
  }
  .syl-page{
    transform-origin:0 50%;
    animation:syl-flip 2.4s ease-in-out infinite;
    transform-style:preserve-3d;
  }
  .syl-books{animation:syl-bob 2.4s ease-in-out infinite;}
  .syl-overlay{
    position:fixed;inset:0;z-index:120;
    background:rgba(0,0,0,.55);
    display:flex;align-items:center;justify-content:center;
    animation:fadeIn .25s ease;
    padding:20px;
  }
  .syl-modal{
    background:${T.card};
    border:1px solid ${T.border};
    border-radius:18px;
    padding:28px 26px 24px;
    max-width:360px;width:100%;
    text-align:center;
    box-shadow:0 20px 60px rgba(0,0,0,.4);
  }
  /* Drag-and-drop syllabus dropzone */
  .syl-drop{
    border:2px dashed ${T.border2};
    border-radius:12px;
    padding:18px 14px;
    text-align:center;
    cursor:pointer;
    transition:border-color .2s,background .2s,transform .15s;
    display:block;
  }
  .syl-drop:hover{border-color:${T.accent};background:rgba(${rgb},.04);}
  .syl-drop.is-dragging{border-color:${T.accent};background:rgba(${rgb},.10);transform:scale(1.01);}
  .syl-drop-mini{
    border:1px dashed ${T.border2};
    border-radius:9px;
    padding:7px 11px;
    cursor:pointer;
    transition:border-color .2s,background .2s;
    display:inline-flex;align-items:center;gap:6px;
    font-size:13px;color:${T.text};
    background:${T.hoverBg};
  }
  .syl-drop-mini:hover{border-color:${T.accent};}
  .syl-drop-mini.is-dragging{border-color:${T.accent};background:rgba(${rgb},.12);}
  .energy-pop{animation:energyPop .3s ease;}

  /* ── Layout primitives ────────────────────────────────── */
  .fi{animation:fi .25s ease;}
  .slide-up{animation:slideUp .3s ease;}

  /* ── Cards ────────────────────────────────────────────── */
  .card{
    background:${T.card};
    border:1px solid ${T.border};
    border-radius:16px;
    padding:18px 16px;
  }

  /* ── Buttons ──────────────────────────────────────────── */
  .bp{
    background:${T.accent};
    color:#fff;
    border:none;
    border-radius:12px;
    padding:12px 20px;
    font-size:14px;
    font-weight:600;
    min-height:48px;
    transition:opacity .15s,transform .15s;
  }
  .bp:hover{opacity:.9;}
  .bp:active{transform:scale(.97);}

  .bg2{
    background:${T.hoverBg};
    color:${T.text};
    border:1px solid ${T.border2};
    border-radius:12px;
    padding:12px 16px;
    font-size:13px;
    font-weight:500;
    min-height:44px;
    transition:opacity .15s;
  }
  .bg2:hover{opacity:.8;}

  /* ── Nav buttons (sidebar) ────────────────────────────── */
  .nb{
    display:flex;
    align-items:center;
    gap:10px;
    padding:10px 12px;
    border-radius:10px;
    border:none;
    background:transparent;
    font-size:14px;
    font-weight:500;
    min-height:44px;
    width:100%;
    text-align:left;
    transition:background .15s;
  }
  .nb:active{transform:scale(.98);}

  /* ── Bottom tab bar ───────────────────────────────────── */
  .tab-bar{
    position:fixed;
    bottom:0;left:0;right:0;
    height:64px;
    background:${T.sidebar};
    border-top:1px solid ${T.border};
    display:flex;
    align-items:stretch;
    z-index:90;
    padding-bottom:env(safe-area-inset-bottom);
  }
  .tab-item{
    flex:1;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:3px;
    border:none;
    background:transparent;
    color:${T.faint};
    font-size:10px;
    font-weight:500;
    min-height:64px;
    position:relative;
    transition:color .15s;
    padding:0 2px;
  }
  .tab-item.active{color:${T.accent};}
  .tab-item-icon{font-size:20px;line-height:1;}
  .tab-badge{
    position:absolute;
    top:8px;right:calc(50% - 14px);
    background:${T.danger};
    color:#fff;
    border-radius:10px;
    font-size:9px;
    font-weight:700;
    padding:1px 5px;
    min-width:16px;
    text-align:center;
  }

  /* ── Mobile header ────────────────────────────────────── */
  .mobile-header{
    display:none;
    position:fixed;
    top:0;left:0;right:0;
    height:56px;
    background:${T.sidebar};
    border-bottom:1px solid ${T.border};
    align-items:center;
    justify-content:space-between;
    padding:0 16px;
    z-index:90;
    padding-top:env(safe-area-inset-top);
  }

  /* ── Form inputs ──────────────────────────────────────── */
  .ifield{
    width:100%;
    background:${T.inputBg};
    border:1.5px solid ${T.border2};
    border-radius:10px;
    padding:12px 14px;
    color:${T.text};
    outline:none;
    font-family:inherit;
    transition:border-color .2s;
  }
  .ifield:focus{border-color:${T.accent};}

  /* ── Modal / Sheet ────────────────────────────────────── */
  .mo{
    position:fixed;inset:0;
    background:${T.overlay};
    display:flex;align-items:flex-end;
    justify-content:center;
    z-index:200;
    animation:fadeIn .2s ease;
  }
  .md{
    background:${T.card};
    border-radius:20px 20px 0 0;
    padding:24px 20px;
    padding-bottom:calc(24px + env(safe-area-inset-bottom));
    width:100%;
    max-width:600px;
    max-height:92vh;
    overflow-y:auto;
    animation:slideUp .3s ease;
  }
  .md::before{
    content:'';
    display:block;
    width:36px;height:4px;
    background:${T.border2};
    border-radius:2px;
    margin:0 auto 20px;
  }

  /* ── Tags & badges ────────────────────────────────────── */
  .tag{
    display:inline-flex;align-items:center;
    padding:2px 8px;
    border-radius:6px;
    font-size:11px;
    font-weight:600;
  }
  .del-btn{
    background:transparent;
    border:1px solid ${T.border2};
    border-radius:8px;
    padding:6px 10px;
    font-size:12px;
    color:${T.danger};
    min-height:36px;
    transition:all .15s;
  }
  .del-btn:hover{background:rgba(239,68,68,.08);border-color:${T.danger};}

  /* ── Progress bar ─────────────────────────────────────── */
  .prog-bar{height:4px;background:${T.border};border-radius:2px;overflow:hidden;margin-bottom:4px;}
  .prog-fill{height:100%;border-radius:2px;transition:width .4s ease;}

  /* ── Energy tooltip ─────────────────────────────────── */
  .energy-tip-text{display:none;position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:${dark?"#1e1e2e":"#333"};color:#fff;padding:6px 10px;border-radius:6px;font-size:11px;line-height:1.5;width:220px;text-align:center;z-index:99;white-space:normal;box-shadow:0 2px 8px rgba(0,0,0,.25);}
  .energy-tip:hover .energy-tip-text,.energy-tip:focus .energy-tip-text{display:block;}

  /* ── Flashcards ───────────────────────────────────────── */
  .flip-card{perspective:1000px;cursor:pointer;}
  .flip-inner{position:relative;transform-style:preserve-3d;transition:transform .5s;}
  .flipped .flip-inner{transform:rotateY(180deg);}
  .flip-face{position:absolute;width:100%;height:100%;backface-visibility:hidden;border-radius:16px;}
  .flip-back{transform:rotateY(180deg);}

  /* ── Stat cards ───────────────────────────────────────── */
  .stat-card{transition:transform .2s,box-shadow .2s;cursor:pointer;}
  /* ── Calendar grid ───────────────────────────────── */
  .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;}
  .cal-day{min-height:54px;padding:4px;border-radius:8px;cursor:pointer;transition:all .15s;}
  .cal-header{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:3px;}
  .cal-header-cell{text-align:center;font-size:10px;letter-spacing:1px;text-transform:uppercase;padding:2px 0;}
  .cal-pill{font-size:8px;padding:1px 4px;border-radius:3px;margin-bottom:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;}

  @media(max-width:768px){
    .course-grid{grid-template-columns:1fr!important;}
    .dash-grid{grid-template-columns:1fr!important;}
    .settings-grid{grid-template-columns:1fr!important;}
    /* Chat panel full screen on mobile */
    aside.fi{position:fixed!important;inset:0!important;width:100%!important;z-index:200!important;border-left:none!important;}
    /* Calendar: tighter cells on mobile */
    .cal-day{min-height:44px!important;padding:2px!important;border-radius:5px!important;}
    .cal-pill{font-size:7px!important;padding:1px 2px!important;}
    .cal-header-cell{font-size:8px!important;letter-spacing:0!important;}
    /* Work schedule: scroll horizontally */
    .work-sched-grid{overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px;}
    .work-sched-inner{display:grid;grid-template-columns:repeat(7,minmax(80px,1fr));gap:8px;min-width:560px;}
  }
  @media(min-width:769px){
    .work-sched-inner{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;}
  }
  .stat-card:hover{transform:translateY(-2px);box-shadow:0 4px 16px rgba(${rgb},.15);}
  .stat-card:active{transform:scale(.97);}

  /* ── Desktop sidebar reopen tab ───────────────────────── */
  .sidebar-tab{
    position:fixed;left:0;top:50%;
    transform:translateY(-50%);
    z-index:50;
    background:${T.accent};
    color:#fff;
    border-radius:0 8px 8px 0;
    padding:14px 6px;
    cursor:pointer;
    display:flex;flex-direction:column;
    align-items:center;gap:3px;
    box-shadow:2px 0 12px rgba(0,0,0,.2);
    transition:opacity .2s;
  }
  .sidebar-tab:hover{opacity:.9;}

  /* ── Mobile responsive ─────────────────────────────────── */
  @media(max-width:768px){
    .mobile-header{display:flex!important;}
    .tab-bar{display:flex!important;}
    .desktop-sidebar{display:none!important;}
    .main-content{
      /* Clear the 56px fixed header + iPhone notch on top, and the 64px tab bar + home bar on bottom */
      padding-top:calc(56px + env(safe-area-inset-top) + 14px)!important;
      padding-bottom:calc(64px + env(safe-area-inset-bottom) + 14px)!important;
      padding-left:16px!important;
      padding-right:16px!important;
      overflow-x:hidden!important;
    }
    /* Belt-and-suspenders: every card on mobile shrinks rather than overflows */
    .card{min-width:0!important;max-width:100%!important;overflow:hidden!important;}
    /* Sheet modals */
    .mo{align-items:flex-end;}
    /* Full-width cards */
    .settings-grid{grid-template-columns:1fr!important;}
    .course-grid{grid-template-columns:1fr!important;}
    /* Bigger tap targets */
    .bp,.bg2{min-height:48px;}
  }

  /* ── Desktop ───────────────────────────────────────────── */
  @media(min-width:769px){
    .tab-bar{display:none!important;}
    .mobile-header{display:none!important;}
    .mo{align-items:center;}
    .md{border-radius:20px;max-height:85vh;}
    .md::before{display:none;}
    .main-content{padding:24px 28px!important;}
  }

  /* ── iOS safe areas ────────────────────────────────────── */
  @supports(padding:max(0px)){
    .main-content{
      padding-left:max(16px,env(safe-area-inset-left))!important;
      padding-right:max(16px,env(safe-area-inset-right))!important;
    }
  }
`

  // ── Auth / onboarding gates ─────────────────────────────────────────────────
  // Guard: if supabase failed to init, show config error instead of crashing
  if(!supabase)return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0f0f13",fontFamily:"'Inter',system-ui,sans-serif",padding:20}}>
      <div style={{textAlign:"center",maxWidth:400}}>
        <div style={{fontSize:40,marginBottom:16}}>⚙️</div>
        <div style={{color:"#ef4444",fontSize:16,fontWeight:700,marginBottom:8}}>Configuration Error</div>
        <div style={{color:"#7a7590",fontSize:13,lineHeight:1.7}}>Missing Supabase environment variables.<br/>Please check that <code style={{background:"#1e1e2e",padding:"1px 6px",borderRadius:4}}>VITE_SUPABASE_URL</code> and <code style={{background:"#1e1e2e",padding:"1px 6px",borderRadius:4}}>VITE_SUPABASE_ANON</code> are set in Vercel and redeploy.</div>
      </div>
    </div>
  );

  if(authLoading)return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0f0f13",fontFamily:"'Inter',system-ui,sans-serif"}}>
      <div style={{textAlign:"center"}}><div style={{fontSize:40,marginBottom:16}}>🎓</div><div style={{color:"#7a7590",fontSize:14}}>Loading ProPlan Scholar...</div></div>
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
    <div style={{fontFamily:"'Inter','Plus Jakarta Sans',system-ui,sans-serif",minHeight:"100vh",background:T.bg,color:T.text,transition:"background .25s,color .25s",overflowX:"hidden"}}>
      <style>{css}</style>

      {/* ── Toast ─────────────────────────────────────────── */}
      {notification&&<div style={{position:"fixed",top:"max(16px,env(safe-area-inset-top))",left:"50%",transform:"translateX(-50%)",background:T.success,color:"#fff",padding:"10px 20px",borderRadius:100,zIndex:999,fontSize:13,fontWeight:600,boxShadow:`0 4px 20px rgba(${hexToRgb(T.success)},.35)`,animation:"fi .3s ease",whiteSpace:"nowrap",maxWidth:"calc(100vw - 32px)",textAlign:"center"}}>{notification}</div>}

      {/* ── Syllabus AI loader (books with flipping pages) ── */}
      {uploading&&(()=>{
        const rotating=[
          "Reading your syllabus…",
          "Pulling out assignments…",
          "Checking due dates…",
          "Estimating study hours…",
          "Almost done…",
        ];
        const msg=rotating[loaderMsgIndex%rotating.length];
        return(
          <div className="syl-overlay" role="dialog" aria-live="polite" aria-label="Analyzing syllabus">
            <div className="syl-modal">
              <div style={{display:"flex",justifyContent:"center",marginBottom:14}}>
                <svg viewBox="0 0 200 180" width="170" height="153" aria-hidden="true">
                  <g className="syl-books">
                    {/* Bottom book — coral */}
                    <rect x="30" y="120" width="140" height="14" rx="2" fill="#ec4899" stroke="#9d2660" strokeWidth="1.5"/>
                    <rect x="38" y="123" width="14" height="8" rx="1" fill="#fef3c7"/>
                    {/* Middle book — accent (theme color) */}
                    <rect x="40" y="106" width="120" height="14" rx="2" fill={T.accent} stroke="#1e1b4b" strokeWidth="1.5"/>
                    {/* Top book — sky */}
                    <rect x="50" y="92" width="100" height="14" rx="2" fill="#0ea5e9" stroke="#075985" strokeWidth="1.5"/>
                    {/* Open book on top */}
                    <g transform="translate(100 80)">
                      {/* Left page (static) */}
                      <path d="M0 -50 Q-25 -55 -50 -50 L-50 30 Q-25 25 0 30 Z" fill="#faf1dc" stroke="#7a4f2e" strokeWidth="1.5"/>
                      {/* Right page (static) */}
                      <path d="M0 -50 Q25 -55 50 -50 L50 30 Q25 25 0 30 Z" fill="#faf1dc" stroke="#7a4f2e" strokeWidth="1.5"/>
                      {/* Lines on left */}
                      <line x1="-40" y1="-38" x2="-10" y2="-38" stroke="#a88b6a" strokeWidth="1"/>
                      <line x1="-40" y1="-30" x2="-10" y2="-30" stroke="#a88b6a" strokeWidth="1"/>
                      <line x1="-40" y1="-22" x2="-15" y2="-22" stroke="#a88b6a" strokeWidth="1"/>
                      <line x1="-40" y1="-14" x2="-12" y2="-14" stroke="#a88b6a" strokeWidth="1"/>
                      {/* Lines on right */}
                      <line x1="10" y1="-38" x2="40" y2="-38" stroke="#a88b6a" strokeWidth="1"/>
                      <line x1="10" y1="-30" x2="40" y2="-30" stroke="#a88b6a" strokeWidth="1"/>
                      <line x1="10" y1="-22" x2="35" y2="-22" stroke="#a88b6a" strokeWidth="1"/>
                      <line x1="10" y1="-14" x2="38" y2="-14" stroke="#a88b6a" strokeWidth="1"/>
                      {/* Spine */}
                      <line x1="0" y1="-50" x2="0" y2="30" stroke="#7a4f2e" strokeWidth="1.5"/>
                      {/* Flipping page */}
                      <g className="syl-page">
                        <path d="M0 -50 Q-25 -55 -50 -50 L-50 30 Q-25 25 0 30 Z" fill="#fff8e7" stroke="#7a4f2e" strokeWidth="1.5"/>
                        <line x1="-40" y1="-38" x2="-10" y2="-38" stroke="#a88b6a" strokeWidth="1"/>
                        <line x1="-40" y1="-30" x2="-10" y2="-30" stroke="#a88b6a" strokeWidth="1"/>
                        <line x1="-40" y1="-22" x2="-15" y2="-22" stroke="#a88b6a" strokeWidth="1"/>
                      </g>
                    </g>
                  </g>
                </svg>
              </div>
              <div style={{fontWeight:700,fontSize:15,marginBottom:6,color:T.text}}>Analyzing your syllabus</div>
              <div style={{fontSize:13,color:T.muted,marginBottom:10,minHeight:18,transition:"opacity .25s"}} key={msg}>{msg}</div>
              <div style={{fontSize:11,color:T.faint,lineHeight:1.5}}>This usually takes 10–30 seconds. Please don't close the window.</div>
              {uploadMsg&&<div style={{fontSize:10,color:T.faint,marginTop:10,fontStyle:"italic"}}>{uploadMsg}</div>}
            </div>
          </div>
        );
      })()}

      {/* ── Grade entry modal (📊 button on assignments) ──────── */}
      {showGradeModal&&(()=>{
        const a=showGradeModal;
        const course=courses.find(c=>c.id===a.courseId);
        const existing=grades.find(g=>g.assignmentId===a.id);
        const score=Number(gradeInput.score);
        const maxS=Number(gradeInput.maxScore)||100;
        const pct=gradeInput.score!==""&&!isNaN(score)&&maxS>0?(score/maxS*100):null;
        const letter=pct!==null?pctToLetter(pct):"";
        const letterColor=pct===null?T.muted:pct>=90?T.success:pct>=80?"#0ea5e9":pct>=70?T.caution:pct>=60?T.warning:T.danger;
        return(
          <div className="syl-overlay" role="dialog" aria-label="Enter grade" onClick={()=>setShowGradeModal(null)}>
            <div className="syl-modal" style={{maxWidth:420,textAlign:"left",padding:"22px 22px 18px"}} onClick={e=>e.stopPropagation()}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                <span style={{fontSize:24}}>📊</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:10,letterSpacing:2,color:course?.color||T.accent,textTransform:"uppercase",fontWeight:700}}>Log Grade</div>
                  <div style={{fontWeight:700,fontSize:15,color:T.text,wordBreak:"break-word"}}>{a.title}</div>
                  {course&&<div style={{fontSize:11,color:T.muted,marginTop:2}}>{course.name}</div>}
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,alignItems:"end",marginBottom:12}}>
                <div>
                  <div style={{fontSize:11,color:T.muted,marginBottom:5}}>Your Score</div>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min="0"
                    placeholder="87"
                    value={gradeInput.score}
                    onChange={e=>setGradeInput(p=>({...p,score:e.target.value}))}
                    onKeyDown={e=>e.key==="Enter"&&saveGrade(a.id,a.courseId,gradeInput.score,gradeInput.maxScore)}
                    className="ifield"
                    style={{fontSize:18,textAlign:"center",fontWeight:600}}
                    autoFocus/>
                </div>
                <div style={{fontSize:18,color:T.muted,fontWeight:700,paddingBottom:8}}>/</div>
                <div>
                  <div style={{fontSize:11,color:T.muted,marginBottom:5}}>Out of</div>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="1"
                    min="1"
                    placeholder="100"
                    value={gradeInput.maxScore}
                    onChange={e=>setGradeInput(p=>({...p,maxScore:e.target.value}))}
                    onKeyDown={e=>e.key==="Enter"&&saveGrade(a.id,a.courseId,gradeInput.score,gradeInput.maxScore)}
                    className="ifield"
                    style={{fontSize:18,textAlign:"center",fontWeight:600}}/>
                </div>
              </div>
              {pct!==null&&(
                <div style={{padding:"12px 14px",background:T.subcard,borderRadius:9,border:`1px solid ${T.border2}`,marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div>
                    <div style={{fontSize:10,color:T.muted,letterSpacing:1,textTransform:"uppercase"}}>Percentage</div>
                    <div style={{fontSize:22,fontWeight:700,color:letterColor}}>{pct.toFixed(1)}%</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:10,color:T.muted,letterSpacing:1,textTransform:"uppercase"}}>Letter</div>
                    <div style={{fontSize:32,fontWeight:800,color:letterColor,lineHeight:1}}>{letter}</div>
                  </div>
                </div>
              )}
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button className="bg2" style={{flex:1}} onClick={()=>setShowGradeModal(null)}>Cancel</button>
                {existing&&<button className="del-btn" style={{padding:"10px 14px",fontSize:13}} onClick={()=>deleteGrade(a.id)}>🗑 Remove</button>}
                <button className="bp" style={{flex:2}} onClick={()=>saveGrade(a.id,a.courseId,gradeInput.score,gradeInput.maxScore)}>{existing?"Update Grade":"Save Grade"}</button>
              </div>
              <div style={{fontSize:10,color:T.faint,marginTop:12,textAlign:"center"}}>
                Track your overall and per-course GPA in the <strong>Analytics</strong> tab.
              </div>
            </div>
          </div>
        );
      })()}

            {/* ── MFA enrollment modal (TOTP setup) ─────────────────── */}
      {showMfaEnroll&&(
        <div className="syl-overlay" role="dialog" aria-label="Set up two-factor authentication" onClick={cancelMfaEnroll}>
          <div className="syl-modal" style={{maxWidth:440,textAlign:"left",padding:"22px 22px 18px"}} onClick={e=>e.stopPropagation()}>
            <div style={{textAlign:"center",marginBottom:14}}>
              <div style={{fontSize:32,marginBottom:6}}>🔐</div>
              <div style={{fontWeight:700,fontSize:16,color:T.text}}>Set Up Two-Factor Authentication</div>
              <div style={{fontSize:12,color:T.muted,marginTop:4,lineHeight:1.6}}>Scan this QR code with Google Authenticator, Authy, 1Password, or any TOTP app.</div>
            </div>
            <div style={{background:"#fff",borderRadius:12,padding:16,marginBottom:12,display:"flex",justifyContent:"center"}}>
              <div style={{width:200,height:200}} dangerouslySetInnerHTML={{__html:showMfaEnroll.qrSvg}}/>
            </div>
            <div style={{padding:"10px 12px",background:T.subcard,borderRadius:9,border:`1px solid ${T.border2}`,marginBottom:12}}>
              <div style={{fontSize:10,color:T.muted,marginBottom:4,letterSpacing:1,textTransform:"uppercase"}}>Or enter this secret manually</div>
              <div style={{fontFamily:"'SF Mono','Monaco','Menlo',monospace",fontSize:12,color:T.text,wordBreak:"break-all",userSelect:"all"}}>{showMfaEnroll.secret}</div>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,color:T.muted,marginBottom:5}}>Enter the 6-digit code from your app to confirm</div>
              <input
                value={mfaEnrollCode}
                onChange={e=>setMfaEnrollCode(e.target.value.replace(/\D/g,"").slice(0,6))}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                onKeyDown={e=>e.key==="Enter"&&verifyMfaEnroll()}
                className="ifield"
                style={{fontSize:22,letterSpacing:8,textAlign:"center",fontFamily:"'SF Mono','Monaco','Menlo',monospace"}}
                autoFocus/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button className="bg2" style={{flex:1}} onClick={cancelMfaEnroll} disabled={mfaBusy}>Cancel</button>
              <button className="bp" style={{flex:1}} onClick={verifyMfaEnroll} disabled={mfaBusy||mfaEnrollCode.length<6}>{mfaBusy?"Verifying...":"Verify and Enable"}</button>
            </div>
          </div>
        </div>
      )}

            {/* ── Syllabus viewer modal ─────────────────────────── */}
      {showSyllabusViewer&&(()=>{
        const c=showSyllabusViewer;
        const s=c.syllabus_data;
        if(!s)return null;
        const dt=s.uploadedAt?new Date(s.uploadedAt).toLocaleString():"";
        return(
          <div className="syl-overlay" role="dialog" aria-label="Saved syllabus" onClick={()=>setShowSyllabusViewer(null)}>
            <div className="syl-modal" style={{maxWidth:520,textAlign:"left",padding:"22px 22px 18px"}} onClick={e=>e.stopPropagation()}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,gap:10}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:10,letterSpacing:2,color:T.accent,textTransform:"uppercase",fontWeight:700}}>Saved Syllabus</div>
                  <div style={{fontWeight:700,fontSize:16,marginTop:3,color:T.text,wordBreak:"break-word"}}>{c.name}</div>
                </div>
                <button onClick={()=>setShowSyllabusViewer(null)} style={{background:"transparent",border:`1px solid ${T.border2}`,borderRadius:7,width:28,height:28,color:T.muted,fontSize:13,cursor:"pointer",flexShrink:0}}>✕</button>
              </div>
              <div style={{padding:"10px 12px",background:T.subcard,borderRadius:9,border:`1px solid ${T.border2}`,marginBottom:12,fontSize:12,color:T.muted}}>
                <div><strong style={{color:T.text}}>{s.filename||"syllabus"}</strong></div>
                <div style={{marginTop:3}}>Uploaded {dt}{s.size?` · ${Math.round(s.size/1024)} KB`:""}</div>
              </div>
              {s.parsedText&&(
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:11,color:T.muted,marginBottom:5,fontWeight:600,textTransform:"uppercase",letterSpacing:1}}>Extracted text</div>
                  <div style={{maxHeight:240,overflowY:"auto",padding:"10px 12px",background:T.subcard,borderRadius:9,border:`1px solid ${T.border2}`,fontSize:12,color:T.text,whiteSpace:"pre-wrap",lineHeight:1.5}}>
                    {s.parsedText.slice(0,4000)}{s.parsedText.length>4000?"\n\n…(truncated)":""}
                  </div>
                </div>
              )}
              {!s.parsedText&&s.fileBase64&&(
                <div style={{marginBottom:12,padding:"10px 12px",background:T.subcard,borderRadius:9,border:`1px solid ${T.border2}`,fontSize:12,color:T.muted}}>
                  Original file is saved. Click <strong>Download</strong> to open it.
                </div>
              )}
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {s.fileBase64&&<button className="bp" style={{flex:1,fontSize:13,padding:"10px 14px"}} onClick={()=>downloadSavedSyllabus(c)}>⬇ Download</button>}
                <button className="bg2" style={{flex:1,fontSize:13,padding:"10px 14px"}} onClick={()=>{setShowSyllabusViewer(null);}}>Close</button>
                <button className="del-btn" style={{padding:"10px 14px",fontSize:13}} onClick={()=>deleteSavedSyllabus(c.id)}>🗑 Remove</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Focus Timer Overlay ────────────────────────────── */}
      {focusTimer&&(
        <div style={{position:"fixed",bottom:isMobile?80:24,right:24,background:T.card,border:`2px solid ${focusTimer.courseColor}`,borderRadius:16,padding:"16px 20px",boxShadow:"0 8px 32px rgba(0,0,0,.3)",zIndex:9998,minWidth:240,animation:"slideUp .3s ease"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontSize:10,letterSpacing:2,color:focusTimer.breakMode?"#22c55e":focusTimer.courseColor,textTransform:"uppercase",fontWeight:700}}>{focusTimer.breakMode?"☕ Break":"🎯 Focus Mode"}</div>
            <button onClick={stopFocus} style={{background:"transparent",border:"none",color:T.faint,cursor:"pointer",fontSize:14}}>✕</button>
          </div>
          <div style={{fontSize:11,color:T.muted,marginBottom:8,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{focusTimer.blockTitle}</div>
          <div style={{fontSize:32,fontWeight:800,textAlign:"center",color:focusTimer.remaining<=60&&!focusTimer.breakMode?T.danger:T.text,fontVariantNumeric:"tabular-nums"}}>
            {Math.floor(focusTimer.remaining/60).toString().padStart(2,"0")}:{(focusTimer.remaining%60).toString().padStart(2,"0")}
          </div>
          <div style={{background:T.border,borderRadius:4,height:4,marginTop:10,marginBottom:10,overflow:"hidden"}}>
            <div style={{height:"100%",borderRadius:4,background:focusTimer.breakMode?"#22c55e":focusTimer.courseColor,width:`${((focusTimer.duration-focusTimer.remaining)/focusTimer.duration)*100}%`,transition:"width 1s linear"}}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={pauseFocus} className="bg2" style={{flex:1,fontSize:12,padding:"6px 0"}}>{focusTimer.isPaused?"▶ Resume":"⏸ Pause"}</button>
            <button onClick={stopFocus} style={{flex:1,fontSize:12,padding:"6px 0",background:T.success,color:"#fff",border:"none",borderRadius:8,cursor:"pointer",fontFamily:"inherit"}}>✓ Done</button>
          </div>
        </div>
      )}

      {/* ── Mobile header ─────────────────────────────────── */}
      <header className="mobile-header" style={{paddingTop:`max(12px,env(safe-area-inset-top))`}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:30,height:30,borderRadius:8,background:`rgba(${rgb},.15)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{uni.logo}</div>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:T.text,lineHeight:1.1}}>ProPlan Scholar</div>
            <div style={{fontSize:10,color:T.muted,lineHeight:1}}>{uni.abbr} · {profile.full_name?.split(" ")[0]}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setChatOpen(o=>!o)} style={{width:36,height:36,borderRadius:10,background:chatOpen?`rgba(${rgb},.15)`:T.hoverBg,border:`1px solid ${chatOpen?T.accent:T.border2}`,color:chatOpen?T.accent:T.muted,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>💬</button>
          <button onClick={async()=>{const nd=!dark;setDark(nd);await supabase?.from("profiles").update({dark_mode:nd}).eq("id",authUser.id);}} style={{width:36,height:36,borderRadius:10,background:T.hoverBg,border:`1px solid ${T.border2}`,color:T.muted,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>{dark?"☀️":"🌙"}</button>
        </div>
      </header>

      <div style={{display:"flex",height:"100vh",overflow:"hidden"}}>

        {/* ═══ DESKTOP SIDEBAR ═══ */}
        {/* Desktop sidebar reopen tab */}
        {!sidebarOpen&&!isMobile&&(
          <div className="sidebar-tab" onClick={()=>setSidebar(true)}>
            <div style={{width:14,height:2,background:"#fff",borderRadius:2}}/>
            <div style={{width:14,height:2,background:"#fff",borderRadius:2}}/>
            <div style={{width:14,height:2,background:"#fff",borderRadius:2}}/>
          </div>
        )}

        <aside className="desktop-sidebar" style={{width:sidebarOpen?248:0,minWidth:sidebarOpen?248:0,background:T.sidebar,borderRight:sidebarOpen?`1px solid ${T.border}`:"none",display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden",transition:"width .25s ease,min-width .25s ease"}}>
          {/* Sidebar header */}
          <div style={{padding:"16px 12px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",background:`linear-gradient(135deg,rgba(${rgb},.1),transparent)`}}>
            <div style={{overflow:"hidden",flex:1,marginRight:8}}>
              <div style={{fontSize:9,letterSpacing:2.5,color:T.accent,textTransform:"uppercase",fontWeight:700,whiteSpace:"nowrap",marginBottom:2}}>{uni.abbr} · {profile.full_name?.split(" ")[0]}</div>
              <div style={{fontSize:16,fontWeight:700,color:T.text,whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:6}}><span>{uni.logo}</span> ProPlan Scholar</div>
              {uni.mascot&&<div style={{fontSize:9,color:T.faint,marginTop:1}}>{uni.mascot}</div>}
            </div>
            <button onClick={()=>setSidebar(o=>!o)} style={{background:T.hoverBg,border:`1px solid ${T.border2}`,borderRadius:8,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",color:T.muted,fontSize:12,flexShrink:0}}>←</button>
          </div>
          {/* Nav items + badges in scrollable region */}
          <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"}}>
          <nav style={{padding:"8px",display:"flex",flexDirection:"column",gap:2}}>
            {NAV.map(item=>{
              const badge=item.id==="assignments"?overdue.length:item.id==="calendar"&&todayStudy.length>0?todayStudy.length:0;
              return(
                <button key={item.id} onClick={()=>setView(item.id)} title={item.label} className="nb" style={{background:view===item.id?`rgba(${rgb},.12)`:"transparent",border:`1px solid ${view===item.id?T.accent:"transparent"}`,color:view===item.id?T.accent:T.muted,justifyContent:"flex-start"}}>
                  <span style={{fontSize:18,width:26,textAlign:"center",flexShrink:0}}>{item.icon}</span>
                  <span style={{flex:1,fontSize:14}}>{item.label}</span>
                  {badge>0&&<span style={{background:T.danger,color:"#fff",borderRadius:10,fontSize:9,fontWeight:700,padding:"2px 6px",minWidth:18,textAlign:"center"}}>{badge}</span>}
                </button>
              );
            })}
          </nav>
          {overdue.length>0&&<div onClick={()=>setView("assignments")} style={{margin:"0 6px 6px",background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",borderRadius:8,padding:"7px 8px",overflow:"hidden",cursor:"pointer"}}>
            <div style={{fontSize:10,color:T.danger,fontWeight:700,whiteSpace:"nowrap"}}>⚠ {sidebarOpen?"OVERDUE":overdue.length}</div>
            {sidebarOpen&&<div style={{fontSize:11,color:T.danger,opacity:.8}}>{overdue.length} item{overdue.length>1?"s":""}</div>}
          </div>}
          {nextMilestone&&sidebarOpen&&<div style={{margin:"0 6px 6px",background:`rgba(${rgb},.08)`,border:`1px solid rgba(${rgb},.2)`,borderRadius:8,padding:"7px 9px"}}>
            <div style={{fontSize:9,color:T.accent,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Next Milestone</div>
            <div style={{fontSize:11,fontWeight:600,marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{nextMilestone.title}</div>
            <div style={{fontSize:10,color:daysUntil(nextMilestone.due)<0?T.danger:T.muted}}>{daysUntil(nextMilestone.due)<0?`${Math.abs(daysUntil(nextMilestone.due))}d overdue`:`${daysUntil(nextMilestone.due)}d away`}</div>
          </div>}
          </div>
          <div style={{padding:"8px 6px",borderTop:`1px solid ${T.border}`,display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setChatOpen(o=>!o)} className="nb" style={{flex:1,justifyContent:"center",background:chatOpen?`rgba(${rgb},.12)`:"transparent",border:`1px solid ${chatOpen?T.accent:T.border2}`,color:chatOpen?T.accent:T.muted,borderRadius:10,minHeight:36}}>
                <span style={{fontSize:14}}>💬</span>{sidebarOpen&&<span style={{fontSize:12}}>AI Chat</span>}
              </button>
              <button onClick={()=>setView("settings")} className="nb" style={{width:36,flexShrink:0,justifyContent:"center",border:`1px solid ${view==="settings"?T.accent:T.border2}`,color:view==="settings"?T.accent:T.muted,borderRadius:10,minHeight:36,padding:0}}>
                <span style={{fontSize:14}}>⚙</span>
              </button>
              <button onClick={async()=>{const nd=!dark;setDark(nd);await supabase?.from("profiles").update({dark_mode:nd}).eq("id",authUser.id);}} className="nb" style={{width:36,flexShrink:0,justifyContent:"center",border:`1px solid ${T.border2}`,borderRadius:10,minHeight:36,padding:0}}>
                <span style={{fontSize:14}}>{dark?"☀️":"🌙"}</span>
              </button>
            </div>
            <button onClick={async()=>{await supabase.auth.signOut();window.location.href="/";}} className="nb" style={{justifyContent:"flex-start",color:T.faint,borderRadius:10,padding:"8px 10px",fontSize:13}}>
              <span style={{fontSize:14}}>↩</span>
              {sidebarOpen&&<span style={{fontSize:13,whiteSpace:"nowrap"}}>Sign Out</span>}
            </button>
            <div style={{display:"flex",gap:14,padding:"4px 4px 0"}}>
              <a href="/privacy" target="_blank" rel="noreferrer" style={{fontSize:10,color:T.faint,textDecoration:"none"}}>Privacy</a>
              <a href="/terms" target="_blank" rel="noreferrer" style={{fontSize:10,color:T.faint,textDecoration:"none"}}>Terms</a>
              <span style={{fontSize:10,color:T.faint}}>© 2026</span>
            </div>
          </div>
        </aside>

        {/* ═══ MAIN CONTENT ═══ */}

        <main ref={mainRef} className="main-content" style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"24px 28px",minWidth:0,maxWidth:"100%",position:"relative",WebkitOverflowScrolling:"touch"}}>


          {/* PWA Install Banner */}
          {showInstallBanner&&installPrompt&&(
            <div style={{marginBottom:14,padding:"12px 14px",background:`rgba(${rgb},.1)`,border:`1px solid rgba(${rgb},.3)`,borderRadius:12,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:24,flexShrink:0}}>📲</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:600,fontSize:13,marginBottom:2}}>Install ProPlan Scholar</div>
                <div style={{fontSize:11,color:T.muted}}>Add to your home screen for the full app experience</div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button onClick={()=>setShowInstallBanner(false)} style={{background:"transparent",border:`1px solid ${T.border2}`,borderRadius:7,padding:"5px 8px",fontSize:11,color:T.muted,cursor:"pointer",fontFamily:"inherit"}}>Later</button>
                <button className="bp" style={{fontSize:11,padding:"5px 12px"}} onClick={async()=>{if(installPrompt){await installPrompt.prompt();setInstallPrompt(null);setShowInstallBanner(false);}}}>Install</button>
              </div>
            </div>
          )}

          {/* ── DASHBOARD ── */}
          {view==="dashboard"&&(
            <div className="fi">
              <div style={{marginBottom:16,paddingBottom:14,borderBottom:`2px solid rgba(${rgb},.18)`}}>
                <div style={{fontSize:10,letterSpacing:3,color:T.accent,textTransform:"uppercase"}}>Welcome back, {profile.full_name?.split(" ")[0]}</div>
                <h1 style={{fontSize:25,fontWeight:700,marginTop:3}}>Your Academic Dashboard</h1>
                <div style={{color:T.muted,fontSize:12,marginTop:3}}>{MONTHS[t.month]} {t.day}, {t.year} · {uni.name}{uni.mascot?" · "+uni.mascot:""} · {DEGREE_LEVELS.find(d=>d.id===profile.degree_level)?.label}</div>
                <div style={{display:"flex",gap:7,marginTop:7,flexWrap:"wrap"}}>
                  {profile.is_athlete&&profile.sports?.map(s=><span key={s} style={{fontSize:10,padding:"2px 8px",borderRadius:12,background:`rgba(${rgb},.1)`,color:T.accent,border:`1px solid rgba(${rgb},.25)`}}>🏅 {s}</span>)}
                  {profile.is_greek&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:12,background:`rgba(${rgb},.1)`,color:T.accent,border:`1px solid rgba(${rgb},.25)`}}>🏛 {profile.greek_org}</span>}
                  {profile.is_working_professional&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:12,background:`rgba(${rgb},.1)`,color:T.accent,border:`1px solid rgba(${rgb},.25)`}}>💼 Working Professional</span>}
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:10,marginBottom:14}}>
                {(()=>{const _g=calcGPA(grades,courses,assignments);return[{l:"Courses",v:courses.length,c:T.accent,nav:"courses"},{l:"Pending",v:assignments.filter(a=>!a.done).length,c:T.warning,nav:"assignments"},{l:"GPA",v:grades.length>0?_g.overall.toFixed(2):"—",c:"#a78bfa",nav:"analytics"},{l:"Study Hrs Complete",v:Object.keys(completedStudy).filter(k=>completedStudy[k]).length*2,c:"#0ea5e9",nav:"calendar"},{l:"Milestones",v:milestones.filter(m=>!m.done).length,c:"#a78bfa",nav:"major-project"},{l:"Done",v:assignments.filter(a=>a.done).length,c:T.success,nav:"assignments"},{l:"Streak",v:`${studyStreak}d 🔥`,c:"#f97316",nav:"analytics"}];})().map(s=>(
                  <div key={s.l} className="card stat-card" onClick={()=>setView(s.nav)} title={`Go to ${s.nav}`} style={{textAlign:"center",borderTop:`2px solid ${s.c}`,minWidth:90,flexShrink:0}}>
                    <div style={{fontSize:26,fontWeight:700,color:s.c}}>{s.v}</div>
                    <div style={{fontSize:9,color:T.muted,marginTop:2,letterSpacing:1,textTransform:"uppercase"}}>{s.l}</div>
                  </div>
                ))}
              </div>
              {/* ── WELLNESS ALERT ── */}
              {(timeData.overloaded||timeData.strained)&&(
                <div style={{marginBottom:14,padding:"12px 16px",borderRadius:12,border:`1px solid ${timeData.overloaded?"rgba(239,68,68,.4)":"rgba(245,158,11,.4)"}`,background:timeData.overloaded?"rgba(239,68,68,.08)":"rgba(245,158,11,.06)",display:"flex",gap:12,alignItems:"flex-start"}}>
                  <div style={{fontSize:24,flexShrink:0}}>{timeData.overloaded?"🚨":"⚠️"}</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:13,color:timeData.overloaded?T.danger:T.caution,marginBottom:3}}>
                      {timeData.overloaded?"You may be overcommitted this week":"Your schedule is getting full"}
                    </div>
                    <div style={{fontSize:12,color:T.muted,lineHeight:1.6}}>
                      {timeData.overloaded
                        ?`You have ${timeData.totalWk}+ committed hours this week. Research shows performance drops significantly above 80hrs/week. Consider rescheduling or delegating something.`
                        :`You have ${timeData.totalWk} committed hours this week. Make sure you're protecting time for sleep, meals, and recovery.`}
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
                      <button className="bg2" style={{fontSize:11}} onClick={()=>{setChatOpen(true);setTimeout(()=>sendChat("I have "+timeData.totalWk+" committed hours this week. What should I prioritize or cut back on?"),300);}}>Ask AI for Advice</button>
                      <button className="bg2" style={{fontSize:11}} onClick={()=>{setView("dashboard");setShowTimeTracker(true);setTimeout(()=>document.getElementById("time-tracker")?.scrollIntoView({behavior:"smooth"}),100);}}>View Time Breakdown</button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TIME TRACKER WIDGET ── */}
              <div id="time-tracker" className="card" style={{marginBottom:14,cursor:"pointer"}} onClick={()=>setShowTimeTracker(s=>!s)}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div>
                    <div style={{fontSize:10,letterSpacing:2,color:T.accent,textTransform:"uppercase",marginBottom:2}}>Weekly Time Overview</div>
                    <div style={{fontSize:13,fontWeight:600,color:T.text}}>{timeData.totalWk}h committed · {timeData.freeHrs}h free time remaining</div>
                  </div>
                  <span style={{fontSize:12,color:T.muted}}>{showTimeTracker?"▲ Hide":"▼ Details"}</span>
                </div>
                {/* Stacked bar chart */}
                <div style={{display:"flex",height:14,borderRadius:7,overflow:"hidden",gap:1,marginBottom:6}}>
                  {timeData.breakdown.map(cat=>(
                    <div key={cat.label} title={`${cat.label}: ${cat.hrs}h`} style={{flex:cat.hrs,background:cat.color,minWidth:cat.hrs>0?2:0,transition:"flex .4s"}}/>
                  ))}
                </div>
                <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                  {timeData.breakdown.map(cat=>(
                    <span key={cat.label} style={{fontSize:10,color:T.muted,display:"flex",alignItems:"center",gap:3}}>
                      <span style={{width:7,height:7,borderRadius:2,background:cat.color,display:"inline-block",flexShrink:0}}/>
                      {cat.label} {cat.hrs}h
                    </span>
                  ))}
                </div>

                {/* Drill-down panel */}
                {showTimeTracker&&(
                  <div style={{marginTop:14,borderTop:`1px solid ${T.border}`,paddingTop:12}} onClick={e=>e.stopPropagation()}>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:8,marginBottom:12}}>
                      {timeData.breakdown.map(cat=>(
                        <div key={cat.label} onClick={()=>setTrackerCategory(trackerCategory===cat.label?null:cat.label)} style={{padding:"10px 12px",borderRadius:9,border:`2px solid ${trackerCategory===cat.label?cat.color:T.border2}`,background:trackerCategory===cat.label?`rgba(${hexToRgb(cat.color)},.1)`:"transparent",cursor:"pointer",transition:"all .2s"}}>
                          <div style={{fontSize:18,marginBottom:4}}>{cat.icon}</div>
                          <div style={{fontSize:12,fontWeight:600,color:T.text}}>{cat.label}</div>
                          <div style={{fontSize:11,color:cat.color,fontWeight:700}}>{cat.hrs}h / wk</div>
                        </div>
                      ))}
                    </div>
                    {trackerCategory&&(()=>{
                      const cat=timeData.breakdown.find(c=>c.label===trackerCategory);
                      if(!cat)return null;
                      return(
                        <div style={{padding:"10px 14px",background:T.subcard,borderRadius:9,border:`1px solid ${T.border2}`}}>
                          <div style={{fontWeight:600,fontSize:13,marginBottom:8,color:cat.color}}>{cat.icon} {cat.label} Breakdown</div>
                          {cat.detail.length===0
                            ?<div style={{fontSize:12,color:T.faint}}>No details yet. Add schedule blocks to see a breakdown.</div>
                            :cat.detail.map((d,i)=><div key={i} style={{fontSize:12,color:T.muted,padding:"3px 0",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:6}}><span style={{width:5,height:5,borderRadius:"50%",background:cat.color,flexShrink:0,display:"inline-block"}}/>  {d}</div>)
                          }
                        </div>
                      );
                    })()}

                    {/* Study hours completed this session */}
                    {timeData.studyDone>0&&(
                      <div style={{marginTop:10,padding:"8px 12px",background:`rgba(${hexToRgb(T.success)},.08)`,borderRadius:8,border:`1px solid rgba(${hexToRgb(T.success)},.2)`,fontSize:12,color:T.success}}>
                        ✓ You have completed <strong>{timeData.studyDone}h</strong> of studying this session.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="dash-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12,marginBottom:12}}>
                <div className="card" style={{minWidth:0,overflow:"hidden"}}>
                  <div style={{fontSize:10,letterSpacing:2,color:T.accent,textTransform:"uppercase",marginBottom:9}}>Upcoming Deadlines</div>
                  {upcoming.length===0&&<div style={{color:T.faint,fontSize:13}}>All caught up! 🎉</div>}
                  {upcoming.map(a=>{const course=courses.find(c=>c.id===a.courseId);const days=daysUntil(a.due);return(
                    <div key={a.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:`1px solid ${T.border}`}}>
                      <div style={{width:3,height:26,borderRadius:2,background:course?.color||T.accent,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0,overflow:"hidden"}}>
                        <div style={{fontSize:12,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.title}</div>
                        <div style={{fontSize:10,color:T.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{course?.name?.split("–")[0].trim()}</div>
                      </div>
                      <div style={{fontSize:11,fontWeight:700,color:urgencyColor(days,T),flexShrink:0}}>{days<0?"Overdue":days===0?"Today!":`${days}d`}</div>
                    </div>
                  );})}
                </div>
                <div className="card" style={{minWidth:0,overflow:"hidden"}}>
                  <div style={{fontSize:10,letterSpacing:2,color:"#0ea5e9",textTransform:"uppercase",marginBottom:9}}>Today</div>
                  {todayStudy.length===0&&<div style={{color:T.faint,fontSize:12,marginBottom:8}}>No study sessions today.</div>}
                  {todayStudy.slice(0,3).map(b=>(
                    <div key={b.id} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 0",borderBottom:`1px solid ${T.border}`}}>
                      <div style={{width:24,height:24,borderRadius:6,background:b.color+"33",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0}}>📚</div>
                      <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.title}</div><div style={{fontSize:10,color:T.muted}}>{to12h(b.startTime)} – {to12h(b.endTime)}</div></div>
                      {completedStudy[b.id]
                        ?<span style={{fontSize:10,color:"#22c55e",fontWeight:700,flexShrink:0}}>✓ Done</span>
                        :<button onClick={()=>startFocus(b)} title="Start a 25-min focus session" style={{background:`rgba(${hexToRgb(b.color||T.accent)},.12)`,border:`1px solid ${b.color||T.accent}`,borderRadius:7,padding:"4px 9px",fontSize:11,color:b.color||T.accent,fontWeight:600,cursor:"pointer",fontFamily:"inherit",flexShrink:0,minHeight:28}}>▶ Focus</button>}
                    </div>
                  ))}
                  <div style={{marginTop:9,padding:9,background:T.subcard,borderRadius:8,border:`1px solid ${T.border2}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:6}}>
                      <div style={{fontSize:10,color:T.muted,letterSpacing:1,textTransform:"uppercase"}}>Today's Energy Level</div>
                      <span className="energy-tip" style={{fontSize:11,color:T.faint,cursor:"help",position:"relative"}}>ⓘ<span className="energy-tip-text">Log your energy daily. The AI uses this to suggest better study times and adapt your schedule.</span></span>
                    </div>
                    <div style={{display:"flex",gap:5}}>
                      {[1,2,3,4,5].map(lvl=>{const cols=["#ef4444","#f97316","#eab308","#84cc16","#22c55e"];const emojis=["😴","😓","😐","😊","🚀"];const active=todayEnergy===lvl;return(
                        <button key={lvl} onClick={()=>logEnergy(lvl)} className={active?"energy-pop":""} style={{width:30,height:30,borderRadius:"50%",border:`2px solid ${active?cols[lvl-1]:T.border2}`,background:active?cols[lvl-1]+"33":"transparent",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s ease",boxShadow:active?`0 0 10px ${cols[lvl-1]}44`:""}}>{emojis[lvl-1]}</button>
                      );})}
                      {todayEnergy&&<span style={{fontSize:10,color:T.success,marginLeft:4,alignSelf:"center",animation:"fadeSlideIn .3s ease"}}>✓ Logged</span>}
                    </div>
                  </div>
                </div>
              </div>
              <div className="settings-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12}}>
                <div className="card" style={{borderLeft:`3px solid ${T.accent}`}}>
                  <div style={{fontSize:10,letterSpacing:2,color:T.accent,textTransform:"uppercase",marginBottom:7}}>{["doctoral","postdoc"].includes(profile?.degree_level)?"Dissertation Progress":["graduate"].includes(profile?.degree_level)?"Thesis Progress":"Major Project Progress"}</div>
                  {nextMilestone?(<>
                    <div style={{fontWeight:600,fontSize:13,marginBottom:2}}>{nextMilestone.title}</div>
                    <div style={{fontSize:11,color:T.muted,marginBottom:6}}>{nextMilestone.notes}</div>
                    <div className="prog-bar"><div className="prog-fill" style={{width:`${Math.round(milestones.filter(m=>m.done).length/Math.max(milestones.length,1)*100)}%`,background:T.accent}}/></div>
                    <div style={{fontSize:11,color:T.muted,marginTop:4}}>{milestones.filter(m=>m.done).length}/{milestones.length} milestones · {daysUntil(nextMilestone.due)<0?<span style={{color:T.danger}}>{Math.abs(daysUntil(nextMilestone.due))}d overdue</span>:`${daysUntil(nextMilestone.due)}d to next`}</div>
                  </>):<div style={{color:T.faint,fontSize:12}}>Add milestones in the {["doctoral","postdoc"].includes(profile?.degree_level)?"Dissertation":"Major Projects & Presentations"} tab.</div>}
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
              <label
                className={"syl-drop"+(isDragging?" is-dragging":"")}
                style={{marginTop:12,display:"flex",alignItems:"center",gap:11,textAlign:"left",padding:12}}
                onDragOver={handleSyllabusDragOver}
                onDragEnter={handleSyllabusDragOver}
                onDragLeave={handleSyllabusDragLeave}
                onDrop={handleSyllabusDrop}>
                <input type="file" accept=".txt,.pdf,.docx" onChange={handleSyllabusUpload} style={{display:"none"}}/>
                <div style={{fontSize:20}}>📄</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:13}}>Import Syllabus</div>
                  <div style={{fontSize:11,color:T.muted}}>{isDragging?"Drop your syllabus to upload":"Drop or click — AI extracts all assignments automatically"}</div>
                </div>
                <span className="bp" style={{fontSize:12,padding:"6px 13px",display:"inline-block"}}>{uploading?"Analyzing…":"Upload"}</span>
                {uploadMsg&&<div style={{fontSize:11,color:T.success}}>{uploadMsg}</div>}
              </label>
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
                <span><span style={{display:"inline-block",width:8,height:8,borderRadius:2,background:"#10b981",marginRight:4}}/>Class</span>
              </div>
              <div className="cal-header">
                {DAYS_SHORT.map(d=><div key={d} className="cal-header-cell" style={{color:T.faint}}>{d.slice(0,1)}</div>)}
              </div>
              <div className="cal-grid">
                {calDays.map((day,i)=>{
                  if(!day)return<div key={i}/>;
                  const{asgn,study,travel,milestone,blocks,classes}=getEventsForDay(calYear,calMonth,day);
                  const isToday=calYear===t.year&&calMonth===t.month&&day===t.day;
                  const isSel=selectedDay===day;
                  return(
                    <div key={i} onClick={()=>setSelectedDay(isSel?null:day)} className="cal-day" style={{background:travel?(dark?"#1a1510":"#fff8ee"):isSel?(dark?"#1e1e35":"#ebebff"):isToday?(dark?"#16162a":"#f0f0ff"):(dark?"#12121a":T.card),border:`1px solid ${isToday?T.accent:T.border}`}}>
                      <div style={{fontSize:11,fontWeight:isToday?700:400,color:isToday?T.accent:T.text,marginBottom:2}}>{day}{travel&&" ✈"}</div>
                      {classes.map(c=><div key={c.id} className="cal-pill" style={{background:"rgba(16,185,129,.2)",color:"#10b981"}}>🎓 {c.name.length>8?c.name.slice(0,8)+"…":c.name}</div>)}
                      {asgn.map(a=>{const col=(!a.done&&daysUntil(a.due)<0)?T.danger:courses.find(c=>c.id===a.courseId)?.color||T.accent;return(<div key={a.id} className="cal-pill" style={{background:`rgba(${hexToRgb(col)},.2)`,color:col}}>{(!a.done&&daysUntil(a.due)<0)?"⚠":"📌"} {a.title.length>8?a.title.slice(0,8)+"…":a.title}</div>);})}
                      {study.slice(0,2).map(b=>{const done=completedStudy[b.id];const bCourse=courses.find(c=>c.id===b.courseId);return(<div key={b.id} className="cal-pill" style={{background:done?`rgba(${hexToRgb(bCourse?.color||"34,197,94")},.15)`:`rgba(${hexToRgb(bCourse?.color||"14,165,233")},.2)`,color:done?"#22c55e":bCourse?.color||"#38bdf8",textDecoration:done?"line-through":"none"}}>📚 {to12h(b.startTime)}</div>);})}
                      {milestone&&<div className="cal-pill" style={{background:"rgba(167,139,250,.2)",color:"#a78bfa"}}>⬟ {milestone.title.length>6?milestone.title.slice(0,6)+"…":milestone.title}</div>}
                      {study.length>2&&<div style={{fontSize:7,color:T.faint}}>+{study.length-2} more</div>}
                    </div>
                  );
                })}
              </div>
              {selectedDay&&(()=>{
                const{asgn,study,travel,milestone,blocks,classes}=getEventsForDay(calYear,calMonth,selectedDay);
                return(
                  <div className="card fi" style={{marginTop:10}}>
                    <div style={{fontWeight:700,marginBottom:7}}>{MONTHS[calMonth]} {selectedDay}, {calYear}</div>
                    {travel&&<div style={{marginBottom:6,fontSize:12,color:T.caution}}>✈ {travel.label} — traveling</div>}
                    {milestone&&<div style={{padding:"6px 9px",background:"rgba(167,139,250,.08)",borderRadius:7,marginBottom:6,border:"1px solid rgba(167,139,250,.2)"}}><div style={{fontWeight:600,color:"#a78bfa",fontSize:12}}>⬟ {milestone.title}</div><div style={{fontSize:10,color:T.muted}}>{milestone.notes}</div></div>}
                    {/* Class sessions for the day */}
                    {getEventsForDay(calYear,calMonth,selectedDay).classes?.map(c=>(
                      <div key={c.id} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:`1px solid ${T.border}`,alignItems:"center"}}>
                        <span style={{fontSize:12}}>🎓</span>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:600,fontSize:12,color:c.color}}>{c.name}</div>
                          <div style={{fontSize:10,color:T.muted}}>{to12h(c.class_time)}{c.class_end_time?" – "+to12h(c.class_end_time):""}</div>
                        </div>
                      </div>
                    ))}
                    {blocks.map(b=><div key={b.id} style={{fontSize:11,color:T.muted,marginBottom:3}}>⊞ {b.label} ({to12h(b.start_time)}–{to12h(b.end_time)})</div>)}
                    {asgn.length===0&&study.length===0&&!travel&&!milestone&&blocks.length===0&&classes.length===0&&(
                      <div style={{textAlign:"center",padding:"10px 0"}}>
                        <div style={{fontSize:20,marginBottom:4}}>{calYear===t.year&&calMonth===t.month&&selectedDay===t.day?"📭":"📅"}</div>
                        <div style={{color:T.faint,fontSize:12,marginBottom:8}}>Nothing scheduled{calYear===t.year&&calMonth===t.month&&selectedDay===t.day?" today":""}.</div>
                        <div style={{display:"flex",gap:6,justifyContent:"center"}}>
                          <button onClick={()=>{setView("assignments");setShowAddAssign(true);}} className="bg2" style={{fontSize:11,padding:"5px 10px",borderRadius:6}}>+ Assignment</button>
                          <button onClick={()=>setView("schedule")} className="bg2" style={{fontSize:11,padding:"5px 10px",borderRadius:6}}>+ Time Block</button>
                        </div>
                      </div>
                    )}
                    {asgn.map(a=>{const c=courses.find(x=>x.id===a.courseId);return(<div key={a.id} style={{display:"flex",gap:8,padding:"5px 0",borderBottom:`1px solid ${T.border}`,alignItems:"center"}}><span style={{color:c?.color,fontSize:12}}>📌</span><div style={{flex:1}}><div style={{fontWeight:600,fontSize:12}}>{a.title}</div><div style={{fontSize:10,color:T.muted}}>{c?.name}</div></div></div>);})}
                    {study.map(b=>{const done=completedStudy[b.id];const course=courses.find(c=>c.id===b.courseId);return(
                      <div key={b.id} style={{display:"flex",gap:8,padding:"7px 0",borderBottom:`1px solid ${T.border}`,alignItems:"center",opacity:done?.6:1,flexWrap:"wrap"}}>
                        <span style={{fontSize:12}}>📚</span>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:600,fontSize:12,textDecoration:done?"line-through":"none"}}>{b.title}</div>
                          <div style={{fontSize:10,color:T.muted}}>{to12h(b.startTime)} – {to12h(b.endTime)} · {b.hours}h</div>
                          {course&&<div style={{fontSize:10,color:course.color,marginTop:1}}>● {course.name}</div>}
                          {!done&&<button onClick={(e)=>{e.stopPropagation();startFocus(b);}} style={{background:`rgba(${hexToRgb(course?.color||T.accent)},.1)`,border:`1px solid ${course?.color||T.accent}`,borderRadius:6,padding:"3px 8px",fontSize:10,color:course?.color||T.accent,cursor:"pointer",marginTop:3,fontFamily:"inherit"}}>▶ Focus</button>}
                        </div>
                        <button onClick={()=>toggleStudyComplete(b.id)} style={{fontSize:10,padding:"3px 8px",borderRadius:6,border:`1px solid ${done?T.success:T.border2}`,background:done?`rgba(${hexToRgb(T.success)},.1)`:"transparent",color:done?T.success:T.muted,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit"}}>{done?"✓ Done":"Mark Done"}</button>
                      </div>
                    );})}
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
                <div style={{display:"flex",gap:7,alignItems:"center"}}>
                  <label
                    className={"syl-drop-mini"+(isDragging?" is-dragging":"")}
                    onDragOver={handleSyllabusDragOver}
                    onDragEnter={handleSyllabusDragOver}
                    onDragLeave={handleSyllabusDragLeave}
                    onDrop={handleSyllabusDrop}
                    title="Click or drag a syllabus file here">
                    <input type="file" accept=".txt,.pdf,.docx" onChange={handleSyllabusUpload} style={{display:"none"}}/>
                    <span style={{whiteSpace:"nowrap"}}>{uploading?"Analyzing…":isDragging?"⬇ Drop here":"📄 Upload or drop"}</span>
                  </label>
                  <button className="bp" onClick={()=>setShowAddAssign(true)}>+ Add</button>
                </div>
              </div>
              {courses.length===0&&assignments.length===0&&(
                <div style={{textAlign:"center",padding:"48px 24px",color:T.muted,maxWidth:440,margin:"0 auto"}}>
                  <div style={{fontSize:56,marginBottom:16}}>📚</div>
                  <div style={{fontWeight:700,fontSize:18,marginBottom:10,color:T.text}}>No assignments yet</div>
                  <div style={{fontSize:13,marginBottom:24,lineHeight:1.7,color:T.muted}}>
                    Upload a syllabus and ProPlan Scholar will automatically extract all your assignments, due dates, and estimated study hours — no manual entry needed.
                  </div>
                  <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap",marginBottom:16}}>
                    <label style={{cursor:"pointer"}}><input type="file" accept=".txt,.pdf,.docx" onChange={handleSyllabusUpload} style={{display:"none"}}/><span className="bp" style={{display:"inline-block",padding:"10px 20px",fontSize:13}}>📄 Upload Syllabus</span></label>
                    <button className="bg2" style={{fontSize:13,padding:"10px 18px"}} onClick={()=>{setShowAddCourse(true);}}>+ Add Course First</button>
                  </div>
                  <div style={{fontSize:11,color:T.faint}}>Supports PDF, .txt, and Word documents</div>
                </div>
              )}
              {courses.length>0&&assignments.length===0&&(
                <div style={{textAlign:"center",padding:"48px 24px",color:T.muted,maxWidth:440,margin:"0 auto"}}>
                  <div style={{fontSize:56,marginBottom:16}}>📝</div>
                  <div style={{fontWeight:700,fontSize:18,marginBottom:10,color:T.text}}>No assignments yet</div>
                  <div style={{fontSize:13,marginBottom:24,lineHeight:1.7,color:T.muted}}>
                    You have courses set up. Now add assignments manually or upload a syllabus to import them automatically.
                  </div>
                  <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
                    <label style={{cursor:"pointer"}}><input type="file" accept=".txt,.pdf,.docx" onChange={handleSyllabusUpload} style={{display:"none"}}/><span className="bp" style={{display:"inline-block",padding:"10px 20px",fontSize:13}}>📄 Upload Syllabus</span></label>
                    <button className="bp" style={{fontSize:13,padding:"10px 20px",background:"transparent",border:`1px solid ${T.accent}`,color:T.accent}} onClick={()=>setShowAddAssign(true)}>+ Add Assignment</button>
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
                  {(()=>{const ps=course.professor?getProfStats(course.professor,uni.name):null;return ps&&<div style={{display:"flex",gap:8,marginBottom:5,fontSize:11,color:T.muted}}>⭐{ps.quality} Quality · 🔥{ps.difficulty} Difficulty · {ps.count} peer rating{ps.count>1?"s":""} <button onClick={()=>{setShowRateModal({courseId:course.id,profName:course.professor,courseName:course.name});setNewRating({quality:0,difficulty:0,workload:0,wouldTakeAgain:null,comment:""}); }} style={{background:"transparent",border:"none",color:T.accent,fontSize:11,cursor:"pointer",padding:0,fontFamily:"inherit"}}>+ Rate</button></div>})()}
                  {ca.sort((a,b)=>new Date(a.due)-new Date(b.due)).map(a=>{
                    const days=daysUntil(a.due);const sh=studyBlocks.filter(b=>b.assignId===a.id).length*2;const hasCards=a.flashcards?.length>0;
                    return(<div key={a.id} style={{padding:"11px 12px",background:dark?"#12121a":T.card,border:`1px solid ${T.border}`,borderRadius:10,marginBottom:6,opacity:a.done?0.5:1,transition:"opacity .2s"}}>
                      {/* Top row: checkbox + title + urgency */}
                      <div style={{display:"flex",alignItems:"flex-start",gap:9,marginBottom:a.topics?4:0}}>
                        <input type="checkbox" checked={a.done} onChange={()=>toggleDone(a.id)} style={{width:16,height:16,accentColor:course.color,cursor:"pointer",marginTop:2,flexShrink:0}}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:600,textDecoration:a.done?"line-through":"none",fontSize:13,lineHeight:1.3}}>{a.title}</div>
                          {a.topics&&<div style={{fontSize:11,color:T.muted,marginTop:2,fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.topics}</div>}
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div style={{fontSize:12,fontWeight:700,color:a.done?T.faint:urgencyColor(days,T)}}>{a.done?"Done":days<0?"Overdue":days===0?"Today!":`${days}d`}</div>
                          <div style={{fontSize:10,color:T.faint}}>{a.due}</div>
                        </div>
                      </div>
                      {/* Bottom row: type tag + action buttons */}
                      <div style={{display:"flex",alignItems:"center",gap:6,marginTop:7,paddingTop:6,borderTop:`1px solid ${T.border}`,flexWrap:"wrap"}}>
                        <span className="tag" style={{background:course.color+"22",color:course.color}}>{a.type}</span>
                        <span style={{fontSize:10,color:T.muted}}>Est. {a.estHours}h · {sh}h study{a.weight!=null&&!isNaN(Number(a.weight))?` · ${Number(a.weight)}% wt`:""}</span>
                        {(()=>{
                          const g=grades.find(x=>x.assignmentId===a.id);
                          if(!g||!g.maxScore)return null;
                          const p=(g.score/g.maxScore)*100;
                          const lt=pctToLetterGrade(p);
                          const c=p>=90?T.success:p>=80?"#0ea5e9":p>=70?T.caution:p>=60?T.warning:T.danger;
                          return<span style={{fontSize:10,fontWeight:700,color:c,padding:"2px 6px",borderRadius:5,background:`rgba(${hexToRgb(c)},.12)`}}>{lt} · {p.toFixed(0)}%</span>;
                        })()}
                        {hasCards&&<span style={{fontSize:10,color:"#a78bfa"}}>⬡ {a.flashcards.length} cards</span>}
                        <div style={{marginLeft:"auto",display:"flex",gap:5,flexShrink:0}}>
                          {!a.done&&<button onClick={()=>startFocus({id:`assign-${a.id}-${Date.now()}`,title:a.title,color:course.color})} title="Start a 25-min focus session for this assignment" style={{background:`rgba(${hexToRgb(course.color)},.12)`,border:`1px solid ${course.color}`,borderRadius:7,padding:"5px 9px",fontSize:11,color:course.color,minHeight:30,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>🎯 Focus</button>}
                          <button onClick={()=>{setShowFlashModal(a.id);setView("flashcards");}} style={{background:"transparent",border:`1px solid ${hasCards?"#a78bfa":T.border2}`,borderRadius:7,padding:"5px 9px",fontSize:11,color:hasCards?"#a78bfa":T.muted,minHeight:30}}>{hasCards?"⬡ Cards":"⬡ Gen"}</button>
                          <button onClick={()=>setEditAssign({...a})} style={{background:"transparent",border:`1px solid ${T.border2}`,borderRadius:7,padding:"5px 9px",fontSize:11,color:T.muted,minHeight:30}}>✏️</button>
                          <button onClick={()=>{const existing=grades.find(g=>g.assignmentId===a.id);setGradeInput({score:existing?.score??"",maxScore:existing?.maxScore||100});setShowGradeModal(a);}} style={{background:"transparent",border:`1px solid ${T.border2}`,borderRadius:7,padding:"5px 9px",fontSize:11,color:T.muted,minHeight:30}}>📊</button>
                          <button className="del-btn" style={{padding:"5px 9px",minHeight:30}} onClick={()=>deleteAssignment(a.id)}>🗑</button>
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
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:13,flexWrap:"wrap",gap:8}}>
                <div><div style={{fontSize:10,letterSpacing:3,color:T.accent,textTransform:"uppercase"}}>Enrolled</div><h1 style={{fontSize:22,fontWeight:700}}>Courses</h1></div>
                <div style={{display:"flex",gap:8,flexShrink:0,alignItems:"center"}}>
                  <label
                    className={"syl-drop-mini"+(isDragging?" is-dragging":"")}
                    onDragOver={handleSyllabusDragOver}
                    onDragEnter={handleSyllabusDragOver}
                    onDragLeave={handleSyllabusDragLeave}
                    onDrop={handleSyllabusDrop}
                    title="Click to choose, or drag a syllabus file here">
                    <input type="file" accept=".txt,.pdf,.docx" onChange={handleSyllabusUpload} style={{display:"none"}}/>
                    <span style={{whiteSpace:"nowrap"}}>{uploading?"Analyzing…":isDragging?"⬇ Drop to upload":"📄 Upload or drop syllabus"}</span>
                  </label>
                  <button className="bp" onClick={()=>setShowAddCourse(true)}>+ Add Course</button>
                </div>
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
                    {c.professor&&<div style={{fontSize:11,color:T.muted,marginBottom:4}}>👤 {c.professor}</div>}
                    <div style={{marginBottom:8}}>
                      {c.class_days?.length>0
                        ?<div style={{fontSize:11,color:T.muted,display:"flex",alignItems:"center",gap:6}}>🗓 {c.class_days.join(", ")} {c.class_time&&`· ${to12h(c.class_time)}`}{c.class_end_time&&` – ${to12h(c.class_end_time)}`}
                          <button onClick={()=>setCourses(p=>p.map(x=>x.id===c.id?{...x,_editSched:!x._editSched}:x))} style={{fontSize:10,color:T.accent,background:"transparent",border:"none",cursor:"pointer",padding:0}}>edit</button>
                        </div>
                        :<button onClick={()=>setCourses(p=>p.map(x=>x.id===c.id?{...x,_editSched:true}:x))} style={{fontSize:11,color:T.accent,background:"transparent",border:`1px dashed ${T.border2}`,borderRadius:6,padding:"2px 8px",cursor:"pointer",fontFamily:"inherit"}}>+ Add class schedule</button>
                      }
                      {c._editSched&&(
                        <div style={{marginTop:8,padding:"10px 12px",background:T.subcard,borderRadius:9,border:`1px solid ${T.border2}`}}>
                          <div style={{fontSize:11,color:T.muted,marginBottom:6}}>Which days does this class meet?</div>
                          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
                            {DAYS_SHORT.map(d=>{const sel=(c.class_days||[]).includes(d);return(
                              <button key={d} type="button" onClick={()=>{const cur=c.class_days||[];const updated=sel?cur.filter(x=>x!==d):[...cur,d];setCourses(p=>p.map(x=>x.id===c.id?{...x,class_days:updated}:x));}} style={{padding:"4px 9px",borderRadius:6,border:`2px solid ${sel?T.accent:T.border2}`,background:sel?`rgba(${hexToRgb(T.accent)},.12)`:"transparent",color:sel?T.accent:T.muted,fontSize:11,fontWeight:sel?700:400,cursor:"pointer",fontFamily:"inherit"}}>
                                {d}
                              </button>
                            );})}
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:8}}>
                            <div><div style={{fontSize:10,color:T.muted,marginBottom:2}}>Start time</div><input type="time" className="ifield" value={c.class_time||""} onChange={e=>setCourses(p=>p.map(x=>x.id===c.id?{...x,class_time:e.target.value}:x))} style={{fontSize:11,padding:"4px 7px"}}/></div>
                            <div><div style={{fontSize:10,color:T.muted,marginBottom:2}}>End time</div><input type="time" className="ifield" value={c.class_end_time||""} onChange={e=>setCourses(p=>p.map(x=>x.id===c.id?{...x,class_end_time:e.target.value}:x))} style={{fontSize:11,padding:"4px 7px"}}/></div>
                          </div>
                          <button className="bp" style={{fontSize:11,width:"100%"}} onClick={async()=>{
                            await supabase.from("courses").update({class_days:c.class_days||[],class_time:c.class_time||"",class_end_time:c.class_end_time||""}).eq("id",c.id);
                            setCourses(p=>p.map(x=>x.id===c.id?{...x,_editSched:false}:x));
                            notify("Class schedule saved!");
                          }}>Save Schedule</button>
                        </div>
                      )}
                    </div>
                    {(()=>{
                      const stats=c.professor?getProfStats(c.professor,uni.name):null;
                      const rmp=c.rmpData;
                      const myRating=profRatings.find(r=>r.user_id===authUser?.id&&r.prof_name?.toLowerCase()===c.professor?.toLowerCase());
                      return(<div style={{marginBottom:8}}>
                        {/* Professor name field if not set */}
                        {!c.professor&&<div style={{marginBottom:6}}>
                          <input className="ifield" placeholder="Enter professor name..." value={c.professor||""} 
                            onChange={e=>setCourses(p=>p.map(x=>x.id===c.id?{...x,professor:e.target.value}:x))}
                            onBlur={async e=>{
                              const val=e.target.value.trim();
                              const{error}=await supabase.from("courses").update({professor:val}).eq("id",c.id);
                              if(error){notify(`Save error: ${error.message}`);console.error("professor save error:",error);}
                              else if(val)notify(`Professor saved: ${val}`);
                            }}
                            style={{fontSize:11,padding:"5px 8px"}}/>
                          <div style={{fontSize:10,color:T.faint,marginTop:3}}>Add professor name to search peer ratings</div>
                        </div>}

                        {/* Community ratings from ProPlan Scholar peers */}
                        {stats?(
                          <div style={{background:`rgba(${hexToRgb(T.success)},.06)`,borderRadius:9,padding:"10px 12px",marginBottom:7,border:`1px solid rgba(${hexToRgb(T.success)},.2)`}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                              <div style={{fontSize:11,fontWeight:700,color:T.success}}>🎓 ProPlan Scholar Peer Ratings</div>
                              <span style={{fontSize:10,color:T.muted}}>{stats.count} rating{stats.count>1?"s":""}</span>
                            </div>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:5,marginBottom:7}}>
                              {[
                                {label:"Quality",val:stats.quality,color:stats.quality>=4?T.success:stats.quality>=3?T.caution:T.danger},
                                {label:"Difficulty",val:stats.difficulty,color:stats.difficulty>=4?T.danger:stats.difficulty>=3?T.caution:T.success},
                                {label:"Workload",val:stats.workload,color:stats.workload>=4?T.danger:stats.workload>=3?T.caution:T.success},
                                {label:"Again%",val:stats.wouldTakeAgain+"%",color:stats.wouldTakeAgain>=70?T.success:T.caution},
                              ].map(x=>(
                                <div key={x.label} style={{background:T.card,borderRadius:7,padding:"5px 3px",textAlign:"center"}}>
                                  <div style={{fontSize:14,fontWeight:700,color:x.color}}>{x.val}</div>
                                  <div style={{fontSize:9,color:T.muted,marginTop:1}}>{x.label}</div>
                                </div>
                              ))}
                            </div>
                            {stats.comments.length>0&&(
                              <div style={{borderTop:`1px solid ${T.border}`,paddingTop:6,marginBottom:6}}>
                                {stats.comments.slice(0,2).map((cm,i)=>(
                                  <div key={i} style={{fontSize:11,color:T.muted,padding:"3px 0",borderBottom:i<stats.comments.length-1?`1px solid ${T.border}`:"none",fontStyle:"italic",lineHeight:1.4}}>
                                    "{cm.text}" <span style={{fontSize:9,color:T.faint,fontStyle:"normal"}}>— {cm.date}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div style={{display:"flex",gap:5}}>
                              <button className="bp" style={{flex:1,fontSize:10,padding:"4px 7px"}} onClick={()=>{setShowRateModal({courseId:c.id,profName:c.professor,courseName:c.name});setNewRating({quality:myRating?.quality||0,difficulty:myRating?.difficulty||0,workload:myRating?.workload||0,wouldTakeAgain:myRating?.would_take_again??null,comment:myRating?.comment||""});}}>{myRating?"Update My Rating":"Rate This Professor"}</button>
                              <button className="bg2" style={{fontSize:10,padding:"4px 7px"}} onClick={()=>applyProfStats(c.id,stats,c.professor)}>Apply to Schedule</button>
                            </div>
                          </div>
                        ):(
                          c.professor&&<div style={{marginBottom:7}}>
                            <button className="bp" style={{width:"100%",fontSize:11,padding:"7px",marginBottom:5}} onClick={()=>{setShowRateModal({courseId:c.id,profName:c.professor,courseName:c.name});setNewRating({quality:0,difficulty:0,workload:0,wouldTakeAgain:null,comment:""});}}>
                              ⭐ Be the first to rate {c.professor}
                            </button>
                            <div style={{fontSize:10,color:T.faint,textAlign:"center",marginBottom:5}}>No peer ratings yet for this professor</div>
                          </div>
                        )}

                        {/* Search other professors rated by peers */}
                        {c.professor&&<div style={{marginBottom:5}}>
                          <button className="bg2" style={{width:"100%",fontSize:10,padding:"4px"}} onClick={()=>setShowSearchProf(showSearchProf===c.id?null:c.id)}>
                            🔍 Search all peer-rated professors
                          </button>
                          {showSearchProf===c.id&&(()=>{
                            const allProfs=[...new Set(profRatings.filter(r=>r.school===uni.name).map(r=>r.prof_name))].filter(Boolean);
                            const filtered=profSearch?allProfs.filter(p=>p.toLowerCase().includes(profSearch.toLowerCase())):allProfs;
                            return(
                              <div style={{marginTop:6,background:T.subcard,borderRadius:9,padding:"10px 11px",border:`1px solid ${T.border2}`}}>
                                <input className="ifield" placeholder="Search professor name..." value={profSearch} onChange={e=>setProfSearch(e.target.value)} style={{fontSize:11,padding:"5px 8px",marginBottom:8}}/>
                                {filtered.length===0&&<div style={{fontSize:11,color:T.faint}}>No professors rated yet at {uni.name}.</div>}
                                <div style={{maxHeight:180,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
                                  {filtered.map(pName=>{
                                    const ps=getProfStats(pName,uni.name);if(!ps)return null;
                                    return(
                                      <div key={pName} style={{padding:"7px 9px",background:T.card,border:`1px solid ${T.border2}`,borderRadius:7,cursor:"pointer"}}
                                        onClick={async()=>{
                                          await supabase.from("courses").update({professor:pName}).eq("id",c.id);
                                          setCourses(p=>p.map(x=>x.id===c.id?{...x,professor:pName}:x));
                                          setShowSearchProf(null);setProfSearch("");notify(`Professor set to ${pName}`);
                                        }}>
                                        <div style={{fontWeight:600,fontSize:12}}>{pName}</div>
                                        <div style={{fontSize:10,color:T.muted,marginTop:2}}>
                                          ⭐{ps.quality} Quality · 🔥{ps.difficulty} Difficulty · {ps.count} rating{ps.count>1?"s":""}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                        </div>}

                        {/* RMP direct link — always visible as fallback */}
                        <a href={`https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent((c.professor||c.name)+" "+uni.abbr)}`} target="_blank" rel="noreferrer" style={{display:"block",textAlign:"center",fontSize:10,color:T.faint,textDecoration:"none",padding:"3px 0"}}>
                          Also check RateMyProfessors.com →
                        </a>
                      </div>);
                    })()}
                    {c.syllabus_data&&(
                      <button
                        onClick={()=>setShowSyllabusViewer(c)}
                        title={`Saved syllabus: ${c.syllabus_data.filename||"file"}`}
                        style={{display:"flex",alignItems:"center",gap:6,width:"100%",padding:"6px 9px",marginBottom:7,background:`rgba(${hexToRgb(c.color)},.10)`,border:`1px solid rgba(${hexToRgb(c.color)},.35)`,borderRadius:8,fontSize:11,color:c.color,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                        <span>📄</span>
                        <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>View saved syllabus</span>
                        <span style={{fontSize:10,color:T.muted,fontWeight:400}}>open</span>
                      </button>
                    )}
                    {(()=>{
                      const cg=calcGPA(grades,courses,assignments).courseGrades.find(g=>g.courseId===c.id);
                      if(!cg)return null;
                      const lt=pctToLetterGrade(cg.pct);
                      const col=cg.pct>=90?T.success:cg.pct>=80?"#0ea5e9":cg.pct>=70?T.caution:cg.pct>=60?T.warning:T.danger;
                      return(
                        <div onClick={()=>setView("analytics")} title="View full GPA breakdown" style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",marginBottom:7,background:`rgba(${hexToRgb(col)},.08)`,border:`1px solid rgba(${hexToRgb(col)},.25)`,borderRadius:8,cursor:"pointer"}}>
                          <span style={{fontSize:10,color:T.muted,letterSpacing:1,textTransform:"uppercase",fontWeight:600,flex:1}}>Current Grade {cg.weighted?"(weighted)":""}</span>
                          <span style={{fontSize:18,fontWeight:800,color:col,lineHeight:1}}>{lt}</span>
                          <span style={{fontSize:13,fontWeight:600,color:col}}>{cg.pct.toFixed(1)}%</span>
                        </div>
                      );
                    })()}
                    <div className="prog-bar" style={{marginBottom:5}}><div className="prog-fill" style={{width:`${pct}%`,background:c.color}}/></div>
                    <div style={{fontSize:10,color:T.muted,marginBottom:next?7:0}}>{done}/{total} complete · {"★".repeat(c.difficulty)}{"☆".repeat(5-c.difficulty)}</div>
                    {next&&(()=>{const d=daysUntil(next.due);return(<div onClick={()=>setEditAssign({...next})} style={{fontSize:11,padding:"5px 8px",background:T.subcard,borderRadius:6,cursor:"pointer",transition:"background .2s"}}>Next: <span style={{color:c.color,fontWeight:600,textDecoration:"underline",textDecorationStyle:"dotted",textUnderlineOffset:2}}>{next.title}</span> · {d<0?<span style={{color:T.danger}}>{Math.abs(d)}d overdue</span>:`${d}d`}</div>);})()}
                  </div>);
                })}
              </div>
            </div>
          )}

          {/* ── MY SCHEDULE ── */}
          {view==="schedule"&&(
            <div className="fi">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:13}}>
                <div><div style={{fontSize:10,letterSpacing:3,color:T.accent,textTransform:"uppercase"}}>Time Blocks</div><h1 style={{fontSize:22,fontWeight:700,whiteSpace:"nowrap"}}>My Schedule</h1></div>
                <button className="bp" onClick={()=>setShowAddBlock(true)}>+ Add Block</button>
              </div>
              <div style={{fontSize:12,color:T.muted,marginBottom:12,padding:"10px 14px",background:T.subcard,borderRadius:9,border:`1px solid ${T.border2}`}}>
                These blocks tell ProPlan Scholar when you are <strong>NOT</strong> available to study — practices, games, chapter meetings, work, etc. Study sessions are automatically placed around them.
              </div>

              {/* Work schedule — only shown for working professionals */}
              {profile.is_working_professional&&(
                <div className="card" style={{marginBottom:12}}>
                  <div style={{fontWeight:700,marginBottom:4}}>💼 Work Schedule</div>
                  <div style={{fontSize:12,color:T.muted,marginBottom:10}}>Toggle each day independently and set your exact work hours.</div>
                  {/* Work schedule — vertical row layout, works on any screen size */}
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {DAYS_SHORT.map(day=>{const s=workSched[day];return(
                      <div key={day} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:T.subcard,borderRadius:10,border:`1px solid ${s.work?T.accent:T.border2}`,transition:"border-color .2s"}}>
                        {/* Day name */}
                        <div style={{width:34,flexShrink:0}}>
                          <span style={{fontSize:13,fontWeight:700,color:s.work?T.accent:T.faint}}>{day}</span>
                        </div>
                        {/* Toggle */}
                        <button onClick={()=>setWorkSched(p=>({...p,[day]:{...p[day],work:!p[day].work}}))} style={{width:36,height:20,borderRadius:20,background:s.work?T.accent:T.border2,border:"none",position:"relative",cursor:"pointer",transition:"background .2s",flexShrink:0}}>
                          <div style={{position:"absolute",top:2,left:s.work?17:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
                        </button>
                        {/* Times or Free label */}
                        {s.work?(
                          <div style={{display:"flex",alignItems:"center",gap:6,flex:1,minWidth:0}}>
                            <select value={s.start} onChange={e=>setWorkSched(p=>({...p,[day]:{...p[day],start:e.target.value}}))} style={{flex:1,fontSize:12,padding:"5px 4px",background:T.subcard,border:`1px solid ${T.border2}`,borderRadius:7,color:T.text,minWidth:0,fontFamily:"inherit"}}>
                              {["00:00","01:00","02:00","03:00","04:00","05:00","06:00","07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00","22:00","23:00"].map(t=>{
                                const[h]=t.split(":").map(Number);
                                const label=h===0?"12 AM":h===12?"12 PM":h>12?`${h-12} PM`:`${h} AM`;
                                return <option key={t} value={t}>{label}</option>;
                              })}
                            </select>
                            <span style={{fontSize:11,color:T.faint,flexShrink:0}}>–</span>
                            <select value={s.end} onChange={e=>setWorkSched(p=>({...p,[day]:{...p[day],end:e.target.value}}))} style={{flex:1,fontSize:12,padding:"5px 4px",background:T.subcard,border:`1px solid ${T.border2}`,borderRadius:7,color:T.text,minWidth:0,fontFamily:"inherit"}}>
                              {["01:00","02:00","03:00","04:00","05:00","06:00","07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00","22:00","23:00","00:00"].map(t=>{
                                const[h]=t.split(":").map(Number);
                                const label=h===0?"12 AM (midnight)":h===12?"12 PM":h>12?`${h-12} PM`:`${h} AM`;
                                return <option key={t} value={t}>{label}</option>;
                              })}
                            </select>
                          </div>
                        ):(
                          <span style={{fontSize:12,color:T.faint,flex:1}}>Day off</span>
                        )}
                      </div>
                    );})}
                  </div>
                  <button className="bp" style={{marginTop:11,fontSize:12}} onClick={async()=>{
                    generateStudyBlocks();
                    const uid = authUser?.id;
                    if(!uid){notify("Error: not logged in");return;}
                    const{error}=await supabase.from("profiles").update({work_schedule:workSched}).eq("id",uid);
                    if(error){notify(`Save error: ${error.message}`);console.error("work_schedule save error:",error);}
                    else{notify("Work schedule saved — study blocks recalculated!");}
                  }}>Save & Recalculate</button>
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
                          <div style={{fontSize:10,color:T.muted}}>{b.date_specific?`Date: ${b.date_specific}`:`Every ${b.day_of_week}`} · {to12h(b.start_time)}–{to12h(b.end_time)}</div>
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

          {/* ── MAJOR PROJECT ── */}
          {view==="major-project"&&(
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
                {milestones.length===0&&<div style={{color:T.faint,fontSize:13,textAlign:"center",padding:20}}>No milestones yet. Click + Milestone to track your {["doctoral","postdoc"].includes(profile?.degree_level)?"doctoral":"project"} timeline.</div>}
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
                  <div style={{fontSize:12,color:T.muted,marginBottom:10}}>Reflecting weekly improves academic outcomes. What did you accomplish? What is blocking you? What will you focus on next week?</div>
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
          {view==="analytics"&&(
            <div className="fi">
              <div style={{marginBottom:16}}>
                <div style={{fontSize:10,letterSpacing:3,color:T.accent,textTransform:"uppercase"}}>Insights</div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <h1 style={{fontSize:22,fontWeight:700}}>Analytics</h1>
                  {!isPro&&<span style={{fontSize:9,background:`rgba(${rgb},.15)`,color:T.accent,padding:"2px 8px",borderRadius:8,fontWeight:700,letterSpacing:.5}}>PRO</span>}
                </div>
              </div>
              {!isPro&&(
                <div style={{marginBottom:14,padding:"14px 16px",background:dark?"rgba(199,91,18,.08)":"rgba(199,91,18,.05)",border:`1px solid rgba(${rgb},.25)`,borderRadius:12}}>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>📊 Analytics is a Pro feature</div>
                  <div style={{fontSize:12,color:T.muted,marginBottom:12,lineHeight:1.6}}>Upgrade to Pro for full analytics including workload forecast, grade risk assessment, study consistency score, and energy trends.</div>
                  <button className="bp" style={{fontSize:12,padding:"8px 20px"}} onClick={()=>notify("Stripe payments coming soon! Upgrade for $5/month.")}>Upgrade to Pro — $5/mo</button>
                </div>
              )}

              {/* ── Semester Overview ── */}
              <div className="card" style={{marginBottom:12}}>
                <div style={{fontSize:10,letterSpacing:2,color:T.accent,textTransform:"uppercase",marginBottom:12}}>Semester Overview</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16}}>
                  {[
                    {label:"Completion Rate",value:`${assignments.length>0?Math.round(assignments.filter(a=>a.done).length/assignments.length*100):0}%`,color:T.success,icon:"✓"},
                    {label:"On Time",value:`${assignments.filter(a=>a.done).length>0?Math.round(assignments.filter(a=>a.done&&daysUntil(a.due)>=0).length/Math.max(assignments.filter(a=>a.done).length,1)*100):0}%`,color:"#0ea5e9",icon:"⏱"},
                    {label:"Overdue",value:assignments.filter(a=>!a.done&&daysUntil(a.due)<0).length,color:T.danger,icon:"⚠"},
                    {label:"Study Hrs Done",value:`${Object.keys(completedStudy).filter(k=>completedStudy[k]).length*2}h`,color:"#a78bfa",icon:"📚"},
                  ].map(s=>(
                    <div key={s.label} style={{padding:"12px 10px",background:T.subcard,borderRadius:12,border:`1px solid ${T.border2}`,textAlign:"center"}}>
                      <div style={{fontSize:22,fontWeight:700,color:s.color}}>{s.value}</div>
                      <div style={{fontSize:10,color:T.faint,marginTop:3,lineHeight:1.3}}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Progress bar per course */}
                <div style={{fontSize:11,fontWeight:600,marginBottom:8,color:T.muted,letterSpacing:.5,textTransform:"uppercase"}}>By Course</div>
                {courses.map(c=>{
                  const ca=assignments.filter(a=>a.courseId===c.id);
                  const done=ca.filter(a=>a.done).length;
                  const total=ca.length;
                  const pct=total>0?Math.round(done/total*100):0;
                  const overdue=ca.filter(a=>!a.done&&daysUntil(a.due)<0).length;
                  return(
                    <div key={c.id} style={{marginBottom:10}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:c.color,flexShrink:0}}/>
                          <span style={{fontSize:12,fontWeight:600}}>{c.name}</span>
                          {overdue>0&&<span style={{fontSize:9,background:"rgba(239,68,68,.15)",color:T.danger,padding:"1px 5px",borderRadius:6,fontWeight:700}}>{overdue} overdue</span>}
                        </div>
                        <span style={{fontSize:12,color:T.muted}}>{done}/{total} done</span>
                      </div>
                      <div className="prog-bar" style={{height:6}}>
                        <div className="prog-fill" style={{width:`${pct}%`,background:c.color}}/>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Study Consistency ── */}
              <div className="card" style={{marginBottom:12}}>
                <div style={{fontSize:10,letterSpacing:2,color:T.accent,textTransform:"uppercase",marginBottom:12}}>Study Consistency</div>
                {(()=>{
                  const total=studyBlocks.length;
                  const completed=studyBlocks.filter(b=>completedStudy[b.id]).length;
                  const missed=studyBlocks.filter(b=>!completedStudy[b.id]&&daysUntil(b.date)<0).length;
                  const upcoming=studyBlocks.filter(b=>daysUntil(b.date)>=0).length;
                  const rate=total>0?Math.round(completed/(completed+missed||1)*100):0;
                  return(
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
                        <div style={{position:"relative",width:72,height:72,flexShrink:0}}>
                          <svg width="72" height="72" viewBox="0 0 72 72">
                            <circle cx="36" cy="36" r="28" fill="none" stroke={T.border2} strokeWidth="8"/>
                            <circle cx="36" cy="36" r="28" fill="none" stroke={rate>=70?"#22c55e":rate>=40?"#eab308":"#ef4444"} strokeWidth="8"
                              strokeDasharray={`${rate*1.759} 175.9`} strokeDashoffset="43.98" strokeLinecap="round"/>
                          </svg>
                          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:rate>=70?T.success:rate>=40?T.caution:T.danger}}>{rate}%</div>
                        </div>
                        <div>
                          <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>{rate>=70?"Great consistency! 🎉":rate>=40?"Room to improve 📈":"Needs attention ⚠️"}</div>
                          <div style={{fontSize:12,color:T.muted}}>You've completed {completed} of {completed+missed} past study sessions</div>
                        </div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                        {[{label:"Completed",value:completed,color:T.success},{label:"Missed",value:missed,color:T.danger},{label:"Upcoming",value:upcoming,color:"#0ea5e9"}].map(s=>(
                          <div key={s.label} style={{padding:"8px",background:T.subcard,borderRadius:9,border:`1px solid ${T.border2}`,textAlign:"center"}}>
                            <div style={{fontSize:20,fontWeight:700,color:s.color}}>{s.value}</div>
                            <div style={{fontSize:10,color:T.faint}}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* ── Workload Forecast ── */}
              <div className="card" style={{marginBottom:12}}>
                <div style={{fontSize:10,letterSpacing:2,color:T.accent,textTransform:"uppercase",marginBottom:12}}>Workload Forecast — Next 4 Weeks</div>
                {(()=>{
                  const weeks=Array.from({length:4},(_,i)=>{
                    const start=new Date();start.setHours(0,0,0,0);
                    start.setDate(start.getDate()+i*7);
                    const end=new Date(start);end.setDate(end.getDate()+6);
                    const startStr=start.toISOString().slice(0,10);
                    const endStr=end.toISOString().slice(0,10);
                    const weekDeadlines=assignments.filter(a=>!a.done&&a.due>=startStr&&a.due<=endStr);
                    const weekStudy=studyBlocks.filter(b=>b.date>=startStr&&b.date<=endStr).length*2;
                    const label=i===0?"This week":i===1?"Next week":`Week ${i+1}`;
                    return{label,deadlines:weekDeadlines,studyHrs:weekStudy,start:startStr};
                  });
                  const maxStudy=Math.max(...weeks.map(w=>w.studyHrs),1);
                  return weeks.map((w,i)=>(
                    <div key={i} style={{marginBottom:12,padding:"10px 12px",background:T.subcard,borderRadius:10,border:`1px solid ${w.deadlines.length>=3?T.danger:w.deadlines.length>=2?T.caution:T.border2}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <span style={{fontSize:12,fontWeight:700}}>{w.label}</span>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          {w.deadlines.length>0&&<span style={{fontSize:10,color:w.deadlines.length>=3?T.danger:T.caution,fontWeight:600}}>📌 {w.deadlines.length} deadline{w.deadlines.length>1?"s":""}</span>}
                          <span style={{fontSize:10,color:"#0ea5e9"}}>📚 {w.studyHrs}h</span>
                        </div>
                      </div>
                      <div style={{height:6,background:T.border,borderRadius:3,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${(w.studyHrs/maxStudy)*100}%`,background:w.deadlines.length>=3?"#ef4444":w.deadlines.length>=2?"#eab308":"#0ea5e9",borderRadius:3,transition:"width .4s ease"}}/>
                      </div>
                      {w.deadlines.length>0&&<div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:4}}>
                        {w.deadlines.slice(0,3).map(a=><span key={a.id} style={{fontSize:9,padding:"1px 6px",background:`rgba(${hexToRgb(courses.find(c=>c.id===a.courseId)?.color||T.accent)},.2)`,color:courses.find(c=>c.id===a.courseId)?.color||T.accent,borderRadius:6}}>{a.title.length>18?a.title.slice(0,18)+"…":a.title}</span>)}
                        {w.deadlines.length>3&&<span style={{fontSize:9,color:T.faint}}>+{w.deadlines.length-3} more</span>}
                      </div>}
                    </div>
                  ));
                })()}
              </div>

              {/* ── Grade Risk Indicator ── */}
              <div className="card" style={{marginBottom:12}}>
                <div style={{fontSize:10,letterSpacing:2,color:T.accent,textTransform:"uppercase",marginBottom:12}}>Course Risk Assessment</div>
                <div style={{fontSize:11,color:T.muted,marginBottom:12,lineHeight:1.6}}>Based on overdue assignments, upcoming deadlines, and study session completion rate per course.</div>
                {courses.map(c=>{
                  const ca=assignments.filter(a=>a.courseId===c.id&&!a.done);
                  const overdueCount=ca.filter(a=>daysUntil(a.due)<0).length;
                  const urgentCount=ca.filter(a=>daysUntil(a.due)>=0&&daysUntil(a.due)<=3).length;
                  const courseStudy=studyBlocks.filter(b=>b.courseId===c.id);
                  const completedPct=courseStudy.length>0?courseStudy.filter(b=>completedStudy[b.id]).length/courseStudy.length:1;
                  // Risk score 0-100
                  let risk=0;
                  if(overdueCount>0)risk+=overdueCount*25;
                  if(urgentCount>0)risk+=urgentCount*15;
                  if(completedPct<0.5)risk+=20;
                  risk=Math.min(risk,100);
                  const riskLabel=risk>=60?"High Risk":risk>=30?"Moderate":"On Track";
                  const riskColor=risk>=60?T.danger:risk>=30?T.caution:T.success;
                  return(
                    <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
                      <div style={{width:8,height:36,borderRadius:2,background:riskColor,flexShrink:0}}/>
                      <div style={{flex:1}}>
                        <div style={{fontSize:12,fontWeight:600}}>{c.name}</div>
                        <div style={{fontSize:10,color:T.muted}}>
                          {overdueCount>0&&<span style={{color:T.danger,marginRight:8}}>⚠ {overdueCount} overdue</span>}
                          {urgentCount>0&&<span style={{color:T.caution,marginRight:8}}>⏰ {urgentCount} due soon</span>}
                          {overdueCount===0&&urgentCount===0&&<span style={{color:T.success}}>✓ No urgent items</span>}
                        </div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontSize:11,fontWeight:700,color:riskColor}}>{riskLabel}</div>
                        <div style={{fontSize:9,color:T.faint}}>{100-risk}% healthy</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Energy Trends ── */}
              {energyLog.length>0&&(
                <div className="card" style={{marginBottom:12}}>
                  <div style={{fontSize:10,letterSpacing:2,color:T.accent,textTransform:"uppercase",marginBottom:12}}>Energy Trends — Last 14 Days</div>
                  <div style={{display:"flex",gap:4,alignItems:"flex-end",height:60}}>
                    {energyLog.slice(-14).map((e,i)=>{
                      const cols=["#ef4444","#f97316","#eab308","#84cc16","#22c55e"];
                      const h=(e.level/5)*100;
                      return(
                        <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                          <div style={{width:"100%",height:`${h}%`,minHeight:4,background:cols[e.level-1]||T.accent,borderRadius:"3px 3px 0 0",transition:"height .3s"}}/>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                    <span style={{fontSize:9,color:T.faint}}>14 days ago</span>
                    <span style={{fontSize:9,color:T.faint}}>Today</span>
                  </div>
                  <div style={{fontSize:11,color:T.muted,marginTop:8,textAlign:"center"}}>
                    Avg energy: {Math.round(energyLog.slice(-14).reduce((s,e)=>s+e.level,0)/Math.min(energyLog.length,14)*10)/10}/5
                  </div>
                </div>
              )}

              {/* ── GPA Tracker ── */}
              <div className="card" style={{marginTop:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{fontSize:10,letterSpacing:2,color:T.accent,textTransform:"uppercase"}}>GPA Tracker</div>
                </div>
                {grades.length===0?<div style={{color:T.faint,fontSize:12,textAlign:"center",padding:16}}>No grades logged yet. Use the 📊 button on any assignment to log a grade.</div>:(()=>{
                  const{courseGrades,overall}=calcGPA(grades,courses,assignments);
                  return(<div>
                    <div style={{textAlign:"center",marginBottom:14}}>
                      <div style={{fontSize:36,fontWeight:800,color:overall>=3.5?T.success:overall>=2.5?T.warning:T.danger}}>{overall.toFixed(2)}</div>
                      <div style={{fontSize:11,color:T.muted}}>Current GPA</div>
                    </div>
                    {courseGrades.map(cg=>{const course=courses.find(c=>c.id===cg.courseId);return course?(<div key={cg.courseId} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
                      <div style={{width:4,height:28,borderRadius:2,background:course.color,flexShrink:0}}/>
                      <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600}}>{course.name}</div><div style={{fontSize:10,color:T.muted}}>{cg.pct.toFixed(1)}% · {cg.gpa.toFixed(1)} GPA</div></div>
                      <div style={{fontSize:14,fontWeight:700,color:cg.gpa>=3.5?T.success:cg.gpa>=2.5?T.warning:T.danger}}>{cg.gpa.toFixed(1)}</div>
                    </div>):null;})}
                    {/* What-if calculator */}
                    <div style={{marginTop:14,padding:"12px",background:T.subcard,borderRadius:10,border:`1px solid ${T.border2}`}}>
                      <div style={{fontSize:11,fontWeight:700,color:T.accent,marginBottom:8}}>🎯 What-If Calculator</div>
                      <div style={{fontSize:11,color:T.muted,marginBottom:8}}>What do I need on remaining assignments to hit my target GPA?</div>
                      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                        <div style={{fontSize:11,color:T.muted}}>Target GPA:</div>
                        <input type="number" className="ifield" step="0.1" min="0" max="4.0" value={gpaTarget||""} onChange={e=>setGpaTarget(+e.target.value)} placeholder="3.5" style={{width:70,fontSize:13,textAlign:"center"}}/>
                      </div>
                      {gpaTarget&&courseGrades.map(cg=>{
                        const course=courses.find(c=>c.id===cg.courseId);
                        if(!course)return null;
                        const courseAssigns=assignments.filter(a=>a.courseId===cg.courseId);
                        const gradedAssigns=grades.filter(g=>g.courseId===cg.courseId);
                        const ungradedCount=courseAssigns.length-gradedAssigns.length;
                        if(ungradedCount<=0)return(<div key={cg.courseId} style={{fontSize:11,color:T.muted,padding:"4px 0"}}>{course.name}: All graded — {cg.gpa>=gpaTarget?"✅ on track":"⚠️ below target"}</div>);
                        // Calculate needed percentage: reverse the GPA scale
                        const targetPcts={4.0:93,3.7:90,3.3:87,3.0:83,2.7:80,2.3:77,2.0:73,1.7:70,1.3:67,1.0:63,0.7:60,0.0:0};
                        const neededOverallPct=Object.entries(targetPcts).sort((a,b)=>+b[0]-+a[0]).find(([g])=>+g<=gpaTarget)?.[1]||93;
                        const totalAssigns=courseAssigns.length;
                        const currentTotal=gradedAssigns.reduce((s,g)=>s+g.score,0);
                        const currentMax=gradedAssigns.reduce((s,g)=>s+g.maxScore,0);
                        const neededTotal=(neededOverallPct/100)*(currentMax+(ungradedCount*100))-currentTotal;
                        const neededPct=Math.max(0,Math.min(100,Math.round(neededTotal/(ungradedCount*100)*100)));
                        return(<div key={cg.courseId} style={{fontSize:11,padding:"4px 0",borderBottom:`1px solid ${T.border}`}}>
                          <span style={{color:course.color,fontWeight:600}}>{course.name}:</span> Need ~<span style={{fontWeight:700,color:neededPct>95?T.danger:neededPct>85?T.warning:T.success}}>{neededPct}%</span> avg on {ungradedCount} remaining assignment{ungradedCount>1?"s":""}
                        </div>);
                      })}
                    </div>
                  </div>);
                })()}
              </div>

              {/* ── Study Streak ── */}
              <div className="card" style={{marginTop:12}}>
                <div style={{fontSize:10,letterSpacing:2,color:T.accent,textTransform:"uppercase",marginBottom:10}}>Study Streak</div>
                <div style={{display:"flex",gap:16,justifyContent:"center",marginBottom:14}}>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:36,fontWeight:800,color:studyStreak>=7?"#22c55e":studyStreak>=3?"#f97316":"#ef4444"}}>{studyStreak}</div>
                    <div style={{fontSize:11,color:T.muted}}>Current Streak (days)</div>
                  </div>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:36,fontWeight:800,color:T.accent}}>{longestStreak}</div>
                    <div style={{fontSize:11,color:T.muted}}>Longest Streak</div>
                  </div>
                </div>
                {/* Last 14 days activity grid */}
                <div style={{fontSize:10,color:T.muted,marginBottom:6}}>Last 14 days</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {Array.from({length:14}).map((_,i)=>{
                    const d=new Date();d.setDate(d.getDate()-(13-i));
                    const ds=dateKey(d.getFullYear(),d.getMonth(),d.getDate());
                    const hasStudy=studyBlocks.some(b=>completedStudy[b.id]&&b.date===ds);
                    const hasEnergy=energyLog.some(e=>e.date===ds);
                    const active=hasStudy||hasEnergy;
                    const isToday=ds===dateKey(t.year,t.month,t.day);
                    return(<div key={i} title={`${MONTHS[d.getMonth()]} ${d.getDate()}`} style={{width:24,height:24,borderRadius:6,background:active?`rgba(${hexToRgb(T.success)},.${hasStudy?"3":"15"})`:T.subcard,border:`1px solid ${isToday?T.accent:active?T.success:T.border2}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:active?T.success:T.faint}}>{active?"✓":d.getDate()}</div>);
                  })}
                </div>
                <div style={{fontSize:11,color:T.muted,marginTop:10,textAlign:"center"}}>
                  {studyStreak>=7?"Amazing consistency! Keep it up! 🏆":studyStreak>=3?"Nice streak building! Don't break the chain! 💪":studyStreak>=1?"Good start! Come back tomorrow to grow your streak! 🌱":"Complete a study session or log your energy to start a streak!"}
                </div>
              </div>

            </div>
          )}

          {view==="settings"&&(
            <div className="fi">
              <div style={{marginBottom:13}}><div style={{fontSize:10,letterSpacing:3,color:T.accent,textTransform:"uppercase"}}>Preferences</div><h1 style={{fontSize:22,fontWeight:700}}>Settings</h1></div>
              {/* AI Disclaimer */}
              <div style={{marginBottom:14,padding:"12px 16px",borderRadius:12,border:`1px solid rgba(245,158,11,.35)`,background:dark?"rgba(245,158,11,.06)":"rgba(245,158,11,.05)",display:"flex",gap:10,alignItems:"flex-start"}}>
                <span style={{fontSize:18,flexShrink:0}}>⚠️</span>
                <div>
                  <div style={{fontWeight:600,fontSize:12,color:T.caution,marginBottom:4}}>AI Disclaimer</div>
                  <div style={{fontSize:11,color:T.muted,lineHeight:1.7}}>Study schedules, extracted syllabus content, flashcards, and AI advice are planning tools only — not guarantees of accuracy or academic outcomes. Always verify important dates with your official course materials. Using ProPlan Scholar does not guarantee any particular grade or result.</div>
                  <div style={{marginTop:6,display:"flex",gap:14}}>
                    <a href="/privacy" target="_blank" rel="noreferrer" style={{fontSize:11,color:T.accent}}>Privacy Policy →</a>
                    <a href="/terms" target="_blank" rel="noreferrer" style={{fontSize:11,color:T.accent}}>Terms of Service →</a>
                  </div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div className="card">
                  <div style={{fontWeight:700,marginBottom:10}}>Your Profile</div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Name</div><input className="ifield" value={profile.full_name||""} onChange={e=>setProfile(p=>({...p,full_name:e.target.value}))} style={{fontSize:12}}/></div>
                    {[["Degree",DEGREE_LEVELS.find(d=>d.id===profile.degree_level)?.label||"—"],["University",profile.university==="custom"&&profile.university_name?profile.university_name:uni.name]].map(([k,v])=>(
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
                  <div style={{fontWeight:700,marginBottom:10}}>📅 Calendar Sync</div>
                  <div style={{fontSize:12,color:T.muted,marginBottom:12,lineHeight:1.7}}>Subscribe to your ProPlan Scholar calendar once — classes, study sessions, due dates, and milestones appear in Outlook, Google, or Apple Calendar and <strong style={{color:T.text}}>update automatically</strong> whenever your schedule changes.</div>
                  {/* What syncs */}
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
                    {[["🎓","Classes"],["📌","Due Dates"],["📚","Study Blocks"],["⬟","Milestones"],["✈️","Blackouts"]].map(([icon,label])=>(
                      <span key={label} style={{fontSize:11,padding:"3px 9px",background:T.subcard,border:`1px solid ${T.border2}`,borderRadius:100,color:T.muted,display:"flex",alignItems:"center",gap:4}}>{icon} {label}</span>
                    ))}
                  </div>
                  {/* Subscribe URL — the primary flow */}
                  {!calToken?(
                    <button className="bp" style={{width:"100%",fontSize:13,marginBottom:12,padding:"12px"}} onClick={generateCalToken}>
                      🔗 Generate My Calendar Link
                    </button>
                  ):(
                    <>
                      <div style={{fontSize:11,color:T.muted,marginBottom:5,fontWeight:600}}>Your private calendar link</div>
                      <div style={{display:"flex",gap:6,marginBottom:10}}>
                        <input readOnly value={`https://proplanscholar.com/api/calendar/${calToken}`} onClick={e=>e.target.select()} className="ifield" style={{flex:1,fontSize:11,fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace"}}/>
                        <button className="bp" style={{fontSize:12,padding:"10px 14px",flexShrink:0}} onClick={copyCalUrl}>{calCopied?"✓ Copied":"Copy"}</button>
                      </div>
                      <div style={{fontSize:10,color:T.faint,marginBottom:12}}>🔒 Private to you. Anyone with this link can view your schedule — keep it to yourself.</div>
                    </>
                  )}
                  {calToken&&(
                    <>
                      {/* Per-platform subscribe instructions */}
                      <div style={{padding:"10px 12px",background:T.subcard,borderRadius:9,border:`1px solid ${T.border2}`,marginBottom:8}}>
                        <div style={{fontSize:12,fontWeight:600,marginBottom:6}}>🔵 Outlook (web or desktop)</div>
                        <div style={{fontSize:11,color:T.muted,lineHeight:1.8}}>
                          1. Copy the link above<br/>
                          2. Open Outlook → <strong style={{color:T.text}}>Calendar</strong> → <strong style={{color:T.text}}>Add calendar</strong> → <strong style={{color:T.text}}>Subscribe from web</strong><br/>
                          3. Paste the link, give it a name (e.g. "ProPlan Scholar"), click <strong style={{color:T.text}}>Import</strong><br/>
                          4. Outlook refreshes the calendar on its own — no more re-downloading
                        </div>
                      </div>
                      <div style={{padding:"10px 12px",background:T.subcard,borderRadius:9,border:`1px solid ${T.border2}`,marginBottom:8}}>
                        <div style={{fontSize:12,fontWeight:600,marginBottom:6}}>🟢 Google Calendar</div>
                        <div style={{fontSize:11,color:T.muted,lineHeight:1.8}}>
                          1. Copy the link above<br/>
                          2. Open <strong style={{color:T.text}}>calendar.google.com</strong> on a computer<br/>
                          3. Left sidebar → <strong style={{color:T.text}}>Other calendars</strong> → <strong style={{color:T.text}}>+</strong> → <strong style={{color:T.text}}>From URL</strong><br/>
                          4. Paste the link → <strong style={{color:T.text}}>Add calendar</strong>. It will also appear on your phone's Google Calendar app.
                        </div>
                      </div>
                      <div style={{padding:"10px 12px",background:T.subcard,borderRadius:9,border:`1px solid ${T.border2}`,marginBottom:8}}>
                        <div style={{fontSize:12,fontWeight:600,marginBottom:6}}>🍎 iPhone / Mac Calendar</div>
                        <div style={{fontSize:11,color:T.muted,lineHeight:1.8}}>
                          <strong style={{color:T.text}}>One-tap on iPhone:</strong>{" "}
                          <a href={`webcal://proplanscholar.com/api/calendar/${calToken}`} style={{color:T.accent,fontWeight:600,textDecoration:"underline"}}>Tap here to subscribe</a> → tap <strong style={{color:T.text}}>Subscribe</strong> → <strong style={{color:T.text}}>Add</strong><br/>
                          <strong style={{color:T.text}}>On Mac:</strong> Calendar app → <strong style={{color:T.text}}>File</strong> → <strong style={{color:T.text}}>New Calendar Subscription</strong> → paste link → <strong style={{color:T.text}}>Subscribe</strong>
                        </div>
                      </div>
                      <div style={{padding:"8px 12px",background:`rgba(${rgb},.06)`,borderRadius:8,border:`1px solid rgba(${rgb},.15)`,marginBottom:10}}>
                        <div style={{fontSize:11,color:T.muted}}>💡 <strong style={{color:T.text}}>Good to know:</strong> Most calendar apps refresh subscribed calendars every few hours. If you want to force a refresh, pull-to-refresh (iPhone) or reload the calendar app.</div>
                      </div>
                    </>
                  )}
                  {/* Secondary fallback — one-time download */}
                  <details style={{marginTop:4}}>
                    <summary style={{fontSize:11,color:T.faint,cursor:"pointer",userSelect:"none"}}>Prefer a one-time download instead?</summary>
                    <div style={{padding:"8px 0 2px 0"}}>
                      <div style={{fontSize:11,color:T.muted,lineHeight:1.6,marginBottom:8}}>Downloads a .ics file you import manually. It won't auto-update — you'd need to re-download after schedule changes.</div>
                      <button className="bp" style={{width:"100%",fontSize:12,padding:"9px"}} onClick={downloadICS}>
                        ⬇️ Download Calendar File (.ics)
                      </button>
                    </div>
                  </details>
                </div>

                <div className="card">
                  <div style={{fontWeight:700,marginBottom:12}}>Integrations</div>

                  {/* Tab selector */}
                  <div style={{display:"flex",gap:4,marginBottom:14,flexWrap:"wrap"}}>
                    {[["outlook","📅 Outlook"],["sms","📱 SMS"],["canvas","📚 Canvas"],["email","📧 Email"],["push","🔔 Push"]].map(([id,label])=>(
                      <button key={id} onClick={()=>setIntegrationTab(id)} style={{padding:"5px 10px",borderRadius:8,border:`1px solid ${integrationTab===id?T.accent:T.border2}`,background:integrationTab===id?`rgba(${rgb},.1)`:"transparent",color:integrationTab===id?T.accent:T.muted,fontSize:11,fontWeight:integrationTab===id?700:400,fontFamily:"inherit",cursor:"pointer"}}>{label}</button>
                    ))}
                  </div>

                  {/* OUTLOOK */}
                  {integrationTab==="outlook"&&(
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                        <span style={{fontSize:20}}>📅</span>
                        <div>
                          <div style={{fontWeight:600,fontSize:13}}>Outlook Calendar</div>
                          <div style={{fontSize:11,color:T.success,fontWeight:600}}>✓ Available now</div>
                        </div>
                      </div>
                      <div style={{fontSize:12,color:T.muted,lineHeight:1.7,marginBottom:12}}>Subscribe your Outlook Calendar to your ProPlan Scholar schedule once — classes, study sessions, and deadlines then update automatically in the background.</div>
                      <div style={{padding:"10px 12px",background:T.subcard,borderRadius:9,border:`1px solid ${T.border2}`,marginBottom:10}}>
                        <div style={{fontSize:12,fontWeight:600,marginBottom:6}}>How to subscribe in Outlook:</div>
                        <div style={{fontSize:11,color:T.muted,lineHeight:1.8}}>
                          1. Scroll up to <strong style={{color:T.text}}>Calendar Sync</strong> and tap <strong style={{color:T.text}}>Copy</strong> next to your calendar link<br/>
                          2. Open <strong style={{color:T.text}}>Outlook</strong> (web or desktop) and go to <strong style={{color:T.text}}>Calendar</strong><br/>
                          3. Click <strong style={{color:T.text}}>Add calendar</strong> → <strong style={{color:T.text}}>Subscribe from web</strong><br/>
                          4. Paste the link, name it "ProPlan Scholar", and click <strong style={{color:T.text}}>Import</strong><br/>
                          5. Your classes and study sessions appear — and stay current on their own
                        </div>
                      </div>
                      <div style={{padding:"8px 12px",background:`rgba(${rgb},.06)`,borderRadius:8,border:`1px solid rgba(${rgb},.15)`}}>
                        <div style={{fontSize:11,color:T.muted}}>💡 <strong style={{color:T.text}}>No more weekly re-downloads:</strong> Outlook checks the link periodically on its own. When you add or change something in ProPlan Scholar, it shows up in your Outlook calendar automatically within a few hours.</div>
                      </div>
                    </div>
                  )}

                  {/* SMS */}
                  {integrationTab==="sms"&&(
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                        <span style={{fontSize:20}}>📱</span>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:600,fontSize:13}}>SMS Deadline Reminders</div>
                          <div style={{fontSize:11,color:T.success,fontWeight:600}}>✓ Available now</div>
                        </div>
                      </div>
                      <div style={{fontSize:12,color:T.muted,lineHeight:1.7,marginBottom:12}}>Get text message reminders when assignments are coming up. Texts are sent every morning at 8 AM CT.</div>
                      <div style={{marginBottom:12}}>
                        <div style={{fontSize:11,color:T.muted,marginBottom:5}}>Your mobile number</div>
                        <div style={{display:"flex",gap:8}}>
                          <input className="ifield" value={userPhone} onChange={e=>setUserPhone(e.target.value)} placeholder="+1 (555) 000-0000" style={{flex:1,fontSize:13}}/>
                          <button className="bp" style={{fontSize:12,padding:"10px 14px",flexShrink:0}} onClick={savePhone}>Save</button>
                        </div>
                        {userPhone&&<div style={{fontSize:10,color:T.success,marginTop:5}}>✓ Number saved — you'll receive reminders at this number</div>}
                      </div>
                      <div style={{padding:"10px 12px",background:T.subcard,borderRadius:9,border:`1px solid ${T.border2}`}}>
                        <div style={{fontSize:11,fontWeight:600,marginBottom:6}}>You'll receive texts:</div>
                        {[["3 days before","📚 Heads up reminder"],["1 day before","⚠️ Due tomorrow alert"],["Day of","🚨 Due today alert"]].map(([t,d])=>(
                          <div key={t} style={{display:"flex",gap:8,padding:"5px 0",borderBottom:`1px solid ${T.border}`,alignItems:"center"}}>
                            <span style={{fontSize:10,fontWeight:700,color:T.accent,minWidth:90,flexShrink:0}}>{t}</span>
                            <span style={{fontSize:11,color:T.muted}}>{d}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{marginTop:10,padding:"8px 12px",background:`rgba(${rgb},.06)`,borderRadius:8,border:`1px solid rgba(${rgb},.15)`}}>
                        <div style={{fontSize:11,color:T.muted}}>💡 To stop receiving texts, clear your phone number and tap Save.</div>
                      </div>
                    </div>
                  )}

                  {/* CANVAS */}
                  {integrationTab==="canvas"&&(
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                        <span style={{fontSize:20}}>📚</span>
                        <div>
                          <div style={{fontWeight:600,fontSize:13}}>Canvas LMS</div>
                          <span style={{fontSize:9,background:`rgba(${rgb},.15)`,color:T.accent,padding:"1px 6px",borderRadius:8,fontWeight:600,letterSpacing:.5}}>BETA</span>
                        </div>
                      </div>
                      <div style={{fontSize:12,color:T.muted,lineHeight:1.7,marginBottom:12}}>Connect Canvas to automatically import your assignments and due dates. Requires your Canvas URL and a personal API token from your school's Canvas account.</div>
                      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
                        <div>
                          <div style={{fontSize:11,color:T.muted,marginBottom:4}}>Your Canvas URL</div>
                          <input className="ifield" value={canvasUrl} onChange={e=>setCanvasUrl(e.target.value)} placeholder="https://yourschool.instructure.com" style={{fontSize:13}}/>
                        </div>
                        <div>
                          <div style={{fontSize:11,color:T.muted,marginBottom:4}}>Canvas API Token</div>
                          <input className="ifield" value={canvasToken} onChange={e=>setCanvasToken(e.target.value)} placeholder="Paste your token here" type="password" style={{fontSize:13}}/>
                        </div>
                        <button className="bp" style={{fontSize:13}} onClick={importFromCanvas} disabled={canvasImporting}>
                          {canvasImporting?"Connecting...":"Save Canvas Settings"}
                        </button>
                      </div>
                      <div style={{padding:"10px 12px",background:T.subcard,borderRadius:9,border:`1px solid ${T.border2}`}}>
                        <div style={{fontSize:11,fontWeight:600,marginBottom:6}}>How to get your Canvas API token:</div>
                        <div style={{fontSize:11,color:T.muted,lineHeight:1.8}}>
                          1. Log into Canvas at your school's URL<br/>
                          2. Click your profile picture → <strong style={{color:T.text}}>Account</strong> → <strong style={{color:T.text}}>Settings</strong><br/>
                          3. Scroll to <strong style={{color:T.text}}>Approved Integrations</strong><br/>
                          4. Click <strong style={{color:T.text}}>+ New Access Token</strong><br/>
                          5. Set purpose to "ProPlan Scholar" → <strong style={{color:T.text}}>Generate Token</strong><br/>
                          6. Copy and paste the token above
                        </div>
                      </div>
                    </div>
                  )}

                  {/* EMAIL */}
                  {integrationTab==="email"&&(
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                        <span style={{fontSize:20}}>📧</span>
                        <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>Weekly Digest Email</div><div style={{fontSize:11,color:T.success,fontWeight:600}}>✓ Available now</div></div>
                        {/* Toggle */}
                        <button onClick={async()=>{const val=profile?.email_digest!==false?false:true;setProfile(p=>({...p,email_digest:val}));await supabase.from("profiles").update({email_digest:val}).eq("id",authUser.id);notify(val?"Weekly digest enabled!":"Weekly digest disabled.");}} style={{width:44,height:24,borderRadius:20,background:profile?.email_digest!==false?T.success:T.border2,border:"none",position:"relative",cursor:"pointer",transition:"background .2s",flexShrink:0}}>
                          <div style={{position:"absolute",top:2,left:profile?.email_digest!==false?21:2,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
                        </button>
                      </div>
                      <div style={{padding:"10px 12px",background:T.subcard,borderRadius:9,border:`1px solid ${T.border2}`,marginBottom:12}}>
                        <div style={{fontSize:11,fontWeight:600,marginBottom:4}}>Sending to</div>
                        <div style={{fontSize:13,color:T.text,fontWeight:600}}>{authUser?.email}</div>
                        <div style={{fontSize:10,color:T.muted,marginTop:2}}>Every Sunday at 6 PM CT</div>
                      </div>
                      <div style={{padding:"10px 12px",background:T.subcard,borderRadius:9,border:`1px solid ${T.border2}`,marginBottom:12}}>
                        <div style={{fontSize:11,fontWeight:600,marginBottom:8}}>Each email includes:</div>
                        {[["📊","At-a-glance stats","Courses, pending, study hours, completed"],["⚠️","Overdue alerts","Any past-due assignments flagged immediately"],["📌","Upcoming deadlines","Next 14 days sorted by urgency"],["📚","Study schedule","This week's sessions with exact times"],["⬟","Next milestone","Your major project or milestone progress"]].map(([icon,t,d])=>(
                          <div key={t} style={{display:"flex",gap:10,padding:"5px 0",borderBottom:`1px solid ${T.border}`,alignItems:"flex-start"}}>
                            <span style={{fontSize:14,flexShrink:0}}>{icon}</span>
                            <div><div style={{fontSize:12,fontWeight:600}}>{t}</div><div style={{fontSize:10,color:T.muted}}>{d}</div></div>
                          </div>
                        ))}
                      </div>
                      <div style={{fontSize:11,color:T.faint,textAlign:"center"}}>You can unsubscribe at any time from the email or by toggling above.</div>
                    </div>
                  )}
                  {/* PUSH NOTIFICATIONS */}
                  {integrationTab==="push"&&(
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                        <span style={{fontSize:20}}>🔔</span>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:600,fontSize:13}}>Push Notifications</div>
                          <div style={{fontSize:11,color:pushSupported?T.success:T.muted,fontWeight:600}}>
                            {pushSupported?"✓ Available now":"⚠ Your browser doesn't support push notifications"}
                          </div>
                        </div>
                        {pushSupported&&(
                          <button
                            onClick={togglePushSubscription}
                            disabled={pushBusy}
                            style={{width:44,height:24,borderRadius:20,background:pushSubscribed?T.success:T.border2,border:"none",position:"relative",cursor:pushBusy?"wait":"pointer",transition:"background .2s",flexShrink:0,opacity:pushBusy?0.6:1}}>
                            <div style={{position:"absolute",top:2,left:pushSubscribed?21:2,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
                          </button>
                        )}
                      </div>
                      <div style={{fontSize:12,color:T.muted,lineHeight:1.7,marginBottom:12}}>
                        Get a push notification every morning at 8 AM CT with what's coming up — assignments due, today's classes, and study sessions.
                      </div>
                      {pushSupported&&pushPermission==="denied"&&(
                        <div style={{padding:"10px 12px",background:`rgba(${hexToRgb(T.danger)},.08)`,borderRadius:9,border:`1px solid rgba(${hexToRgb(T.danger)},.25)`,marginBottom:12,fontSize:12,color:T.danger}}>
                          Browser notifications are blocked. To re-enable: open your browser's site settings for proplanscholar.com and switch Notifications to <strong>Allow</strong>, then come back here.
                        </div>
                      )}
                      {pushSupported&&pushSubscribed&&pushPermission==="granted"&&(
                        <div style={{padding:"10px 12px",background:`rgba(${hexToRgb(T.success)},.08)`,borderRadius:9,border:`1px solid rgba(${hexToRgb(T.success)},.25)`,marginBottom:12,fontSize:12,color:T.success}}>
                          ✓ This browser is subscribed. You'll get a push every morning at 8 AM CT.
                        </div>
                      )}
                      <div style={{padding:"10px 12px",background:T.subcard,borderRadius:9,border:`1px solid ${T.border2}`,marginBottom:10}}>
                        <div style={{fontSize:11,fontWeight:600,marginBottom:6}}>Each daily push includes:</div>
                        {[["🔴","Due TODAY","Any assignments with today's due date"],["🟠","Due tomorrow","One-day-out heads up"],["🟡","Due in 3 days","Time to start working"],["🎓","Today's classes","First class start time and total"],["📚","Today's study","Number of sessions planned"]].map(([icon,t,d])=>(
                          <div key={t} style={{display:"flex",gap:10,padding:"5px 0",borderBottom:`1px solid ${T.border}`,alignItems:"flex-start"}}>
                            <span style={{fontSize:14,flexShrink:0,minWidth:18}}>{icon}</span>
                            <div><div style={{fontSize:12,fontWeight:600}}>{t}</div><div style={{fontSize:10,color:T.muted}}>{d}</div></div>
                          </div>
                        ))}
                      </div>
                      <div style={{padding:"8px 12px",background:`rgba(${rgb},.06)`,borderRadius:8,border:`1px solid rgba(${rgb},.15)`,fontSize:11,color:T.muted}}>
                        💡 Notifications work best when ProPlan Scholar is installed as a PWA (Add to Home Screen). On iPhone, push requires iOS 16.4 or later in PWA mode.
                      </div>
                    </div>
                  )}
                </div>
                {/* Two-Factor Authentication */}
                <div className="card" style={{borderLeft:`3px solid ${T.accent}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                    <span style={{fontSize:18}}>🔐</span>
                    <div style={{fontWeight:700,flex:1}}>Two-Factor Authentication</div>
                    {mfaFactors.some(f=>f.status==="verified")
                      ?<span style={{fontSize:10,padding:"2px 8px",borderRadius:12,background:`rgba(${hexToRgb(T.success)},.15)`,color:T.success,fontWeight:700,letterSpacing:.5}}>ENABLED</span>
                      :<span style={{fontSize:10,padding:"2px 8px",borderRadius:12,background:T.subcard,color:T.muted,fontWeight:600,letterSpacing:.5}}>OFF</span>}
                  </div>
                  <div style={{fontSize:12,color:T.muted,marginBottom:12,lineHeight:1.6}}>
                    Add an extra layer of protection to your account. After signing in with your password, you will also enter a 6-digit code from an authenticator app like Google Authenticator, Authy, or 1Password.
                  </div>
                  {mfaFactors.filter(f=>f.status==="verified").length===0&&(
                    <button onClick={startMfaEnroll} disabled={mfaBusy} className="bp" style={{width:"100%",fontSize:13,opacity:mfaBusy?0.6:1}}>
                      {mfaBusy?"Working...":"Enable Two-Factor Authentication"}
                    </button>
                  )}
                  {mfaFactors.filter(f=>f.status==="verified").map(f=>(
                    <div key={f.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:T.subcard,borderRadius:9,border:`1px solid ${T.border2}`,marginBottom:8}}>
                      <span style={{fontSize:18}}>📱</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.friendly_name||"Authenticator app"}</div>
                        <div style={{fontSize:10,color:T.muted}}>Active since {f.created_at?new Date(f.created_at).toLocaleDateString():"recently"}</div>
                      </div>
                      <button onClick={()=>disableMfa(f.id)} disabled={mfaBusy} style={{background:"transparent",border:`1px solid ${T.danger}`,borderRadius:7,padding:"6px 10px",fontSize:11,color:T.danger,cursor:mfaBusy?"wait":"pointer",fontFamily:"inherit",flexShrink:0,opacity:mfaBusy?0.5:1}}>Disable</button>
                    </div>
                  ))}
                </div>

                {/* Sign Out */}
                <div className="card" style={{borderLeft:`3px solid ${T.danger}`}}>
                  <div style={{fontWeight:700,marginBottom:6,color:T.danger}}>Account</div>
                  <div style={{fontSize:12,color:T.muted,marginBottom:12}}>Signed in as {authUser?.email}</div>
                  <button onClick={async()=>{
                    await supabase.auth.signOut();window.location.href="/";
                  }} style={{width:"100%",padding:"11px",borderRadius:9,border:`1px solid ${T.danger}`,background:"transparent",color:T.danger,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
                    Sign Out
                  </button>
                </div>

                {/* Feedback / Report Issue */}
                <div className="card" style={{borderLeft:`3px solid ${T.accent}`}}>
                  <div style={{fontWeight:700,marginBottom:4}}>Enhancement Suggestion / Report Issue</div>
                  <div style={{fontSize:12,color:T.muted,marginBottom:12}}>Help us improve ProPlan Scholar. Your feedback goes directly to our team.</div>
                  {feedbackSent?(
                    <div style={{textAlign:"center",padding:"16px 0"}}>
                      <div style={{fontSize:28,marginBottom:8}}>🎉</div>
                      <div style={{fontWeight:600,fontSize:14,marginBottom:4}}>Thank you for your feedback!</div>
                      <div style={{fontSize:12,color:T.muted,marginBottom:12}}>We appreciate you taking the time to help us improve.</div>
                      <button onClick={()=>{setFeedbackSent(false);setFeedbackText("");}} style={{fontSize:12,color:T.accent,background:"transparent",border:"none",cursor:"pointer",fontFamily:"inherit",textDecoration:"underline"}}>Submit another</button>
                    </div>
                  ):(
                    <>
                      <div style={{display:"flex",gap:6,marginBottom:10}}>
                        {[["suggestion","💡 Suggestion"],["bug","🐛 Bug Report"],["other","💬 Other"]].map(([val,label])=>(
                          <button key={val} onClick={()=>setFeedbackType(val)} style={{flex:1,padding:"7px 4px",borderRadius:7,border:`1px solid ${feedbackType===val?T.accent:T.border2}`,background:feedbackType===val?`rgba(${hexToRgb(T.accent)},.1)`:"transparent",color:feedbackType===val?T.accent:T.muted,fontSize:11,fontWeight:feedbackType===val?600:400,cursor:"pointer",fontFamily:"inherit",transition:"all .2s"}}>{label}</button>
                        ))}
                      </div>
                      <textarea value={feedbackText} onChange={e=>setFeedbackText(e.target.value)} placeholder={feedbackType==="bug"?"Describe the issue — what happened and what you expected...":"Describe your idea or suggestion..."} style={{width:"100%",minHeight:80,background:T.subcard,border:`1px solid ${T.border2}`,borderRadius:8,padding:"10px 12px",color:T.text,fontSize:13,fontFamily:"inherit",resize:"vertical",outline:"none"}}/>
                      <button onClick={async()=>{
                        if(!feedbackText.trim())return;
                        setFeedbackSending(true);
                        try{
                          const subject=encodeURIComponent(`[${feedbackType.toUpperCase()}] ProPlan Scholar Feedback`);
                          const body=encodeURIComponent(`Type: ${feedbackType}\nFrom: ${authUser?.email||"Unknown"}\nUniversity: ${uni?.name||"Unknown"}\n\n${feedbackText}`);
                          window.location.href=`mailto:hello@proplanscholar.com?subject=${subject}&body=${body}`;
                          setFeedbackSent(true);
                        }catch(e){notify("Could not open email client.");}
                        setFeedbackSending(false);
                      }} disabled={!feedbackText.trim()||feedbackSending} style={{width:"100%",marginTop:8,padding:"11px",borderRadius:9,border:"none",background:!feedbackText.trim()?T.border2:T.accent,color:"#fff",fontWeight:600,fontSize:13,cursor:feedbackText.trim()?"pointer":"not-allowed",fontFamily:"inherit",opacity:feedbackText.trim()?1:0.5,transition:"all .2s"}}>
                        {feedbackSending?"Opening email...":"Send Feedback →"}
                      </button>
                    </>
                  )}
                </div>

                <div className="card">
                  <div style={{fontWeight:700,marginBottom:7}}>Syllabus Import</div>
                  <div style={{fontSize:12,color:T.muted,marginBottom:10}}>AI extracts all assignments, due dates, professor names, and topics automatically. Saved syllabi can be re-opened from each course card.</div>
                  <label
                    className={"syl-drop"+(isDragging?" is-dragging":"")}
                    onDragOver={handleSyllabusDragOver}
                    onDragEnter={handleSyllabusDragOver}
                    onDragLeave={handleSyllabusDragLeave}
                    onDrop={handleSyllabusDrop}>
                    <input type="file" accept=".txt,.pdf,.docx" onChange={handleSyllabusUpload} style={{display:"none"}}/>
                    <div style={{fontSize:22,marginBottom:5}}>📄</div>
                    <div style={{fontSize:13,color:T.text,fontWeight:600}}>{uploading?"Analyzing…":isDragging?"Drop your syllabus to upload":"Drag & drop your syllabus here"}</div>
                    <div style={{fontSize:11,color:T.muted,marginTop:3}}>or click to browse · PDF, .txt, .docx</div>
                    {uploadMsg&&<div style={{fontSize:11,marginTop:7,color:T.success}}>{uploadMsg}</div>}
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
              {["Soonest deadline?","Study strategy","Prioritize my week","Major project advice","How am I doing?"].map(q=>(
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
                <option value="" disabled hidden>Select type...</option>
                {["Paper","Exam","Case Study","Homework","Project","Discussion","Presentation","Lab","Quiz"].map(tp=><option key={tp} value={tp.toLowerCase().replace(" ","")}>{tp}</option>)}
              </select>
            </div>
          </div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Estimated Hours: {newAssign.estHours}</div><input type="range" min={1} max={30} value={newAssign.estHours} onChange={e=>setNewAssign(a=>({...a,estHours:+e.target.value}))} style={{width:"100%",accentColor:T.accent}}/></div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Description / Notes <span style={{color:T.faint}}>(optional)</span></div><textarea className="ifield" rows={2} placeholder="Key topics, requirements, what to focus on..." value={newAssign.topics||""} onChange={e=>setNewAssign(a=>({...a,topics:e.target.value}))} style={{resize:"vertical",fontSize:12}}/></div>
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
          <div>
            <div style={{fontSize:11,color:T.muted,marginBottom:6}}>Class Days <span style={{color:T.faint}}>(which days does this class meet?)</span></div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {DAYS_SHORT.map(d=>{const sel=(newCourse.class_days||[]).includes(d);return(
                <button key={d} type="button" onClick={()=>{const cur=newCourse.class_days||[];setNewCourse(c=>({...c,class_days:sel?cur.filter(x=>x!==d):[...cur,d]}));}} style={{padding:"5px 10px",borderRadius:7,border:`2px solid ${sel?T.accent:T.border2}`,background:sel?`rgba(${hexToRgb(T.accent)},.12)`:"transparent",color:sel?T.accent:T.muted,fontSize:12,fontWeight:sel?700:400,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>{d}</button>
              );})}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
            <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Class Start Time</div><input type="time" className="ifield" value={newCourse.class_time||""} onChange={e=>setNewCourse(c=>({...c,class_time:e.target.value}))}/></div>
            <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Class End Time</div><input type="time" className="ifield" value={newCourse.class_end_time||""} onChange={e=>setNewCourse(c=>({...c,class_end_time:e.target.value}))}/></div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:4}}><button className="bg2" style={{flex:1}} onClick={()=>setShowAddCourse(false)}>Cancel</button><button className="bp" style={{flex:1}} onClick={addCourse}>Add Course</button></div>
        </div>
      </div></div>)}

      {showAddMilestone&&(<div className="mo" onClick={()=>setShowAddMilestone(false)}><div className="md fi" onClick={e=>e.stopPropagation()}>
        <div style={{fontWeight:700,fontSize:16,marginBottom:13}}>Add Milestone</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Title</div><input className="ifield" placeholder="e.g. Proposal Defense" value={newMilestone.title} onChange={e=>setNewMilestone(m=>({...m,title:e.target.value}))}/></div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Target Date</div><input type="date" className="ifield" value={newMilestone.due} onChange={e=>setNewMilestone(m=>({...m,due:e.target.value}))}/></div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Notes</div><textarea className="ifield" rows={2} placeholder="Requirements, key deliverables, notes..." value={newMilestone.notes} onChange={e=>setNewMilestone(m=>({...m,notes:e.target.value}))} style={{resize:"vertical"}}/></div>
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


      {/* ═══ EDIT ASSIGNMENT MODAL ═══ */}
      {editAssign&&(<div className="mo" onClick={()=>setEditAssign(null)}><div className="md fi" onClick={e=>e.stopPropagation()}>
        <div style={{fontWeight:700,fontSize:16,marginBottom:13}}>✏️ Edit Assignment</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Course</div>
            <select className="ifield" value={editAssign.courseId} onChange={e=>setEditAssign(a=>({...a,courseId:e.target.value}))}>
              {courses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Title</div><input className="ifield" value={editAssign.title} onChange={e=>setEditAssign(a=>({...a,title:e.target.value}))}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
            <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Due Date</div><input type="date" className="ifield" value={editAssign.due} onChange={e=>setEditAssign(a=>({...a,due:e.target.value}))}/></div>
            <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Type</div>
              <select className="ifield" value={editAssign.type} onChange={e=>setEditAssign(a=>({...a,type:e.target.value}))}>
                <option value="" disabled hidden>Select type...</option>
                {["Paper","Exam","Case Study","Homework","Project","Discussion","Presentation","Lab","Quiz"].map(tp=><option key={tp} value={tp.toLowerCase().replace(" ","")}>{tp}</option>)}
              </select>
            </div>
          </div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Estimated Hours: {editAssign.estHours}</div><input type="range" min={1} max={30} value={editAssign.estHours} onChange={e=>setEditAssign(a=>({...a,estHours:+e.target.value}))} style={{width:"100%",accentColor:T.accent}}/></div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Weight in course grade <span style={{color:T.faint}}>(0-100%, optional)</span></div><input type="number" min={0} max={100} step={1} placeholder="e.g. 25 for a final worth 25%" value={editAssign.weight??""} onChange={e=>setEditAssign(a=>({...a,weight:e.target.value===""?null:Math.max(0,Math.min(100,Number(e.target.value)))}))} className="ifield" style={{fontSize:12}}/></div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Notes / Topics</div><textarea className="ifield" rows={2} value={editAssign.topics||""} onChange={e=>setEditAssign(a=>({...a,topics:e.target.value}))} style={{resize:"vertical",fontSize:12}} placeholder="Key topics, notes for flashcards..."/></div>
          <div style={{display:"flex",gap:8,marginTop:4}}><button className="bg2" style={{flex:1}} onClick={()=>setEditAssign(null)}>Cancel</button><button className="bp" style={{flex:1}} onClick={saveEditAssignment}>Save Changes</button></div>
        </div>
      </div></div>)}

      {/* ═══ BOTTOM TAB BAR (mobile only) ═══ */}
      <nav className="tab-bar">
        {NAV.slice(0,5).map(item=>{
          const badge=item.id==="assignments"?overdue.length:item.id==="calendar"&&todayStudy.length>0?todayStudy.length:0;
          return(
            <button key={item.id} className={`tab-item${view===item.id?" active":""}`} onClick={()=>setView(item.id)}>
              {badge>0&&<span className="tab-badge">{badge}</span>}
              <span className="tab-item-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
        <button className={`tab-item${view==="settings"||view==="dissertation"||view==="flashcards"||view==="analytics"?" active":""}`} onClick={()=>setView(view==="settings"||view==="dissertation"||view==="flashcards"||view==="analytics"?"dashboard":"settings")}>
          <span className="tab-item-icon">{view==="settings"||view==="dissertation"||view==="flashcards"||view==="analytics"?"✕":"⋯"}</span>
          <span>More</span>
        </button>
      </nav>

      {/* ═══ RATE PROFESSOR MODAL ═══ */}
      {showRateModal&&(
        <div className="mo" onClick={()=>setShowRateModal(null)}>
          <div className="md fi" onClick={e=>e.stopPropagation()} style={{maxWidth:440}}>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:10,letterSpacing:2,color:T.accent,textTransform:"uppercase",marginBottom:4}}>ProPlan Scholar Peer Ratings</div>
              <div style={{fontWeight:700,fontSize:18,marginBottom:2}}>Rate {showRateModal.profName}</div>
              <div style={{fontSize:12,color:T.muted}}>{showRateModal.courseName} · {uni.name}</div>
            </div>
            {[
              {key:"quality",label:"Overall Quality",desc:"How good was this professor overall?",lowLabel:"Poor",highLabel:"Excellent",color:T.success},
              {key:"difficulty",label:"Difficulty",desc:"How difficult were exams and assignments?",lowLabel:"Easy",highLabel:"Very Hard",color:T.danger},
              {key:"workload",label:"Workload",desc:"How much time did this course demand weekly?",lowLabel:"Light",highLabel:"Very Heavy",color:T.warning},
            ].map(cat=>(
              <div key={cat.key} style={{marginBottom:16,padding:"12px 14px",background:T.subcard,borderRadius:10,border:`1px solid ${T.border2}`}}>
                <div style={{fontWeight:600,fontSize:13,marginBottom:2}}>{cat.label}</div>
                <div style={{fontSize:11,color:T.muted,marginBottom:8}}>{cat.desc}</div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <span style={{fontSize:10,color:T.faint,minWidth:28}}>{cat.lowLabel}</span>
                  {[1,2,3,4,5].map(n=>(
                    <button key={n} onClick={()=>setNewRating(r=>({...r,[cat.key]:n}))} style={{width:36,height:36,borderRadius:8,border:`2px solid ${newRating[cat.key]>=n?cat.color:T.border2}`,background:newRating[cat.key]>=n?`rgba(${hexToRgb(cat.color)},.15)`:"transparent",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s"}}>
                      {newRating[cat.key]>=n?"★":"☆"}
                    </button>
                  ))}
                  <span style={{fontSize:10,color:T.faint,minWidth:38,textAlign:"right"}}>{cat.highLabel}</span>
                </div>
                {newRating[cat.key]>0&&<div style={{fontSize:10,color:cat.color,marginTop:4,textAlign:"center",fontWeight:600}}>{["","1 — "+cat.lowLabel,"2","3 — Okay","4",`5 — ${cat.highLabel}`][newRating[cat.key]]}</div>}
              </div>
            ))}
            <div style={{marginBottom:14,padding:"12px 14px",background:T.subcard,borderRadius:10,border:`1px solid ${T.border2}`}}>
              <div style={{fontWeight:600,fontSize:13,marginBottom:8}}>Would you take this professor again?</div>
              <div style={{display:"flex",gap:10}}>
                {[{v:true,label:"Yes! 👍"},{v:false,label:"No 👎"}].map(opt=>(
                  <button key={String(opt.v)} onClick={()=>setNewRating(r=>({...r,wouldTakeAgain:opt.v}))} style={{flex:1,padding:"10px",borderRadius:9,border:`2px solid ${newRating.wouldTakeAgain===opt.v?(opt.v?T.success:T.danger):T.border2}`,background:newRating.wouldTakeAgain===opt.v?(opt.v?`rgba(${hexToRgb(T.success)},.1)`:`rgba(${hexToRgb(T.danger)},.1)`):"transparent",color:newRating.wouldTakeAgain===opt.v?(opt.v?T.success:T.danger):T.muted,fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit",transition:"all .2s"}}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,color:T.muted,marginBottom:4}}>Leave a comment <span style={{color:T.faint}}>(optional — visible to peers)</span></div>
              <textarea className="ifield" rows={2} placeholder="Tips for future students taking this professor..." value={newRating.comment} onChange={e=>setNewRating(r=>({...r,comment:e.target.value}))} style={{resize:"vertical",fontSize:12}}/>
            </div>
            <div style={{display:"flex",gap:9}}>
              <button className="bg2" style={{flex:1}} onClick={()=>setShowRateModal(null)}>Cancel</button>
              <button className="bp" style={{flex:1}} onClick={submitProfRating}>Submit Rating</button>
            </div>
          </div>
        </div>
      )}

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
