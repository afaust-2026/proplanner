import { useState, useEffect, useRef } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const DAYS_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function getCalendarDays(year,month){const first=new Date(year,month,1).getDay(),total=new Date(year,month+1,0).getDate(),days=[];for(let i=0;i<first;i++)days.push(null);for(let d=1;d<=total;d++)days.push(d);return days;}
function dateKey(y,m,d){return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;}
function today(){const d=new Date();return{year:d.getFullYear(),month:d.getMonth(),day:d.getDate()};}
function daysUntil(due){const n=new Date();n.setHours(0,0,0,0);return Math.ceil((new Date(due+"T00:00:00")-n)/86400000);}
function urgencyColor(d,acc){return d<0?acc.danger:d<=3?acc.warning:d<=7?acc.caution:acc.success;}
function futureDate(n){const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);}
function rmpToInternal(r){return Math.round(Math.min(5,Math.max(1,r||3)));}
function hexToRgb(hex){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return`${r},${g},${b}`;}
function lighten(hex,amt){let r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);r=Math.min(255,r+amt);g=Math.min(255,g+amt);b=Math.min(255,b+amt);return`#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;}

// ─── University Registry ──────────────────────────────────────────────────────
const UNIVERSITIES = [
  {id:"utd",  name:"UT Dallas",             abbr:"UTD",  primary:"#C75B12", secondary:"#154734", accent:"#F5A623", logo:"☄️"},
  {id:"harvard",name:"Harvard University",  abbr:"HBS",  primary:"#A51C30", secondary:"#1E1E1E", accent:"#C0A060", logo:"🎓"},
  {id:"wharton",name:"Wharton / UPenn",     abbr:"PENN", primary:"#011F5B", secondary:"#990000", accent:"#C0A060", logo:"🦅"},
  {id:"mit",  name:"MIT Sloan",             abbr:"MIT",  primary:"#750014", secondary:"#8A8B8C", accent:"#A31F34", logo:"⚙️"},
  {id:"stanford",name:"Stanford GSB",       abbr:"GSB",  primary:"#8C1515", secondary:"#4D4F53", accent:"#B6B1A9", logo:"🌲"},
  {id:"chicago",name:"U Chicago Booth",     abbr:"BOOTH",primary:"#800000", secondary:"#767676", accent:"#FFA500", logo:"🏛"},
  {id:"kellogg",name:"Northwestern Kellogg",abbr:"KSM",  primary:"#4E2A84", secondary:"#716C6B", accent:"#B6ACD1", logo:"🐾"},
  {id:"ross", name:"U Michigan Ross",       abbr:"ROSS", primary:"#00274C", secondary:"#FFCB05", accent:"#FFCB05", logo:"〽️"},
  {id:"fuqua", name:"Duke Fuqua",           abbr:"FUQUA",primary:"#012169", secondary:"#C84E00", accent:"#E89923", logo:"👿"},
  {id:"tuck", name:"Dartmouth Tuck",        abbr:"TUCK", primary:"#00693E", secondary:"#12312B", accent:"#64A70B", logo:"🌲"},
  {id:"mccombs",name:"UT Austin McCombs",   abbr:"UTSB", primary:"#BF5700", secondary:"#333F48", accent:"#F8971F", logo:"🤘"},
  {id:"cox",  name:"SMU Cox",               abbr:"SMU",  primary:"#CC0035", secondary:"#354CA1", accent:"#F5A623", logo:"🐎"},
  {id:"neeley",name:"TCU Neeley",           abbr:"TCU",  primary:"#4D1979", secondary:"#A3A9AC", accent:"#C9B765", logo:"🐸"},
  {id:"olin", name:"Wash U Olin",           abbr:"OLIN", primary:"#A51417", secondary:"#101820", accent:"#C69214", logo:"🐻"},
  {id:"custom",name:"Other / Custom",       abbr:"MY",   primary:"#6366f1", secondary:"#0ea5e9", accent:"#f59e0b", logo:"🎓"},
];

// ─── Claude API ───────────────────────────────────────────────────────────────
async function callClaudeJSON(system,user,maxT=1500){
  const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:maxT,system,messages:[{role:"user",content:user}]})});
  const data=await res.json();
  const text=data.content?.map(b=>b.text||"").join("")||"";
  return JSON.parse(text.replace(/```json[\s\S]*?```|```/g,"").trim());
}
async function callClaudeChat(messages){
  const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages})});
  const data=await res.json();
  return data.content?.map(b=>b.text||"").join("")||"Sorry, I couldn't respond.";
}

// ─── Default flexible work schedule (each day independent) ────────────────────
function defaultWorkSchedule(){
  return {
    Sun:{work:false,start:"",   end:""},
    Mon:{work:true, start:"08:00",end:"18:00"},
    Tue:{work:true, start:"08:00",end:"18:00"},
    Wed:{work:true, start:"08:00",end:"18:00"},
    Thu:{work:true, start:"08:00",end:"18:00"},
    Fri:{work:true, start:"08:00",end:"17:00"},
    Sat:{work:false,start:"",   end:""},
  };
}

// ─── Seed data ────────────────────────────────────────────────────────────────
const SEED_COURSES=[
  {id:1,name:"BCOM 6301 – Research Methods",     difficulty:4,color:"#6366f1",professor:"",rmpData:null},
  {id:2,name:"BCOM 6302 – Organizational Theory",difficulty:3,color:"#0ea5e9",professor:"",rmpData:null},
  {id:3,name:"BCOM 6303 – Quantitative Analysis",difficulty:5,color:"#ec4899",professor:"",rmpData:null},
];
const SEED_ASSIGNMENTS=[
  {id:1,courseId:1,title:"Literature Review Draft",due:futureDate(5), type:"paper",   estHours:8, done:false,flashcards:[],topics:""},
  {id:2,courseId:2,title:"Case Analysis – Walmart",due:futureDate(9), type:"case",    estHours:4, done:false,flashcards:[],topics:""},
  {id:3,courseId:3,title:"Problem Set 3",          due:futureDate(3), type:"homework",estHours:3, done:false,flashcards:[],topics:""},
  {id:4,courseId:1,title:"Research Proposal",      due:futureDate(18),type:"paper",   estHours:12,done:false,flashcards:[],topics:""},
  {id:5,courseId:3,title:"Midterm Exam",            due:futureDate(12),type:"exam",    estHours:6, done:false,flashcards:[],topics:""},
];

// Dissertation milestones
const SEED_MILESTONES=[
  {id:1,title:"Topic Approval",         due:futureDate(30), done:false,notes:"Submit 2-page concept paper to advisor"},
  {id:2,title:"Literature Review Draft",due:futureDate(60), done:false,notes:"Min 60 sources, APA format"},
  {id:3,title:"Proposal Defense",       due:futureDate(120),done:false,notes:"Committee presentation scheduled"},
  {id:4,title:"IRB Approval",           due:futureDate(150),done:false,notes:"Human subjects research clearance"},
  {id:5,title:"Data Collection",        due:futureDate(210),done:false,notes:"Surveys / interviews complete"},
  {id:6,title:"Final Defense",          due:futureDate(365),done:false,notes:"Doctoral dissertation defense"},
];

// ─── Themes ───────────────────────────────────────────────────────────────────
function buildTheme(uni,dark){
  const p=uni.primary, s=uni.secondary, a=uni.accent;
  if(dark) return {
    bg:"#0f0f13",sidebar:"#0d0d15",card:"#16161f",border:"#1e1e2e",border2:"#2a2a38",
    text:"#e8e3d8",muted:"#7a7590",faint:"#4a4560",inputBg:"#0f0f13",
    chatBg:"#12121a",aiBubble:"#16161f",userBubble:"#1e1e40",
    scrollThumb:"#3a3a4a",overlay:"rgba(0,0,0,.75)",hoverBg:"#1a1a28",subcard:"#0f0f18",
    accent:p,accent2:s,accentLight:a,
    danger:"#ef4444",warning:"#f97316",caution:"#eab308",success:"#22c55e",
    navActive:`rgba(${hexToRgb(p)},.15)`,navActiveBorder:p,
  };
  return {
    bg:"#f8f7f4",sidebar:"#ffffff",card:"#ffffff",border:"#e5e3dc",border2:"#d1cfc7",
    text:"#1a1820",muted:"#6b6880",faint:"#9a97a8",inputBg:"#f5f4f1",
    chatBg:"#f0efe9",aiBubble:"#ffffff",userBubble:`rgba(${hexToRgb(p)},.1)`,
    scrollThumb:"#c4c2bc",overlay:"rgba(0,0,0,.4)",hoverBg:"#f0efe9",subcard:"#f5f4f0",
    accent:p,accent2:s,accentLight:a,
    danger:"#dc2626",warning:"#ea580c",caution:"#ca8a04",success:"#16a34a",
    navActive:`rgba(${hexToRgb(p)},.08)`,navActiveBorder:p,
  };
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function ProfPlanner(){
  const t=today();

  // UI
  const [view,setView]           = useState("dashboard");
  const [dark,setDark]           = useState(true);
  const [sidebarOpen,setSidebar] = useState(true);
  const [chatOpen,setChatOpen]   = useState(false);
  const [uni,setUni]             = useState(UNIVERSITIES[0]); // UTD default
  const [showUniPicker,setUniPicker] = useState(false);
  const [customUni,setCustomUni] = useState({name:"My University",abbr:"MY",primary:"#6366f1",secondary:"#0ea5e9",accent:"#f59e0b"});

  // Data
  const [courses,setCourses]         = useState(SEED_COURSES);
  const [assignments,setAssignments] = useState(SEED_ASSIGNMENTS);
  const [studyBlocks,setStudyBlocks] = useState([]);
  const [milestones,setMilestones]   = useState(SEED_MILESTONES);
  const [workSched,setWorkSched]     = useState(defaultWorkSchedule());

  // New professional features state
  const [energyLog,setEnergyLog]     = useState([]); // {date,level:1-5,notes}
  const [travelDates,setTravelDates] = useState([]); // {start,end,label}
  const [showAddTravel,setShowAddTravel] = useState(false);
  const [newTravel,setNewTravel]     = useState({start:"",end:"",label:""});
  const [weeklyReflection,setWeeklyReflection] = useState("");
  const [showReflection,setShowReflection]   = useState(false);

  // Calendar
  const [calYear,setCalYear]   = useState(t.year);
  const [calMonth,setCalMonth] = useState(t.month);
  const [selectedDay,setSelectedDay] = useState(null);

  // Modals / upload
  const [showAddAssign,setShowAddAssign] = useState(false);
  const [showAddCourse,setShowAddCourse] = useState(false);
  const [showAddMilestone,setShowAddMilestone] = useState(false);
  const [uploading,setUploading] = useState(false);
  const [uploadMsg,setUploadMsg] = useState("");
  const [notification,setNotification] = useState("");
  const [newAssign,setNewAssign] = useState({courseId:1,title:"",due:"",type:"paper",estHours:4});
  const [newCourse,setNewCourse] = useState({name:"",difficulty:3,color:"#6366f1",professor:""});
  const [newMilestone,setNewMilestone] = useState({title:"",due:"",notes:""});

  // Chat
  const [chatMessages,setChatMessages] = useState([{role:"assistant",content:"Hi! I'm your doctoral study assistant. I know your schedule, courses, dissertation milestones, and professor ratings. What can I help you with today?"}]);
  const [chatInput,setChatInput]   = useState("");
  const [chatLoading,setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  // Flashcards
  const [showFlashModal,setShowFlashModal] = useState(null);
  const [flashGenerating,setFlashGenerating] = useState(false);
  const [flashContext,setFlashContext]   = useState("");
  const [activeCard,setActiveCard]       = useState(0);
  const [cardFlipped,setCardFlipped]     = useState(false);
  const [studyMode,setStudyMode]         = useState(false);

  // RMP
  const [rmpSearching,setRmpSearching] = useState({});
  const [rmpResults,setRmpResults]     = useState({});

  const T = buildTheme(uni,dark);

  useEffect(()=>{generateStudyBlocks();},[assignments,courses,workSched,travelDates]);
  useEffect(()=>{chatEndRef.current?.scrollIntoView({behavior:"smooth"});},[chatMessages,chatOpen]);

  function notify(msg){setNotification(msg);setTimeout(()=>setNotification(""),3500);}

  // ── Available study window calc ─────────────────────────────────────────────
  function getStudyWindowForDate(dateStr){
    const d=new Date(dateStr+"T00:00:00");
    const dayName=DAYS_SHORT[d.getDay()];
    const sched=workSched[dayName];
    const isTravelDay=travelDates.some(tr=>dateStr>=tr.start&&dateStr<=tr.end);
    if(isTravelDay) return {available:false,slot:"Traveling"};
    if(!sched.work) return {available:true,slot:"All day available"};
    // Work day — study in morning before work or evening after
    const startH=parseInt(sched.start?.split(":")[0]||8);
    const endH=parseInt(sched.end?.split(":")[0]||18);
    if(startH>=9) return {available:true,slot:`Morning (7–${startH}AM) or Evening (${endH>17?"7":"6"}–9PM)`};
    return {available:true,slot:`Evening (${endH>17?"7":"6"}–9 PM)`};
  }

  // ── Study scheduler ──────────────────────────────────────────────────────────
  function generateStudyBlocks(){
    const blocks=[];
    const pending=assignments.filter(a=>!a.done&&daysUntil(a.due)>=0);
    pending.sort((a,b)=>new Date(a.due)-new Date(b.due));
    pending.forEach(assign=>{
      const course=courses.find(c=>c.id===assign.courseId);
      const diff=course?.rmpData?Math.round((course.difficulty+rmpToInternal(course.rmpData.avgDifficulty))/2):course?.difficulty||3;
      const sessions=Math.ceil(assign.estHours*(diff/3)/2);
      let placed=0,checkDay=new Date();checkDay.setHours(0,0,0,0);
      const dueDay=new Date(assign.due+"T00:00:00");
      while(placed<sessions&&checkDay<dueDay){
        const dateStr=checkDay.toISOString().slice(0,10);
        const win=getStudyWindowForDate(dateStr);
        if(win.available&&!blocks.find(b=>b.date===dateStr&&b.assignId===assign.id)){
          blocks.push({id:`${assign.id}-${dateStr}`,assignId:assign.id,courseId:assign.courseId,title:`Study: ${assign.title}`,date:dateStr,slot:win.slot,hours:2,color:course?.color||T.accent});
          placed++;
        }
        checkDay.setDate(checkDay.getDate()+1);
      }
    });
    setStudyBlocks(blocks);
  }

  // ── Syllabus import ──────────────────────────────────────────────────────────
  async function handleSyllabusUpload(e){
    const file=e.target.files[0];if(!file)return;
    setUploading(true);setUploadMsg("Reading…");
    const text=await file.text();setUploadMsg("Analyzing with AI…");
    try{
      const result=await callClaudeJSON(`Parse this academic syllabus for a DBA/graduate program. Extract course info and ALL assignments.
Return ONLY valid JSON:
{"courseName":"","professorName":"","difficulty":1-5,"assignments":[{"title":"","due":"YYYY-MM-DD","type":"paper|exam|case|homework|project|discussion","estHours":1,"topics":""}]}
Assume year ${new Date().getFullYear()} when missing. Return ONLY JSON.`,text.slice(0,3500));
      let cid=courses.find(c=>c.name===result.courseName)?.id;
      if(!cid){
        const cols=["#6366f1","#0ea5e9","#ec4899","#10b981","#f59e0b","#8b5cf6"];
        const nc={id:Date.now(),name:result.courseName||"New Course",difficulty:result.difficulty||3,color:cols[courses.length%cols.length],professor:result.professorName||"",rmpData:null};
        setCourses(p=>[...p,nc]);cid=nc.id;
      }
      const newA=(result.assignments||[]).map((a,i)=>({id:Date.now()+i,courseId:cid,title:a.title,due:a.due,type:a.type||"paper",estHours:a.estHours||4,done:false,flashcards:[],topics:a.topics||""}));
      setAssignments(p=>[...p,...newA]);
      setUploadMsg(`✓ Imported ${newA.length} assignments`);notify(`Syllabus imported! ${newA.length} items added.`);
    }catch{setUploadMsg("⚠ Could not parse. Try plain .txt.");}
    setUploading(false);
  }

  // ── RMP Search ────────────────────────────────────────────────────────────────
  async function handleRmpSearch(cid,profName){
    if(!profName.trim())return notify("Enter professor name first.");
    setRmpSearching(s=>({...s,[cid]:true}));
    try{
      const res=await fetch("https://www.ratemyprofessors.com/graphql",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Basic dGVzdDp0ZXN0"},body:JSON.stringify({query:`query{search:newSearch{teachers(query:"${profName}",first:5){edges{node{id,firstName,lastName,avgRating,avgDifficulty,numRatings,wouldTakeAgainPercent,department,school{name}}}}}}`,variables:{}})});
      const data=await res.json();
      const teachers=data?.data?.search?.teachers?.edges?.map(e=>e.node)||[];
      setRmpResults(r=>({...r,[cid]:teachers.length>0?teachers:"notfound"}));
    }catch{setRmpResults(r=>({...r,[cid]:"notfound"}));}
    setRmpSearching(s=>({...s,[cid]:false}));
  }
  function applyRmp(cid,rmp){
    setCourses(p=>p.map(c=>c.id!==cid?c:{...c,rmpData:rmp,difficulty:Math.round((c.difficulty+rmpToInternal(rmp.avgDifficulty))/2)}));
    setRmpResults(r=>({...r,[cid]:[]}));notify("✓ RMP data applied — difficulty recalibrated.");
  }

  // ── Flashcards ────────────────────────────────────────────────────────────────
  async function generateFlashcards(aid){
    const a=assignments.find(x=>x.id===aid);const course=courses.find(c=>c.id===a?.courseId);
    if(!a)return;setFlashGenerating(true);
    try{
      const result=await callClaudeJSON("Generate DBA flashcards. Return ONLY valid JSON: {\"flashcards\":[{\"front\":\"\",\"back\":\"\",\"category\":\"concept|formula|framework|application|definition\"}]}",
        `Course: ${course?.name}\nAssignment: "${a.title}" (${a.type})\n${a.topics?"Topics: "+a.topics:""}\n${flashContext?"Extra context: "+flashContext:""}\nGenerate 12-16 high-quality doctoral-level flashcards.`,2000);
      const cards=(result.flashcards||[]).map((c,i)=>({...c,id:i,mastered:false}));
      setAssignments(p=>p.map(x=>x.id===aid?{...x,flashcards:cards}:x));
      setActiveCard(0);setCardFlipped(false);setStudyMode(true);
      notify(`✓ ${cards.length} flashcards generated!`);
    }catch{notify("⚠ Flashcard generation failed. Add context and try again.");}
    setFlashGenerating(false);setFlashContext("");
  }
  function toggleMastered(aid,cid){setAssignments(p=>p.map(a=>a.id!==aid?a:{...a,flashcards:a.flashcards.map(c=>c.id===cid?{...c,mastered:!c.mastered}:c)}));}

  // ── Chat ──────────────────────────────────────────────────────────────────────
  async function sendChat(override){
    const text=(override||chatInput).trim();if(!text||chatLoading)return;
    const rmpS=courses.filter(c=>c.rmpData).map(c=>`${c.name}: ${c.rmpData.firstName} ${c.rmpData.lastName} rating=${c.rmpData.avgRating} diff=${c.rmpData.avgDifficulty}`).join("; ");
    const ctx=`You are a doctoral study assistant for a working professional in a DBA/graduate program at ${uni.name}.
Courses: ${JSON.stringify(courses.map(c=>({name:c.name,difficulty:c.difficulty,rmp:c.rmpData?{r:c.rmpData.avgRating,d:c.rmpData.avgDifficulty}:null})))}
Pending: ${JSON.stringify(assignments.filter(a=>!a.done).map(a=>({title:a.title,due:a.due,type:a.type,daysLeft:daysUntil(a.due)})))}
Milestones: ${JSON.stringify(milestones.filter(m=>!m.done).map(m=>({title:m.title,due:m.due,daysLeft:daysUntil(m.due)})))}
${rmpS?"RMP: "+rmpS:""}
Today: ${new Date().toDateString()}
Be concise, encouraging, and doctoral-level. Reference actual assignments/milestones when relevant.`;
    const userMsg={role:"user",content:text};
    const hist=[...chatMessages,userMsg];
    setChatMessages(hist);setChatInput("");setChatLoading(true);
    const api=[{role:"user",content:`[CTX]\n${ctx}\n[/CTX]\nAcknowledge briefly.`},{role:"assistant",content:"Got it — full context loaded including dissertation milestones."}, ...hist.filter((_,i)=>i>0)];
    try{const r=await callClaudeChat(api);setChatMessages(p=>[...p,{role:"assistant",content:r}]);}
    catch{setChatMessages(p=>[...p,{role:"assistant",content:"Connection issue. Try again."}]);}
    setChatLoading(false);
  }

  // ── Calendar ──────────────────────────────────────────────────────────────────
  function getEventsForDay(y,m,d){const k=dateKey(y,m,d);return{asgn:assignments.filter(a=>a.due===k),study:studyBlocks.filter(b=>b.date===k),travel:travelDates.find(tr=>k>=tr.start&&k<=tr.end),milestone:milestones.find(ms=>ms.due===k)};}
  function prevMonth(){calMonth===0?(setCalYear(y=>y-1),setCalMonth(11)):setCalMonth(m=>m-1);}
  function nextMonth(){calMonth===11?(setCalYear(y=>y+1),setCalMonth(0)):setCalMonth(m=>m+1);}

  function addAssignment(){if(!newAssign.title||!newAssign.due)return notify("Fill in title and due date.");setAssignments(p=>[...p,{...newAssign,id:Date.now(),done:false,flashcards:[],topics:""}]);setShowAddAssign(false);setNewAssign({courseId:courses[0]?.id||1,title:"",due:"",type:"paper",estHours:4});notify("Assignment added!");}
  function addCourse(){if(!newCourse.name)return notify("Enter a course name.");setCourses(p=>[...p,{...newCourse,id:Date.now(),rmpData:null}]);setShowAddCourse(false);setNewCourse({name:"",difficulty:3,color:"#6366f1",professor:""});notify("Course added!");}
  function addMilestone(){if(!newMilestone.title||!newMilestone.due)return notify("Fill title and date.");setMilestones(p=>[...p,{...newMilestone,id:Date.now(),done:false}]);setShowAddMilestone(false);setNewMilestone({title:"",due:"",notes:""});notify("Milestone added!");}
  function toggleDone(id){setAssignments(p=>p.map(a=>a.id===id?{...a,done:!a.done}:a));}
  function deleteAssignment(id){if(window.confirm("Delete this assignment?"))setAssignments(p=>p.filter(a=>a.id!==id));}
  function deleteCourse(id){if(window.confirm("Delete this course and all its assignments?")){{setCourses(p=>p.filter(c=>c.id!==id));setAssignments(p=>p.filter(a=>a.courseId!==id));}}}
  function toggleMilestoneDone(id){setMilestones(p=>p.map(m=>m.id===id?{...m,done:!m.done}:m));}

  const upcoming=assignments.filter(a=>!a.done).sort((a,b)=>new Date(a.due)-new Date(b.due)).slice(0,5);
  const overdue=assignments.filter(a=>!a.done&&daysUntil(a.due)<0);
  const todayStudy=studyBlocks.filter(b=>b.date===dateKey(t.year,t.month,t.day));
  const nextMilestone=milestones.filter(m=>!m.done).sort((a,b)=>new Date(a.due)-new Date(b.due))[0];
  const calDays=getCalendarDays(calYear,calMonth);

  const NAV=[
    {id:"dashboard",   icon:"◈",label:"Dashboard"   },
    {id:"calendar",    icon:"◷",label:"Calendar"    },
    {id:"assignments", icon:"◉",label:"Assignments" },
    {id:"courses",     icon:"◎",label:"Courses"     },
    {id:"dissertation",icon:"⬟",label:"Dissertation"},
    {id:"flashcards",  icon:"⬡",label:"Flashcards"  },
    {id:"settings",    icon:"◌",label:"Settings"    },
  ];

  // ─── CSS ──────────────────────────────────────────────────────────────────────
  const css=`
    *{box-sizing:border-box;margin:0;padding:0;}
    ::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:${T.scrollThumb};border-radius:3px;}
    input,select,textarea{font-family:inherit;}button{cursor:pointer;font-family:inherit;}
    .fi{animation:fi .25s ease;}@keyframes fi{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
    .card{background:${T.card};border:1px solid ${T.border};border-radius:12px;padding:18px;transition:background .25s,border .25s;}
    .bp{background:${T.accent};color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;transition:all .2s;font-family:inherit;}
    .bp:hover{filter:brightness(1.1);}
    .bp2{background:${T.accent2};color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;transition:all .2s;font-family:inherit;}
    .bg2{background:transparent;color:${T.muted};border:1px solid ${T.border2};border-radius:8px;padding:7px 13px;font-size:12px;transition:all .2s;font-family:inherit;}
    .bg2:hover{border-color:${T.accent};color:${T.text};}
    .tag{display:inline-block;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;}
    .ifield{background:${T.inputBg};border:1px solid ${T.border2};border-radius:8px;padding:8px 12px;color:${T.text};font-size:13px;width:100%;outline:none;transition:border-color .2s;}.ifield:focus{border-color:${T.accent};}
    .mo{position:fixed;inset:0;background:${T.overlay};display:flex;align-items:center;justify-content:center;z-index:200;}
    .md{background:${T.card};border:1px solid ${T.border2};border-radius:16px;padding:24px;width:min(93vw,520px);max-height:90vh;overflow-y:auto;}
    .nb{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:8px;border:1px solid transparent;font-size:13px;text-align:left;transition:all .2s;width:100%;background:transparent;}.nb:hover{background:${T.hoverBg};}
    .flip-card{perspective:800px;width:100%;height:200px;cursor:pointer;}
    .flip-inner{position:relative;width:100%;height:100%;transition:transform .5s;transform-style:preserve-3d;}
    .flip-inner.flipped{transform:rotateY(180deg);}
    .flip-face{position:absolute;inset:0;backface-visibility:hidden;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center;}
    .flip-back{transform:rotateY(180deg);}
    @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
    .energy-btn{width:36px;height:36px;border-radius:50%;border:2px solid;font-size:16px;display:flex;align-items:center;justify-content:center;transition:all .15s;}
    .prog-bar{background:${T.border};border-radius:4px;height:5px;overflow:hidden;}
    .prog-fill{height:100%;border-radius:4px;transition:width .4s;}
    .milestone-row{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid ${T.border};}
    .travel-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:12px;font-size:11px;background:rgba(${hexToRgb(T.accentLight)},.2);color:${T.accentLight};border:1px solid rgba(${hexToRgb(T.accentLight)},.4);}
  `;

  const accentRgb=hexToRgb(T.accent);

  // ─── JSX ──────────────────────────────────────────────────────────────────────
  return (
    <div style={{fontFamily:"'Georgia','Times New Roman',serif",height:"100vh",display:"flex",flexDirection:"column",background:T.bg,color:T.text,transition:"background .25s,color .25s"}}>
      <style>{css}</style>

      {/* Toast */}
      {notification&&<div style={{position:"fixed",top:16,right:16,background:T.success,color:"#fff",padding:"10px 18px",borderRadius:10,zIndex:999,fontSize:13,boxShadow:`0 4px 20px rgba(${hexToRgb(T.success)},.4)`,animation:"fi .3s ease"}}>{notification}</div>}

      {/* University picker modal */}
      {showUniPicker&&(
        <div className="mo" onClick={()=>setUniPicker(false)}>
          <div className="md fi" onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,fontSize:17,marginBottom:16}}>Select Your University</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {UNIVERSITIES.map(u=>(
                <div key={u.id} onClick={()=>{if(u.id==="custom"){setUni({...u,...customUni});}else{setUni(u);}setUniPicker(false);notify(`Theme updated: ${u.name}`);}} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,cursor:"pointer",border:`2px solid ${uni.id===u.id?u.primary:T.border2}`,background:uni.id===u.id?`rgba(${hexToRgb(u.primary)},.1)`:"transparent",transition:"all .2s"}}>
                  <div style={{width:28,height:28,borderRadius:6,background:u.primary,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>{u.logo}</div>
                  <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>{u.name}</div><div style={{fontSize:11,color:T.muted}}>{u.abbr}</div></div>
                  <div style={{display:"flex",gap:4}}>
                    {[u.primary,u.secondary,u.accent].map((c,i)=><div key={i} style={{width:14,height:14,borderRadius:3,background:c}}/>)}
                  </div>
                </div>
              ))}
              {/* Custom university */}
              <div style={{marginTop:8,padding:14,border:`1px solid ${T.border2}`,borderRadius:10}}>
                <div style={{fontSize:12,fontWeight:600,marginBottom:8,color:T.muted}}>Custom University</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <input className="ifield" placeholder="University name" value={customUni.name} onChange={e=>setCustomUni(c=>({...c,name:e.target.value}))} style={{fontSize:12}}/>
                  <input className="ifield" placeholder="Abbreviation" value={customUni.abbr} onChange={e=>setCustomUni(c=>({...c,abbr:e.target.value}))} style={{fontSize:12}}/>
                </div>
                <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center"}}>
                  <label style={{fontSize:11,color:T.muted}}>Primary</label><input type="color" value={customUni.primary} onChange={e=>setCustomUni(c=>({...c,primary:e.target.value}))} style={{width:32,height:28,border:"none",borderRadius:4,cursor:"pointer"}}/>
                  <label style={{fontSize:11,color:T.muted}}>Secondary</label><input type="color" value={customUni.secondary} onChange={e=>setCustomUni(c=>({...c,secondary:e.target.value}))} style={{width:32,height:28,border:"none",borderRadius:4,cursor:"pointer"}}/>
                  <label style={{fontSize:11,color:T.muted}}>Accent</label><input type="color" value={customUni.accent} onChange={e=>setCustomUni(c=>({...c,accent:e.target.value}))} style={{width:32,height:28,border:"none",borderRadius:4,cursor:"pointer"}}/>
                  <button className="bp" style={{marginLeft:"auto",fontSize:11,padding:"5px 12px"}} onClick={()=>{const u={...UNIVERSITIES.find(x=>x.id==="custom"),...customUni};setUni(u);setUniPicker(false);}}>Apply</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* ═══ SIDEBAR ═══ */}
        <aside style={{width:sidebarOpen?226:58,background:T.sidebar,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden",transition:"width .25s ease"}}>
          {/* Uni branding header */}
          <div style={{padding:"14px 9px 12px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:sidebarOpen?"space-between":"center",background:`linear-gradient(135deg,rgba(${hexToRgb(T.accent)},.12),rgba(${hexToRgb(T.accent2)},.08))`}}>
            {sidebarOpen&&(
              <div style={{overflow:"hidden",marginRight:5,cursor:"pointer"}} onClick={()=>setUniPicker(true)}>
                <div style={{fontSize:9,letterSpacing:3,color:T.accent,textTransform:"uppercase",fontWeight:700,whiteSpace:"nowrap"}}>{uni.abbr} · {dark?"Dark":"Light"}</div>
                <div style={{fontSize:17,fontWeight:700,color:T.text,whiteSpace:"nowrap"}}>{uni.logo} ProPlanner</div>
              </div>
            )}
            <button onClick={()=>setSidebar(o=>!o)} style={{background:"transparent",border:`1px solid ${T.border2}`,borderRadius:7,width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",color:T.muted,fontSize:11,flexShrink:0}}>{sidebarOpen?"←":"→"}</button>
          </div>

          {/* Nav */}
          <nav style={{flex:1,padding:"9px 6px",display:"flex",flexDirection:"column",gap:2,overflowY:"auto"}}>
            {NAV.map(item=>(
              <button key={item.id} onClick={()=>setView(item.id)} title={item.label} className="nb" style={{background:view===item.id?T.navActive:"transparent",border:`1px solid ${view===item.id?T.navActiveBorder:"transparent"}`,color:view===item.id?T.accent:T.muted,justifyContent:sidebarOpen?"flex-start":"center"}}>
                <span style={{fontSize:16,flexShrink:0}}>{item.icon}</span>
                {sidebarOpen&&<span style={{whiteSpace:"nowrap",overflow:"hidden"}}>{item.label}</span>}
              </button>
            ))}
          </nav>

          {/* Overdue */}
          {overdue.length>0&&<div style={{margin:"0 6px 6px",background:"rgba(239,68,68,.12)",border:"1px solid rgba(239,68,68,.3)",borderRadius:8,padding:"7px 8px",overflow:"hidden"}}>
            <div style={{fontSize:10,color:T.danger,fontWeight:700,letterSpacing:1,whiteSpace:"nowrap"}}>⚠ {sidebarOpen?"OVERDUE":overdue.length}</div>
            {sidebarOpen&&<div style={{fontSize:11,color:T.danger,marginTop:1,opacity:.8}}>{overdue.length} item{overdue.length>1?"s":""}</div>}
          </div>}

          {/* Next milestone callout */}
          {nextMilestone&&sidebarOpen&&<div style={{margin:"0 6px 6px",background:`rgba(${accentRgb},.1)`,border:`1px solid rgba(${accentRgb},.25)`,borderRadius:8,padding:"7px 9px"}}>
            <div style={{fontSize:9,color:T.accent,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Next Milestone</div>
            <div style={{fontSize:11,fontWeight:600,marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{nextMilestone.title}</div>
            <div style={{fontSize:10,color:T.muted}}>{daysUntil(nextMilestone.due)}d away</div>
          </div>}

          {/* Bottom controls */}
          <div style={{padding:"8px 6px",borderTop:`1px solid ${T.border}`,display:"flex",flexDirection:"column",gap:4}}>
            <button onClick={()=>setUniPicker(true)} title="Change University" className="nb" style={{justifyContent:sidebarOpen?"flex-start":"center",color:T.muted,border:`1px solid ${T.border2}`,borderRadius:8,padding:"6px 9px"}}>
              <span style={{fontSize:14}}>🏛</span>{sidebarOpen&&<span style={{fontSize:12,whiteSpace:"nowrap"}}>Change University</span>}
            </button>
            <button onClick={()=>setDark(d=>!d)} title="Toggle Theme" className="nb" style={{justifyContent:sidebarOpen?"flex-start":"center",color:T.muted,border:`1px solid ${T.border2}`,borderRadius:8,padding:"6px 9px"}}>
              <span style={{fontSize:14}}>{dark?"☀️":"🌙"}</span>{sidebarOpen&&<span style={{fontSize:12,whiteSpace:"nowrap"}}>{dark?"Light Mode":"Dark Mode"}</span>}
            </button>
            <button onClick={()=>setChatOpen(o=>!o)} title="AI Assistant" className="nb" style={{justifyContent:sidebarOpen?"flex-start":"center",background:chatOpen?`rgba(${accentRgb},.15)`:"transparent",border:`1px solid ${chatOpen?T.accent:T.border2}`,borderRadius:8,padding:"6px 9px",color:chatOpen?T.accent:T.muted}}>
              <span style={{fontSize:14}}>🤖</span>{sidebarOpen&&<span style={{fontSize:12,whiteSpace:"nowrap"}}>AI Assistant</span>}
            </button>
          </div>
        </aside>

        {/* ═══ MAIN ═══ */}
        <main style={{flex:1,overflowY:"auto",padding:"22px 26px",minWidth:0}}>

          {/* ── DASHBOARD ── */}
          {view==="dashboard"&&(
            <div className="fi">
              {/* Header with university color accent */}
              <div style={{marginBottom:18,paddingBottom:16,borderBottom:`2px solid rgba(${accentRgb},.2)`}}>
                <div style={{fontSize:10,letterSpacing:3,color:T.accent,textTransform:"uppercase"}}>Good {new Date().getHours()<12?"Morning":"Afternoon"} — {uni.name}</div>
                <h1 style={{fontSize:26,fontWeight:700,marginTop:3}}>Professional Study Dashboard</h1>
                <div style={{color:T.muted,marginTop:3,fontSize:13}}>{MONTHS[t.month]} {t.day}, {t.year}</div>
              </div>

              {/* Stats */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:10,marginBottom:18}}>
                {[
                  {label:"Courses",         value:courses.length,                                   color:T.accent},
                  {label:"Pending",         value:assignments.filter(a=>!a.done).length,            color:T.warning},
                  {label:"Study Hrs/Wk",   value:studyBlocks.filter(b=>{const d=new Date(b.date),n=new Date();return d>=n&&(d-n)<7*86400000;}).length*2,color:T.accent2||"#0ea5e9"},
                  {label:"Milestones",      value:milestones.filter(m=>!m.done).length,             color:"#a78bfa"},
                  {label:"Completed",       value:assignments.filter(a=>a.done).length,             color:T.success},
                ].map(s=>(
                  <div key={s.label} className="card" style={{textAlign:"center",borderTop:`2px solid ${s.color}`}}>
                    <div style={{fontSize:28,fontWeight:700,color:s.color}}>{s.value}</div>
                    <div style={{fontSize:9,color:T.muted,marginTop:2,letterSpacing:1,textTransform:"uppercase"}}>{s.label}</div>
                  </div>
                ))}
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
                {/* Upcoming */}
                <div className="card">
                  <div style={{fontSize:10,letterSpacing:2,color:T.accent,textTransform:"uppercase",marginBottom:11}}>Upcoming Deadlines</div>
                  {upcoming.length===0&&<div style={{color:T.faint,fontSize:13}}>All caught up! 🎉</div>}
                  {upcoming.map(a=>{const course=courses.find(c=>c.id===a.courseId);const days=daysUntil(a.due);return(
                    <div key={a.id} style={{display:"flex",alignItems:"center",gap:9,padding:"7px 0",borderBottom:`1px solid ${T.border}`}}>
                      <div style={{width:3,height:30,borderRadius:2,background:course?.color||T.accent,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.title}</div><div style={{fontSize:10,color:T.muted}}>{course?.name?.split("–")[0].trim()}</div></div>
                      <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:11,fontWeight:700,color:urgencyColor(days,T)}}>{days<0?"Overdue":days===0?"Today!":`${days}d`}</div></div>
                    </div>
                  );})}
                </div>

                {/* Today + Energy */}
                <div className="card">
                  <div style={{fontSize:10,letterSpacing:2,color:T.accent2||"#0ea5e9",textTransform:"uppercase",marginBottom:11}}>Today</div>
                  {todayStudy.length===0&&<div style={{color:T.faint,fontSize:12,marginBottom:8}}>No study sessions today.</div>}
                  {todayStudy.slice(0,3).map(b=>(
                    <div key={b.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:`1px solid ${T.border}`}}>
                      <div style={{width:28,height:28,borderRadius:6,background:b.color+"33",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>📚</div>
                      <div><div style={{fontSize:12,fontWeight:600}}>{b.title}</div><div style={{fontSize:10,color:T.muted}}>{b.slot}</div></div>
                    </div>
                  ))}
                  {/* Energy tracker */}
                  <div style={{marginTop:10,padding:10,background:T.subcard,borderRadius:8,border:`1px solid ${T.border2}`}}>
                    <div style={{fontSize:10,color:T.muted,marginBottom:6,letterSpacing:1,textTransform:"uppercase"}}>Today's Energy Level</div>
                    <div style={{display:"flex",gap:6}}>
                      {[1,2,3,4,5].map(lvl=>{
                        const todayE=energyLog.find(e=>e.date===dateKey(t.year,t.month,t.day));
                        const colors=["#ef4444","#f97316","#eab308","#84cc16","#22c55e"];
                        const emojis=["😴","😓","😐","😊","🚀"];
                        const active=todayE?.level===lvl;
                        return <button key={lvl} className="energy-btn" onClick={()=>{const k=dateKey(t.year,t.month,t.day);setEnergyLog(p=>[...p.filter(e=>e.date!==k),{date:k,level:lvl}]);}} style={{background:active?colors[lvl-1]+"33":"transparent",borderColor:active?colors[lvl-1]:T.border2,color:active?colors[lvl-1]:T.faint,cursor:"pointer"}}>{emojis[lvl-1]}</button>;
                      })}
                      <span style={{fontSize:10,color:T.faint,alignSelf:"center",marginLeft:4}}>{energyLog.find(e=>e.date===dateKey(t.year,t.month,t.day))?`Level ${energyLog.find(e=>e.date===dateKey(t.year,t.month,t.day)).level}/5`:"Log it"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dissertation progress + travel strip */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginTop:14}}>
                <div className="card" style={{borderLeft:`3px solid ${T.accent}`}}>
                  <div style={{fontSize:10,letterSpacing:2,color:T.accent,textTransform:"uppercase",marginBottom:10}}>Dissertation Progress</div>
                  {nextMilestone?(
                    <>
                      <div style={{fontWeight:600,fontSize:14,marginBottom:4}}>{nextMilestone.title}</div>
                      <div style={{fontSize:12,color:T.muted,marginBottom:8}}>{nextMilestone.notes}</div>
                      <div className="prog-bar"><div className="prog-fill" style={{width:`${Math.round(milestones.filter(m=>m.done).length/milestones.length*100)}%`,background:T.accent}}/></div>
                      <div style={{fontSize:11,color:T.muted,marginTop:5}}>{milestones.filter(m=>m.done).length}/{milestones.length} milestones · {daysUntil(nextMilestone.due)}d to next</div>
                    </>
                  ):<div style={{color:T.faint,fontSize:13}}>Add dissertation milestones →</div>}
                  <button className="bg2" style={{marginTop:10,fontSize:11}} onClick={()=>setView("dissertation")}>View all milestones →</button>
                </div>
                <div className="card">
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{fontSize:10,letterSpacing:2,color:T.accentLight,textTransform:"uppercase"}}>Travel / Blackout Dates</div>
                    <button className="bg2" style={{fontSize:11}} onClick={()=>setShowAddTravel(true)}>+ Add</button>
                  </div>
                  {travelDates.length===0&&<div style={{color:T.faint,fontSize:12}}>No travel blocked. Study sessions will be scheduled normally.</div>}
                  {travelDates.map((tr,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:`1px solid ${T.border}`}}>
                      <span className="travel-badge">✈ {tr.label||"Travel"}</span>
                      <span style={{fontSize:11,color:T.muted}}>{tr.start} → {tr.end}</span>
                      <button onClick={()=>setTravelDates(p=>p.filter((_,j)=>j!==i))} style={{marginLeft:"auto",background:"transparent",border:"none",color:T.faint,fontSize:13,cursor:"pointer"}}>✕</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Syllabus upload */}
              <div style={{marginTop:14,padding:14,background:T.subcard,border:`1px dashed ${T.border2}`,borderRadius:10,display:"flex",alignItems:"center",gap:14}}>
                <div style={{fontSize:26}}>📄</div>
                <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>Import Syllabus</div><div style={{fontSize:12,color:T.muted}}>Upload a .txt or PDF — AI extracts all assignments, dates, and topics automatically</div></div>
                <label style={{cursor:"pointer"}}><input type="file" accept=".txt,.pdf,.docx" onChange={handleSyllabusUpload} style={{display:"none"}}/><span className="bp" style={{fontSize:12,padding:"7px 14px",display:"inline-block"}}>{uploading?"Analyzing…":"Upload Syllabus"}</span></label>
                {uploadMsg&&<div style={{fontSize:11,color:uploadMsg.startsWith("✓")?T.success:T.warning}}>{uploadMsg}</div>}
              </div>
            </div>
          )}

          {/* ── CALENDAR ── */}
          {view==="calendar"&&(
            <div className="fi">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <div><div style={{fontSize:10,letterSpacing:3,color:T.accent,textTransform:"uppercase"}}>Calendar</div><h1 style={{fontSize:23,fontWeight:700}}>{MONTHS[calMonth]} {calYear}</h1></div>
                <div style={{display:"flex",gap:6}}><button className="bg2" onClick={prevMonth}>←</button><button className="bg2" onClick={()=>{setCalYear(t.year);setCalMonth(t.month);}}>Today</button><button className="bg2" onClick={nextMonth}>→</button></div>
              </div>
              <div style={{display:"flex",gap:12,marginBottom:8,fontSize:11,color:T.muted,flexWrap:"wrap"}}>
                <span><span style={{display:"inline-block",width:8,height:8,borderRadius:2,background:T.accent,marginRight:4}}/>Due</span>
                <span><span style={{display:"inline-block",width:8,height:8,borderRadius:2,background:T.accent2||"#0ea5e9",marginRight:4}}/>Study</span>
                <span><span style={{display:"inline-block",width:8,height:8,borderRadius:2,background:"#a78bfa",marginRight:4}}/>Milestone</span>
                <span><span style={{display:"inline-block",width:8,height:8,borderRadius:2,background:T.accentLight,marginRight:4}}/>Travel</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:3}}>
                {DAYS_SHORT.map(d=><div key={d} style={{textAlign:"center",fontSize:10,color:T.faint,letterSpacing:1,textTransform:"uppercase",padding:"2px 0"}}>{d}</div>)}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
                {calDays.map((day,i)=>{
                  if(!day)return<div key={i}/>;
                  const{asgn,study,travel,milestone}=getEventsForDay(calYear,calMonth,day);
                  const isToday=calYear===t.year&&calMonth===t.month&&day===t.day;
                  const isSel=selectedDay===day;
                  return(
                    <div key={i} onClick={()=>setSelectedDay(isSel?null:day)} style={{minHeight:62,padding:4,borderRadius:7,cursor:"pointer",background:travel?(dark?"#1a1510":"#fff8ee"):isSel?(dark?"#1e1e35":"#ebebff"):isToday?(dark?"#16162a":"#f0f0ff"):(dark?"#12121a":T.card),border:`1px solid ${isToday?T.accent:T.border}`,transition:"all .15s",opacity:travel?.7:1}}>
                      <div style={{fontSize:11,fontWeight:isToday?700:400,color:isToday?T.accent:T.text,marginBottom:2}}>{day}{travel&&<span style={{fontSize:8,marginLeft:2}}>✈</span>}</div>
                      {milestone&&<div style={{fontSize:9,padding:"1px 3px",borderRadius:3,background:"rgba(167,139,250,.25)",color:"#a78bfa",marginBottom:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>⬟{milestone.title}</div>}
                      {asgn.map(a=><div key={a.id} style={{fontSize:9,padding:"1px 3px",borderRadius:3,background:`rgba(${hexToRgb(courses.find(c=>c.id===a.courseId)?.color||T.accent)},.25)`,color:courses.find(c=>c.id===a.courseId)?.color||T.accent,marginBottom:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>📌{a.title}</div>)}
                      {study.slice(0,1).map(b=><div key={b.id} style={{fontSize:9,padding:"1px 3px",borderRadius:3,background:`rgba(${hexToRgb(T.accent2||"#0ea5e9")},.2)`,color:T.accent2||"#0ea5e9",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>📚{b.title.replace("Study: ","")}</div>)}
                    </div>
                  );
                })}
              </div>
              {selectedDay&&(()=>{const{asgn,study,travel,milestone}=getEventsForDay(calYear,calMonth,selectedDay);return(
                <div className="card fi" style={{marginTop:12}}>
                  <div style={{fontWeight:700,marginBottom:8}}>{MONTHS[calMonth]} {selectedDay}</div>
                  {travel&&<div style={{marginBottom:8}}><span className="travel-badge">✈ {travel.label} · Studying blocked</span></div>}
                  {milestone&&<div style={{padding:"8px 10px",background:"rgba(167,139,250,.1)",borderRadius:7,marginBottom:8,border:"1px solid rgba(167,139,250,.3)"}}><div style={{fontWeight:600,color:"#a78bfa"}}>⬟ Milestone: {milestone.title}</div><div style={{fontSize:11,color:T.muted}}>{milestone.notes}</div></div>}
                  {asgn.length===0&&study.length===0&&!travel&&!milestone&&<div style={{color:T.faint}}>Nothing scheduled.</div>}
                  {asgn.map(a=>{const c=courses.find(x=>x.id===a.courseId);return(<div key={a.id} style={{display:"flex",gap:9,padding:"6px 0",borderBottom:`1px solid ${T.border}`,alignItems:"center"}}><span style={{color:c?.color,fontSize:13}}>📌</span><div style={{flex:1}}><div style={{fontWeight:600,fontSize:12}}>{a.title}</div><div style={{fontSize:10,color:T.muted}}>{c?.name}</div></div><button className="bp" style={{fontSize:11,padding:"3px 9px"}} onClick={()=>{setShowFlashModal(a.id);setView("flashcards");}}>⬡</button></div>);})}
                  {study.map(b=>(<div key={b.id} style={{display:"flex",gap:9,padding:"6px 0",borderBottom:`1px solid ${T.border}`}}><span style={{fontSize:13}}>📚</span><div><div style={{fontWeight:600,fontSize:12}}>{b.title}</div><div style={{fontSize:10,color:T.muted}}>{b.slot}</div></div></div>))}
                </div>
              );})()} 
            </div>
          )}

          {/* ── ASSIGNMENTS ── */}
          {view==="assignments"&&(
            <div className="fi">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                <div><div style={{fontSize:10,letterSpacing:3,color:T.accent,textTransform:"uppercase"}}>Assignments</div><h1 style={{fontSize:23,fontWeight:700}}>All Assignments</h1></div>
                <div style={{display:"flex",gap:7}}>
                  <label style={{cursor:"pointer"}}><input type="file" accept=".txt,.pdf,.docx" onChange={handleSyllabusUpload} style={{display:"none"}}/><span className="bg2" style={{display:"inline-block"}}>📄 Upload</span></label>
                  <button className="bp" onClick={()=>setShowAddAssign(true)}>+ Add</button>
                </div>
              </div>
              {courses.map(course=>{
                const ca=assignments.filter(a=>a.courseId===course.id);if(!ca.length)return null;
                return(<div key={course.id} style={{marginBottom:18}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                    <div style={{width:10,height:10,borderRadius:3,background:course.color}}/>
                    <div style={{fontWeight:700,fontSize:13}}>{course.name}</div>
                    {course.rmpData&&<span style={{fontSize:10,color:T.accentLight}}>⭐{course.rmpData.avgRating?.toFixed(1)} · 🔥{course.rmpData.avgDifficulty?.toFixed(1)}</span>}
                  </div>
                  {ca.sort((a,b)=>new Date(a.due)-new Date(b.due)).map(a=>{
                    const days=daysUntil(a.due);const sh=studyBlocks.filter(b=>b.assignId===a.id).length*2;const hasCards=a.flashcards?.length>0;
                    return(<div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:dark?"#12121a":T.card,border:`1px solid ${T.border}`,borderRadius:8,marginBottom:4,opacity:a.done?.5:1}}>
                      <input type="checkbox" checked={a.done} onChange={()=>toggleDone(a.id)} style={{width:15,height:15,accentColor:course.color,cursor:"pointer"}}/>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600,textDecoration:a.done?"line-through":"none",fontSize:13}}>{a.title}</div>
                        <div style={{fontSize:10,color:T.muted,marginTop:2}}>
                          <span className="tag" style={{background:course.color+"22",color:course.color,marginRight:6}}>{a.type}</span>
                          Est. {a.estHours}h · {sh}h study
                          {hasCards&&<span style={{marginLeft:7,color:"#a78bfa"}}>⬡{a.flashcards.length} cards</span>}
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:7}}>
                        <<button onClick={()=>{setShowFlashModal(a.id);setView("flashcards");}} style={{background:"transparent",border:`1px solid ${hasCards?"#a78bfa":T.border2}`,borderRadius:6,padding:"3px 8px",fontSize:11,color:hasCards?"#a78bfa":T.muted}}>{hasCards?"⬡ Cards":"⬡ Gen"}</button> <button onClick={()=>deleteAssignment(a.id)} style={{background:"transparent",border:`1px solid ${T.border2}`,borderRadius:6,padding:"3px 8px",fontSize:11,color:T.danger}} title="Delete assignment">🗑</button>
<button onClick={()=>deleteAssignment(a.id)} style={{background:"transparent",border:`1px solid ${T.border2}`,borderRadius:6,padding:"3px 8px",fontSize:11,color:T.danger}} title="Delete assignment">🗑</button>
                        <div style={{textAlign:"right"}}><div style={{fontSize:11,fontWeight:700,color:a.done?T.faint:urgencyColor(days,T)}}>{a.done?"Done":days<0?"Overdue":days===0?"Today!":`${days}d`}</div><div style={{fontSize:10,color:T.faint}}>{a.due}</div></div>
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
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                <div><div style={{fontSize:10,letterSpacing:3,color:T.accent,textTransform:"uppercase"}}>Enrolled</div><h1 style={{fontSize:23,fontWeight:700}}>Courses</h1></div>
                <button className="bp" onClick={()=>setShowAddCourse(true)}>+ Add Course</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:13}}>
                {courses.map(c=>{
                  const total=assignments.filter(a=>a.courseId===c.id).length;
                  const done=assignments.filter(a=>a.courseId===c.id&&a.done).length;
                  const pct=total>0?Math.round(done/total*100):0;
                  const next=assignments.filter(a=>a.courseId===c.id&&!a.done).sort((a,b)=>new Date(a.due)-new Date(b.due))[0];
                  const rmp=c.rmpData;
                  return(<div key={c.id} className="card" style={{borderTop:`3px solid ${c.color}`}}>
                    <div style={{fontWeight:700,fontSize:14,marginBottom:3}}>{c.name}</div>
                    {c.professor&&<div style={{fontSize:11,color:T.muted,marginBottom:8}}>👤 {c.professor}</div>}
                    {rmp?(
                      <div style={{background:T.subcard,borderRadius:8,padding:"9px 11px",marginBottom:9,border:`1px solid ${T.border2}`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                          <div style={{fontSize:12,fontWeight:600}}>{rmp.firstName} {rmp.lastName}</div>
                          <a href={`https://www.ratemyprofessors.com/professor/${rmp.id}`} target="_blank" rel="noreferrer" style={{fontSize:10,color:T.accent,textDecoration:"none"}}>RMP →</a>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4,textAlign:"center"}}>
                          {[{label:"Rating",val:rmp.avgRating?.toFixed(1),color:rmp.avgRating>=4?T.success:rmp.avgRating>=3?T.caution:T.danger},
                            {label:"Difficulty",val:rmp.avgDifficulty?.toFixed(1),color:rmp.avgDifficulty>=4?T.danger:rmp.avgDifficulty>=3?T.caution:T.success},
                            {label:"Again %",val:Math.round(rmp.wouldTakeAgainPercent||0)+"%",color:T.success}
                          ].map(x=><div key={x.label} style={{background:T.card,borderRadius:6,padding:"5px 3px"}}>
                            <div style={{fontSize:15,fontWeight:700,color:x.color}}>{x.val}</div>
                            <div style={{fontSize:9,color:T.muted}}>{x.label}</div>
                          </div>)}
                        </div>
                        <div style={{fontSize:10,color:"#a78bfa",marginTop:5,textAlign:"center"}}>📊 Difficulty blended into study schedule</div>
                      </div>
                    ):(
                      <div style={{marginBottom:9}}>
                        <div style={{display:"flex",gap:5,marginBottom:5}}>
                          <input className="ifield" placeholder="Professor name…" value={c.professor} onChange={e=>setCourses(p=>p.map(x=>x.id===c.id?{...x,professor:e.target.value}:x))} style={{flex:1,fontSize:11,padding:"5px 9px"}}/>
                          <button className="bg2" style={{fontSize:11,whiteSpace:"nowrap"}} onClick={()=>handleRmpSearch(c.id,c.professor)}>{rmpSearching[c.id]?"…":"Search RMP"}</button>
                        </div>
                        <button className="bg2" style={{width:"100%",fontSize:11}} onClick={()=>window.open(`https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent((c.professor||c.name)+" "+uni.abbr)}`,"_blank")}>🔗 Open RateMyProfessors.com</button>
                        {rmpResults[c.id]&&rmpResults[c.id]!=="notfound"&&rmpResults[c.id].length>0&&(
                          <div style={{marginTop:7,display:"flex",flexDirection:"column",gap:4}}>
                            {rmpResults[c.id].map(prof=>(
                              <div key={prof.id} onClick={()=>applyRmp(c.id,prof)} style={{padding:"7px 9px",background:T.card,border:`1px solid ${T.border2}`,borderRadius:7,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.accent} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border2}>
                                <div style={{fontSize:12,fontWeight:600}}>{prof.firstName} {prof.lastName}</div>
                                <div style={{fontSize:10,color:T.muted,marginTop:2}}>⭐{prof.avgRating?.toFixed(1)} · 🔥{prof.avgDifficulty?.toFixed(1)} · {prof.numRatings} ratings</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {rmpResults[c.id]==="notfound"&&<div style={{marginTop:6,fontSize:11,color:T.warning,padding:"6px 9px",background:"rgba(245,158,11,.1)",borderRadius:6}}>No results found. Try the direct link above.</div>}
                      </div>
                    )}
                    <div className="prog-bar" style={{marginBottom:5}}><div className="prog-fill" style={{width:`${pct}%`,background:c.color}}/></div>
                    <div style={{fontSize:10,color:T.muted,marginBottom:next?8:0}}>{done}/{total} complete · {"★".repeat(c.difficulty)}{"☆".repeat(5-c.difficulty)}</div>
                    {next&&<div style={{fontSize:11,padding:"5px 8px",background:T.subcard,borderRadius:6}}>Next: <span style={{color:c.color,fontWeight:600}}>{next.title}</span> · {daysUntil(next.due)}d</div>}
                  </div>);
                })}
              </div>
            </div>
          )}

          {/* ── DISSERTATION ── */}
          {view==="dissertation"&&(
            <div className="fi">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                <div><div style={{fontSize:10,letterSpacing:3,color:T.accent,textTransform:"uppercase"}}>Doctoral Journey</div><h1 style={{fontSize:23,fontWeight:700}}>Dissertation Tracker</h1></div>
                <div style={{display:"flex",gap:7}}>
                  <button className="bg2" style={{fontSize:11}} onClick={()=>setShowReflection(true)}>📝 Weekly Reflection</button>
                  <button className="bp" onClick={()=>setShowAddMilestone(true)}>+ Milestone</button>
                </div>
              </div>

              {/* Progress overview */}
              <div className="card" style={{marginBottom:14,borderLeft:`3px solid ${T.accent}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{fontWeight:700}}>Overall Progress</div>
                  <div style={{fontSize:13,color:T.accent,fontWeight:600}}>{milestones.filter(m=>m.done).length}/{milestones.length} milestones</div>
                </div>
                <div className="prog-bar" style={{height:8,marginBottom:8}}><div className="prog-fill" style={{width:`${Math.round(milestones.filter(m=>m.done).length/milestones.length*100)||0}%`,background:T.accent}}/></div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {milestones.map((m,idx)=>(
                    <div key={m.id} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:m.done?T.success:idx===milestones.filter(x=>x.done).length?T.accent:T.faint}}>
                      <span>{m.done?"✓":idx===milestones.filter(x=>x.done).length?"→":"○"}</span>
                      <span>{m.title}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Milestone list */}
              <div className="card">
                <div style={{fontSize:10,letterSpacing:2,color:T.accent,textTransform:"uppercase",marginBottom:12}}>All Milestones</div>
                {milestones.sort((a,b)=>new Date(a.due)-new Date(b.due)).map((m,idx)=>{
                  const days=daysUntil(m.due);const isNext=!m.done&&milestones.filter(x=>!x.done)[0]?.id===m.id;
                  return(<div key={m.id} className="milestone-row" style={{opacity:m.done?.6:1}}>
                    <div style={{flexShrink:0,marginTop:2}}>
                      <div onClick={()=>toggleMilestoneDone(m.id)} style={{width:20,height:20,borderRadius:50,border:`2px solid ${m.done?T.success:isNext?T.accent:T.border2}`,background:m.done?T.success:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:11,color:"#fff",transition:"all .2s"}}>{m.done?"✓":""}</div>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:13,textDecoration:m.done?"line-through":"none"}}>{m.title}</div>
                      {m.notes&&<div style={{fontSize:11,color:T.muted,marginTop:2}}>{m.notes}</div>}
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:11,fontWeight:700,color:m.done?T.success:urgencyColor(days,T)}}>{m.done?"Complete":days<0?"Overdue":days===0?"Today!":days<=30?`${days}d`:`${Math.round(days/30)}mo`}</div>
                      <div style={{fontSize:10,color:T.faint}}>{m.due}</div>
                      {isNext&&<span style={{fontSize:9,background:`rgba(${accentRgb},.15)`,color:T.accent,padding:"1px 5px",borderRadius:10,border:`1px solid rgba(${accentRgb},.3)`}}>NEXT</span>}
                    </div>
                  </div>);
                })}
              </div>

              {/* Weekly reflection panel */}
              {showReflection&&(
                <div className="card fi" style={{marginTop:14,border:`1px solid rgba(${accentRgb},.3)`}}>
                  <div style={{fontWeight:700,marginBottom:10}}>📝 Weekly Reflection</div>
                  <div style={{fontSize:12,color:T.muted,marginBottom:10}}>Reflections improve doctoral outcomes. What did you accomplish? What's blocking you? What's your focus next week?</div>
                  <textarea className="ifield" rows={5} placeholder="This week I made progress on… A challenge I'm facing is… Next week I'll focus on…" value={weeklyReflection} onChange={e=>setWeeklyReflection(e.target.value)} style={{resize:"vertical",fontSize:12,marginBottom:10}}/>
                  <div style={{display:"flex",gap:8}}>
                    <button className="bp" style={{fontSize:12}} onClick={async()=>{
                      const prompt=`As a doctoral advisor, give brief, encouraging feedback on this weekly reflection from a DBA student. Note strengths and suggest one concrete next action.\n\nReflection: ${weeklyReflection}`;
                      try{const r=await callClaudeChat([{role:"user",content:prompt}]);notify("Feedback generated — check AI chat!");setChatMessages(p=>[...p,{role:"assistant",content:`📝 Reflection Feedback:\n\n${r}`}]);setChatOpen(true);}catch{notify("Could not generate feedback.");}
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
              <div style={{marginBottom:14}}><div style={{fontSize:10,letterSpacing:3,color:"#a78bfa",textTransform:"uppercase"}}>Study Tools</div><h1 style={{fontSize:23,fontWeight:700}}>Flashcards</h1></div>
              {!showFlashModal&&(
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:11}}>
                  {assignments.filter(a=>!a.done).map(a=>{
                    const course=courses.find(c=>c.id===a.courseId);const hasCards=a.flashcards?.length>0;const mastered=a.flashcards?.filter(c=>c.mastered).length||0;
                    return(<div key={a.id} onClick={()=>setShowFlashModal(a.id)} style={{padding:"13px",background:dark?"#12121a":T.card,border:`2px solid ${T.border}`,borderRadius:10,cursor:"pointer",transition:"all .2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor="#a78bfa"} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
                      <div style={{display:"flex",gap:6,marginBottom:5,alignItems:"center"}}><div style={{width:8,height:8,borderRadius:2,background:course?.color||T.accent}}/><span className="tag" style={{background:(course?.color||T.accent)+"22",color:course?.color||T.accent}}>{a.type}</span></div>
                      <div style={{fontWeight:600,fontSize:12,marginBottom:2}}>{a.title}</div>
                      <div style={{fontSize:10,color:T.muted,marginBottom:7}}>{course?.name?.split("–")[0].trim()}</div>
                      {hasCards?(<div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:11,color:"#a78bfa"}}>⬡{a.flashcards.length}</span>
                        <div className="prog-bar" style={{flex:1}}><div className="prog-fill" style={{width:`${Math.round(mastered/a.flashcards.length*100)}%`,background:T.success}}/></div>
                        <span style={{fontSize:10,color:T.success}}>{mastered}/{a.flashcards.length}</span>
                      </div>):<div style={{fontSize:10,color:T.faint}}>Click to generate →</div>}
                    </div>);
                  })}
                </div>
              )}
              {showFlashModal&&(()=>{
                const assign=assignments.find(a=>a.id===showFlashModal);const course=courses.find(c=>c.id===assign?.courseId);const cards=assign?.flashcards||[];const card=cards[activeCard];const mastered=cards.filter(c=>c.mastered).length;
                return(<div className="fi">
                  <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:14}}>
                    <button className="bg2" onClick={()=>{setShowFlashModal(null);setStudyMode(false);setActiveCard(0);setCardFlipped(false);}}>← Back</button>
                    <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14}}>{assign?.title}</div><div style={{fontSize:11,color:T.muted}}>{course?.name}</div></div>
                    {cards.length>0&&<div style={{fontSize:11,color:T.muted}}>{mastered}/{cards.length} mastered</div>}
                  </div>
                  {(!cards.length||!studyMode)&&(
                    <div className="card" style={{marginBottom:14}}>
                      <div style={{fontWeight:700,marginBottom:7}}>{cards.length?"Regenerate":"Generate"} Flashcards</div>
                      <div style={{fontSize:12,color:T.muted,marginBottom:9}}>Claude will create 12–16 doctoral-level flashcards for <strong>{assign?.title}</strong>. Paste notes or topics to improve quality.</div>
                      <textarea className="ifield" rows={3} placeholder="Optional: paste topics, lecture notes, or textbook chapters…" value={flashContext} onChange={e=>setFlashContext(e.target.value)} style={{resize:"vertical",marginBottom:9,fontSize:12}}/>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <button className="bp" onClick={()=>generateFlashcards(showFlashModal)} disabled={flashGenerating} style={{opacity:flashGenerating?.6:1}}>{flashGenerating?"⬡ Generating…":"⬡ Generate"}</button>
                        {cards.length>0&&<button className="bg2" onClick={()=>setStudyMode(true)}>Study existing →</button>}
                      </div>
                    </div>
                  )}
                  {cards.length>0&&studyMode&&(<div>
                    <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:11}}>
                      <div className="prog-bar" style={{flex:1,height:6}}><div className="prog-fill" style={{width:`${Math.round(mastered/cards.length*100)}%`,background:T.success}}/></div>
                      <span style={{fontSize:11,color:T.muted,whiteSpace:"nowrap"}}>{Math.round(mastered/cards.length*100)}%</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:10}}>
                      <button className="bg2" onClick={()=>{setActiveCard(i=>Math.max(0,i-1));setCardFlipped(false);}}>←</button>
                      <span style={{fontSize:12,color:T.muted,flex:1,textAlign:"center"}}>{activeCard+1} / {cards.length}</span>
                      <button className="bg2" onClick={()=>{setActiveCard(i=>Math.min(cards.length-1,i+1));setCardFlipped(false);}}>→</button>
                    </div>
                    {card&&<div style={{textAlign:"center",marginBottom:7}}><span className="tag" style={{background:"rgba(167,139,250,.15)",color:"#a78bfa"}}>{card.category}</span></div>}
                    {card&&(<div className="flip-card" onClick={()=>setCardFlipped(f=>!f)}>
                      <div className={`flip-inner${cardFlipped?" flipped":""}`}>
                        <div className="flip-face" style={{background:dark?"#16162a":"#f0eeff",border:`2px solid ${cardFlipped?T.border2:T.accent}`,borderRadius:14}}>
                          <div style={{fontSize:9,letterSpacing:2,color:T.accent,textTransform:"uppercase",marginBottom:9}}>Question / Term</div>
                          <div style={{fontSize:15,fontWeight:600,lineHeight:1.45,color:T.text}}>{card.front}</div>
                          <div style={{fontSize:10,color:T.faint,marginTop:10}}>Click to flip</div>
                        </div>
                        <div className="flip-face flip-back" style={{background:dark?"#0f2016":"#f0fff4",border:`2px solid ${T.success}`,borderRadius:14}}>
                          <div style={{fontSize:9,letterSpacing:2,color:T.success,textTransform:"uppercase",marginBottom:9}}>Answer</div>
                          <div style={{fontSize:13,lineHeight:1.55,color:T.text}}>{card.back}</div>
                        </div>
                      </div>
                    </div>)}
                    {card&&cardFlipped&&(<div style={{display:"flex",gap:9,marginTop:12,justifyContent:"center"}}>
                      <button onClick={()=>{toggleMastered(showFlashModal,card.id);setCardFlipped(false);setActiveCard(i=>Math.min(cards.length-1,i+1));}} style={{background:card.mastered?"rgba(34,197,94,.15)":"rgba(34,197,94,.08)",border:`1px solid ${T.success}`,color:T.success,borderRadius:8,padding:"8px 18px",fontSize:12,cursor:"pointer"}}>{card.mastered?"✓ Mastered":"Mark Mastered"}</button>
                      <button onClick={()=>{setCardFlipped(false);setActiveCard(i=>Math.min(cards.length-1,i+1));}} style={{background:"rgba(239,68,68,.08)",border:"1px solid #ef4444",color:"#ef4444",borderRadius:8,padding:"8px 18px",fontSize:12,cursor:"pointer"}}>Need Practice</button>
                    </div>)}
                    <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:14}}>
                      {cards.map((c,i)=><div key={i} onClick={()=>{setActiveCard(i);setCardFlipped(false);}} style={{width:26,height:26,borderRadius:5,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600,background:c.mastered?"rgba(34,197,94,.2)":i===activeCard?`rgba(${accentRgb},.2)`:(dark?"#1a1a24":"#f0efe9"),border:`1px solid ${c.mastered?T.success:i===activeCard?T.accent:T.border2}`,color:c.mastered?T.success:i===activeCard?T.accent:T.muted}}>{i+1}</div>)}
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:12}}>
                      <button className="bg2" style={{fontSize:11}} onClick={()=>{setStudyMode(false);setFlashContext("");}}>⬡ Regenerate</button>
                      <button className="bg2" style={{fontSize:11}} onClick={()=>{setActiveCard(0);setCardFlipped(false);setAssignments(p=>p.map(a=>a.id===showFlashModal?{...a,flashcards:a.flashcards.map(c=>({...c,mastered:false}))}:a));notify("Progress reset!");}}>↺ Reset</button>
                    </div>
                  </div>)}
                </div>);
              })()}
            </div>
          )}

          {/* ── SETTINGS ── */}
          {view==="settings"&&(
            <div className="fi">
              <div style={{marginBottom:16}}><div style={{fontSize:10,letterSpacing:3,color:T.accent,textTransform:"uppercase"}}>Preferences</div><h1 style={{fontSize:23,fontWeight:700}}>Settings</h1></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>

                {/* Flexible work schedule */}
                <div className="card" style={{gridColumn:"1/-1"}}>
                  <div style={{fontWeight:700,marginBottom:4}}>Work Schedule</div>
                  <div style={{fontSize:12,color:T.muted,marginBottom:12}}>Set each day independently. On/off toggle + custom start and end times per day. Travel/blackout dates override this automatically.</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
                    {DAYS_SHORT.map(day=>{
                      const s=workSched[day];
                      return(<div key={day} style={{display:"flex",flexDirection:"column",gap:5,padding:"10px 8px",background:T.subcard,borderRadius:9,border:`1px solid ${s.work?T.accent:T.border2}`,transition:"all .2s"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <span style={{fontSize:11,fontWeight:700,color:s.work?T.accent:T.faint}}>{day}</span>
                          <button onClick={()=>setWorkSched(p=>({...p,[day]:{...p[day],work:!p[day].work}}))} style={{width:28,height:16,borderRadius:20,background:s.work?T.accent:T.border2,border:"none",position:"relative",transition:"background .2s",cursor:"pointer"}}>
                            <div style={{position:"absolute",top:2,left:s.work?12:2,width:12,height:12,borderRadius:50,background:"#fff",transition:"left .2s"}}/>
                          </button>
                        </div>
                        {s.work&&(<>
                          <input type="time" className="ifield" value={s.start} onChange={e=>setWorkSched(p=>({...p,[day]:{...p[day],start:e.target.value}}))} style={{fontSize:10,padding:"3px 5px",textAlign:"center"}}/>
                          <input type="time" className="ifield" value={s.end} onChange={e=>setWorkSched(p=>({...p,[day]:{...p[day],end:e.target.value}}))} style={{fontSize:10,padding:"3px 5px",textAlign:"center"}}/>
                        </>)}
                        {!s.work&&<div style={{fontSize:9,color:T.faint,textAlign:"center"}}>Off / Free</div>}
                      </div>);
                    })}
                  </div>
                  <button className="bp" style={{marginTop:12,fontSize:12}} onClick={()=>{generateStudyBlocks();notify("Schedule saved — study blocks recalculated!");}}>Save & Recalculate</button>
                </div>

                {/* University theme */}
                <div className="card">
                  <div style={{fontWeight:700,marginBottom:11}}>University & Theme</div>
                  <div style={{display:"flex",alignItems:"center",gap:11,padding:"10px 12px",background:T.subcard,borderRadius:9,marginBottom:10}}>
                    <div style={{width:36,height:36,borderRadius:8,background:T.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{uni.logo}</div>
                    <div><div style={{fontWeight:600}}>{uni.name}</div><div style={{fontSize:11,color:T.muted}}>{uni.abbr}</div></div>
                    <button className="bg2" style={{marginLeft:"auto",fontSize:11}} onClick={()=>setUniPicker(true)}>Change</button>
                  </div>
                  <div style={{display:"flex",gap:9}}>
                    {[{id:true,icon:"🌙",label:"Dark"},{id:false,icon:"☀️",label:"Light"}].map(opt=>(
                      <div key={String(opt.id)} onClick={()=>setDark(opt.id)} style={{flex:1,padding:12,borderRadius:9,cursor:"pointer",border:`2px solid ${dark===opt.id?T.accent:T.border2}`,background:dark===opt.id?`rgba(${accentRgb},.1)`:"transparent",textAlign:"center",transition:"all .2s"}}>
                        <div style={{fontSize:20,marginBottom:4}}>{opt.icon}</div><div style={{fontWeight:600,fontSize:12}}>{opt.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Notifications / integrations */}
                <div className="card">
                  <div style={{fontWeight:700,marginBottom:11}}>Notifications & Integrations</div>
                  {[
                    {name:"SMS Reminders (Twilio)",  desc:"Text alerts for deadlines & study sessions",icon:"📱",action:"Configure"},
                    {name:"Outlook Calendar",          desc:"Sync via Microsoft Graph API",             icon:"📅",action:"Connect"},
                    {name:"UTD eLearning / Canvas",   desc:"Auto-import assignments",                   icon:"📚",action:"Connect"},
                    {name:"UTD Email (Outlook)",       desc:"Deadline reminders to your inbox",         icon:"📧",action:"Connect"},
                  ].map(item=>(
                    <div key={item.name} style={{display:"flex",alignItems:"center",gap:9,padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
                      <span style={{fontSize:18}}>{item.icon}</span>
                      <div style={{flex:1}}><div style={{fontSize:12,fontWeight:600}}>{item.name}</div><div style={{fontSize:10,color:T.muted}}>{item.desc}</div></div>
                      <button className="bg2" style={{fontSize:11,color:T.accent,borderColor:T.accent}} onClick={()=>notify(`${item.name}: requires backend OAuth — coming in v2!`)}>{item.action}</button>
                    </div>
                  ))}
                </div>

                {/* Syllabus import */}
                <div className="card">
                  <div style={{fontWeight:700,marginBottom:7}}>Syllabus Import</div>
                  <div style={{fontSize:12,color:T.muted,marginBottom:10}}>AI extracts all assignments, due dates, topics, and professor name for RMP lookup.</div>
                  <label style={{cursor:"pointer",display:"block"}}>
                    <input type="file" accept=".txt,.pdf,.docx" onChange={handleSyllabusUpload} style={{display:"none"}}/>
                    <div style={{border:`2px dashed ${T.border2}`,borderRadius:9,padding:18,textAlign:"center"}}>
                      <div style={{fontSize:24,marginBottom:5}}>📄</div>
                      <div style={{fontSize:12,color:T.muted}}>{uploading?"Analyzing…":"Click to upload"}</div>
                      {uploadMsg&&<div style={{fontSize:11,marginTop:5,color:uploadMsg.startsWith("✓")?T.success:T.warning}}>{uploadMsg}</div>}
                    </div>
                  </label>
                </div>

                {/* About ProPlanner */}
                <div className="card">
                  <div style={{fontWeight:700,marginBottom:7}}>About ProPlanner</div>
                  <div style={{fontSize:12,color:T.muted,lineHeight:1.6}}>
                    Built for working professionals in doctoral programs. Features: AI syllabus parsing, RMP integration, flexible work schedule, dissertation milestone tracker, AI flashcards, travel blackouts, energy logging, weekly reflection, and AI study assistant.
                  </div>
                  <div style={{marginTop:10,display:"flex",gap:6,flexWrap:"wrap"}}>
                    {["UTD","HBS","Wharton","Booth","Kellogg","Ross","Fuqua","Tuck","McCombs","SMU Cox","TCU"].map(u=>(
                      <span key={u} style={{fontSize:10,padding:"2px 7px",borderRadius:12,background:`rgba(${accentRgb},.1)`,color:T.accent,border:`1px solid rgba(${accentRgb},.2)`}}>{u}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* ═══ AI CHAT ═══ */}
        {chatOpen&&(
          <aside className="fi" style={{width:310,background:T.chatBg,borderLeft:`1px solid ${T.border}`,display:"flex",flexDirection:"column",flexShrink:0}}>
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",background:`linear-gradient(135deg,rgba(${accentRgb},.1),transparent)`}}>
              <div><div style={{fontWeight:700,fontSize:13}}>🤖 Study Assistant</div><div style={{fontSize:10,color:T.muted,marginTop:1}}>{uni.abbr} · Claude · Full context</div></div>
              <button onClick={()=>setChatOpen(false)} style={{background:"transparent",border:`1px solid ${T.border2}`,borderRadius:7,width:25,height:25,color:T.muted,fontSize:11}}>✕</button>
            </div>
            <div style={{padding:"7px 10px",borderBottom:`1px solid ${T.border}`,display:"flex",gap:4,flexWrap:"wrap"}}>
              {["Soonest deadline?","Study strategy","Prioritize my week","Dissertation advice","Explain RMP ratings"].map(q=>(
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
              {chatLoading&&<div><div style={{padding:"8px 11px",borderRadius:"14px 14px 14px 4px",background:T.aiBubble,border:`1px solid ${T.border}`,fontSize:12,color:T.muted,animation:"pulse 1.2s infinite",display:"inline-block"}}>Thinking…</div></div>}
              <div ref={chatEndRef}/>
            </div>
            <div style={{padding:"9px 11px",borderTop:`1px solid ${T.border}`,display:"flex",gap:6}}>
              <input className="ifield" placeholder="Ask anything…" value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat();}}} style={{flex:1,fontSize:12}}/>
              <button onClick={()=>sendChat()} disabled={chatLoading||!chatInput.trim()} className="bp" style={{padding:"8px 11px",flexShrink:0,opacity:chatLoading||!chatInput.trim()?.5:1}}>↑</button>
            </div>
          </aside>
        )}
      </div>

      {/* ═══ MODALS ═══ */}
      {showAddAssign&&(<div className="mo" onClick={()=>setShowAddAssign(false)}><div className="md fi" onClick={e=>e.stopPropagation()}>
        <div style={{fontWeight:700,fontSize:16,marginBottom:14}}>Add Assignment</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Course</div><select className="ifield" value={newAssign.courseId} onChange={e=>setNewAssign(a=>({...a,courseId:+e.target.value}))}>{courses.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Title</div><input className="ifield" placeholder="Assignment title" value={newAssign.title} onChange={e=>setNewAssign(a=>({...a,title:e.target.value}))}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
            <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Due Date</div><input type="date" className="ifield" value={newAssign.due} onChange={e=>setNewAssign(a=>({...a,due:e.target.value}))}/></div>
            <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Type</div><select className="ifield" value={newAssign.type} onChange={e=>setNewAssign(a=>({...a,type:e.target.value}))}>{["paper","exam","case","homework","project","discussion"].map(tp=><option key={tp}>{tp}</option>)}</select></div>
          </div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Estimated Hours: {newAssign.estHours}</div><input type="range" min={1} max={30} value={newAssign.estHours} onChange={e=>setNewAssign(a=>({...a,estHours:+e.target.value}))} style={{width:"100%",accentColor:T.accent}}/></div>
          <div style={{display:"flex",gap:8,marginTop:4}}><button className="bg2" style={{flex:1}} onClick={()=>setShowAddAssign(false)}>Cancel</button><button className="bp" style={{flex:1}} onClick={addAssignment}>Add</button></div>
        </div>
      </div></div>)}

      {showAddCourse&&(<div className="mo" onClick={()=>setShowAddCourse(false)}><div className="md fi" onClick={e=>e.stopPropagation()}>
        <div style={{fontWeight:700,fontSize:16,marginBottom:14}}>Add Course</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Course Name</div><input className="ifield" placeholder="e.g. BCOM 6304 – Strategy" value={newCourse.name} onChange={e=>setNewCourse(c=>({...c,name:e.target.value}))}/></div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Professor Name</div><input className="ifield" placeholder="For RMP lookup" value={newCourse.professor} onChange={e=>setNewCourse(c=>({...c,professor:e.target.value}))}/></div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Difficulty: {newCourse.difficulty}/5</div><input type="range" min={1} max={5} value={newCourse.difficulty} onChange={e=>setNewCourse(c=>({...c,difficulty:+e.target.value}))} style={{width:"100%",accentColor:T.accent}}/></div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:6}}>Color</div><div style={{display:"flex",gap:7}}>{["#6366f1","#0ea5e9","#ec4899","#10b981","#f59e0b","#8b5cf6","#ef4444"].map(col=><div key={col} onClick={()=>setNewCourse(c=>({...c,color:col}))} style={{width:24,height:24,borderRadius:6,background:col,cursor:"pointer",border:newCourse.color===col?"3px solid #fff":"3px solid transparent"}}/>)}</div></div>
          <div style={{display:"flex",gap:8,marginTop:4}}><button className="bg2" style={{flex:1}} onClick={()=>setShowAddCourse(false)}>Cancel</button><button className="bp" style={{flex:1}} onClick={addCourse}>Add</button></div>
        </div>
      </div></div>)}

      {showAddMilestone&&(<div className="mo" onClick={()=>setShowAddMilestone(false)}><div className="md fi" onClick={e=>e.stopPropagation()}>
        <div style={{fontWeight:700,fontSize:16,marginBottom:14}}>Add Dissertation Milestone</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Milestone Title</div><input className="ifield" placeholder="e.g. Proposal Defense" value={newMilestone.title} onChange={e=>setNewMilestone(m=>({...m,title:e.target.value}))}/></div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Target Date</div><input type="date" className="ifield" value={newMilestone.due} onChange={e=>setNewMilestone(m=>({...m,due:e.target.value}))}/></div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Notes</div><textarea className="ifield" rows={2} placeholder="Committee requirements, advisor notes…" value={newMilestone.notes} onChange={e=>setNewMilestone(m=>({...m,notes:e.target.value}))} style={{resize:"vertical"}}/></div>
          <div style={{display:"flex",gap:8,marginTop:4}}><button className="bg2" style={{flex:1}} onClick={()=>setShowAddMilestone(false)}>Cancel</button><button className="bp" style={{flex:1}} onClick={addMilestone}>Add</button></div>
        </div>
      </div></div>)}

      {showAddTravel&&(<div className="mo" onClick={()=>setShowAddTravel(false)}><div className="md fi" onClick={e=>e.stopPropagation()}>
        <div style={{fontWeight:700,fontSize:16,marginBottom:14}}>✈ Add Travel / Blackout Dates</div>
        <div style={{fontSize:12,color:T.muted,marginBottom:12}}>Study sessions will not be scheduled during these dates. Perfect for business travel, conferences, or family commitments.</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Label</div><input className="ifield" placeholder="e.g. Chicago Business Trip" value={newTravel.label} onChange={e=>setNewTravel(t=>({...t,label:e.target.value}))}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
            <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>Start Date</div><input type="date" className="ifield" value={newTravel.start} onChange={e=>setNewTravel(t=>({...t,start:e.target.value}))}/></div>
            <div><div style={{fontSize:11,color:T.muted,marginBottom:3}}>End Date</div><input type="date" className="ifield" value={newTravel.end} onChange={e=>setNewTravel(t=>({...t,end:e.target.value}))}/></div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:4}}><button className="bg2" style={{flex:1}} onClick={()=>setShowAddTravel(false)}>Cancel</button><button className="bp" style={{flex:1}} onClick={()=>{if(!newTravel.start||!newTravel.end)return notify("Enter start and end dates.");setTravelDates(p=>[...p,newTravel]);setShowAddTravel(false);setNewTravel({start:"",end:"",label:""});notify("Travel dates blocked — study schedule updated!");}}>Block Dates</button></div>
        </div>
      </div></div>)}
    </div>
  );
}
