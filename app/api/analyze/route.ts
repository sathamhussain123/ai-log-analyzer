import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";

// Make sure the env var is named GEMINI_API_KEY in your .env.local
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const SYSTEM_PROMPT = `You are an expert DevOps engineer and Jenkins CI/CD specialist with deep knowledge of build systems, software compilation, testing frameworks, and deployment pipelines.

When given a Jenkins build log or console output, analyze it carefully and respond ONLY with a valid JSON object (no markdown, no explanation outside JSON) in this exact structure:

{
  "root_cause": "A clear, concise sentence describing the primary reason the build failed",
  "root_cause_detail": "A more detailed 2-3 sentence explanation of exactly what went wrong and why",
  "category": "One of: Compilation Error | Test Failure | Dependency Issue | Configuration Error | Network/Connectivity | Permission/Auth | Timeout | Resource Exhaustion | Pipeline Syntax Error | Environment Issue | Docker/Container | Deployment Error | Unknown",
  "suggested_fix": "Step-by-step actionable fix instructions as a numbered list (use \\n for line breaks between steps)",
  "severity": "One of: Critical | High | Medium | Low",
  "confidence": <number between 0 and 100 representing how confident you are in this analysis>,
  "affected_component": "The specific file, module, service, or stage that triggered the failure",
  "error_snippet": "The exact key error line(s) from the log (max 3 lines)",
  "tags": ["tag1", "tag2"]
}

Severity guidelines:
- Critical: Build blocks production deployment, security issue, or data loss risk
- High: Core functionality broken, blocks team progress
- Medium: Non-critical feature broken, workaround available
- Low: Minor issue, cosmetic, or warning only

Be specific and actionable. Focus on the actual error, not generic advice.`;

async function fetchJenkinsLog(url: string): Promise<string> {
    // Try appending /consoleText for Jenkins URLs that don't already have it
    const consoleUrl = url.includes("/consoleText") ? url : url.replace(/\/$/, "") + "/consoleText";

    try {
        const response = await axios.get(consoleUrl, {
            timeout: 15000,
            headers: {
                "User-Agent": "AI-Jenkins-Log-Analyzer/1.0",
                Accept: "text/plain,text/html,*/*",
            },
            maxContentLength: 500 * 1024, // 500KB limit
        });
        return typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data);
    } catch {
        // Fallback: try the URL as-is
        try {
            const response = await axios.get(url, {
                timeout: 15000,
                headers: { "User-Agent": "AI-Jenkins-Log-Analyzer/1.0" },
                maxContentLength: 500 * 1024,
            });
            return typeof response.data === "string"
                ? response.data
                : JSON.stringify(response.data);
        } catch (e2: unknown) {
            const err = e2 as { message?: string; response?: { status?: number } };
            throw new Error(
                `Could not fetch log from URL: ${err?.response?.status ? `HTTP ${err.response.status}` : err?.message || "Unknown error"}. ` +
                `Make sure the Jenkins URL is publicly accessible or use the "Paste Log" mode instead.`
            );
        }
    }
}

// ─── Deterministic Category Pattern Map ───
const CATEGORY_PATTERNS: Record<string, string[]> = {
    "Resource Exhaustion": ["No space left on device", "Disk full", "DerivedData", "Archive storage", "Workspace full", "ENOSPC"],
    "Permission/Auth": ["Provisioning profile", "CodeSign failed", "certificate expired", "certificate revoked", "No signing certificate", "Signing for target", "Xcode signing"],
    "Configuration Error": ["Gradle version", "Plugin requires", "AGP version", "Could not determine dependencies", "Gradle daemon", "Build failed with an exception"],
    "Dependency Issue": ["pod install", "CocoaPods", "npm install", "package resolution", "Module not found", "dependency failed"],
    "Network/Connectivity": ["Connection timed out", "SSL", "Unable to download", "Could not resolve host", "connection refused"],
    "Environment Issue": ["agent offline", "node disconnected", "permission denied", "out of memory", "docker error", "executor lost"],
};

// All category-specific keywords flattened + generic error keywords
const ALL_GREP_KEYWORDS: string[] = [
    ...Object.values(CATEGORY_PATTERNS).flat(),
    "error", "failed", "failure",
];

// ─── Grep keywords in the log and return ±20 lines around each match ───
function grepAndExtractContext(log: string, contextLines = 20): { snippet: string; matchedCategory: string | null } {
    const lines = log.split(/\r?\n/);
    const matchedLineIndices = new Set<number>();
    let matchedCategory: string | null = null;

    // Scan every line for all keywords
    for (let i = 0; i < lines.length; i++) {
        const lowerLine = lines[i].toLowerCase();

        for (const keyword of ALL_GREP_KEYWORDS) {
            if (lowerLine.includes(keyword.toLowerCase())) {
                matchedLineIndices.add(i);
                break; // one match per line is enough
            }
        }
    }

    // Determine category from the first category-specific keyword hit
    for (let i = 0; i < lines.length; i++) {
        if (matchedCategory) break;
        const lowerLine = lines[i].toLowerCase();
        for (const [category, keywords] of Object.entries(CATEGORY_PATTERNS)) {
            for (const keyword of keywords) {
                if (lowerLine.includes(keyword.toLowerCase())) {
                    matchedCategory = category;
                    break;
                }
            }
            if (matchedCategory) break;
        }
    }

    // If no keywords matched at all, fall back to sending first 20 + last 20 lines
    if (matchedLineIndices.size === 0) {
        const head = lines.slice(0, contextLines).join("\n");
        const tail = lines.slice(Math.max(0, lines.length - contextLines)).join("\n");
        const snippet = lines.length <= contextLines * 2
            ? lines.join("\n")
            : head + "\n\n... [NO KEYWORD MATCHES - SHOWING HEAD & TAIL] ...\n\n" + tail;
        return { snippet, matchedCategory };
    }

    // Build ranges: for each matched line, include ±contextLines around it
    const includeSet = new Set<number>();
    for (const idx of matchedLineIndices) {
        const start = Math.max(0, idx - contextLines);
        const end = Math.min(lines.length - 1, idx + contextLines);
        for (let j = start; j <= end; j++) {
            includeSet.add(j);
        }
    }

    // Convert to sorted array and build contiguous blocks
    const sortedIndices = Array.from(includeSet).sort((a, b) => a - b);
    const snippetParts: string[] = [];
    let blockStart = sortedIndices[0];
    let prevIdx = sortedIndices[0];

    for (let i = 1; i <= sortedIndices.length; i++) {
        const curIdx = sortedIndices[i];
        // If there is a gap, close the current block and start a new one
        if (i === sortedIndices.length || curIdx > prevIdx + 1) {
            const block = lines.slice(blockStart, prevIdx + 1).join("\n");
            snippetParts.push(`[Lines ${blockStart + 1}-${prevIdx + 1}]\n${block}`);
            if (i < sortedIndices.length) {
                blockStart = curIdx;
            }
        }
        prevIdx = curIdx;
    }

    const snippet = snippetParts.join("\n\n... [GAP - non-relevant lines omitted] ...\n\n");
    return { snippet, matchedCategory };
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { url, rawLog, mode } = body;

        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json(
                { error: "Google Gemini API key is not configured. Please add GEMINI_API_KEY to your .env.local file." },
                { status: 500 }
            );
        }

        let logContent = "";

        if (mode === "url") {
            if (!url || typeof url !== "string") {
                return NextResponse.json({ error: "A valid Jenkins URL is required." }, { status: 400 });
            }
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                return NextResponse.json({ error: "URL must start with http:// or https://" }, { status: 400 });
            }
            logContent = await fetchJenkinsLog(url.trim());
        } else {
            if (!rawLog || typeof rawLog !== "string" || rawLog.trim().length < 20) {
                return NextResponse.json({ error: "Please paste a Jenkins log with at least 20 characters." }, { status: 400 });
            }
            logContent = rawLog.trim();
        }

        // Step 1: Grep keywords → extract ±20 lines around each match
        const { snippet, matchedCategory } = grepAndExtractContext(logContent, 20);

        // Step 2: Call Gemini Model with ONLY the extracted snippet
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: {
                temperature: 0.2,
                responseMimeType: "application/json",
            }
        });

        let contextualPrompt = `${SYSTEM_PROMPT}\n\n`;
        if (matchedCategory) {
            contextualPrompt += `CRITICAL INSTRUCTION: Based on deterministic pattern matching, this failure has ALREADY been identified as "${matchedCategory}". You MUST set the "category" field in your JSON response strictly to "${matchedCategory}". DO NOT pick any other category.\n\n`;
        }

        const prompt = `${contextualPrompt}Analyze this Jenkins build log and provide structured JSON analysis:\n\n\`\`\`\n${snippet}\n\`\`\``;

        const result = await model.generateContent(prompt);
        const rawContent = result.response.text();

        if (!rawContent) {
            throw new Error("No response received from Google Gemini.");
        }

        const analysis = JSON.parse(rawContent.trim());

        return NextResponse.json({
            success: true,
            analysis,
            meta: {
                logLength: logContent.length,
                model: "gemini-2.5-flash",
                analyzedAt: new Date().toISOString(),
            },
        });
    } catch (error: unknown) {
        const err = error as { message?: string; status?: number; code?: string };
        console.error("[AI Jenkins Analyzer Error]:", err);
        return NextResponse.json(
            { error: err?.message || "An unexpected error occurred during analysis." },
            { status: 500 }
        );
    }
}
