import React from "react";

interface AuthLoadingScreenProps {
  word?: string;
  message?: string;
}

const AuthLoadingScreen: React.FC<AuthLoadingScreenProps> = ({
  word = "Loading",
  message = "Getting things ready for you…",
}) => {
  const letters = word.split("");

  return (
    <div className="flex w-full justify-center bg-neutral-100 pt-[var(--app-nav-h,3.7rem)] pb-10">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-neutral-200 bg-white/80 px-8 py-6 shadow-md backdrop-blur">

        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-neutral-800" />

        <div className="flex items-center gap-0.5">
          {letters.map((ch, idx) => {
            const style: React.CSSProperties = {
              animationDelay: `${idx * 0.08}s`,
            };
            return (
              <span
                key={`${ch}-${idx}`}
                className="inline-block text-base font-semibold text-neutral-700 animate-bounce"
                style={style}
              >
                {ch}
              </span>
            );
          })}
        </div>

        <p className="text-sm text-neutral-500">{message}</p>
      </div>
    </div>
  );
};

export default AuthLoadingScreen;
