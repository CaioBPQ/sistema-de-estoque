import Image from "next/image";

interface BrandLogoProps {
  size?: "sm" | "md" | "lg";
  showSubtitle?: boolean;
  darkText?: boolean;
}

export function BrandLogo({
  size = "sm",
  showSubtitle = true,
  darkText = true,
}: BrandLogoProps) {
  const imgDimensions = size === "lg" ? 68 : size === "md" ? 48 : 42;

  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`relative shrink-0 overflow-hidden rounded-xl border-2 border-[#111111] bg-[#FFD700] shadow-sm ${
          size === "lg"
            ? "h-16 w-16"
            : size === "md"
              ? "h-12 w-12"
              : "h-10 w-10"
        }`}
      >
        <Image
          src="/brand/grupo-volantes-vitoria.jpg"
          alt="Logo Grupo Volantes Vitória"
          width={imgDimensions}
          height={imgDimensions}
          className="h-full w-full object-cover"
          priority
        />
      </div>
      <div className="leading-tight">
        <span
          className={`block font-extrabold tracking-tight ${
            size === "lg" ? "text-xl" : "text-sm sm:text-base"
          } ${darkText ? "text-[#111111]" : "text-white"}`}
        >
          Grupo Volantes Vitória
        </span>
        {showSubtitle && (
          <span
            className={`block text-[11px] font-bold uppercase tracking-wider ${
              darkText ? "text-[#111111]/75" : "text-[#FFD700]"
            }`}
          >
            Controle de Estoque
          </span>
        )}
      </div>
    </div>
  );
}
