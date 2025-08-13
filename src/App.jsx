import React, { useEffect, useRef, useState } from "react";
import Message from "./components/Message";
import * as webllm from "@mlc-ai/web-llm";

// Ordered largest -> smallest so we can fall back downward
const FALLBACK_MODELS = [
  "Llama-3.1-8B-Instruct-q4f32_1-MLC",
  "Llama-3.1-8B-Instruct-q4f16_1-MLC",
  "Llama-3.2-3B-Instruct-q4f16_1-MLC",
  "Llama-3.2-1B-Instruct-q4f16_1-MLC",
];

// Tiny helper for ids
const uid = () => Math.random().toString(36).slice(2, 10);

function App() {
  const [messages, setMessages] = useState([
    { id: uid(), role: "system", content: "Hi! How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [userOnline, setUserOnline] = useState(false);
  const scrollRef = useRef(null);
  const [engine, setEngine] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  // Model management
  const fallbackModels = FALLBACK_MODELS; // alias for readability
  const [modelName, setModelName] = useState(
    // default to smallest for quicker first load
    "Llama-3.2-1B-Instruct-q4f16_1-MLC"
  );
  const [reloadToken, setReloadToken] = useState(0); // increment to force reload when same model selected again
  const [error, setError] = useState(null);
  const triedModelsRef = useRef([]);

  console.log("Engine: ", engine);

  useEffect(() => {
    let cancelled = false;
    const startIndex =
      fallbackModels.indexOf(modelName) !== -1
        ? fallbackModels.indexOf(modelName)
        : 0;

    const loadModel = async (nameIdx = startIndex) => {
      if (cancelled) return;
      if (nameIdx >= fallbackModels.length) return; // exhausted
      const selectedModel = fallbackModels[nameIdx];
      setIsDownloading(true);
      setDownloadProgress(0);
      setError(null);
      triedModelsRef.current.push(selectedModel);
      console.log("Attempting model:", selectedModel);
      try {
        const created = await webllm.CreateMLCEngine(selectedModel, {
          initProgressCallback: (progressObj) => {
            if (cancelled) return;
            const percent = Math.round((progressObj.progress ?? 0) * 100);
            setDownloadProgress(percent);
            setIsDownloading(percent < 100);
            if (progressObj.text) {
              console.log(progressObj.text);
              setProgressMessage(progressObj.text);
            }
          },
        });
        if (cancelled) return;
        setEngine(created);
        setIsDownloading(false);
        setDownloadProgress(100);
        console.log("Engine initialized with", selectedModel);
      } catch (err) {
        if (cancelled) return;
        console.error("Engine init failed for", selectedModel, err);
        const message = String(err?.message || err);
        setError(message);
        if (/device lost|insufficient memory|Device was lost/i.test(message)) {
          console.warn("GPU device lost or OOM; trying smaller model...");
          await loadModel(nameIdx + 1); // try next smaller
        } else {
          setIsDownloading(false);
        }
      }
    };

    // Only auto-load if engine not set (we reset engine when switching models)
    if (!engine) loadModel();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelName, reloadToken, engine]);

  // Always scroll to bottom when messages change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const checkUserOnline = () => {
    if (navigator.onLine) {
      setUserOnline(true);
    } else {
      setUserOnline(false);
    }
  };

  useEffect(() => {
    checkUserOnline();
    window.addEventListener("online", checkUserOnline);
    window.addEventListener("offline", checkUserOnline);
    return () => {
      window.removeEventListener("online", checkUserOnline);
      window.removeEventListener("offline", checkUserOnline);
    };
  }, []);

  const generateReply = async (text) => {
    if (!engine) return "Engine not initialized";
    try {
      const result = await engine.chat.completions.create({
        messages: [{ role: "user", content: text }],
      });

      console.log("Result:", result);
      return result.choices[0].message.content || "No response";
    } catch (err) {
      const msg = `Generation error: ${err?.message || err}`;
      console.error(msg);
      setError(msg);
      return msg;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const value = input.trim();
    if (!value || loading) return;

    // Add user + placeholder system
    const userMsg = { id: uid(), role: "user", content: value };
    const placeholderId = uid();
    const placeholder = {
      id: placeholderId,
      role: "system",
      content: "Thinking...",
      pending: true,
    };
    setMessages((m) => [...m, userMsg, placeholder]);
    setInput("");
    setLoading(true);

    const reply = await generateReply(value);
    setMessages((m) =>
      m.map((msg) =>
        msg.id === placeholderId
          ? { ...msg, content: reply, pending: false }
          : msg
      )
    );
    setLoading(false);
  };

  const clearChat = () => {
    if (loading) return;
    setMessages([
      {
        id: uid(),
        role: "system",
        content: "Chat cleared. Ask something else!",
      },
    ]);
  };

  const handleModelChange = (e) => {
    const newModel = e.target.value;
    if (newModel === modelName && engine) return; // no-op
    setModelName(newModel);
    setEngine(null); // trigger re-init loading screen
    setMessages([
      {
        id: uid(),
        role: "system",
        content: `Switched to ${newModel}. Initializing...`,
      },
    ]);
    setReloadToken((t) => t + 1);
  };

  // Keep showing loading screen until engine is actually initialized.
  // (Previously UI switched when download reached 100% but engine promise not yet resolved.)
  if (!engine) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-slate-100 px-4">
        <div className="w-full max-w-md p-8 rounded-lg bg-slate-800 shadow-lg flex flex-col items-center">
          <h2 className="text-lg font-semibold mb-4">
            {error
              ? "Initialization Issue"
              : isDownloading
              ? "Loading Model..."
              : "Initializing Engine..."}
          </h2>
          <div className="w-full mb-3">
            <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">
              Model
            </label>
            <select
              value={modelName}
              onChange={handleModelChange}
              disabled={isDownloading}
              className="w-full text-xs bg-slate-900 border border-slate-700 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {fallbackModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-4 mb-4 overflow-hidden">
            <div
              className="bg-blue-500 h-4 rounded-full transition-all duration-300"
              style={{ width: `${downloadProgress}%` }}
            ></div>
          </div>
          <span className="text-sm mb-2">{downloadProgress}%</span>
          {!error && (
            <span className="text-xs text-slate-400 text-center">
              {downloadProgress < 100
                ? "Downloading & preparing model (GPU memory dependent)..."
                : "Finalizing engine initialization..."}
            </span>
          )}

          {progressMessage && (
            <div className="text-xs text-slate-400 mt-2 text-center whitespace-pre-wrap">
              {progressMessage}
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 mt-2 text-center whitespace-pre-wrap">
              {error}
            </div>
          )}
          {error && (
            <button
              onClick={() => window.location.reload()}
              className="mt-4 text-xs px-3 py-1 rounded border border-slate-600 hover:bg-slate-700"
            >
              Reload Page
            </button>
          )}
        </div>
      </div>
    );
  }

  // Chat screen
  return (
    <div className="min-h-screen flex flex-col bg-slate-900 text-slate-100">
      <header className="h-12 flex items-center gap-3 px-4 border-b border-slate-800 bg-slate-900/95">
        <h1 className="text-sm font-semibold tracking-wide">WebLLM Chat</h1>
        <div className="flex items-center gap-2">
          <select
            value={modelName}
            onChange={handleModelChange}
            disabled={loading}
            className="text-[10px] bg-slate-800 border border-slate-700 rounded px-1 py-1 font-mono"
            title="Select model (will reinitialize)"
          >
            {fallbackModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={clearChat}
          disabled={loading || !engine}
          className="ml-auto text-xs px-3 py-1 rounded border border-slate-700 hover:bg-slate-800 disabled:opacity-40"
        >
          Clear
        </button>

        <div className="ml-2 text-xs">
          {userOnline ? (
            <span className="text-green-400">
              <span className="inline-block h-2 w-2 rounded-full bg-current mr-1" />
              Online
            </span>
          ) : (
            <span className="text-red-400">
              <span className="inline-block h-2 w-2 rounded-full bg-current mr-1" />
              Offline
            </span>
          )}
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto px-4 pt-4 pb-28 scrollbar-thin scrollbar-thumb-slate-700/60"
        >
          {messages.map((m) => (
            <Message
              key={m.id}
              role={m.role}
              content={m.content}
              pending={m.pending}
            />
          ))}
        </div>
      </main>
      <form
        onSubmit={handleSubmit}
        className="fixed bottom-0 left-0 right-0 border-t border-slate-800 bg-slate-900/95 backdrop-blur"
      >
        <div className="max-w-3xl mx-auto px-4 py-3 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading || !engine}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "..." : !engine ? "Init" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default App;
