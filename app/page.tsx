"use client";

import { useState, useEffect } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode2,
  Link,
  Loader2,
  RefreshCw,
  Search,
  ServerCrash,
  Zap,
  Shield,
  Activity,
  Terminal,
} from "lucide-react";

type AnalysisMode = "url" | "raw";

interface AnalysisResult {
  root_cause: string;
  root_cause_detail: string;
  category: string;
  suggested_fix: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  confidence: number;
  affected_component: string;
  error_snippet: string;
  tags: string[];
}

export default function Home() {
  const [mode, setMode] = useState<AnalysisMode>("raw");
  const [inputVal, setInputVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [rawJson, setRawJson] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);

  const [loadingStep, setLoadingStep] = useState(0);
  const loadingSteps = [
    mode === "url" ? "Fetching Jenkins log..." : "Parsing pasted log content...",
    "Connecting to Gemini AI models...",
    "Grepping keywords & extracting context...",
    "Running anomaly detection pipeline...",
    "Structuring root cause analysis...",
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingStep((prev) => Math.min(prev + 1, loadingSteps.length - 1));
      }, 1800);
    }
    return () => clearInterval(interval);
  }, [loading, mode, loadingSteps.length]);

  const handleAnalyze = async () => {
    const val = inputVal.trim();
    if (!val) {
      setError(mode === "url" ? "Please enter a valid Jenkins log URL." : "Please paste the console output.");
      return;
    }
    if (mode === "url" && !val.startsWith("http")) {
      setError("URL must start with http:// or https://");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setShowJson(false);

    try {
      const payload = mode === "url" ? { mode, url: val } : { mode, rawLog: val };
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to analyze the log.");

      setResult(data.analysis);
      setRawJson(JSON.stringify(data.analysis, null, 2));
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      setError(errObj?.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!rawJson) return;
    navigator.clipboard.writeText(rawJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetForm = () => {
    setResult(null);
    setInputVal("");
    setError(null);
    setShowJson(false);
  };

  const getSeverityClass = (sev: string) => {
    const s = sev.toLowerCase();
    if (s.includes("critical")) return "severity-critical";
    if (s.includes("high")) return "severity-high";
    if (s.includes("medium")) return "severity-medium";
    return "severity-low";
  };

  return (
    <div className="page-wrapper">
      <div className="grid-overlay" />

      {/* ─── Main Area ─── */}
      <div className="main-area">
        <div className="container" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>

          {/* Compact Hero */}
          <div className="hero-inline animate-in stagger-1">
            <h1>
              Intelligent CI/CD <span className="gradient-text">Failure Insights</span>
            </h1>
            <p>Paste a raw log or provide a URL — AI greps patterns, extracts context, returns structured analysis.</p>
          </div>

          {/* Main Card */}
          <div className="main-card animate-in stagger-2">
            <div className="card-body">

              {/* ─── Input Form ─── */}
              {!result && !loading && (
                <div className="input-section">
                  <div className="section-label">
                    <Terminal size={12} /> Input Source
                  </div>
                  <div className="mode-toggle">
                    <button className={`mode-btn ${mode === "raw" ? "active" : ""}`} onClick={() => { setMode("raw"); setInputVal(""); setError(null); }}>
                      <FileCode2 size={13} /> Paste Raw Log
                    </button>
                    <button className={`mode-btn ${mode === "url" ? "active" : ""}`} onClick={() => { setMode("url"); setInputVal(""); setError(null); }}>
                      <Link size={13} /> Jenkins URL
                    </button>
                  </div>

                  {mode === "url" ? (
                    <div className="input-wrapper">
                      <Link size={15} className="input-icon" />
                      <input id="jenkins-url-input" type="url" className="url-input" placeholder="https://jenkins.example.com/job/my-build/123/console" value={inputVal} onChange={(e) => setInputVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAnalyze()} />
                      <button id="analyze-btn" className="btn-analyze" onClick={handleAnalyze} disabled={!inputVal.trim()}>
                        <Search size={14} /> Analyze
                      </button>
                    </div>
                  ) : (
                    <>
                      <textarea id="log-textarea" className="log-textarea" placeholder={"Paste your failing Jenkins console output here...\n\ne.g.\nnpm ERR! code ELIFECYCLE\njava.lang.OutOfMemoryError: PermGen space"} value={inputVal} onChange={(e) => setInputVal(e.target.value)} />
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10px" }}>
                        <button id="analyze-btn" className="btn-analyze" onClick={handleAnalyze} disabled={!inputVal.trim()}>
                          <Activity size={14} /> Analyze Build
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Error */}
              {error && !loading && (
                <div className="error-box animate-in">
                  <AlertCircle className="error-icon" size={18} />
                  <div>
                    <h4>Analysis Failed</h4>
                    <p>{error}</p>
                  </div>
                </div>
              )}

              {/* Loading */}
              {loading && (
                <div className="loading-section animate-in">
                  <div className="loading-orb" />
                  <h3>Analyzing Log Sequence</h3>
                  <p>Grepping patterns &amp; running AI models...</p>
                  <div className="loading-steps">
                    {loadingSteps.map((step, idx) => (
                      <div key={idx} className={`loading-step ${idx === loadingStep ? "active" : ""} ${idx < loadingStep ? "done" : ""}`} style={{ opacity: idx <= loadingStep ? 1 : 0.3 }}>
                        {idx < loadingStep ? <CheckCircle2 size={12} /> : <Loader2 size={12} className={idx === loadingStep ? "anim-spin" : ""} />}
                        {step}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── Results ─── */}
              {result && !loading && (
                <div className="animate-in stagger-3">
                  <div className="results-header">
                    <div className="results-title">
                      <div className="check-icon">✓</div>
                      Analysis Complete
                    </div>
                    <button className="btn-reset" onClick={resetForm}>
                      <RefreshCw size={12} /> New Analysis
                    </button>
                  </div>

                  {/* Metrics */}
                  <div className="metrics-grid">
                    <div className="metric-card" style={{ "--card-accent": "var(--gradient-warning)" } as React.CSSProperties}>
                      <div className="metric-label"><Shield size={10} /> Category</div>
                      <div className="metric-value">{result.category || "Unknown"}</div>
                    </div>
                    <div className="metric-card" style={{ "--card-accent": "var(--gradient-danger)" } as React.CSSProperties}>
                      <div className="metric-label"><AlertCircle size={10} /> Severity</div>
                      <div className={`severity-badge ${getSeverityClass(result.severity || "Medium")}`}>{result.severity || "Medium"}</div>
                    </div>
                    <div className="metric-card" style={{ "--card-accent": "var(--gradient-cyan-blue)" } as React.CSSProperties}>
                      <div className="metric-label"><Activity size={10} /> AI Confidence</div>
                      <div className="confidence-pct">{result.confidence || 0}%</div>
                      <div className="confidence-bar-wrap">
                        <div className="confidence-bar" style={{ width: `${result.confidence || 0}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Detail Cards — 2 column */}
                  <div className="detail-grid">
                    {/* Root Cause */}
                    <div className="detail-card">
                      <div className="detail-card-header">
                        <div className="detail-card-icon" style={{ background: "rgba(239,68,68,0.1)", color: "var(--accent-red)" }}><ServerCrash size={14} /></div>
                        <div className="detail-card-title">Root Cause</div>
                      </div>
                      <div className="detail-card-body">
                        <p style={{ fontWeight: 700, fontSize: "13px", marginBottom: "6px", color: "white" }}>{result.root_cause}</p>
                        <p style={{ color: "var(--text-secondary)", fontSize: "12px" }}>{result.root_cause_detail}</p>
                        {result.affected_component && (
                          <div className="component-tag">
                            <span className="component-tag-label">Component</span>
                            <span className="component-tag-value">{result.affected_component}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Error Snippet */}
                    <div className="detail-card">
                      <div className="detail-card-header">
                        <div className="detail-card-icon" style={{ background: "rgba(251,191,36,0.1)", color: "var(--accent-amber)" }}><FileCode2 size={14} /></div>
                        <div className="detail-card-title">Error Snippet</div>
                      </div>
                      <div className="detail-card-body code">{result.error_snippet || "No error snippet captured."}</div>
                    </div>

                    {/* Suggested Fix — full width */}
                    <div className="detail-card full-width">
                      <div className="detail-card-header">
                        <div className="detail-card-icon" style={{ background: "rgba(16,185,129,0.1)", color: "var(--accent-emerald)" }}><CheckCircle2 size={14} /></div>
                        <div className="detail-card-title">Suggested Fix</div>
                      </div>
                      <div className="detail-card-body">
                        <ul className="step-list">
                          {result.suggested_fix.split("\n").filter((s) => s.trim().length > 0).map((step, idx) => {
                            const cleanStep = step.replace(/^\d+[.)]\s*/, "").trim();
                            if (!cleanStep) return null;
                            return (
                              <li key={idx}>
                                <div className="step-num">{idx + 1}</div>
                                <div>{cleanStep}</div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* JSON Toggle */}
                  <button className="json-toggle-btn" onClick={() => setShowJson(!showJson)}>
                    <FileCode2 size={13} />
                    {showJson ? "Hide Raw JSON" : "View Raw JSON"}
                    {showJson ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>

                  {showJson && rawJson && (
                    <div className="json-block animate-in" style={{ animationDuration: "0.3s" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                        <span style={{ color: "var(--text-dim)", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>response.json</span>
                        <button className={`copy-btn ${copied ? "copied" : ""}`} onClick={handleCopy}>
                          {copied ? <CheckCircle2 size={11} /> : <Copy size={11} />}
                          {copied ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      {rawJson}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Footer Bar ─── */}
      <div className="footer-bar">
        <div className="container">
          <div className="footer-bar-inner">
            <div className="footer-brand">
              <div className="footer-logo"><Zap size={14} /></div>
              <div>
                <div className="footer-title">Jenkins Log Analyzer</div>
                <div className="footer-subtitle">Crafted by Satham Hussain</div>
              </div>
            </div>
            <div className="footer-center">AI models can make mistakes · Verify critical fixes</div>
            <div className="footer-status">
              <span className="footer-status-dot" />
              System Online
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
