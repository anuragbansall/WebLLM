import React, { useEffect, useRef, useState } from "react";
import Message from "./components/Message";
import * as webllm from "@mlc-ai/web-llm";

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
  const [modelName, setModelName] = useState(
    "Llama-3.1-8B-Instruct-q4f32_1-MLC"
  );
  const [error, setError] = useState(null);
  const triedModelsRef = useRef([]);

  console.log("Engine: ", engine);

  useEffect(() => {
    let cancelled = false;

    // Ordered fallback list (largest to smallest). Adjust with available models in your bundle.
    const fallbackModels = [
      "Llama-3.2-1B-Instruct-q4f16_1-MLC", // much smaller
      "Llama-3.1-8B-Instruct-q4f32_1-MLC", // original attempt
      "Llama-3.1-8B-Instruct-q4f16_1-MLC", // slightly smaller (example)
      "Llama-3.2-3B-Instruct-q4f16_1-MLC", // smaller
    ];

    const loadModel = async (nameIdx = 0) => {
      if (nameIdx >= fallbackModels.length) return; // exhausted
      const selectedModel = fallbackModels[nameIdx];
      setModelName(selectedModel);
      triedModelsRef.current.push(selectedModel);
      setIsDownloading(true);
      setDownloadProgress(0);
      setError(null);
      console.log("Attempting model:", selectedModel);
      try {
        const created = await webllm.CreateMLCEngine(selectedModel, {
          initProgressCallback: (progressObj) => {
            if (cancelled) return;
            const percent = Math.round((progressObj.progress ?? 0) * 100);
            setDownloadProgress(percent);
            setIsDownloading(percent < 100);
            // Log extra diagnostic text if present
            if (progressObj.text) console.log(progressObj.text);
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

        // Heuristic: GPU device lost / OOM -> try next smaller model
        if (/device lost|insufficient memory|Device was lost/i.test(message)) {
          console.warn("GPU device lost or OOM; trying smaller model...");
          await loadModel(nameIdx + 1);
        } else {
          setIsDownloading(false);
        }
      }
    };

    loadModel();
    return () => {
      cancelled = true;
    };
  }, []);

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

  if ((isDownloading && !engine) || (!engine && error)) {
    // Download screen
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-slate-100">
        <div className="w-full max-w-md p-8 rounded-lg bg-slate-800 shadow-lg flex flex-col items-center">
          <h2 className="text-lg font-semibold mb-4">
            {error ? "Initialization Issue" : "Loading Model..."}
          </h2>
          <p className="text-xs mb-2 font-mono text-slate-400">{modelName}</p>
          <div className="w-full bg-slate-700 rounded-full h-4 mb-4">
            <div
              className="bg-blue-500 h-4 rounded-full transition-all"
              style={{ width: `${downloadProgress}%` }}
            ></div>
          </div>
          <span className="text-sm mb-2">{downloadProgress}%</span>
          {!error && (
            <span className="text-xs text-slate-400">
              Preparing model (GPU memory dependent)...
            </span>
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
        {engine && (
          <span className="text-[10px] px-2 py-1 rounded bg-slate-800 border border-slate-700 font-mono">
            {modelName}
          </span>
        )}
        <button
          onClick={clearChat}
          disabled={loading}
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
            disabled={!input.trim() || loading}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "..." : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default App;
