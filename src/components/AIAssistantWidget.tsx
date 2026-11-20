"use client";

import { useState } from "react";
import { Bot, MessageSquare, Send, Sparkles, X } from "lucide-react";
import { formatQuantity } from "@/lib/format";
import type {
  AIAssistantMatchItem,
  AIAssistantResponse,
  AIAvailabilityStatus,
} from "@/types/inventory";

interface ChatTurn {
  id: number;
  sender: "user" | "assistant";
  text: string;
  matches?: AIAssistantMatchItem[];
}

const SUGGESTED_QUESTIONS = [
  "Tem volante do Agile disponível?",
  "Quem está com volantes em uso?",
  "Quais modelos estão disponíveis?",
  "Status do VI1171",
];

const STATUS_META: Record<
  AIAvailabilityStatus,
  { label: string; className: string }
> = {
  AVAILABLE: {
    label: "Disponível",
    className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20",
  },
  IN_USE: {
    label: "Em uso",
    className: "bg-amber-50 text-amber-800 ring-1 ring-amber-600/25",
  },
  UNAVAILABLE: {
    label: "Indisponível",
    className: "bg-rose-50 text-rose-700 ring-1 ring-rose-600/25",
  },
};

export function AIAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([
    {
      id: 1,
      sender: "assistant",
      text: "Olá, Luiz! Pergunte sobre qualquer volante (ex: \"Tem volante do Gol G5?\", \"Onde está o VI0487?\" ou \"O que está com o Mauro?\") e eu cruzo o estoque livre com os itens em uso pela equipe.",
    },
  ]);

  const sendQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || loading) return;

    const userTurn: ChatTurn = {
      id: Date.now(),
      sender: "user",
      text: trimmed,
    };
    setTurns((prev) => [...prev, userTurn]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const json = (await res.json()) as Partial<AIAssistantResponse> & { error?: string };
      if (!res.ok || !json.answer) {
        throw new Error(json.error ?? "Não foi possível consultar o assistente.");
      }

      setTurns((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: "assistant",
          text: json.answer!,
          matches: json.matches,
        },
      ]);
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: "assistant",
          text: err instanceof Error ? err.message : "Erro ao consultar o estoque.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-xl ring-1 ring-slate-700 transition hover:bg-slate-800 md:bottom-6 md:right-6"
          aria-label="Abrir Assistente Virtual de Estoque"
        >
          <Sparkles className="h-4 w-4 text-amber-400" />
          <span>Assistente Estoque (IA)</span>
        </button>
      )}

      {open && (
        <div
          className="fixed bottom-20 right-3 z-50 flex max-h-[75vh] w-[calc(100vw-1.5rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl md:bottom-6 md:right-6"
          role="dialog"
          aria-label="Assistente Virtual de Estoque"
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold leading-tight">
                  Assistente Virtual de Estoque
                </h3>
                <p className="text-[11px] text-slate-300">
                  Exclusivo Gestor (Luiz) • Tempo real
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
              aria-label="Fechar assistente"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Quick prompts */}
          <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 bg-slate-50 px-3 py-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={loading}
                onClick={() => void sendQuestion(q)}
                className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {turns.map((turn) => (
              <div
                key={turn.id}
                className={`flex flex-col ${
                  turn.sender === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[90%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    turn.sender === "user"
                      ? "bg-blue-600 font-medium text-white"
                      : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {turn.text}
                </div>

                {turn.matches && turn.matches.length > 0 && (
                  <div className="mt-2 w-full space-y-1.5">
                    {turn.matches.map((item) => {
                      const meta = STATUS_META[item.availability];
                      return (
                        <div
                          key={item.productId}
                          className="rounded-xl border border-slate-200 bg-white p-2.5 text-xs shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-mono text-[10px] font-bold text-slate-500">
                                {item.sku} • {item.category}
                              </span>
                              <div className="font-bold text-slate-900">{item.name}</div>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.className}`}
                            >
                              {meta.label}
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                            <span>
                              Livres: <strong className="text-slate-900">{formatQuantity(item.freeStock, item.unit)}</strong>
                            </span>
                            {item.holders.length > 0 && (
                              <span className="text-amber-800">
                                Com:{" "}
                                <strong>
                                  {item.holders
                                    .map((h) => `${h.collaboratorName} (${h.quantity})`)
                                    .join(", ")}
                                </strong>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-500">
                <MessageSquare className="h-3.5 w-3.5 animate-pulse" />
                Consultando estoque e retiradas...
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendQuestion(input);
            }}
            className="flex items-center gap-2 border-t border-slate-200 bg-white p-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte sobre um volante ou funcionário..."
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
              aria-label="Enviar pergunta"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
