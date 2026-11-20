import { ensureSqliteReady, prisma } from "@/lib/prisma";
import { formatQuantity } from "@/lib/format";
import { ValidationError } from "@/lib/services/collaborator-service";
import { aiChatRequestSchema, roundQuantity } from "@/lib/validators";
import type {
  AIAssistantHolder,
  AIAssistantMatchItem,
  AIAssistantResponse,
  AIAvailabilityStatus,
  UserRole,
} from "@/types/inventory";

const STOP_WORDS = new Set([
  "A",
  "O",
  "AS",
  "OS",
  "DE",
  "DO",
  "DA",
  "DOS",
  "DAS",
  "EM",
  "NO",
  "NA",
  "NOS",
  "NAS",
  "COM",
  "SEM",
  "PARA",
  "POR",
  "E",
  "OU",
  "QUE",
  "ONDE",
  "ESSE",
  "ESSA",
  "ESTE",
  "ESTA",
  "ISSO",
  "AGORA",
  "TUDO",
  "ALGO",
  "UM",
  "UMA",
  "TEM",
  "TEMOS",
  "TENHO",
  "VERIFICAR",
  "VERIFICA",
  "CONSULTAR",
  "CONSULTA",
  "HA",
  "EXISTE",
  "ESTA",
  "ESTAO",
  "FICOU",
  "ALGUEM",
  "PEGOU",
  "USANDO",
  "USO",
  "VOLANTE",
  "VOLANTES",
  "MODELO",
  "MODELOS",
  "ESTOQUE",
  "DISPONIVEL",
  "DISPONIVEIS",
  "DISPONIBILIDADE",
  "INDISPONIVEL",
  "SALDO",
  "UNIDADE",
  "UNIDADES",
  "QUANTOS",
  "QUANTAS",
  "QUAL",
  "QUAIS",
  "QUEM",
  "POSSE",
  "STATUS",
  "COMO",
  "PRECISO",
  "SABER",
  "VER",
  "ME",
  "DIZ",
  "FALA",
  "SOBRE",
  "DO",
  "CARRO",
  "VEICULO",
  "VOL",
]);

const TOKEN_SYNONYMS: Record<string, string[]> = {
  VOLKSWAGEN: ["VW"],
  VW: ["VOLKSWAGEN"],
  MERCEDES: ["MB", "MERCEDES-BENZ"],
  MB: ["MERCEDES", "MERCEDES-BENZ"],
  AIRBAG: ["AB"],
  AB: ["AIRBAG"],
  GM: ["CHEVROLET"],
  CHEVROLET: ["GM"],
  S10: ["S-10"],
  "S-10": ["S10"],
  F1000: ["F-1000"],
  "F-1000": ["F1000"],
  F250: ["F-250"],
  "F-250": ["F250"],
  L200: ["L-200"],
  "L-200": ["L200"],
};

function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[?!.,;:()[\]{}"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSearchTokens(question: string): string[] {
  const normalized = normalizeSearchText(question);
  return normalized
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

function buildMatchItem(row: {
  id: string;
  sku: string;
  name: string;
  category: string;
  weightGrams: number | null;
  unit: string;
  currentStock: number;
  custodies: Array<{
    quantity: number;
    collaborator: { id: string; name: string; role: string };
  }>;
}): AIAssistantMatchItem {
  const freeStock = roundQuantity(row.currentStock);
  const holders: AIAssistantHolder[] = row.custodies
    .filter((c) => c.quantity > 0)
    .map((c) => ({
      collaboratorId: c.collaborator.id,
      collaboratorName: c.collaborator.name,
      role: (c.collaborator.role === "MANAGER" ? "MANAGER" : "EMPLOYEE") as UserRole,
      quantity: roundQuantity(c.quantity),
    }));

  const inUseTotal = roundQuantity(holders.reduce((acc, h) => acc + h.quantity, 0));

  let availability: AIAvailabilityStatus = "UNAVAILABLE";
  if (freeStock > 0) {
    availability = "AVAILABLE";
  } else if (inUseTotal > 0) {
    availability = "IN_USE";
  }

  return {
    productId: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    weightGrams: row.weightGrams !== null ? roundQuantity(row.weightGrams, 2) : null,
    unit: row.unit,
    availability,
    freeStock,
    inUseTotal,
    holders,
  };
}

function formatHoldersList(holders: AIAssistantHolder[], unit: string): string {
  return holders
    .map((h) => `${h.collaboratorName}${h.role === "MANAGER" ? " (Gestor)" : ""} (${formatQuantity(h.quantity, unit)})`)
    .join(", ");
}

function describeSingleMatch(item: AIAssistantMatchItem): string {
  if (item.availability === "AVAILABLE") {
    const base = `• [${item.sku}] ${item.name}: **Disponível** — ${formatQuantity(item.freeStock, item.unit)} livre(s) no estoque`;
    if (item.inUseTotal > 0) {
      return `${base} (e ${formatQuantity(item.inUseTotal, item.unit)} em uso com ${formatHoldersList(item.holders, item.unit)}).`;
    }
    return `${base}.`;
  }
  if (item.availability === "IN_USE") {
    return `• [${item.sku}] ${item.name}: **Em uso** — 0 ${item.unit} livre(s) no estoque físico; atualmente com ${formatHoldersList(item.holders, item.unit)}.`;
  }
  return `• [${item.sku}] ${item.name}: **Indisponível** — sem saldo no estoque físico e nenhuma unidade em posse da equipe.`;
}

export async function queryInventoryAssistant(input: unknown): Promise<AIAssistantResponse> {
  await ensureSqliteReady();
  const parsed = aiChatRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Pergunta inválida.");
  }

  const question = parsed.data.question;
  const normalizedQ = normalizeSearchText(question);

  const [products, collaborators] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: {
        custodies: {
          where: { quantity: { gt: 0 } },
          include: {
            collaborator: { select: { id: true, name: true, role: true } },
          },
        },
      },
    }),
    prisma.collaborator.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true },
    }),
  ]);

  const allItems = products.map(buildMatchItem);
  const collaboratorNames = collaborators.map((c) => ({
    ...c,
    normName: normalizeSearchText(c.name),
  }));

  const mentionedPerson = collaboratorNames.find((c) =>
    normalizedQ.split(" ").includes(c.normName)
  );

  // Filter out person names from model search tokens
  const rawTokens = extractSearchTokens(question);
  const tokens = mentionedPerson
    ? rawTokens.filter((t) => t !== mentionedPerson.normName)
    : rawTokens;

  // Intent 1: Custody / Who has steering wheels right now
  const isCustodyOverview =
    tokens.length === 0 &&
    (mentionedPerson !== undefined ||
      normalizedQ.includes("QUEM ESTA") ||
      normalizedQ.includes("EM USO") ||
      normalizedQ.includes("EM POSSE") ||
      normalizedQ.includes("EQUIPE"));

  if (isCustodyOverview) {
    const inUseItems = allItems.filter((item) => {
      if (item.inUseTotal <= 0) return false;
      if (mentionedPerson) {
        return item.holders.some((h) => h.collaboratorId === mentionedPerson.id);
      }
      return true;
    });

    if (inUseItems.length === 0) {
      return {
        intent: "CUSTODY_OVERVIEW",
        matches: [],
        timestamp: new Date().toISOString(),
        answer: mentionedPerson
          ? `${mentionedPerson.name} não está com nenhum volante em uso no momento.`
          : "Nenhum volante está em posse da equipe no momento.",
      };
    }

    const lines = inUseItems.slice(0, 10).map(describeSingleMatch);
    const intro = mentionedPerson
      ? `Volantes atualmente em posse de **${mentionedPerson.name}** (${inUseItems.length} modelo(s)):`
      : `Volantes atualmente **Em uso** pela equipe (${inUseItems.length} modelo(s)):`;

    return {
      intent: "CUSTODY_OVERVIEW",
      matches: inUseItems.slice(0, 10),
      timestamp: new Date().toISOString(),
      answer: `${intro}\n${lines.join("\n")}`,
    };
  }

  // Intent 2: General stock summary ("quais estão disponíveis", "resumo do estoque")
  const isStockOverview =
    tokens.length === 0 &&
    (normalizedQ.includes("DISPONIV") ||
      normalizedQ.includes("RESUMO") ||
      normalizedQ.includes("ESTOQUE") ||
      normalizedQ.includes("LIVRE"));

  if (isStockOverview) {
    const available = allItems.filter((i) => i.availability === "AVAILABLE");
    const inUseOnly = allItems.filter((i) => i.availability === "IN_USE");
    const totalFree = roundQuantity(allItems.reduce((acc, i) => acc + i.freeStock, 0));
    const totalInUse = roundQuantity(allItems.reduce((acc, i) => acc + i.inUseTotal, 0));

    const highlights = [...available.slice(0, 6), ...inUseOnly.slice(0, 4)];
    const lines = highlights.map(describeSingleMatch);

    return {
      intent: "STOCK_OVERVIEW",
      matches: highlights,
      timestamp: new Date().toISOString(),
      answer:
        `Resumo atual: **${available.length}** modelo(s) **Disponíveis** (${formatQuantity(totalFree, "un")} livres), **${inUseOnly.length}** modelo(s) apenas **Em uso** (${formatQuantity(totalInUse, "un")} com a equipe) e **${allItems.length - available.length - inUseOnly.length}** **Indisponíveis**.\n` +
        (lines.length > 0 ? lines.join("\n") : "Nenhum modelo possui saldo lançado até o momento."),
    };
  }

  // Intent 3: Specific steering wheel model or SKU availability lookup
  if (tokens.length === 0) {
    return {
      intent: "UNKNOWN",
      matches: [],
      timestamp: new Date().toISOString(),
      answer:
        "Informe o modelo ou código do volante que deseja consultar (ex: \"Tem volante do Agile?\", \"Status do VI1171\", ou \"O que está com o Mauro?\").",
    };
  }

  const scored: Array<{ item: AIAssistantMatchItem; score: number }> = [];

  for (const item of allItems) {
    const skuNorm = normalizeSearchText(item.sku);
    const nameNorm = normalizeSearchText(item.name);
    const catNorm = normalizeSearchText(item.category);
    const haystack = `${skuNorm} ${nameNorm} ${catNorm}`;
    const haystackWords = new Set(haystack.split(" "));

    let score = 0;
    let matchedTokenCount = 0;

    for (const token of tokens) {
      if (skuNorm === token || skuNorm.startsWith(`${token}-`)) {
        score += 1000;
        matchedTokenCount += 1;
        continue;
      }
      if (skuNorm.includes(token)) {
        score += 350;
        matchedTokenCount += 1;
        continue;
      }

      const variants = [token, ...(TOKEN_SYNONYMS[token] ?? [])];
      const exactWordHit = variants.some((v) => haystackWords.has(v));
      if (exactWordHit) {
        score += 120;
        matchedTokenCount += 1;
        continue;
      }

      const substringHit = variants.some((v) => v.length >= 3 && haystack.includes(v));
      if (substringHit) {
        score += 65;
        matchedTokenCount += 1;
      }
    }

    if (matchedTokenCount > 0) {
      // Strong bonus when ALL search tokens match the product
      if (matchedTokenCount === tokens.length) {
        score += 500;
      }
      // Slight preference to show available/in-use first among equal relevance
      if (item.availability === "AVAILABLE") score += 5;
      else if (item.availability === "IN_USE") score += 3;

      scored.push({ item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      intent: "MODEL_QUERY",
      matches: [],
      timestamp: new Date().toISOString(),
      answer: `Não encontrei nenhum volante correspondente a "${tokens.join(" ")}" no catálogo. Tente buscar pelo código (ex: VI0487) ou nome do carro (ex: Agile, Gol G5, Onix, Strada).`,
    };
  }

  const topScore = scored[0].score;
  // If we hit an exact SKU or full multi-token match, keep closely ranked matches
  const minThreshold = topScore >= 500 ? Math.max(450, topScore * 0.45) : topScore * 0.6;
  const topMatches = scored
    .filter((entry) => entry.score >= minThreshold)
    .slice(0, 6)
    .map((entry) => entry.item);

  const lines = topMatches.map(describeSingleMatch);
  const header =
    topMatches.length === 1
      ? "Situação atual deste volante:"
      : `Encontrei ${topMatches.length} modelo(s) correspondentes:`;

  return {
    intent: "MODEL_QUERY",
    matches: topMatches,
    timestamp: new Date().toISOString(),
    answer: `${header}\n${lines.join("\n")}`,
  };
}
