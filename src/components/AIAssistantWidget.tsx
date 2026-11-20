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

function renderFormattedText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={idx} className="font-extrabold text-[#111111]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={idx}>{part}</span>;
  });
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
    className: "bg-[#ECFDF3] text-[#006B28] border border-[#009C3B]/40",
  },
  IN_USE: {
    label: "Em uso",
    className: "bg-[#FEF3C7] text-[#111111] border border-[#D97706]",
  },
  UNAVAILABLE: {
    label: "Indisponível",
    className: "bg-[#FEF2F2] text-[#991B1B] border border-[#DC2626]/40",
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
      text: "Olá, Luiz! Pergunte sobre qualquer volante do Grupo Volantes Vitória (ex: \"Tem volante do Gol G5?\", \"Onde está o VI0487?\" ou \"O que está com o Mauro?\") que eu cruzo o estoque livre e as retiradas da equipe.",
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
          className="fixed bottom-20 right-4 z-40 inline-flex items-center gap-2 rounded-xl border-2 border-[#111111] bg-[#FFD700] px-4 py-3 text-sm font-extrabold text-[#111111] shadow-xl transition hover:bg-[#F2C900] md:bottom-6 md:right-6"
          aria-label="Abrir Assistente Virtual de Estoque"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#111111] text-[#FFD700]">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <span>Assistente Estoque (IA)</span>
        </button>
      )}

      {open && (
        <div
          className="fixed bottom-20 right-3 z-50 flex max-h-[76vh] w-[calc(100vw-1.5rem)] max-w-md flex-col overflow-hidden rounded-xl border-2 border-[#111111] bg-white shadow-2xl md:bottom-6 md:right-6"
          role="dialog"
          aria-label="Assistente Virtual de Estoque"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b-2 border-[#FFD700] bg-[#111111] px-4 py-3 text-white">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FFD700] text-[#111111]">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold leading-tight text-white">
                  Assistente Virtual • Estoque
                </h3>
                <p className="text-[11px] font-semibold text-[#FFD700]">
                  Gestor Luiz • Consulta em tempo real
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-zinc-300 hover:bg-white/10 hover:text-white"
              aria-label="Fechar assistente"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Quick prompts */}
          <div className="flex gap-1.5 overflow-x-auto border-b border-zinc-200 bg-[#F8F9FA] px-3 py-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={loading}
                onClick={() => void sendQuestion(q)}
                className="shrink-0 rounded-lg border border-[#111111]/25 bg-white px-2.5 py-1 text-[11px] font-bold text-[#111111] transition hover:border-[#111111] hover:bg-[#FFFBEB]"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-3 overflow-y-auto bg-white p-4 text-sm">
            {turns.map((turn) => (
              <div
                key={turn.id}
                className={`flex flex-col ${
                  turn.sender === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[90%] whitespace-pre-line rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    turn.sender === "user"
                      ? "border border-[#111111]/30 bg-[#FFD700] font-bold text-[#111111]"
                      : "border border-zinc-200 bg-[#F8F9FA] font-medium text-[#111111]"
                  }`}
                >
                  {turn.sender === "assistant" ? renderFormattedText(turn.text) : turn.text}
                </div>

                {turn.matches && turn.matches.length > 0 && (
                  <div className="mt-2 w-full space-y-1.5">
                    {turn.matches.map((item) => {
                      const meta = STATUS_META[item.availability];
                      return (
                        <div
                          key={item.productId}
                          className="rounded-xl border border-zinc-300 bg-white p-2.5 text-xs shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-mono text-[10px] font-extrabold text-zinc-600">
                                {item.sku} • {item.category}
                              </span>
                              <div className="font-extrabold text-[#111111]">{item.name}</div>
                            </div>
                            <span
                              className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-extrabold ${meta.className}`}
                            >
                              {meta.label}
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-700">
                            <span>
                              Livres:{" "}
                              <strong className="text-[#111111]">
                                {formatQuantity(item.freeStock, item.unit)}
                              </strong>
                            </span>
                            {item.holders.length > 0 && (
                              <span className="font-semibold text-[#111111]">
                                Com:{" "}
                                <strong className="text-[#B45309]">
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
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-[#F8F9FA] px-3 py-2 text-xs font-semibold text-zinc-600">
                <MessageSquare className="h-3.5 w-3.5 animate-pulse text-[#111111]" />
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
            className="flex items-center gap-2 border-t border-zinc-200 bg-[#F8F9FA] p-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte sobre um volante ou funcionário..."
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-[#111111] outline-none focus:border-[#111111] focus:ring-2 focus:ring-[#FFD700]/40"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#111111] bg-[#FFD700] text-[#111111] transition hover:bg-[#F2C900] disabled:opacity-40"
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
