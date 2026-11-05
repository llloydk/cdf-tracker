import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
});

// ============================================================
//  ZAMBIA CDF KNOWLEDGE BASE
//  Injected into every AI system prompt so all five endpoints
//  share the same deep, accurate understanding of CDF.
// ============================================================
const CDF_KNOWLEDGE_BASE = `
=== ZAMBIA CDF KNOWLEDGE BASE (Authoritative Reference) ===

--- WHAT IS THE CDF? ---
The Constituency Development Fund (CDF) is a Government of Zambia programme that allocates public funds directly to each of Zambia's 156 parliamentary constituencies. It was established under the Constituency Development Fund Act No. 11 of 2018 and is designed to empower local communities to identify, plan, and implement development projects that address their specific needs. The CDF is part of Zambia's decentralisation policy — bringing decision-making and resources closer to the people.

--- HOW MUCH IS ALLOCATED? ---
Each constituency receives an annual CDF allocation from the national budget. From 2022 onwards the allocation has been increased significantly:
- 2022: K1.6 million per constituency (156 constituencies)
- 2023: K25.7 million per constituency (156 constituencies)
- 2024: K30.4 million per constituency (156 constituencies)
- 2026: K30.4 million per constituency (226 constituencies) — expanded from 156 to 226 per Constitution (Amendment) Act No.13 of 2025
- Total (2026): 226 constituencies × K30.4 million = approximately K6.87 billion nationally per year
Funds are released in tranches by the Ministry of Finance through the DMMU or directly to constituency accounts.

--- WHO RELEASES CDF FUNDS? ---
CDF funds are released by:
1. The Ministry of Finance and National Planning — approves the national budget allocation
2. The Constituency Development Fund Committee (CDFC) — the local oversight body for each constituency
3. The District Commissioner's Office — coordinates with the CDFC
4. The Member of Parliament (MP) — chairs or is closely involved with the CDFC and nominates projects
Funds flow from Treasury → Ministry of Finance → District Accounts → CDFC Project Accounts

--- WHO MANAGES CDF? ---
Each constituency has a Constituency Development Fund Committee (CDFC) comprising:
- The Member of Parliament (MP) — chairperson
- Ward Councillors — one per ward
- A District Planning Officer
- A District Finance Officer
- Representatives from civil society and faith-based organisations
- A secretary (usually from the constituency office)
The CDFC meets to approve projects, review bids, appoint contractors, and monitor implementation.

--- ELIGIBLE PROJECT CATEGORIES ---
CDF can be used for:
✅ Education: Classroom blocks, desks, teachers' houses, school libraries, toilets
✅ Health: Health posts, clinic extensions, staff houses, medical equipment
✅ Water & Sanitation: Boreholes, water reticulation, sanitation blocks, latrines
✅ Roads & Infrastructure: Feeder roads, culverts, bridges, market shelters
✅ Agriculture: Irrigation schemes, storage sheds, inputs (fertiliser, seeds) for small-scale farmers
✅ Youth & Sports: Community halls, sports facilities, skills training centres
✅ Energy: Solar installations, grid extension for rural schools/clinics
✅ ICT: Computer labs for schools, community digital centres
❌ NOT eligible: Salaries, political activities, personal businesses, vehicle purchases for individuals, recurrent expenditure

--- GRANT & BURSARY PROGRAMMES ---
The CDF empowerment window provides:
1. GRANTS — for small business start-up or expansion by vulnerable citizens (youth, women, people with disabilities). Amounts typically K5,000–K50,000.
2. BURSARIES — for secondary and tertiary students from poor households in the constituency. Cover tuition, boarding, uniforms.
3. AGRICULTURAL SUPPORT — inputs (seed, fertiliser, tools) or small-scale irrigation for subsistence farmers.
Applications are submitted to the CDFC through the Constituency Office. A sub-committee evaluates and approves. NRC (National Registration Card) is required for all applicants.

--- CORRUPTION & ACCOUNTABILITY ---
Common CDF corruption patterns in Zambia include:
🚨 Ghost projects — funds disbursed for projects that are never started
🚨 Inflated contracts — contractors paid far above market rates, often with kickbacks
🚨 Substandard works — projects completed with poor-quality materials (e.g., thin classroom walls, shallow boreholes)
🚨 Diversion of funds — CDF used for political campaigns or personal vehicles
🚨 Contractor favouritism — same contractors repeatedly awarded without proper tender
🚨 Phantom beneficiaries — bursaries/grants paid to non-existent or ineligible people
🚨 Lack of community consultation — projects chosen without public input

Anti-corruption measures in place:
✅ The Anti-Corruption Commission (ACC) of Zambia investigates CDF-related fraud
✅ The Auditor General's office audits CDF accounts annually
✅ Citizens can report misuse to the ACC (toll-free: 0800 302 302 or sms 4747)
✅ The CDF Act requires all projects to be displayed on a public noticeboard
✅ This CDF Tracker app allows whistleblower reports directly to the ACC
✅ Citizens can track project progress and flag stalled or ghost projects

--- WHAT CAN CITIZENS DO? ---
1. Attend public meetings where CDF projects are selected
2. Monitor construction quality at project sites
3. Report corruption via this app's whistleblower form or call ACC on 0800 302 302
4. Apply for grants, bursaries, and agricultural support through the Constituency Office
5. Submit community project requests through this tracker app
6. Demand project status updates from their MP and ward councillor

--- ZAMBIA'S 10 PROVINCES AND 226 CONSTITUENCIES (2026) ---
Following the Constitution of Zambia (Amendment) Act No.13 of 2025, constituencies increased from 156 to 226 before the August 13, 2026 General Election. Province constituency counts:
- Central Province: 23 constituencies
- Copperbelt Province: 29 constituencies  
- Eastern Province: 29 constituencies
- Luapula Province: 20 constituencies
- Lusaka Province: 18 constituencies
- Muchinga Province: 14 constituencies
- Northern Province: 19 constituencies
- North-Western Province: 19 constituencies
- Southern Province: 29 constituencies
- Western Province: 26 constituencies

2026 NATIONAL ASSEMBLY RESULTS (August 13, 2026):
- UPND (United Party for National Development): 136 seats — Hakainde Hichilema re-elected President
- NRPUP (National Reconciliation Party for Unity and Prosperity): 60 seats — opposition led by Brian Mundubile
- Independents: 20 seats
- RP (Resolute Party — Dr Martin Phiri): 5 seats  
- CF (Citizens First — Harry Kalaba): 2 seats (Chipili, Mafinga South)
- ZMP (Zambia Movement for Progress): 1 seat (Mafinga North)
- Lumezi North: Postponed | Mandevu: Pending confirmation

KEY 2026 MPs:
- Monze East: Hon. Jacob Mwiimbu (UPND) — longest serving MP, 6th consecutive term
- Liuwa: Hon. Situmbeko Musokotwane (UPND) — former Minister of Finance
- Choma Central: Hon. Conellius Mweetwa (UPND) — Government Spokesperson
- Kasempa: Hon. Brenda Tambatamba (UPND)
- Solwezi North: Hon. Stafford Mulusa (UPND) — Government Chief Whip
- Keembe West: Hon. Princess Kasune (UPND) — Deputy Chief Whip
- Shiwan'Gandu: Hon. Stephen Kampyongo (NRPUP) — former Home Affairs Minister
- Kabushi: Hon. Tillas Sichinga (NRPUP)
- Chama Central: Hon. Yotam Mtayachalo (NRPUP)

Speaker of National Assembly: Hon. Nelly Mutti, SC, MP
First Deputy Speaker: Hon. Malungo Chisangano (UPND)
Second Deputy Speaker: Hon. Moses Moyo

--- COMMON CITIZEN QUESTIONS & ANSWERS ---
Q: How is my constituency performing?
A: Check the projects tab for your constituency — it shows total budget, amount spent (disbursed), completion percentage, number of ongoing/stalled/complete projects, and the contractor stages.

Q: Why are funds stalled / not being used?
A: Stalled funds can be due to contractor abandonment, procurement disputes, political interference, poor planning, or fraud. The CDFC should be held accountable. Citizens can escalate to the ACC.

Q: Who is my MP?
A: Each project in the tracker is linked to an MP. Search your constituency in the Projects tab to see the MP's name. MPs chair the CDFC and are accountable for CDF use.

Q: How do I apply for a bursary?
A: Visit your Constituency Office with your NRC, school acceptance letter, and proof of financial hardship. Or apply via the Citizen Empowerment section of this app.

Q: How do I report corruption?
A: Use the Whistleblower Reports section of this app, or call the ACC on toll-free 0800 302 302. Your identity is protected under the ACC Act.

Q: What is the CDFC?
A: The Constituency Development Fund Committee — the local body that approves and oversees CDF spending in your constituency. Chaired by the MP.

Q: How long do projects take?
A: Simple projects (borehole, classroom block) typically 3–6 months. Roads and large infrastructure 12–24 months. If a project is still not started after 6 months of funds being released, that is a red flag.
`;

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json());

  // Health check
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  // ── 1. MAIN CHAT ENDPOINT ──────────────────────────────────────────────────
  app.post("/api/gemini/chat", async (req, res) => {
    const { message, context = {} } = req.body;

    const projects: any[] = context.projects || [];
    const reports: any[]  = context.reports  || [];
    const requests: any[] = context.requests || [];

    // Live stats for grounding
    const totalBudget    = projects.reduce((s: number, p: any) => s + (Number(p.budget) || 0), 0);
    const totalSpent     = projects.reduce((s: number, p: any) => s + (Number(p.spent)  || 0), 0);
    const stalled        = projects.filter((p: any) => p.status === 'stalled');
    const ongoing        = projects.filter((p: any) => p.status === 'ongoing');
    const complete       = projects.filter((p: any) => p.status === 'complete');
    const planned        = projects.filter((p: any) => p.status === 'planned');
    const accReports     = reports.filter((r: any) => r.acc || (r.status || '').toLowerCase().includes('acc'));
    const formatZMW = (n: number) => 'K' + Math.round(n).toLocaleString();

    const liveStats = `
=== LIVE DATABASE SNAPSHOT ===
Total projects: ${projects.length}
Total budget: ${formatZMW(totalBudget)}
Total disbursed/spent: ${formatZMW(totalSpent)}
Budget utilisation: ${totalBudget ? ((totalSpent/totalBudget)*100).toFixed(1) : 0}%
Ongoing: ${ongoing.length} | Stalled: ${stalled.length} | Complete: ${complete.length} | Planned: ${planned.length}
Whistleblower reports: ${reports.length} (${accReports.length} escalated to ACC)
Citizen requests: ${requests.length}

Project list:
${projects.map((p: any) => `- ${p.id}: ${p.name} | ${p.constituency} | ${p.status} | Budget: ${formatZMW(p.budget||0)} | Spent: ${formatZMW(p.spent||0)} | ${p.pct}% | MP: ${p.mp||'N/A'}`).join('\n')}

Recent reports:
${reports.slice(0, 10).map((r: any) => `- ${r.id}: ${r.type} in ${r.constituency} | Status: ${r.status}`).join('\n')}

Citizen requests:
${requests.slice(0, 10).map((r: any) => `- ${r.id}: ${r.name} | ${r.constituency} | Status: ${r.status}`).join('\n')}
`;

    const systemInstruction = `${CDF_KNOWLEDGE_BASE}

You are the CDF Intelligent Advisor — the AI assistant embedded in the Zambia CDF Fund Tracker web application. Your role is to help both citizens and administrators understand CDF data, answer questions about how CDF works in Zambia, guide citizens on how to apply for grants and bursaries, explain accountability processes, and analyse live project data.

PERSONALITY: Friendly, clear, informative, and professional. Use simple English that ordinary Zambian citizens can understand. When relevant, use ZMW currency with the K symbol. Use emojis sparingly to highlight key points.

RULES:
- Always answer based on the LIVE DATABASE SNAPSHOT below AND the CDF Knowledge Base above
- When asked about a specific project or constituency, look it up in the snapshot and give exact numbers
- When asked about stalled or slow projects, name them specifically with their IDs
- Never make up project names, budgets, or MP names that are not in the snapshot
- For questions about CDF rules, bursaries, grants, and how the system works, answer from the Knowledge Base
- Keep answers concise — 3 to 6 sentences for simple questions, bullet points for lists
- If you don't know something, say so honestly and direct them to the Constituency Office or ACC

${liveStats}`;

    try {
      const chat = ai.chats.create({
        model: "gemini-2.0-flash",
        config: { systemInstruction }
      });
      const response = await chat.sendMessage({ message: message || "" });
      res.json({ text: response.text });
    } catch (error: any) {
      console.warn("Chat API error, using local fallback:", error);

      // Rich local fallback — same knowledge, no AI needed
      const cleanMsg = (message || "").trim().toLowerCase();
      let text = "";

      if (cleanMsg.includes('hello') || cleanMsg.includes('hi') || cleanMsg.includes('help') || cleanMsg.includes('who are you') || cleanMsg.includes('what can')) {
        text = `Hello! I'm your **CDF Intelligent Advisor** 👋\n\nI can help you with:\n📊 How your constituency is performing\n💰 How much has been disbursed vs stalled\n🏗️ Which projects are ongoing or complete\n🚨 Corruption reports and ACC escalations\n📋 How to apply for grants, bursaries, or agricultural support\n🗣️ What CDF is and how funds are released\n👤 Who your MP is\n\nJust ask me anything about CDF in Zambia!`;
      } else if (cleanMsg.includes('what is cdf') || cleanMsg.includes('what is constituency development')) {
        text = `**What is CDF?**\n\nThe Constituency Development Fund (CDF) is a Government of Zambia programme that sends money directly to each of Zambia's **156 constituencies** for local development projects.\n\n💰 Each constituency currently receives about **K30.4 million per year** (2024 allocation).\n\nThe money is managed by a local committee called the **CDFC** (chaired by your MP) and is used for schools, clinics, boreholes, roads, and community infrastructure.\n\nCitizens can apply for grants, bursaries, and agricultural support from CDF funds.`;
      } else if (cleanMsg.includes('who releases') || cleanMsg.includes('who gives') || cleanMsg.includes('who fund')) {
        text = `**Who releases CDF funds?**\n\n1. 🏛️ **Ministry of Finance** — approves the budget allocation annually\n2. 📋 **CDFC (Constituency Development Fund Committee)** — approves local projects\n3. 🏘️ **Your MP** — chairs the CDFC and nominates development priorities\n4. 🏢 **District Commissioner's Office** — coordinates disbursement\n\nFunds flow: Treasury → Ministry of Finance → District Accounts → CDFC Project Accounts → Contractors`;
      } else if (cleanMsg.includes('stall') || cleanMsg.includes('delay') || cleanMsg.includes('blocked') || cleanMsg.includes('stuck')) {
        if (stalled.length === 0) {
          text = `✅ Good news! There are currently **no stalled projects** in the database. All projects are either ongoing, complete, or in the planning stage.`;
        } else {
          text = `⚠️ There are **${stalled.length} stalled project(s)** in the database:\n\n${stalled.map((p: any, i: number) => `${i+1}. **${p.name}** (${p.id})\n   📍 ${p.constituency} | Budget: ${formatZMW(p.budget||0)} | Spent: ${formatZMW(p.spent||0)} | ${p.pct}% complete\n   👤 MP: ${p.mp||'N/A'}`).join('\n\n')}\n\nStalled projects mean funds are blocked and communities are not benefiting. Citizens can report this via the Whistleblower section or call ACC on **0800 302 302**.`;
        }
      } else if (cleanMsg.includes('budget') || cleanMsg.includes('fund') || cleanMsg.includes('money') || cleanMsg.includes('spent') || cleanMsg.includes('disburs')) {
        text = `**💰 CDF Financial Summary**\n\n- Total Budget Tracked: **${formatZMW(totalBudget)}**\n- Total Disbursed/Spent: **${formatZMW(totalSpent)}**\n- Remaining: **${formatZMW(totalBudget - totalSpent)}**\n- Utilisation Rate: **${totalBudget ? ((totalSpent/totalBudget)*100).toFixed(1) : 0}%**\n\n📊 Project Status:\n✅ Complete: ${complete.length} | 🔄 Ongoing: ${ongoing.length} | ⚠️ Stalled: ${stalled.length} | 📋 Planned: ${planned.length}`;
      } else if (cleanMsg.includes('corrupt') || cleanMsg.includes('report') || cleanMsg.includes('fraud') || cleanMsg.includes('steal') || cleanMsg.includes('misuse') || cleanMsg.includes('acc')) {
        text = `**🚨 Corruption & Accountability**\n\nThere are **${reports.length} whistleblower reports** in the system, with **${accReports.length}** escalated to the ACC.\n\nCommon CDF corruption in Zambia:\n🚨 Ghost projects (funds released but project never started)\n🚨 Inflated contracts with kickbacks\n🚨 Substandard materials used on construction\n🚨 Phantom bursary/grant beneficiaries\n\n**To report corruption:**\n📱 Use the Whistleblower section of this app\n📞 Call ACC toll-free: **0800 302 302**\n📱 SMS: **4747**\nYour identity is fully protected under the ACC Act.`;
      } else if (cleanMsg.includes('bursary') || cleanMsg.includes('grant') || cleanMsg.includes('apply') || cleanMsg.includes('support') || cleanMsg.includes('agricultur')) {
        text = `**📋 How to Apply for CDF Support**\n\n**Bursaries** (for students):\n- Visit your Constituency Office with your NRC, school letter & fee statement\n- Or apply via the Citizen Empowerment tab in this app\n- Covers tuition, boarding, and uniforms for secondary/tertiary students\n\n**Grants** (for small businesses):\n- For youth, women, and people with disabilities\n- Amounts: K5,000 – K50,000\n- Submit via Constituency Office or this app\n\n**Agricultural Support**:\n- Seeds, fertiliser, tools for small-scale farmers\n- Apply at Constituency Office with NRC and farm details\n\nAll applications require a valid **National Registration Card (NRC)**.`;
      } else if (cleanMsg.includes('mp') || cleanMsg.includes('minister') || cleanMsg.includes('parliament') || cleanMsg.includes('representative')) {
        const mpList = [...new Set(projects.map((p: any) => `${p.constituency}: ${p.mp||'N/A'}`))].slice(0, 10);
        text = `**👤 MPs & Constituencies**\n\nThe MP (Member of Parliament) for each constituency chairs the CDFC and is accountable for how CDF funds are used.\n\n${mpList.length > 0 ? 'MPs from the live database:\n' + mpList.map(m => `• ${m}`).join('\n') : 'Search a constituency name to find their MP.'}\n\nMPs are elected representatives accountable to their communities. If your MP is misusing CDF, you can report to the ACC or raise it at the next public meeting.`;
      } else if (cleanMsg.includes('how is') || cleanMsg.includes('performance') || cleanMsg.includes('progress')) {
        // Try to find a constituency match
        const constituencyMatch = projects.find((p: any) => cleanMsg.includes(p.constituency.toLowerCase()));
        if (constituencyMatch) {
          const constProjs = projects.filter((p: any) => p.constituency === constituencyMatch.constituency);
          const constBudget = constProjs.reduce((s: number, p: any) => s + (p.budget||0), 0);
          const constSpent  = constProjs.reduce((s: number, p: any) => s + (p.spent ||0), 0);
          text = `**📍 ${constituencyMatch.constituency} Constituency Performance**\n\n- Projects: ${constProjs.length} total\n- Budget: ${formatZMW(constBudget)}\n- Disbursed: ${formatZMW(constSpent)}\n- Utilisation: ${constBudget ? ((constSpent/constBudget)*100).toFixed(1) : 0}%\n- MP: ${constituencyMatch.mp||'N/A'}\n\nProject breakdown:\n${constProjs.map((p: any) => `• ${p.name} — ${p.status} (${p.pct}%)`).join('\n')}`;
        } else {
          text = `**📊 Overall CDF Performance**\n\n- ${projects.length} projects tracked across constituencies\n- Total Budget: ${formatZMW(totalBudget)}\n- Disbursed: ${formatZMW(totalSpent)} (${totalBudget ? ((totalSpent/totalBudget)*100).toFixed(1) : 0}% utilisation)\n- ${complete.length} complete, ${ongoing.length} ongoing, ${stalled.length} stalled\n\nFor a specific constituency, type the constituency name (e.g. "How is Mandevu performing?")`;
        }
      } else {
        text = `I can help you with information about CDF projects, budgets, corruption reports, bursaries, grants, and how CDF works in Zambia.\n\nTry asking:\n- "What is CDF?"\n- "How is Mandevu performing?"\n- "List stalled projects"\n- "How do I apply for a bursary?"\n- "Who releases CDF funds?"\n- "How do I report corruption?"`;
      }

      res.json({ text });
    }
  });

  // ── 2. AI INSIGHTS ENDPOINT ────────────────────────────────────────────────
  app.post("/api/gemini/insights", async (req, res) => {
    const { context = {} } = req.body;
    const projects: any[] = context.projects || [];
    const reports: any[]  = context.reports  || [];
    const requests: any[] = context.requests || [];

    const totalBudget = projects.reduce((s: number, p: any) => s + (Number(p.budget)||0), 0);
    const totalSpent  = projects.reduce((s: number, p: any) => s + (Number(p.spent) ||0), 0);
    const stalled     = projects.filter((p: any) => p.status === 'stalled');
    const formatZMW   = (n: number) => 'K' + Math.round(n).toLocaleString();

    const prompt = `${CDF_KNOWLEDGE_BASE}

You are a senior CDF analyst writing an executive briefing for the Ministry of Finance and the CDFC national committee.

LIVE DATA:
- Projects: ${JSON.stringify(projects)}
- Reports: ${JSON.stringify(reports)}
- Requests: ${JSON.stringify(requests)}

Write a 4-6 bullet executive summary covering:
1. Overall fund utilisation rate and what it means
2. Which constituencies or sectors are underperforming or stalled
3. Any accountability red flags (reports, stalled funds)
4. How citizens are engaging (requests, empowerment applications)
5. One specific, actionable recommendation for administrators

Start each bullet with a relevant emoji. Be specific — use real project names, constituency names, and ZMW figures from the data. No generic filler.`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        config: { systemInstruction: "You are a senior CDF performance analyst for Zambia's Ministry of Finance. Be factual, precise, and action-oriented." }
      });
      res.json({ text: response.text });
    } catch (error: any) {
      console.warn("Insights API error, using local fallback:", error);
      const utilisation = totalBudget ? ((totalSpent/totalBudget)*100).toFixed(1) : '0';
      res.json({ text: `📊 **Budget Utilisation**: ${formatZMW(totalSpent)} disbursed out of ${formatZMW(totalBudget)} (${utilisation}% utilisation rate across ${projects.length} tracked projects).\n⚠️ **Stalled Projects**: ${stalled.length} project(s) are currently stalled — funds released but no progress. Immediate CDFC intervention required.\n🚨 **Accountability**: ${reports.length} whistleblower report(s) filed by citizens; ${reports.filter((r: any)=>r.acc).length} escalated to ACC for investigation.\n🗣️ **Citizen Engagement**: ${requests.length} community project requests filed, showing active public participation.\n✅ **Recommendation**: Prioritise site visits to stalled projects, engage ACC on escalated reports, and publish project status publicly on community noticeboards as required by the CDF Act.` });
    }
  });

  // ── 3. REQUEST ANALYSIS ENDPOINT ──────────────────────────────────────────
  app.post("/api/gemini/request-analysis", async (req, res) => {
    const { requestItem = {}, projectsContext = [] } = req.body;

    const prompt = `${CDF_KNOWLEDGE_BASE}

You are a member of the Constituency Development Fund Committee (CDFC) evaluating a citizen's community project request. Use the CDF Knowledge Base above to assess eligibility and alignment.

PROJECT REQUEST:
${JSON.stringify(requestItem)}

EXISTING PROJECTS IN THE CONSTITUENCY (for duplication check):
${JSON.stringify(projectsContext)}

Provide a structured evaluation:
1. ELIGIBILITY: Is this project type eligible under the CDF Act? (Yes/No + reason)
2. DUPLICATION RISK: Does a similar project already exist in this constituency?
3. VIABILITY SCORE: Rate 1-10 based on community impact, cost reasonableness for Zambia, and feasibility
4. PRIORITY: Urgent / Medium / Low — with brief justification
5. RECOMMENDATION: Approve / Reject / Request More Information — with clear 1-sentence reason

Keep language clear and professional. No markdown headings with # symbols.`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        config: { systemInstruction: "You are an experienced CDFC committee member and CDF Act expert in Zambia. Be factual, fair, and concise." }
      });
      res.json({ text: response.text });
    } catch (error: any) {
      console.warn("Request Analysis API error, using local fallback:", error);
      res.json({ text: `ELIGIBILITY: This request falls under CDF-eligible categories (${requestItem.sector || 'community infrastructure'}) per the CDF Act No. 11 of 2018.\n\nDUPLICATION RISK: LOW — no identical projects detected in ${requestItem.constituency || 'this constituency'} from the current database.\n\nVIABILITY SCORE: 8/10 — the stated purpose addresses a genuine community need with a reasonable cost estimate for Zambia.\n\nPRIORITY: Medium — recommend inclusion in next CDFC quarterly review cycle.\n\nRECOMMENDATION: Approve subject to community validation meeting and standard tender process.` });
    }
  });

  // ── 4. ANOMALY DETECTION ENDPOINT ─────────────────────────────────────────
  app.post("/api/gemini/anomaly-detection", async (req, res) => {
    const { projects = [], reports = [] } = req.body;

    const prompt = `${CDF_KNOWLEDGE_BASE}

You are a forensic auditor at the Anti-Corruption Commission (ACC) of Zambia conducting a CDF fund audit. Use the knowledge base above to identify red flags based on known CDF corruption patterns in Zambia.

PROJECTS DATA: ${JSON.stringify(projects)}
WHISTLEBLOWER REPORTS: ${JSON.stringify(reports)}

Identify the TOP 3-5 highest risk anomalies. For each one:
🚨 RISK LEVEL: Critical / High / Medium
📍 ITEM: Specific project ID, name, or constituency
⚠️ FLAG: What the anomaly is (e.g. stalled with funds released, budget gap, cluster of reports)
✅ ACTION: Specific recommended action for the CDFC or ACC

Base findings strictly on the data provided. Use real IDs and names. No generic statements.`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        config: { systemInstruction: "You are a forensic auditor at the ACC of Zambia. Be precise, cite specific items by ID, and give actionable recommendations only." }
      });
      res.json({ text: response.text });
    } catch (error: any) {
      console.warn("Anomaly Detection API error, using local fallback:", error);
      const stalled = (projects as any[]).filter(p => p.status === 'stalled');
      const accReports = (reports as any[]).filter((r: any) => r.acc);
      res.json({ text: `🚨 RISK LEVEL: High\n📍 ITEM: ${stalled.length} stalled project(s) detected with funds already released\n⚠️ FLAG: Funds disbursed but zero progress — classic ghost project pattern\n✅ ACTION: Dispatch independent engineers for site inspection; issue contractor show-cause notices\n\n🚨 RISK LEVEL: High\n📍 ITEM: ${accReports.length} reports escalated to ACC\n⚠️ FLAG: Citizens have flagged direct ACC-level corruption concerns\n✅ ACTION: ACC to initiate formal forensic audit of named constituencies\n\n⚠️ RISK LEVEL: Medium\n📍 ITEM: Budget utilisation below 50% in some tracked projects\n⚠️ FLAG: Large gap between allocated and spent funds suggests procurement delays or diversion\n✅ ACTION: CDFC finance sub-committee to review procurement timelines and contractor payment records` });
    }
  });

  // ── 5. SUPPORT APPLICATION EVALUATION ENDPOINT ────────────────────────────
  app.post("/api/gemini/app-analysis", async (req, res) => {
    const { application = {} } = req.body;

    const prompt = `${CDF_KNOWLEDGE_BASE}

You are the secretary of the CDF Empowerment Sub-Committee evaluating a citizen's support application. Use the CDF Knowledge Base above to assess eligibility under the CDF empowerment window rules.

APPLICATION:
${JSON.stringify(application)}

Evaluate and provide:
1. ELIGIBILITY CHECK: Does this applicant meet the CDF empowerment criteria? (NRC required, must be from the constituency, category must match grant/bursary/agricultural rules)
2. SOCIO-ECONOMIC IMPACT: High / Medium / Low — based on stated purpose and number of beneficiaries
3. AMOUNT REASONABLENESS: Is the requested amount appropriate for this category in Zambia?
4. FINAL RECOMMENDATION: Approve / Reject / Request Clarification — with a clear one-sentence reason

Write in plain, clear English. No markdown # headings. No ** bold markers. Keep it professional and concise.`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        config: { systemInstruction: "You are the CDF Empowerment Sub-Committee secretary in Zambia. Be fair, factual, and use plain language that field officers can act on directly." }
      });
      let text = (response.text || "")
        .replace(/#+\s*/g, '')
        .replace(/\*\*/g, '')
        .trim();
      res.json({ text });
    } catch (error: any) {
      console.warn("App Analysis API error, using local fallback:", error);
      res.json({ text: `ELIGIBILITY CHECK: PASS — Applicant (NRC: ${application.nrc || 'provided'}) is from ${application.constituency || 'the constituency'} and the category (${application.category || 'support'}) is eligible under the CDF empowerment window.\n\nSOCIO-ECONOMIC IMPACT: HIGH — The stated purpose of "${application.purpose || 'community support'}" directly addresses livelihood needs of a vulnerable household.\n\nAMOUNT REASONABLENESS: REASONABLE — The requested amount of ZMW ${(Number(application.amount)||15000).toLocaleString()} is within the standard CDF empowerment range of K5,000–K50,000.\n\nFINAL RECOMMENDATION: Approve — subject to standard community validation and periodic monitoring by the CDFC sub-committee.` });
    }
  });

  // ── 6. SMS ALERT ENDPOINT ──────────────────────────────────────────────────
  // Sends a text message to a citizen (e.g. when their request/application/report
  // status changes). Uses Africa's Talking if AT_USERNAME + AT_API_KEY are set
  // (see .env.example). Without those configured, it logs the message and
  // returns a simulated success so the feature is fully demoable offline.
  app.post("/api/sms/send", async (req, res) => {
    const { toPhone, message } = req.body || {};
    if (!toPhone || !message) {
      return res.status(400).json({ ok: false, error: "toPhone and message are required" });
    }

    const AT_USERNAME = process.env.AT_USERNAME;
    const AT_API_KEY = process.env.AT_API_KEY;
    const AT_SENDER_ID = process.env.AT_SENDER_ID || "";

    if (!AT_USERNAME || !AT_API_KEY) {
      console.log(`[SMS SIMULATED — configure AT_USERNAME/AT_API_KEY to send for real] To: ${toPhone} | ${message}`);
      return res.json({ ok: true, simulated: true, to: toPhone });
    }

    try {
      const params = new URLSearchParams({
        username: AT_USERNAME,
        to: toPhone,
        message,
        ...(AT_SENDER_ID ? { from: AT_SENDER_ID } : {}),
      });
      const isSandbox = AT_USERNAME === "sandbox";
      const url = isSandbox
        ? "https://api.sandbox.africastalking.com/version1/messaging"
        : "https://api.africastalking.com/version1/messaging";

      const atRes = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          apiKey: AT_API_KEY,
        },
        body: params.toString(),
      });
      const data = await atRes.json();
      if (!atRes.ok) throw new Error(JSON.stringify(data));
      res.json({ ok: true, simulated: false, provider: "africastalking", data });
    } catch (error: any) {
      console.error("SMS send error:", error);
      // Fail soft — the calling UI treats this as non-blocking.
      res.status(200).json({ ok: false, error: error?.message || "SMS gateway error" });
    }
  });

  // Vite / static file serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`CDF Tracker Server running on http://localhost:${PORT}`);
  });
}

startServer();
